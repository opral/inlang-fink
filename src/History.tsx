import { useEffect, useState } from "react";
import { api, projectScope, repoQuery, type RepoContext } from "./repository";
import { timeAgo } from "./recent";
import { BranchIcon } from "./Menu";

type Commit = { sha: string; url: string; message: string; author: string; avatar?: string; date?: string };

export function History({ context, pending, review }: { context: RepoContext; pending: number; review: () => void }) {
  const [commits, setCommits] = useState<Commit[]>();
  const [error, setError] = useState("");
  const scope = projectScope(context);
  useEffect(() => {
    let live = true;
    setCommits(undefined); setError("");
    api<Commit[]>(`github/commits?${repoQuery(context)}${scope ? `&path=${encodeURIComponent(scope)}` : ""}`).then(value => { if (live) setCommits(value); }, (error: unknown) => { if (live) setError(error instanceof Error ? error.message : String(error)); });
    return () => { live = false; };
  }, [context.owner, context.name, context.branch, context.head, scope]);
  const repository = `https://github.com/${context.owner}/${context.name}`;
  return <section className="history-page" aria-labelledby="history-title">
    <header className="page-header"><div><h2 id="history-title">History</h2><p>Commits on <span className="inline-branch"><BranchIcon />{context.branch}</span>{scope && <> that touch <code>{scope}/</code></>}</p></div><a className="button" href={`${repository}/commits/${encodeURIComponent(context.branch)}${scope ? `/${scope}` : ""}`} target="_blank" rel="noreferrer">View on GitHub</a></header>
    <ol className="timeline">
      <li className={pending ? "timeline-entry draft" : "timeline-entry draft clean"}>
        <span className="timeline-node" aria-hidden="true" />
        <div className="timeline-body"><strong>Local draft</strong><span>{pending ? `${pending} unpushed ${pending === 1 ? "change" : "changes"} saved in this browser` : "No unpushed changes"}</span></div>
        {pending > 0 && <button onClick={review}>Review changes</button>}
      </li>
      {error && <li className="timeline-message" role="alert">{error}</li>}
      {!commits && !error && <li className="timeline-message">Loading commits…</li>}
      {commits?.length === 0 && <li className="timeline-message">No commits found for this project.</li>}
      {commits?.map(commit => {
        const [summary, ...body] = commit.message.split("\n");
        return <li key={commit.sha} className={commit.sha === context.head ? "timeline-entry base" : "timeline-entry"}>
          <span className="timeline-node" aria-hidden="true" />
          {commit.avatar ? <img className="avatar" src={`${commit.avatar}${commit.avatar.includes("?") ? "&" : "?"}s=40`} alt="" width="20" height="20" referrerPolicy="no-referrer" /> : <span className="avatar placeholder" aria-hidden="true" />}
          <div className="timeline-body">
            <strong title={body.join("\n").trim() || undefined}>{summary}</strong>
            <span>{commit.author}{commit.date ? ` committed ${timeAgo(commit.date)}` : ""}</span>
          </div>
          {commit.sha === context.head && <span className="tag">Draft base</span>}
          <a className="sha" href={commit.url} target="_blank" rel="noreferrer" aria-label={`Commit ${commit.sha.slice(0, 7)} on GitHub`}>{commit.sha.slice(0, 7)}</a>
        </li>;
      })}
    </ol>
  </section>;
}
