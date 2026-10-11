import { beforeEach, expect, it, vi } from "vitest";
import { RECENT_KEY, forgetRecent, readRecent, rememberRecent, setRecentPending } from "../src/recent";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) });
});
const project = (name: string, branch = "main") => ({ owner: "acme", name, branch, projectPath: "project.inlang" });

it("lists projects by when they were last opened, at most six", () => {
  vi.useFakeTimers();
  for (let index = 0; index < 8; index++) { vi.setSystemTime(1000 + index); rememberRecent(project(`repo-${index}`)); }
  vi.setSystemTime(2000); rememberRecent(project("repo-3"));
  expect(readRecent().map(value => value.name)).toEqual(["repo-3", "repo-7", "repo-6", "repo-5", "repo-4", "repo-2"]);
  vi.useRealTimers();
});

it("orders entries written out of order and drops malformed ones", () => {
  store.set(RECENT_KEY, JSON.stringify([{ ...project("old"), openedAt: 1 }, { owner: "acme", name: "broken" }, { ...project("new"), openedAt: 5, pending: "2" }]));
  expect(readRecent()).toEqual([{ ...project("new"), openedAt: 5, pending: 2 }, { ...project("old"), openedAt: 1, pending: 0 }]);
  store.set(RECENT_KEY, "not json");
  expect(readRecent()).toEqual([]);
});

it("keeps one entry per repository, branch and project, with only how to reopen it", () => {
  rememberRecent(project("web"));
  setRecentPending(project("web"), 3);
  rememberRecent(project("web"));
  rememberRecent(project("web", "translations"));
  const stored = JSON.parse(store.get(RECENT_KEY)!) as Record<string, unknown>[];
  expect(stored).toHaveLength(2);
  expect(Object.keys(stored[1]!).sort()).toEqual(["branch", "name", "openedAt", "owner", "pending", "projectPath"]);
  expect(stored[1]).toMatchObject({ branch: "main", pending: 3 });
  expect(forgetRecent(readRecent()[0]!).map(value => value.branch)).toEqual(["main"]);
});
