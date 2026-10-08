import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { createComponent } from "@lit/react";
import { InlangPatternEditor, InlangPatternView, InlangMessageForms, InlangMessagePreview, pluralExamples, selectorKeys, type ChangeEventDetail, type Match } from "@inlang/editor-component";
import type { BundleNested, Declaration, MessageNested, ProjectSettings } from "@inlang/sdk/browser";
import { Editor } from "./Editor";
import { Dropdown } from "./Menu";
import { Modal } from "./Modal";
import { UsageCode } from "./UsagePeek";
import { describeUsage, type Usage } from "./usage";
import { languageName, type LanguageFocus } from "./languages";
import type { Issue } from "./issues";

const PatternEditor = createComponent({ react: React, tagName: "inlang-pattern-editor", elementClass: InlangPatternEditor });
const PatternView = createComponent({ react: React, tagName: "inlang-pattern-view", elementClass: InlangPatternView });
const Forms = createComponent({ react: React, tagName: "inlang-message-forms", elementClass: InlangMessageForms, events: { onSelectVariant: "select-variant", onAddVariant: "add-variant" } });
const Preview = createComponent({ react: React, tagName: "inlang-message-preview", elementClass: InlangMessagePreview, events: { onVariantMatch: "variant-match" } });

type Variant = MessageNested["variants"][number];
export type CardStatus = { tone: "todo" | "defect" | "neutral"; label: string };
// Props are primitives or stable references so typing in one message re-renders only that card.
type Props = {
  bundle: BundleNested; settings: ProjectSettings; focus: LanguageFocus; issuesOf: (bundle: BundleNested, locale: string) => Issue[];
  usages?: Usage[]; code?: { url: string; scope: string }; replaced?: boolean; edited?: boolean; unused?: boolean;
  change: (detail: ChangeEventDetail) => void; addLocale: (bundle: BundleNested, locale: string) => void; removeBundle: (id: string) => void;
  addVariant: (bundleId: string, variant: Variant) => void;
};

/** One status per card, most urgent first. */
export function cardStatus(issues: { locale: string; issue: Issue }[], flags: { edited?: boolean; replaced?: boolean; unused?: boolean }, several: boolean): CardStatus | undefined {
  const missing = issues.filter(({ issue }) => issue.type === "missing-translation");
  if (missing.length) return { tone: "todo", label: several ? `Missing in ${missing.map(({ locale }) => languageName(locale)).join(", ")}` : "Missing" };
  const placeholder = issues.find(({ issue }) => issue.type === "missing-variable" || issue.type === "extra-variable" || issue.type === "missing-markup");
  if (placeholder && "name" in placeholder.issue) return { tone: "defect", label: `${placeholder.issue.type === "extra-variable" ? "Unexpected" : "Missing"} {${placeholder.issue.name}} in ${languageName(placeholder.locale)}` };
  const forms = issues.filter(({ issue }) => issue.type === "missing-form");
  if (forms.length) return { tone: "todo", label: `${forms.length} ${forms.length === 1 ? "form" : "forms"} missing` };
  if (flags.edited) return { tone: "neutral", label: "Edited" };
  if (flags.replaced) return { tone: "neutral", label: "Updated from GitHub" };
  if (flags.unused) return { tone: "neutral", label: "Not used in code" };
}

const isSimple = (message: MessageNested) => !message.selectors.length && message.variants.length <= 1;
/** The form that matches anything; shown when a message has several. */
const defaultVariant = (message: MessageNested) => message.variants.find(variant => variant.matches.every(match => match.type === "catchall-match")) ?? message.variants.at(-1);
/** Selectors name local variables (countPlural); translators know the input (count). */
function inputName(selector: string, declarations: Declaration[]) {
  const declaration = declarations.find(value => value.name === selector);
  return declaration?.type === "local-variable" && declaration.value.arg.type === "variable-reference" ? declaration.value.arg.name : selector;
}
// "one · female", "other" for a plural's catch-all, "default form" when nothing is matched.
const matchLabel = (variant: Variant, message: MessageNested, declarations: Declaration[]) => {
  const plural = (key: string) => selectorKeys(key, declarations, message.locale, message.variants).plural;
  if (variant.matches.every(match => match.type === "catchall-match" && !plural(match.key))) return "default form";
  return variant.matches.map(match => match.type === "literal-match" ? match.value : plural(match.key) ? "other" : "any other").join(" · ");
};

/** Focuses an editor once it has rendered, e.g. after the button that was focused went away. */
const focusEditor = (editor: InlangPatternEditor | null | undefined) => requestAnimationFrame(() => editor?.querySelector<HTMLElement>("[contenteditable]")?.focus());

function ComplexTranslation({ bundle, message, source, issues, variants, addVariant }: { bundle: BundleNested; message: MessageNested; source?: MessageNested; issues: Issue[]; variants: Map<string, Variant>; addVariant: Props["addVariant"] }) {
  const label = (variant: Variant) => matchLabel(variant, message, bundle.declarations);
  const [expanded, setExpanded] = useState(false);
  const [preview, setPreview] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const selected = message.variants.find(variant => variant.id === selectedId) ?? defaultVariant(message);
  const missing = issues.filter(issue => issue.type === "missing-form").length;
  const by = message.selectors.map(selector => inputName(selector.name, bundle.declarations));
  const isDefault = selected && selected === defaultVariant(message);
  const editor = useRef<InlangPatternEditor>(null), focusId = useRef<string | undefined>(undefined);
  useEffect(() => { if (focusId.current && selected?.id === focusId.current) { focusId.current = undefined; focusEditor(editor.current); } }, [selected]);
  const add = (matches: Match[]) => {
    const id = crypto.randomUUID();
    // New forms start from the default form's text, which is usually closest.
    addVariant(bundle.id, { id, messageId: message.id, matches, pattern: structuredClone(defaultVariant(message)?.pattern ?? []) });
    setSelectedId(id); focusId.current = id;
  };
  return <>
    {expanded && selected && <p className="editing">Editing {label(selected)}</p>}
    {selected && <div className="field"><PatternEditor ref={editor} variant={variants.get(selected.id)} declarations={bundle.declarations} aria-label={`${languageName(message.locale)} translation of ${bundle.id}, form ${label(selected)}`} /></div>}
    {!expanded && selected && <p className="caption">{isDefault ? `Default form · any ${by.join(", ")}` : `Form ${label(selected)}`}</p>}
    {expanded && <Forms message={message} variants={message.variants} declarations={bundle.declarations} locale={message.locale} selectedVariantId={selected?.id ?? ""}
      onSelectVariant={event => setSelectedId((event as CustomEvent<{ variantId: string }>).detail.variantId)}
      onAddVariant={event => add((event as CustomEvent<{ matches: Match[] }>).detail.matches)} />}
    <div className="form-actions">
      <span>{message.variants.length} forms by {by.join(" and ")}{missing > 0 && <> · <b className="todo">{missing} missing</b></>}</span>
      <button type="button" className="inline-link" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "Collapse forms" : "Edit all forms"}</button>
      <button type="button" className="inline-link" aria-expanded={preview} onClick={() => setPreview(!preview)}>{preview ? "Hide preview" : "Preview"}</button>
    </div>
    {preview && <Preview declarations={bundle.declarations} message={message} variants={message.variants} locale={message.locale} reference={source && source !== message ? { message: source, variants: source.variants, locale: source.locale } : undefined}
      onVariantMatch={event => { const id = (event as CustomEvent<{ variantId?: string }>).detail.variantId; if (id) setSelectedId(id); }} />}
  </>;
}

/** Plural examples ("1, 21, 31…") for a selector, following its declaration to the plural annotation. */
function examplesFor(selector: string, declarations: Declaration[], locale: string): Record<string, string> {
  const declaration = declarations.find(value => value.name === selector);
  if (declaration?.type !== "local-variable") return {};
  const annotation = declaration.value.annotation;
  if (annotation?.name !== "plural") return {};
  const type = annotation.options?.find(option => option.name === "type")?.value;
  return pluralExamples(locale, type?.type === "literal" && type.value === "ordinal" ? "ordinal" : "cardinal");
}

type FormRow = { key: string; label: string; hint?: string; variant?: Variant; matches: Match[] };
/** One row per form of a single-selector message, in the locale's order, with the forms it still needs. */
function formRows(message: MessageNested, declarations: Declaration[], required: boolean): FormRow[] {
  const name = message.selectors[0]!.name;
  const { plural, keys } = selectorKeys(name, declarations, message.locale, message.variants);
  const examples = plural ? examplesFor(name, declarations, message.locale) : {};
  const keyOf = (variant: Variant) => { const match = variant.matches.find(value => value.key === name); return match?.type === "literal-match" ? match.value : "*"; };
  const label = (key: string) => key === "*" ? (plural ? "other" : "any other") : key;
  const hint = (key: string) => /^\d+$/.test(key) ? "exactly" : examples[key === "*" ? "other" : key];
  const rows: FormRow[] = [], used = new Set<Variant>();
  const take = (key: string) => message.variants.find(variant => !used.has(variant) && (keyOf(variant) === key || (plural && key === "*" && keyOf(variant) === "other")));
  const push = (key: string, variant?: Variant) => { if (variant) used.add(variant); rows.push({ key, label: label(key), hint: hint(key), variant, matches: [key === "*" ? { type: "catchall-match", key: name } : { type: "literal-match", key: name, value: key }] }); };
  for (const variant of message.variants.filter(variant => /^\d+$/.test(keyOf(variant))).sort((a, b) => Number(keyOf(a)) - Number(keyOf(b)))) push(keyOf(variant), variant);
  for (const key of keys) { const variant = take(key); if (variant || required) push(key, variant); }
  for (const variant of message.variants) if (!used.has(variant)) push(keyOf(variant), variant);
  return rows;
}

export const MessageCard = memo(function MessageCard({ bundle, settings, focus, issuesOf, usages, code, replaced, edited, unused, change, addLocale, removeBundle, addVariant }: Props) {
  const [showCode, setShowCode] = useState(false);
  const [showOthers, setShowOthers] = useState(false);
  const [structure, setStructure] = useState(false);
  const [preview, setPreview] = useState<string>();
  const root = useRef<HTMLElement>(null);
  const editors = useRef(new Map<string, InlangPatternEditor>()), focusKey = useRef<string | undefined>(undefined);
  useEffect(() => { const editor = focusKey.current && editors.current.get(focusKey.current); if (editor) { focusKey.current = undefined; focusEditor(editor); } }, [bundle]);
  // Pattern editors emit composed "change" events with the updated variant.
  useEffect(() => {
    const element = root.current;
    // The structure dialog's classic editor reports its own changes.
    const listener = (event: Event) => { if (event instanceof CustomEvent && event.detail?.entity && !(event.target as Element | null)?.closest?.(".dialog")) change(structuredClone(event.detail)); };
    element?.addEventListener("change", listener);
    return () => element?.removeEventListener("change", listener);
  }, [change]);
  const source = bundle.messages.find(message => message.locale === focus.source);
  // Reviewing all languages also makes the reference itself editable.
  const targets = focus.all ? [focus.source, ...settings.locales.filter(locale => locale !== focus.source)] : focus.targets;
  const issues = useMemo(() => Object.fromEntries(settings.locales.filter(locale => locale !== focus.source).map(locale => [locale, issuesOf(bundle, locale)])), [bundle, settings.locales, focus.source, issuesOf]);
  const status = cardStatus(targets.flatMap(locale => (issues[locale] ?? []).map(issue => ({ locale, issue }))), { edited, replaced, unused }, targets.length > 1);
  const tone = !status ? "" : status.tone !== "neutral" ? "todo" : status.label === "Not used in code" ? "neutral" : "changed";
  // Lit components compare by identity; clone each variant once per bundle snapshot.
  const variants = useMemo(() => new Map(bundle.messages.flatMap(message => message.variants.map(variant => [variant.id, structuredClone(variant)]))), [bundle]);
  const others = focus.all ? [] : settings.locales.filter(locale => locale !== focus.source && !targets.includes(locale));
  const othersTodo = others.filter(locale => issues[locale]?.length).length;
  const usage = usages?.[0];
  const editor = (key: string, variant: Variant, label: string) => <PatternEditor ref={element => { if (element) editors.current.set(key, element); else editors.current.delete(key); }}
    variant={variants.get(variant.id)} declarations={bundle.declarations} aria-label={label} />;
  const localeCell = (locale: string, todo: boolean) => <div className="message-locale">
    <b>{locale}</b><span className="locale-name">{languageName(locale)}</span>
    {locale === settings.baseLocale && <span className="ref-badge">ref</span>}
    {todo && <span className="todo-dot" aria-label="Needs work" />}
  </div>;
  const sourceRow = () => source && <div className="message-row" key={`ref-${source.locale}`}>
    {localeCell(source.locale, false)}
    <div className="message-ref">
      {isSimple(source) || source.selectors.length !== 1
        ? <div className="message-cell source"><PatternView pattern={defaultVariant(source)?.pattern ?? []} declarations={bundle.declarations} />{source.variants.length > 1 && <span className="form-count"> · {source.variants.length} forms</span>}</div>
        : formRows(source, bundle.declarations, false).map(form => <div className="message-cell source form" key={form.variant!.id}>
          <span className="form-label"><b>{form.label}</b>{form.hint && <small>{form.hint}</small>}</span><PatternView pattern={form.variant!.pattern} declarations={bundle.declarations} />
        </div>)}
    </div>
  </div>;
  const row = (locale: string) => {
    const message = bundle.messages.find(value => value.locale === locale);
    const localeIssues = locale === focus.source ? [] : issues[locale] ?? [];
    const name = languageName(locale);
    let cells: React.ReactNode;
    if (!message) cells = <button type="button" className="message-cell empty" onClick={() => { focusKey.current = locale; addLocale(bundle, locale); }}>Translate to {name}…</button>;
    else if (isSimple(message)) cells = message.variants.map(variant => <div key={variant.id} className="message-cell edit">
      {editor(locale, variant, `${name} translation of ${bundle.id}`)}
      {localeIssues.flatMap(issue => issue.type === "missing-variable" ? [issue.name] : []).map(variable => <p key={variable} className="field-note defect">{`{${variable}}`} is missing. <button type="button" className="inline-link" onClick={() => { const target = editors.current.get(locale); target?.insertExpression(variable); focusEditor(target); }}>Insert {`{${variable}}`}</button></p>)}
    </div>);
    else if (message.selectors.length === 1) cells = <>
      {formRows(message, bundle.declarations, true).map(form => form.variant
        ? <div key={form.variant.id} className="message-cell edit form"><span className="form-label"><b>{form.label}</b>{form.hint && <small>{form.hint}</small>}</span>{editor(`${locale}:${form.variant.id}`, form.variant, `${name} translation of ${bundle.id}, form ${form.label}`)}</div>
        : <div key={`missing-${form.key}`} className="message-cell form missing"><span className="form-label"><b>{form.label}</b>{form.hint && <small>{form.hint}</small>}</span>
          <button type="button" className="inline-link add-form" onClick={() => {
            const id = crypto.randomUUID(); focusKey.current = `${locale}:${id}`;
            // New forms start from the default form's text, which is usually closest.
            addVariant(bundle.id, { id, messageId: message.id, matches: form.matches, pattern: structuredClone(defaultVariant(message)?.pattern ?? []) });
          }}>+ Add {form.label} form</button></div>)}
      <div className="message-cell actions"><button type="button" className="inline-link" aria-expanded={preview === locale} onClick={() => setPreview(preview === locale ? undefined : locale)}>{preview === locale ? "Hide preview" : "Preview"}</button></div>
      {preview === locale && <div className="message-cell"><Preview declarations={bundle.declarations} message={message} variants={message.variants} locale={message.locale} reference={source && source !== message ? { message: source, variants: source.variants, locale: source.locale } : undefined} /></div>}
    </>;
    else cells = <div className="message-cell edit complex"><ComplexTranslation bundle={bundle} message={message} source={source} issues={localeIssues} variants={variants} addVariant={addVariant} /></div>;
    return <div className="message-row" key={locale}>
      {localeCell(locale, localeIssues.length > 0)}
      <div className="message-target">{cells}</div>
    </div>;
  };
  return <article className="message-card" data-bundle={bundle.id} ref={root} aria-label={bundle.id}>
    <header className="message-head">
      <div className="message-title">
        <h3 className="message-key"><span className="hash" aria-hidden="true">#</span>{bundle.id}</h3>
        {status && <span className={`message-status ${tone}`}>{status.label}</span>}
        <Dropdown className="message-menu" title="More actions" align="end" label={<span aria-label={`More actions for ${bundle.id}`}>···</span>}>
          {close => <>
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
