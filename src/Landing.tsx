import type { FormEvent, ReactNode } from "react";
import { Showcases } from "./Showcases";
import type { Showcase } from "./showcases";
import type { RepoTree } from "./repository";
import { recentKey, timeAgo, type RecentProject } from "./recent";
import { BranchIcon, GitHubIcon } from "./Menu";

type Picker = { tree: RepoTree; branches: string[]; branch: string; path: string; setBranch: (branch: string) => void; setPath: (path: string) => void; open: () => void };

export function Landing({ url, setUrl, submit, busy, picker, recent, openRecent, forget, openShowcase, status }: { status?: ReactNode; url: string; setUrl: (url: string) => void; submit: () => void; busy: boolean; picker?: Picker; recent: RecentProject[]; openRecent: (project: RecentProject) => void; forget: (project: RecentProject) => void; openShowcase: (project: Showcase) => void }) {
  const onSubmit = (event: FormEvent) => { event.preventDefault(); submit(); };
  return <>
    <section className="hero">
      <p className="eyebrow">Open source · Works with any inlang project</p>
      <h1>Translate your app,<br />right from GitHub.</h1>
      <p className="hero-lead">Fink is a localization editor for <code>project.inlang</code> repositories. Edit messages, variables and plurals in the browser, review the diff, and push a commit to your branch.</p>
      <form className="repo-cta" onSubmit={onSubmit}>
        <label className="visually-hidden" htmlFor="repository-url">GitHub repository</label>
        <GitHubIcon size={20} />
        <input id="repository-url" value={url} onChange={event => setUrl(event.target.value)} placeholder="Paste a repository URL, e.g. github.com/owner/repo" inputMode="url" autoCapitalize="off" autoComplete="off" spellCheck={false} required />
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
      <p className="hero-hint">Requires a <code>project.inlang</code> folder. <a href="https://inlang.com/docs" target="_blank" rel="noreferrer">Learn how to get started</a></p>
    </section>

    {recent.length > 0 && <section className="landing-section" aria-labelledby="recent-title">
      <header className="section-header"><div><h2 id="recent-title">Recent projects</h2><p>Drafts stay in this browser until you push them.</p></div></header>
      <div className="recent-grid">{recent.map(project => <article className="recent-card" key={recentKey(project)}>
        <button className="recent-open" disabled={busy} onClick={() => openRecent(project)} aria-label={`Open ${project.owner}/${project.name}`}>
          <img src={`https://github.com/${project.owner}.png?size=64`} alt="" width="32" height="32" referrerPolicy="no-referrer" />
          <span className="recent-text">
            <span className="recent-name">{project.owner}/<strong>{project.name}</strong></span>
            <span className="recent-meta"><span className="inline-branch"><BranchIcon />{project.branch}</span><span>{project.projectPath}</span></span>
          </span>
          <span className="recent-state">{project.pending > 0 ? <span className="badge changed">{project.pending} unpushed</span> : <span className="recent-time">{timeAgo(project.openedAt)}</span>}</span>
        </button>
        <button className="recent-remove" aria-label={`Remove ${project.owner}/${project.name} and its local draft`} title="Remove and delete the local draft" onClick={() => forget(project)}>×</button>
      </article>)}</div>
    </section>}

    <section className="landing-section how" aria-labelledby="how-title">
      <header className="section-header"><div><h2 id="how-title">How Fink works</h2><p>No setup and no lock-in. Your repository stays the source of truth.</p></div></header>
      <ol className="steps">
        <li><span className="step-number">1</span><h3>Paste a repository</h3><p>Fink finds every <code>project.inlang</code> on the branch and loads its messages. Works with i18next and inlang message format.</p>
          <div aria-hidden="true" className="step-visual mock-input"><GitHubIcon /> github.com/acme/web<span className="mock-button">Open</span></div></li>
        <li><span className="step-number">2</span><h3>Translate side by side</h3><p>Every locale of a message in one place, including variables, selectors and plurals. Filter for missing translations.</p>
          <div aria-hidden="true" className="step-visual mock-rows"><div><b>en</b><span className="ref">ref</span>Add {"{count}"} tickets</div><div><b>de</b>{"{count}"} Tickets hinzufügen</div><div className="mock-missing"><b>fr</b>+ Add translation</div></div></li>
        <li><span className="step-number">3</span><h3>Review and push</h3><p>See a before/after diff of every change, write a commit message, and push straight to your branch.</p>
          <div aria-hidden="true" className="step-visual mock-diff"><div><span className="del">tasks</span> → <span className="ins">tickets</span></div><div className="mock-commit"><BranchIcon /> main<span className="mock-push">Commit and push</span></div></div></li>
      </ol>
    </section>

    <Showcases open={openShowcase} busy={busy} />
  </>;
}
