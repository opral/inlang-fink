import { useEffect, useRef, useState } from "react";
import type { BundleNested } from "@inlang/sdk/browser";
import type { ChangeEventDetail } from "@inlang/editor-component";
import { Editor } from "./Editor";
import { exportChanges, exportResources, openRepositoryProject, readBundles, saveContext, type LocalProject } from "./project";
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
  const [user, setUser] = useState<{ login: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [changes, setChanges] = useState<Record<string, string>>();
  const [message, setMessage] = useState("Update translations with Fink");
  const [newId, setNewId] = useState("");
  const [saving, setSaving] = useState(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const localRef = useRef<LocalProject | undefined>(undefined);
  const failure = useRef(false);
  const pending = useRef(0);
  const refresh = async (current: LocalProject) => setBundles(await readBundles(current.project));
  const report = (error: unknown) => { setError(error instanceof Error ? error.message : String(error)); };
  const run = async (task: () => Promise<void>) => { setBusy(true); setError(""); setNotice(""); try { await task(); } catch (error) { report(error); } finally { setBusy(false); } };
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
  const enqueue = (task: () => Promise<void>) => {
    pending.current++;
    setSaving(true);
    queue.current = queue.current.then(task).catch(error => { failure.current = true; report(error); }).finally(() => { pending.current--; setSaving(pending.current > 0); });
  };
  const discover = () => run(async () => {
    const parsed = parseRepository(url); parsed.branch = branch || undefined;
    const next = await api<RepoTree>(`github/tree?${repoQuery(parsed)}`);
    const available = await api<string[]>(`github/branches?${repoQuery(parsed)}`);
    if (!next.projects.length) throw new Error("No unpacked project.inlang/settings.json found in this repository.");
    setRepo(parsed); setTree(next); setBranches(available); setBranch(next.branch); setPath(next.projects.includes(path) ? path : next.projects[0]);
  });
  const open = () => run(async () => {
    if (!repo || !path) return;
    await queue.current;
    if (failure.current) throw new Error("Resolve the failed save before switching projects. Your current draft remains open.");
    const nextTree = tree?.branch === branch ? tree : await api<RepoTree>(`github/tree?${repoQuery({ ...repo, branch })}`);
    if (!nextTree.projects.includes(path)) throw new Error("This project does not exist on the selected branch.");
    if (localRef.current) { await localRef.current.close(); localRef.current = undefined; setLocal(undefined); }
    const next = await openRepositoryProject(repo, nextTree, path);
    localRef.current = next; setLocal(next); await refresh(next);
    await navigator.storage.persist();
    history.replaceState(null, "", `/?${new URLSearchParams({ repo: url, branch, project: path })}`);
    if (next.context.head !== nextTree.head) setNotice("Restored your local draft. The remote branch has advanced; pushing will ask you to reconcile first.");
  });
  const change = (detail: ChangeEventDetail) => {
    if (!local) return;
    enqueue(async () => {
      const data = detail.newData;
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
      await refresh(local);
    });
  };
  const addLocale = (bundle: BundleNested, locale: string) => {
    if (!local) return;
    enqueue(async () => {
      const id = crypto.randomUUID();
      await local.project.db.transaction().execute(async tx => {
        await tx.insertInto("message").values({ id, bundleId: bundle.id, locale, selectors: [] }).execute();
        await tx.insertInto("variant").values({ id: crypto.randomUUID(), messageId: id, matches: [], pattern: [] }).execute();
      });
      await refresh(local);
    });
  };
  const removeBundle = (id: string) => {
    if (!local || !confirm(`Delete message ${id} in every locale?`)) return;
    enqueue(async () => {
      await local.project.db.transaction().execute(async tx => {
        const messages = await tx.selectFrom("message").select("id").where("bundleId", "=", id).execute();
        for (const message of messages) await tx.deleteFrom("variant").where("messageId", "=", message.id).execute();
        await tx.deleteFrom("message").where("bundleId", "=", id).execute();
        await tx.deleteFrom("bundle").where("id", "=", id).execute();
      });
      await refresh(local);
    });
  };
  const create = () => {
    if (!local || !newId.trim()) return;
    const id = newId.trim();
    enqueue(async () => {
      await local.project.db.insertInto("bundle").values({ id, declarations: [] }).execute();
      await refresh(local); setNewId("");
    });
  };
  const review = () => run(async () => { if (!local) return; await queue.current; if (failure.current) throw new Error("A local save failed. Reload the page to inspect the persisted state before pushing."); setChanges(await exportChanges(local)); });
  const publish = () => run(async () => {
    if (!local || !changes || !Object.keys(changes).length) return;
    await queue.current;
    const result = await api<{ head: string; tree: string; url: string }>("github/push", { owner: local.context.owner, repo: local.context.name, branch: local.context.branch, projectPath: local.context.projectPath, head: local.context.head, files: changes, message });
    local.context.head = result.head; local.context.tree = result.tree;
    Object.assign(local.context.original, changes); local.context.baseline = await exportResources(local);
    await saveContext(local); setChanges(undefined); setNotice(`Pushed to ${local.context.branch}. Commit: ${result.url}`);
  });
  const visible = bundles.filter(bundle => (!search || JSON.stringify(bundle).toLowerCase().includes(search.toLowerCase())) && (!missing || local?.context.settings.locales.some(locale => !bundle.messages.some(message => message.locale === locale))));
  return <>
    <header className="topbar"><a href="/" className="brand">🐦 Fink</a><span>Localization editor</span><div className="account">{user ? <><span>{user.login}</span><button onClick={() => run(async () => { await api("auth/logout", {}); setUser(null); })}>Sign out</button></> : <a className="button" href="/api/auth/login">Sign in with GitHub</a>}</div></header>
    <main>
      <section className="launcher"><h1>{local ? `${local.context.owner}/${local.context.name}` : "Open a repository. Make yourself understood."}</h1><p>Translate messages, variables, and plurals. Drafts stay in this browser until you push.</p>
        <form onSubmit={event => { event.preventDefault(); void discover(); }} className="repo-form"><label>GitHub repository<input value={url} onChange={event => { setUrl(event.target.value); setRepo(undefined); setTree(undefined); setBranch(""); }} placeholder="https://github.com/owner/repository" required /></label><button disabled={busy}>Find projects</button></form>
        {tree && <div className="project-form"><label>Branch<select value={branch} onChange={event => setBranch(event.target.value)}>{branches.map(branch => <option key={branch}>{branch}</option>)}</select></label><label>Project<select value={path} onChange={event => setPath(event.target.value)}>{tree.projects.map(path => <option key={path}>{path}</option>)}</select></label><button disabled={busy} onClick={() => void open()}>Open project</button></div>}
      </section>
      {error && <div role="alert" className="error">{error}<button aria-label="Dismiss error" onClick={() => setError("")}>×</button></div>}
      {notice && <p role="status" className="notice">{notice}</p>}
      {busy && <p role="status">Working…</p>}
      {local && <>
        <nav className="editor-toolbar"><label className="search">Search messages<input aria-label="Search messages" value={search} onChange={event => setSearch(event.target.value)} placeholder="Message ID or translation" /></label><label className="checkbox"><input type="checkbox" checked={missing} onChange={event => setMissing(event.target.checked)} />Missing translations</label><span role="status">{saving ? "Saving…" : failure.current ? "Save failed" : "Draft saved locally"}</span><button className="primary" disabled={busy || saving} onClick={() => void review()}>Review and push</button></nav>
        <form className="new-message" onSubmit={event => { event.preventDefault(); create(); }}><input aria-label="New message ID" value={newId} onChange={event => setNewId(event.target.value)} placeholder="New message ID" /><button>Add message</button></form>
        <p className="count">{visible.length} messages · {local.context.settings.locales.join(", ")} · {local.context.branch}</p>
        {visible.map(bundle => <Editor key={bundle.id} bundle={bundle} settings={local.context.settings} change={change} addLocale={addLocale} removeBundle={removeBundle} />)}
        {!visible.length && <p className="empty">No messages match. Add a message to get started.</p>}
      </>}
    </main>
    {changes && <div className="dialog-backdrop"><section className="dialog review" role="dialog" aria-modal="true" aria-label="Review changes"><header><h2>Review changes</h2><button onClick={() => setChanges(undefined)}>Close</button></header>{error && <p role="alert" className="error">{error}</p>}{Object.entries(changes).map(([path, content]) => <details key={path} open><summary>{path}</summary><pre>{content}</pre></details>)}{Object.keys(changes).length ? <><label>Commit message<input value={message} onChange={event => setMessage(event.target.value)} /></label><button className="primary" disabled={busy || !user || !message.trim()} onClick={() => void publish()}>Push {Object.keys(changes).length} files to {local?.context.branch}</button>{!user && <p>Sign in with GitHub to push. Your draft is saved locally.</p>}</> : <p>No changes to push.</p>}</section></div>}
    <footer>Fink · Open source · <a href="https://github.com/opral/inlang-fink">GitHub</a> · <a href="https://github.com/apps/inlang/installations/new">Grant repository access</a></footer>
  </>;
}
