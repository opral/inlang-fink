import type { BundleNested } from "@inlang/sdk/browser";

/** Lowercased search terms; every term must match (e.g. "diese api"). */
// Braces are ignored so "{count}" finds the variable the way it is displayed.
export const searchTerms = (query: string) => query.toLowerCase().replace(/[{}]/g, " ").split(/\s+/).filter(Boolean);

/** The text a translator sees: bundle id, message text, and variable names. */
export function searchText(bundle: BundleNested): string {
  const parts: string[] = [bundle.id];
  for (const message of bundle.messages) for (const variant of message.variants) {
    for (const part of variant.pattern as { type: string; value?: unknown; arg?: { name?: string } }[]) {
      parts.push(part.type === "text" ? String(part.value ?? "") : part.arg?.name ?? "");
    }
  }
  return parts.join("\n").toLowerCase();
}

// Shared with <inlang-pattern-view>, which styles this highlight inside its shadow root.
const HIGHLIGHT = "inlang-search";
/** Marks matches in message keys, source text and translation editors with the CSS Custom Highlight API. */
export function highlightMatches(root: Element | null, terms: string[]) {
  if (typeof CSS === "undefined" || !("highlights" in CSS)) return;
  if (!root || !terms.length) { CSS.highlights.delete(HIGHLIGHT); return; }
  const ranges: Range[] = [];
  // Only text a translator reads: the editor also renders its scoped <style> in light DOM.
  const scopes: Node[] = [...root.querySelectorAll(".message-key, inlang-pattern-editor [contenteditable]")];
  for (const view of root.querySelectorAll(".message-ref inlang-pattern-view")) if (view.shadowRoot) scopes.push(view.shadowRoot);
  for (const scope of scopes) {
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, { acceptNode: node => node.parentElement?.closest("style") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
      const text = node.data.toLowerCase();
      if (text.length !== node.data.length) continue; // Case mapping changed offsets; skip rather than misplace.
      for (const term of terms) {
        for (let index = text.indexOf(term); index !== -1; index = text.indexOf(term, index + term.length)) {
          const range = new Range(); range.setStart(node, index); range.setEnd(node, index + term.length); ranges.push(range);
        }
      }
    }
  }
  CSS.highlights.set(HIGHLIGHT, new Highlight(...ranges));
}
