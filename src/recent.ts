// Projects opened in this browser. Drafts live in OPFS per repository, branch,
// and project; this list only remembers how to reopen them.
export type RecentProject = { owner: string; name: string; branch: string; projectPath: string; openedAt: number; pending: number };
const KEY = "fink:recent-projects";
const LIMIT = 6;
export const recentKey = (project: Pick<RecentProject, "owner" | "name" | "branch" | "projectPath">) => [project.owner, project.name, project.branch, project.projectPath].join("/").toLowerCase();
function valid(value: unknown): value is RecentProject {
  const project = value as RecentProject;
  return !!project && [project.owner, project.name, project.branch, project.projectPath].every(part => typeof part === "string" && part) && typeof project.openedAt === "number";
}
export function readRecent(): RecentProject[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(value) ? value.filter(valid).map(project => ({ ...project, pending: Number(project.pending) || 0 })).slice(0, LIMIT) : [];
  } catch { return []; }
}
function write(projects: RecentProject[]) {
  try { localStorage.setItem(KEY, JSON.stringify(projects.slice(0, LIMIT))); } catch { /* Storage can be unavailable in private windows. */ }
}
export function rememberRecent(project: Omit<RecentProject, "openedAt" | "pending">) {
  const previous = readRecent();
  const existing = previous.find(value => recentKey(value) === recentKey(project));
  write([{ ...project, openedAt: Date.now(), pending: existing?.pending ?? 0 }, ...previous.filter(value => value !== existing)]);
}
export function setRecentPending(project: Pick<RecentProject, "owner" | "name" | "branch" | "projectPath">, pending: number) {
  const previous = readRecent();
  if (previous.some(value => recentKey(value) === recentKey(project) && value.pending !== pending)) write(previous.map(value => recentKey(value) === recentKey(project) ? { ...value, pending } : value));
}
export function forgetRecent(project: RecentProject): RecentProject[] {
  const next = readRecent().filter(value => recentKey(value) !== recentKey(project));
  write(next);
  return next;
}
export function timeAgo(date: number | string): string {
  const seconds = Math.round((Date.now() - new Date(date).getTime()) / 1000);
  const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, size] of [["year", 31_536_000], ["month", 2_592_000], ["week", 604_800], ["day", 86_400], ["hour", 3_600], ["minute", 60]] as const) {
    if (Math.abs(seconds) >= size) return format.format(-Math.floor(seconds / size), unit);
  }
  return "just now";
}
