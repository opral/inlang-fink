import type { ReactNode } from "react";

/**
 * What the float offers, as on fink.inlang.com: collaborators push to the branch, everyone else
 * forks first. After a push the float links the commit, and for a fork the pull request to open.
 */
export type FloatMode =
  | { kind: "push" }
  | { kind: "signin"; signIn: ReactNode }
  | { kind: "fork"; forking: boolean; fork: () => void }
  | { kind: "pushed"; commit: string; pullRequest?: string; dismiss: () => void };

// Adapted from Fink v2's components/LixFloat.tsx and fink.inlang.com's Gitfloat. Stays on screen
// while changes exist, on every tab.
export function LixFloat({ count, branch, saving, busy, reviewing, review, edit, push, mode }: { count: number; branch: string; saving: boolean; busy: boolean; reviewing: boolean; review: () => void; edit: () => void; push: () => void; mode: FloatMode }) {
  if (!count && mode.kind !== "fork" && mode.kind !== "pushed") return null;
  return <aside className="lixfloat" aria-label={count ? "Pending changes" : "Changes"}>
    <div className="float-bar">
      {count > 0 ? <>
        <span className={saving ? "float-count saving" : "float-count"}>{count}</span>{" "}
        <span className="float-label">{count === 1 ? "change" : "changes"} on <strong>{branch}</strong></span>
        {reviewing ? <button className="float-action" onClick={edit}>Edit</button> : <button className="float-action" onClick={review} disabled={busy || saving}>Review</button>}
      </> : <span className="float-label">{mode.kind === "fork" ? "Fork to make changes" : <>Pushed to <strong>{branch}</strong></>}</span>}
      {mode.kind === "push" && count > 0 && <button className="float-commit" disabled={busy || saving} onClick={push}>Push</button>}
      {mode.kind === "signin" && mode.signIn}
      {mode.kind === "fork" && <button className="float-commit" disabled={busy || mode.forking} onClick={mode.fork}>{mode.forking ? "Forking…" : "Fork"}</button>}
      {mode.kind === "pushed" && count === 0 && <>
        <a className={mode.pullRequest ? "button float-action" : "button float-commit"} href={mode.commit} target="_blank" rel="noreferrer">View commit</a>
        {mode.pullRequest && <a className="button float-commit" href={mode.pullRequest} target="_blank" rel="noreferrer">Open pull request</a>}
        <button className="float-action" aria-label="Dismiss" onClick={mode.dismiss}>×</button>
      </>}
    </div>
  </aside>;
}
