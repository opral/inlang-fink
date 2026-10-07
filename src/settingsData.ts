import type { ProjectSettings } from "@inlang/sdk/browser";

export function settingsSignature(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(settingsSignature).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${settingsSignature(entry)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
/** The shared form edits core settings; plugin paths and module URLs stay intact. */
export function validateSettingsEdit(before: ProjectSettings, after: ProjectSettings): void {
  if (!after || typeof after !== "object" || Array.isArray(after) || typeof after.baseLocale !== "string" || !Array.isArray(after.locales) || !after.locales.length || after.locales.some(locale => typeof locale !== "string" || !locale.trim()) || new Set(after.locales).size !== after.locales.length || !after.locales.includes(after.baseLocale)) throw new Error("Choose unique locales and a reference locale included in that list.");
  if (after.experimental !== undefined && (!after.experimental || typeof after.experimental !== "object" || Array.isArray(after.experimental) || Object.values(after.experimental).some(value => value !== true))) throw new Error("Experimental settings must be enabled flags.");
  const config = (settings: ProjectSettings) => Object.fromEntries(Object.entries(settings).filter(([key]) => !["baseLocale", "locales", "experimental"].includes(key)));
  if (settingsSignature(config(before)) !== settingsSignature(config(after))) throw new Error("The settings form can edit locales, reference locale, and experimental flags only.");
}
