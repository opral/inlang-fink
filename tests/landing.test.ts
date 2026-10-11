import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { HERO_SHOT, Landing } from "../src/Landing";
import { avatarUrl, initials, type RecentProject } from "../src/recent";
import { showcases } from "../src/showcaseList";
import { renderLanding } from "../src/prerender";

const noop = () => {};
const render = (recent: RecentProject[]) => renderToStaticMarkup(createElement(Landing, { url: "", setUrl: noop, submit: noop, busy: false, recent, openRecent: noop, forget: noop, openShowcase: noop }));
const project = (owner: string, name: string, pending = 0): RecentProject => ({ owner, name, branch: "main", projectPath: "frontend/project.inlang", openedAt: Date.now() - 3_600_000, pending });

describe("landing page", () => {
  test("has the hero, the product screenshot with fixed dimensions, and the four features", () => {
    const html = render([]);
    expect(html).toContain("The translation editor for your GitHub repo.</h1>");
    expect(html).toContain('<label class="visually-hidden" for="repository-url">GitHub repository</label>');
    expect(html).toContain(`width="${HERO_SHOT.width}" height="${HERO_SHOT.height}"`);
    expect(html).toContain(`alt="${HERO_SHOT.alt}"`);
    expect(HERO_SHOT.alt).toMatch(/editor/);
    for (const feature of ["Side by side", "Checks", "Clean commits", "Nothing to sync"]) expect(html).toContain(`<h3>${feature}</h3>`);
    expect(html).not.toMatch(/How Fink works|beta/i);
  });

  test("hides your projects without recent projects and lists them otherwise", () => {
    expect(render([])).not.toContain("Your projects");
    const html = render([project("acme", "web", 2), project("opral", "inlang")]);
    expect(html).toContain('<h2 id="recent-title">Your projects</h2>');
    expect(html).toContain('aria-label="Open acme/web"');
    expect(html).toContain("main · frontend/project.inlang");
    expect(html).toContain('<span class="recent-pending">2 unpushed changes</span>');
    expect(html).toContain('<span class="recent-clean">No unpushed changes</span>');
    expect(html).toContain('aria-label="Remove opral/inlang and its local draft"');
    // Your projects come before the community projects.
    expect(html.indexOf("Your projects")).toBeLessThan(html.indexOf("Community projects"));
  });

  test("shows the owner's GitHub avatar, lazy-loaded, with initials as the fallback", () => {
    const html = render([project("acme-inc", "web")]);
    expect(html).toContain(`src="${avatarUrl("acme-inc")}"`);
    expect(html).toMatch(/<img class="card-icon" src="https:\/\/github.com\/acme-inc.png\?size=80" alt="" width="40" height="40" loading="lazy"/);
    expect(avatarUrl("acme")).toBe("https://github.com/acme.png?size=80");
    expect(initials("opral")).toBe("OP");
    expect(initials("acme-inc")).toBe("AI");
    expect(initials("x")).toBe("X");
  });

  test("shows every community project with its icon, repository and languages", () => {
    const html = render([]);
    expect(html).toContain("Community projects");
    expect(html).toContain("Open source apps that translate with inlang. Open one to try Fink.");
    expect(html).toContain("Add your repository");
    for (const showcase of showcases) {
      expect(showcase.icon).toMatch(/^https:\/\/avatars\.githubusercontent\.com\//);
      expect(html).toContain(`aria-label="Open ${showcase.name}"`);
      expect(html).toContain(`src="${showcase.icon.replace(/&/g, "&amp;")}"`);
      expect(html).toContain(`>${showcase.repository}<`);
      expect(html).toContain(`${showcase.locales} languages`);
    }
  });

  test("keeps the setup commands and the questions for crawlers in the prerendered page", () => {
    const html = renderLanding();
    expect(html).toContain("npx i18next-cli init --inlang");
    expect(html).toContain("npx @inlang/paraglide-js@latest init");
    expect(html).toContain("<summary>What does it cost?</summary>");
    expect(html).toContain('href="/teams"');
    expect(html).toContain('href="/compare"');
    expect(html).not.toContain("Your projects");
  });
});
