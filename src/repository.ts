import type { ExportFile, ProjectSettings } from "@inlang/sdk/browser";

export type Repo = { owner: string; name: string; branch?: string; projectPath?: string };
export type RepoTree = { head: string; tree: string; branch: string; paths: string[]; projects: string[] };
export type RepoContext = Repo & { branch: string; projectPath: string; head: string; tree: string; settings: ProjectSettings; original: Record<string, string>; baseline: Record<string, string>; bundleBaseline?: Record<string, string> };
export function parseRepository(input: string): Repo {
  const url = new URL(input.includes("://") ? input : `https://github.com/${input}`);
  if (url.protocol !== "https:" || url.hostname !== "github.com" || url.username || url.password) throw new Error("Use a github.com repository URL.");
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2 || !parts.slice(0, 2).every(p => /^[\w.-]+$/.test(p))) throw new Error("Enter a repository such as https://github.com/owner/repo.");
  if (parts.length > 2) throw new Error("Use the repository root URL, then choose a branch.");
  return { owner: parts[0], name: parts[1].replace(/\.git$/, "") };
}
export function resolveResourcePath(projectPath: string, resourcePath: string): string {
  if (resourcePath.startsWith("/") || resourcePath.includes("\\") || /^[a-z]+:/i.test(resourcePath)) throw new Error(`Unsupported resource path: ${resourcePath}`);
  const parts = [...projectPath.split("/").slice(0, -1), ...resourcePath.split("/")];
  const result: string[] = [];
  for (const part of parts) {
    if (part === "..") { if (!result.length) throw new Error("Resource path escapes the repository."); result.pop(); }
    else if (part && part !== ".") result.push(part);
  }
  if (!result.length) throw new Error("Empty resource path.");
  return result.join("/");
}
export function outputPath(settings: ProjectSettings, pluginKey: string, output: ExportFile): string {
  const config = settings[pluginKey] as { pathPattern?: string | string[] | Record<string, string> } | undefined;
  let pattern = output.metadata?.pathPattern as string | undefined;
  const configured = config?.pathPattern;
  if (!pattern && typeof configured === "string") pattern = configured;
  if (!pattern && Array.isArray(configured)) {
    if (configured.length !== 1) throw new Error("Multiple output patterns are ambiguous. Use one path pattern per plugin.");
    pattern = configured[0];
  }
  if (!pattern && configured && typeof configured === "object" && !Array.isArray(configured)) {
    const namespace = output.metadata?.namespace;
    if (typeof namespace === "string") pattern = configured[namespace];
  }
  if (!pattern) throw new Error(`Cannot resolve ${output.name} to a configured resource path.`);
  return pattern.replace(/\{(?:locale|languageTag)\}/g, output.locale);
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, { method: body === undefined ? "GET" : "POST", headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? `Request failed (${response.status}).`);
  return result as T;
}
export function repoQuery(repo: Repo): string { return new URLSearchParams({ owner: repo.owner, repo: repo.name, ...(repo.branch ? { branch: repo.branch } : {}) }).toString(); }
