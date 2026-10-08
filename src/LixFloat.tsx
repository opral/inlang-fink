import type { ReactNode } from "react";

/**
 * What the float offers, as on fink.inlang.com: collaborators push to the branch, everyone else
 * forks first, and after pushing to a fork the float links to open a pull request.
 */
export type FloatMode =
  | { kind: "push" }
  | { kind: "signin"; signIn: ReactNode }
  | { kind: "fork"; forking: boolean; fork: () => void }
  | { kind: "pullrequest"; url: string; dismiss: () => void };

// Adapted from Fink v2's components/LixFloat.tsx and fink.inlang.com's Gitfloat. Stays on screen
// while changes exist, on every tab.
export function LixFloat({ count, branch, saving, busy, reviewing, review, edit, push, mode }: { count: number; branch: string; saving: boolean; busy: boolean; reviewing: boolean; review: () => void; edit: () => void; push: () => void; mode: FloatMode }) {
  if (!count && mode.kind !== "fork" && mode.kind !== "pullrequest") return null;
  return <aside className="lixfloat" aria-label={count ? "Pending changes" : "Changes"}>
    <div className="float-bar">
      {count > 0 ? <>
        <span className={saving ? "float-count saving" : "float-count"}>{count}</span>{" "}
        <span className="float-label">{count === 1 ? "change" : "changes"} on <strong>{branch}</strong></span>
        {reviewing ? <button className="float-action" onClick={edit}>Edit</button> : <button className="float-action" onClick={review} disabled={busy || saving}>Review</button>}
      </> : <span className="float-label">{mode.kind === "fork" ? "Fork to make changes" : "Changes pushed to your fork"}</span>}
      {mode.kind === "push" && count > 0 && <button className="float-commit" disabled={busy || saving} onClick={push}>Push</button>}
      {mode.kind === "signin" && mode.signIn}
      {mode.kind === "fork" && <button className="float-commit" disabled={busy || mode.forking} onClick={mode.fork}>{mode.forking ? "Forking…" : "Fork"}</button>}
      {mode.kind === "pullrequest" && count === 0 && <>
        <a className="button float-commit" href={mode.url} target="_blank" rel="noreferrer">Open pull request</a>
        <button className="float-action" aria-label="Dismiss" onClick={mode.dismiss}>×</button>
      </>}
    </div>
  </aside>;
}
