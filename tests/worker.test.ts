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
test("push preserves the base tree, commits against the expected head, and never force-updates", async () => {
  const settingsFile = { encoding: "base64", size: 150, content: btoa(JSON.stringify({ baseLocale: "en", locales: ["en", "de"], "plugin.inlang.messageFormat": { pathPattern: "./messages/{locale}.json" } })) };
  const responses = [{ object: { sha: input.head } }, settingsFile, { tree: { sha: "b".repeat(40) } }, { sha: "c".repeat(40) }, { sha: "d".repeat(40), html_url: "https://github.com/example/repo/commit/ddd" }, {}];
  const mock = vi.fn().mockImplementation(async () => Response.json(responses.shift())); vi.stubGlobal("fetch", mock);
  await expect(push(input, "test-token")).resolves.toMatchObject({ head: "d".repeat(40) });
  expect(JSON.parse(mock.mock.calls[3][1].body)).toMatchObject({ base_tree: "b".repeat(40), tree: [{ path: "messages/en.json", mode: "100644", type: "blob" }] });
  expect(JSON.parse(mock.mock.calls[4][1].body)).toMatchObject({ parents: [input.head] });
  expect(JSON.parse(mock.mock.calls[5][1].body)).toEqual({ sha: "d".repeat(40), force: false });
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
test("push accepts core settings and new locale resources together, rejects plugin path edits", async () => {
  const before = { baseLocale: "en", locales: ["en"], modules: ["https://example.com/plugin.js"], "plugin.inlang.messageFormat": { pathPattern: "./messages/{locale}.json" } };
  const settingsFile = { encoding: "base64", size: 150, content: btoa(JSON.stringify(before)) };
  const after = { ...before, locales: ["en", "fr"] };
  const responses = [{ object: { sha: input.head } }, settingsFile, { tree: { sha: "b".repeat(40) } }, { sha: "c".repeat(40) }, { sha: "d".repeat(40) }, {}];
  const mock = vi.fn().mockImplementation(async () => Response.json(responses.shift())); vi.stubGlobal("fetch", mock);
  await expect(push({ ...input, files: { "project.inlang/settings.json": JSON.stringify(after), "messages/fr.json": '{"hello":"Salut"}' } }, "test-token")).resolves.toMatchObject({ head: "d".repeat(40) });
  expect(JSON.parse(mock.mock.calls[3][1].body).tree.map((file: { path: string }) => file.path)).toEqual(["project.inlang/settings.json", "messages/fr.json"]);
  mock.mockImplementation(async () => Response.json(mock.mock.calls.length === 1 ? { object: { sha: input.head } } : settingsFile)); mock.mockClear();
  await expect(push({ ...input, files: { "project.inlang/settings.json": JSON.stringify({ ...after, modules: [] }) } }, "test-token")).rejects.toMatchObject({ status: 400 });
  expect(mock).toHaveBeenCalledTimes(2);
});
