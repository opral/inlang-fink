import type { BundleNested, Declaration, MessageNested, Pattern } from "@inlang/sdk/browser";

// What a translator still has to do for one message in one language.
export type Issue =
  | { type: "missing-translation" }
  | { type: "missing-variable" | "extra-variable" | "missing-markup"; name: string }
  | { type: "missing-form"; matches: Record<string, string> };
export type IssueKind = "missing-translation" | "missing-form" | "placeholder";
export const issueKind = (issue: Issue): IssueKind => issue.type === "missing-translation" || issue.type === "missing-form" ? issue.type : "placeholder";

const empty = (pattern: Pattern) => pattern.every(part => part.type === "text" && !part.value.trim());
function placeholders(pattern: Pattern) {
  const variables = new Set<string>(), markup = new Set<string>();
  for (const part of pattern) {
    if (part.type === "expression" && part.arg.type === "variable-reference") variables.add(part.arg.name);
    if (part.type === "markup-start" || part.type === "markup-standalone") markup.add(part.name);
  }
  return { variables, markup };
}
const pluralCache = new Map<string, string[]>();
export function pluralCategories(locale: string, type: "cardinal" | "ordinal" = "cardinal"): string[] {
  const key = `${locale}:${type}`;
  let categories = pluralCache.get(key);
  if (!categories) {
    try { categories = new Intl.PluralRules(locale, { type }).resolvedOptions().pluralCategories as string[]; } catch { categories = []; }
    pluralCache.set(key, categories);
  }
  return categories;
}
/** Plural categories a selector must cover in `locale`, if it resolves to a plural declaration. */
function selectorCategories(name: string, declarations: Declaration[], locale: string): string[] | undefined {
  const declaration = declarations.find(value => value.name === name);
  if (declaration?.type !== "local-variable" || declaration.value.annotation?.name !== "plural") return;
  const type = declaration.value.annotation.options?.find(option => option.name === "type")?.value;
  return pluralCategories(locale, type?.type === "literal" && type.value === "ordinal" ? "ordinal" : "cardinal");
}
/** Every match combination the locale needs, for messages that select on plurals. */
export function requiredForms(message: MessageNested, declarations: Declaration[], locale: string): Record<string, string>[] {
  const axes = message.selectors.map(selector => {
    const plural = selectorCategories(selector.name, declarations, locale);
    if (plural) return { name: selector.name, keys: plural };
    const keys = new Set<string>();
    for (const variant of message.variants) for (const match of variant.matches) if (match.key === selector.name && match.type === "literal-match") keys.add(match.value);
    return { name: selector.name, keys: [...keys] };
  });
  if (!axes.some(axis => selectorCategories(axis.name, declarations, locale))) return [];
  return axes.reduce<Record<string, string>[]>((combos, axis) => combos.flatMap(combo => axis.keys.map(key => ({ ...combo, [axis.name]: key }))), [{}]);
}
const matchesOf = (variant: MessageNested["variants"][number]) => Object.fromEntries(variant.matches.map(match => [match.key, match.type === "literal-match" ? match.value : "*"]));

/** Issues for `locale` compared with the reference locale. */
export function messageIssues(bundle: BundleNested, locale: string, referenceLocale: string): Issue[] {
  const target = bundle.messages.find(message => message.locale === locale);
  if (!target || !target.variants.length || target.variants.every(variant => empty(variant.pattern))) return [{ type: "missing-translation" }];
  const issues: Issue[] = [];
  const reference = bundle.messages.find(message => message.locale === referenceLocale);
  if (reference && locale !== referenceLocale) {
    const expected = { variables: new Set<string>(), markup: new Set<string>() };
    for (const variant of reference.variants) { const found = placeholders(variant.pattern); found.variables.forEach(name => expected.variables.add(name)); found.markup.forEach(name => expected.markup.add(name)); }
    const missing = new Set<string>(), extra = new Set<string>(), missingMarkup = new Set<string>();
    for (const variant of target.variants) {
      if (empty(variant.pattern)) continue;
      const found = placeholders(variant.pattern);
      // A plural form may legitimately spell out "one" instead of using {count}.
      const pluralSelected = target.selectors.map(selector => selector.name).filter(name => selectorCategories(name, bundle.declarations, locale));
      for (const name of expected.variables) if (!found.variables.has(name) && !(variant.matches.length && pluralSelected.length && isPluralSource(name, bundle.declarations))) missing.add(name);
      for (const name of found.variables) if (!expected.variables.has(name)) extra.add(name);
      for (const name of expected.markup) if (!found.markup.has(name)) missingMarkup.add(name);
    }
    for (const name of missing) issues.push({ type: "missing-variable", name });
    for (const name of extra) issues.push({ type: "extra-variable", name });
    for (const name of missingMarkup) issues.push({ type: "missing-markup", name });
  }
  for (const combo of requiredForms(target, bundle.declarations, locale)) {
    const present = target.variants.some(variant => { const matches = matchesOf(variant); return Object.entries(combo).every(([key, value]) => matches[key] === value); });
    if (!present) issues.push({ type: "missing-form", matches: combo });
  }
  return issues;
}
/** Whether a variable feeds a plural selector (count in `countPlural = count: plural`). */
function isPluralSource(name: string, declarations: Declaration[]): boolean {
  return declarations.some(declaration => declaration.type === "local-variable" && declaration.value.annotation?.name === "plural" && declaration.value.arg.type === "variable-reference" && declaration.value.arg.name === name);
}
