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
    // Never echo upstream messages that could contain credential or private content.
    throw new HttpError(response.status === 422 ? 409 : response.status, response.status === 404 ? "Repository or file not found. Check GitHub App access." : response.status === 422 ? "The branch changed or GitHub rejected the commit. Reload the remote state before pushing." : `GitHub request failed (${response.status}). Check permissions and rate limits.`);
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
  if (ref.object.sha !== input.head) throw new HttpError(409, "The branch has changed since this project was opened. Your draft is saved locally; reload and reconcile before pushing.");
  const settingsFile = await github<{ encoding: string; content: string; size: number }>(`${base}/contents/${input.projectPath.split("/").map(encodeURIComponent).join("/")}/settings.json?ref=${input.head}`, token);
  if (settingsFile.encoding !== "base64" || settingsFile.size > 1024 * 1024) throw new HttpError(400, "Invalid project settings.");
  const settings = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(settingsFile.content.replace(/\s/g, "")), char => char.charCodeAt(0))));
  const allowed = new Set<string>();
  for (const key of ["plugin.inlang.i18next", "plugin.inlang.messageFormat"]) {
    const configured = settings[key]?.pathPattern;
    const patterns = typeof configured === "string" ? [configured] : Array.isArray(configured) ? configured : configured && typeof configured === "object" ? Object.values(configured) : [];
    for (const pattern of patterns) for (const locale of settings.locales ?? []) {
      if (typeof pattern === "string" && typeof locale === "string") allowed.add(resolveResourcePath(input.projectPath, pattern.replace(/\{(?:locale|languageTag)\}/g, locale)));
    }
  }
  if (entries.some(([path]) => !allowed.has(path))) throw new HttpError(400, "Only resource paths configured in this project can be pushed.");
  const commit = await github<{ tree: { sha: string } }>(`${base}/git/commits/${input.head}`, token);
  const tree = await github<{ sha: string }>(`${base}/git/trees`, token, { base_tree: commit.tree.sha, tree: entries.map(([path, content]) => ({ path, mode: "100644", type: "blob", content })) });
  const next = await github<{ sha: string; html_url: string }>(`${base}/git/commits`, token, { message: input.message.trim(), tree: tree.sha, parents: [input.head] });
  // Non-force update rejects a concurrent branch advance between our read and write.
  await github(refPath, token, { sha: next.sha, force: false }, "PATCH");
  return { head: next.sha, tree: tree.sha, url: next.html_url ?? `https://github.com/${input.owner}/${input.repo}/commit/${next.sha}` };
}
