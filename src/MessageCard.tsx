import React, { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createComponent } from "@lit/react";
import { InlangPatternEditor, InlangPatternView, InlangMessageForms, InlangMessagePreview, pluralExamples, type ChangeEventDetail, type Match } from "@inlang/editor-component";
import { isNumericKey, isPluralSelector, missingVariants, resolveInputVariable, selectorGroups, variableNames, type BundleNested, type CheckDiagnostic, type Declaration, type MessageNested, type Pattern, type ProjectSettings, type SelectorGroup } from "@inlang/sdk/browser";
import { Editor } from "./Editor";
import { Dropdown } from "./Menu";
import { Modal } from "./Modal";
import { UsageCode } from "./UsagePeek";
import { describeUsage, type Usage } from "./usage";
import { languageName, type LanguageFocus } from "./languages";
import { SparkleIcon, type MachineTranslationRequest } from "./MachineTranslate";
import { joinMessage, markupLabel, markupVariable, wrapVariable, messageFromSource, numberInputs, pluralCategories, referenceMarkup, renameVariable, splitMessage, untranslatedWords, variableSuggestions, words, type Restructure } from "./flows";
import { seeded } from "./seeded";
import { isMissing, missingNumbers, missingSelector, type Issue } from "./issues";

const PatternEditor = createComponent({ react: React, tagName: "inlang-pattern-editor", elementClass: InlangPatternEditor });
const PatternView = createComponent({ react: React, tagName: "inlang-pattern-view", elementClass: InlangPatternView });
const Forms = createComponent({ react: React, tagName: "inlang-message-forms", elementClass: InlangMessageForms, events: { onSelectVariant: "select-variant", onAddVariant: "add-variant" } });
const Preview = createComponent({ react: React, tagName: "inlang-message-preview", elementClass: InlangMessagePreview, events: { onVariantMatch: "variant-match" } });

type Variant = MessageNested["variants"][number];
export type CardStatus = { tone: "todo" | "defect" | "neutral"; label: string };
// Props are primitives or stable references so typing in one message re-renders only that card.
type Props = {
  bundle: BundleNested; settings: ProjectSettings; focus: LanguageFocus;
  /** This bundle's inlang SDK diagnostics (checkProject), compared with the focused source language. */
  diagnostics?: CheckDiagnostic[];
  usages?: Usage[]; code?: { url: string; scope: string }; replaced?: boolean; edited?: boolean; unused?: boolean;
  /** Saves an edit; typing is debounced, `immediate` writes right away (one-click fixes). */
  change: (detail: ChangeEventDetail, immediate?: boolean) => void; addLocale: (bundle: BundleNested, locale: string) => void; removeBundle: (id: string) => void;
  addVariant: (bundleId: string, variant: Variant) => void; removeVariant: (bundleId: string, variantId: string) => void;
  addMessage: (bundle: BundleNested, locale: string, shape: { id: string; selectors: MessageNested["selectors"]; variants: Variant[] }) => void;
  restructure: (bundleId: string, messageId: string, next: Restructure) => void;
  machineTranslate: (request: MachineTranslationRequest) => void;
};

/** One status per card, most urgent first. `formName` names a form by its variant ("0", "one"). */
export function cardStatus(issues: { locale: string; issue: Issue }[], flags: { edited?: boolean; replaced?: boolean; unused?: boolean; stillSource?: number; sourceName?: string; formName?: (locale: string, variantId: string) => string | undefined }, several: boolean): CardStatus | undefined {
  const missing = issues.filter(({ issue }) => isMissing(issue));
  if (missing.length) return { tone: "todo", label: several ? `Missing in ${missing.map(({ locale }) => languageName(locale)).join(", ")}` : "Missing" };
  for (const { issue, locale } of issues) {
    if (issue.checkId === "missing-variable" || issue.checkId === "unknown-variable") return { tone: "defect", label: `${issue.checkId === "unknown-variable" ? "Unexpected" : "Missing"} {${issue.name}} in ${languageName(locale)}` };
  }
  for (const { issue, locale } of issues) if (issue.checkId === "missing-markup") return { tone: "defect", label: `${markupLabel(issue.name)} missing in ${languageName(locale)}` };
  for (const { issue, locale } of issues) { const unsplit = missingSelector(issue); if (unsplit) { const numbers = missingNumbers(unsplit); return { tone: "todo", label: `${numbers ? `No form for ${listOf(numbers)}` : `Not split by {${unsplit.name}}`}${several ? ` in ${languageName(locale)}` : ""}` }; } }
  const empty = issues.flatMap(({ issue, locale }) => issue.checkId === "empty-variant" ? [{ issue, locale }] : []);
  if (empty.length === 1) { const [{ issue, locale }] = empty as [typeof empty[number]], name = flags.formName?.(locale, issue.variantId); return { tone: "todo", label: `${name ? `Form ${name}` : "A form"} is empty${several ? ` in ${languageName(locale)}` : ""}` }; }
  if (empty.length) return { tone: "todo", label: `${empty.length} forms are empty` };
  const forms = issues.filter(({ issue }) => issue.checkId === "missing-variant");
  if (forms.length) return { tone: "todo", label: `${forms.length} ${forms.length === 1 ? "form" : "forms"} missing` };
  if (flags.stillSource) return { tone: "todo", label: flags.stillSource === 1 ? `Still in ${flags.sourceName}` : `${flags.stillSource} forms still in ${flags.sourceName}` };
  if (flags.edited) return { tone: "neutral", label: "Edited" };
  if (flags.replaced) return { tone: "neutral", label: "Updated from GitHub" };
  if (flags.unused) return { tone: "neutral", label: "Not used in code" };
}

const isSimple = (message: MessageNested) => !message.selectors.length && message.variants.length <= 1;
/** The form that matches anything; shown when a message has several. */
const defaultVariant = (message: MessageNested) => message.variants.find(variant => variant.matches.every(match => match.type === "catchall-match")) ?? message.variants.at(-1);
/** The label of a key of a selector group: "other" for a plural's catch-all, "any other" for a select's. */
const keyLabel = (group: SelectorGroup, key: string) => key === "*" ? (group.isPlural ? "other" : "any other") : key;
// "one · female", "0" for an ICU exact number, "other" for a plural's catch-all, "default form" when nothing is matched.
const matchLabel = (variant: Variant, message: MessageNested, declarations: Declaration[]) => {
  // The inlang SDK's selector groups: an exact number and the plural of the same input are one choice.
  const groups = selectorGroups(message, declarations);
  if (groups.every(group => !group.isPlural && group.keyOf(variant) === "*")) return "default form";
  // A non-plural catch-all names its input ("any actorGender"), so "any other · other" doesn't happen.
  return groups.map(group => { const key = group.keyOf(variant); return key === "*" && !group.isPlural ? `any ${group.input}` : keyLabel(group, key); }).join(" · ");
};

/**
 * Focuses an editor, e.g. after the button that was focused went away. A new editor focuses once it has
 * rendered (a microtask, before the next key event), so text typed right after "+ Add form" lands in it.
 */
const focusEditor = (editor: InlangPatternEditor | null | undefined) => editor?.focus();
const listOf = (items: string[]) => items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

/** What English does with a piece of markup, for the fix note ("links “docs”"). */
function markupVerb(name: string, text: string) {
  const label = markupLabel(name), quoted = text ? `“${text}”` : "some words";
  if (label === "Link") return `links ${quoted}`;
  if (label === "Bold") return `makes ${quoted} bold`;
  if (label === "Italic") return `puts ${quoted} in italics`;
  return `uses ${label} on ${quoted}`;
}

/** The one-click fix for markup around a variable: "Make {client} bold", "Link {email}". */
function markupAction(name: string, variable: string) {
  const label = markupLabel(name);
  if (label === "Link") return `Link {${variable}}`;
  if (label === "Bold" || label === "Italic" || label === "Underline") return `Make {${variable}} ${label.toLowerCase()}`;
  return `Wrap {${variable}} in ${label}`;
}

type FormRow = { key: string; label: string; hint?: string; variant?: Variant; matches: Match[]; required: boolean };
/**
 * One row per form of a message with one selector group (one selector, or ICU's exact number + plural),
 * in the inlang SDK's order: exact numbers, plural categories, other values, the catch-all. Forms the SDK
 * requires but no variant covers (`missingVariants`, the `missing-variant` check) are rows without a variant.
 */
function formRows(message: MessageNested, declarations: Declaration[], group: SelectorGroup, referenceVariants?: Variant[]): FormRow[] {
  // Numbers with their own form (ICU =0) are not examples of a category: English "other" is 2, 3, 4… next to 0.
  const examples: Record<string, string> = group.plural ? pluralExamples(message.locale, group.plural.type, { exclude: group.keys.filter(isNumericKey) }) : {};
  const hint = (key: string) => group.isPlural && isNumericKey(key) ? "exactly" : examples[key === "*" ? "other" : key];
  const missing = new Map(missingVariants(message, declarations, { referenceVariants }).map(matches => [group.keyOf({ matches }), matches]));
  const rows: FormRow[] = [], used = new Set<Variant>();
  const push = (key: string, variant: Variant | undefined, matches: Match[]) => { if (variant) used.add(variant); rows.push({ key, label: keyLabel(group, key), hint: hint(key), variant, matches, required: group.requiredKeys.includes(key) || (group.isPlural && key === "other") }); };
  for (const key of group.keys) {
    const variant = message.variants.find(value => !used.has(value) && group.keyOf(value) === key);
    if (variant) push(key, variant, variant.matches);
    else if (missing.has(key)) push(key, undefined, missing.get(key)!);
  }
  for (const variant of message.variants) if (!used.has(variant)) push(group.keyOf(variant), variant, variant.matches);
  return rows;
}

type Notes = { missing: string[]; extra: { name: string; suggestion?: string }[]; markup: { part: Extract<Pattern[number], { type: "markup-start" }>; text: string }[]; standalone: Extract<Pattern[number], { type: "markup-standalone" }>[] };
/** The SDK's diagnostics for one form, with the reference markup needed to fix them. */
function formNotes(issues: Issue[], variantId: string, markup: ReturnType<typeof referenceMarkup>): Notes | undefined {
  const own = issues.filter(issue => "variantId" in issue && issue.variantId === variantId);
  if (!own.length) return undefined;
  const tags = own.flatMap(issue => issue.checkId === "missing-markup" ? [issue.name] : []);
  return {
    missing: own.flatMap(issue => issue.checkId === "missing-variable" ? [issue.name] : []),
    extra: own.flatMap(issue => issue.checkId === "unknown-variable" ? [{ name: issue.name, suggestion: issue.suggestion }] : []),
    markup: markup.paired.filter(({ part }) => tags.includes(part.name)).map(({ part, text }) => ({ part, text })),
    standalone: markup.standalone.filter(({ part }) => tags.includes(part.name)).map(({ part }) => part),
  };
}

function ComplexTranslation({ bundle, message, source, referenceVariants, issues, variants, addVariant, editorProps }: { bundle: BundleNested; message: MessageNested; source?: MessageNested; referenceVariants?: Variant[]; issues: Issue[]; variants: Map<string, Variant>; addVariant: Props["addVariant"]; editorProps: (pattern: Pattern) => Record<string, unknown> }) {
  const label = (variant: Variant) => matchLabel(variant, message, bundle.declarations);
  const [expanded, setExpanded] = useState(false);
  const [preview, setPreview] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const selected = message.variants.find(variant => variant.id === selectedId) ?? defaultVariant(message);
  const missing = issues.filter(issue => issue.checkId === "missing-variant").length;
  const empty = issues.filter(issue => issue.checkId === "empty-variant").length;
  const by = selectorGroups(message, bundle.declarations).map(group => group.input);
  const isDefault = selected && selected === defaultVariant(message);
  const editor = useRef<InlangPatternEditor>(null), focusId = useRef<string | undefined>(undefined);
  useLayoutEffect(() => { if (focusId.current && selected?.id === focusId.current) { focusId.current = undefined; focusEditor(editor.current); } }, [selected]);
  const add = (matches: Match[]) => {
    const id = crypto.randomUUID();
    // New forms start from the default form's text, which is usually closest.
    focusId.current = id;
    flushSync(() => { addVariant(bundle.id, { id, message_id: message.id, matches, pattern: structuredClone(defaultVariant(message)?.pattern ?? []) }); setSelectedId(id); });
  };
  return <>
    {selected && <p className="editing">{expanded || !isDefault ? <>Editing <b>{label(selected)}</b></> : "Default form"}</p>}
    {selected && <div className="field"><PatternEditor ref={editor} variant={variants.get(selected.id)} declarations={bundle.declarations} aria-label={`${languageName(message.locale)} translation of ${bundle.id}, form ${label(selected)}`} {...editorProps(selected.pattern)} /></div>}
    {expanded && <Forms message={message} variants={message.variants} declarations={bundle.declarations} locale={message.locale} referenceVariants={referenceVariants} selectedVariantId={selected?.id ?? ""}
      onSelectVariant={event => setSelectedId((event as CustomEvent<{ variantId: string }>).detail.variantId)}
      onAddVariant={event => add((event as CustomEvent<{ matches: Match[] }>).detail.matches)} />}
    <div className="form-actions">
      <span>{message.variants.length} forms by {by.join(" and ")}{missing > 0 && <> · <b className="todo">{missing} missing</b></>}{empty > 0 && <> · <b className="todo">{empty} empty</b></>}</span>
      <button type="button" className="inline-link" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "Hide forms" : "Show all forms"}</button>
      <button type="button" className="inline-link" aria-expanded={preview} onClick={() => setPreview(!preview)}>{preview ? "Hide preview" : "Preview"}</button>
    </div>
    {preview && <Preview declarations={bundle.declarations} message={message} variants={message.variants} locale={message.locale} reference={source && source !== message ? { message: source, variants: source.variants, locale: source.locale } : undefined}
      onVariantMatch={event => { const id = (event as CustomEvent<{ variantId?: string }>).detail.variantId; if (id) setSelectedId(id); }} />}
  </>;
}

export const MessageCard = memo(function MessageCard({ bundle: stored, settings, focus, diagnostics, usages, code, replaced, edited, unused, change, addLocale, removeBundle, addVariant, removeVariant, addMessage, restructure, machineTranslate }: Props) {
  const [showCode, setShowCode] = useState(false);
  const [showOthers, setShowOthers] = useState(false);
  const [structure, setStructure] = useState(false);
  const [preview, setPreview] = useState<string>();
  const [matched, setMatched] = useState<string>();
  // Forms added by "+ Add form", highlighted until their copied text is changed.
  const [copied, setCopied] = useState<Record<string, { from: string; hint?: string; pattern: string }>>({});
  // Forms added here show right away, before they are saved, so typing right after "+ Add form" isn't lost.
  const [adding, setAdding] = useState<Variant[]>([]);
  const bundle = useMemo(() => adding.length ? { ...stored, messages: stored.messages.map(message => {
    const added = adding.filter(variant => variant.message_id === message.id && !message.variants.some(value => value.id === variant.id));
    return added.length ? { ...message, variants: [...message.variants, ...added] } : message;
  }) } : stored, [stored, adding]);
  useEffect(() => { if (adding.length) setAdding(list => { const saved = new Set(stored.messages.flatMap(message => message.variants.map(variant => variant.id))); const rest = list.filter(variant => !saved.has(variant.id)); return rest.length === list.length ? list : rest; }); }, [stored]);
  // Rendered (and focused) before the click's task ends, so no key typed right after it is lost.
  const add = (bundleId: string, variant: Variant) => { flushSync(() => setAdding(list => [...list, variant])); addVariant(bundleId, variant); };
  const root = useRef<HTMLElement>(null);
  const editors = useRef(new Map<string, InlangPatternEditor>()), focusKey = useRef<string | undefined>(undefined);
  useLayoutEffect(() => { const editor = focusKey.current && editors.current.get(focusKey.current); if (editor) { focusKey.current = undefined; focusEditor(editor); } }, [bundle]);
  // Pattern editors emit composed "change" events with the updated variant.
  useEffect(() => {
    const element = root.current;
    // The structure dialog's classic editor reports its own changes.
    const listener = (event: Event) => { if (event instanceof CustomEvent && event.detail?.entity && !(event.target as Element | null)?.closest?.(".dialog")) change(structuredClone(event.detail)); };
    element?.addEventListener("change", listener);
    return () => element?.removeEventListener("change", listener);
  }, [change]);
  const source = bundle.messages.find(message => message.locale === focus.source);
  const sourceName = languageName(focus.source);
  // Reviewing all languages also makes the reference itself editable.
  const targets = focus.all ? [focus.source, ...settings.locales.filter(locale => locale !== focus.source)] : focus.targets;
  const issues = useMemo(() => {
    const byLocale: Record<string, Issue[]> = {};
    for (const diagnostic of diagnostics ?? []) if (diagnostic.checkId !== "unused-message" && diagnostic.locale && diagnostic.locale !== focus.source) (byLocale[diagnostic.locale] ??= []).push(diagnostic);
    return byLocale;
  }, [diagnostics, focus.source]);
  const stillSource = targets.flatMap(locale => bundle.messages.find(message => message.locale === locale)?.variants ?? []).filter(variant => seeded.get(variant.id)?.pattern === JSON.stringify(variant.pattern)).length;
  const formName = (locale: string, variantId: string) => { const message = bundle.messages.find(value => value.locale === locale), variant = message?.variants.find(value => value.id === variantId); return message && variant ? matchLabel(variant, message, bundle.declarations) : undefined; };
  const status = cardStatus(targets.flatMap(locale => (issues[locale] ?? []).map(issue => ({ locale, issue }))), { edited, replaced, unused, stillSource, sourceName, formName }, targets.length > 1);
  const tone = !status ? "" : status.tone !== "neutral" ? "todo" : status.label === "Not used in code" ? "neutral" : "changed";
  // Lit components compare by identity; clone each variant once per bundle snapshot.
  const variants = useMemo(() => new Map(bundle.messages.flatMap(message => message.variants.map(variant => [variant.id, structuredClone(variant)]))), [bundle]);
  const markup = useMemo(() => referenceMarkup(source), [source]);
  const markupOptions = useMemo(() => markup.paired.map(({ part, label }) => ({ part, label })), [markup]);
  const others = focus.all ? [] : settings.locales.filter(locale => locale !== focus.source && !targets.includes(locale));
  const othersTodo = others.filter(locale => issues[locale]?.length).length;
  const usage = usages?.[0];
  const editorProps = (pattern: Pattern) => ({ markupOptions, variables: variableSuggestions(source, pattern, bundle.declarations) });
  const editor = (key: string, variant: Variant, label: string) => <PatternEditor key={variant.id} ref={element => { if (element) editors.current.set(key, element); else editors.current.delete(key); }}
    variant={variants.get(variant.id)} declarations={bundle.declarations} aria-label={label} {...editorProps(variant.pattern)} />;
  const setPattern = (variant: Variant, pattern: Pattern) => change({ entity: "variant", entityId: variant.id, newData: { ...variant, pattern } } as ChangeEventDetail, true);
  const notes = (key: string, variant: Variant, locale: string, exactNumber: boolean) => {
    const found = locale === focus.source ? undefined : formNotes(issues[locale] ?? [], variant.id, markup);
    const target = () => editors.current.get(key);
    const copy = copied[variant.id];
    const empty = (issues[locale] ?? []).some(issue => issue.checkId === "empty-variant" && issue.variantId === variant.id);
    return <>
      {empty && locale !== focus.source && <p className="field-note defect">This form is empty. The other forms have text.</p>}
      {copy && copy.pattern === JSON.stringify(variant.pattern) && <p className="field-note">Copied from <b>{copy.from}</b>.{copy.hint && ` Check the words for ${copy.hint.replace(/…$/, "")}.`}</p>}
      {found?.missing.map(name => <p key={`m-${name}`} className="field-note defect">{`{${name}}`} is missing. <button type="button" className="inline-link" onClick={() => { const editor = target(); editor?.insertExpression(name); focusEditor(editor); }}>Insert {`{${name}}`}</button></p>)}
      {found?.extra.map(({ name, suggestion }) => <p key={`e-${name}`} className="field-note defect">{`{${name}}`} isn't a variable in {sourceName}.{suggestion
        ? <> Did you mean {`{${suggestion}}`}? <button type="button" className="inline-link" onClick={() => setPattern(variant, renameVariable(variant.pattern, name, suggestion))}>Replace</button></>
        : <> <button type="button" className="inline-link" onClick={() => setPattern(variant, renameVariable(variant.pattern, name))}>Remove</button></>}</p>)}
      {found?.markup.map(({ part, text }) => {
        // Markup around a single variable the translation already has: wrap that variable.
        const variable = markupVariable(source, part.name);
        if (variable && variableNames(variant.pattern).includes(variable)) return <p key={`k-${part.name}`} className="field-note defect">{sourceName} {markupVerb(part.name, text)}. <button type="button" className="inline-link" onClick={() => setPattern(variant, wrapVariable(variant.pattern, part, variable))}>{markupAction(part.name, variable)}</button></p>;
        return <p key={`k-${part.name}`} className="field-note defect">{sourceName} {markupVerb(part.name, text)}. Select the {languageName(locale)} words, then choose <b>{markupLabel(part.name)}</b>. <button type="button" className="inline-link" onClick={() => { target()?.wrapSelection(part, text || "text"); }}>Add {markupLabel(part.name).toLowerCase()} at the cursor</button></p>;
      })}
      {found?.standalone.map(part => <p key={`s-${part.name}`} className="field-note defect">{sourceName} has a {markupLabel(part.name).toLowerCase()} here. <button type="button" className="inline-link" onClick={() => target()?.insertMarkup(part)}>Insert {markupLabel(part.name).toLowerCase()}</button></p>)}
    </>;
  };
  const untranslated = (variant: Variant) => { const seed = seeded.get(variant.id); return seed ? untranslatedWords(seed.words, variant.pattern).join("|") || undefined : undefined; };
  const localeCell = (locale: string, todo: boolean) => <div className="message-locale">
    <b>{locale}</b><span className="locale-name">{languageName(locale)}</span>
    {locale === settings.baseLocale && <span className="ref-badge">ref</span>}
    {todo && <span className="todo-dot" aria-label="Needs work" />}
  </div>;
  const sourceGroups = useMemo(() => source ? selectorGroups(source, bundle.declarations) : [], [source, bundle.declarations]);
  const sourceRow = () => source && <div className="message-row" key={`ref-${source.locale}`}>
    {localeCell(source.locale, false)}
    <div className="message-ref">
      {isSimple(source) || sourceGroups.length !== 1
        ? <div className="message-cell source"><PatternView pattern={defaultVariant(source)?.pattern ?? []} declarations={bundle.declarations} />{source.variants.length > 1 && <span className="form-count"> · {source.variants.length} forms</span>}</div>
        : formRows(source, bundle.declarations, sourceGroups[0]!).filter(form => form.variant).map(form => <div className="message-cell source form" key={form.variant!.id}>
          <span className="form-label"><b>{form.label}</b>{form.hint && <small>{form.hint}</small>}</span><PatternView pattern={form.variant!.pattern} declarations={bundle.declarations} />
        </div>)}
    </div>
  </div>;
  /** Creates the translation shaped like the source: empty forms, or the source text to translate word by word. */
  const start = (locale: string, copy: boolean) => {
    const id = crypto.randomUUID(), shape = messageFromSource(bundle, source, locale, id, copy);
    if (copy) for (const variant of shape.variants) seeded.set(variant.id, { words: words(variant.pattern), pattern: JSON.stringify(variant.pattern) });
    focusKey.current = shape.selectors.length && selectorGroups({ locale, ...shape }, bundle.declarations).length === 1 ? `${locale}:${shape.variants[0]!.id}` : locale;
    addMessage(bundle, locale, { id, ...shape });
  };
  const row = (locale: string) => {
    const message = bundle.messages.find(value => value.locale === locale);
    const localeIssues = locale === focus.source ? [] : issues[locale] ?? [];
    const name = languageName(locale), isTarget = locale !== focus.source;
    const sourceSplits = !!source?.selectors.length, targetSplits = !!message?.selectors.length;
    // The reference's select values and exact numbers are needed in a translation too (inlang SDK selector rules).
    const referenceVariants = isTarget && source ? source.variants : undefined;
    const groups = message ? selectorGroups(message, bundle.declarations, { referenceVariants }) : [];
    const numberSplit = isTarget && message && isSimple(message) && !sourceSplits && pluralCategories(locale).length >= 3 ? numberInputs(message, bundle.declarations)[0] : undefined;
    // The reference chooses by an input this translation doesn't (the SDK's missing-selector): offer the split.
    const unsplit = message ? localeIssues.flatMap(issue => missingSelector(issue) ?? []).map(issue => {
      const plural = isPluralSelector(issue.selector, bundle.declarations), numbers = missingNumbers(issue);
      return <p key={`split-${issue.name}`} className="field-note defect">{numbers ? <>{sourceName} has a form for exactly {listOf(numbers)}.</> : <>{sourceName} uses different words depending on {`{${issue.name}}`}.</>}{isSimple(message)
        ? <> <button type="button" className="inline-link" onClick={() => restructure(bundle.id, message.id, splitMessage(bundle, message, plural ? { plural: issue.name } : { selector: issue.selector }))}>Split by {`{${issue.name}}`}</button></>
        : <> Add it in <b>Edit structure…</b>.</>}</p>;
    }) : [];
    let cells: React.ReactNode;
    if (!message) cells = <div className="message-cell missing-translation-row">
      <button type="button" className="empty" onClick={() => start(locale, false)}>Translate to {name}…</button>
      {source && isTarget && <button type="button" className="mt-button" onClick={() => start(locale, true)}>Start from {sourceName}</button>}
      <button type="button" className="mt-button" onClick={() => machineTranslate({ source: focus.source, targets: [locale], count: 1, message: bundle.id })}><SparkleIcon />Machine translate</button>
    </div>;
    else if (isSimple(message)) cells = message.variants.map(variant => <div key={variant.id} className="message-cell edit" data-untranslated={untranslated(variant)}>
      {editor(locale, variant, `${name} translation of ${bundle.id}`)}
      {notes(locale, variant, locale, false)}
      {numberSplit && <p className="field-note">{name} uses different words depending on the number ({pluralCategories(locale).length} forms). <button type="button" className="inline-link" onClick={() => restructure(bundle.id, message.id, splitMessage(bundle, message, { plural: numberSplit }))}>Split by {`{${numberSplit}}`}</button></p>}
      {isTarget && sourceSplits && pluralCategories(locale).length <= 1 && source!.selectors.every(selector => isPluralSelector(selector.name, bundle.declarations)) && <p className="field-note">{name} uses the same words for every number, so one text covers all counts.</p>}
    </div>);
    else if (groups.length === 1) {
      const rows = formRows(message, bundle.declarations, groups[0]!, referenceVariants);
      const complete = isTarget && !localeIssues.length && rows.every(row => row.variant || !row.required) && !message.variants.some(variant => seeded.get(variant.id)?.pattern === JSON.stringify(variant.pattern));
      // The reference's variables and markup this translation has in every form; forms for one number may spell it out.
      const inEvery = (has: (variant: Variant) => boolean) => message.variants.every(has);
      const tokens = source ? [...new Set(source.variants.flatMap(variant => variableNames(variant.pattern)))].filter(value => inEvery(variant => variableNames(variant.pattern).includes(value))).map(value => `{${value}}`)
        .concat(markup.paired.filter(({ part }) => inEvery(variant => variant.pattern.some(item => item.type === "markup-start" && item.name === part.name))).map(({ part }) => markupLabel(part.name).toLowerCase())) : [];
      cells = <>
        {rows.map((form, index) => {
          const exact = groups[0]!.isPlural && isNumericKey(form.key);
          if (!form.variant) return <div key={`missing-${form.key}`} className="message-cell form missing"><span className="form-label"><b>{form.label}</b>{form.hint && <small>{form.hint}</small>}</span>
            <button type="button" className="inline-link add-form" onClick={() => {
              // Start from the nearest form above (few for many), else below.
              const near = rows.slice(0, index).reverse().find(value => value.variant) ?? rows.slice(index + 1).find(value => value.variant);
              const id = crypto.randomUUID(), pattern = structuredClone(near?.variant?.pattern ?? defaultVariant(message)?.pattern ?? []);
              focusKey.current = `${locale}:${id}`;
              if (near) setCopied(value => ({ ...value, [id]: { from: near.label, hint: exact ? form.key : form.hint, pattern: JSON.stringify(pattern) } }));
              add(bundle.id, { id, message_id: message.id, matches: form.matches, pattern });
            }}>{exact ? `+ Add a form for ${form.key}` : `+ Add ${form.label} form`}</button></div>;
          const variant = form.variant, key = `${locale}:${variant.id}`, fresh = copied[variant.id]?.pattern === JSON.stringify(variant.pattern);
          return <div key={variant.id} className={`message-cell edit form${fresh ? " new" : ""}${matched === variant.id ? " matched" : ""}`} data-untranslated={untranslated(variant)}>
            <span className="form-label"><b>{form.label}</b>{form.hint && <small>{form.hint}</small>}</span>
            <div className="form-body">{editor(key, variant, `${name} translation of ${bundle.id}, form ${form.label}`)}{notes(key, variant, locale, exact)}</div>
            {!form.required && isTarget && <button type="button" className="inline-link remove-form" aria-label={`Remove the ${form.label} form`} onClick={() => removeVariant(bundle.id, variant.id)}>Remove</button>}
          </div>;
        })}
        {isTarget && targetSplits && !sourceSplits && <div className="message-cell actions">Only {name} splits this message by {`{${groups[0]!.input}}`}. <button type="button" className="inline-link" onClick={() => restructure(bundle.id, message.id, joinMessage(bundle, message))}>Use one text again</button></div>}
        <div className="message-cell actions">
          {complete && tokens.length > 0 && <span className="check">✓ {listOf(tokens)} {tokens.length === 1 ? "is" : "are"} in every form</span>}
          <button type="button" className="inline-link" aria-expanded={preview === locale} onClick={() => { setPreview(preview === locale ? undefined : locale); setMatched(undefined); }}>{preview === locale ? "Hide preview" : "Preview"}</button>
        </div>
        {preview === locale && <div className="message-cell"><Preview declarations={bundle.declarations} message={message} variants={message.variants} locale={message.locale} reference={source && source !== message ? { message: source, variants: source.variants, locale: source.locale } : undefined}
          onVariantMatch={event => setMatched((event as CustomEvent<{ variantId?: string }>).detail.variantId)} /></div>}
      </>;
    }
    else cells = <div className="message-cell edit complex"><ComplexTranslation bundle={bundle} message={message} source={source} referenceVariants={referenceVariants} issues={localeIssues} variants={variants} addVariant={add} editorProps={editorProps} /></div>;
    return <div className="message-row" key={locale}>
      {localeCell(locale, localeIssues.length > 0)}
      <div className="message-target">{cells}{unsplit.length > 0 && <div className="message-cell actions">{unsplit}</div>}</div>
    </div>;
  };
  // Structure changes a translator can make per language: split by count or by another language's selector, or back to one text.
  const splits = targets.filter(locale => locale !== focus.source).flatMap(locale => {
    const message = bundle.messages.find(value => value.locale === locale);
    if (!message || !isSimple(message)) return [];
    const byNumber = pluralCategories(locale).length > 1 ? numberInputs(message, bundle.declarations).map(input => ({ label: `Split ${languageName(locale)} by {${input}}`, next: () => splitMessage(bundle, message, { plural: input }) })) : [];
    // Selects other languages use; an exact number that belongs to a plural (ICU =0) is part of that plural.
    const used = [...new Set(bundle.messages.flatMap(value => selectorGroups(value, bundle.declarations)).filter(group => !group.isPlural).map(group => group.selector))];
    const bySelector = used.map(selector => ({ label: `Split ${languageName(locale)} by {${resolveInputVariable(selector, bundle.declarations)}}`, next: () => splitMessage(bundle, message, { selector }) }));
    return [...byNumber, ...bySelector].map(item => ({ ...item, message_id: message.id }));
  });
  return <article className="message-card" data-bundle={bundle.id} ref={root} aria-label={bundle.id}>
    <header className="message-head">
      <div className="message-title">
        <h3 className="message-key"><span className="hash" aria-hidden="true">#</span>{bundle.id}</h3>
        {status && <span className={`message-status ${tone}`}>{status.label}</span>}
        <Dropdown className="message-menu" title="More actions" align="end" label={<span aria-label={`More actions for ${bundle.id}`}>···</span>}>
          {close => <>
            {splits.map(item => <button key={item.label} type="button" className="menu-item" onClick={() => { close(); restructure(bundle.id, item.message_id, item.next()); }}>{item.label}</button>)}
            <button type="button" className="menu-item" onClick={() => { close(); setStructure(true); }}>Edit structure…</button>
            <button type="button" className="menu-item" onClick={() => { close(); removeBundle(bundle.id); }}>Delete message</button>
          </>}
        </Dropdown>
      </div>
      {usage && code && <p className="message-where">{describeUsage(usage)}{usages!.length > 1 && <> · used in {usages!.length} places</>} · <button type="button" className="inline-link" aria-expanded={showCode} onClick={() => setShowCode(!showCode)}>{showCode ? "hide code" : "code"}</button></p>}
    </header>
    {showCode && usages && code && <UsageCode usages={usages} codeUrl={code.url} scope={code.scope} />}
    {!focus.all && sourceRow()}
    {targets.map(row)}
    {replaced && <p className="message-note">Replaced your edit with a newer version from GitHub.</p>}
    {others.length > 0 && <div className="message-foot">
      <button type="button" className="inline-link" aria-expanded={showOthers} onClick={() => setShowOthers(!showOthers)}><span className={showOthers ? "chev open" : "chev"} aria-hidden="true">›</span>{showOthers ? "Hide other languages" : `${others.length} other ${others.length === 1 ? "language" : "languages"}`}</button>
      {!showOthers && <span className={othersTodo ? "others-state todo" : "others-state"}>{othersTodo ? `${othersTodo} need${othersTodo === 1 ? "s" : ""} work` : "all translated"}</span>}
    </div>}
    {showOthers && others.map(row)}
    {structure && <Modal label={`Edit structure of ${bundle.id}`} className="wide" onClose={() => setStructure(false)}><header><h2>Edit structure · <span className="mono">{bundle.id}</span></h2><button onClick={() => setStructure(false)}>Done</button></header>
      <p className="dialog-help">Variables, selectors and forms for every language. Changes save as you go.</p>
      <Editor bundle={bundle} settings={settings} locales={[focus.source, ...targets]} change={change} addLocale={addLocale} removeBundle={removeBundle} />
    </Modal>}
  </article>;
});
