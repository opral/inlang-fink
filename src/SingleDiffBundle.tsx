// Adapted from packages/fink/src/components/SingleDiffBundle.tsx in opral/inlang.
import React, { useMemo } from "react";
import { createComponent } from "@lit/react";
import { InlangBundle, InlangMessage, InlangVariant, InlangPatternEditor } from "@inlang/editor-component";
import type { BundleNested, ProjectSettings } from "@inlang/sdk/browser";

const BundleElement = createComponent({ tagName: "inlang-bundle", elementClass: InlangBundle, react: React });
const MessageElement = createComponent({ tagName: "inlang-message", elementClass: InlangMessage, react: React });
const VariantElement = createComponent({ tagName: "inlang-variant", elementClass: InlangVariant, react: React });
const PatternElement = createComponent({ tagName: "inlang-pattern-editor", elementClass: InlangPatternEditor, react: React });
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export default function SingleDiffBundle({ bundle, other, settings, side }: {
  bundle?: BundleNested; other?: BundleNested; settings: ProjectSettings; side: "before" | "after";
}) {
  const rendered = useMemo(() => bundle && structuredClone(bundle), [bundle]);
  const color = side === "before" ? "red" : "green";
  if (!rendered) return <p className="rich-diff-absent">{side === "before" ? "Bundle added" : "Bundle deleted"}</p>;
  return <div className="rich-diff-render" inert>
    <BundleElement bundle={rendered} className={`highlighted-bundle ${!equal(bundle?.declarations, other?.declarations) ? `highlight-variables-${color}` : ""}`}>
      {rendered.messages.map(message => {
        const oldMessage = other?.messages.find(value => value.locale === message.locale);
        const changedSelectors = !equal(message.selectors, oldMessage?.selectors);
        return <MessageElement slot="message" key={message.id} message={message} variants={message.variants} settings={settings} className={changedSelectors ? `highlight-selector-${color}` : ""}>
          {message.variants.map(variant => {
            const previous = oldMessage?.variants.find(value => equal(value.matches, variant.matches));
            const changed = !previous || !equal(previous.pattern, variant.pattern);
            return <VariantElement slot="variant" key={variant.id} variant={variant} className={`${changed ? "" : "diff-unchanged"} ${!previous ? `highlight-match-${color}` : ""}`}>
              <PatternElement slot="pattern-editor" variant={variant} className={changed ? `highlight-${color}` : ""} />
            </VariantElement>;
          })}
        </MessageElement>;
      })}
    </BundleElement>
  </div>;
}
