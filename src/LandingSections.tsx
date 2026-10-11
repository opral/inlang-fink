import type { ReactNode } from "react";
import "./landing.css";

// Marketing sections of the landing page. They are static, so scripts/build-site.mjs renders the
// same markup into index.html for crawlers that don't run JavaScript.

/** Why Fink: right under the repository input. */
export function Benefits() {
  return <section aria-labelledby="benefits-title"><h2 id="benefits-title" className="visually-hidden">Why Fink</h2><ul className="benefits">
    <li><h3>One message, every language</h3><p>Stop juggling <code>en.json</code>, <code>de.json</code> and <code>fr.json</code>. Each message shows all its translations and plural forms in one card.</p></li>
    <li><h3>Catch mistakes before they ship</h3><p>Checks find missing translations, missing or unknown <code>{"{variables}"}</code> and missing plural forms, with one-click fixes.</p></li>
    <li><h3>Nothing to sync</h3><p>Your repository stays the only copy of your translations. No import, no export, no integration that breaks.</p></li>
    <li><h3>Clean commits</h3><p>Only the messages you edit change. The rest of each file keeps its exact formatting, so the diff is easy to review.</p></li>
  </ul><p className="benefits-teams">Translators or PMs who don't use git? <a href="/teams">Fink for teams</a></p></section>;
}

const faq: [string, ReactNode][] = [
  ["What does it cost?", "Nothing. Fink is free and open source (MIT). Optional hosted services like machine translation may come with inlang Cloud. The editor stays free."],
  ["Do translators need git or a GitHub account?", <>No git. To save changes they need a free GitHub account. Without one they can try edits in their browser, but can't save them. <a href="/teams">Fink for teams</a></>],
  ["Does it work with private repositories?", <>Yes. Sign in with GitHub and install the Inlang GitHub App on the repositories Fink may use. <a href="/docs/getting-started">Getting started</a></>],
  ["Will Fink reformat my files?", <>No. Untouched files aren't committed, and in changed files the messages you didn't edit keep their exact formatting. <a href="/docs/push">What Fink commits</a></>],
  ["Can I review changes before they reach main?", <>Yes. Push to a branch you created on GitHub and open a pull request there. People without write access push to a fork and open a pull request. <a href="/docs/branches-forks-and-pull-requests">Branches, forks and pull requests</a></>],
  ["Is Fink a translation management system?", <>No. There is no translation memory or machine translation, and only GitHub is supported. See how Fink compares with <a href="/compare/crowdin">Crowdin</a>, <a href="/compare/lokalise">Lokalise</a>, <a href="/compare/weblate">Weblate</a> and <a href="/compare/tolgee">Tolgee</a>.</>],
];

/** Setup, FAQ and links to the docs: after the community projects. */
export function LandingMore() {
  return <>
    <section className="landing-section" aria-labelledby="setup-title">
      <header className="section-header"><div><h2 id="setup-title">Set up in one command</h2><p>Fink reads a small <code>project.inlang</code> folder that lists your languages and where the files are. Your translation files stay as they are.</p></div><a className="button" href="/docs/set-up-a-project">Setup guide</a></header>
      <div className="setup-grid">
        <article className="setup-card"><h3>i18next</h3><p>Creates <code>project.inlang/settings.json</code> for your existing JSON files, including namespaces.</p><pre><code>npx i18next-cli init --inlang</code></pre><a href="/docs/i18next">i18next guide</a></article>
        <article className="setup-card"><h3>Paraglide JS</h3><p>Projects set up with Paraglide JS already have a <code>project.inlang</code> folder. Paste the repository URL above.</p><pre><code>npx @inlang/paraglide-js@latest init</code></pre><a href="/docs/paraglide-js">Paraglide JS guide</a></article>
      </div>
    </section>

    <section className="landing-section" aria-labelledby="faq-title">
      <header className="section-header"><div><h2 id="faq-title">Questions</h2><p>More answers in the <a href="/docs/faq">FAQ</a> and the <a href="/docs">docs</a>.</p></div></header>
      <dl className="faq-list">{faq.map(([question, answer]) => <div key={question}><dt>{question}</dt><dd>{answer}</dd></div>)}</dl>
    </section>
  </>;
}
