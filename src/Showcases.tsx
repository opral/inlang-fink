import { showcases, type Showcase } from "./showcaseList";

/** Open source apps that translate with inlang. Each card opens the project in Fink. */
export function Showcases({ open, busy }: { open: (project: Showcase) => void; busy: boolean }) {
  return <section className="landing-section" aria-labelledby="showcases-title">
    <header className="section-header">
      <div><h2 id="showcases-title">Community projects</h2><p>Open source apps that translate with inlang. Open one to try Fink.</p></div>
      <a className="section-link" href="https://github.com/opral/inlang-fink/blob/main/docs/showcases.md" target="_blank" rel="noreferrer">Add your repository<span className="visually-hidden"> (opens GitHub)</span></a>
    </header>
    <div className="showcase-grid">{showcases.map(project => <button key={project.repository} className="showcase-card" disabled={busy} onClick={() => open(project)} aria-label={`Open ${project.name}`}>
      <img className="card-icon" src={project.icon} alt="" width="40" height="40" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
      <span className="card-text">
        <span className="card-name">{project.name}{project.example && <span className="example-tag">Example</span>}</span>
        <span className="card-mono">{project.repository}</span>
        <span className="card-meta">{project.locales} languages</span>
      </span>
    </button>)}</div>
  </section>;
}
