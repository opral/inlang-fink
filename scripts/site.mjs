// Static pages of fink.inlang.com: the docs and comparison pages are Markdown in site/, rendered
// to plain HTML at build time so search engines and AI crawlers get every page without running the
// app. scripts/build-site.mjs writes them into dist/ next to the app.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { Marked } from "marked";
import { compareMain, teamsMain } from "./site-designs.mjs";

export const ORIGIN = "https://fink.inlang.com";
export const REPOSITORY = "https://github.com/opral/inlang-fink";
const OG_IMAGE = `${ORIGIN}/og.png`;

/** Sidebar order. Every Markdown file in site/ must be listed here (a test checks it). */
export const NAV = [
  { title: "Get started", pages: ["docs", "docs/getting-started", "docs/set-up-a-project", "docs/formats", "teams"] },
  { title: "Using Fink", pages: ["docs/editing", "docs/reference-locale", "docs/plurals-and-selects", "docs/checks", "docs/unused-messages", "docs/push", "docs/branches-forks-and-pull-requests", "docs/translators", "docs/drafts"] },
  { title: "Integrations", pages: ["docs/i18next", "docs/next-intl", "docs/paraglide-js"] },
  { title: "More", pages: ["docs/privacy", "docs/faq"] },
  { title: "Compare", pages: ["compare", "compare/crowdin", "compare/lokalise", "compare/weblate", "compare/tolgee"] },
];

/** A page's frontmatter: `key: value` lines between `---` fences. */
export function parseFrontmatter(source) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(source);
  if (!match) throw new Error("Missing frontmatter");
  const data = Object.fromEntries(match[1].split("\n").filter(Boolean).map(line => {
    const index = line.indexOf(":");
    return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
  }));
  for (const key of ["title", "seoTitle", "description"]) if (!data[key]) throw new Error(`Frontmatter needs ${key}`);
  return { data, body: source.slice(match[0].length) };
}

/** Every page in `root` (site/), keyed by route without leading slash: "docs", "docs/checks", "compare/crowdin". */
export function loadPages(root) {
  const pages = [];
  // Standalone pages at the top level of site/, e.g. site/teams.md → /teams.
  for (const file of readdirSync(root).filter(name => name.endsWith(".md")).sort()) {
    const source = readFileSync(path.join(root, file), "utf8");
    const { data, body } = parseFrontmatter(source);
    pages.push({ slug: file.slice(0, -3), file: `site/${file}`, title: data.title, seoTitle: data.seoTitle, description: data.description, layout: data.layout, design: data.design, navTitle: data.navTitle, body, source });
  }
  for (const section of ["docs", "compare"]) {
    for (const file of readdirSync(path.join(root, section)).filter(name => name.endsWith(".md")).sort()) {
      const source = readFileSync(path.join(root, section, file), "utf8");
      const { data, body } = parseFrontmatter(source);
      const slug = file === "index.md" ? section : `${section}/${file.slice(0, -3)}`;
      pages.push({ slug, file: `site/${section}/${file}`, title: data.title, seoTitle: data.seoTitle, description: data.description, layout: data.layout, design: data.design, body, source });
    }
  }
  return pages;
}

export const url = slug => `${ORIGIN}/${slug}`;
const escape = text => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const headingId = text => text.toLowerCase().replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Markdown to HTML. Headings get ids for anchors; external links open GitHub/inlang etc. normally. */
export function renderMarkdown(markdown) {
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading({ tokens, depth }) {
        const html = this.parser.parseInline(tokens);
        return `<h${depth} id="${headingId(html)}">${html}</h${depth}>\n`;
      },
    },
  });
  return marked.parse(markdown, { async: false });
}

/** Docs and comparison pages belong to their section; a top-level page (e.g. /teams) is its own. */
const inSection = (slug, section) => slug === section || slug.startsWith(`${section}/`);
const sectionOf = page => inSection(page.slug, "compare") ? { name: "Compare", slug: "compare" } : inSection(page.slug, "docs") ? { name: "Docs", slug: "docs" } : { name: page.navTitle ?? page.title, slug: page.slug };
const navLabel = page => page.slug === "docs" ? "Overview" : page.slug === "compare" ? "Fink vs a TMS" : page.navTitle ?? page.title.replace(/^Fink vs /, "vs ");

/** schema.org data: breadcrumbs everywhere, an article per page, and FAQPage for the FAQ. */
export function structuredData(page) {
  const section = sectionOf(page);
  const crumbs = [{ name: "Fink", item: ORIGIN + "/" }, { name: section.name, item: url(section.slug) }];
  if (page.slug !== section.slug) crumbs.push({ name: page.title, item: url(page.slug) });
  const data = [
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: crumbs.map((crumb, index) => ({ "@type": "ListItem", position: index + 1, ...crumb })) },
    { "@context": "https://schema.org", "@type": page.slug === "compare" ? "CollectionPage" : page.slug.startsWith("compare/") ? "Article" : page.layout === "page" ? "WebPage" : "TechArticle", headline: page.seoTitle, description: page.description, url: url(page.slug), mainEntityOfPage: url(page.slug), image: OG_IMAGE, inLanguage: "en", author: { "@type": "Organization", "@id": `${ORIGIN}/#org`, name: "Opral", url: "https://opral.com" }, publisher: { "@id": `${ORIGIN}/#org` }, about: { "@id": `${ORIGIN}/#app` } },
  ];
  if (page.slug === "docs/faq") data.push({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqEntries(page.body).map(({ question, answer }) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) });
  return data;
}

/** "## Question" followed by its answer text, from the FAQ Markdown. */
export function faqEntries(markdown) {
  return markdown.split(/^## /m).slice(1).map(block => {
    const [question, ...rest] = block.split("\n");
    const answer = rest.join(" ").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*`]/g, "").replace(/\s+/g, " ").trim();
    return { question: question.trim(), answer };
  });
}

function sidebar(pages, current) {
  const bySlug = new Map(pages.map(page => [page.slug, page]));
  return NAV.map(group => `<div class="nav-group"><p class="nav-title">${group.title}</p><ul>${group.pages.map(slug => {
    const page = bySlug.get(slug);
    if (!page) throw new Error(`Navigation lists missing page ${slug}`);
    return `<li><a href="/${slug}"${slug === current ? ' aria-current="page"' : ""}>${escape(navLabel(page))}</a></li>`;
  }).join("")}</ul></div>`).join("");
}

function pager(pages, current) {
  // Standalone pages outside docs and compare (e.g. /teams) are in the sidebar but not in the reading order.
  const standalone = new Set(pages.filter(page => page.layout === "page" && !inSection(page.slug, "docs") && !inSection(page.slug, "compare")).map(page => page.slug));
  const order = NAV.flatMap(group => group.pages).filter(slug => !standalone.has(slug)), index = order.indexOf(current);
  const title = slug => { const page = pages.find(page => page.slug === slug); return escape(page ? (page.navTitle ?? page.title) : slug); };
  const previous = order[index - 1], next = order[index + 1];
  return `<nav class="pager" aria-label="Previous and next page">${previous ? `<a href="/${previous}" rel="prev"><span>Previous</span>${title(previous)}</a>` : "<span></span>"}${next ? `<a href="/${next}" rel="next"><span>Next</span>${title(next)}</a>` : "<span></span>"}</nav>`;
}

/** The site header; marks the link of the page's section ("docs", "teams", "compare"). */
export const siteHeader = (current = "", pageSlug = "") => `<header class="site-header"><div class="site-header-inner"><a class="site-brand" href="/"><img src="/%F0%9F%90%A6.png" alt="" width="24" height="24">Fink</a><nav class="site-nav" aria-label="Site">${[["docs", "Docs"], ["teams", "For teams"], ["compare", "Compare"]].map(([slug, name]) => `<a href="/${slug}"${slug === current ? ` aria-current="${slug === pageSlug ? "page" : "true"}"` : ""}>${name}</a>`).join("")}</nav><span class="site-spacer"></span><a class="site-github" href="${REPOSITORY}">GitHub</a><a class="site-cta" href="/">Open Fink</a></div></header>`;
export const siteFooter = `<footer class="site-footer"><div class="site-footer-inner"><span>© ${new Date().getFullYear()} Opral · Fink is open source (MIT). Part of inlang.</span><nav aria-label="Footer"><a href="/docs">Docs</a><a href="/teams">For teams</a><a href="/compare">Compare</a><a href="/docs/privacy">Privacy</a><a href="${REPOSITORY}">GitHub</a><a href="https://inlang.com">inlang</a><a href="https://paraglidejs.com">Paraglide JS</a></nav></div></footer>`;

const pageMeta = page => `Maintained by <a href="https://opral.com">Opral</a>, the team behind inlang · <a href="${REPOSITORY}/edit/main/${page.file}">Edit this page on GitHub</a> · <a href="${REPOSITORY}/issues">Report an issue</a> · <a href="/${page.slug}.md">Markdown</a>`;
/** The editor screenshot from the landing page (src/heroShot.json). */
const shot = JSON.parse(readFileSync(new URL("../src/heroShot.json", import.meta.url), "utf8"));
const HERO_SHOT = `<img src="${shot.src}" srcset="${shot.srcSet}" sizes="(max-width: 740px) 150vw, 640px" width="${shot.width}" height="${shot.height}" alt="${escape(shot.alt)}" fetchpriority="high">`;

/** One static HTML page. */
export function renderPage(page, pages) {
  const section = sectionOf(page);
  const canonical = url(page.slug);
  const crumbs = page.slug === section.slug ? `<a href="/">Fink</a><span aria-hidden="true">/</span><span>${section.name}</span>` : `<a href="/">Fink</a><span aria-hidden="true">/</span><a href="/${section.slug}">${section.name}</a><span aria-hidden="true">/</span><span>${escape(page.title)}</span>`;
  const breadcrumbs = `<nav class="breadcrumbs" aria-label="Breadcrumb">${crumbs}</nav>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(page.seoTitle)}</title>
<meta name="description" content="${escape(page.description)}">
<link rel="canonical" href="${canonical}">
<link rel="alternate" type="text/markdown" href="/${page.slug}.md">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Fink">
<meta property="og:title" content="${escape(page.seoTitle)}">
<meta property="og:description" content="${escape(page.description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${OG_IMAGE}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escape(page.seoTitle)}">
<meta name="twitter:description" content="${escape(page.description)}">
<meta name="twitter:image" content="${OG_IMAGE}">
<link rel="icon" href="/%F0%9F%90%A6.png">
<link rel="preload" href="/fonts/geist-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/site.css">
${structuredData(page).map(data => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`).join("\n")}
</head>
<body class="section-${section.slug}${page.design ? ` design design-${page.design}` : ""}">
${siteHeader(section.slug, page.slug)}
${page.design ? `<main class="design-main">
${(page.design === "teams" ? teamsMain(page, breadcrumbs, HERO_SHOT) : compareMain(page, breadcrumbs))}
<p class="page-meta">${pageMeta(page)}</p>
</main>` : `<div class="site-layout${page.layout === "page" ? " page-layout" : ""}">
${page.layout === "page" ? "" : `<nav class="site-sidebar" aria-label="${section.name}">${sidebar(pages, page.slug)}</nav>`}
<main class="site-main">
${breadcrumbs}
<article class="prose">
<h1>${escape(page.title)}</h1>
${renderMarkdown(page.body)}
</article>
${page.layout === "page" ? "" : pager(pages, page.slug)}
<p class="page-meta">${pageMeta(page)}</p>
</main>
</div>`}
${siteFooter}
</body>
</html>
`;
}

/** The page for unknown /docs and /compare paths, served with status 404 by the Worker. */
export function renderNotFound(pages) {
  return renderPage({ slug: "docs/not-found", file: "site/docs/index.md", title: "Page not found", seoTitle: "Page not found · Fink docs", description: "This page doesn't exist.", body: "This page doesn't exist, or it moved. Start from the [docs overview](/docs) or [open Fink](/)." }, pages)
    .replace("<head>\n", '<head>\n<meta name="robots" content="noindex">\n')
    .replace(/<link rel="canonical"[^>]*>\n/, "")
    .replace(/<link rel="alternate"[^>]*>\n/, "")
    .replace(/<script type="application\/ld\+json">.*<\/script>\n/g, "");
}

/** Routes for sitemap.xml and llms.txt: the app's home page, then every static page. */
export function sitemap(pages) {
  const routes = ["", ...pages.map(page => page.slug)];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${routes.map(route => `  <url><loc>${ORIGIN}/${route}</loc></url>`).join("\n")}\n</urlset>\n`;
}

export const robots = () => `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /ingest/\n\nSitemap: ${ORIGIN}/sitemap.xml\n`;

/** llms.txt (https://llmstxt.org): what Fink is, then links to the Markdown version of every page. */
export function llmsTxt(pages) {
  const bySlug = new Map(pages.map(page => [page.slug, page]));
  return `# Fink

> Fink is a free, open source (MIT), browser-based translation editor for GitHub repositories. It opens the i18next JSON, next-intl or inlang message format (Paraglide JS) files in a repository that has a project.inlang folder, shows every language of a message side by side, checks for missing translations, variables and plural forms, and commits the changed files back to the branch. There is no sync and no second copy of the translations: the repository is the source of truth.

Key facts:
- Supported formats: i18next JSON (including namespaces and plurals), next-intl messages (nested namespaces, ICU plurals, selects and rich text tags) and the inlang message format used by Paraglide JS. Not supported: other ICU MessageFormat files, PO, XLIFF, YAML, mobile string files.
- Hosting: github.com repositories only. Public repositories open without signing in; pushing requires signing in with GitHub and the Inlang GitHub App installed on the repository.
- People without write access push to a fork and open a pull request on GitHub. Fink doesn't create branches or pull requests itself.
- Fink is not a translation management system: no translation memory, no machine translation, no vendor workflows.
- Fink is free and open source (MIT): ${REPOSITORY}. Optional hosted services, such as machine translation, may come with inlang Cloud; the editor stays free.

${NAV.map(group => `## ${group.title}\n\n${group.pages.map(slug => { const page = bySlug.get(slug); return `- [${page.navTitle ?? page.title}](${ORIGIN}/${slug}.md): ${page.description}`; }).join("\n")}`).join("\n\n")}

## Optional

- [Fink app](${ORIGIN}/): open a repository
- [inlang](https://inlang.com): the project format and SDK behind Fink
- [Paraglide JS](https://paraglidejs.com): the i18n library that uses the inlang message format
`;
}

/** llms-full.txt: every page's Markdown in navigation order. */
export function llmsFullTxt(pages) {
  const bySlug = new Map(pages.map(page => [page.slug, page]));
  return NAV.flatMap(group => group.pages).map(slug => { const page = bySlug.get(slug); return `# ${page.title}\n\nSource: ${ORIGIN}/${slug}\n\n${page.body.trim()}\n`; }).join("\n---\n\n");
}

/** The Markdown version of a page, linked from each page and from llms.txt. */
export const pageMarkdown = page => `# ${page.title}\n\n> ${page.description}\n\n${page.body.trim()}\n`;

/** Links inside the Markdown that point at site pages, for the broken-link test. */
export function internalLinks(markdown) {
  return [...markdown.matchAll(/\]\((\/[^)\s#]*)(#[^)\s]*)?\)/g)].map(match => ({ path: match[1], hash: match[2]?.slice(1) }));
}
