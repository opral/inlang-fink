// Adapted from Fink v2's components/LixFloat.tsx: one pill that leads to review.
export function LixFloat({ count, branch, saving, review, disabled }: { count: number; branch: string; saving: boolean; review: () => void; disabled: boolean }) {
  if (!count) return null;
  return <aside className="lixfloat" aria-label="Pending changes">
    <span className={saving ? "float-count saving" : "float-count"}>{count}</span>{" "}
    <span className="float-label">{count === 1 ? "change" : "changes"} on <strong>{branch}</strong></span>
    <button className="float-review" onClick={review} disabled={disabled}>Review changes</button>
  </aside>;
}
