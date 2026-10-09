import { afterEach, expect, test, vi } from "vitest";
import { seal, unseal, requireSameOrigin } from "../worker/auth";
import { push, type PushInput } from "../worker/github";
import worker from "../worker/index";
afterEach(() => vi.unstubAllGlobals());
const input: PushInput = { owner: "example", repo: "repo", branch: "main", projectPath: "project.inlang", head: "a".repeat(40), message: "Translate", files: { "messages/en.json": '{"hello":"Hi"}' } };
test("sessions reject tampering, expiration, and purpose confusion", async () => {
  const secret = "a secure test secret with at least 32 characters";
  const session = await seal({ purpose: "session", expires: Date.now() + 1000, token: "test-only" }, secret);
  await expect(unseal(session, secret, "session")).resolves.toMatchObject({ token: "test-only" });
  await expect(unseal(session.slice(0, -5) + "xxxxx", secret, "session")).rejects.toThrow();
  await expect(unseal(session, secret, "oauth")).rejects.toThrow();
  await expect(unseal(await seal({ purpose: "session", expires: 1 }, secret), secret, "session")).rejects.toThrow();
});
test("cookie-authenticated writes require same-origin JSON requests", () => {
  expect(() => requireSameOrigin(new Request("https://fink.test/api/github/push", { method: "POST", headers: { Origin: "https://attacker.test", "Content-Type": "application/json" } }))).toThrow();
});
test("stale branch heads are rejected before creating any Git objects", async () => {
  const mock = vi.fn().mockResolvedValue(Response.json({ object: { sha: "b".repeat(40) } })); vi.stubGlobal("fetch", mock);
  await expect(push(input, "test-token")).rejects.toMatchObject({ status: 409 });
  expect(mock).toHaveBeenCalledTimes(1);
});
const graphqlCommit = { data: { createCommitOnBranch: { commit: { oid: "d".repeat(40), url: "https://github.com/example/repo/commit/ddd", tree: { oid: "e".repeat(40) } } } } };
test("push commits through createCommitOnBranch (signed by GitHub) against the expected head", async () => {
  const settingsFile = { encoding: "base64", size: 150, content: btoa(JSON.stringify({ baseLocale: "en", locales: ["en", "de"], "plugin.inlang.messageFormat": { pathPattern: "./messages/{locale}.json" } })) };
  const responses = [{ object: { sha: input.head } }, settingsFile, graphqlCommit];
  const mock = vi.fn().mockImplementation(async () => Response.json(responses.shift())); vi.stubGlobal("fetch", mock);
  await expect(push({ ...input, message: "Translate\n\nCo-authored-by: Fink <hello@inlang.com>", files: { "messages/en.json": '{"hello":"Grüß"}' } }, "test-token")).resolves.toEqual({ head: "d".repeat(40), tree: "e".repeat(40), url: "https://github.com/example/repo/commit/ddd" });
  expect(mock.mock.calls[2][0]).toBe("https://api.github.com/graphql");
  const { variables } = JSON.parse(mock.mock.calls[2][1].body);
  expect(variables.input).toMatchObject({ branch: { repositoryNameWithOwner: "example/repo", branchName: "main" }, expectedHeadOid: input.head, message: { headline: "Translate", body: "Co-authored-by: Fink <hello@inlang.com>" } });
  const [addition] = variables.input.fileChanges.additions;
  expect(addition.path).toBe("messages/en.json");
  expect(new TextDecoder().decode(Uint8Array.from(atob(addition.contents), char => char.charCodeAt(0)))).toBe('{"hello":"Grüß"}');
});
test("a branch that moved during the commit is a 409, other GraphQL errors don't leak upstream text", async () => {
  const settingsFile = { encoding: "base64", size: 150, content: btoa(JSON.stringify({ baseLocale: "en", locales: ["en"], "plugin.inlang.messageFormat": { pathPattern: "./messages/{locale}.json" } })) };
  for (const [errors, status] of [[[{ type: "STALE_DATA", message: "Expected branch to point to aaa but it did not." }], 409], [[{ type: "FORBIDDEN", message: "secret detail" }], 403]] as const) {
    const responses = [{ object: { sha: input.head } }, settingsFile, { data: { createCommitOnBranch: null }, errors }];
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json(responses.shift())));
    const error = await push(input, "test-token").catch(reason => reason);
    expect(error).toMatchObject({ status });
    expect(error.message).not.toContain("secret detail");
  }
});
test("push rejects traversal, workflows, non-JSON files and empty commits", async () => {
  const cases: Record<string,string>[] = [{ "../secret.json": "{}" }, { ".github/workflows/build.json": "{}" }, { "code.ts": "{}" }, {}];
  for (const files of cases) await expect(push({ ...input, files }, "test-token")).rejects.toMatchObject({ status: 400 });
});
test("push rejects JSON files outside the project's configured resource paths", async () => {
  const mock = vi.fn().mockResolvedValueOnce(Response.json({ object: { sha: input.head } })).mockResolvedValueOnce(Response.json({ encoding: "base64", size: 100, content: btoa(JSON.stringify({ baseLocale: "en", locales: ["en"], "plugin.inlang.messageFormat": { pathPattern: "./messages/{locale}.json" } })) }));
  vi.stubGlobal("fetch", mock);
  await expect(push({ ...input, files: { "package.json": "{}" } }, "test-token")).rejects.toMatchObject({ status: 400 });
  expect(mock).toHaveBeenCalledTimes(2);
});
test("OAuth uses PKCE and relays sessions only to the preview that initiated login", async () => {
  const env = { GITHUB_CLIENT_ID: "test-client", GITHUB_CLIENT_SECRET: "test-secret", SESSION_SECRET: "a secure test secret with at least 32 characters", GITHUB_CALLBACK_ORIGIN: "https://fink-migration-preview.opral.workers.dev", WORKERS_SUBDOMAIN: "opral" } as Env;
  const origin = "https://fink-pr-123.opral.workers.dev";
  const login = await worker.fetch(new Request(`${origin}/api/auth/login`), env);
  const target = new URL(login.headers.get("Location")!);
  expect(target.hostname).toBe("github.com");
  expect(target.searchParams.get("code_challenge_method")).toBe("S256");
  const state = await unseal<{ purpose: string; expires: number; nonce: string; origin: string; verifier: string }>(target.searchParams.get("state")!, env.SESSION_SECRET, "oauth");
  const exchange = vi.fn().mockResolvedValue(Response.json({ access_token: "private-test-token" })); vi.stubGlobal("fetch", exchange);
  const callback = await worker.fetch(new Request(`${env.GITHUB_CALLBACK_ORIGIN}/api/auth/callback?${new URLSearchParams({ state: target.searchParams.get("state")!, code: "test-code" })}`), env);
  expect(JSON.parse(exchange.mock.calls[0][1].body).code_verifier).toBe(state.verifier);
  const destination = new URL(callback.headers.get("Location")!);
  expect(destination.origin).toBe(origin);
  expect(destination.hash).not.toContain("private-test-token");
  const body = JSON.stringify({ relay: destination.hash.slice(6) });
  const completed = await worker.fetch(new Request(`${origin}/api/auth/complete`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", Cookie: `fink_oauth=${state.nonce}` }, body }), env);
  expect(completed.status).toBe(200);
  expect(completed.headers.get("Set-Cookie")).toContain("HttpOnly");
  const rejected = await worker.fetch(new Request(`${origin}/api/auth/complete`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", Cookie: "fink_oauth=wrong-nonce" }, body }), env);
  expect(rejected.status).toBe(403);
});
test("fink.inlang.com completes GitHub login on itself; workers.dev origins use the stable callback Worker", async () => {
  const env = { GITHUB_CLIENT_ID: "test-client", GITHUB_CLIENT_SECRET: "test-secret", SESSION_SECRET: "a secure test secret with at least 32 characters", GITHUB_CALLBACK_ORIGIN: "https://fink-migration-preview.opral.workers.dev", WORKERS_SUBDOMAIN: "opral" } as Env;
  const redirect = async (origin: string) => new URL(new URL((await worker.fetch(new Request(`${origin}/api/auth/login`), env)).headers.get("Location")!).searchParams.get("redirect_uri")!);
  expect((await redirect("https://fink.inlang.com")).href).toBe("https://fink.inlang.com/api/auth/callback");
  expect((await redirect("https://fink.opral.workers.dev")).href).toBe("https://fink-migration-preview.opral.workers.dev/api/auth/callback");
  expect((await redirect("https://fink-migration-preview.opral.workers.dev")).href).toBe("https://fink-migration-preview.opral.workers.dev/api/auth/callback");
  expect((await worker.fetch(new Request("https://fink.example.com/api/auth/login"), env)).status).toBe(403);
  const login = await worker.fetch(new Request("https://fink.inlang.com/api/auth/login"), env);
  const state = new URL(login.headers.get("Location")!).searchParams.get("state")!;
  const exchange = vi.fn().mockResolvedValue(Response.json({ access_token: "private-test-token" })); vi.stubGlobal("fetch", exchange);
  const callback = await worker.fetch(new Request(`https://fink.inlang.com/api/auth/callback?${new URLSearchParams({ state, code: "test-code" })}`), env);
  expect(JSON.parse(exchange.mock.calls[0][1].body).redirect_uri).toBe("https://fink.inlang.com/api/auth/callback");
  expect(new URL(callback.headers.get("Location")!).origin).toBe("https://fink.inlang.com");
});
test("push accepts core settings and new locale resources together, rejects plugin path edits", async () => {
  const before = { baseLocale: "en", locales: ["en"], modules: ["https://example.com/plugin.js"], "plugin.inlang.messageFormat": { pathPattern: "./messages/{locale}.json" } };
  const settingsFile = { encoding: "base64", size: 150, content: btoa(JSON.stringify(before)) };
  const after = { ...before, locales: ["en", "fr"] };
  const responses = [{ object: { sha: input.head } }, settingsFile, graphqlCommit];
  const mock = vi.fn().mockImplementation(async () => Response.json(responses.shift())); vi.stubGlobal("fetch", mock);
  await expect(push({ ...input, files: { "project.inlang/settings.json": JSON.stringify(after), "messages/fr.json": '{"hello":"Salut"}' } }, "test-token")).resolves.toMatchObject({ head: "d".repeat(40) });
  expect(JSON.parse(mock.mock.calls[2][1].body).variables.input.fileChanges.additions.map((file: { path: string }) => file.path)).toEqual(["project.inlang/settings.json", "messages/fr.json"]);
  mock.mockImplementation(async () => Response.json(mock.mock.calls.length === 1 ? { object: { sha: input.head } } : settingsFile)); mock.mockClear();
  await expect(push({ ...input, files: { "project.inlang/settings.json": JSON.stringify({ ...after, modules: [] }) } }, "test-token")).rejects.toMatchObject({ status: 400 });
  expect(mock).toHaveBeenCalledTimes(2);
});
test("history lists branch commits scoped to the project without exposing upstream fields", async () => {
  const env = { SESSION_SECRET: "a secure test secret with at least 32 characters" } as Env;
  const mock = vi.fn().mockResolvedValue(Response.json([{ sha: "a".repeat(40), html_url: "https://github.com/example/repo/commit/aaa", author: { login: "translator", avatar_url: "https://avatars.githubusercontent.com/u/1" }, commit: { message: "Update translations", author: { name: "T", date: "2026-10-01T00:00:00Z", email: "private@example.com" } } }]));
  vi.stubGlobal("fetch", mock);
  const response = await worker.fetch(new Request("https://fink.test/api/github/commits?owner=example&repo=repo&branch=feature%2Fi18n&path=frontend"), env);
  expect(await response.json()).toEqual([{ sha: "a".repeat(40), url: "https://github.com/example/repo/commit/aaa", message: "Update translations", author: "translator", avatar: "https://avatars.githubusercontent.com/u/1", date: "2026-10-01T00:00:00Z" }]);
  const requested = new URL(mock.mock.calls[0][0]);
  expect(requested.pathname).toBe("/repos/example/repo/commits");
  expect(Object.fromEntries(requested.searchParams)).toEqual({ sha: "feature/i18n", per_page: "30", path: "frontend" });
  expect((await worker.fetch(new Request("https://fink.test/api/github/commits?owner=example&repo=repo&branch=main&path=../x"), env)).status).toBe(400);
});
