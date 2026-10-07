import React, { useMemo } from "react";
import { createComponent } from "@lit/react";
import { InlangSettings } from "@inlang/settings-component";
import type { ProjectSettings } from "@inlang/sdk/browser";
import { settingsSignature } from "./settingsData";
const SettingsElement = createComponent({ react: React, tagName: "inlang-settings", elementClass: InlangSettings, events: { onSetSettings: "set-settings" } });
export type SettingsChange = { before: ProjectSettings; after: ProjectSettings };
export function Settings({ settings, revision, save }: { settings: ProjectSettings; revision: number; save: (settings: ProjectSettings) => void }) {
  const rendered = useMemo(() => structuredClone(settings), [settings, revision]);
  return <SettingsElement key={revision} settings={rendered} onSetSettings={event => {
    if (event instanceof CustomEvent) {
      const next: ProjectSettings = structuredClone(event.detail.argument);
      // The component's generic object input emits text; SDK flags are booleans.
      if (next.experimental) next.experimental = Object.fromEntries(Object.entries(next.experimental).map(([key, value]) => [key, String(value) === "true" ? true : value])) as ProjectSettings["experimental"];
      save(next);
    }
  }} />;
}
export function SettingsDiff({ change }: { change: SettingsChange }) {
  const titles: Record<string, string> = { baseLocale: "Reference locale", locales: "Locales", experimental: "Experimental flags" };
  const display = (value: unknown): string => Array.isArray(value) ? value.join(", ") : value && typeof value === "object" ? Object.keys(value).join(", ") || "None" : String(value ?? "None");
  return <article className="settings-diff" aria-label="Settings changes"><h3>Project settings</h3>{Object.keys(titles).filter(key => settingsSignature(change.before[key]) !== settingsSignature(change.after[key])).map(key => <section key={key}><h4>{titles[key]}</h4><div className="settings-diff-columns"><div data-settings-side="before"><span>Before</span><p>{display(change.before[key])}</p></div><div data-settings-side="after"><span>After</span><p>{display(change.after[key])}</p></div></div></section>)}</article>;
}
