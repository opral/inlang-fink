import { test, expect } from "@playwright/test";
const settings = { baseLocale: "en", locales: ["en", "de"], modules: [], "plugin.inlang.messageFormat": { pathPattern: "./messages/{locale}.json" } };
const resources: Record<string, string> = {
  "project.inlang/settings.json": JSON.stringify(settings),
  "messages/en.json": JSON.stringify({ hello: "Hello", items: [{ declarations: ["input count", "local countPlural = count: plural"], selectors: ["countPlural"], match: { "countPlural=one": "One item", "countPlural=*": "{count} items" } }] }),
  "messages/de.json": JSON.stringify({ hello: "Hallo" }),
};
const source: Record<string, string> = {
  "src/routes/+page.svelte": "<script>\n\timport { m } from '$lib/paraglide/messages';\n</script>\n\n<Button variant=\"primary\">\n\t{m.hello()}\n</Button>\n<p>{m.items({ count: 2 })}</p>\n",
  "src/lib/cart.ts": "import * as m from '$lib/paraglide/messages';\nexport const summary = (count: number) => toast.success(m.items({ count }));\n",
};
async function stubApi(page: import("@playwright/test").Page, files = resources, code = source) {
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    let data: unknown;
    if (url.pathname === "/api/user") data = { login: "translator" };
    else if (url.pathname === "/api/github/tree") data = { head: "a".repeat(40), tree: "b".repeat(40), branch: url.searchParams.get("branch") || "main", paths: Object.keys(files), projects: ["project.inlang"] };
    else if (url.pathname === "/api/github/branches") data = ["main", "translations"];
    else if (url.pathname === "/api/github/source") data = { files: code };
    else if (url.pathname === "/api/github/commits") data = [{ sha: "a".repeat(40), url: "https://github.com/example/repo/commit/aaa", message: "Add German copy\n\nReviewed", author: "translator", date: "2026-10-01T00:00:00Z" }];
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
  // Repositories with one project open directly.
  await page.getByRole("button", { name: "Open", exact: true }).click();
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
  await page.getByRole("button", { name: "Back to editor" }).first().click();
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
  await page.getByRole("button", { name: "Fink", exact: true }).click();
  await page.getByRole("button", { name: "Download project", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("repo.lix");
  // The URL keeps repository, branch, and project; reload reopens the local draft.
  await page.reload();
  await expect(page.locator('[data-bundle="hello"] inlang-pattern-editor').first()).toContainText("Hello from Fink", { timeout: 60_000 });
  const request = page.waitForRequest(request => request.url().endsWith("/api/github/push"));
  const requestsBeforeReview = await page.evaluate(() => (window as typeof window & { sdkWorkerRequests: number }).sdkWorkerRequests);
  await page.getByRole("button", { name: "Review", exact: true }).click();
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
  await page.getByRole("button", { name: "Commit", exact: true }).click();
  await page.getByRole("button", { name: "Commit and push to main" }).click();
  const payload = (await request).postDataJSON();
  expect(Object.keys(payload.files)).toEqual(["messages/en.json"]);
  expect(payload.message).toBe("Update hello and items");
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
  // Repositories with one project open directly.
  await page.getByRole("button", { name: "Open", exact: true }).click();
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
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(page.locator('[data-diff-message="items"] [data-diff-side="after"] inlang-message')).toHaveCount(2);
  await expect(page.locator('[data-diff-message="items"] [data-diff-side="before"] inlang-message')).toHaveCount(1);
  await expect(page.locator('[data-diff-message="items"] .highlight-selector-green')).toHaveCount(1);
});
test("opens the selected showcase directly and pages large catalogs without losing search results", async ({ page }) => {
  const catalog = Object.fromEntries(Array.from({ length: 26 }, (_, index) => [`demo${index.toString().padStart(2, "0")}`, `Message ${index}`]));
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/user") return route.fulfill({ json: null });
    if (url.pathname === "/api/github/source") return route.fulfill({ json: { files: {} } });
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
  await expect(page.locator("[data-bundle]")).toHaveCount(1);
  // Every term must match; matches in message text are highlighted.
  await page.getByLabel("Search messages", { exact: true }).fill("25 message");
  await expect(page.locator('[data-bundle="demo25"]')).toBeVisible();
  await expect(page.locator("[data-bundle]")).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => CSS.highlights.get("fink-search")?.size ?? 0)).toBe(2);
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
  // Repositories with one project open directly.
  await page.getByRole("button", { name: "Open", exact: true }).click();
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
  // The URL keeps repository, branch, and project; reload reopens the local draft.
  await page.reload();
  await expect(page.locator('[data-bundle="gender"] inlang-variant').first().getByRole("textbox", { name: "Match gender" })).toHaveValue("nonbinary", { timeout: 60_000 });
});

test("shared settings save to OPFS, appear in review, and push only settings", async ({ page }) => {
  await stubApi(page);
  await page.goto("/");
  await page.getByLabel("GitHub repository").fill("https://github.com/example/repo");
  // Repositories with one project open directly.
  await page.getByRole("button", { name: "Open", exact: true }).click();
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
  // The URL keeps repository, branch, and project; reload reopens the local draft.
  await page.reload();
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
  await page.getByRole("button", { name: "Commit", exact: true }).click();
  await page.getByRole("button", { name: "Commit and push to main" }).click();
  const payload = (await request).postDataJSON();
  expect(Object.keys(payload.files)).toEqual(["project.inlang/settings.json"]);
  expect(payload.message).toBe("Update project settings");
  expect(JSON.parse(payload.files["project.inlang/settings.json"])).toEqual({ ...settings, baseLocale: "de", locales: ["en", "de", "fr"], experimental: { exampleFeature: true } });
  await expect(page.getByText(/Pushed to main/)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Changes/ })).toContainText("0");
});

test("branch menu keeps a separate draft per branch and history marks the draft base", async ({ page }) => {
  await stubApi(page);
  await page.goto("/");
  await page.getByLabel("GitHub repository").fill("https://github.com/example/repo");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  const pattern = page.locator('[data-bundle="hello"] inlang-pattern-editor').first().locator('[contenteditable]');
  await expect(pattern).toBeVisible({ timeout: 90_000 });
  await pattern.fill("Hello from main"); await pattern.press("Tab");
  await expect(page.getByRole("complementary", { name: "Pending changes" })).toContainText("1 change on main");
  await page.getByRole("button", { name: "main", exact: true }).click();
  await page.getByRole("group", { name: "Branches" }).getByRole("button", { name: "translations" }).click();
  await expect(page).toHaveURL(/branch=translations/, { timeout: 90_000 });
  await expect(page.locator('[data-bundle="hello"] inlang-pattern-editor').first()).toContainText("Hello", { timeout: 90_000 });
  await expect(page.locator('[data-bundle="hello"] inlang-pattern-editor').first()).not.toContainText("from main");
  await expect(page.getByRole("complementary", { name: "Pending changes" })).not.toBeVisible();
  await page.getByRole("button", { name: "translations", exact: true }).click();
  await page.getByRole("group", { name: "Branches" }).getByRole("button", { name: "main" }).click();
  await expect(page.locator('[data-bundle="hello"] inlang-pattern-editor').first()).toContainText("Hello from main", { timeout: 90_000 });
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(page.getByText("Add German copy")).toBeVisible();
  await expect(page.getByText("Draft base")).toBeVisible();
  await expect(page.getByText("1 unpushed change saved in this browser")).toBeVisible();
  await page.getByRole("button", { name: "Fink", exact: true }).click();
  await page.getByRole("button", { name: "Open another repository…" }).click();
  await expect(page.getByRole("button", { name: "Open example/repo" }).first()).toContainText("1 unpushed");
});

test("shows where each message is used in code above its translations", async ({ page }) => {
  await stubApi(page, { ...resources, "messages/en.json": JSON.stringify({ ...JSON.parse(resources["messages/en.json"]!), legacy_banner: "Old banner" }) });
  await page.goto("/");
  await page.getByLabel("GitHub repository").fill("https://github.com/example/repo");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  const hello = page.locator('[data-bundle="hello"] .usage-peek');
  await expect(hello).toBeVisible({ timeout: 90_000 });
  await expect(hello.locator(".usage-role")).toHaveText("Button");
  await expect(hello.locator(".usage-code .hit")).toContainText("{m.hello()}");
  await expect(hello.locator(".usage-code mark")).toHaveText("m.hello()");
  await expect(hello.locator("a.usage-path")).toHaveAttribute("href", `https://github.com/example/repo/blob/${"a".repeat(40)}/src/routes/+page.svelte#L6`);
  const items = page.locator('[data-bundle="items"] .usage-peek');
  await expect(items).toContainText("1 of 2");
  const roles = [await items.locator(".usage-role").textContent()];
  await items.getByRole("button", { name: "Next usage" }).click();
  await expect(items).toContainText("2 of 2");
  roles.push(await items.locator(".usage-role").textContent());
  expect(roles.sort()).toEqual(["Text", "Toast"]);
  await expect(items.getByRole("button", { name: "Usage in code" })).toHaveAttribute("aria-expanded", "true");
  await items.getByRole("button", { name: "Usage in code" }).click();
  await expect(items.locator(".usage-code")).toHaveCount(0);
  await expect(items).toContainText("2 usages");
  await expect(items.getByRole("button", { name: "Usage in code" })).toHaveAttribute("aria-expanded", "false");
  await items.getByRole("button", { name: "Usage in code" }).click();
  await expect(items.locator(".usage-code")).toBeVisible();
  await expect(page.locator('[data-bundle="legacy_banner"] .usage-peek')).toContainText("Not used in code");
});

// A mutable GitHub: tests advance the branch between page loads and pushes.
async function stubRemote(page: import("@playwright/test").Page, remote: { head: string; files: Record<string, string>; shas: Record<string, string>; pushes: unknown[]; rejectNextPush?: boolean }) {
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    let data: unknown;
    if (url.pathname === "/api/user") data = { login: "translator" };
    else if (url.pathname === "/api/github/tree") data = { head: remote.head, tree: "b".repeat(40), branch: "main", paths: Object.keys(remote.files), shas: remote.shas, projects: ["project.inlang"] };
    else if (url.pathname === "/api/github/branches") data = ["main"];
    else if (url.pathname === "/api/github/file") data = { content: remote.files[url.searchParams.get("path")!] };
    else if (url.pathname === "/api/github/source") data = { files: {} };
    else if (url.pathname === "/api/github/push") {
      const body = route.request().postDataJSON();
      if (remote.rejectNextPush || body.head !== remote.head) { remote.rejectNextPush = false; remote.head = "e".repeat(40); return route.fulfill({ status: 409, json: { error: "The branch changed on GitHub while pushing." } }); }
      remote.pushes.push(body); remote.head = "c".repeat(40);
      data = { head: remote.head, tree: "d".repeat(40), url: "https://github.com/example/repo/commit/ccc" };
    } else throw new Error(`Unexpected request ${url}`);
    await route.fulfill({ json: data });
  });
}
const shasOf = (files: Record<string, string>) => Object.fromEntries(Object.keys(files).map(path => [path, `sha-${path}-${files[path]!.length}`]));

test("a newer GitHub branch is applied automatically: code-only commits move the base, translation commits merge", async ({ page }) => {
  const files = { ...resources };
  const remote = { head: "a".repeat(40), files, shas: shasOf(files), pushes: [] as unknown[] };
  await stubRemote(page, remote);
  await page.goto("/");
  await page.getByLabel("GitHub repository").fill("https://github.com/example/repo");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  const german = page.locator('[data-bundle="hello"] inlang-pattern-editor').nth(1).locator("[contenteditable]");
  await expect(german).toBeVisible({ timeout: 90_000 });
  await german.fill("Hallo aus Fink"); await german.press("Tab");
  await expect(page.getByRole("complementary", { name: "Pending changes" })).toContainText("1 change");

  // Someone pushes code only: the base moves silently and the draft stays.
  remote.head = "f".repeat(40);
  await page.reload();
  await expect(page.locator(".based-on")).toContainText("fffffff", { timeout: 90_000 });
  await expect(page.locator('[data-bundle="hello"] inlang-pattern-editor').nth(1)).toContainText("Hallo aus Fink");
  await expect(page.getByText(/reconcile|advanced/i)).toHaveCount(0);

  // Someone changes English and the same German message: English applies, GitHub wins for German.
  remote.files = { ...files, "messages/en.json": JSON.stringify({ ...JSON.parse(files["messages/en.json"]!), hello: "Hello there" }), "messages/de.json": JSON.stringify({ hello: "Servus" }) };
  remote.shas = shasOf(remote.files); remote.head = "9".repeat(40);
  await page.reload();
  await expect(page.locator(".based-on")).toContainText("9999999", { timeout: 90_000 });
  await expect(page.locator('[data-bundle="hello"] inlang-pattern-editor').first()).toContainText("Hello there");
  await expect(page.locator('[data-bundle="hello"] inlang-pattern-editor').nth(1)).toContainText("Servus");
  await expect(page.getByRole("status").filter({ hasText: "Your edit to hello was replaced by newer changes on GitHub." })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Pending changes" })).not.toBeVisible();
});

test("pushing after GitHub moved syncs the draft and retries without asking", async ({ page }) => {
  const files = { ...resources };
  const remote = { head: "a".repeat(40), files, shas: shasOf(files), pushes: [] as { head: string; files: Record<string, string> }[], rejectNextPush: false };
  await stubRemote(page, remote);
  await page.goto("/");
  await page.getByLabel("GitHub repository").fill("https://github.com/example/repo");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  const english = page.locator('[data-bundle="hello"] inlang-pattern-editor').first().locator("[contenteditable]");
  await expect(english).toBeVisible({ timeout: 90_000 });
  await english.fill("Hello from Fink"); await english.press("Tab");
  // GitHub advances between the pre-push check and the push itself.
  remote.rejectNextPush = true;
  await page.getByRole("button", { name: "Commit", exact: true }).click();
  await page.getByRole("button", { name: "Commit and push to main" }).click();
  await expect(page.getByText(/Pushed to main/)).toBeVisible({ timeout: 60_000 });
  expect(remote.pushes).toHaveLength(1);
  expect(remote.pushes[0]!.head).toBe("e".repeat(40));
  expect(JSON.parse(remote.pushes[0]!.files["messages/en.json"]!).hello).toBe("Hello from Fink");
  await expect(page.getByText(/reconcile/i)).toHaveCount(0);
});

test("a push after GitHub replaced an edit still tells the translator", async ({ page }) => {
  const files = { ...resources };
  const remote = { head: "a".repeat(40), files, shas: shasOf(files), pushes: [] as { files: Record<string, string> }[] };
  await stubRemote(page, remote);
  await page.goto("/");
  await page.getByLabel("GitHub repository").fill("https://github.com/example/repo");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  const pattern = (index: number) => page.locator('[data-bundle="hello"] inlang-pattern-editor').nth(index).locator("[contenteditable]");
  await expect(pattern(0)).toBeVisible({ timeout: 90_000 });
  await pattern(0).fill("Hello from Fink"); await pattern(0).press("Tab");
  await pattern(1).fill("Hallo aus Fink"); await pattern(1).press("Tab");
  // Meanwhile GitHub changes the same German message.
  remote.files = { ...files, "messages/de.json": JSON.stringify({ hello: "Servus" }) }; remote.shas = shasOf(remote.files); remote.head = "9".repeat(40);
  await page.getByRole("button", { name: "Commit", exact: true }).click();
  await page.getByRole("button", { name: "Commit and push to main" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Your edit to hello was replaced by newer changes on GitHub. Pushed to main." })).toBeVisible({ timeout: 60_000 });
  expect(Object.keys(remote.pushes[0]!.files)).toEqual(["messages/en.json"]);
});
