import { useState, type ReactNode } from "react";

// Adapted from Fink v2's components/LixFloat.tsx. Stays on screen while changes
// exist, on every tab: review the diff, or commit right from the float.
export function LixFloat({ count, branch, saving, busy, reviewing, review, edit, message, setMessage, suggest, commit, signIn }: { count: number; branch: string; saving: boolean; busy: boolean; reviewing: boolean; review: () => void; edit: () => void; message: string; setMessage: (message: string) => void; suggest: () => void; commit: () => void; signIn?: ReactNode }) {
  const [composing, setComposing] = useState(false);
  if (!count) return null;
  return <aside className={composing ? "lixfloat composing" : "lixfloat"} aria-label="Pending changes" onKeyDown={event => { if (event.key === "Escape") setComposing(false); }}>
    {composing && <form className="float-composer" onSubmit={event => { event.preventDefault(); commit(); }}>
      <label className="visually-hidden" htmlFor="commit-message">Commit message</label>
      <input id="commit-message" value={message} maxLength={200} onChange={event => setMessage(event.target.value)} autoFocus required />
      {signIn ?? <button className="commit" disabled={busy || saving || !message.trim()}>Commit and push to {branch}</button>}
    </form>}
    <div className="float-bar">
      <span className={saving ? "float-count saving" : "float-count"}>{count}</span>{" "}
      <span className="float-label">{count === 1 ? "change" : "changes"} on <strong>{branch}</strong></span>
      {reviewing ? <button className="float-action" onClick={edit}>Edit</button> : <button className="float-action" onClick={review} disabled={busy || saving}>Review</button>}
      <button className="float-commit" aria-expanded={composing} disabled={busy} onClick={() => { if (!composing) suggest(); setComposing(!composing); }}>Commit</button>
    </div>
  </aside>;
}
