import { describe, expect, test } from "vitest";
import { outputPath, parseRepository, resolveResourcePath } from "../src/repository";
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
