import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BundleNested, ProjectSettings } from "@inlang/sdk/browser";
import type { ChangeEventDetail } from "@inlang/editor-component";
import { LanguageFilter } from "./LanguageFilter";
import { RichDiff } from "./DiffBundleView";
import { Settings, SettingsDiff, type SettingsChange } from "./Settings";
import { validateSettingsEdit } from "./settingsData";
import { LixFloat } from "./LixFloat";
import { Editor } from "./Editor";
import { Showcases } from "./Showcases";
import type { Showcase } from "./showcases";
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
  const [newId, setNewId] = useState("");
  const [view, setView] = useState<"edit" | "settings">("edit");
  const [projectMenu, setProjectMenu] = useState(false);
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
        }
        setUser(await api("user"));
      } catch (error) { report(error); }
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
    const available = await api<string[]>(`github/branches?${repoQuery(parsed)}`);
    if (!next.projects.length) throw new Error("No unpacked project.inlang/settings.json found in this repository.");
    setRepo(parsed); setTree(next); setBranches(available); setBranch(next.branch); setPath(next.projects.includes(path) ? path : next.projects[0]);
  });
  const loadProject = async (repository: Repo, nextTree: RepoTree, projectPath: string, repositoryUrl: string) => {
    await queue.current;
    if (failure.current) throw new Error("Resolve the failed save before switching projects. Your current draft remains open.");
    if (!nextTree.projects.includes(projectPath)) throw new Error("This project does not exist on the selected branch.");
    setReviewState(undefined);
    if (localRef.current) { await localRef.current.close(); localRef.current = undefined; setLocal(undefined); setBundles([]); }
    const next = await openRepositoryProject(repository, nextTree, projectPath, setProgress);
    localRef.current = next; await refresh(next); setLocal(next);
    await navigator.storage.persist();
    setPage(0); setView("edit"); setReviewState(undefined); setSelectedLocales([]); setProjectMenu(false);
    history.replaceState(null, "", `/?${new URLSearchParams({ repo: repositoryUrl, branch: nextTree.branch, project: projectPath })}`);
    if (next.context.head !== nextTree.head) setNotice("Restored your local draft. The remote branch has advanced; pushing will ask you to reconcile first.");
  };
  const open = () => run(async () => {
    if (!repo || !path) return;
    const nextTree = tree?.branch === branch ? tree : await api<RepoTree>(`github/tree?${repoQuery({ ...repo, branch })}`);
    await loadProject(repo, nextTree, path, url);
  });
  const openShowcase = (showcase: Showcase) => void run(async () => {
    const repositoryUrl = `https://github.com/${showcase.repository}`;
    const repository = { ...parseRepository(repositoryUrl), branch: showcase.branch };
    const nextTree = await api<RepoTree>(`github/tree?${repoQuery(repository)}`);
    setUrl(repositoryUrl); setRepo(repository); setTree(nextTree); setBranch(nextTree.branch); setBranches([nextTree.branch]); setPath(showcase.projectPath);
    await loadProject(repository, nextTree, showcase.projectPath, repositoryUrl);
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
    const result = await api<{ head: string; tree: string; url: string }>("github/push", { owner: local.context.owner, repo: local.context.name, branch: local.context.branch, projectPath: local.context.projectPath, head: local.context.head, files, message });
    local.context.head = result.head; local.context.tree = result.tree;
    Object.assign(local.context.original, files); local.context.baseline = resources;
    local.context.bundleBaseline = bundleSignatures([...bundleIndex.current.values()]);
    baseline.current = local.context.bundleBaseline; dirty.current.clear();
    await saveContext(local); setReviewState(undefined); setDirtyCount(0); setSettingsDirty(false); setView("edit"); setNotice(`Pushed to ${local.context.branch}. Commit: ${result.url}`);
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
  const reviewPanel = reviewState && <section className="review-page review" role="dialog" aria-label="Review changes"><header><h2>Changes <span className="badge">{pendingCount}</span></h2><button onClick={() => setReviewState(undefined)}>Close</button></header><RichDiff baseline={baseline.current} bundles={reviewState.bundles} bundleIds={reviewState.ids} settings={local!.context.settings} />{reviewState.settings && <SettingsDiff change={reviewState.settings} />}{reviewState.ids.length || reviewState.settings ? <><label>Commit message<input value={message} onChange={event => setMessage(event.target.value)} /></label><button className="primary" disabled={busy || !user || !message.trim()} onClick={() => void publish()}>Push changes to {local?.context.branch}</button>{!user && <p>Sign in with GitHub to push. Your draft is saved locally.</p>}</> : <p>No changes to push.</p>}</section>;
  return <>
    <header className="app-header"><div className="header-grid"><div className="menu-bar">
      <div className="project-identity"><button className="brand" onClick={() => setProjectMenu(!projectMenu)}>Fink <span className="chevron">⌄</span></button><span className="separator">/</span><button className="project-switch" onClick={() => setProjectMenu(!projectMenu)}>{local ? local.context.name : "no project"}<span className="chevron">⌄</span></button>{local && <span className="branch-badge">⑂ {local.context.branch}</span>}</div>
      <div className="account"><a href="https://github.com/opral/inlang-fink" className="help-link">Help</a>{user ? <><span>{user.login}</span><button onClick={() => run(async () => { await api("auth/logout", {}); setUser(null); })}>Sign out</button></> : <a className="button" href="/api/auth/login">Sign in with GitHub</a>}</div>
    </div>{local && <nav className="subnav" aria-label="Project navigation"><button className={!reviewState && view === "edit" ? "active" : ""} onClick={() => { setReviewState(undefined); setView("edit"); }}>Edit</button><button className={reviewState ? "active" : ""} disabled={busy || saving} onClick={() => void review()}>Changes <span className={pendingCount ? "badge changed" : "badge"}>{pendingCount}</span></button><button className={!reviewState && view === "settings" ? "active" : ""} onClick={() => { setReviewState(undefined); setView("settings"); }}>Settings</button><span role="status" className="save-status">{saving ? "Saving…" : failure.current ? "Save failed" : "Draft saved locally"}</span></nav>}</div></header>
    <main className={local ? "workspace" : "welcome"}>
      {(!local || projectMenu) && <div className={local ? "project-popover" : ""}>
      <section className="launcher"><h1>{local ? "Open a repository" : "Make yourself understood."}</h1><p>Translate messages, variables, and plurals. Drafts stay in this browser until you push.</p>
        {local && <button className="launcher-close" aria-label="Close project menu" onClick={() => setProjectMenu(false)}>×</button>}
        <form onSubmit={event => { event.preventDefault(); void discover(); }} className="repo-form"><label>GitHub repository<input value={url} onChange={event => { setUrl(event.target.value); setRepo(undefined); setTree(undefined); setBranch(""); }} placeholder="https://github.com/owner/repository" required /></label><button disabled={busy}>Find projects</button></form>
        {tree && <div className="project-form"><label>Branch<select value={branch} onChange={event => setBranch(event.target.value)}>{branches.map(branch => <option key={branch}>{branch}</option>)}</select></label><label>Project<select value={path} onChange={event => setPath(event.target.value)}>{tree.projects.map(path => <option key={path}>{path}</option>)}</select></label><button disabled={busy} onClick={() => void open()}>Open project</button></div>}
      </section>
      </div>}
      {error && <div role="alert" className="error">{error}<button aria-label="Dismiss error" onClick={() => setError("")}>×</button></div>}
      {notice && <p role="status" className="notice">{notice}</p>}
      {busy && <p role="status" className="loading-status">{progress || "Working…"}</p>}
      {!local && <Showcases open={openShowcase} busy={busy} />}
      {local && <>
        {reviewPanel || (view === "settings" ? <section className="settings-page"><h2>Project settings</h2><p className="settings-context"><a href={`https://github.com/${local.context.owner}/${local.context.name}`}>{local.context.owner}/{local.context.name}</a> / {local.context.projectPath} · {local.context.branch}</p><div className="settings-form" inert={busy || saving}><Settings settings={local.context.settings} revision={settingsRevision} save={saveSettings} /></div><div className="settings-actions"><button onClick={() => setProjectMenu(true)}>Switch project</button><button onClick={download} disabled={busy || saving}>Download project</button></div></section> : <>
        <div className="filter-section"><div className="filter-buttons"><LanguageFilter locales={local.context.settings.locales} baseLocale={local.context.settings.baseLocale} selected={selectedLocales} onChange={setSelectedLocales} /><button className={missing ? "filter-active" : ""} aria-pressed={missing} onClick={() => setMissing(!missing)}>Missing translations</button></div><input className="search-input" aria-label="Search messages" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search…" /></div>
        <div className="table-header"><span>{visible.length} Bundles</span><button onClick={() => setShowNewMessage(!showNewMessage)}>Add new bundle</button></div>
        {showNewMessage && <form className="new-message" onSubmit={event => { event.preventDefault(); create(); }}><input aria-label="New message ID" value={newId} onChange={event => setNewId(event.target.value)} placeholder="New message ID" autoFocus /><button>Add message</button><button type="button" onClick={() => setShowNewMessage(false)}>Cancel</button></form>}
        <div className="message-table" inert={busy}>{visible.slice(currentPage * 25, (currentPage + 1) * 25).map(bundle => <Editor key={bundle.id} bundle={bundle} settings={local.context.settings} locales={selectedLocales} change={change} addLocale={addLocale} removeBundle={removeBundle} />)}</div>
        {totalPages > 1 && <nav className="pagination" aria-label="Message pages"><button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage + 1} of {totalPages}</span><button disabled={currentPage + 1 === totalPages} onClick={() => setPage(currentPage + 1)}>Next</button></nav>}
        {!visible.length && <p className="empty">No messages match. Add a message to get started.</p>}
        </>)}
        {!reviewState && <LixFloat count={pendingCount} review={() => void review()} download={download} disabled={busy || saving} />}
      </>}
    </main>
    <footer>Fink · Open source · <a href="https://github.com/opral/inlang-fink">GitHub</a> · <a href="https://github.com/apps/inlang/installations/new">Grant repository access</a></footer>
  </>;
}
