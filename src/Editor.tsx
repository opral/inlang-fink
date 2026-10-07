import React, { useState } from "react";
import { createComponent } from "@lit/react";
import { InlangBundle, InlangMessage, InlangVariant, InlangPatternEditor, InlangAddSelector, type ChangeEventDetail } from "@inlang/editor-component";
import type { BundleNested, MessageNested, ProjectSettings } from "@inlang/sdk/browser";
const BundleElement = createComponent({ react: React, tagName: "inlang-bundle", elementClass: InlangBundle, events: { onEntityChange: "change" } });
const MessageElement = createComponent({ react: React, tagName: "inlang-message", elementClass: InlangMessage });
const VariantElement = createComponent({ react: React, tagName: "inlang-variant", elementClass: InlangVariant });
const PatternElement = createComponent({ react: React, tagName: "inlang-pattern-editor", elementClass: InlangPatternEditor });
const SelectorElement = createComponent({ react: React, tagName: "inlang-add-selector", elementClass: InlangAddSelector, events: { onEntityChange: "change", onComplete: "submit" } });
export function Editor({ bundle, settings, change, addLocale, removeBundle }: { bundle: BundleNested; settings: ProjectSettings; change: (detail: ChangeEventDetail) => void; addLocale: (bundle: BundleNested, locale: string) => void; removeBundle: (id: string) => void }) {
  const [selector, setSelector] = useState<MessageNested>();
  const handleChange = (event: Event) => { if (event instanceof CustomEvent && event.detail?.entity) change(structuredClone(event.detail)); };
  return <article className="bundle" data-bundle={bundle.id}>
    <BundleElement bundle={structuredClone(bundle)} onEntityChange={handleChange}>
      <button slot="bundle-action" onClick={() => removeBundle(bundle.id)} aria-label={`Delete ${bundle.id}`}>Delete message</button>
      {settings.locales.map(locale => {
        const message = bundle.messages.find(m => m.locale === locale);
        return message ? <MessageElement slot="message" key={message.id} message={structuredClone(message)} variants={structuredClone(message.variants)} settings={settings}>
          {message.variants.map(variant => <VariantElement slot="variant" key={variant.id} variant={structuredClone(variant)}>
            <PatternElement slot="pattern-editor" variant={structuredClone(variant)} />
            {message.variants.length > 1 && <button slot="variant-action" aria-label="Delete variant" onClick={() => change({ entity: "variant", entityId: variant.id })}>×</button>}
          </VariantElement>)}
          <button slot="selector-button" onClick={() => setSelector(message)}>Add selector / plural</button>
          {!message.selectors.length && <button slot="variant" onClick={() => setSelector(message)}>Add selector / plural</button>}
        </MessageElement> : <div slot="message" className="missing" key={locale}><span>{locale}</span><button onClick={() => addLocale(bundle, locale)}>Add translation</button></div>;
      })}
    </BundleElement>
    {selector && <div className="dialog-backdrop"><section role="dialog" aria-modal="true" aria-label="Add selector or plural" className="dialog"><header><h2>Add selector / plural</h2><button onClick={() => setSelector(undefined)}>Close</button></header><SelectorElement bundle={structuredClone(bundle)} message={structuredClone(selector)} variants={structuredClone(selector.variants)} onEntityChange={handleChange} onComplete={() => setSelector(undefined)} /></section></div>}
  </article>;
}
