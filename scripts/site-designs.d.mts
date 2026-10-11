// Types for scripts/site-designs.mjs, used by tests/site.test.ts.
export function splitSections(markdown: string): { intro: unknown[]; sections: { title: string; id: string; tokens: unknown[] }[] };
export function leadOf(text: string): [string, string];
export const COMPARE_MARKS: Record<string, (string | undefined)[]>;
export const TEAMS_LINK: string;
export function stepIcon(role: string, text: string): string;
