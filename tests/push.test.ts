import { expect, it } from "vitest";
import { loadProjectInMemory, newProject } from "@inlang/sdk";
import { bundleSignatures, exportResources, pluginsFor, preparePush, readBundles, type LocalProject } from "../src/project";
import type { RepoContext } from "../src/repository";

// Formatting the plugin wouldn't write: key order, spacing, escapes, no $schema, no final newline.
const en = '{\n  "zeta": "Zeta",\n  "alpha":   "Caf\\u00e9",\n  "nested": { "home": "Home" }\n}';
const de = '{\n  "alpha": "Alpha (de)"\n}\n';

it.each(["plugin.inlang.nextIntl", "plugin.inlang.messageFormat"])("a description-only push includes changed metadata and no unchanged translations (%s)", async pluginKey => {
  const settings = { baseLocale: "en", locales: ["en", "de"], modules: [], [pluginKey]: { pathPattern: "./messages/{locale}.json" } };
  const project = await loadProjectInMemory({ blob: await newProject({ settings }), providePlugins: pluginsFor(settings) });
  const en = '{\n  "save": "Save"\n}\n', de = '{\n  "save": "Speichern"\n}\n';
  try {
    await project.importFiles({ pluginKey, files: [{ locale: "en", content: new TextEncoder().encode(en) }, { locale: "de", content: new TextEncoder().encode(de) }] });
    const context = { projectPath: "project.inlang", settings, baseline: {}, bundleBaseline: bundleSignatures(await readBundles(project)), original: { "project.inlang/settings.json": JSON.stringify(settings), "messages/en.json": en, "messages/de.json": de } } as unknown as RepoContext;
    const local: LocalProject = { project, context, name: "description-push", close: () => project.close() };
    await project.db.updateTable("inlang_bundle").set({ description: "Save the document" }).where("id", "=", "save").execute();
    const { files, pruned } = await preparePush(local);
    expect(pruned).toBe(false);
    if (pluginKey === "plugin.inlang.nextIntl") {
      expect(Object.keys(files)).toEqual(["project.inlang/descriptions.json"]);
      expect(JSON.parse(files["project.inlang/descriptions.json"]!)).toEqual({ version: 1, descriptions: { save: "Save the document" } });
    } else {
      expect(Object.keys(files)).toEqual(["messages/en.json"]);
      expect(JSON.parse(files["messages/en.json"]!).save[0].description).toBe("Save the document");
    }
  } finally { await project.close(); }
});

it("a push only changes the edited messages of the repository's files", async () => {
  const settings = {
    baseLocale: "en", locales: ["en", "de"], modules: [],
    "plugin.inlang.messageFormat": { pathPattern: "./messages/{locale}.json" },
  };
  const project = await loadProjectInMemory({ blob: await newProject({ settings }), providePlugins: pluginsFor(settings) });
  await project.importFiles({ pluginKey: "plugin.inlang.messageFormat", files: [
    { locale: "en", content: new TextEncoder().encode(en) },
    { locale: "de", content: new TextEncoder().encode(de) },
  ] });
  const message = await project.db.selectFrom("inlang_message").where("bundle_id", "=", "zeta").where("locale", "=", "en").select("id").executeTakeFirstOrThrow();
  await project.db.updateTable("inlang_variant").set({ pattern: [{ type: "text", value: "Zeta!" }] }).where("message_id", "=", message.id).execute();
  const context = {
    projectPath: "project.inlang", settings, baseline: {},
    original: { "messages/en.json": en, "messages/de.json": de },
  } as unknown as RepoContext;
  const files = await exportResources({ project, context }, new Set(["en"]));
  expect(files).toEqual({ "messages/en.json": en.replace('"Zeta"', '"Zeta!"') });
  await project.close();
});

it("deleting a locale's last message keeps the rest of its file", async () => {
  const settings = {
    baseLocale: "en", locales: ["en", "fr"], modules: [],
    "plugin.inlang.messageFormat": { pathPattern: "./messages/{locale}.json" },
  };
  const en = '{\n\t"$schema": "https://inlang.com/schema/inlang-message-format",\n\t"hello": "Hello"\n}\n';
  const fr = '{\r\n\t"$schema": "https://inlang.com/schema/inlang-message-format",\r\n\t"hello": "Bonjour"\r\n}\r\n';
  const project = await loadProjectInMemory({ blob: await newProject({ settings }), providePlugins: pluginsFor(settings) });
  await project.importFiles({ pluginKey: "plugin.inlang.messageFormat", files: [
    { locale: "en", content: new TextEncoder().encode(en) },
    { locale: "fr", content: new TextEncoder().encode(fr) },
  ] });
  const message = await project.db.selectFrom("inlang_message").where("bundle_id", "=", "hello").where("locale", "=", "fr").select("id").executeTakeFirstOrThrow();
  await project.db.deleteFrom("inlang_variant").where("message_id", "=", message.id).execute();
  await project.db.deleteFrom("inlang_message").where("id", "=", message.id).execute();
  const context = {
    projectPath: "project.inlang", settings, baseline: {},
    original: { "project.inlang/settings.json": JSON.stringify(settings), "messages/en.json": en, "messages/fr.json": fr },
  } as unknown as RepoContext;
  const files = await exportResources({ project, context }, new Set(["fr"]));
  expect(files).toEqual({ "messages/fr.json": '{\r\n\t"$schema": "https://inlang.com/schema/inlang-message-format"\r\n}\r\n' });
  await project.close();
});


it("exports companion descriptions beside the project and can read them back without runtime keys", async () => {
 const settings = { baseLocale: "en", locales: ["en"], modules: [], "plugin.inlang.i18next": { pathPattern: "./messages/{locale}.json" } };
 const make = async () => loadProjectInMemory({ blob: await newProject({ settings }), providePlugins: pluginsFor(settings) });
 const project = await make();
 const runtime = '{"save":"Save"}';
 await project.importFiles({ pluginKey: "plugin.inlang.i18next", files: [{ locale: "en", content: new TextEncoder().encode(runtime) }] });
 await project.db.updateTable("inlang_bundle").set({ description: "Save money, shopping CTA" }).where("id", "=", "save").execute();
 const context = { projectPath: "project.inlang", settings, baseline: {}, original: { "project.inlang/settings.json": JSON.stringify(settings), "messages/en.json": runtime } } as unknown as RepoContext;
 const files = await exportResources({ project, context }, new Set(["en"]));
 expect(JSON.parse(files["messages/en.json"]!)).toEqual({ save: "Save" });
 expect(JSON.parse(files["project.inlang/descriptions.json"]!)).toEqual({ version: 1, descriptions: { save: "Save money, shopping CTA" } });
 const restored = await make();
 await restored.importFiles({ pluginKey: "plugin.inlang.i18next", files: [{ locale: "en", content: new TextEncoder().encode(files["messages/en.json"]!) }, { locale: "", content: new TextEncoder().encode(files["project.inlang/descriptions.json"]!), toBeImportedFilesMetadata: { inlangDescriptions: true } }] });
 expect((await restored.db.selectFrom("inlang_bundle").select("description").where("id", "=", "save").executeTakeFirstOrThrow()).description).toBe("Save money, shopping CTA");
 await restored.db.updateTable("inlang_bundle").set({ description: null }).where("id", "=", "save").execute();
 const cleared = await exportResources({ project: restored, context: { ...context, original: { ...context.original, ...files } } }, new Set(["en"]));
 expect(JSON.parse(cleared["project.inlang/descriptions.json"]!).descriptions).toEqual({});
 await restored.close(); await project.close();
});
