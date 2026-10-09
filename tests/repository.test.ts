import { describe, expect, test } from "vitest";
import { outputPath, parseRepository, projectScope, resolveResourcePath } from "../src/repository";
import type { ProjectSettings } from "@inlang/sdk/browser";
describe("repository file mapping", () => {
  test("restricts URLs and preserves project-relative resource paths", () => {
    expect(parseRepository("opral/example.git")).toEqual({ owner: "opral", name: "example" });
    expect(() => parseRepository("https://example.com/opral/repo")).toThrow();
    expect(() => parseRepository("https://github.com/opral/repo/tree/main")).toThrow();
    expect(resolveResourcePath("apps/web/project.inlang", "./messages/en.json")).toBe("apps/web/messages/en.json");
    expect(resolveResourcePath("apps/web/project.inlang", "../shared/en.json")).toBe("apps/shared/en.json");
    expect(() => resolveResourcePath("project.inlang", "../outside.json")).toThrow();
    expect(() => resolveResourcePath("project.inlang", "/outside.json")).toThrow();
  });
  test("resolves namespaced i18next output without colliding locale files", () => {
    const settings = { baseLocale: "en", locales: ["en"], "plugin.inlang.i18next": { pathPattern: { common: "./locales/{locale}/common.json", checkout: "./locales/{locale}/checkout.json" } } } as ProjectSettings;
    expect(outputPath(settings, "plugin.inlang.i18next", { locale: "en", name: "en.json", content: new Uint8Array(), metadata: { namespace: "checkout" } })).toBe("./locales/en/checkout.json");
    expect(() => outputPath(settings, "plugin.inlang.i18next", { locale: "en", name: "en.json", content: new Uint8Array() })).toThrow();
  });
});
test("history scope is the deepest directory shared by settings and resources", () => {
  expect(projectScope({ projectPath: "frontend/project.inlang", original: { "frontend/project.inlang/settings.json": "{}", "frontend/messages/en.json": "{}", "frontend/messages/de.json": "{}" } })).toBe("frontend");
  expect(projectScope({ projectPath: "project.inlang", original: { "project.inlang/settings.json": "{}", "messages/en.json": "{}" } })).toBe("");
  expect(projectScope({ projectPath: "ui/l10n/app.inlang", original: { "ui/l10n/app.inlang/settings.json": "{}", "ui/l10n/messages/en.json": "{}" } })).toBe("ui/l10n");
});
