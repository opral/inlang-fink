import { validateSettingsEdit } from "../src/settingsData";
import { HttpError } from "./auth";
import { resolveResourcePath } from "../src/repository";
export const MAX_BODY = 5 * 1024 * 1024;
export async function boundedJson<T>(request: Request | Response): Promise<T> {
  if (Number(request.headers.get("Content-Length")) > MAX_BODY) throw new HttpError(413, "Payload exceeds 5 MiB.");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Missing request body.");
  let length = 0; const chunks: Uint8Array[] = [];
  try {
    while (true) { const { value, done } = await reader.read(); if (done) break; length += value.byteLength; if (length > MAX_BODY) { await reader.cancel(); throw new HttpError(413, "Payload exceeds 5 MiB."); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new HttpError(400, "Invalid JSON."); }
}
export async function github<T>(path: string, token?: string, body?: unknown, method?: string): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, { method: method ?? (body === undefined ? "GET" : "POST"), headers: { Accept: "application/vnd.github+json", "User-Agent": "inlang-fink", "X-GitHub-Api-Version": "2022-11-28", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
  if (!response.ok) {
    // Signed out, GitHub refuses anonymous requests once the shared rate limit is used up (403/429) and
    // hides private repositories (404): both mean the user should sign in.
    if (!token && (response.status === 401 || response.status === 403 || response.status === 429 || response.status === 404))
      throw new HttpError(401, response.status === 404 ? "Repository not found. If it's private, sign in with GitHub to open it." : "Sign in with GitHub to open this repository. GitHub limits requests without an account.");
    // Never echo upstream messages that could contain credential or private content.
    throw new HttpError(response.status === 422 ? 409 : response.status, response.status === 404 ? "Repository or file not found. Check GitHub App access." : response.status === 422 ? "GitHub rejected the commit because the branch changed. Try again." : `GitHub request failed (${response.status}). Check permissions and rate limits.`);
  }
  return boundedJson<T>(response);
}
export function repoBase(owner: string, name: string): string {
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(name)) throw new HttpError(400, "Invalid repository.");
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
}
export function validPath(path: string): boolean { return !!path && !path.startsWith("/") && !path.includes("\\") && !path.split("/").some(part => !part || part === ".." || part === ".") && !/[\x00-\x1f]/.test(path); }
export type PushInput = { owner: string; repo: string; branch: string; head: string; projectPath: string; message: string; files: Record<string, string> };
export async function push(input: PushInput, token: string): Promise<{ head: string; tree: string; url: string }> {
  if (!input || typeof input.owner !== "string" || typeof input.repo !== "string" || typeof input.branch !== "string" || !input.branch || !/^[0-9a-f]{40}$/.test(input.head) || typeof input.message !== "string" || !input.message.trim() || input.message.length > 1000 || typeof input.projectPath !== "string" || !validPath(input.projectPath) || !input.projectPath.endsWith(".inlang")) throw new HttpError(400, "Invalid commit request.");
  if (!input.files || typeof input.files !== "object" || Array.isArray(input.files)) throw new HttpError(400, "Missing files.");
  const entries = Object.entries(input.files);
  if (!entries.length || entries.length > 100 || entries.some(([path, content]) => !validPath(path) || !path.endsWith(".json") || path.split("/").includes(".github") || typeof content !== "string")) throw new HttpError(400, "Only up to 100 JSON resource files can be pushed.");
  for (const [, content] of entries) { try { JSON.parse(content); } catch { throw new HttpError(400, "Resource files must contain valid JSON."); } }
  const base = repoBase(input.owner, input.repo);
  const refPath = `${base}/git/refs/heads/${input.branch.split("/").map(encodeURIComponent).join("/")}`;
  const ref = await github<{ object: { sha: string } }>(refPath, token);
  if (ref.object.sha !== input.head) throw new HttpError(409, "The branch changed on GitHub while pushing.");
  const settingsFile = await github<{ encoding: string; content: string; size: number }>(`${base}/contents/${input.projectPath.split("/").map(encodeURIComponent).join("/")}/settings.json?ref=${input.head}`, token);
  if (settingsFile.encoding !== "base64" || settingsFile.size > 1024 * 1024) throw new HttpError(400, "Invalid project settings.");
  const settings = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(settingsFile.content.replace(/\s/g, "")), char => char.charCodeAt(0))));
  const settingsPath = `${input.projectPath}/settings.json`;
  const nextSettings = input.files[settingsPath] ? JSON.parse(input.files[settingsPath]) : settings;
  try { validateSettingsEdit(settings, nextSettings); } catch (error) { throw new HttpError(400, error instanceof Error ? error.message : "Invalid settings edit."); }
  const allowed = new Set<string>([settingsPath]);
  for (const key of ["plugin.inlang.i18next", "plugin.inlang.messageFormat"]) {
    const configured = settings[key]?.pathPattern;
    const patterns = typeof configured === "string" ? [configured] : Array.isArray(configured) ? configured : configured && typeof configured === "object" ? Object.values(configured) : [];
    for (const pattern of patterns) for (const locale of [...new Set([...settings.locales, ...nextSettings.locales])]) {
      if (typeof pattern === "string" && typeof locale === "string") allowed.add(resolveResourcePath(input.projectPath, pattern.replace(/\{(?:locale|languageTag)\}/g, locale)));
    }
  }
  if (entries.some(([path]) => !allowed.has(path))) throw new HttpError(400, "Only resource paths configured in this project can be pushed.");
  // GitHub signs commits made with createCommitOnBranch, so they show as Verified (opral/inlang#4409);
  // REST git/commits leaves them unsigned. expectedHeadOid rejects a concurrent branch advance.
  const [headline, ...body] = input.message.trim().split("\n");
  const result = await github<{ data?: { createCommitOnBranch?: { commit: { oid: string; url: string; tree: { oid: string } } } }; errors?: { type?: string; message?: string }[] }>("/graphql", token, {
    query: "mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid url tree { oid } } } }",
    variables: { input: {
      branch: { repositoryNameWithOwner: `${input.owner}/${input.repo}`, branchName: input.branch },
      expectedHeadOid: input.head,
      message: { headline, body: body.join("\n").trim() },
      fileChanges: { additions: entries.map(([path, content]) => ({ path, contents: base64(content) })) },
    } },
  });
  const commit = result.data?.createCommitOnBranch?.commit;
  if (!commit) {
    // Never echo upstream messages that could contain credential or private content.
    if (result.errors?.some(error => error.type === "STALE_DATA" || /expected branch to point to/i.test(error.message ?? ""))) throw new HttpError(409, "The branch changed on GitHub while pushing.");
    throw new HttpError(result.errors?.some(error => error.type === "FORBIDDEN") ? 403 : 502, "GitHub rejected the commit. Check permissions and branch protection.");
  }
  return { head: commit.oid, tree: commit.tree.oid, url: commit.url };
}
function base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

export type ForkInput = { owner: string; repo: string; branch: string };
/**
 * Forks a repository for the signed-in user (or finds their existing fork) and waits until the
 * branch being edited exists there, so Fink can open it right away, as fink.inlang.com did.
 */
export async function fork(input: ForkInput, token: string): Promise<{ owner: string; name: string }> {
  if (!input || typeof input.owner !== "string" || typeof input.repo !== "string" || typeof input.branch !== "string" || !input.branch || input.branch.length > 255) throw new HttpError(400, "Invalid fork request.");
  const created = await github<{ name: string; owner: { login: string } }>(`${repoBase(input.owner, input.repo)}/forks`, token, { default_branch_only: false });
  const forkBase = repoBase(created.owner.login, created.name);
  // GitHub creates forks asynchronously; the branch appears within seconds.
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      await github(`${forkBase}/branches/${input.branch.split("/").map(encodeURIComponent).join("/")}`, token);
      return { owner: created.owner.login, name: created.name };
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 404) throw error;
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
  throw new HttpError(504, "GitHub is still creating the fork. Try again in a minute.");
}
