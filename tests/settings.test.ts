import { expect, it } from "vitest";
import { settingsSignature, validateSettingsEdit } from "../src/settingsData";
const before = { baseLocale: "en", locales: ["en", "de"], modules: ["https://example.com/plugin.js"], "plugin.inlang.messageFormat": { pathPattern: "./messages/{locale}.json" } };
it("compares settings independently of JSON key order", () => {
  expect(settingsSignature(before)).toBe(settingsSignature({ locales: before.locales, modules: before.modules, baseLocale: "en", "plugin.inlang.messageFormat": before["plugin.inlang.messageFormat"] }));
});
it("accepts locale edits and rejects invalid locale lists or changed plugin configuration", () => {
  expect(() => validateSettingsEdit(before, { ...before, baseLocale: "de", locales: ["en", "de", "fr"] })).not.toThrow();
  expect(() => validateSettingsEdit(before, { ...before, baseLocale: "fr" })).toThrow("reference locale");
  expect(() => validateSettingsEdit(before, { ...before, locales: ["en", "en"] })).toThrow();
  expect(() => validateSettingsEdit(before, { ...before, modules: [] })).toThrow("only");
  expect(() => validateSettingsEdit(before, { ...before, "plugin.inlang.messageFormat": { pathPattern: "../secrets/{locale}.json" } })).toThrow("only");
});
