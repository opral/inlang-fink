import type { ReactNode } from "react";

// Static sections of the landing page. scripts/build-site.mjs renders them into index.html too, for
// crawlers that don't run JavaScript.

const icon = (paths: ReactNode) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths}</svg>;
const features: [string, ReactNode, ReactNode][] = [
  ["Side by side", icon(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M9 9v11" /></>), "All languages and plural forms of a message in one place."],
  ["Checks", icon(<><path d="M12 3l9 16H3z" /><path d="M12 10v4M12 17v.5" /></>), "Missing translations, broken variables and missing plural forms, with one-click fixes."],
  ["Clean commits", icon(<><circle cx="6" cy="6" r="2" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="9" r="2" /><path d="M6 8v8M18 11c0 4-6 3-12 6" /></>), "Only edited messages change. The rest of each file stays byte for byte."],
  ["Nothing to sync", icon(<><path d="M4 12a8 8 0 0 1 14-5M20 12a8 8 0 0 1-14 5" /><path d="M18 3v4h-4M6 21v-4h4" /></>), "Your repository stays the only copy. No import, no export."],
];

/** What Fink does, in one ruled band under the hero. */
export function Features() {
  return <section className="feature-band" aria-labelledby="features-title">
    <h2 id="features-title" className="visually-hidden">What Fink does</h2>
    <ul className="features">{features.map(([title, svg, text]) => <li key={title}>{svg}<h3>{title}</h3><p>{text}</p></li>)}</ul>
  </section>;
}

const faq: [string, ReactNode][] = [
  ["What does it cost?", "Nothing. Fink is free and open source (MIT). Optional hosted services like machine translation may come with inlang Cloud. The editor stays free."],
  ["Do translators need git or a GitHub account?", <>No git. To save changes they need a free GitHub account. Without one they can try edits in their browser, but can't save them. <a href="/teams">Fink for teams</a></>],
  ["Does it work with private repositories?", <>Yes. Sign in with GitHub and install the Inlang GitHub App on the repositories Fink may use. <a href="/docs/getting-started">Getting started</a></>],
  ["Will Fink reformat my files?", <>No. Untouched files aren't committed, and in changed files the messages you didn't edit keep their exact formatting. <a href="/docs/push">What Fink commits</a></>],
  ["Can I review changes before they reach main?", <>Yes. Push to a branch you created on GitHub and open a pull request there. People without write access push to a fork and open a pull request. <a href="/docs/branches-forks-and-pull-requests">Branches, forks and pull requests</a></>],
  ["Is Fink a translation management system?", <>No. There is no translation memory or machine translation, and only GitHub is supported. See how Fink compares with <a href="/compare/crowdin">Crowdin</a>, <a href="/compare/lokalise">Lokalise</a>, <a href="/compare/weblate">Weblate</a> and <a href="/compare/tolgee">Tolgee</a>.</>],
];

/** Setup and questions, after the community projects. */
export function LandingMore() {
  return <>
    <section className="landing-section" aria-labelledby="setup-title">
      <header className="section-header"><div><h2 id="setup-title">Set up in a minute</h2><p>Fink reads a small <code>project.inlang</code> folder that lists your languages and where the files are. Your translation files stay as they are.</p></div><a className="section-link" href="/docs/set-up-a-project">Setup guide</a></header>
      <div className="setup-grid">
        <article className="setup-card"><h3>i18next</h3><p>Creates <code>project.inlang/settings.json</code> for your JSON files, including namespaces. <a href="/docs/i18next">i18next guide</a></p><pre><code>npx i18next-cli init --inlang</code></pre></article>
        <article className="setup-card"><h3>next-intl</h3><p>Add a <code>project.inlang/settings.json</code> that points at your <code>messages/{"{locale}"}.json</code>. Namespaces, plurals and rich text work as they are. <a href="/docs/next-intl">next-intl guide</a></p><pre><code>{`"plugin.inlang.nextIntl": {\n  "pathPattern": "./messages/{locale}.json"\n}`}</code></pre></article>
        <article className="setup-card"><h3>Paraglide JS</h3><p>Projects set up with Paraglide JS already have a <code>project.inlang</code> folder. <a href="/docs/paraglide-js">Paraglide JS guide</a></p><pre><code>npx @inlang/paraglide-js@latest init</code></pre></article>
      </div>
    </section>

    <section className="landing-section" aria-labelledby="faq-title">
      <header className="section-header"><div><h2 id="faq-title">Questions</h2><p>More answers in the <a href="/docs/faq">FAQ</a> and the <a href="/docs">docs</a>.</p></div></header>
      <div className="faq-list">{faq.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div>
    </section>
  </>;
}
