import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { createComponent } from "@lit/react";
import { InlangPatternEditor, InlangPatternView, InlangMessageForms, InlangMessagePreview, selectorKeys, type ChangeEventDetail, type Match } from "@inlang/editor-component";
import type { BundleNested, Declaration, MessageNested, ProjectSettings } from "@inlang/sdk/browser";
import { Editor } from "./Editor";
import { Dropdown } from "./Menu";
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
  return variant.matches.map(match => match.type === "literal-match" ? match.value : plural(match.key) ? "other" : "any").join(" · ");
};

function ComplexTranslation({ bundle, message, source, issues, variants, addVariant }: { bundle: BundleNested; message: MessageNested; source?: MessageNested; issues: Issue[]; variants: Map<string, Variant>; addVariant: Props["addVariant"] }) {
  const label = (variant: Variant) => matchLabel(variant, message, bundle.declarations);
  const [expanded, setExpanded] = useState(false);
  const [preview, setPreview] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const selected = message.variants.find(variant => variant.id === selectedId) ?? defaultVariant(message);
  const missing = issues.filter(issue => issue.type === "missing-form").length;
  const by = message.selectors.map(selector => inputName(selector.name, bundle.declarations));
  const isDefault = selected && selected === defaultVariant(message);
  const add = (matches: Match[]) => {
    const id = crypto.randomUUID();
    // New forms start from the default form's text, which is usually closest.
    addVariant(bundle.id, { id, messageId: message.id, matches, pattern: structuredClone(defaultVariant(message)?.pattern ?? []) });
    setSelectedId(id);
  };
  return <>
    {expanded && selected && <p className="editing">Editing {label(selected)}</p>}
    {selected && <div className="field"><PatternEditor variant={variants.get(selected.id)} declarations={bundle.declarations} aria-label={`${languageName(message.locale)} translation of ${bundle.id}, form ${label(selected)}`} /></div>}
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

export const MessageCard = memo(function MessageCard({ bundle, settings, focus, issuesOf, usages, code, replaced, edited, unused, change, addLocale, removeBundle, addVariant }: Props) {
  const [showCode, setShowCode] = useState(false);
  const [showOthers, setShowOthers] = useState(false);
  const [structure, setStructure] = useState(false);
  const root = useRef<HTMLElement>(null);
  const editors = useRef(new Map<string, InlangPatternEditor>());
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
  const targets = focus.all ? settings.locales : focus.targets;
  const issues = useMemo(() => Object.fromEntries(settings.locales.filter(locale => locale !== focus.source).map(locale => [locale, issuesOf(bundle, locale)])), [bundle, settings.locales, focus.source, issuesOf]);
  const status = cardStatus(targets.flatMap(locale => (issues[locale] ?? []).map(issue => ({ locale, issue }))), { edited, replaced, unused }, targets.length > 1);
  // Lit components compare by identity; clone each variant once per bundle snapshot.
  const variants = useMemo(() => new Map(bundle.messages.flatMap(message => message.variants.map(variant => [variant.id, structuredClone(variant)]))), [bundle]);
  const others = focus.all ? [] : settings.locales.filter(locale => locale !== focus.source && !targets.includes(locale));
  const othersTodo = others.filter(locale => issues[locale]?.length).length;
  const usage = usages?.[0];
  const row = (locale: string, label: boolean) => {
    const message = bundle.messages.find(value => value.locale === locale);
    const localeIssues = issues[locale] ?? [];
    const simple = message && isSimple(message);
    return <div className="message-row" key={locale}>
      <div className="message-ref">{locale === focus.source ? null : source ? <><PatternView pattern={defaultVariant(source)?.pattern ?? []} declarations={bundle.declarations} />{source.variants.length > 1 && <span className="form-count"> · {source.variants.length} forms</span>}</> : <span className="muted">No {languageName(focus.source)} text</span>}</div>
      <div className="message-target">
        {label && <span className="target-locale">{languageName(locale)}</span>}
        {!message ? <button type="button" className="field empty" onClick={() => addLocale(bundle, locale)}>Translate to {languageName(locale)}</button>
          : simple ? message.variants.map(variant => <div key={variant.id} className="field"><PatternEditor ref={element => { if (element) editors.current.set(locale, element); else editors.current.delete(locale); }} variant={variants.get(variant.id)} declarations={bundle.declarations} aria-label={`${languageName(locale)} translation of ${bundle.id}`} /></div>)
          : <ComplexTranslation bundle={bundle} message={message} source={source} issues={localeIssues} variants={variants} addVariant={addVariant} />}
        {simple && localeIssues.flatMap(issue => issue.type === "missing-variable" ? [issue.name] : []).map(name => <p key={name} className="field-note defect">Missing {`{${name}}`} in {languageName(locale)}. <button type="button" className="inline-link" onClick={() => editors.current.get(locale)?.insertExpression(name)}>Insert {`{${name}}`}</button></p>)}
      </div>
    </div>;
  };
  return <article className="message-card" data-bundle={bundle.id} ref={root} aria-label={bundle.id}>
    <header className="message-head">
      <h3 className="message-key">{bundle.id}</h3>
      {status && <span className={`message-status ${status.tone}`}>{status.label}</span>}
      <Dropdown className="message-menu" title="More actions" align="end" label={<span aria-label={`More actions for ${bundle.id}`}>···</span>}>
        {close => <>
          <button type="button" className="menu-item" onClick={() => { close(); setStructure(true); }}>Edit structure…</button>
          <button type="button" className="menu-item" onClick={() => { close(); removeBundle(bundle.id); }}>Delete message</button>
        </>}
      </Dropdown>
    </header>
    {usage && code && <p className="message-where">{describeUsage(usage)}{usages!.length > 1 && <> · used in {usages!.length} places</>} · <button type="button" className="inline-link" aria-expanded={showCode} onClick={() => setShowCode(!showCode)}>{showCode ? "hide code" : "code"}</button></p>}
    {showCode && usages && code && <UsageCode usages={usages} codeUrl={code.url} scope={code.scope} />}
    {targets.map(locale => row(locale, targets.length > 1))}
    {replaced && <p className="field-note">Replaced your edit with a newer version from GitHub.</p>}
    {others.length > 0 && <div className="message-others">
      <button type="button" className="inline-link" aria-expanded={showOthers} onClick={() => setShowOthers(!showOthers)}>{others.length} other {others.length === 1 ? "language" : "languages"}</button>
      <span className={othersTodo ? "others-state todo" : "others-state"}>{othersTodo ? `${othersTodo} need${othersTodo === 1 ? "s" : ""} work` : "all translated"}</span>
    </div>}
    {showOthers && others.map(locale => row(locale, true))}
    {structure && <div className="dialog-backdrop"><section role="dialog" aria-modal="true" aria-label={`Edit structure of ${bundle.id}`} className="dialog wide"><header><h2>Edit structure · <span className="mono">{bundle.id}</span></h2><button onClick={() => setStructure(false)}>Done</button></header>
      <p className="dialog-help">Variables, selectors and forms for every language. Changes save as you go.</p>
      <Editor bundle={bundle} settings={settings} locales={[focus.source, ...targets]} change={change} addLocale={addLocale} removeBundle={removeBundle} />
    </section></div>}
  </article>;
});
