import React, { memo, useMemo, useState } from "react";
import { createComponent } from "@lit/react";
import { InlangBundle, InlangBundleAction, InlangMessage, InlangVariant, InlangPatternEditor, InlangAddSelector, type ChangeEventDetail } from "@inlang/editor-component";
import type { BundleNested, MessageNested, ProjectSettings } from "@inlang/sdk/browser";
import { UsagePeek } from "./UsagePeek";
import type { Usage } from "./usage";
const BundleElement = createComponent({ react: React, tagName: "inlang-bundle", elementClass: InlangBundle, events: { onEntityChange: "change" } });
const BundleActionElement = createComponent({ react: React, tagName: "inlang-bundle-action", elementClass: InlangBundleAction });
const MessageElement = createComponent({ react: React, tagName: "inlang-message", elementClass: InlangMessage });
const VariantElement = createComponent({ react: React, tagName: "inlang-variant", elementClass: InlangVariant });
const PatternElement = createComponent({ react: React, tagName: "inlang-pattern-editor", elementClass: InlangPatternEditor });
const SelectorElement = createComponent({ react: React, tagName: "inlang-add-selector", elementClass: InlangAddSelector, events: { onEntityChange: "change", onComplete: "submit" } });
export const Editor = memo(function Editor({ bundle, settings, locales, change, addLocale, removeBundle, usages, unused = false, code }: { usages?: Usage[]; unused?: boolean; code?: { url: string; scope: string }; bundle: BundleNested; settings: ProjectSettings; locales: string[]; change: (detail: ChangeEventDetail) => void; addLocale: (bundle: BundleNested, locale: string) => void; removeBundle: (id: string) => void }) {
  const rendered = useMemo(() => structuredClone(bundle), [bundle]);
  const [selector, setSelector] = useState<MessageNested>();
  const handleChange = (event: Event) => { if (event instanceof CustomEvent && event.detail?.entity) change(structuredClone(event.detail)); };
  return <article className="bundle" data-bundle={bundle.id}>
    <BundleElement bundle={rendered} onEntityChange={handleChange}>
      <BundleActionElement slot="bundle-action" actionTitle="Delete" onClick={() => removeBundle(bundle.id)} aria-label={`Delete ${bundle.id}`} />
      {code && <UsagePeek bundleId={bundle.id} usages={usages} unused={unused} codeUrl={code.url} scope={code.scope} />}
      {settings.locales.filter(locale => !locales.length || locales.includes(locale) || locale === settings.baseLocale).map(locale => {
        const message = rendered.messages.find(m => m.locale === locale);
        return message ? <MessageElement slot="message" key={message.id} message={message} variants={message.variants} settings={settings}>
          {message.variants.map(variant => <VariantElement slot="variant" key={variant.id} variant={variant}>
            <PatternElement slot="pattern-editor" variant={variant} />
            <button className="variant-action" slot="variant-action" aria-label="Add selector / plural" title="Add selector / plural" onClick={() => setSelector(message)}>＋</button>
            {message.variants.length > 1 && <button className="variant-action" slot="variant-action" aria-label="Delete variant" onClick={() => change({ entity: "variant", entityId: variant.id })}>×</button>}
          </VariantElement>)}
          <button className="selector-add" slot="selector-button" aria-label="Add selector / plural" title="Add selector / plural" onClick={() => setSelector(message)}>＋</button>
        </MessageElement> : <MessageElement slot="message" key={locale} message={{ id: `missing-${bundle.id}-${locale}`, bundleId: bundle.id, locale, selectors: [] }} variants={[]} settings={settings}><button slot="variant" className="missing-translation" onClick={() => addLocale(bundle, locale)}>＋ Add translation</button></MessageElement>;
      })}
    </BundleElement>
    {selector && <div className="dialog-backdrop"><section role="dialog" aria-modal="true" aria-label="Add selector or plural" className="dialog"><header><h2>Add selector / plural</h2><button onClick={() => setSelector(undefined)}>Close</button></header><SelectorElement bundle={rendered} message={structuredClone(selector)} variants={structuredClone(selector.variants)} onEntityChange={handleChange} onComplete={() => setSelector(undefined)} /></section></div>}
  </article>;
});
