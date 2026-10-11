import { useState, type FormEvent, type ReactNode } from "react";
import { Showcases } from "./Showcases";
import type { Showcase } from "./showcaseList";
import type { RepoTree } from "./repository";
import { avatarUrl, initials, recentKey, timeAgo, type RecentProject } from "./recent";
import { Features, LandingMore } from "./LandingSections";
import "./landing.css";

type Picker = { tree: RepoTree; branches: string[]; branch: string; path: string; setBranch: (branch: string) => void; setPath: (path: string) => void; open: () => void };

/** The editor screenshot in the hero: public/images/editor*.webp, captured from the fink-demo repository. */
export const HERO_SHOT = { src: "/images/editor.webp", srcSet: "/images/editor-920.webp 920w, /images/editor.webp 1840w", width: 1840, height: 1520, alt: "Fink editor showing the plural message files_remaining in English and German, with a warning that the German text is missing {count}" };

export function Landing({ url, setUrl, submit, busy, picker, recent, openRecent, forget, openShowcase, status }: { status?: ReactNode; url: string; setUrl: (url: string) => void; submit: () => void; busy: boolean; picker?: Picker; recent: RecentProject[]; openRecent: (project: RecentProject) => void; forget: (project: RecentProject) => void; openShowcase: (project: Showcase) => void }) {
  const onSubmit = (event: FormEvent) => { event.preventDefault(); submit(); };
  return <>
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-text">
        <h1 id="hero-title">The translation editor for your GitHub repo.</h1>
        <p className="hero-lead">Open your repository. Edit i18next or Paraglide JS translations side by side. Push only what you changed.</p>
        <form className="repo-cta" onSubmit={onSubmit}>
          <label className="visually-hidden" htmlFor="repository-url">GitHub repository</label>
          <input id="repository-url" value={url} onChange={event => setUrl(event.target.value)} placeholder="github.com/owner/repo" inputMode="url" autoCapitalize="off" autoComplete="off" spellCheck={false} required />
          <button className="primary" disabled={busy}>Open</button>
        </form>
        {picker && <div className="project-picker" role="group" aria-label="Choose a project">
          <p>{picker.tree.projects.length} inlang {picker.tree.projects.length === 1 ? "project" : "projects"} found. Choose a branch and project.</p>
          <div className="project-form">
            <label>Branch<select value={picker.branch} onChange={event => picker.setBranch(event.target.value)}>{picker.branches.map(branch => <option key={branch}>{branch}</option>)}</select></label>
            <label>Project<select value={picker.path} onChange={event => picker.setPath(event.target.value)}>{picker.tree.projects.map(path => <option key={path}>{path}</option>)}</select></label>
            <button className="primary" disabled={busy} onClick={picker.open}>Open project</button>
          </div>
        </div>}
        {status}
        <p className="hero-note">Free and open source (MIT) · <a href="/docs/set-up-a-project">Set up in one command</a></p>
      </div>
      <div className="hero-shot">
        <img src={HERO_SHOT.src} srcSet={HERO_SHOT.srcSet} sizes="(max-width: 740px) 150vw, 700px" width={HERO_SHOT.width} height={HERO_SHOT.height} alt={HERO_SHOT.alt} fetchPriority="high" />
      </div>
    </section>

    <Features />

    {/* Projects opened in this browser, newest first. Hidden until there is one. */}
    {recent.length > 0 && <section className="landing-section" aria-labelledby="recent-title">
      <header className="section-header"><h2 id="recent-title">Your projects</h2><p>Projects you opened in this browser. Drafts stay here until you push them.</p></header>
      <div className="recent-grid">{recent.map(project => <article className="recent-card" key={recentKey(project)}>
        <button className="recent-open" disabled={busy} onClick={() => openRecent(project)} aria-label={`Open ${project.owner}/${project.name}`}>
          <OwnerAvatar owner={project.owner} />
          <span className="card-text">
            <span className="recent-top"><span className="card-name">{project.owner}/<wbr />{project.name}</span><span className="recent-time">{timeAgo(project.openedAt)}</span></span>
            <span className="card-mono">{project.branch} · {project.projectPath}</span>
            {project.pending > 0 ? <span className="recent-pending">{project.pending} unpushed {project.pending === 1 ? "change" : "changes"}</span> : <span className="recent-clean">No unpushed changes</span>}
          </span>
        </button>
        <button className="recent-remove" aria-label={`Remove ${project.owner}/${project.name} and its local draft`} title="Remove and delete the local draft" onClick={() => forget(project)}>×</button>
      </article>)}</div>
    </section>}

    <Showcases open={openShowcase} busy={busy} />
    <LandingMore />
  </>;
}

/** The owner's GitHub avatar, or their initials when it can't load (offline, blocked, unknown owner). */
export function OwnerAvatar({ owner }: { owner: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="card-icon initials" aria-hidden="true">{initials(owner)}</span>;
  return <img className="card-icon" src={avatarUrl(owner)} alt="" width="40" height="40" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}

/** Brand and site links in the header of the landing page. */
export function HomeNav() {
  return <div className="home-nav">
    <a className="brand home-brand" href="/"><img src="/🐦.png" alt="" width="24" height="24" />Fink</a>
    <nav aria-label="Site"><a href="/docs">Docs</a><a href="/teams">For teams</a><a href="/compare">Compare</a></nav>
  </div>;
}
