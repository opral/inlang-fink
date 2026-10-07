import { test, expect } from "@playwright/test";
const settings = { baseLocale: "en", locales: ["en", "de"], modules: [], "plugin.inlang.messageFormat": { pathPattern: "./messages/{locale}.json" } };
const resources: Record<string, string> = {
  "project.inlang/settings.json": JSON.stringify(settings),
  "messages/en.json": JSON.stringify({ hello: "Hello", items: [{ declarations: ["input count", "local countPlural = count: plural"], selectors: ["countPlural"], match: { "countPlural=one": "One item", "countPlural=*": "{count} items" } }] }),
  "messages/de.json": JSON.stringify({ hello: "Hallo" }),
};
async function stubApi(page: import("@playwright/test").Page, files = resources) {
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    let data: unknown;
    if (url.pathname === "/api/user") data = { login: "translator" };
    else if (url.pathname === "/api/github/tree") data = { head: "a".repeat(40), tree: "b".repeat(40), branch: "main", paths: Object.keys(files), projects: ["project.inlang"] };
    else if (url.pathname === "/api/github/branches") data = ["main"];
    else if (url.pathname === "/api/github/file") data = { content: files[url.searchParams.get("path")!] };
    else if (url.pathname === "/api/github/push") data = { head: "c".repeat(40), tree: "d".repeat(40), url: "https://github.com/example/repo/commit/ccc" };
    else throw new Error(`Unexpected request ${url}`);
    await route.fulfill({ json: data });
  });
}
test("production bundle loads plurals, edits, persists to OPFS, and pushes only edited files", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => { errors.push(error.message); console.log("PAGE ERROR", error.message); });
  page.on("console", message => { if (message.type() === "error") console.log("CONSOLE", message.text()); });
  await page.addInitScript(() => {
    const counters = window as typeof window & { sdkWorkerRequests: number };
    counters.sdkWorkerRequests = 0;
    Worker.prototype.postMessage = new Proxy(Worker.prototype.postMessage, {
      apply(target, worker, args) {
        counters.sdkWorkerRequests++;
        return Reflect.apply(target, worker, args);
      },
    });
  });
  await stubApi(page);
  await page.goto("/");
  await page.getByLabel("GitHub repository").fill("https://github.com/example/repo");
  await page.getByRole("button", { name: "Find projects" }).click();
  await page.getByRole("button", { name: "Open project" }).click();
  await expect(page.locator('[data-bundle="hello"]')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('[data-bundle="items"] inlang-variant')).toHaveCount(2);
  await page.locator('.language-filter [part="combobox"]').click();
  await page.getByRole("option", { name: "en ref", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-bundle="hello"] inlang-message')).toHaveCount(1);
  await page.getByRole("button", { name: /Clear (entry|selection)/ }).click();
  await expect(page.locator('[data-bundle="hello"] inlang-message')).toHaveCount(2);
  await page.getByRole("button", { name: /^Changes/ }).click();
  await expect(page.getByText("No changes to push.")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await page.locator('[data-bundle="items"] inlang-pattern-editor').first().evaluate(element => {
    const node = element as HTMLElement & { variant: unknown; originalVariantForTest?: unknown };
    node.originalVariantForTest = node.variant;
  });
  const pattern = page.locator('[data-bundle="hello"] inlang-pattern-editor').first().locator('[contenteditable]');
  await pattern.fill("Hello from Fink");
  await pattern.press("Tab");
  await expect(page.getByRole("status").filter({ hasText: "Draft saved locally" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Pending changes" })).toBeVisible();
  expect(await page.locator('[data-bundle="items"] inlang-pattern-editor').first().evaluate(element => {
    const node = element as HTMLElement & { variant: unknown; originalVariantForTest?: unknown };
    return node.variant === node.originalVariantForTest;
  })).toBe(true);
  await pattern.fill("Hello"); await pattern.press("Tab");
  await expect(page.getByRole("complementary", { name: "Pending changes" })).not.toBeVisible();
  await pattern.fill("Hello from Fink"); await pattern.press("Tab");
  const plural = page.locator('[data-bundle="items"] inlang-pattern-editor').first().locator('[contenteditable]');
  await plural.fill("A single item");
  await plural.press("Tab");
  await expect(page.getByRole("status").filter({ hasText: "Draft saved locally" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Pending changes" })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download project", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("repo.lix");
  await page.reload();
  await page.getByRole("button", { name: "Find projects" }).click();
  await page.getByRole("button", { name: "Open project" }).click();
  await expect(page.locator('[data-bundle="hello"] inlang-pattern-editor').first()).toContainText("Hello from Fink", { timeout: 60_000 });
  const request = page.waitForRequest(request => request.url().endsWith("/api/github/push"));
  const requestsBeforeReview = await page.evaluate(() => (window as typeof window & { sdkWorkerRequests: number }).sdkWorkerRequests);
  await page.getByRole("button", { name: "Review and push" }).click();
  await expect(page.locator('[data-diff-message="hello"] [data-diff-side="before"]')).toContainText("Hello");
  await expect(page.locator('[data-diff-message="hello"] [data-diff-side="after"]')).toContainText("Hello from Fink");
  await expect(page.locator('[data-diff-message="items"]')).toContainText("A single item");
  await expect(page.locator('[data-diff-message="items"] .diff-unchanged').first()).toHaveCSS("opacity", "0.3");
  await expect(page.locator('[data-diff-message="items"] inlang-bundle')).toHaveCount(2);
  await expect(page.locator('[data-diff-message="items"] .highlight-red').first()).toContainText("One item");
  await expect(page.locator('[data-diff-message="items"] .highlight-green').first()).toContainText("A single item");
  await expect(page.locator('[data-diff-message="items"] [data-diff-side="before"] inlang-pattern-editor').first()).toContainText("One item");
  await expect(page.locator('[data-diff-message="items"] [data-diff-side="after"] inlang-pattern-editor').first()).toContainText("A single item");
  expect(await page.evaluate(() => (window as typeof window & { sdkWorkerRequests: number }).sdkWorkerRequests)).toBe(requestsBeforeReview);
  await page.getByRole("button", { name: "Push changes to main" }).click();
  const payload = (await request).postDataJSON();
  expect(Object.keys(payload.files)).toEqual(["messages/en.json"]);
  expect(payload.head).toBe("a".repeat(40));
  expect(JSON.parse(payload.files["messages/en.json"]).hello).toBe("Hello from Fink");
  const item = JSON.parse(payload.files["messages/en.json"]).items[0];
  expect(item.selectors).toEqual(["countPlural"]);
  expect(item.match["countPlural=one"]).toBe("A single item");
  expect(item.match["countPlural=*"]).toBe("{count} items");
  await expect(page.getByText(/Pushed to main/)).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Pending changes" })).not.toBeVisible();
  expect(errors).toEqual([]);
});
test("creates plural variants for a missing translation using the published selector editor", async ({ page }) => {
  await stubApi(page);
  await page.goto("/");
  await page.getByLabel("GitHub repository").fill("https://github.com/example/repo");
  await page.getByRole("button", { name: "Find projects" }).click();
  await page.getByRole("button", { name: "Open project" }).click();
  const bundle = page.locator('[data-bundle="items"]');
  await bundle.getByRole("button", { name: "Add translation" }).click();
  const german = bundle.locator("inlang-message").nth(1);
  await german.locator("inlang-variant").hover();
  await german.getByRole("button", { name: "Add selector / plural" }).click();
  const dialog = page.getByRole("dialog", { name: "Add selector or plural" });
  await dialog.getByRole("combobox").click();
  await dialog.getByRole("option", { name: "countPlural", exact: true }).click();
  await dialog.getByRole("button", { name: "Add selector", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(german.locator("inlang-variant")).toHaveCount(3);
  await page.getByRole("button", { name: "Review and push" }).click();
  await expect(page.locator('[data-diff-message="items"] [data-diff-side="after"] inlang-message')).toHaveCount(2);
  await expect(page.locator('[data-diff-message="items"] [data-diff-side="before"] inlang-message')).toHaveCount(1);
  await expect(page.locator('[data-diff-message="items"] .highlight-selector-green')).toHaveCount(1);
});
test("opens the selected showcase directly and pages large catalogs without losing search results", async ({ page }) => {
  const catalog = Object.fromEntries(Array.from({ length: 26 }, (_, index) => [`demo${index.toString().padStart(2, "0")}`, `Message ${index}`]));
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/user") return route.fulfill({ json: null });
    expect(url.searchParams.get("owner")).toBe("pocket-id");
    expect(url.searchParams.get("repo")).toBe("pocket-id");
    if (url.pathname === "/api/github/tree") return route.fulfill({ json: { head: "a".repeat(40), tree: "b".repeat(40), branch: "main", paths: ["frontend/project.inlang/settings.json", "frontend/messages/en.json"], projects: ["frontend/project.inlang"] } });
    const path = url.searchParams.get("path");
    expect(["frontend/project.inlang/settings.json", "frontend/messages/en.json"]).toContain(path);
    return route.fulfill({ json: { content: JSON.stringify(path?.endsWith("settings.json") ? { ...settings, locales: ["en"] } : catalog) } });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Explore community projects" })).toBeVisible();
  await page.getByRole("button", { name: "Open Pocket ID", exact: true }).click();
  await expect(page.locator("[data-bundle]")).toHaveCount(25, { timeout: 90_000 });
  await expect(page).toHaveURL(/project=frontend%2Fproject.inlang/);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator("[data-bundle]")).toHaveCount(1);
  await page.getByLabel("Search messages", { exact: true }).fill("demo00");
  await expect(page.locator('[data-bundle="demo00"]')).toBeVisible();
});

test("offers typed plural matches, preserves custom text, and rejects invalid categories", async ({ page }) => {
  const files = { ...resources,
    "project.inlang/settings.json": JSON.stringify({ ...settings, locales: ["en", "de", "ar"] }),
    "messages/ar.json": resources["messages/en.json"],
    "messages/en.json": JSON.stringify({ ...JSON.parse(resources["messages/en.json"]), gender: [{ declarations: ["input gender"], selectors: ["gender"], match: { "gender=male": "He", "gender=female": "She", "gender=*": "They" } }] }),
  };
  await stubApi(page, files);
  await page.goto("/");
  await page.getByLabel("GitHub repository").fill("https://github.com/example/repo");
  await page.getByRole("button", { name: "Find projects" }).click();
  await page.getByRole("button", { name: "Open project" }).click();
  const english = page.locator('[data-bundle="items"] inlang-message').first();
  await expect(english.locator(".selector-type")).toHaveText("Cardinal plural", { timeout: 90_000 });
  const variant = english.locator("inlang-variant").first();
  await variant.getByRole("button", { name: "Match options for countPlural" }).click();
  await expect(page.getByRole("menuitem", { name: /^one/ })).toContainText("e.g. 1");
  await expect(page.getByRole("menuitem", { name: /^few/ })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: /^\*/ })).toContainText("Fallback");
  await page.getByRole("menuitem", { name: /^other/ }).click();
  const input = variant.getByRole("textbox", { name: "Match countPlural" });
  await expect(input).toHaveValue("other");
  await input.fill("few"); await input.press("Tab");
  await expect(variant.getByRole("alert")).toContainText("Choose one, other, *.");
  await input.fill("one"); await input.press("Tab");
  await expect(variant.getByRole("alert")).toHaveCount(0);
  const arabic = page.locator('[data-bundle="items"] inlang-message').nth(2);
  await arabic.locator("inlang-variant").first().getByRole("button", { name: "Match options for countPlural" }).click();
  await expect(page.getByRole("menuitem", { name: /^few/ })).toContainText("3");
  await expect(page.getByRole("menuitem", { name: /^many/ })).toBeVisible();
  await page.keyboard.press("Escape");
  const textVariant = page.locator('[data-bundle="gender"] inlang-variant').first();
  await textVariant.getByRole("button", { name: "Match options for gender" }).click();
  await expect(page.getByRole("menuitem", { name: /^female/ })).toBeVisible();
  await page.keyboard.press("Escape");
  const textInput = textVariant.getByRole("textbox", { name: "Match gender" });
  await textInput.fill("nonbinary"); await textInput.press("Tab");
  await expect(textInput).toHaveValue("nonbinary");
  await english.locator("inlang-variant").first().hover();
  await english.getByRole("button", { name: "Add selector / plural" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add selector or plural" });
  await dialog.getByRole("combobox").click();
  await expect(dialog.getByRole("option", { name: "countPlural", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator(".save-status")).toHaveText("Draft saved locally");
  await page.reload();
  await page.getByRole("button", { name: "Find projects" }).click();
  await page.getByRole("button", { name: "Open project" }).click();
  await expect(page.locator('[data-bundle="gender"] inlang-variant').first().getByRole("textbox", { name: "Match gender" })).toHaveValue("nonbinary", { timeout: 60_000 });
});

test("shared settings save to OPFS, appear in review, and push only settings", async ({ page }) => {
  await stubApi(page);
  await page.goto("/");
  await page.getByLabel("GitHub repository").fill("https://github.com/example/repo");
  await page.getByRole("button", { name: "Find projects" }).click();
  await page.getByRole("button", { name: "Open project" }).click();
  await expect(page.locator('[data-bundle="hello"]')).toBeVisible({ timeout: 90_000 });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const form = page.locator("inlang-settings");
  const reference = form.locator("string-input input");
  await expect(reference).toHaveValue("en");
  await reference.fill("fr");
  await form.getByRole("button", { name: "Save Changes", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("reference locale included");
  await expect(form.locator("string-input input")).toHaveValue("en");
  await form.locator('input[placeholder="Add new item"]').fill("fr");
  await form.locator("array-input").getByRole("button", { name: "Add", exact: true }).click();
  await form.locator("string-input input").fill("de");
  await form.locator('input[placeholder="Enter key"]').fill("exampleFeature");
  await form.locator('input[placeholder="Enter value"]').fill("true");
  await form.locator("object-input").getByRole("button", { name: "Add", exact: true }).click();
  await form.getByRole("button", { name: "Save Changes", exact: true }).click();
  await expect(page.locator(".save-status")).toHaveText("Draft saved locally");
  await expect(page.getByRole("button", { name: /^Changes/ })).toContainText("1");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator('[data-bundle="hello"] inlang-message')).toHaveCount(3);
  await page.reload();
  await page.getByRole("button", { name: "Find projects" }).click();
  await page.getByRole("button", { name: "Open project" }).click();
  await expect(page.locator('[data-bundle="hello"] inlang-message')).toHaveCount(3, { timeout: 60_000 });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(form.locator("string-input input")).toHaveValue("de");
  await expect(form.locator("array-input input:disabled")).toHaveCount(3);
  expect(await form.locator("array-input input:disabled").evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value))).toEqual(["en", "de", "fr"]);
  await page.getByRole("button", { name: /^Changes/ }).click();
  await expect(page.getByRole("article", { name: "Settings changes" })).toBeVisible();
  await expect(page.locator('[data-settings-side="before"]').first()).toContainText("en");
  await expect(page.locator('[data-settings-side="after"]').first()).toContainText("de");
  await expect(page.locator('[data-settings-side="after"]').nth(1)).toContainText("en, de, fr");
  const request = page.waitForRequest(request => request.url().endsWith("/api/github/push"));
  await page.getByRole("button", { name: "Push changes to main" }).click();
  const payload = (await request).postDataJSON();
  expect(Object.keys(payload.files)).toEqual(["project.inlang/settings.json"]);
  expect(JSON.parse(payload.files["project.inlang/settings.json"])).toEqual({ ...settings, baseLocale: "de", locales: ["en", "de", "fr"], experimental: { exampleFeature: true } });
  await expect(page.getByText(/Pushed to main/)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Changes/ })).toContainText("0");
});
