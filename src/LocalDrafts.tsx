import { useEffect, useState } from "react";
import { deleteDraft, draftUsage, readDrafts, registerExisting, storedDrafts, type Draft } from "./drafts";
import { timeAgo } from "./recent";

const size = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
type Row = Draft & { bytes: number };

/** Every draft stored in this browser, with its size, and a way to delete the ones not needed. */
export function LocalDrafts({ openName }: { openName?: string }) {
  const [rows, setRows] = useState<Row[]>();
  const [total, setTotal] = useState<number>();
  const [error, setError] = useState("");
  const load = async () => {
    await registerExisting(openName);
    const drafts = readDrafts(), names = await storedDrafts();
    const list = await Promise.all(names.map(async name => ({ ...(drafts[name] ?? { name, owner: "", repo: "", branch: "", projectPath: "", lastOpened: 0, pending: -1 }), bytes: (await draftUsage(name)).bytes })));
    setRows(list.sort((a, b) => Number(b.name === openName) - Number(a.name === openName) || b.lastOpened - a.lastOpened));
    setTotal((await navigator.storage.estimate()).usage);
  };
  useEffect(() => { void load().catch(reason => setError(String(reason))); }, [openName]);
  const remove = async (row: Row) => {
    const label = row.owner ? `${row.owner}/${row.repo} · ${row.branch}` : "this draft";
    if (row.pending !== 0 && !confirm(row.pending > 0 ? `${row.pending} unpushed ${row.pending === 1 ? "change" : "changes"} in ${label} will be lost. Delete the local draft?` : `${label} may have unpushed changes. Delete the local draft?`)) return;
    setError("");
    if ((await deleteDraft(row.name)) === "in-use") setError(`${label} is open in another tab. Close it there first.`);
    await load();
  };
  return <section className="local-drafts" aria-labelledby="local-drafts-heading">
    <header>
      <h3 id="local-drafts-heading">Local drafts</h3>
      <p>Drafts are stored in this browser, one per repository, branch and project. Drafts without unpushed changes are deleted after 30 days unused or when their branch is deleted on GitHub.{total !== undefined && <> Fink uses {size(total)} in this browser.</>}</p>
    </header>
    {error && <p className="local-drafts-error" role="alert">{error}</p>}
    {!rows ? <p className="muted">Reading local drafts…</p> : !rows.length ? <p className="muted">No local drafts.</p> :
      <ul>
        {rows.map(row => <li key={row.name}>
          <div className="local-draft-name">{row.owner ? <><b>{row.owner}/{row.repo}</b> <span className="mono">{row.projectPath}</span> · {row.branch}</> : <span className="muted">Unknown draft</span>}</div>
          <div className="local-draft-meta">
            {row.pending > 0 ? <span className="todo">{row.pending} unpushed {row.pending === 1 ? "change" : "changes"}</span> : row.pending === 0 ? "No unpushed changes" : "Changes unknown"}
            {row.lastOpened > 0 && <> · opened {timeAgo(row.lastOpened)}</>} · {size(row.bytes)}
          </div>
          {row.name === openName ? <span className="muted local-draft-open">Open now</span> : <button type="button" onClick={() => void remove(row)}>Delete</button>}
        </li>)}
      </ul>}
  </section>;
}
