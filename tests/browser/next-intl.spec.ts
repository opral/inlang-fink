import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";

// A next-intl project: messages/{locale}.json with nested namespaces, an ICU plural and rich text.
const settings = { baseLocale: "en", locales: ["en", "de"], modules: [], "plugin.inlang.nextIntl": { pathPattern: "./messages/{locale}.json" } };
const en = `{
  "Home": {
    "title": "Welcome to {appName}",
    "cart": "{count, plural, =0 {Your cart is empty} one {You have # item} other {You have # items}}",
    "terms": "Please read the <b>terms</b> and our <link>privacy policy</link>."
  },
  "Checkout": {
    "Summary": {
      "title": "Order summary"
    }
  }
}
`;
const de = `{
  "Home": {
    "title": "Willkommen bei {appName}",
    "cart": "{count, plural, =0 {Dein Warenkorb ist leer} one {Du hast # Artikel} other {Du hast # Artikel}}",
    "terms": "Bitte lies die <b>AGB</b> und unsere <link>Datenschutzerklärung</link>."
  },
  "Checkout": {
    "Summary": {
      "title": "Bestellübersicht"
    }
  }
}
`;
const files: Record<string, string> = { "project.inlang/settings.json": JSON.stringify(settings), "messages/en.json": en, "messages/de.json": de };
// @inlang/plugin-next-intl 2.3 reads ICU plurals as forms and tags as markup; earlier versions as text.
const pluginVersion = JSON.parse(readFileSync(new URL("../../node_modules/@inlang/plugin-next-intl/package.json", import.meta.url), "utf8")).version as string;
const [major, minor] = pluginVersion.split(".").map(Number) as [number, number];
const icu = major > 2 || (major === 2 && minor >= 3);

test("a next-intl project opens with its namespaces, plurals and rich text, and a push changes only the edited line", async ({ page }) => {
  const pushes: { files: Record<string, string> }[] = [];
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    let data: unknown;
    if (url.pathname === "/api/user") data = { login: "translator" };
    else if (url.pathname === "/api/github/access") data = { push: true, signedIn: true };
    else if (url.pathname === "/api/github/tree") data = { head: "a".repeat(40), tree: "b".repeat(40), branch: "main", paths: Object.keys(files), projects: ["project.inlang"] };
    else if (url.pathname === "/api/github/branches") data = ["main"];
    else if (url.pathname === "/api/github/commits") data = [];
    else if (url.pathname === "/api/github/file") data = { content: files[url.searchParams.get("path")!] };
    else if (url.pathname === "/api/github/push") { pushes.push(route.request().postDataJSON()); data = { head: "c".repeat(40), tree: "d".repeat(40), url: "https://github.com/example/repo/commit/ccc" }; }
    else throw new Error(`Unexpected request ${url}`);
    await route.fulfill({ json: data });
  });
  await page.goto("/");
  await page.getByLabel("GitHub repository").fill("https://github.com/example/repo");
  await page.getByRole("button", { name: "Open", exact: true }).click();

  const reference = (id: string) => page.locator(`[data-bundle="${id}"] .message-row.reference .message-target`).first();
  const translation = (id: string) => page.locator(`[data-bundle="${id}"] .message-row:not(.reference) .message-target inlang-pattern-editor [contenteditable]`).first();
  await expect(reference("Home.title")).toContainText("Welcome to", { timeout: 90_000 });
  await expect(translation("Checkout.Summary.title")).toHaveText("Bestellübersicht");
  if (icu) {
    // `=0`, `one` and `other` are forms of one message, `#` is the number
    await expect(page.locator('[data-bundle="Home.cart"] .message-row.reference .form-label')).toHaveCount(3);
    await expect(page.locator('[data-bundle="Home.cart"]')).toContainText("Your cart is empty");
    await expect(page.locator('[data-bundle="Home.cart"]')).not.toContainText("plural");
    // tags are markup tokens, not text
    await expect(page.locator('[data-bundle="Home.terms"] .message-row.reference [data-inlang-token="markup-start"]')).toHaveCount(2);
  }

  const german = translation("Checkout.Summary.title");
  await german.fill("Bestellung"); await german.press("Tab");
  await expect(page.locator('[data-bundle="Checkout.Summary.title"] .message-status')).toHaveText("Edited");
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await page.getByRole("button", { name: "Push", exact: true }).click();
  await expect.poll(() => pushes.length).toBe(1);
  expect(pushes[0]!.files).toEqual({ "messages/de.json": de.replace('"Bestellübersicht"', '"Bestellung"') });
});
