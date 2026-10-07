import { useEffect, useState } from "react";
import { api, projectScope, repoQuery, type RepoContext } from "./repository";
import { timeAgo } from "./recent";
import { BranchIcon } from "./Menu";

type Commit = { sha: string; url: string; message: string; author: string; avatar?: string; date?: string };

export function History({ context, pending, review }: { context: RepoContext; pending: number; review: () => void }) {
  const [commits, setCommits] = useState<Commit[]>();
  const [error, setError] = useState("");
  const [base, setBase] = useState(context.head);
  const scope = projectScope(context);
  useEffect(() => {
    let live = true;
    setCommits(undefined); setError("");
    const path = scope ? `&path=${encodeURIComponent(scope)}` : "";
    setBase(context.head);
    api<Commit[]>(`github/commits?${repoQuery(context)}${path}`).then(async value => {
      // Path-scoped lists skip commits outside the project, so the draft head may be absent.
      // The newest project commit reachable from the head is the state the draft started from.
      if (scope && !value.some(commit => commit.sha === context.head)) {
        const [atBase] = await api<Commit[]>(`github/commits?${repoQuery({ ...context, branch: context.head })}${path}`).catch(() => []);
        if (live && atBase) setBase(atBase.sha);
      }
      if (live) setCommits(value);
    }, (error: unknown) => { if (live) setError(error instanceof Error ? error.message : String(error)); });
    return () => { live = false; };
  }, [context.owner, context.name, context.branch, context.head, scope]);
  const repository = `https://github.com/${context.owner}/${context.name}`;
  return <section className="history-page" aria-labelledby="history-title">
    <header className="page-header"><div><h2 id="history-title">History</h2><p>Commits on <span className="inline-branch"><BranchIcon />{context.branch}</span>{scope && <> that touch <code>{scope}/</code></>}</p></div><a className="button" href={`${repository}/commits/${encodeURIComponent(context.branch)}${scope ? `/${scope.split("/").map(encodeURIComponent).join("/")}` : ""}`} target="_blank" rel="noreferrer">View on GitHub</a></header>
    <ol className="timeline">
      <li className={pending ? "timeline-entry draft" : "timeline-entry draft clean"}>
        <span className="timeline-node" aria-hidden="true" />
        <span className="avatar placeholder draft-icon" aria-hidden="true" />
        <div className="timeline-body"><strong>Local draft</strong><span>{pending ? `${pending} unpushed ${pending === 1 ? "change" : "changes"} saved in this browser` : "No unpushed changes"}</span></div>
        {pending > 0 && <button onClick={review}>Review changes</button>}
      </li>
      {error && <li className="timeline-message" role="alert">{error}</li>}
      {!commits && !error && <li className="timeline-message" role="status">Loading commits…</li>}
      {commits?.length === 0 && <li className="timeline-message">No commits found for this project.</li>}
      {commits?.map(commit => {
        const [summary, ...body] = commit.message.split("\n");
        return <li key={commit.sha} className={commit.sha === base ? "timeline-entry base" : "timeline-entry"}>
          <span className="timeline-node" aria-hidden="true" />
          {commit.avatar ? <img className="avatar" src={`${commit.avatar}${commit.avatar.includes("?") ? "&" : "?"}s=40`} alt="" width="20" height="20" referrerPolicy="no-referrer" /> : <span className="avatar placeholder" aria-hidden="true" />}
          <div className="timeline-body">
            <strong title={body.join("\n").trim() || undefined}>{summary}</strong>
            <span>{commit.author}{commit.date ? ` committed ${timeAgo(commit.date)}` : ""}</span>
          </div>
          {commit.sha === base && <span className="tag">Draft base</span>}
          <a className="sha" href={commit.url} target="_blank" rel="noreferrer" aria-label={`Commit ${commit.sha.slice(0, 7)} on GitHub`}>{commit.sha.slice(0, 7)}</a>
        </li>;
      })}
    </ol>
  </section>;
}
