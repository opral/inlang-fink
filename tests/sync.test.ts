import { expect, test } from "vitest";
import type { BundleNested, ProjectSettings } from "@inlang/sdk/browser";
import { bundleSignatures, changedLocales, mergeBundles, mergeSettings } from "../src/project";

let ids = 0;
const bundle = (id: string, texts: Record<string, string>): BundleNested => ({ id, declarations: [], messages: Object.entries(texts).map(([locale, text]) => {
  const messageId = `m${++ids}`;
  return { id: messageId, bundle_id: id, locale, selectors: [], variants: [{ id: `v${++ids}`, message_id: messageId, matches: [], pattern: [{ type: "text", value: text }] }] };
}) });
const text = (bundles: BundleNested[], id: string, locale: string) => (bundles.find(b => b.id === id)?.messages.find(m => m.locale === locale)?.variants[0]?.pattern[0] as { value?: string } | undefined)?.value;

test("remote changes apply, local edits survive, and the remote wins where both changed the same message", () => {
  const base = bundleSignatures([bundle("hello", { en: "Hello", de: "Hallo" }), bundle("bye", { en: "Bye", de: "Tschüss" }), bundle("old", { en: "Old" })]);
  const local = [bundle("hello", { en: "Hello", de: "Hallo Welt" }), bundle("bye", { en: "Bye", de: "Ciao" }), bundle("old", { en: "Old" }), bundle("mine", { en: "New in draft" })];
  const remote = [bundle("hello", { en: "Hello!", de: "Hallo" }), bundle("bye", { en: "Bye", de: "Auf Wiedersehen" }), bundle("theirs", { en: "New on GitHub" })];
  const { bundles, replaced } = mergeBundles(base, local, remote);
  expect(text(bundles, "hello", "en")).toBe("Hello!");          // remote change to another locale applies
  expect(text(bundles, "hello", "de")).toBe("Hallo Welt");      // local edit survives
  expect(text(bundles, "bye", "de")).toBe("Auf Wiedersehen");   // same message changed on both sides: remote wins
  expect(bundles.some(b => b.id === "old")).toBe(false);        // deleted on GitHub
  expect(text(bundles, "mine", "en")).toBe("New in draft");     // created in the draft
  expect(text(bundles, "theirs", "en")).toBe("New on GitHub");  // created on GitHub
  expect(replaced).toEqual(["bye"]);
  expect(bundles.find(b => b.id === "hello")!.messages.every(m => m.bundle_id === "hello")).toBe(true);
});

test("a bundle edited locally but deleted on GitHub follows GitHub and is reported", () => {
  const base = bundleSignatures([bundle("gone", { en: "Gone" })]);
  const { bundles, replaced } = mergeBundles(base, [bundle("gone", { en: "Edited" })], []);
  expect(bundles).toEqual([]);
  expect(replaced).toEqual(["gone"]);
});

test("settings keep local locale edits unless GitHub changed the same setting; plugin config always follows GitHub", () => {
  const plugin = { pathPattern: "./messages/{locale}.json" };
  const base = { baseLocale: "en", locales: ["en", "de"], "plugin.inlang.messageFormat": plugin } as ProjectSettings;
  const local = { ...base, locales: ["en", "de", "fr"] } as ProjectSettings;
  const remote = { ...base, "plugin.inlang.messageFormat": { pathPattern: "./i18n/{locale}.json" }, experimental: { flag: true } } as ProjectSettings;
  expect(mergeSettings(base, local, remote)).toEqual({ baseLocale: "en", locales: ["en", "de", "fr"], "plugin.inlang.messageFormat": { pathPattern: "./i18n/{locale}.json" }, experimental: { flag: true } });
  // GitHub removed de and added es; the locale added in the draft survives.
  expect(mergeSettings(base, local, { ...base, locales: ["en", "es"] } as ProjectSettings).locales).toEqual(["en", "es", "fr"]);
});

test("merged settings are always valid and keep locales added on either side", () => {
  const base = { baseLocale: "en", locales: ["en", "de"] } as ProjectSettings;
  // Local removed de while GitHub made de the reference locale: GitHub's reference locale stays valid.
  const invalid = mergeSettings(base, { ...base, locales: ["en"] } as ProjectSettings, { ...base, baseLocale: "de" } as ProjectSettings);
  expect(invalid.locales).toContain(invalid.baseLocale);
  // Local added fr while GitHub added es: both survive.
  expect(mergeSettings(base, { ...base, locales: ["en", "de", "fr"] } as ProjectSettings, { ...base, locales: ["en", "de", "es"] } as ProjectSettings).locales).toEqual(["en", "de", "es", "fr"]);
  // Local removed de while GitHub added es.
  expect(mergeSettings(base, { ...base, locales: ["en"] } as ProjectSettings, { ...base, locales: ["en", "de", "es"] } as ProjectSettings).locales).toEqual(["en", "es"]);
});

test("only locales whose messages changed are pushed", () => {
  const base = bundleSignatures([bundle("hello", { en: "Hello", de: "Hallo", fr: "Bonjour" }), bundle("gone", { en: "Gone", de: "Weg" })]);
  expect(changedLocales(base, [bundle("hello", { en: "Hello", de: "Hallo", fr: "Bonjour" }), bundle("gone", { en: "Gone", de: "Weg" })])).toEqual(new Set());
  expect(changedLocales(base, [bundle("hello", { en: "Hello", de: "Servus", fr: "Bonjour" }), bundle("gone", { en: "Gone", de: "Weg" })])).toEqual(new Set(["de"]));
  // A deleted bundle touches the locales it had; a new bundle the locales it has.
  expect(changedLocales(base, [bundle("hello", { en: "Hello", de: "Hallo", fr: "Bonjour" }), bundle("new", { fr: "Nouveau" })])).toEqual(new Set(["en", "de", "fr"]));
  // A translation added for a locale counts as a change in that locale.
  expect(changedLocales(bundleSignatures([bundle("hello", { en: "Hello" })]), [bundle("hello", { en: "Hello", it: "Ciao" })])).toEqual(new Set(["it"]));
});

test("a declaration added for one language only exports that language; a removed one exports all", () => {
  const before = bundle("files", { en: "Files: x", ru: "файлов" });
  const base = bundleSignatures([before]);
  const plural = { type: "local-variable" as const, name: "countPlural", value: { type: "expression" as const, arg: { type: "variable-reference" as const, name: "count" }, annotation: { type: "function-reference" as const, name: "plural", options: [] } } };
  const split: BundleNested = { ...structuredClone(before), declarations: [plural] };
  split.messages[1]!.selectors = [{ type: "variable-reference", name: "countPlural" }];
  expect(changedLocales(base, [split])).toEqual(new Set(["ru"]));
  const withDeclaration = bundleSignatures([{ ...before, declarations: [plural] }]);
  expect(changedLocales(withDeclaration, [before])).toEqual(new Set(["en", "ru"]));
});
