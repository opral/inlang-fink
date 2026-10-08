// Which languages a translator works in: one source (the reference by default) and one or more
// targets, remembered per project. "Review all" shows every language.
export type LanguageFocus = { source: string; targets: string[]; all: boolean };
const key = (project: string) => `fink:languages:${project}`.toLowerCase();

export function languageName(locale: string): string {
  try { return new Intl.DisplayNames(["en"], { type: "language" }).of(locale) ?? locale; } catch { return locale; }
}

/** The project's languages that match the browser's preferences, best first. */
function browserLocales(locales: string[]): string[] {
  const preferred = typeof navigator === "undefined" ? [] : navigator.languages ?? [navigator.language];
  const result: string[] = [];
  for (const wanted of preferred) {
    const exact = locales.find(locale => locale.toLowerCase() === wanted.toLowerCase());
    const base = locales.find(locale => locale.toLowerCase() === wanted.toLowerCase().split("-")[0]);
    for (const match of [exact, base]) if (match && !result.includes(match)) result.push(match);
  }
  return result;
}

export function readFocus(project: string, locales: string[], baseLocale: string, todo: (locale: string) => number): LanguageFocus {
  try {
    const stored = JSON.parse(localStorage.getItem(key(project)) ?? "null") as LanguageFocus | null;
    if (stored && locales.includes(stored.source) && Array.isArray(stored.targets)) {
      const targets = stored.targets.filter(locale => locales.includes(locale) && locale !== stored.source);
      if (targets.length || stored.all) return { source: stored.source, targets, all: !!stored.all };
    }
  } catch { /* Storage can be unavailable; fall back to a default. */ }
  const candidates = locales.filter(locale => locale !== baseLocale);
  const browser = browserLocales(candidates)[0];
  const busiest = [...candidates].sort((a, b) => todo(b) - todo(a))[0];
  const target = browser ?? busiest;
  return { source: baseLocale, targets: target ? [target] : [], all: !target };
}

export function writeFocus(project: string, focus: LanguageFocus) {
  try { localStorage.setItem(key(project), JSON.stringify(focus)); } catch { /* optional */ }
}
