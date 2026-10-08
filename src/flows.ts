import { matchValue, requiredVariants, selectorGroups, variableNames, type BundleNested, type Declaration, type MessageNested, type Pattern } from "@inlang/sdk/browser";

// Pure helpers behind the translator flows for complex messages: markup, variables,
// per-language selectors and starting a translation from the source text.

type Variant = MessageNested["variants"][number];
type Part = Pattern[number];
type MarkupStart = Extract<Part, { type: "markup-start" }>;
type MarkupStandalone = Extract<Part, { type: "markup-standalone" }>;

/** "Link", "Bold", "Italic" or the tag itself for other markup. */
export function markupLabel(name: string): string {
  const lower = name.toLowerCase();
  if (["a", "link"].includes(lower)) return "Link";
  if (["b", "strong", "bold"].includes(lower)) return "Bold";
  if (["i", "em", "italic"].includes(lower)) return "Italic";
  if (["u", "underline"].includes(lower)) return "Underline";
  if (["br", "linebreak", "line-break"].includes(lower)) return "Line break";
  return `<${name}>`;
}

/** Plain text of a pattern, with variables written as {name}. */
export function patternText(pattern: Pattern): string {
  return pattern.map(part => part.type === "text" ? part.value : part.type === "expression" ? `{${part.arg.type === "variable-reference" ? part.arg.name : part.arg.value}}` : "").join("");
}

/** The text inside the first `<name>…</name>` of a pattern, e.g. "docs" for a link. */
export function markupText(pattern: Pattern, name: string): string {
  const start = pattern.findIndex(part => part.type === "markup-start" && part.name === name);
  if (start === -1) return "";
  const end = pattern.findIndex((part, index) => index > start && part.type === "markup-end" && part.name === name);
  return patternText(pattern.slice(start + 1, end === -1 ? undefined : end)).trim();
}

/** Markup a translation can use: the reference's paired tags (with options) and standalone tags. */
export function referenceMarkup(source: MessageNested | undefined): { paired: { part: MarkupStart; label: string; text: string }[]; standalone: { part: MarkupStandalone; label: string }[] } {
  const paired: { part: MarkupStart; label: string; text: string }[] = [], standalone: { part: MarkupStandalone; label: string }[] = [];
  for (const variant of source?.variants ?? []) for (const part of variant.pattern) {
    if (part.type === "markup-start" && !paired.some(value => value.part.name === part.name)) {
      const text = markupText(variant.pattern, part.name);
      paired.push({ part, text, label: text ? `${markupLabel(part.name)} like “${text}”` : markupLabel(part.name) });
    }
    if (part.type === "markup-standalone" && !standalone.some(value => value.part.name === part.name)) standalone.push({ part, label: markupLabel(part.name) });
  }
  return { paired, standalone };
}

/** The variable a reference markup wraps on its own (`<b>{client}</b>` → "client"), if any. */
export function markupVariable(source: MessageNested | undefined, name: string): string | undefined {
  for (const variant of source?.variants ?? []) {
    const start = variant.pattern.findIndex(part => part.type === "markup-start" && part.name === name);
    const inner = variant.pattern[start + 1], end = variant.pattern[start + 2];
    if (start !== -1 && inner?.type === "expression" && inner.arg.type === "variable-reference" && end?.type === "markup-end" && end.name === name) return inner.arg.name;
  }
}

/** Wraps the first `{variable}` of a pattern in markup, e.g. makes `{client}` bold like the reference. */
export function wrapVariable(pattern: Pattern, start: MarkupStart, variable: string): Pattern {
  const index = pattern.findIndex(part => part.type === "expression" && part.arg.type === "variable-reference" && part.arg.name === variable);
  if (index === -1) return pattern;
  return [...pattern.slice(0, index), structuredClone(start), pattern[index]!, { type: "markup-end", name: start.name }, ...pattern.slice(index + 1)];
}

/** Variables to suggest after "{": the reference's missing ones first, then used ones, then other inputs. */
export function variableSuggestions(source: MessageNested | undefined, target: Pattern, declarations: Declaration[]): { name: string; hint?: string }[] {
  const reference = [...new Set((source?.variants ?? []).flatMap(variant => variableNames(variant.pattern)))];
  const used = new Set(variableNames(target));
  const inputs = declarations.filter(declaration => declaration.type === "input-variable").map(declaration => declaration.name);
  const missing = reference.filter(name => !used.has(name)).map(name => ({ name, hint: "missing" }));
  const present = reference.filter(name => used.has(name)).map(name => ({ name, hint: "used" }));
  const others = inputs.filter(name => !reference.includes(name)).map(name => ({ name }));
  return [...missing, ...present, ...others];
}

/** Replaces (or, without `to`, removes) every `{from}` in a pattern. */
export function renameVariable(pattern: Pattern, from: string, to?: string): Pattern {
  const result: Pattern = [];
  for (const part of pattern) {
    if (part.type === "expression" && part.arg.type === "variable-reference" && part.arg.name === from) {
      if (to) result.push({ ...structuredClone(part), arg: { type: "variable-reference", name: to } });
      continue;
    }
    const last = result.at(-1);
    if (part.type === "text" && last?.type === "text") last.value += part.value;
    else result.push(structuredClone(part));
  }
  return result;
}

/** CLDR plural categories of a locale ("other" only for languages without plural forms). */
export function pluralCategories(locale: string): string[] {
  try { return new Intl.PluralRules(locale).resolvedOptions().pluralCategories; } catch { return ["other"]; }
}

/** The plural selector name for an input, if the bundle declares one (`local countPlural = count: plural`). */
function pluralDeclarationFor(input: string, declarations: Declaration[]): string | undefined {
  return declarations.find(declaration => declaration.type === "local-variable" && declaration.value.annotation?.name === "plural" && declaration.value.arg.type === "variable-reference" && declaration.value.arg.name === input)?.name;
}

/** Inputs a message could be split by number: declared as number/plural, or named like a count. */
export function numberInputs(message: MessageNested, declarations: Declaration[]): string[] {
  const used = new Set(message.variants.flatMap(variant => variableNames(variant.pattern)));
  return [...used].filter(name => {
    const typed = declarations.some(declaration => declaration.type === "local-variable" && declaration.value.arg.type === "variable-reference" && declaration.value.arg.name === name && ["plural", "number", "integer"].includes(declaration.value.annotation?.name ?? ""));
    // Names that count things; totals and amounts are usually sizes or money, not counts.
    return typed || /^(count|n|num|number|quantity)$|count$/i.test(name);
  });
}

export type Restructure = { declarations?: Declaration[]; selectors: MessageNested["selectors"]; variants: Variant[] };

/**
 * Splits a single-text message by a selector: by number (a plural of `input`) or by the keys
 * other languages already use for that selector. Every new form starts with the current text.
 */
export function splitMessage(bundle: BundleNested, message: MessageNested, by: { plural: string } | { selector: string }): Restructure {
  let declarations = bundle.declarations, selector: string;
  if ("plural" in by) {
    selector = pluralDeclarationFor(by.plural, declarations) ?? `${by.plural}Plural`;
    if (!declarations.some(declaration => declaration.name === selector)) {
      declarations = [...declarations, { type: "local-variable", name: selector, value: { type: "expression", arg: { type: "variable-reference", name: by.plural }, annotation: { type: "function-reference", name: "plural", options: [] } } }];
    }
  } else selector = by.selector;
  const selectors = [{ type: "variable-reference" as const, name: selector }];
  const text = message.variants[0]?.pattern ?? [];
  // The forms the inlang SDK requires: the locale's plural categories, or the values other languages use.
  const others = bundle.messages.filter(value => value.id !== message.id).flatMap(value => value.variants);
  const forms = requiredVariants({ locale: message.locale, selectors }, declarations, { referenceVariants: others });
  const variants = forms.map(matches => ({ id: crypto.randomUUID(), message_id: message.id, matches, pattern: structuredClone(text) }));
  return { declarations: declarations === bundle.declarations ? undefined : declarations, selectors, variants };
}

/**
 * Undoes a split: one text for every case, taken from the default form. A plural declaration
 * the split added (`countPlural`) goes too once nothing else selects on it.
 */
export function joinMessage(bundle: BundleNested, message: MessageNested): Restructure {
  const fallback = message.variants.find(variant => variant.matches.every(match => match.type === "catchall-match")) ?? message.variants.at(-1);
  const stillSelected = new Set(bundle.messages.filter(value => value.id !== message.id).flatMap(value => value.selectors.map(selector => selector.name)));
  const used = new Set(bundle.messages.flatMap(value => value.variants.flatMap(variant => variableNames(variant.pattern))));
  const unused = message.selectors.map(selector => selector.name).filter(name => !stillSelected.has(name) && !used.has(name) && bundle.declarations.some(declaration => declaration.name === name && declaration.type === "local-variable"));
  const declarations = unused.length ? bundle.declarations.filter(declaration => !unused.includes(declaration.name)) : undefined;
  return { declarations, selectors: [], variants: [{ id: crypto.randomUUID(), message_id: message.id, matches: [], pattern: structuredClone(fallback?.pattern ?? []) }] };
}

/**
 * A new translation shaped like the source: the same selectors (minus plurals the language
 * doesn't need, e.g. Japanese), one variant per required form, with the source text copied
 * (`copy`) or empty.
 */
export function messageFromSource(bundle: BundleNested, source: MessageNested | undefined, locale: string, messageId: string, copy: boolean): { selectors: MessageNested["selectors"]; variants: Variant[] } {
  if (!source || !source.selectors.length) return { selectors: [], variants: [{ id: crypto.randomUUID(), message_id: messageId, matches: [], pattern: copy ? structuredClone(source?.variants[0]?.pattern ?? []) : [] }] };
  // A plural the language doesn't need is dropped, unless it has exact numbers (ICU =0): those stay one choice.
  const singular = pluralCategories(locale).length <= 1;
  const dropped = singular ? selectorGroups(source, bundle.declarations).filter(group => group.isPlural && !group.exactSelector).flatMap(group => group.names) : [];
  const selectors = source.selectors.filter(selector => !dropped.includes(selector.name));
  // The forms the inlang SDK requires in the locale, with the source's select values and exact numbers.
  const forms = requiredVariants({ locale, selectors }, bundle.declarations, { referenceVariants: source.variants });
  const fallback = source.variants.find(variant => variant.matches.every(match => match.type === "catchall-match")) ?? source.variants.at(-1);
  const variants = forms.map(matches => {
    // The source form with the same keys, else the one that would match ("other" for "*").
    const keys = matches.map(match => [match.key, match.type === "literal-match" ? match.value : "*"] as const);
    const from = source.variants.find(variant => keys.every(([key, value]) => matchValue(variant, key) === value || (value === "*" && matchValue(variant, key) === "other")))
      ?? source.variants.find(variant => keys.every(([key, value]) => matchValue(variant, key) === value || matchValue(variant, key) === "*"))
      ?? fallback;
    return { id: crypto.randomUUID(), message_id: messageId, matches, pattern: copy ? structuredClone(from?.pattern ?? []) : [] };
  });
  return { selectors, variants };
}

/** Words of a pattern's text (letters only, 2+ characters). */
export function words(pattern: Pattern): string[] {
  return pattern.flatMap(part => part.type === "text" ? part.value.match(/\p{L}[\p{L}'’-]+/gu) ?? [] : []);
}

/** Source words still present in a translation that was started from the source text. */
export function untranslatedWords(seeded: string[], pattern: Pattern): string[] {
  const left = new Set(words(pattern));
  // Short words ("in", "to") are often the same in both languages; only longer ones are flagged.
  return [...new Set(seeded.filter(word => word.length >= 4 && left.has(word)))];
}
