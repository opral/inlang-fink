import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { checkProject, findUsages, type BundleNested, type CheckDiagnostic, type CheckStatus, type InlangProject, type MessageNested, type ProjectSettings, type SourceFile } from "@inlang/sdk/browser";
import type { ChangeEventDetail } from "@inlang/editor-component";
import { RichDiff } from "./DiffBundleView";
import { Settings, SettingsDiff, type SettingsChange } from "./Settings";
import { validateSettingsEdit } from "./settingsData";
import { LixFloat, type FloatMode } from "./LixFloat";
import { MachineTranslateDialog, SparkleIcon, type MachineTranslationRequest } from "./MachineTranslate";
import { MessageCard } from "./MessageCard";
import type { InlangPatternEditor } from "@inlang/editor-component";
import { unsupportedExactNumber, type Restructure } from "./flows";
import { LanguageMenu } from "./LanguageMenu";
import { languageName, readFocus, writeFocus, type LanguageFocus } from "./languages";
import { issueKind, type Issue, type IssueKind } from "./issues";
import { Landing } from "./Landing";
import { History } from "./History";
import { BranchMenu } from "./BranchMenu";
import { StarButton } from "./StarButton";
import { CheckIcon, Chevron, Dropdown, DownloadIcon, GitHubIcon, RepoIcon, BranchIcon } from "./Menu";
import type { Showcase } from "./showcaseList";
import { highlightMatches, markUntranslated, searchTerms, searchText } from "./search";
import { sourceSnapshot, usagesFromReferences, type Usage } from "./usage";
import { forgetRecent, readRecent, recentKey, rememberRecent, setRecentPending, type RecentProject } from "./recent";
import { cleanupDrafts, deleteDraft, draftName, readDrafts, recordDraft, registerExisting, setDraftPending } from "./drafts";
import { LocalDrafts } from "./LocalDrafts";
import { capture, hashId, identify, telemetryEnabled } from "./telemetry";
import { onlyExactZero, preparePush, replaceBundles, openRepositoryProject, syncWithRemote, gitBlobSha, readBundle, readBundles, getBaselineSignatures, bundleSignature, bundleSignatures, saveContext, settingsChanges, type LocalProject } from "./project";
import { api, parseRepository, projectScope, repoQuery, type Repo, type RepoTree } from "./repository";

/** The commit message fink.inlang.com used for every push; translators don't write commits. */
// The body names Fink's URL so commits pushed with Fink can be found with a GitHub commit search, and
// the co-author trailer credits @inlang-bot (GitHub links hello@inlang.com to that account).
export const PUSH_MESSAGE = "chore: update translations with Fink 🐦\n\nPushed via https://fink.inlang.com\n\nCo-authored-by: Fink <hello@inlang.com>";
const replacedNotice = (ids: string[]) => `${ids.length === 1 ? `Your edit to ${ids[0]} was` : `${ids.length} of your edits (${ids.slice(0, 3).join(", ")}${ids.length > 3 ? ", …" : ""}) were`} replaced by newer changes on GitHub.`;
/** GitHub's compare page for a fork's branch against the original repository, as fink.inlang.com opened it. */
function compareUrl(parent: { owner: string; name: string }, owner: string, name: string, branch: string) {
  const body = `Translations updated with Fink.\n\nPreview: https://fink.inlang.com/?repo=${encodeURIComponent(`https://github.com/${parent.owner}/${parent.name}`)}`;
  return `https://github.com/${parent.owner}/${parent.name}/compare/${encodeURIComponent(branch)}...${owner}:${name}:${encodeURIComponent(branch)}?${new URLSearchParams({ expand: "1", title: "Update translations", body })}`;
}

/** The commit the active branch points at, to tell Fink's own edits from other writes. */
async function headCommit(project: InlangProject): Promise<string> {
  const branch = await project.lix.activeBranchId();
  const result = await project.lix.execute("SELECT commit_id FROM lix_branch WHERE id = $1", [branch]);
  return String((result.rows[0] as { commit_id?: unknown } | undefined)?.commit_id ?? "");
}

export default function App() {
  const [url, setUrl] = useState(() => new URLSearchParams(location.search).get("repo") ?? "");
  const [repo, setRepo] = useState<Repo>();
  const [tree, setTree] = useState<RepoTree>();
  const [branches, setBranches] = useState<string[]>([]);
  const [branch, setBranch] = useState(() => new URLSearchParams(location.search).get("branch") ?? "");
  const [path, setPath] = useState(() => new URLSearchParams(location.search).get("project") ?? "");
  const [local, setLocal] = useState<LocalProject>();
  const [bundles, setBundles] = useState<BundleNested[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "todo" | "edited">("all");
  const [todoKind, setTodoKind] = useState<"all" | IssueKind>("all");
  const [focus, setFocus] = useState<LanguageFocus>();
  const [replacedIds, setReplacedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [user, setUser] = useState<{ login: string } | null>(null);
  const [progress, setProgress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reviewState, setReviewState] = useState<{ ids: string[]; bundles: BundleNested[]; settings?: SettingsChange }>();
  // Write access and fork state, as on fink.inlang.com: collaborators push, everyone else forks.
  const [access, setAccess] = useState<{ key: string; push: boolean; signedIn: boolean; parent?: { owner: string; name: string } }>();
  const [forking, setForking] = useState(false);
  // The last push, shown in the float with links to the commit and, for a fork, the pull request to open.
  const [pushed, setPushed] = useState<{ commit: string; pullRequest?: string }>();
  const [projects, setProjects] = useState<string[]>([]);
  const [initializing, setInitializing] = useState(() => { const params = new URLSearchParams(location.search); return !!params.get("repo") && !!params.get("project"); });
  const [recent, setRecent] = useState<RecentProject[]>(readRecent);
  const [newId, setNewId] = useState("");
  const [view, setView] = useState<"edit" | "settings" | "history">("edit");
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [settingsRevision, setSettingsRevision] = useState(0);
  const [dirtyCount, setDirtyCount] = useState(0);
  const pendingCount = dirtyCount + Number(settingsDirty);
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [saving, setSaving] = useState(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const localRef = useRef<LocalProject | undefined>(undefined);
  const failure = useRef(false);
  const loading = useRef(false);
  const pending = useRef(0);
  const bundleIndex = useRef(new Map<string, BundleNested>());
  const owners = useRef(new Map<string, string>());
  const baseline = useRef<Record<string, string>>({});
  const dirty = useRef(new Set<string>());
  const searchIndex = useRef(new WeakMap<BundleNested, string>());
  const table = useRef<HTMLDivElement>(null);
  // The app's source at the draft's base commit, its usages (inlang SDK findUsages) and the SDK's check results.
  const [source, setSource] = useState<{ key: string; raw: Record<string, string>; files: SourceFile[] }>();
  const [usage, setUsage] = useState<{ key: string; byBundle: Map<string, Usage[]> }>();
  const [usageStatus, setUsageStatus] = useState<{ state: "idle" | "loading" | "ready" | "error"; error?: string }>({ state: "idle" });
  const usageCache = useRef(new Map<string, Promise<Record<string, string>>>());
  const [diagnostics, setDiagnostics] = useState<{ byBundle: Map<string, CheckDiagnostic[]>; usage?: CheckStatus }>();
  const checked = useRef<{ project?: InlangProject; key: string; files?: SourceFile[]; bundles: Map<string, BundleNested> }>({ key: "", bundles: new Map() });
  const checkQueue = useRef<Promise<void>>(Promise.resolve());
  const branchCache = useRef(new Map<string, Promise<string[]>>());
  const indexBundle = useCallback((id: string, bundle?: BundleNested) => {
    const previous = bundleIndex.current.get(id);
    owners.current.delete(`bundle:${id}`);
    for (const message of previous?.messages ?? []) {
      owners.current.delete(`message:${message.id}`);
      for (const variant of message.variants) owners.current.delete(`variant:${variant.id}`);
    }
    if (bundle) {
      bundleIndex.current.set(id, bundle); owners.current.set(`bundle:${id}`, id);
      for (const message of bundle.messages) {
        owners.current.set(`message:${message.id}`, id);
        for (const variant of message.variants) owners.current.set(`variant:${variant.id}`, id);
      }
    } else bundleIndex.current.delete(id);
    if ((bundle ? bundleSignature(bundle) : undefined) === baseline.current[id]) dirty.current.delete(id);
    else dirty.current.add(id);
  }, []);
  const refresh = useCallback(async (current: LocalProject, id?: string) => {
    if (id !== undefined) {
      const bundle = await readBundle(current.project, id);
      indexBundle(id, bundle);
      setBundles(previous => bundle ? previous.some(value => value.id === id) ? previous.map(value => value.id === id ? bundle : value) : [...previous, bundle] : previous.filter(value => value.id !== id));
    } else {
      const all = await readBundles(current.project);
      baseline.current = await getBaselineSignatures(current);
      bundleIndex.current.clear(); owners.current.clear(); dirty.current.clear();
      for (const bundle of all) indexBundle(bundle.id, bundle);
      for (const id of Object.keys(baseline.current)) if (!bundleIndex.current.has(id)) dirty.current.add(id);
      setBundles(all);
    }
    setDirtyCount(dirty.current.size);
    setSettingsDirty(!!settingsChanges(current));
  }, [indexBundle]);
  // A 401 from Fink's API means GitHub wants an account (rate limit or private repository): the error offers sign-in.
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const report = useCallback((error: unknown) => { setError(error instanceof Error ? error.message : String(error)); setNeedsSignIn((error as { status?: number })?.status === 401); }, []);
  const run = useCallback(async (task: () => Promise<void>) => { setBusy(true); setProgress(""); setError(""); setNotice(""); try { await task(); } catch (error) { report(error); } finally { setBusy(false); } }, [report]);
  useEffect(() => {
    void (async () => {
      try {
        if (location.hash.startsWith("#auth=")) {
          const relay = location.hash.slice(6); history.replaceState(null, "", location.pathname + location.search);
          await api("auth/complete", { relay });
          // GitHub returns to the origin root; reopen the project the user signed in from.
          const back = sessionStorage.getItem("fink:return"); sessionStorage.removeItem("fink:return");
          if (back?.startsWith("?") && !location.search) history.replaceState(null, "", `/${back}`);
        }
        const signedIn = await api<{ login: string } | null>("user");
        setUser(signedIn);
        await identify(signedIn?.login);
        capture("app:session_start", { is_signed_in: !!signedIn });
      } catch (error) { report(error); capture("app:session_start", { is_signed_in: false }); }
      const params = new URLSearchParams(location.search);
      const repository = params.get("repo"), project = params.get("project");
      setInitializing(false);
      if (repository && project) void openLocation(repository, params.get("branch") ?? "", project);
      else if (repository) setUrl(repository);
    })();
    return () => { flushRef.current(); void queue.current.then(() => localRef.current?.close()).catch(report); };
  }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (saving || failure.current || pendingWrites.current.size) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [saving]);
  useEffect(() => setPage(0), [search, filter, todoKind, focus]);
  // Filtering re-renders up to 25 editor web components; wait until typing pauses.
  useEffect(() => { const timer = setTimeout(() => setSearch(searchInput.trim()), 150); return () => clearTimeout(timer); }, [searchInput]);
  // Undo and redo use Lix's history (lix_undo/lix_redo), limited to the edits made here: each edit
  // records the commit it produced, and anything else that commits (sync, settings) resets the stack.
  const undoState = useRef({ head: "", undo: 0, redo: 0 });
  const enqueueNow = useCallback((task: () => Promise<void>, undoable = true) => {
    pending.current++;
    setSaving(true);
    queue.current = queue.current.then(async () => {
      const project = localRef.current?.project, state = undoState.current;
      if (project && (await headCommit(project)) !== state.head) { state.undo = 0; state.redo = 0; }
      await task();
      if (!project) return;
      state.head = await headCommit(project);
      if (undoable) { state.undo++; state.redo = 0; } else { state.undo = 0; state.redo = 0; }
    }).catch(error => { failure.current = true; report(error); }).finally(() => { pending.current--; setSaving(pending.current > 0); });
  }, [report]);
  // Typing is written once it pauses: one commit (and one undo step) per pause, not per keystroke.
  const pendingWrites = useRef(new Map<string, ChangeEventDetail>());
  const writeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flushRef = useRef<() => void>(() => {});
  /** Other draft operations first write pending text, so they see it and stay in order. */
  const enqueue = useCallback((task: () => Promise<void>, undoable = true) => { flushRef.current(); enqueueNow(task, undoable); }, [enqueueNow]);
  const settle = useCallback(async () => { flushRef.current(); await queue.current; }, []);
  const stepHistory = useCallback((direction: "undo" | "redo") => {
    const current = localRef.current;
    if (!current) return;
    flushRef.current();
    queue.current = queue.current.then(async () => {
      const state = undoState.current;
      if ((await headCommit(current.project)) !== state.head || !(direction === "undo" ? state.undo : state.redo)) return;
      await current.project.lix.execute(`SELECT commit_id FROM lix_${direction}()`);
      state.head = await headCommit(current.project);
      if (direction === "undo") { state.undo--; state.redo++; } else { state.redo--; state.undo++; }
      // Editors ignore text they typed themselves (echoes of saves); restored text must replace it in place.
      document.querySelectorAll<InlangPatternEditor>("inlang-pattern-editor").forEach(editor => editor.forgetEdits?.());
      await refresh(current);
    }).catch(report);
  }, [refresh, report]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase(), redo = (key === "z" && event.shiftKey) || (key === "y" && !event.shiftKey);
      if (key !== "z" && !redo) return;
      // Ordinary inputs keep their own undo; translations and the page use the draft's history.
      if ((event.target as Element | null)?.closest?.("input, textarea, select, dialog") || !local || view !== "edit" || reviewState) return;
      event.preventDefault();
      event.stopPropagation();
      stepHistory(redo ? "redo" : "undo");
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [stepHistory, local, view, reviewState]);
  const discover = () => run(async () => {
    const parsed = parseRepository(url); parsed.branch = branch || undefined;
    const next = await api<RepoTree>(`github/tree?${repoQuery(parsed)}`);
    if (!next.projects.length) throw new Error("No unpacked project.inlang/settings.json found in this repository.");
    const projectPath = next.projects.includes(path) ? path : next.projects[0];
    setRepo(parsed); setBranch(next.branch); setPath(projectPath);
    // A single project opens immediately; the branch menu switches branches later.
    if (next.projects.length === 1) { setTree(undefined); await loadProject(parsed, next, projectPath, url); return; }
    setTree(next); setBranches([next.branch]);
    setBranches(await loadBranches(parsed).catch(() => [next.branch]));
  });
  const loadBranches = (repository: Repo = localRef.current?.context ?? repo!) => {
    const key = `${repository.owner}/${repository.name}`.toLowerCase();
    let request = branchCache.current.get(key);
    if (!request) {
      request = api<string[]>(`github/branches?${repoQuery({ owner: repository.owner, name: repository.name })}`); branchCache.current.set(key, request); request.catch(() => branchCache.current.delete(key));
      // Drafts of branches that no longer exist on GitHub are deleted when they hold no unpushed changes.
      request.then(names => cleanupDrafts({ openName: localRef.current?.name, branches: { owner: repository.owner, repo: repository.name, names } })).catch(error => console.warn("Draft cleanup failed", error));
    }
    return request;
  };
  const loadProject = async (repository: Repo, nextTree: RepoTree, projectPath: string, repositoryUrl: string) => {
    await settle();
    if (failure.current) throw new Error("Resolve the failed save before switching projects. Your current draft remains open.");
    if (!nextTree.projects.includes(projectPath)) throw new Error("This project does not exist on the selected branch.");
    if (loading.current) throw new Error("Another project is still opening.");
    loading.current = true;
    try {
      const previous = localRef.current;
      // Different projects use different OPFS databases, so open the next one first:
      // the current editor stays on screen (inert while busy) and survives a failed open.
      const same = previous && previous.context.owner === repository.owner && previous.context.name === repository.name && previous.context.branch === nextTree.branch && previous.context.projectPath === projectPath;
      if (previous && same) { localRef.current = undefined; setLocal(undefined); setBundles([]); await previous.close(); }
      const next = await openRepositoryProject(repository, nextTree, projectPath, setProgress);
      // GitHub is the source of truth: a restored draft is brought up to date before it is shown.
      let synced: { replaced: string[] } | undefined;
      try { synced = await syncWithRemote(next, repository, nextTree, setProgress); }
      catch (error) { console.error("Sync with GitHub failed", error); setNotice("Couldn't check GitHub for newer changes. Your draft is open, and Fink will check again before pushing."); }
      if (synced?.replaced.length) { setNotice(replacedNotice(synced.replaced)); setReplacedIds(new Set(synced.replaced)); }
      if (previous && !same) { localRef.current = undefined; await previous.close(); }
      localRef.current = next; await refresh(next); setLocal(next);
    } finally { loading.current = false; }
    await navigator.storage.persist();
    setPage(0); setView("edit"); setReviewState(undefined); setTree(undefined); setProjects(nextTree.projects);
    setSearchInput(""); setSearch(""); setFilter("all"); setTodoKind("all"); setFocus(undefined); setReplacedIds(new Set()); setNewId(""); setShowNewMessage(false); setPushed(undefined);
    history.replaceState(null, "", `/?${new URLSearchParams({ repo: repositoryUrl, branch: nextTree.branch, project: projectPath })}`);
    rememberRecent({ owner: repository.owner, name: repository.name, branch: nextTree.branch, projectPath }); setRecent(readRecent());
    if (localRef.current) recordDraft({ name: localRef.current.name, owner: repository.owner, repo: repository.name, branch: nextTree.branch, projectPath });
    if (localRef.current) void reportProjectView(localRef.current);
  };
  /** Project size and team size for telemetry: counts only, the repository is hashed. */
  const reportProjectView = async (current: LocalProject) => {
    if (!telemetryEnabled()) return;
    const { context } = current, scope = projectScope(context);
    const commits = await api<{ author: string }[]>(`github/commits?${repoQuery(context)}${scope ? `&path=${encodeURIComponent(scope)}` : ""}`).catch(() => undefined);
    capture("project:project_view", {
      project_id: await hashId(`${context.owner}/${context.name}/${context.projectPath}`),
      message_count: bundleIndex.current.size,
      language_count: context.settings.locales.length,
      ...(commits ? { collaborator_count: new Set(commits.map(commit => commit.author)).size } : {}),
    });
  };
  const open = () => run(async () => {
    if (!repo || !path) return;
    const nextTree = tree?.branch === branch ? tree : await api<RepoTree>(`github/tree?${repoQuery({ ...repo, branch })}`);
    await loadProject(repo, nextTree, path, url);
  });
  const openLocation = (repositoryUrl: string, branchName: string, projectPath: string) => run(async () => {
    const repository = { ...parseRepository(repositoryUrl), branch: branchName || undefined };
    const nextTree = await api<RepoTree>(`github/tree?${repoQuery(repository)}`);
    setUrl(repositoryUrl); setRepo(repository); setBranch(nextTree.branch); setPath(projectPath); setTree(undefined);
    await loadProject(repository, nextTree, projectPath, repositoryUrl);
  });
  const openShowcase = (showcase: Showcase) => void openLocation(`https://github.com/${showcase.repository}`, showcase.branch, showcase.projectPath);
  const openRecent = (project: RecentProject) => void openLocation(`https://github.com/${project.owner}/${project.name}`, project.branch, project.projectPath);
  const switchBranch = (name: string) => void run(async () => {
    const current = localRef.current;
    if (!current) return;
    const repository = { owner: current.context.owner, name: current.context.name, branch: name };
    const nextTree = await api<RepoTree>(`github/tree?${repoQuery(repository)}`);
    if (!nextTree.projects.includes(current.context.projectPath)) throw new Error(`${current.context.projectPath} does not exist on ${name}. Your draft on ${current.context.branch} is unchanged.`);
    setBranch(nextTree.branch);
    await loadProject(repository, nextTree, current.context.projectPath, `https://github.com/${repository.owner}/${repository.name}`);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(".branch-trigger")?.focus());
  });
  const goHome = () => void run(async () => {
    if (loading.current) return;
    await settle();
    if (failure.current) throw new Error("Resolve the failed save before closing the project. Your current draft remains open.");
    const current = localRef.current;
    localRef.current = undefined; setLocal(undefined); setBundles([]); setReviewState(undefined); setTree(undefined); setView("edit");
    setRepo(undefined); setBranch(""); setPath(""); setProjects([]);
    await current?.close();
    setRecent(readRecent()); history.replaceState(null, "", "/");
  });
  /** The bundle an edited entity belongs to. */
  const ownerOf = (detail: ChangeEventDetail) => {
    const data = detail.newData;
    return detail.entity === "bundle" ? detail.entityId : owners.current.get(`${detail.entity}:${detail.entityId}`) ?? (detail.entity === "message" && data ? (data as BundleNested["messages"][number]).bundle_id : detail.entity === "variant" && data ? owners.current.get(`message:${(data as BundleNested["messages"][number]["variants"][number]).message_id}`) : undefined);
  };
  const write = async (db: LocalProject["project"]["db"], detail: ChangeEventDetail) => {
    const data = detail.newData;
    if (!data) { await db.deleteFrom(`inlang_${detail.entity}` as const).where("id", "=", detail.entityId).execute(); return; }
    // Strip nested UI data; the SDK stores three separate tables.
    if (detail.entity === "bundle") {
      const value = data as BundleNested;
      await db.insertInto("inlang_bundle").values({ id: value.id, declarations: value.declarations }).onConflict(oc => oc.column("id").doUpdateSet({ declarations: value.declarations })).execute();
    } else if (detail.entity === "message") {
      const value = data as BundleNested["messages"][number];
      await db.insertInto("inlang_message").values({ id: value.id, bundle_id: value.bundle_id, locale: value.locale, selectors: value.selectors }).onConflict(oc => oc.column("id").doUpdateSet({ selectors: value.selectors })).execute();
    } else {
      const value = data as BundleNested["messages"][number]["variants"][number];
      await db.insertInto("inlang_variant").values(value).onConflict(oc => oc.column("id").doUpdateSet({ pattern: value.pattern, matches: value.matches })).execute();
    }
  };
  const flushWrites = useCallback(() => {
    clearTimeout(writeTimer.current); writeTimer.current = undefined;
    const local = localRef.current, details = [...pendingWrites.current.values()];
    pendingWrites.current.clear();
    if (!local || !details.length) return;
    enqueueNow(async () => {
      const ids = new Set<string>();
      await local.project.db.transaction().execute(async tx => {
        for (const detail of details) {
          const bundleId = ownerOf(detail);
          if (!bundleId) throw new Error("The edited message could not be located. Reload the project to inspect your saved draft.");
          ids.add(bundleId);
          await write(tx as unknown as LocalProject["project"]["db"], detail);
        }
      });
      for (const id of ids) await refresh(local, id);
    });
  }, [enqueueNow, refresh]);
  flushRef.current = flushWrites;
  const change = useCallback((detail: ChangeEventDetail, immediate = false) => {
    if (!localRef.current) return;
    // i18next has no exact numbers other than 0 (`key_zero`): such a form couldn't be pushed.
    if (detail.entity === "variant" && detail.newData && onlyExactZero(localRef.current.context.settings)) {
      const variant = detail.newData as BundleNested["messages"][number]["variants"][number], bundleId = ownerOf(detail), bundle = bundleId ? bundleIndex.current.get(bundleId) : undefined;
      const before = bundle?.messages.flatMap(message => message.variants).find(value => value.id === variant.id);
      const number = bundle && JSON.stringify(before?.matches) !== JSON.stringify(variant.matches) ? unsupportedExactNumber(bundle, variant) : undefined;
      if (number !== undefined) {
        setError(`i18next can't have a form for exactly ${number}: only 0 (key_zero) and the plural categories (one, other, …). The form wasn't changed.`);
        // the structure editor shows the rejected value until it gets the stored bundle again
        refresh(localRef.current, bundleId!).catch(report);
        return;
      }
    }
    if (detail.entity === "variant" && detail.newData) {
      // "Saving…" shows only while writing; the leave warning covers text that is still pending.
      pendingWrites.current.set(detail.entityId, detail);
      clearTimeout(writeTimer.current);
      if (immediate) flushWrites(); else writeTimer.current = setTimeout(flushWrites, 500);
      return;
    }
    const local = localRef.current;
    enqueue(async () => {
      const bundleId = ownerOf(detail);
      if (!bundleId) throw new Error("The edited message could not be located. Reload the project to inspect your saved draft.");
      await write(local.project.db, detail);
      await refresh(local, bundleId);
    });
  }, [enqueue, flushWrites, refresh, report]);
  // Leaving a field or the page writes what was typed right away.
  useEffect(() => {
    const flush = () => flushWrites();
    const hidden = () => { if (document.visibilityState === "hidden") flushWrites(); };
    document.addEventListener("focusout", flush, true);
    document.addEventListener("visibilitychange", hidden);
    return () => { document.removeEventListener("focusout", flush, true); document.removeEventListener("visibilitychange", hidden); };
  }, [flushWrites]);
  const addLocale = useCallback((bundle: BundleNested, locale: string) => {
    const local = localRef.current;
    if (!local) return;
    enqueue(async () => {
      const id = crypto.randomUUID();
      await local.project.db.transaction().execute(async tx => {
        await tx.insertInto("inlang_message").values({ id, bundle_id: bundle.id, locale, selectors: [] }).execute();
        await tx.insertInto("inlang_variant").values({ id: crypto.randomUUID(), message_id: id, matches: [], pattern: [] }).execute();
      });
      await refresh(local, bundle.id);
    });
  }, [enqueue, refresh]);
  /** Adds a translation with its forms in one step (empty forms are not a change until text is typed). */
  const addMessage = useCallback((bundle: BundleNested, locale: string, shape: { id: string; selectors: MessageNested["selectors"]; variants: MessageNested["variants"] }) => {
    const local = localRef.current;
    if (!local) return;
    enqueue(async () => {
      await local.project.db.transaction().execute(async tx => {
        await tx.insertInto("inlang_message").values({ id: shape.id, bundle_id: bundle.id, locale, selectors: shape.selectors }).execute();
        if (shape.variants.length) await tx.insertInto("inlang_variant").values(shape.variants).execute();
      });
      await refresh(local, bundle.id);
    });
  }, [enqueue, refresh]);
  /** Replaces a translation's selectors and forms (split by count or gender, or back to one text). */
  const restructure = useCallback((bundleId: string, messageId: string, next: Restructure) => {
    const local = localRef.current;
    if (!local) return;
    enqueue(async () => {
      await local.project.db.transaction().execute(async tx => {
        if (next.declarations) await tx.updateTable("inlang_bundle").set({ declarations: next.declarations }).where("id", "=", bundleId).execute();
        await tx.updateTable("inlang_message").set({ selectors: next.selectors }).where("id", "=", messageId).execute();
        await tx.deleteFrom("inlang_variant").where("message_id", "=", messageId).execute();
        if (next.variants.length) await tx.insertInto("inlang_variant").values(next.variants).execute();
      });
      await refresh(local, bundleId);
    });
  }, [enqueue, refresh]);
  const removeVariant = useCallback((bundleId: string, variantId: string) => {
    const local = localRef.current;
    if (!local) return;
    enqueue(async () => {
      await local.project.db.deleteFrom("inlang_variant").where("id", "=", variantId).execute();
      await refresh(local, bundleId);
    });
  }, [enqueue, refresh]);
  const addVariant = useCallback((bundleId: string, variant: BundleNested["messages"][number]["variants"][number]) => {
    const local = localRef.current;
    if (!local) return;
    enqueue(async () => {
      await local.project.db.insertInto("inlang_variant").values(variant).execute();
      await refresh(local, bundleId);
    });
  }, [enqueue, refresh]);
  const removeBundle = useCallback((id: string) => {
    const local = localRef.current;
    if (!local || !confirm(`Delete message ${id} in every locale?`)) return;
    enqueue(async () => {
      await local.project.db.transaction().execute(async tx => {
        const messages = await tx.selectFrom("inlang_message").select("id").where("bundle_id", "=", id).execute();
        for (const message of messages) await tx.deleteFrom("inlang_variant").where("message_id", "=", message.id).execute();
        await tx.deleteFrom("inlang_message").where("bundle_id", "=", id).execute();
        await tx.deleteFrom("inlang_bundle").where("id", "=", id).execute();
      });
      await refresh(local, id);
    });
  }, [enqueue, refresh]);
  const create = () => {
    if (!local || !newId.trim()) return;
    const id = newId.trim();
    enqueue(async () => {
      await local.project.db.insertInto("inlang_bundle").values({ id, declarations: [] }).execute();
      await refresh(local, id); setNewId(""); setShowNewMessage(false);
    });
  };
  const saveSettings = (settings: ProjectSettings) => {
    const current = localRef.current;
    if (!current) return;
    try { validateSettingsEdit(current.context.settings, settings); }
    catch (error) { report(error); setSettingsRevision(value => value + 1); return; }
    setError("");
    enqueue(async () => {
      try {
        await current.project.settings.set({ ...settings, modules: [] });
        current.context.settings = settings;
        await saveContext(current);
        setSettingsDirty(!!settingsChanges(current));
        setLocal({ ...current });
        // Drop removed languages from the focus; re-derive it if the source itself was removed.
        setFocus(previous => !previous || !settings.locales.includes(previous.source) ? undefined : { ...previous, targets: previous.targets.filter(locale => settings.locales.includes(locale)), all: previous.all || !previous.targets.some(locale => settings.locales.includes(locale)) });
      } finally { setSettingsRevision(value => value + 1); }
    }, false);
  };
  useEffect(() => { if (local) { setRecentPending(local.context, pendingCount); setDraftPending(local.name, pendingCount); } }, [local, pendingCount]);
  // Whether the signed-in user can push to the open repository, or needs a fork first.
  const accessKey = local ? `${local.context.owner}/${local.context.name}:${user?.login ?? ""}` : "";
  useEffect(() => {
    // Signed out, the float asks to sign in; access only matters once signed in.
    if (!local || !user) return;
    let live = true;
    api<{ push: boolean; signedIn: boolean; parent?: { owner: string; name: string } }>(`github/access?${repoQuery({ owner: local.context.owner, name: local.context.name })}`)
      .then(result => { if (live) setAccess({ key: accessKey, ...result }); }, () => { if (live) setAccess({ key: accessKey, push: true, signedIn: !!user }); });
    return () => { live = false; };
  }, [accessKey]);
  /**
   * Forks the repository and continues on the same branch and project there. Unlike fink.inlang.com,
   * translation edits made before forking move along instead of being dropped.
   */
  const forkRepository = () => void run(async () => {
    const current = localRef.current;
    if (!current) return;
    await settle();
    const { owner, name, branch, projectPath } = current.context;
    const carried = [...dirty.current].flatMap(id => { const bundle = bundleIndex.current.get(id); return bundle ? [structuredClone(bundle)] : []; });
    const removed = [...dirty.current].filter(id => !bundleIndex.current.has(id));
    setForking(true);
    try {
      setProgress("Forking the repository on GitHub…");
      const forked = await api<{ owner: string; name: string }>("github/fork", { owner, repo: name, branch });
      const repository = { owner: forked.owner, name: forked.name, branch };
      const nextTree = await api<RepoTree>(`github/tree?${repoQuery(repository)}`);
      const forkUrl = `https://github.com/${forked.owner}/${forked.name}`;
      setUrl(forkUrl); setRepo(repository); setBranch(nextTree.branch); setPath(projectPath);
      await loadProject(repository, nextTree, projectPath, forkUrl);
      const next = localRef.current;
      if (next && (carried.length || removed.length)) {
        await replaceBundles(next.project, carried, removed);
        await refresh(next);
      }
      setNotice(`Forked ${owner}/${name} to ${forked.owner}/${forked.name}.${carried.length + removed.length ? ` Your ${carried.length + removed.length} ${carried.length + removed.length === 1 ? "change moved" : "changes moved"} along.` : ""} Push, then open a pull request.`);
    } finally { setForking(false); }
  });
  // Once per visit, when the browser is idle and no project is loading: register drafts made before
  // the registry existed, then delete clean drafts that weren't opened for 30 days.
  const cleaned = useRef(false);
  useEffect(() => {
    if (initializing || cleaned.current) return;
    const start = () => {
      if (loading.current) { setTimeout(start, 5000); return; }
      cleaned.current = true;
      void registerExisting(localRef.current?.name).then(() => cleanupDrafts({ openName: localRef.current?.name })).catch(error => console.warn("Draft cleanup failed", error));
    };
    const handle = "requestIdleCallback" in window ? requestIdleCallback(start, { timeout: 15000 }) : setTimeout(start, 5000);
    return () => { if ("cancelIdleCallback" in window) cancelIdleCallback(handle as number); else clearTimeout(handle as ReturnType<typeof setTimeout>); };
  }, [initializing]);
  /** Removes a recent project and its local draft, asking first when the draft has unpushed changes. */
  const forgetProject = async (project: RecentProject) => {
    const name = await draftName(project.owner, project.name, project.branch, project.projectPath);
    const pending = readDrafts()[name]?.pending ?? project.pending;
    if (pending !== 0 && !confirm(pending > 0 ? `${pending} unpushed ${pending === 1 ? "change" : "changes"} on ${project.branch} will be lost. Delete the local draft?` : `This draft may have unpushed changes on ${project.branch}. Delete it?`)) return;
    if ((await deleteDraft(name)) === "in-use") { setError(`The draft of ${project.owner}/${project.name} is open in another tab. Close it there first.`); return; }
    setRecent(forgetRecent(project));
  };
  // Where each message is used in the app's code, at the commit the draft is based on. The bundled
  // matcher understands Paraglide's m.*() calls, so only message-format projects are scanned.
  const usageKey = local && "plugin.inlang.messageFormat" in local.context.settings ? `${local.context.owner}/${local.context.name}@${local.context.head}:${projectScope(local.context)}` : undefined;
  useEffect(() => {
    if (!local || !usageKey) { setSource(undefined); setUsage(undefined); setUsageStatus({ state: "idle" }); return; }
    let live = true, request = usageCache.current.get(usageKey);
    if (!request) {
      const scope = projectScope(local.context);
      request = api<{ files: Record<string, string> }>(`github/source?${new URLSearchParams({ owner: local.context.owner, repo: local.context.name, ref: local.context.head, path: scope })}`).then(result => result.files);
      usageCache.current.set(usageKey, request);
      request.catch(() => usageCache.current.delete(usageKey));
    }
    setUsageStatus({ state: "loading" });
    request.then(raw => { if (live) setSource({ key: usageKey, raw, files: sourceSnapshot(raw) }); }, (error: unknown) => { if (live) setUsageStatus({ state: "error", error: error instanceof Error ? error.message : String(error) }); });
    return () => { live = false; };
  }, [usageKey]);
  const sourceFiles = source && source.key === usageKey ? source.files : undefined;
  useEffect(() => {
    if (!local || !source || source.key !== usageKey) return;
    let live = true;
    findUsages({ project: local.project, files: source.files }).then(result => {
      if (!live) return;
      setUsage({ key: source.key, byBundle: usagesFromReferences(result.references, source.raw) });
      setUsageStatus({ state: "ready" });
    }, (error: unknown) => { if (live) setUsageStatus({ state: "error", error: error instanceof Error ? error.message : String(error) }); });
    return () => { live = false; };
  }, [local, source, usageKey]);
  // inlang SDK checks: a full run when the project, reference language or source changes, then only
  // the bundles an edit replaced (bundles are immutable snapshots, so identity tells what changed).
  const referenceLocale = focus?.source ?? local?.context.settings.baseLocale;
  useEffect(() => {
    if (!local || !referenceLocale || !bundles.length) return;
    const project = local.project, previous = checked.current, current = new Map(bundles.map(bundle => [bundle.id, bundle]));
    let ids: string[] | undefined;
    if (previous.project === project && previous.key === referenceLocale && previous.files === sourceFiles) {
      ids = [...new Set([...current.keys(), ...previous.bundles.keys()])].filter(id => current.get(id) !== previous.bundles.get(id));
      if (!ids.length) return;
      if (ids.length > 200) ids = undefined;
    }
    checked.current = { project, key: referenceLocale, files: sourceFiles, bundles: current };
    const scope = ids;
    checkQueue.current = checkQueue.current.then(async () => {
      const result = await checkProject({ project, files: sourceFiles, referenceLocale, bundleIds: scope });
      if (checked.current.project !== project) return;
      setDiagnostics(state => {
        // Unchanged bundles keep their arrays, so their cards don't re-render.
        const byBundle = scope && state ? new Map(state.byBundle) : new Map<string, CheckDiagnostic[]>();
        for (const id of scope ?? []) byBundle.delete(id);
        const fresh = new Map<string, CheckDiagnostic[]>();
        for (const diagnostic of result.diagnostics) { const list = fresh.get(diagnostic.bundleId); if (list) list.push(diagnostic); else fresh.set(diagnostic.bundleId, [diagnostic]); }
        for (const [id, list] of fresh) byBundle.set(id, list);
        return { byBundle, usage: scope ? state?.usage : result.checks.find(check => check.id === "unused-message") };
      });
    }).catch(report);
  }, [bundles, local, referenceLocale, sourceFiles, report]);
  const review = async () => {
    if (!local) return;
    setError("");
    try {
      await settle();
      if (failure.current) throw new Error("A local save failed. Reload the page to inspect the persisted state before pushing.");
      const ids = [...dirty.current];
      // These immutable bundles already came from Lix through the SDK. Review
      // needs no resource export or full-catalog query.
      setReviewState({ ids, settings: settingsChanges(local), bundles: ids.flatMap(id => {
        const bundle = bundleIndex.current.get(id);
        return bundle ? [bundle] : [];
      }) });
    } catch (error) { report(error); }
  };
  const publish = () => run(async () => {
    const current = localRef.current;
    if (!current || (!dirty.current.size && !settingsChanges(current))) return;
    await settle();
    if (failure.current) throw new Error("A local save failed. Reload the page before pushing.");
    const repository = { owner: current.context.owner, name: current.context.name }, replaced: string[] = [];
    // Edits replaced by newer GitHub changes are reported together with the push result.
    const withReplaced = (text: string) => replaced.length ? `${replacedNotice(replaced)} ${text}` : text;
    for (let attempt = 0; ; attempt++) {
      // GitHub is the source of truth: bring the draft up to date before every push, and again
      // if someone pushed in between.
      setProgress("Checking GitHub for newer changes…");
      const remote = await api<RepoTree>(`github/tree?${repoQuery({ ...repository, branch: current.context.branch })}`);
      if (remote.head !== current.context.head) {
        const synced = await syncWithRemote(current, repository, remote, setProgress);
        for (const id of synced.replaced) if (!replaced.includes(id)) replaced.push(id);
        setReplacedIds(new Set(replaced));
        await refresh(current); setLocal({ ...current });
        const ids = [...dirty.current];
        setReviewState(previous => previous && { ids, settings: settingsChanges(current), bundles: ids.flatMap(id => { const bundle = bundleIndex.current.get(id); return bundle ? [bundle] : []; }) });
        if (!dirty.current.size && !settingsChanges(current)) { setReviewState(undefined); setView("edit"); setNotice(withReplaced(replaced.length ? "Nothing left to push." : "Your changes are already on GitHub.")); return; }
      }
      setProgress("Preparing files for GitHub…");
      const { files, pruned } = await preparePush(current);
      if (pruned) await refresh(current);
      if (!Object.keys(files).length) { setNotice(withReplaced("No resource changes to push.")); return; }
      setProgress("Pushing changes…");
      let result: { head: string; tree: string; url: string };
      try {
        result = await api<{ head: string; tree: string; url: string }>("github/push", { owner: current.context.owner, repo: current.context.name, branch: current.context.branch, projectPath: current.context.projectPath, head: current.context.head, files, message: PUSH_MESSAGE });
      } catch (error) {
        if ((error as { status?: number }).status === 409 && attempt < 2) continue;
        throw error;
      }
      capture("changes:commit_create", { message_count: dirty.current.size, language_count: Object.keys(files).filter(path => !path.endsWith("/settings.json")).length });
      current.context.head = result.head; current.context.tree = result.tree;
      Object.assign(current.context.original, files);
      if (current.context.shas) Object.assign(current.context.shas, Object.fromEntries(await Promise.all(Object.entries(files).map(async ([path, content]) => [path, await gitBlobSha(content)]))));
      current.context.bundleBaseline = bundleSignatures([...bundleIndex.current.values()]);
      baseline.current = current.context.bundleBaseline; dirty.current.clear();
      await saveContext(current); setLocal({ ...current }); setReviewState(undefined); setDirtyCount(0); setSettingsDirty(false); setView("edit"); if (replaced.length) setNotice(replacedNotice(replaced));
      // The float shows the push with a link to the commit; pushed to a fork, also the pull request to open.
      setPushed({ commit: result.url, pullRequest: access?.parent ? compareUrl(access.parent, current.context.owner, current.context.name, current.context.branch) : undefined });
      return;
    }
  });
  const terms = useMemo(() => searchTerms(search), [search]);
  // Issues per bundle and locale from the SDK's diagnostics.
  const issuesOf = useCallback((bundle: BundleNested, locale: string): Issue[] =>
    (diagnostics?.byBundle.get(bundle.id) ?? []).filter((diagnostic): diagnostic is Issue => diagnostic.locale === locale && diagnostic.checkId !== "unused-message"), [diagnostics]);
  const todoCounts = useMemo(() => new Map<string, number>(), [bundles, issuesOf]);
  const [mtRequest, setMtRequest] = useState<MachineTranslationRequest>();
  const machineTranslate = useCallback((request: MachineTranslationRequest) => { setMtRequest(request); capture("cloud:interest_button_click", { topic: "machine_translation", step: "open" }); }, []);
  const todoIn = useCallback((locale: string) => {
    let count = todoCounts.get(locale);
    if (count === undefined) { count = bundles.filter(bundle => issuesOf(bundle, locale).length).length; todoCounts.set(locale, count); }
    return count;
  }, [bundles, issuesOf, todoCounts]);
  const projectKey = local ? `${local.context.owner}/${local.context.name}/${local.context.projectPath}` : "";
  useEffect(() => {
    if (!local || focus || !bundles.length || !diagnostics) return;
    setFocus(readFocus(projectKey, local.context.settings.locales, local.context.settings.baseLocale, todoIn));
  }, [local, focus, bundles.length, projectKey, todoIn, diagnostics]);
  const changeFocus = (next: LanguageFocus) => { setFocus(next); writeFocus(projectKey, next); };
  const targetLocales = useMemo(() => !local || !focus ? [] : focus.all ? local.context.settings.locales.filter(locale => locale !== focus.source) : focus.targets, [local, focus]);
  const kindsOf = useCallback((bundle: BundleNested) => new Set(targetLocales.flatMap(locale => issuesOf(bundle, locale).map(issueKind))), [targetLocales, issuesOf]);
  const searched = useMemo(() => bundles.filter(bundle => {
    if (!terms.length) return true;
    let text = searchIndex.current.get(bundle);
    if (text === undefined) { text = searchText(bundle); searchIndex.current.set(bundle, text); }
    return terms.every(term => text.includes(term));
  }), [bundles, terms]);
  const counts = useMemo(() => {
    const result = { all: searched.length, todo: 0, edited: 0, "missing-translation": 0, "missing-form": 0, "empty-form": 0, placeholder: 0 };
    for (const bundle of searched) {
      const kinds = kindsOf(bundle);
      if (kinds.size) result.todo++;
      for (const kind of kinds) result[kind]++;
      if (dirty.current.has(bundle.id)) result.edited++;
    }
    return result;
  }, [searched, kindsOf, dirtyCount]);
  // A card stays in the list while the filter is unchanged, so fixing it doesn't pull it away mid-typing.
  const shown = useRef({ key: "", ids: new Set<string>() });
  const visible = useMemo(() => {
    const key = [filter, todoKind, targetLocales.join(), terms.join(" ")].join("|");
    if (shown.current.key !== key) shown.current = { key, ids: new Set() };
    const { ids } = shown.current;
    const result = searched.filter(bundle => ids.has(bundle.id) ||
      (filter === "all" ? true : filter === "edited" ? dirty.current.has(bundle.id) : todoKind === "all" ? kindsOf(bundle).size > 0 : kindsOf(bundle).has(todoKind)));
    for (const bundle of result) ids.add(bundle.id);
    return result;
  }, [searched, filter, todoKind, kindsOf, dirtyCount, targetLocales, terms]);
  // Words still in the source language, in forms started from it.
  useEffect(() => {
    const root = table.current;
    if (!root) return;
    let frame = requestAnimationFrame(() => markUntranslated(root));
    const observer = new MutationObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => markUntranslated(root)); });
    observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["data-untranslated"] });
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [local, view, focus?.source]);
  useEffect(() => {
    const root = table.current;
    highlightMatches(root, terms);
    if (!root || !terms.length) return;
    // Pattern views render into their shadow roots after this effect.
    let frame = requestAnimationFrame(() => highlightMatches(root, terms));
    const observer = new MutationObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => highlightMatches(root, terms)); });
    observer.observe(root, { subtree: true, childList: true, characterData: true });
    return () => { observer.disconnect(); cancelAnimationFrame(frame); highlightMatches(null, []); };
  }, [terms, visible, page, view, reviewState, local]);
  const totalPages = Math.max(1, Math.ceil(visible.length / 25));
  const currentPage = Math.min(page, totalPages - 1);
  const download = () => void run(async () => {
    if (!local) return;
    await settle();
    if (failure.current) throw new Error("Resolve the failed save before downloading.");
    const blob = await new Response(local.project.lix.exportSnapshot()).blob();
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = href; anchor.download = `${local.context.name}.lix`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  });
  const context = local?.context;
  const codeUrl = context && `https://github.com/${context.owner}/${context.name}/blob/${context.head}`, codeScope = context ? projectScope(context) : "";
  const code = useMemo(() => codeUrl ? { url: codeUrl, scope: codeScope } : undefined, [codeUrl, codeScope]);
  // Results always match the commit shown; a newly created bundle is never reported as unused.
  const usageIndex = usage && usage.key === usageKey ? usage.byBundle : undefined;
  const repositoryUrl = context && `https://github.com/${context.owner}/${context.name}`;
  const commitLink = context && <a className="sha" href={`${repositoryUrl}/commit/${context.head}`} target="_blank" rel="noreferrer" title="Commit your draft is based on">{context.head.slice(0, 7)}</a>;
  const showEditor = () => { setReviewState(undefined); setView("edit"); };
  // After signing in, return to the open project, or to the repository typed on the landing page.
  const signIn = <a className="button" href="/api/auth/login" onClick={() => { try { sessionStorage.setItem("fink:return", location.search || (url.trim() ? `?${new URLSearchParams({ repo: url.trim() })}` : "")); } catch { /* optional */ } }}><GitHubIcon /> Sign in with GitHub</a>;
  const currentAccess = access && access.key === accessKey ? access : undefined;
  const floatMode: FloatMode = !user ? { kind: "signin", signIn }
    : currentAccess && !currentAccess.push ? { kind: "fork", forking, fork: forkRepository }
    : pushed && !pendingCount ? { kind: "pushed", ...pushed, dismiss: () => setPushed(undefined) }
    : { kind: "push" };
  const hasChanges = !!reviewState && (!!reviewState.ids.length || !!reviewState.settings);
  const reviewPanel = reviewState && context && <section className="review-page" aria-labelledby="changes-title">
    <header className="page-header"><div><h2 id="changes-title">Changes {pendingCount > 0 && <span className="badge changed">{pendingCount}</span>}</h2><p>Your local draft compared with <span className="inline-branch"><BranchIcon />{context.branch}</span> at {commitLink}</p></div></header>
    {reviewState.ids.length > 0 && <RichDiff baseline={baseline.current} bundles={reviewState.bundles} bundleIds={reviewState.ids} settings={context.settings} />}
    {reviewState.settings && <SettingsDiff change={reviewState.settings} />}
    {!hasChanges && <div className="empty-state"><h3>No changes to push.</h3><p>Edit a translation or the project settings, and the diff shows up here.</p><button className="primary" onClick={showEditor}>Back to editor</button></div>}
  </section>;
  const others = recent.filter(project => !context || recentKey(project) !== recentKey(context)).slice(0, 5);
  const account = <div className="account">
    <a href="https://github.com/opral/inlang-fink#readme" className="help-link" target="_blank" rel="noreferrer">Help</a>
    <StarButton />
    {user ? <Dropdown className="account-trigger" title="Account" align="end" label={<><img className="avatar" src={`https://github.com/${user.login}.png?size=48`} alt="" width="22" height="22" referrerPolicy="no-referrer" /><span className="account-login">{user.login}</span><Chevron /></>}>
      {close => <><div className="dropdown-heading">Signed in as <strong>{user.login}</strong></div><a className="menu-item" href="https://github.com/apps/inlang/installations/new" target="_blank" rel="noreferrer">Grant repository access</a><button className="menu-item" onClick={() => { close(); void run(async () => { await api("auth/logout", {}); setUser(null); await identify(undefined); }); }}>Sign out</button></>}
    </Dropdown> : signIn}
  </div>;
  const tab = (name: string, active: boolean, onClick: () => void, extra?: React.ReactNode, disabled = false) => <button className={active ? "active" : ""} aria-current={active ? "page" : undefined} disabled={disabled} onClick={onClick}>{name}{extra}</button>;
  return <>
    <header className="app-header"><div className="header-grid">
      <div className="menu-bar">
        {context ? <div className="project-identity">
          <Dropdown className="brand" title="Fink menu" label={<><img src="/🐦.png" alt="" width="20" height="20" />Fink<Chevron /></>}>
            {close => <>
              <button className="menu-item" disabled={busy || saving} onClick={() => { close(); goHome(); }}><RepoIcon />Open another repository…</button>
              {projects.length > 1 && <><div className="dropdown-heading">Projects in this repository</div>{projects.map(project => <button key={project} className="menu-item" aria-current={project === context.projectPath ? "true" : undefined} disabled={busy || saving || project === context.projectPath} onClick={() => { close(); void openLocation(repositoryUrl!, context.branch, project); }}><span className="menu-check">{project === context.projectPath && <CheckIcon />}</span><span className="menu-text">{project}</span></button>)}</>}
              {others.length > 0 && <><div className="dropdown-heading">Recent projects</div>{others.map(project => <button key={recentKey(project)} className="menu-item" disabled={busy || saving} onClick={() => { close(); openRecent(project); }}><img className="menu-avatar" src={`https://github.com/${project.owner}.png?size=32`} alt="" width="16" height="16" referrerPolicy="no-referrer" /><span className="menu-text">{project.owner}/{project.name}</span><span className="menu-hint">{project.branch}</span></button>)}</>}
              <hr />
              <button className="menu-item" disabled={busy || saving} onClick={() => { close(); download(); }}><DownloadIcon />Download project</button>
              <a className="menu-item" href={repositoryUrl} target="_blank" rel="noreferrer"><GitHubIcon />View on GitHub</a>
            </>}
          </Dropdown>
          <span className="separator" aria-hidden="true">/</span>
          <a className="repo-link" href={repositoryUrl} target="_blank" rel="noreferrer" aria-label={`${context.owner}/${context.name} on GitHub`} title={`${context.owner}/${context.name} · ${context.projectPath}`}><span className="repo-owner">{context.owner}/</span><strong>{context.name}</strong></a>
          {context.projectPath !== "project.inlang" && <span className="project-path" title={context.projectPath}>{context.projectPath}</span>}
          <span className="separator" aria-hidden="true">/</span>
          <BranchMenu branch={context.branch} loadBranches={() => loadBranches(context)} switchBranch={switchBranch} disabled={busy || saving} />
        </div> : <a className="brand home-brand" href="/"><img src="/🐦.png" alt="" width="24" height="24" />Fink</a>}
        {account}
      </div>
      {context && <nav className="subnav" aria-label="Project navigation">
        {tab("Edit", !reviewState && view === "edit", showEditor)}
        {tab("Changes", !!reviewState, () => void review(), <span className={pendingCount ? "badge changed" : "badge"}>{pendingCount}</span>, busy || saving)}
        {tab("History", !reviewState && view === "history", () => { setReviewState(undefined); setView("history"); })}
        {tab("Settings", !reviewState && view === "settings", () => { setReviewState(undefined); setView("settings"); })}
        <span className="sync-status"><span role="status" className={saving ? "save-status saving" : failure.current ? "save-status failed" : "save-status"}>{saving ? "Saving…" : failure.current ? "Save failed" : "Draft saved locally"}</span>{usageStatus.state === "loading" && <span className="usage-status">Finding usage in code…</span>}{usageStatus.state === "error" && <span className="usage-status failed" title={usageStatus.error}>Usage in code unavailable</span>}<span className="based-on">based on {commitLink}</span></span>
      </nav>}
    </div></header>
    <main className={context ? "workspace" : "welcome"}>
      {context && <h1 className="visually-hidden">{context.owner}/{context.name} · {reviewState ? "Changes" : view === "history" ? "History" : view === "settings" ? "Settings" : "Edit"}</h1>}
      {context && error && <div role="alert" className="error"><span>{error}</span>{needsSignIn && !user && signIn}<button aria-label="Dismiss error" onClick={() => setError("")}>×</button></div>}
      {context && notice && <p role="status" className="notice">{notice}</p>}
      {busy && <p role="status" className="loading-status"><span className="spinner" aria-hidden="true" />{progress || "Working…"}</p>}
      {!context && <Landing url={url} setUrl={value => { setUrl(value); setRepo(undefined); setTree(undefined); setBranch(""); }} submit={() => void discover()} busy={busy || initializing}
        picker={tree && { tree, branches, branch, path, setBranch, setPath, open: () => void open() }}
        recent={recent} openRecent={openRecent} forget={project => void forgetProject(project)} openShowcase={openShowcase}
        status={<>{error && <div role="alert" className="error"><span>{error}</span>{needsSignIn && !user && signIn}<button aria-label="Dismiss error" onClick={() => setError("")}>×</button></div>}{notice && <p role="status" className="notice">{notice}</p>}</>} />}
      {context && <>
        {reviewPanel || (view === "history" ? <History context={context} pending={pendingCount} review={() => void review()} /> : view === "settings" ? <section className="settings-page"><header className="page-header"><div><h2>Project settings</h2><p className="settings-context"><a href={repositoryUrl} target="_blank" rel="noreferrer">{context.owner}/{context.name}</a> · {context.projectPath} · <span className="inline-branch"><BranchIcon />{context.branch}</span></p></div><button onClick={download} disabled={busy || saving}><DownloadIcon />Download project</button></header><div className="settings-form" inert={busy || saving}><Settings settings={context.settings} revision={settingsRevision} save={saveSettings} /></div><LocalDrafts openName={local?.name} /></section> : <>
        <div className="list-toolbar">
          <div className="toolbar-row">
            <div className="toolbar-group">
              {focus && <LanguageMenu locales={context.settings.locales} baseLocale={context.settings.baseLocale} focus={focus} onChange={changeFocus} todo={todoIn} total={bundles.length} />}
              <div className="segmented" role="group" aria-label="Show">
                {([["all", "All", counts.all], ["todo", "To do", counts.todo], ["edited", "Edited", counts.edited]] as const).map(([value, label, count]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => { setFilter(value); setTodoKind("all"); }}>{label}<span className="count">{count}</span></button>)}
              </div>
            </div>
            <input className="search-input" type="search" aria-label="Search messages" value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="Search messages and keys" />
          </div>
          {filter === "todo" && <div className="chips" role="group" aria-label="Kind of work">
            {([["all", "All to do", counts.todo], ["missing-translation", "Missing translation", counts["missing-translation"]], ["missing-form", "Missing forms", counts["missing-form"]], ["empty-form", "Empty forms", counts["empty-form"]], ["placeholder", "Placeholder problems", counts.placeholder]] as const).map(([value, label, count]) => <button key={value} type="button" aria-pressed={todoKind === value} onClick={() => setTodoKind(value)}>{label} {count}</button>)}
          </div>}
        </div>
        <div className="list-head"><span>{visible.length} {visible.length === 1 ? "message" : "messages"}</span>
          {focus && counts["missing-translation"] > 0 && <button className="mt-bulk" onClick={() => machineTranslate({ source: focus.source, targets: targetLocales.filter(locale => locale !== focus.source), count: counts["missing-translation"] })}><SparkleIcon />Machine translate {counts["missing-translation"]} missing</button>}
          <button onClick={() => setShowNewMessage(!showNewMessage)}>Add message</button></div>
        {mtRequest && <MachineTranslateDialog repository={`${context.owner}/${context.name}`} request={mtRequest} onClose={() => setMtRequest(undefined)} />}
        {showNewMessage && <form className="new-message" onSubmit={event => { event.preventDefault(); create(); }}><input aria-label="New message ID" value={newId} onChange={event => setNewId(event.target.value)} placeholder="New message ID" autoFocus /><button className="primary">Add message</button><button type="button" onClick={() => setShowNewMessage(false)}>Cancel</button></form>}
        <div className="message-table" ref={table} inert={busy}>{focus && visible.slice(currentPage * 25, (currentPage + 1) * 25).map(bundle => <MessageCard key={bundle.id} bundle={bundle} settings={context.settings} focus={focus} diagnostics={diagnostics?.byBundle.get(bundle.id)} change={change} addLocale={addLocale} removeBundle={removeBundle} addVariant={addVariant} addMessage={addMessage} restructure={restructure} removeVariant={removeVariant} machineTranslate={machineTranslate} code={usageIndex && code} usages={usageIndex?.get(bundle.id)} replaced={replacedIds.has(bundle.id)} edited={dirty.current.has(bundle.id)} unused={bundle.id in baseline.current && !!diagnostics?.byBundle.get(bundle.id)?.some(diagnostic => diagnostic.checkId === "unused-message")} />)}
        {!visible.length && <p className="empty">{bundles.length ? "No messages match your filters." : "This project has no messages yet. Add a bundle to get started."}</p>}</div>
        {totalPages > 1 && <nav className="pagination" aria-label="Message pages"><button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage + 1} of {totalPages}</span><button disabled={currentPage + 1 === totalPages} onClick={() => setPage(currentPage + 1)}>Next</button></nav>}
        </>)}
        <LixFloat count={pendingCount} branch={context.branch} saving={saving} busy={busy} reviewing={!!reviewState} review={() => void review()} edit={showEditor}
          push={() => void publish()} mode={floatMode} />
      </>}
    </main>
    <footer><div className="footer-grid"><span>© {new Date().getFullYear()} Opral · Fink is open source · <span title="Fink sends anonymous counts (projects opened, project size, pushes) to help decide what to build. No message text, keys, file names or repository names.">Anonymous usage counts, no content</span></span><span className="footer-links"><a href="https://github.com/opral/inlang-fink" target="_blank" rel="noreferrer">GitHub</a><a href="https://inlang.com" target="_blank" rel="noreferrer">inlang</a><a href="https://github.com/apps/inlang/installations/new" target="_blank" rel="noreferrer">Grant repository access</a></span></div></footer>
  </>;
}
