import { showcases, type Showcase } from "./showcaseList";
import { GitHubIcon } from "./Menu";
const count = (value: number) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
export function Showcases({ open, busy }: { open: (project: Showcase) => void; busy: boolean }) {
  return <section className="landing-section showcases" aria-labelledby="showcases-title">
    <header className="section-header"><div><h2 id="showcases-title">Explore community projects</h2><p>See how open source communities translate their apps with inlang. Open one to try Fink.</p></div><a className="button" href="https://github.com/opral/inlang-fink/blob/main/docs/showcases.md" target="_blank" rel="noreferrer">Add your repository <span aria-hidden="true">↗</span></a></header>
    <div className="showcase-grid">{showcases.map(project => <article className="showcase-card" key={project.repository}>
      <button className="showcase-open" disabled={busy} onClick={() => open(project)} aria-label={`Open ${project.name}`}>
        <span className="showcase-identity"><img src={project.icon} alt="" width="40" height="40" referrerPolicy="no-referrer" />{project.example && <span className="example-tag">Example</span>}</span>
        <span className="showcase-name">{project.name}</span>
        <span className="showcase-owner">{project.repository.split("/")[0]}</span>
        <span className="showcase-description">{project.description}</span>
        <span className="showcase-stats"><span title="GitHub stars">★ {count(project.stars)}</span><span>{project.locales} locales</span><span>{project.contributors} contributors</span></span>
      </button>
      <a className="showcase-github" href={`https://github.com/${project.repository}`} target="_blank" rel="noreferrer" aria-label={`${project.name} on GitHub`} title="View on GitHub"><GitHubIcon /></a>
    </article>)}</div>
    <p className="showcase-note">Counts are a snapshot. Anyone can edit a local draft; pushing requires write access to the repository.</p>
  </section>;
}
