import { describe, expect, it } from "vitest";
import { checkProject, findUsages, loadProjectInMemory, newProject, type ProjectSettings } from "@inlang/sdk";
import { editorPlugins } from "../src/project";
import { USAGE_SOURCES, usagePlugin } from "../src/sourcePaths";
import { sourceSnapshot, usagesFromReferences, usageState, describeUsage } from "../src/usage";
import { sourceScope } from "../src/repository";

/**
 * Usage in code for next-intl projects: the next-intl plugin's own analysis finds `t()` calls,
 * Fink hands it the right files and shows unused messages only when the analysis is complete.
 */
const settings = { baseLocale: "en", locales: ["en", "de"], modules: [], "plugin.inlang.nextIntl": { pathPattern: "./messages/{locale}.json" } } as ProjectSettings;
const en = JSON.stringify({
  Home: { title: "Welcome", refresh_failed: "Couldn't refresh {resource}", images: "images", legacy_banner: "Old banner" },
  Nav: { home: "Home", about: "About" },
  About: { title: "About us" },
});
const page = `import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export default function Page() {
  const t = useTranslations("Home");
  return <main>
    <h1>{t("title")}</h1>
    <p>{t("refresh_failed", { resource: t("images") })}</p>
  </main>;
}
`;
const nav = `import { getTranslations } from "next-intl/server";

export async function Nav() {
  const t = await getTranslations("Nav");
  return <nav><a href="/">{t("home")}</a><Button>{t("about")}</Button></nav>;
}
`;
// About.title is only called in MDX
const about = `import { useTranslations } from "next-intl";

export function Title() {
  const t = useTranslations("About");
  return <h1>{t("title")}</h1>;
}

<Title />
`;
const source = { "src/app/[locale]/page.tsx": page, "src/components/Nav.tsx": nav, "src/app/[locale]/about/page.mdx": about };

async function load(projectSettings = settings) {
  const project = await loadProjectInMemory({ blob: await newProject({ settings: projectSettings }), providePlugins: await editorPlugins(projectSettings) });
  if ("plugin.inlang.nextIntl" in projectSettings) await project.importFiles({ pluginKey: "plugin.inlang.nextIntl", files: [{ locale: "en", content: new TextEncoder().encode(en) }] });
  return project;
}
async function analyze(files: Record<string, string>) {
  const project = await load();
  const snapshot = sourceSnapshot(files, USAGE_SOURCES[usagePlugin(settings)!]!);
  const [usages, checks] = await Promise.all([findUsages({ project, files: snapshot }), checkProject({ project, files: snapshot, referenceLocale: "en" })]);
  await project.close();
  const unused = checks.diagnostics.filter(diagnostic => diagnostic.checkId === "unused-message").map(diagnostic => diagnostic.bundleId).sort();
  return { snapshot: snapshot.map(file => file.path), usages, unused, state: usageState(usages, {}, ""), byBundle: usagesFromReferences(usages.references, files) };
}

describe("next-intl usage in code", () => {
  it("uses the next-intl plugin's analysis, not the Paraglide matcher", async () => {
    expect(usagePlugin(settings)).toBe("plugin.inlang.nextIntl");
    expect((await editorPlugins(settings)).map(plugin => plugin.key)).toEqual(["plugin.inlang.nextIntl"]);
    expect((await editorPlugins({ ...settings, "plugin.inlang.nextIntl": undefined, "plugin.inlang.messageFormat": { pathPattern: "./messages/{locale}.json" } } as unknown as ProjectSettings)).map(plugin => plugin.key)).toEqual(["plugin.inlang.messageFormat", "plugin.inlang.mFunctionMatcher"]);
  });

  it("labels messages that no call reaches as unused, also counting calls in MDX", async () => {
    const result = await analyze(source);
    expect(result.usages.status).toBe("complete");
    expect(result.state).toEqual({ state: "ready", issues: [] });
    expect(result.unused).toEqual(["Home.legacy_banner"]);
    expect(result.snapshot).toContain("src/app/[locale]/about/page.mdx");
    expect(result.byBundle.get("About.title")?.[0]).toMatchObject({ path: "src/app/[locale]/about/page.mdx", line: 5, role: "Heading" });
  });

  it("shows where each message is used, with roles that don't depend on m.*() calls", async () => {
    const { byBundle } = await analyze(source);
    const title = byBundle.get("Home.title")![0]!;
    expect(title).toMatchObject({ path: "src/app/[locale]/page.tsx", line: 7, role: "Heading" });
    expect(title.snippet.lines[title.line - title.snippet.start]!.slice(title.from, title.to)).toBe('t("title")');
    expect(byBundle.get("Home.images")![0]!.role).toBe("Part of Home.refresh_failed");
    expect(byBundle.get("Home.refresh_failed")![0]!.role).toBe("Text");
    expect(byBundle.get("Nav.home")![0]!.role).toBe("Link");
    expect(byBundle.get("Nav.about")![0]!.role).toBe("Button");
    expect(describeUsage(byBundle.get("Home.images")![0]!)).toBe("Part of Home.refresh_failed · on Home");
  });

  it("a dynamic t(key) makes the analysis incomplete, with the location, and no message is labelled unused", async () => {
    const field = `import { useTranslations } from "next-intl";\n\nexport function Field({ name }: { name: string }) {\n  const t = useTranslations("Home");\n  return <label>{t(name)}</label>;\n}\n`;
    const result = await analyze({ ...source, "src/components/Field.tsx": field });
    expect(result.usages.status).toBe("incomplete");
    expect(result.unused).toEqual([]);
    expect(result.state.state).toBe("ready");
    const issues = result.state.state === "ready" ? result.state.issues : [];
    expect(issues).toEqual([expect.objectContaining({ path: "src/components/Field.tsx", start: { line: 5, column: 19 } })]);
    expect(issues[0]!.reason).toMatch(/dynamic/i);
  });

  it("Markdown that imports next-intl is analyzed (and reported as unsupported); a README naming next-intl is not", async () => {
    const files = {
      ...source,
      "README.md": "# Shop\n\nBuilt with next-intl. Call `useTranslations` in components:\n\n```tsx\nimport { useTranslations } from 'next-intl';\nconst t = useTranslations('Home');\n```\n",
      "src/app/[locale]/legal/page.md": "import { useTranslations } from 'next-intl';\n\n# Legal\n",
      "src/components/Widget.vue": "<template><p>Hello</p></template>",
    };
    const result = await analyze(files);
    expect(result.snapshot).toEqual(["src/app/[locale]/page.tsx", "src/components/Nav.tsx", "src/app/[locale]/about/page.mdx", "src/app/[locale]/legal/page.md"]);
    expect(result.usages.status).toBe("incomplete");
    expect(result.usages.issues).toEqual([expect.objectContaining({ path: "src/app/[locale]/legal/page.md" })]);
  });
});

describe("usage state", () => {
  it("oversized files, code outside the scanned package and code that calls no message are incomplete, not unused", () => {
    const reference = { bundleId: "Home.title", path: "src/app/page.tsx", start: { line: 1, column: 0 }, end: { line: 1, column: 10 } };
    expect(usageState({ status: "complete", references: [reference] }, { skipped: ["src/app/huge.tsx"] }, "")).toEqual({ state: "ready", issues: [{ path: "src/app/huge.tsx", reason: expect.stringContaining("512 KB") }] });
    expect(usageState({ status: "complete", references: [reference] }, { outside: ["packages/ui/Card.tsx"] }, "apps/web")).toEqual({ state: "ready", issues: [{ path: "packages/ui/Card.tsx", reason: expect.stringContaining("outside the scanned package (apps/web/)") }] });
    expect(usageState({ status: "complete", references: [] }, {}, "packages/i18n")).toEqual({ state: "ready", issues: [{ reason: expect.stringContaining("Fink scanned: packages/i18n/.") }] });
    // calls of keys that aren't this project's messages don't count
    expect(usageState({ status: "complete", references: [{ ...reference, bundleId: "Other.key" }] }, {}, "", id => id === "Home.title").state === "ready" && usageState({ status: "complete", references: [{ ...reference, bundleId: "Other.key" }] }, {}, "", id => id === "Home.title")).toMatchObject({ issues: [{ reason: expect.stringContaining("the whole repository") }] });
    expect(usageState({ status: "complete", references: [reference] }, {}, "")).toEqual({ state: "ready", issues: [] });
    expect(usageState({ status: "unavailable", reason: "The source snapshot is empty.", references: [] }, {}, "")).toEqual({ state: "unavailable", reason: expect.stringContaining("no code that can call messages in the whole repository") });
    // every file too large: the snapshot is empty, but Fink did find code
    expect(usageState({ status: "unavailable", reason: "The source snapshot is empty.", references: [] }, { skipped: ["src/app/huge.tsx"] }, "")).toEqual({ state: "ready", issues: [{ path: "src/app/huge.tsx", reason: expect.any(String) }] });
  });

  it("i18next has no usage analysis: the SDK reports it unavailable, never unused", async () => {
    const i18next = { baseLocale: "en", locales: ["en"], modules: [], "plugin.inlang.i18next": { pathPattern: "./locales/{locale}.json" } } as ProjectSettings;
    expect(usagePlugin(i18next)).toBeUndefined();
    const project = await load(i18next);
    expect((await editorPlugins(i18next)).map(plugin => plugin.key)).toEqual(["plugin.inlang.i18next"]);
    const result = await findUsages({ project, files: [{ path: "src/a.ts", content: "i18next.t('greeting')" }] });
    expect(result.status).toBe("unavailable");
    await project.close();
  });

  it("the scan covers the package that holds the project, not only the project folder", () => {
    const paths = ["package.json", "ui/package.json", "ui/src/App.tsx", "ui/l10n/app.inlang/settings.json", "apps/web/package.json"];
    expect(sourceScope("ui/l10n", paths)).toBe("ui");
    expect(sourceScope("apps/web", paths)).toBe("apps/web");
    expect(sourceScope("", paths)).toBe("");
    expect(sourceScope("src/i18n", ["src/App.tsx"])).toBe("");
  });
});
