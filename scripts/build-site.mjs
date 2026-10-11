// Writes the static docs and comparison pages, sitemap.xml, robots.txt and llms.txt into dist/,
// and puts a static copy of the landing page into dist/index.html for crawlers. Runs after
// `vite build` (see package.json).
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServer } from "vite";
import { loadPages, renderPage, renderNotFound, sitemap, robots, llmsTxt, llmsFullTxt, pageMarkdown, url } from "./site.mjs";

const dist = "dist";
const pages = loadPages("site");
for (const page of pages) {
  await mkdir(path.dirname(path.join(dist, page.slug)), { recursive: true });
  // "docs/checks" → dist/docs/checks.html, served at /docs/checks (Workers assets html_handling).
  await writeFile(path.join(dist, `${page.slug}.html`), renderPage(page, pages));
  await writeFile(path.join(dist, `${page.slug}.md`), pageMarkdown(page));
}
await writeFile(path.join(dist, "docs/not-found.html"), renderNotFound(pages));
await writeFile(path.join(dist, "sitemap.xml"), sitemap(pages));
await writeFile(path.join(dist, "robots.txt"), robots());
await writeFile(path.join(dist, "llms.txt"), llmsTxt(pages));
await writeFile(path.join(dist, "llms-full.txt"), llmsFullTxt(pages));
// The same self-hosted fonts as the app (src/fonts.css), then the site styles.
await writeFile(path.join(dist, "site.css"), (await readFile("src/fonts.css", "utf8")) + (await readFile("site/site.css", "utf8")));
// The Markdown twins point search engines at their HTML page. The Worker sets this header for
// /docs/* and /compare/* (run_worker_first); _headers covers the two top-level twins.
await appendFile(path.join(dist, "_headers"), pages.filter(page => !page.slug.includes("/")).map(page => `\n/${page.slug}.md\n  Link: <${url(page.slug)}>; rel="canonical"\n`).join(""));

// The landing page rendered by React on the server, so `curl https://fink.inlang.com` shows content.
// React 19 adds image preload hints to static markup; they don't belong inside #root.
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error", optimizeDeps: { noDiscovery: true, include: [] } });
try {
  const { renderLanding } = await vite.ssrLoadModule("/src/prerender.tsx");
  const index = path.join(dist, "index.html");
  const html = await readFile(index, "utf8");
  if (!html.includes('<div id="root"></div>')) throw new Error("dist/index.html has no empty #root to fill");
  await writeFile(index, html.replace('<div id="root"></div>', `<div id="root">${renderLanding().replace(/<link rel="preload"[^>]*>/g, "")}</div>`));
} finally {
  await vite.close();
}
console.log(`Static site: ${pages.length} pages, sitemap.xml, robots.txt, llms.txt`);
