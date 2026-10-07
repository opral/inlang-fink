import type { BundleNested } from "@inlang/sdk/browser";

/** Lowercased search terms; every term must match (e.g. "diese api"). */
export const searchTerms = (query: string) => query.toLowerCase().split(/\s+/).filter(Boolean);

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

const HIGHLIGHT = "fink-search";
/** Marks matches inside the light-DOM pattern editors with the CSS Custom Highlight API. */
export function highlightMatches(root: Element | null, terms: string[]) {
  if (typeof CSS === "undefined" || !("highlights" in CSS)) return;
  if (!root || !terms.length) { CSS.highlights.delete(HIGHLIGHT); return; }
  const ranges: Range[] = [];
  for (const editor of root.querySelectorAll("inlang-pattern-editor")) {
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
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
