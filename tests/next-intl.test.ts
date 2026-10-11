import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadProjectInMemory, newProject, selectBundleNested, type MessageNested, type ProjectSettings } from "@inlang/sdk";
import { exportResources, pluginsFor } from "../src/project";
import type { RepoContext } from "../src/repository";
import { validateSettingsEdit } from "../src/settingsData";

/**
 * next-intl projects: `messages/{locale}.json` with nested namespaces, ICU plurals, selects and
 * rich text tags. A push changes only the edited entries.
 */

// @inlang/plugin-next-intl 2.3 reads messages as ICU (plurals as variants, tags as markup).
// Earlier versions read them as text; the ICU tests run once Fink uses 2.3.
const pluginVersion = JSON.parse(readFileSync(new URL("../node_modules/@inlang/plugin-next-intl/package.json", import.meta.url), "utf8")).version as string;
const [major, minor] = pluginVersion.split(".").map(Number) as [number, number];
const icu = major > 2 || (major === 2 && minor >= 3);

const en = `{
  "Home": {
    "title": "Welcome to {appName}",
    "cart": "{count, plural, =0 {Your cart is empty} one {You have # item} other {You have # items}}",
    "terms": "Please read the <b>terms</b> and our <link>privacy policy</link>.",
    "liked": "{gender, select, female {She} male {He} other {They}} liked your post",
    "escaped": "Write '{name}' to insert a name, it''s literal"
  },
  "Checkout": {
    "Summary": {
      "title": "Order summary"
    }
  },
  "Nav": {
    "links": ["Docs", "Blog"]
  }
}
`;
const de = `{
  "Home": {
    "title": "Willkommen bei {appName}",
    "cart": "{count, plural, =0 {Dein Warenkorb ist leer} one {Du hast # Artikel} other {Du hast # Artikel}}",
    "terms": "Bitte lies die <b>AGB</b> und unsere <link>Datenschutzerklärung</link>."
  },
  "Nav": {
    "links": ["Doku", "Blog"]
  }
}
`;
const settings = {
  baseLocale: "en", locales: ["en", "de"], modules: [],
  "plugin.inlang.nextIntl": { pathPattern: "./messages/{locale}.json" },
} as ProjectSettings;

async function load(files: Record<string, string> = { en, de }, projectSettings = settings) {
  const project = await loadProjectInMemory({ blob: await newProject({ settings: projectSettings }), providePlugins: pluginsFor(projectSettings) });
  const plans = await pluginsFor(projectSettings)[0]!.toBeImportedFiles!({ settings: projectSettings });
  await project.importFiles({ pluginKey: "plugin.inlang.nextIntl", files: plans.filter(plan => files[plan.locale] !== undefined).map(plan => ({ locale: plan.locale, content: new TextEncoder().encode(files[plan.locale]!), toBeImportedFilesMetadata: plan.metadata })) });
  const original = Object.fromEntries(plans.filter(plan => files[plan.locale] !== undefined).map(plan => [plan.path.replace(/^\.\//, ""), files[plan.locale]!]));
  const context = { projectPath: "project.inlang", settings: projectSettings, baseline: {}, original: { "project.inlang/settings.json": JSON.stringify(projectSettings), ...original } } as unknown as RepoContext;
  return { project, context };
}
const message = async (project: Awaited<ReturnType<typeof load>>["project"], bundleId: string, locale: string): Promise<MessageNested> =>
  (await selectBundleNested(project.db).where("inlang_bundle.id", "=", bundleId).executeTakeFirstOrThrow()).messages.find((m: MessageNested) => m.locale === locale)!;

describe("next-intl", () => {
  it("is a supported format, one per project", () => {
    expect(pluginsFor(settings).map(plugin => plugin.key)).toEqual(["plugin.inlang.nextIntl"]);
    expect(() => pluginsFor({ ...settings, "plugin.inlang.i18next": { pathPattern: "./locales/{locale}.json" } } as ProjectSettings)).toThrow("exactly one resource plugin");
  });

  it("reads nested namespaces, and exports every file byte for byte without edits", async () => {
    const { project, context } = await load();
    const ids = (await selectBundleNested(project.db).execute()).map(bundle => bundle.id).sort();
    expect(ids).toEqual(["Checkout.Summary.title", "Home.cart", "Home.escaped", "Home.liked", "Home.terms", "Home.title"]);
    expect(await exportResources({ project, context }, new Set(["en", "de"]))).toEqual({ "messages/en.json": en, "messages/de.json": de });
    await project.close();
  });

  it("a push changes only the edited entry, also next to plurals, tags and arrays", async () => {
    const { project, context } = await load();
    const title = await message(project, "Home.title", "de");
    await project.db.updateTable("inlang_variant").set({ pattern: [{ type: "text", value: "Hallo bei " }, { type: "expression", arg: { type: "variable-reference", name: "appName" } }] }).where("message_id", "=", title.id).execute();
    expect(await exportResources({ project, context }, new Set(["de"]))).toEqual({ "messages/de.json": de.replace('"Willkommen bei {appName}"', '"Hallo bei {appName}"') });
    await project.close();
  });

  it.runIf(icu)("plurals and rich text are variants and markup; an edited form and an edited link text change only their entry", async () => {
    const { project, context } = await load();
    const cart = await message(project, "Home.cart", "de");
    expect(cart.selectors.map(selector => selector.name)).toEqual(["countPluralExact", "countPlural"]);
    const one = cart.variants.find(variant => variant.matches.some(match => match.type === "literal-match" && match.value === "one"))!;
    await project.db.updateTable("inlang_variant").set({ pattern: [{ type: "text", value: "Du hast genau " }, ...one.pattern.filter(part => part.type === "expression"), { type: "text", value: " Artikel" }] }).where("id", "=", one.id).execute();
    const terms = await message(project, "Home.terms", "de");
    expect(terms.variants[0]!.pattern.filter(part => part.type.startsWith("markup")).map(part => `${part.type}:${(part as { name: string }).name}`)).toEqual(["markup-start:b", "markup-end:b", "markup-start:link", "markup-end:link"]);
    const pattern = terms.variants[0]!.pattern.map(part => part.type === "text" && part.value === "Datenschutzerklärung" ? { ...part, value: "Datenschutzhinweise" } : part);
    await project.db.updateTable("inlang_variant").set({ pattern }).where("id", "=", terms.variants[0]!.id).execute();
    expect(await exportResources({ project, context }, new Set(["de"]))).toEqual({
      "messages/de.json": de
        .replace("one {Du hast # Artikel}", "one {Du hast genau # Artikel}")
        .replace("<link>Datenschutzerklärung</link>", "<link>Datenschutzhinweise</link>"),
    });
    await project.close();
  });

  it.runIf(icu)("a new message is nested at the dots of its key, where next-intl reads it", async () => {
    const { project, context } = await load();
    await project.db.insertInto("inlang_bundle").values({ id: "Checkout.Summary.total", declarations: [] }).execute();
    await project.db.insertInto("inlang_message").values({ id: "total-en", bundle_id: "Checkout.Summary.total", locale: "en", selectors: [] }).execute();
    await project.db.insertInto("inlang_variant").values({ id: "total-en-variant", message_id: "total-en", matches: [], pattern: [{ type: "text", value: "Total {braces}" }] }).execute();
    const files = await exportResources({ project, context }, new Set(["en"]));
    expect(JSON.parse(files["messages/en.json"]!).Checkout.Summary).toEqual({ title: "Order summary", total: "Total '{'braces'}'" });
    // nothing else changes
    expect(files["messages/en.json"]!.split("\n").filter(line => !en.split("\n").includes(line))).toEqual([
      '      "title": "Order summary",',
      `      "total": "Total '{'braces'}'"`,
    ]);
    await project.close();
  });

  it.runIf(icu)("a new locale's file is written nested, as next-intl reads it", async () => {
    const withFrench = { ...settings, locales: ["en", "de", "fr"] } as ProjectSettings;
    const { project, context } = await load({ en, de }, withFrench);
    await project.db.insertInto("inlang_message").values({ id: "title-fr", bundle_id: "Home.title", locale: "fr", selectors: [] }).execute();
    await project.db.insertInto("inlang_variant").values({ id: "title-fr-variant", message_id: "title-fr", matches: [], pattern: [{ type: "text", value: "Bienvenue sur " }, { type: "expression", arg: { type: "variable-reference", name: "appName" } }] }).execute();
    const files = await exportResources({ project, context }, new Set(["fr"]));
    expect(Object.keys(files)).toEqual(["messages/fr.json"]);
    expect(JSON.parse(files["messages/fr.json"]!)).toEqual({ Home: { title: "Bienvenue sur {appName}" } });
    await project.close();
  });

  it("with a sourceLanguageFilePath, the settings form can't change the reference locale, whose file it is", () => {
    const withSourceFile = { ...settings, "plugin.inlang.nextIntl": { pathPattern: "./messages/{locale}.json", sourceLanguageFilePath: "./messages/main.json" } } as ProjectSettings;
    expect(() => validateSettingsEdit(withSourceFile, { ...withSourceFile, baseLocale: "de" } as ProjectSettings)).toThrow("./messages/main.json");
    expect(() => validateSettingsEdit(withSourceFile, { ...withSourceFile, locales: ["en", "de", "fr"] } as ProjectSettings)).not.toThrow();
    expect(() => validateSettingsEdit(settings, { ...settings, baseLocale: "de" } as ProjectSettings)).not.toThrow();
  });

  it("with files per namespace, a message outside the namespaces is reported by name before pushing", async () => {
    const namespaced = { ...settings, "plugin.inlang.nextIntl": { pathPattern: { Home: "./messages/{locale}/home.json" } } } as ProjectSettings;
    const project = await loadProjectInMemory({ blob: await newProject({ settings: namespaced }), providePlugins: pluginsFor(namespaced) });
    await project.importFiles({ pluginKey: "plugin.inlang.nextIntl", files: [{ locale: "en", content: new TextEncoder().encode('{"title":"Home"}'), toBeImportedFilesMetadata: { namespace: "Home" } }] });
    await project.db.insertInto("inlang_bundle").values({ id: "Other.title", declarations: [] }).execute();
    await project.db.insertInto("inlang_message").values({ id: "other-en", bundle_id: "Other.title", locale: "en", selectors: [] }).execute();
    await project.db.insertInto("inlang_variant").values({ id: "other-en-variant", message_id: "other-en", matches: [], pattern: [{ type: "text", value: "Other" }] }).execute();
    const context = { projectPath: "project.inlang", settings: namespaced, baseline: {}, original: { "project.inlang/settings.json": JSON.stringify(namespaced), "messages/en/home.json": '{"title":"Home"}' } } as unknown as RepoContext;
    await expect(exportResources({ project, context }, new Set(["en"]))).rejects.toThrow('"Other.title" must start with one of the namespaces of pathPattern (Home.)');
    await project.close();
  });

  it("namespace files: an edit is written to its namespace's file", async () => {
    const namespaced = { ...settings, "plugin.inlang.nextIntl": { pathPattern: { Home: "./messages/{locale}/home.json", Nav: "./messages/{locale}/nav.json" } } } as ProjectSettings;
    const files = { en: '{\n  "title": "Home"\n}\n', de: '{\n  "title": "Start"\n}\n' };
    const project = await loadProjectInMemory({ blob: await newProject({ settings: namespaced }), providePlugins: pluginsFor(namespaced) });
    const nav = { en: '{"about":"About"}', de: '{"about":"Über"}' };
    await project.importFiles({ pluginKey: "plugin.inlang.nextIntl", files: [
      ...(["en", "de"] as const).map(locale => ({ locale, content: new TextEncoder().encode(files[locale]), toBeImportedFilesMetadata: { namespace: "Home" } })),
      ...(["en", "de"] as const).map(locale => ({ locale, content: new TextEncoder().encode(nav[locale]), toBeImportedFilesMetadata: { namespace: "Nav" } })),
    ] });
    const context = { projectPath: "project.inlang", settings: namespaced, baseline: {}, original: { "project.inlang/settings.json": JSON.stringify(namespaced), "messages/en/home.json": files.en, "messages/de/home.json": files.de, "messages/en/nav.json": nav.en, "messages/de/nav.json": nav.de } } as unknown as RepoContext;
    expect((await selectBundleNested(project.db).execute()).map(bundle => bundle.id).sort()).toEqual(["Home.title", "Nav.about"]);
    const about = await message(project, "Nav.about", "de");
    await project.db.updateTable("inlang_variant").set({ pattern: [{ type: "text", value: "Über uns" }] }).where("message_id", "=", about.id).execute();
    expect(await exportResources({ project, context }, new Set(["de"]))).toEqual({ "messages/de/home.json": files.de, "messages/de/nav.json": '{"about":"Über uns"}' });
    await project.close();
  });
});
