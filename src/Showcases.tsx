import { showcases, SHOWCASES_CHECKED, type Showcase } from "./showcases";
const count = (value: number) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
export function Showcases({ open, busy }: { open: (project: Showcase) => void; busy: boolean }) {
  return <section className="showcases" aria-labelledby="showcases-title">
    <header><div><h2 id="showcases-title">Explore community projects</h2><p>See how open source communities translate their apps with inlang.</p></div><span>Checked {SHOWCASES_CHECKED}</span></header>
    <div className="showcase-grid">{showcases.map(project => <article className="showcase-card" key={project.repository}>
      <div className="showcase-title"><h3>{project.name}</h3>{project.example && <span className="example-tag">Example</span>}</div>
      <p>{project.description}</p>
      <dl><div><dt>Stars</dt><dd>{count(project.stars)}</dd></div><div><dt>Contributors</dt><dd>{project.contributors}</dd></div><div><dt>Locales</dt><dd>{project.locales}</dd></div></dl>
      <p className="showcase-activity">{project.commits30d === 100 ? "100+" : project.commits30d} commits in the 30 days before review</p>
      <div className="showcase-actions"><button disabled={busy} onClick={() => open(project)} aria-label={`Open ${project.name}`}>Open project <span aria-hidden="true">↗</span></button><a href={`https://github.com/${project.repository}`} target="_blank" rel="noreferrer">GitHub</a></div>
    </article>)}</div>
    <p className="showcase-note">Community counts are a snapshot. You can edit a local draft; pushing requires repository access.</p>
  </section>;
}
