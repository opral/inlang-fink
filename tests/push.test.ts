import { expect, it } from "vitest";
import { loadProjectInMemory, newProject } from "@inlang/sdk";
import { exportResources, pluginsFor } from "../src/project";
import type { RepoContext } from "../src/repository";

// Formatting the plugin wouldn't write: key order, spacing, escapes, no $schema, no final newline.
const en = '{\n  "zeta": "Zeta",\n  "alpha":   "Caf\\u00e9",\n  "nested": { "home": "Home" }\n}';
const de = '{\n  "alpha": "Alpha (de)"\n}\n';

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
