import { test, expect } from "@playwright/test";

// The static pages built by scripts/build-site.mjs, served by the Worker next to the app.
test("docs pages are server-rendered HTML with their own metadata", async ({ request }) => {
  for (const [path, title] of [["/docs", "Fink docs"], ["/docs/getting-started", "Getting started with Fink"], ["/docs/checks", "Translation checks"], ["/compare/crowdin", "Fink vs Crowdin"]]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/html");
    const html = await response.text();
    expect(html).toContain(`<title>${title}`);
    expect(html).toContain(`<link rel="canonical" href="https://fink.inlang.com${path}">`);
    expect(html).toContain('<meta name="description" content="');
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(html).not.toContain('<div id="root">');
  }
  expect((await request.get("/docs/checks.md")).headers()["content-type"]).toContain("text/markdown");
});

test("unknown docs paths are 404s, and crawlers get robots.txt, sitemap.xml and llms.txt", async ({ request }) => {
  for (const path of ["/docs/does-not-exist", "/compare/does-not-exist"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(404);
    expect(await response.text()).toContain('<meta name="robots" content="noindex">');
  }
  expect(await (await request.get("/robots.txt")).text()).toContain("Sitemap: https://fink.inlang.com/sitemap.xml");
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("<loc>https://fink.inlang.com/docs/i18next</loc>");
  expect(await (await request.get("/llms.txt")).text()).toContain("https://fink.inlang.com/docs/getting-started.md");
});

test("the landing page's HTML has the page content before the app runs, and the app takes over", async ({ request, page }) => {
  const html = await (await request.get("/")).text();
  expect(html).toContain('<link rel="canonical" href="https://fink.inlang.com/">');
  expect(html).toContain('"@type":"SoftwareApplication"');
  expect(html).toContain("The translation editor for your GitHub repo.</h1>");
  expect(html).toContain('<img src="/images/editor.webp"');
  expect(html).not.toContain("fonts.googleapis.com");
  expect(html).toContain('href="/docs/set-up-a-project"');

  await page.route("**/api/**", route => route.fulfill({ json: null }));
  await page.goto("/");
  // React replaces the static copy with the live landing page.
  await expect(page.locator("#static-landing")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: /The translation editor/ })).toBeVisible();
  await expect(page.getByLabel("GitHub repository")).toBeEditable();
  await expect(page.getByRole("link", { name: "Set up in one command" })).toHaveAttribute("href", "/docs/set-up-a-project");
  // The screenshot reserves its space before it loads.
  const shot = page.getByRole("img", { name: /Fink editor showing/ });
  await expect(shot).toHaveAttribute("width", "1840");
  await expect.poll(() => shot.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => document.fonts.check("16px Geist"))).toBe(true);
  await page.locator("footer").getByRole("link", { name: "Docs" }).click();
  await expect(page).toHaveURL(/\/docs$/);
  await expect(page.getByRole("heading", { level: 1, name: "Fink documentation" })).toBeVisible();
});

test("a deep link to a project doesn't flash the static landing page", async ({ page }) => {
  await page.route("**/api/**", route => route.abort());
  await page.route("**/assets/*.js", route => route.abort());
  await page.goto("/?repo=example/repo&project=project.inlang");
  await expect(page.locator("#static-landing")).toBeHidden();
});

test("the compare and teams pages are designed pages with a table, steps and a working repository form", async ({ page }) => {
  await page.route("**/api/**", route => route.fulfill({ json: null }));
  await page.goto("/compare");
  const table = page.getByRole("table");
  await expect(table.getByRole("columnheader", { name: "Fink" })).toBeVisible();
  await expect(table.getByRole("rowheader")).toHaveCount(10);
  await expect(table.getByRole("row", { name: /Source code/ }).getByRole("img", { name: "Yes" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Fink vs Weblate/ })).toHaveAttribute("href", "/compare/weblate");
  await page.getByLabel("GitHub repository").fill("github.com/acme/web");
  await page.getByRole("button", { name: "Open" }).click();
  await expect(page).toHaveURL(/\/\?repo=github.com%2Facme%2Fweb$/);
  await expect(page.getByLabel("GitHub repository")).toHaveValue("github.com/acme/web");

  await page.goto("/teams");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your team edits translations. Nobody touches JSON or git.");
  await expect(page.locator(".steps > li")).toHaveCount(5);
  await expect(page.locator(".step.fink")).toContainText("Commits your changes to the branch");
  await expect(page.getByText("Send this link to your translators")).toBeVisible();
  await expect(page.getByRole("img", { name: /Fink editor/ })).toBeVisible();
});
