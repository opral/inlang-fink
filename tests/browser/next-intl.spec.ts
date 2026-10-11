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

// A next-intl app: Home.title in a page, Checkout.Summary.title only in MDX, Home.cart and Home.terms nowhere.
const app: Record<string, string> = {
  "src/app/[locale]/page.tsx": `import { useTranslations } from "next-intl";\n\nexport default function Page() {\n  const t = useTranslations("Home");\n  return <h1>{t("title", { appName: "Shop" })}</h1>;\n}\n`,
  "src/app/[locale]/checkout/page.mdx": `import { useTranslations } from "next-intl";\n\nexport function Summary() {\n  const t = useTranslations("Checkout.Summary");\n  return <h2>{t("title")}</h2>;\n}\n\n<Summary />\n`,
};
async function stubApi(page: import("@playwright/test").Page, options: { files?: Record<string, string>; code?: Record<string, string>; unanalyzed?: { skipped?: string[]; outside?: string[] }; pushes?: { files: Record<string, string> }[]; sourceRequests?: URL[] } = {}) {
  const { files: resources = files, code = app, unanalyzed = {}, pushes = [], sourceRequests = [] } = options;
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    let data: unknown;
    if (url.pathname === "/api/user") data = { login: "translator" };
    else if (url.pathname === "/api/github/access") data = { push: true, signedIn: true };
    else if (url.pathname === "/api/github/tree") data = { head: "a".repeat(40), tree: "b".repeat(40), branch: "main", paths: [...Object.keys(resources), ...Object.keys(code)], projects: ["project.inlang"] };
    else if (url.pathname === "/api/github/branches") data = ["main"];
    else if (url.pathname === "/api/github/commits") data = [];
    else if (url.pathname === "/api/github/file") data = { content: resources[url.searchParams.get("path")!] };
    else if (url.pathname === "/api/github/source") { sourceRequests.push(url); data = { files: code, skipped: [], outside: [], ...unanalyzed }; }
    else if (url.pathname === "/api/github/push") { pushes.push(route.request().postDataJSON()); data = { head: "c".repeat(40), tree: "d".repeat(40), url: "https://github.com/example/repo/commit/ccc" }; }
    else throw new Error(`Unexpected request ${url}`);
    await route.fulfill({ json: data });
  });
}
async function openRepository(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByLabel("GitHub repository").fill("https://github.com/example/repo");
  await page.getByRole("button", { name: "Open", exact: true }).click();
}

test("a next-intl project opens with its namespaces, plurals and rich text, and a push changes only the edited line", async ({ page }) => {
  const pushes: { files: Record<string, string> }[] = [];
  await stubApi(page, { pushes });
  await openRepository(page);

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

test("next-intl: unused messages, where each message is used (also in MDX), with the code on GitHub", async ({ page }) => {
  const sourceRequests: URL[] = [];
  await stubApi(page, { sourceRequests });
  await openRepository(page);
  const title = page.locator('[data-bundle="Home.title"]');
  await expect(title.locator(".message-where")).toHaveText("A heading on Home · code", { timeout: 90_000 });
  expect(sourceRequests[0]!.searchParams.get("plugin")).toBe("plugin.inlang.nextIntl");
  await title.getByRole("button", { name: "code" }).click();
  await expect(title.locator(".usage-code mark")).toHaveText('t("title", { appName: "Shop" })');
  await expect(title.locator("a.usage-path")).toHaveAttribute("href", `https://github.com/example/repo/blob/${"a".repeat(40)}/src/app/%5Blocale%5D/page.tsx#L5`);
  // only called in MDX
  const summary = page.locator('[data-bundle="Checkout.Summary.title"]');
  await expect(summary.locator(".message-where")).toHaveText("A heading on Checkout · code");
  await expect(summary.locator(".message-status", { hasText: "Not used in code" })).toHaveCount(0);
  await expect(page.locator('[data-bundle="Home.cart"] .message-status')).toHaveText("Not used in code");
  await expect(page.locator('[data-bundle="Home.terms"] .message-status')).toHaveText("Not used in code");
  await expect(page.getByRole("button", { name: /Usage in code/ })).toHaveCount(0);
});

test("next-intl: a dynamic t(key) makes usage incomplete, says where, and labels no message unused", async ({ page }) => {
  const field = `import { useTranslations } from "next-intl";\n\nexport function Field({ name }: { name: string }) {\n  const t = useTranslations("Home");\n  return <label>{t(name)}</label>;\n}\n`;
  await stubApi(page, { code: { ...app, "src/components/Field.tsx": field } });
  await openRepository(page);
  await expect(page.locator('[data-bundle="Home.title"] .message-where')).toHaveText("A heading on Home · code", { timeout: 90_000 });
  const status = page.getByRole("button", { name: "Usage in code incomplete" });
  await expect(status).toBeVisible();
  await expect(page.locator(".message-status", { hasText: "Not used in code" })).toHaveCount(0);
  await status.click();
  const issue = page.getByRole("list", { name: "Unresolved usage" }).getByRole("listitem");
  await expect(issue).toHaveCount(1);
  await expect(issue).toContainText("dynamic message key");
  await expect(issue.getByRole("link")).toHaveText("src/components/Field.tsx:5");
  await expect(issue.getByRole("link")).toHaveAttribute("href", `https://github.com/example/repo/blob/${"a".repeat(40)}/src/components/Field.tsx#L5`);
});

test("i18next: Fink says usage in code is unavailable instead of hiding it", async ({ page }) => {
  const i18next = { baseLocale: "en", locales: ["en", "de"], modules: [], "plugin.inlang.i18next": { pathPattern: "./locales/{locale}.json" } };
  const sourceRequests: URL[] = [];
  await stubApi(page, { files: { "project.inlang/settings.json": JSON.stringify(i18next), "locales/en.json": '{"greeting":"Hello"}', "locales/de.json": '{"greeting":"Hallo"}' }, sourceRequests });
  await openRepository(page);
  await expect(page.locator('[data-bundle="greeting"]')).toBeVisible({ timeout: 90_000 });
  const status = page.getByRole("button", { name: "Usage in code unavailable" });
  await expect(status).toBeVisible();
  await status.click();
  await expect(page.locator(".usage-panel")).toContainText("Fink can't analyze i18next code yet");
  await expect(page.locator(".message-status", { hasText: "Not used in code" })).toHaveCount(0);
  expect(sourceRequests).toHaveLength(0);
});

test("next-intl: files Fink didn't analyze, or code that calls no message, make usage incomplete instead of labelling messages unused", async ({ page }) => {
  await stubApi(page, { unanalyzed: { skipped: ["src/app/[locale]/huge.tsx"], outside: ["packages/ui/src/Card.tsx"] } });
  await openRepository(page);
  await expect(page.locator('[data-bundle="Home.title"] .message-where')).toHaveText("A heading on Home · code", { timeout: 90_000 });
  const status = page.getByRole("button", { name: "Usage in code incomplete" });
  await expect(status).toBeVisible();
  await expect(page.locator(".message-status", { hasText: "Not used in code" })).toHaveCount(0);
  await status.click();
  const issues = page.getByRole("list", { name: "Unresolved usage" }).getByRole("listitem");
  await expect(issues).toHaveCount(2);
  await expect(issues.nth(0)).toContainText("Larger than 512 KB");
  await expect(issues.nth(1)).toContainText("outside the scanned package");
  await expect(issues.nth(1).getByRole("link")).toHaveAttribute("href", `https://github.com/example/repo/blob/${"a".repeat(40)}/packages/ui/src/Card.tsx`);
});

test("next-intl: code that calls no message at all is incomplete, not every message unused", async ({ page }) => {
  await stubApi(page, { code: { "src/lib/format.ts": "export const format = (value: number) => value.toFixed(2);\n" } });
  await openRepository(page);
  const status = page.getByRole("button", { name: "Usage in code incomplete" });
  await expect(status).toBeVisible({ timeout: 90_000 });
  await expect(page.locator(".message-status", { hasText: "Not used in code" })).toHaveCount(0);
  await status.click();
  await expect(page.locator(".usage-panel")).toContainText("No message is called in the code Fink scanned");
});
