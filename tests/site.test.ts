import { readdirSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { NAV, ORIGIN, headingId, internalLinks, llmsTxt, loadPages, renderMarkdown, renderNotFound, renderPage, robots, sitemap } from "../scripts/site.mjs";
import { COMPARE_MARKS, splitSections } from "../scripts/site-designs.mjs";

const pages = loadPages("site");
const bySlug = new Map(pages.map(page => [page.slug, page]));
const meta = (html: string, attribute: string, name: string) => new RegExp(`<meta ${attribute}="${name}" content="([^"]*)"`).exec(html)?.[1];
const jsonLd = (html: string) => [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map(match => JSON.parse(match[1]) as { "@type": string; [key: string]: unknown });

describe("static docs and comparison pages", () => {
  test("every Markdown file is in the navigation and every navigation entry exists", () => {
    const files = ["docs", "compare"].flatMap(section => readdirSync(`site/${section}`).filter(name => name.endsWith(".md")).map(name => name === "index.md" ? section : `${section}/${name.slice(0, -3)}`))
      .concat(readdirSync("site").filter(name => name.endsWith(".md")).map(name => name.slice(0, -3)));
    expect(NAV.flatMap(group => group.pages).sort()).toEqual(files.sort());
  });

  test("each page has a unique title and description, a canonical URL, social cards and structured data", () => {
    const titles = new Set<string>(), descriptions = new Set<string>();
    for (const page of pages) {
      const html = renderPage(page, pages);
      const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "";
      expect(title.length, page.slug).toBeGreaterThan(10);
      expect(title.length, `${page.slug} title`).toBeLessThanOrEqual(66);
      expect(page.description.length, `${page.slug} description`).toBeGreaterThanOrEqual(70);
      expect(page.description.length, `${page.slug} description`).toBeLessThanOrEqual(160);
      titles.add(title); descriptions.add(page.description);
      expect(html).toContain(`<link rel="canonical" href="${ORIGIN}/${page.slug}">`);
      expect(meta(html, "property", "og:url")).toBe(`${ORIGIN}/${page.slug}`);
      expect(meta(html, "property", "og:image")).toBe(`${ORIGIN}/og.png`);
      expect(meta(html, "name", "twitter:card")).toBe("summary_large_image");
      expect(html.match(/<h1[ >]/g)).toHaveLength(1);
      const types = jsonLd(html).map(data => data["@type"]);
      expect(types).toContain("BreadcrumbList");
      expect(types).toContain(page.slug === "compare" ? "CollectionPage" : page.slug.startsWith("compare/") ? "Article" : page.layout === "page" ? "WebPage" : "TechArticle");
    }
    expect(titles.size).toBe(pages.length);
    expect(descriptions.size).toBe(pages.length);
  });

  test("the FAQ page carries FAQPage data for every question", () => {
    const faq = bySlug.get("docs/faq")!;
    const data = jsonLd(renderPage(faq, pages)).find(item => item["@type"] === "FAQPage") as unknown as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] };
    expect(data.mainEntity.length).toBe(faq.body.match(/^## /gm)!.length);
    expect(data.mainEntity.every(entry => entry.name.endsWith("?") && entry.acceptedAnswer.text.length > 10)).toBe(true);
  });

  test("internal links point at existing pages and headings", () => {
    for (const page of pages) {
      for (const link of internalLinks(page.body)) {
        if (link.path === "/") continue;
        const target = bySlug.get(link.path.slice(1));
        expect(target, `${page.slug} links to ${link.path}`).toBeDefined();
        if (link.hash) expect(renderMarkdown(target!.body), `${page.slug} links to ${link.path}#${link.hash}`).toContain(`id="${link.hash}"`);
      }
    }
  });

  test("headings get stable anchors", () => {
    expect(headingId("When the branch changed")).toBe("when-the-branch-changed");
    expect(renderMarkdown("## 3. Sign in and grant access")).toContain('id="3-sign-in-and-grant-access"');
  });

  test("the teams page says exactly where changes go", () => {
    const teams = bySlug.get("teams")!;
    const html = renderPage(teams, pages);
    expect(html).toContain('<link rel="canonical" href="https://fink.inlang.com/teams">');
    expect(html).not.toContain('class="site-sidebar"');
    expect(teams.body).toContain("that your link opened. Fink does not open a pull request.");
    expect(teams.body).toContain("You submit the pull request on GitHub.");
    expect(sitemap(pages)).toContain("<loc>https://fink.inlang.com/teams</loc>");
    expect(llmsTxt(pages)).toContain("(https://fink.inlang.com/teams.md)");
  });

  test("designed pages render every section of their Markdown", () => {
    for (const slug of ["compare", "teams"]) {
      const page = bySlug.get(slug)!;
      const html = renderPage(page, pages);
      expect(html, slug).toContain(`class="section-${slug} design design-${page.design}"`);
      expect(html).not.toContain('class="site-sidebar"');
      for (const section of splitSections(page.body).sections) expect(html, `${slug}: ${section.title}`).toContain(`id="${section.id}"`);
      expect(html).toContain('<form class="cta-form" action="/" method="get">');
      expect(html).toContain('name="repo"');
    }
  });

  test("the compare page has the flows, an accessible comparison table and the one-on-one cards", () => {
    const page = bySlug.get("compare")!;
    const html = renderPage(page, pages);
    expect(html).toContain("<h1>A Crowdin, Lokalise, Weblate and Tolgee alternative without the sync</h1>");
    expect(html).toContain("<title>Crowdin, Lokalise, Weblate and Tolgee alternatives: Fink compared</title>");
    expect(html).toContain('<h3>With a TMS</h3>');
    expect(html).toContain('<span class="flow-box fink">Fink editor</span>');
    const table = /<table class="compare-table">([\s\S]*?)<\/table>/.exec(html)![1];
    expect(table).toContain('<th scope="col" class="ours">Fink</th>');
    const rows = [...table.matchAll(/<tr><th scope="row">([^<]*)<\/th>/g)].map(match => match[1]);
    const markdownRows = page.body.split("\n").filter(line => line.startsWith("| ") && !line.startsWith("| |")).map(line => line.split("|")[1].trim());
    expect(rows).toEqual(markdownRows);
    // Every row has a Fink cell (tinted) and a TMS cell; every mark has a label.
    expect(table.match(/<td class="ours">/g)).toHaveLength(rows.length);
    for (const label of Object.keys(COMPARE_MARKS)) expect(rows, label).toContain(label);
    expect(table.match(/<svg[^>]*class="mark (yes|no)"[^>]*>/g)!.every(mark => /role="img" aria-label="(Yes|No)"/.test(mark))).toBe(true);
    expect(table).toContain("Weblate (GPL-3.0) and Tolgee (Apache-2.0) are open source. Crowdin and Lokalise are not.");
    expect(html).toContain('<div class="fit-card fink"><h2 id="fink-fits-when">Fink fits when</h2>');
    for (const tool of ["crowdin", "lokalise", "weblate", "tolgee"]) expect(html).toContain(`<a class="tool-card" href="/compare/${tool}">`);
    expect(html).toContain("last checked October 11, 2026");
    expect(jsonLd(html).map(data => data["@type"])).toEqual(["BreadcrumbList", "CollectionPage"]);
  });

  test("the teams page shows who does each step and what Fink checks", () => {
    const html = renderPage(bySlug.get("teams")!, pages);
    const steps = [...html.matchAll(/<li class="step (\w+)">/g)].map(match => match[1]);
    expect(steps).toEqual(["translator", "translator", "fink", "developer", "developer"]);
    expect(html).toMatch(/<li class="step developer">[\s\S]*?Opens a pull request on GitHub/);
    expect(html).toContain("Fink does not open a pull request.");
    expect(html.match(/<span class="check-chip">/g)).toHaveLength(4);
    expect(html).toContain('<span class="check-chip">Missing {count} in German</span>');
    expect(html.match(/<li class="role-card /g)!.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain("Send this link to your translators: <code>fink.inlang.com/?repo=owner/repo&amp;project=project.inlang&amp;branch=translations</code>");
    expect(html).toMatch(/<img src="\/images\/editor.webp"[^>]* width="1840" height="1520" alt="Fink editor[^"]+"/);
  });

  test("the not-found page isn't indexed", () => {
    const html = renderNotFound(pages);
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).not.toContain('rel="canonical"');
    expect(html).not.toContain("application/ld+json");
  });

  test("sitemap, robots.txt and llms.txt list the site", () => {
    const xml = sitemap(pages);
    expect(xml).toContain(`<loc>${ORIGIN}/</loc>`);
    for (const page of pages) expect(xml).toContain(`<loc>${ORIGIN}/${page.slug}</loc>`);
    expect(robots()).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
    expect(robots()).toContain("Disallow: /api/");
    const llms = llmsTxt(pages);
    expect(llms.startsWith("# Fink\n\n> ")).toBe(true);
    for (const page of pages) expect(llms).toContain(`(${ORIGIN}/${page.slug}.md)`);
  });
});
