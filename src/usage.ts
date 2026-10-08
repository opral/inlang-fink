import mFunctionMatcher from "@inlang/plugin-m-function-matcher";

// Where messages are used in the app's code. The inlang m-function-matcher plugin
// (the SDK's ideExtension.messageReferenceMatchers contract) finds Paraglide's m.*()
// calls; Fink adds a snippet and a role for translators.
export type Usage = { path: string; line: number; from: number; to: number; snippet: { start: number; lines: string[] }; role?: string };
export type UsageIndex = { usages: Map<string, Usage[]>; words: Set<string>; dynamic: boolean };
type Match = { messageId: string; position: { start: { line: number; character: number }; end: { line: number; character: number } } };

const matcher = (mFunctionMatcher.meta!["app.inlang.ideExtension"] as { messageReferenceMatchers: ((args: { documentText: string }) => Promise<Match[]>)[] }).messageReferenceMatchers[0]!;
const IMPORTS_M = /import\s+(?:\*\s+as\s+m|\{[^}]*\bm\b[^}]*\})\s+from/;
const NAMESPACE_IMPORT = /import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+["'][^"']*paraglide\/messages[^"']*["']/g;
// The plugin's matcher is quadratic on long runs without an "m"; minified or generated files are skipped.
const MAX_SCANNED = 200_000, LONG_LINE = /[^\n]{5000}/;
const SNIPPET_WIDTH = 240;

const ATTRIBUTE_ROLES: Record<string, string> = { placeholder: "Input placeholder", "aria-label": "Accessible label", title: "Tooltip", alt: "Image description", label: "Label", description: "Description", tooltip: "Tooltip", helptext: "Help text", "help-text": "Help text" };
const PROPERTY_ROLES: Record<string, string> = { confirmlabel: "Confirm button", cancellabel: "Cancel button", label: "Label", title: "Title", description: "Description", placeholder: "Input placeholder", message: "Message", tooltip: "Tooltip", heading: "Heading", text: "Text", error: "Error message" };
// A tag starts at "<" that does not follow an identifier (that would be a generic: Promise<void>).
// Attribute values may contain "=>" inside braces or quotes.
const TAG = /(?<![\w$)\]])<(\/?)([A-Za-z][\w.:-]*)((?:\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}|"[^"]*"|'[^']*'|[^<>{}"'])*?)(\/?)>/g;
const escape = (name: string) => name.replace(/\$/g, "\\$");

function elementRole(tag: string): string {
  if (/^button$|Button$|\.(Trigger|Action|Cancel)$/.test(tag)) return "Button";
  if (/^h[1-6]$|^Heading$/.test(tag)) return "Heading";
  if (/(^|\.)(Card|Dialog|Sheet|AlertDialog)?Title$/.test(tag)) return "Title";
  if (tag === "title") return "Page title";
  if (/^(a|A|Link|NavLink)$/.test(tag)) return "Link";
  if (/^(label|Label)$|\.Label$/.test(tag)) return "Label";
  if (/^(th|TableHead)$|\.Head$/.test(tag)) return "Table header";
  if (/^option$|Item$/.test(tag)) return "Menu item";
  if (/Description$/.test(tag)) return "Description";
  if (/^(p|span|div|strong|em|small|li|td|dd|dt|section|article)$/.test(tag)) return "Text";
  return `In <${tag}>`;
}

/** Whether `index` is in markup: not in a .ts/.js module, a <script> block or Astro frontmatter. */
function inMarkup(source: string, index: number, path: string): boolean {
  if (/\.[cm]?[jt]s$/.test(path)) return false;
  if (/\.(svelte|vue|astro|html)$/.test(path)) {
    if (source.lastIndexOf("<script", index) > source.lastIndexOf("</script>", index)) return false;
    if (path.endsWith(".astro") && source.startsWith("---") && index < source.indexOf("\n---", 3)) return false;
  }
  return true;
}

/** Best-effort role of a call at `index`, read from the code around it. */
export function usageRole(source: string, index: number, path = "file.svelte"): string | undefined {
  const lineStart = source.lastIndexOf("\n", index - 1) + 1, before = source.slice(lineStart, index), markup = inMarkup(source, index, path);
  const parent = /\bm\.([A-Za-z_$][\w$]*)\s*\(\s*\{[^{}]*$/.exec(before)?.[1];
  if (parent) return `Part of ${parent}`;
  if (/toast(\.\w+)?\s*\(\s*$/.test(before)) return "Toast";
  if (/\bconfirm\w*\s*\(\s*$/i.test(before)) return "Confirm dialog";
  if (markup) {
    // An attribute of a tag that opened shortly before the call.
    const tagStart = source.lastIndexOf("<", index), tagEnd = source.lastIndexOf(">", index);
    const attribute = tagStart > tagEnd && index - tagStart < 600 ? /([\w:-]+)\s*=\s*["']?\{?\s*[^=<>]*$/.exec(source.slice(tagStart, index))?.[1]?.toLowerCase() : undefined;
    if (attribute && ATTRIBUTE_ROLES[attribute]) return ATTRIBUTE_ROLES[attribute];
  }
  const property = /(\w+)\s*:\s*[^:,{}]*$/.exec(before)?.[1]?.toLowerCase();
  if (property && PROPERTY_ROLES[property]) return PROPERTY_ROLES[property];
  if (!markup) return;
  // Nearest open markup element before the call.
  const window = source.slice(Math.max(0, index - 2000), index), stack: string[] = [];
  for (const tag of window.matchAll(TAG)) {
    if (tag[4]) continue;
    if (tag[1]) { const at = stack.lastIndexOf(tag[2]!); if (at >= 0) stack.length = at; }
    else if (!/^(br|hr|img|input|meta|link)$/.test(tag[2]!)) stack.push(tag[2]!);
  }
  const open = stack.at(-1);
  if (open && open !== "script" && open !== "style") return elementRole(open);
}

/** Blanks comments, keeping length and newlines, so commented-out calls are not usages. */
export function maskComments(source: string): string {
  return source.replace(/("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\/[^\n]*|\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/g, (match, string?: string) => string ?? match.replace(/[^\n]/g, " "));
}

/** 1-based line containing `index`, by binary search over line start offsets. */
function lineOf(offsets: number[], index: number): number {
  let low = 0, high = offsets.length - 1;
  while (low < high) { const middle = (low + high + 1) >> 1; if (offsets[middle]! <= index) low = middle; else high = middle - 1; }
  return low + 1;
}

/** One line of context on each side (no blank edges), dedented, and cut to a window around the call on long lines. */
function snippet(lines: string[], line: number, from: number, to: number) {
  let start = Math.max(1, line - 1), end = Math.min(lines.length, line + 1);
  if (start < line && !lines[start - 1]!.trim()) start++;
  if (end > line && !lines[end - 1]!.trim()) end--;
  const picked = lines.slice(start - 1, end).map(text => text.replace(/\r$/, ""));
  const indents = picked.filter(text => text.trim()).map(text => /^\s*/.exec(text)![0].length);
  let cut = indents.length ? Math.min(...indents) : 0;
  if (Math.max(...picked.map(text => text.length)) - cut > SNIPPET_WIDTH) cut = Math.max(cut, from - 80);
  const clipped = (text: string) => cut > 0 && text.slice(0, cut).trim() !== "";
  const clip = (text: string) => (clipped(text) ? "…" : "") + text.slice(cut, cut + SNIPPET_WIDTH) + (text.length > cut + SNIPPET_WIDTH ? "…" : "");
  const shift = clipped(picked[line - start]!) ? 1 : 0;
  return { start, lines: picked.map(clip), from: from - cut + shift, to: Math.min(to, cut + SNIPPET_WIDTH) - cut + shift };
}

/** Scans source files; yields to the browser between files so the editor stays responsive. */
export async function scanUsages(files: Record<string, string>): Promise<UsageIndex> {
  const usages = new Map<string, Usage[]>(), words = new Set<string>();
  let dynamic = false, processed = 0;
  for (const [path, text] of Object.entries(files)) {
    if (++processed % 10 === 0) await new Promise(resolve => setTimeout(resolve));
    for (const word of text.match(/[\w$.-]+/g) ?? []) { words.add(word); if (word.includes(".")) for (const part of word.split(".")) words.add(part); }
    const aliases = [...text.matchAll(NAMESPACE_IMPORT)].map(match => match[1]!);
    if (IMPORTS_M.test(text) && !aliases.includes("m")) aliases.push("m");
    if (!aliases.length) continue;
    if (aliases.some(alias => new RegExp(`(?<![\\w$.])${escape(alias)}\\s*\\[(?!\\s*["'])`).test(text))) dynamic = true;
    if (text.length > MAX_SCANNED || LONG_LINE.test(text)) continue;
    const masked = maskComments(text), lines = text.split("\n"), maskedLines = masked.split("\n"), offsets: number[] = [];
    for (let line = 0, offset = 0; line < lines.length; offset += lines[line]!.length + 1, line++) offsets.push(offset);
    const found: { id: string; line: number; column: number; end: number }[] = [];
    if (aliases.includes("m")) for (const match of await matcher({ documentText: text })) {
      const { start, end } = match.position;
      // The plugin reports the identifier after `m.`; widen to include `m.` for highlighting.
      const lineText = lines[start.line - 1] ?? "", column = Math.max(0, lineText.lastIndexOf("m", start.character - 2));
      if (maskedLines[start.line - 1]?.[column] !== "m") continue; // inside a comment
      found.push({ id: match.messageId, line: start.line, column, end: end.line === start.line ? end.character - 1 : lineText.length });
    }
    // The plugin consumes a call's arguments and only knows the `m` import: a second pass finds
    // nested calls (m.a({ x: m.b() })) and calls through namespace aliases.
    for (const alias of aliases) {
      for (const match of masked.matchAll(new RegExp(`(?<![\\w$.])${escape(alias)}\\.([A-Za-z_$][\\w$]*)\\s*\\(`, "g"))) {
        const index = match.index!, line = lineOf(offsets, index), column = index - offsets[line - 1]!;
        if (found.some(value => value.line === line && (value.column === column || (value.column < column && column < value.end && value.id === match[1])))) continue;
        found.push({ id: match[1]!, line, column, end: column + match[0].length + 1 });
      }
    }
    for (const value of found) {
      const view = snippet(lines, value.line, value.column, value.end);
      const usage: Usage = { path, line: value.line, from: Math.max(0, view.from), to: Math.max(0, view.to), snippet: { start: view.start, lines: view.lines }, role: usageRole(text, offsets[value.line - 1]! + value.column, path) };
      const list = usages.get(value.id); if (list) list.push(usage); else usages.set(value.id, [usage]);
    }
  }
  for (const list of usages.values()) list.sort((a, b) => Number(!a.role || a.role.startsWith("In <")) - Number(!b.role || b.role.startsWith("In <")) || a.path.localeCompare(b.path) || a.line - b.line);
  return { usages, words, dynamic };
}

/**
 * Unused only when the id is a plain identifier that appears nowhere in the source and no message
 * is looked up dynamically (m[key]); anything less certain is not flagged.
 */
export const isUnused = (index: UsageIndex, bundleId: string) => !index.dynamic && /^[A-Za-z_$][\w$]*$/.test(bundleId) && !index.usages.has(bundleId) && !index.words.has(bundleId);
