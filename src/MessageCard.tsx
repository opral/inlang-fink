import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { createComponent } from "@lit/react";
import { InlangMessage, InlangVariant, InlangPatternEditor, type ChangeEventDetail } from "@inlang/editor-component";
import type { BundleNested, MessageNested, ProjectSettings } from "@inlang/sdk/browser";
import { Editor } from "./Editor";
import { Dropdown } from "./Menu";
import { PatternText } from "./PatternText";
import { UsageCode } from "./UsagePeek";
import { describeUsage, type Usage } from "./usage";
import { languageName, type LanguageFocus } from "./languages";
import type { Issue } from "./issues";

const MessageElement = createComponent({ react: React, tagName: "inlang-message", elementClass: InlangMessage });
const VariantElement = createComponent({ react: React, tagName: "inlang-variant", elementClass: InlangVariant });
const PatternElement = createComponent({ react: React, tagName: "inlang-pattern-editor", elementClass: InlangPatternEditor });

export type CardStatus = { tone: "todo" | "defect" | "neutral"; label: string };
// Props are primitives or stable references so typing in one message re-renders only that card.
type Props = {
  bundle: BundleNested; settings: ProjectSettings; focus: LanguageFocus; issuesOf: (bundle: BundleNested, locale: string) => Issue[];
  usages?: Usage[]; code?: { url: string; scope: string }; replaced?: boolean; edited?: boolean; unused?: boolean;
  change: (detail: ChangeEventDetail) => void; addLocale: (bundle: BundleNested, locale: string) => void; removeBundle: (id: string) => void;
};

const isSimple = (message: MessageNested) => !message.selectors.length && message.variants.length <= 1;
/** The form shown when a message has several: the one that matches anything. */
const defaultVariant = (message: MessageNested) => message.variants.find(variant => variant.matches.every(match => match.type === "catchall-match")) ?? message.variants.at(-1);

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

export const MessageCard = memo(function MessageCard({ bundle, settings, focus, issuesOf, usages, code, replaced, edited, unused, change, addLocale, removeBundle }: Props) {
  const [showCode, setShowCode] = useState(false);
  const [showOthers, setShowOthers] = useState(false);
  const [structure, setStructure] = useState(false);
  const root = useRef<HTMLElement>(null);
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
  const messages = useMemo(() => new Map(bundle.messages.map(message => [message.id, structuredClone(message)])), [bundle]);
  const others = focus.all ? [] : settings.locales.filter(locale => locale !== focus.source && !targets.includes(locale));
  const othersTodo = others.filter(locale => issues[locale]?.length).length;
  const usage = usages?.[0];
  const row = (locale: string, label: boolean) => {
    const message = bundle.messages.find(value => value.locale === locale);
    return <div className="message-row" key={locale}>
      <div className="message-ref">{source ? <><PatternText pattern={defaultVariant(source)?.pattern ?? []} />{source.variants.length > 1 && <span className="form-count"> · {source.variants.length} forms</span>}</> : <span className="muted">No {languageName(focus.source)} text</span>}</div>
      <div className="message-target">
        {label && <span className="target-locale">{languageName(locale)}</span>}
        {!message ? <button type="button" className="field empty" onClick={() => addLocale(bundle, locale)}>Translate to {languageName(locale)}</button>
          : isSimple(message) ? message.variants.map(variant => <div key={variant.id} className="field"><PatternElement variant={variants.get(variant.id)} aria-label={`${languageName(locale)} translation of ${bundle.id}`} /></div>)
          : <MessageElement message={messages.get(message.id)} variants={messages.get(message.id)!.variants} settings={settings} className="forms-legacy">
              {message.variants.map(variant => <VariantElement slot="variant" key={variant.id} variant={variants.get(variant.id)}><PatternElement slot="pattern-editor" variant={variants.get(variant.id)} /></VariantElement>)}
            </MessageElement>}
        {(issues[locale] ?? []).filter(issue => issue.type === "missing-variable").map(issue => <p key={`${locale}-${"name" in issue ? issue.name : ""}`} className="field-note defect">Missing {"{"}{"name" in issue ? issue.name : ""}{"}"} in {languageName(locale)}.</p>)}
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
