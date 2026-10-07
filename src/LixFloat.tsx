// Adapted from Fink v2's components/LixFloat.tsx for the GitHub workflow.
export function LixFloat({ count, review, download, disabled }: { count: number; review: () => void; download: () => void; disabled: boolean }) {
  if (!count) return null;
  return <aside className="lixfloat" aria-label="Pending changes">
    <button className="float-changes" onClick={review} disabled={disabled} aria-label="Review and push"><span className="float-count">{count}</span> Changes</button>
    <button className="float-download" onClick={download} disabled={disabled} aria-label="Download project" title="Download project"><svg width="20" height="20" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z" /></svg></button>
  </aside>;
}
