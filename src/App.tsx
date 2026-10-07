import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BundleNested, ProjectSettings } from "@inlang/sdk/browser";
import type { ChangeEventDetail } from "@inlang/editor-component";
import { LanguageFilter } from "./LanguageFilter";
import { RichDiff } from "./DiffBundleView";
import { Settings, SettingsDiff, type SettingsChange } from "./Settings";
import { validateSettingsEdit } from "./settingsData";
import { LixFloat } from "./LixFloat";
import { Editor } from "./Editor";
import { Landing } from "./Landing";
import { History } from "./History";
import { BranchMenu } from "./BranchMenu";
import { Chevron, Dropdown, DownloadIcon, GitHubIcon, RepoIcon, BranchIcon } from "./Menu";
import type { Showcase } from "./showcases";
import { forgetRecent, readRecent, recentKey, rememberRecent, setRecentPending, type RecentProject } from "./recent";
import { preparePush, openRepositoryProject, readBundle, readBundles, getBaselineSignatures, bundleSignature, bundleSignatures, saveContext, settingsChanges, type LocalProject } from "./project";
import { api, parseRepository, repoQuery, type Repo, type RepoTree } from "./repository";

export default function App() {
  const [url, setUrl] = useState(() => new URLSearchParams(location.search).get("repo") ?? "");
  const [repo, setRepo] = useState<Repo>();
  const [tree, setTree] = useState<RepoTree>();
  const [branches, setBranches] = useState<string[]>([]);
  const [branch, setBranch] = useState(() => new URLSearchParams(location.search).get("branch") ?? "");
  const [path, setPath] = useState(() => new URLSearchParams(location.search).get("project") ?? "");
  const [local, setLocal] = useState<LocalProject>();
  const [bundles, setBundles] = useState<BundleNested[]>([]);
  const [search, setSearch] = useState("");
  const [missing, setMissing] = useState(false);
  const [page, setPage] = useState(0);
  const [user, setUser] = useState<{ login: string } | null>(null);
  const [progress, setProgress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reviewState, setReviewState] = useState<{ ids: string[]; bundles: BundleNested[]; settings?: SettingsChange }>();
  const [message, setMessage] = useState("Update translations with Fink");
  const [description, setDescription] = useState("");
  const [recent, setRecent] = useState<RecentProject[]>(readRecent);
  const [newId, setNewId] = useState("");
  const [view, setView] = useState<"edit" | "settings" | "history">("edit");
  const [selectedLocales, setSelectedLocales] = useState<string[]>([]);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [settingsRevision, setSettingsRevision] = useState(0);
  const [dirtyCount, setDirtyCount] = useState(0);
  const pendingCount = dirtyCount + Number(settingsDirty);
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [saving, setSaving] = useState(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const localRef = useRef<LocalProject | undefined>(undefined);
  const failure = useRef(false);
  const pending = useRef(0);
  const bundleIndex = useRef(new Map<string, BundleNested>());
  const owners = useRef(new Map<string, string>());
  const baseline = useRef<Record<string, string>>({});
  const dirty = useRef(new Set<string>());
  const searchIndex = useRef(new WeakMap<BundleNested, string>());
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
  const report = useCallback((error: unknown) => { setError(error instanceof Error ? error.message : String(error)); }, []);
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
        setUser(await api("user"));
      } catch (error) { report(error); }
      const params = new URLSearchParams(location.search);
      const repository = params.get("repo"), project = params.get("project");
      if (repository && project) void openLocation(repository, params.get("branch") ?? "", project);
    })();
    return () => { void queue.current.then(() => localRef.current?.close()).catch(report); };
  }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (saving || failure.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [saving]);
  useEffect(() => setPage(0), [search, missing, selectedLocales]);
  const enqueue = useCallback((task: () => Promise<void>) => {
    pending.current++;
    setSaving(true);
    queue.current = queue.current.then(task).catch(error => { failure.current = true; report(error); }).finally(() => { pending.current--; setSaving(pending.current > 0); });
  }, [report]);
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
    if (!request) { request = api<string[]>(`github/branches?${repoQuery({ owner: repository.owner, name: repository.name })}`); branchCache.current.set(key, request); request.catch(() => branchCache.current.delete(key)); }
    return request;
  };
  const loadProject = async (repository: Repo, nextTree: RepoTree, projectPath: string, repositoryUrl: string) => {
    await queue.current;
    if (failure.current) throw new Error("Resolve the failed save before switching projects. Your current draft remains open.");
    if (!nextTree.projects.includes(projectPath)) throw new Error("This project does not exist on the selected branch.");
    setReviewState(undefined);
    if (localRef.current) { await localRef.current.close(); localRef.current = undefined; setLocal(undefined); setBundles([]); }
    const next = await openRepositoryProject(repository, nextTree, projectPath, setProgress);
    localRef.current = next; await refresh(next); setLocal(next);
    await navigator.storage.persist();
    setPage(0); setView("edit"); setReviewState(undefined); setSelectedLocales([]); setTree(undefined);
    history.replaceState(null, "", `/?${new URLSearchParams({ repo: repositoryUrl, branch: nextTree.branch, project: projectPath })}`);
    rememberRecent({ owner: repository.owner, name: repository.name, branch: nextTree.branch, projectPath }); setRecent(readRecent());
    if (next.context.head !== nextTree.head) setNotice("Restored your local draft. The remote branch has advanced; pushing will ask you to reconcile first.");
  };
  const open = () => run(async () => {
    if (!repo || !path) return;
    const nextTree = tree?.branch === branch ? tree : await api<RepoTree>(`github/tree?${repoQuery({ ...repo, branch })}`);
    await loadProject(repo, nextTree, path, url);
  });
  const openLocation = (repositoryUrl: string, branchName: string, projectPath: string) => run(async () => {
    const repository = { ...parseRepository(repositoryUrl), branch: branchName || undefined };
    const nextTree = await api<RepoTree>(`github/tree?${repoQuery(repository)}`);
    setUrl(repositoryUrl); setRepo(repository); setBranch(nextTree.branch); setPath(projectPath);
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
  });
  const goHome = () => void run(async () => {
    await queue.current;
    if (failure.current) throw new Error("Resolve the failed save before closing the project. Your current draft remains open.");
    const current = localRef.current;
    localRef.current = undefined; setLocal(undefined); setBundles([]); setReviewState(undefined); setTree(undefined); setView("edit");
    await current?.close();
    setRecent(readRecent()); history.replaceState(null, "", "/");
  });
  const change = useCallback((detail: ChangeEventDetail) => {
    const local = localRef.current;
    if (!local) return;
    enqueue(async () => {
      const data = detail.newData;
      const bundleId = detail.entity === "bundle" ? detail.entityId : owners.current.get(`${detail.entity}:${detail.entityId}`) ?? (detail.entity === "message" && data ? (data as BundleNested["messages"][number]).bundleId : detail.entity === "variant" && data ? owners.current.get(`message:${(data as BundleNested["messages"][number]["variants"][number]).messageId}`) : undefined);
      if (!bundleId) throw new Error("The edited message could not be located. Reload the project to inspect your saved draft.");
      if (data) {
        // Strip nested UI data; the SDK stores three separate tables.
        if (detail.entity === "bundle") {
          const value = data as BundleNested;
          await local.project.db.insertInto("bundle").values({ id: value.id, declarations: value.declarations }).onConflict(oc => oc.column("id").doUpdateSet({ declarations: value.declarations })).execute();
        } else if (detail.entity === "message") {
          const value = data as BundleNested["messages"][number];
          await local.project.db.insertInto("message").values({ id: value.id, bundleId: value.bundleId, locale: value.locale, selectors: value.selectors }).onConflict(oc => oc.column("id").doUpdateSet({ selectors: value.selectors })).execute();
        } else {
          const value = data as BundleNested["messages"][number]["variants"][number];
          await local.project.db.insertInto("variant").values(value).onConflict(oc => oc.column("id").doUpdateSet({ pattern: value.pattern, matches: value.matches })).execute();
        }
      } else await local.project.db.deleteFrom(detail.entity).where("id", "=", detail.entityId).execute();
      await refresh(local, bundleId);
    });
  }, [enqueue, refresh]);
  const addLocale = useCallback((bundle: BundleNested, locale: string) => {
    const local = localRef.current;
    if (!local) return;
    enqueue(async () => {
      const id = crypto.randomUUID();
      await local.project.db.transaction().execute(async tx => {
        await tx.insertInto("message").values({ id, bundleId: bundle.id, locale, selectors: [] }).execute();
        await tx.insertInto("variant").values({ id: crypto.randomUUID(), messageId: id, matches: [], pattern: [] }).execute();
      });
      await refresh(local, bundle.id);
    });
  }, [enqueue, refresh]);
  const removeBundle = useCallback((id: string) => {
    const local = localRef.current;
    if (!local || !confirm(`Delete message ${id} in every locale?`)) return;
    enqueue(async () => {
      await local.project.db.transaction().execute(async tx => {
        const messages = await tx.selectFrom("message").select("id").where("bundleId", "=", id).execute();
        for (const message of messages) await tx.deleteFrom("variant").where("messageId", "=", message.id).execute();
        await tx.deleteFrom("message").where("bundleId", "=", id).execute();
        await tx.deleteFrom("bundle").where("id", "=", id).execute();
      });
      await refresh(local, id);
    });
  }, [enqueue, refresh]);
  const create = () => {
    if (!local || !newId.trim()) return;
    const id = newId.trim();
    enqueue(async () => {
      await local.project.db.insertInto("bundle").values({ id, declarations: [] }).execute();
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
        setSelectedLocales(previous => previous.filter(locale => settings.locales.includes(locale)));
      } finally { setSettingsRevision(value => value + 1); }
    });
  };
  useEffect(() => { if (local) setRecentPending(local.context, pendingCount); }, [local, pendingCount]);
  const review = async () => {
    if (!local) return;
    setError("");
    try {
      await queue.current;
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
    if (!local || (!reviewState || (!reviewState.ids.length && !reviewState.settings))) return;
    await queue.current;
    if (failure.current) throw new Error("A local save failed. Reload the page before pushing.");
    setProgress("Preparing files for GitHub…");
    const { files, resources } = await preparePush(local);
    if (!Object.keys(files).length) { setNotice("No resource changes to push."); return; }
    setProgress("Pushing changes…");
    const commitMessage = description.trim() ? `${message.trim()}\n\n${description.trim()}` : message.trim();
    const result = await api<{ head: string; tree: string; url: string }>("github/push", { owner: local.context.owner, repo: local.context.name, branch: local.context.branch, projectPath: local.context.projectPath, head: local.context.head, files, message: commitMessage });
    local.context.head = result.head; local.context.tree = result.tree;
    Object.assign(local.context.original, files); local.context.baseline = resources;
    local.context.bundleBaseline = bundleSignatures([...bundleIndex.current.values()]);
    baseline.current = local.context.bundleBaseline; dirty.current.clear();
    await saveContext(local); setReviewState(undefined); setDirtyCount(0); setSettingsDirty(false); setView("edit"); setDescription(""); setNotice(`Pushed to ${local.context.branch}. Commit: ${result.url}`);
  });
  const visible = useMemo(() => bundles.filter(bundle => {
    if (search) {
      let text = searchIndex.current.get(bundle);
      if (text === undefined) { text = JSON.stringify(bundle).toLowerCase(); searchIndex.current.set(bundle, text); }
      if (!text.includes(search.toLowerCase())) return false;
    }
    return !missing || local?.context.settings.locales.some(locale => !bundle.messages.some(message => message.locale === locale));
  }), [bundles, search, missing, local]);
  const totalPages = Math.max(1, Math.ceil(visible.length / 25));
  const currentPage = Math.min(page, totalPages - 1);
  const download = () => void run(async () => {
    if (!local) return;
    await queue.current;
    if (failure.current) throw new Error("Resolve the failed save before downloading.");
    const blob = await new Response(local.project.lix.exportSnapshot()).blob();
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = href; anchor.download = `${local.context.name}.lix`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  });
  const context = local?.context;
  const repositoryUrl = context && `https://github.com/${context.owner}/${context.name}`;
  const commitLink = context && <a className="sha" href={`${repositoryUrl}/commit/${context.head}`} target="_blank" rel="noreferrer" title="Commit your draft is based on">{context.head.slice(0, 7)}</a>;
  const showEditor = () => { setReviewState(undefined); setView("edit"); };
  const signIn = <a className="button" href="/api/auth/login" onClick={() => { try { sessionStorage.setItem("fink:return", location.search); } catch { /* optional */ } }}><GitHubIcon /> Sign in with GitHub</a>;
  const hasChanges = !!reviewState && (!!reviewState.ids.length || !!reviewState.settings);
  const reviewPanel = reviewState && context && <section className="review-page" aria-labelledby="changes-title">
    <header className="page-header"><div><h2 id="changes-title">Changes <span className={pendingCount ? "badge changed" : "badge"}>{pendingCount}</span></h2><p>Your local draft compared with <span className="inline-branch"><BranchIcon />{context.branch}</span> at {commitLink}</p></div><button onClick={showEditor}>Back to editor</button></header>
    {reviewState.ids.length > 0 && <RichDiff baseline={baseline.current} bundles={reviewState.bundles} bundleIds={reviewState.ids} settings={context.settings} />}
    {reviewState.settings && <SettingsDiff change={reviewState.settings} />}
    {hasChanges ? <form className="commit-box" aria-labelledby="commit-title" onSubmit={event => { event.preventDefault(); void publish(); }}>
      <h3 id="commit-title">Commit your changes</h3>
      <label>Commit message<input value={message} maxLength={200} onChange={event => setMessage(event.target.value)} required /></label>
      <label><span className="label-row">Description <span className="optional">optional</span></span><textarea value={description} maxLength={700} rows={3} placeholder="Explain why these translations changed" onChange={event => setDescription(event.target.value)} /></label>
      <div className="commit-footer">
        <span className="commit-target"><RepoIcon />{context.owner}/{context.name}<BranchIcon />{context.branch}</span>
        {user ? <button className="commit" disabled={busy || !message.trim()}>Commit and push to {context.branch}</button> : signIn}
      </div>
      {!user && <p className="commit-hint">Sign in with GitHub to push. Your draft stays saved in this browser.</p>}
    </form> : <div className="empty-state"><h3>No changes to push.</h3><p>Edit a translation or the project settings, and the diff shows up here.</p><button onClick={showEditor}>Back to editor</button></div>}
  </section>;
  const others = recent.filter(project => !context || recentKey(project) !== recentKey(context)).slice(0, 5);
  const account = <div className="account">
    <a href="https://github.com/opral/inlang-fink#readme" className="help-link" target="_blank" rel="noreferrer">Help</a>
    {user ? <Dropdown className="account-trigger" title="Account" align="end" label={<><img className="avatar" src={`https://github.com/${user.login}.png?size=48`} alt="" width="22" height="22" referrerPolicy="no-referrer" /><span className="account-login">{user.login}</span><Chevron /></>}>
      {close => <><div className="dropdown-heading">Signed in as <strong>{user.login}</strong></div><a className="menu-item" href="https://github.com/apps/inlang/installations/new" target="_blank" rel="noreferrer">Grant repository access</a><button className="menu-item" onClick={() => { close(); void run(async () => { await api("auth/logout", {}); setUser(null); }); }}>Sign out</button></>}
    </Dropdown> : signIn}
  </div>;
  const tab = (name: string, active: boolean, onClick: () => void, extra?: React.ReactNode, disabled = false) => <button className={active ? "active" : ""} aria-current={active ? "page" : undefined} disabled={disabled} onClick={onClick}>{name}{extra}</button>;
  return <>
    <header className="app-header"><div className="header-grid">
      <div className="menu-bar">
        {context ? <div className="project-identity">
          <Dropdown className="brand" title="Fink menu" label={<><img src="/🐦.png" alt="" width="20" height="20" />Fink<Chevron /></>}>
            {close => <>
              <button className="menu-item" onClick={() => { close(); goHome(); }}>Open another repository…</button>
              {others.length > 0 && <><div className="dropdown-heading">Recent projects</div>{others.map(project => <button key={recentKey(project)} className="menu-item" disabled={busy} onClick={() => { close(); openRecent(project); }}><span className="menu-text">{project.owner}/{project.name}</span><span className="menu-hint">{project.branch}</span></button>)}</>}
              <hr />
              <button className="menu-item" disabled={busy || saving} onClick={() => { close(); download(); }}><DownloadIcon />Download project</button>
              <a className="menu-item" href={repositoryUrl} target="_blank" rel="noreferrer"><GitHubIcon />View on GitHub</a>
            </>}
          </Dropdown>
          <span className="separator" aria-hidden="true">/</span>
          <a className="repo-link" href={repositoryUrl} target="_blank" rel="noreferrer" title={`${context.owner}/${context.name} · ${context.projectPath}`}><span className="repo-owner">{context.owner}/</span><strong>{context.name}</strong></a>
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
        <span className="sync-status"><span role="status" className={saving ? "save-status saving" : failure.current ? "save-status failed" : "save-status"}>{saving ? "Saving…" : failure.current ? "Save failed" : "Draft saved locally"}</span><span className="based-on">based on {commitLink}</span></span>
      </nav>}
    </div></header>
    <main className={context ? "workspace" : "welcome"}>
      {context && error && <div role="alert" className="error">{error}<button aria-label="Dismiss error" onClick={() => setError("")}>×</button></div>}
      {context && notice && <p role="status" className="notice">{notice}</p>}
      {busy && <p role="status" className="loading-status"><span className="spinner" aria-hidden="true" />{progress || "Working…"}</p>}
      {!context && <Landing url={url} setUrl={value => { setUrl(value); setRepo(undefined); setTree(undefined); setBranch(""); }} submit={() => void discover()} busy={busy}
        picker={tree && { tree, branches, branch, path, setBranch, setPath, open: () => void open() }}
        recent={recent} openRecent={openRecent} forget={project => setRecent(forgetRecent(project))} openShowcase={openShowcase}
        status={<>{error && <div role="alert" className="error">{error}<button aria-label="Dismiss error" onClick={() => setError("")}>×</button></div>}{notice && <p role="status" className="notice">{notice}</p>}</>} />}
      {context && <>
        {reviewPanel || (view === "history" ? <History context={context} pending={pendingCount} review={() => void review()} /> : view === "settings" ? <section className="settings-page"><header className="page-header"><div><h2>Project settings</h2><p className="settings-context"><a href={repositoryUrl} target="_blank" rel="noreferrer">{context.owner}/{context.name}</a> · {context.projectPath} · <span className="inline-branch"><BranchIcon />{context.branch}</span></p></div><button onClick={download} disabled={busy || saving}><DownloadIcon />Download project</button></header><div className="settings-form" inert={busy || saving}><Settings settings={context.settings} revision={settingsRevision} save={saveSettings} /></div></section> : <>
        <div className="filter-section"><div className="filter-buttons"><LanguageFilter locales={context.settings.locales} baseLocale={context.settings.baseLocale} selected={selectedLocales} onChange={setSelectedLocales} /><button className={missing ? "filter-active" : ""} aria-pressed={missing} onClick={() => setMissing(!missing)}>Missing translations</button></div><input className="search-input" type="search" aria-label="Search messages" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search…" /></div>
        <div className="table-header"><span>{visible.length} {visible.length === 1 ? "Bundle" : "Bundles"}</span><button onClick={() => setShowNewMessage(!showNewMessage)}>Add new bundle</button></div>
        {showNewMessage && <form className="new-message" onSubmit={event => { event.preventDefault(); create(); }}><input aria-label="New message ID" value={newId} onChange={event => setNewId(event.target.value)} placeholder="New message ID" autoFocus /><button className="primary">Add message</button><button type="button" onClick={() => setShowNewMessage(false)}>Cancel</button></form>}
        <div className="message-table" inert={busy}>{visible.slice(currentPage * 25, (currentPage + 1) * 25).map(bundle => <Editor key={bundle.id} bundle={bundle} settings={context.settings} locales={selectedLocales} change={change} addLocale={addLocale} removeBundle={removeBundle} />)}
        {!visible.length && <p className="empty">{bundles.length ? "No messages match your filters." : "This project has no messages yet. Add a bundle to get started."}</p>}</div>
        {totalPages > 1 && <nav className="pagination" aria-label="Message pages"><button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage + 1} of {totalPages}</span><button disabled={currentPage + 1 === totalPages} onClick={() => setPage(currentPage + 1)}>Next</button></nav>}
        </>)}
        {!reviewState && <LixFloat count={pendingCount} branch={context.branch} saving={saving} review={() => void review()} disabled={busy || saving} />}
      </>}
    </main>
    <footer><div className="footer-grid"><span>© {new Date().getFullYear()} Opral · Fink is open source</span><span className="footer-links"><a href="https://github.com/opral/inlang-fink" target="_blank" rel="noreferrer">GitHub</a><a href="https://inlang.com" target="_blank" rel="noreferrer">inlang</a><a href="https://github.com/apps/inlang/installations/new" target="_blank" rel="noreferrer">Grant repository access</a></span></div></footer>
  </>;
}
