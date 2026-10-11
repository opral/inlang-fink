import { renderToStaticMarkup } from "react-dom/server";
import { Landing } from "./Landing";
import { GitHubIcon } from "./Menu";
import { StarButton } from "./StarButton";

/**
 * The signed-out landing page as static HTML, built into index.html by scripts/build-site.mjs so
 * crawlers that don't run JavaScript see the page. React replaces it when the app starts. Mirrors
 * App's header, main and footer for the signed-out home page.
 */
export function renderLanding(): string {
  const noop = () => {};
  return renderToStaticMarkup(<div id="static-landing">
    <header className="app-header"><div className="header-grid"><div className="menu-bar">
      <a className="brand home-brand" href="/"><img src="/🐦.png" alt="" width="24" height="24" />Fink</a>
      <div className="account"><a href="/docs" className="help-link">Docs</a><StarButton /><a className="button" href="/api/auth/login" rel="nofollow"><GitHubIcon /> Sign in with GitHub</a></div>
    </div></div></header>
    <main className="welcome">
      <Landing url="" setUrl={noop} submit={noop} busy={false} recent={[]} openRecent={noop} forget={noop} openShowcase={noop} />
    </main>
    <footer><div className="footer-grid"><span>© {new Date().getFullYear()} Opral · Fink is open source (MIT) · Anonymous usage counts, no content</span><span className="footer-links"><a href="/docs">Docs</a><a href="/compare">Compare</a><a href="https://github.com/opral/inlang-fink">GitHub</a><a href="https://inlang.com">inlang</a><a href="https://paraglidejs.com">Paraglide JS</a></span></div></footer>
  </div>);
}
