import type { SourceFile, UsageReference } from "@inlang/sdk/browser";

// Where messages are used in the app's code. The inlang SDK finds the references
// (`findUsages`, from the m-function matcher's analysis); Fink adds a snippet and a role for translators.
export type Usage = { path: string; line: number; from: number; to: number; snippet: { start: number; lines: string[] }; role?: string };
const SNIPPET_WIDTH = 240;

/** Code a usage analysis can read; generated Paraglide output and dependencies are left out. */
export function sourceSnapshot(files: Record<string, string>): SourceFile[] {
  return Object.entries(files)
    .filter(([path]) => /\.(?:[cm]?[jt]sx?|svelte|vue|astro)$/i.test(path) && !/\.d\.[cm]?ts$/i.test(path) && !/(^|\/)(node_modules|paraglide|dist|build|\.svelte-kit)\//.test(path))
    .map(([path, content]) => ({ path, content }));
}

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

/** Usages per message from SDK references, with a snippet and role, most descriptive first. */
export function usagesFromReferences(references: readonly UsageReference[], files: Record<string, string>): Map<string, Usage[]> {
  const usages = new Map<string, Usage[]>(), split = new Map<string, { lines: string[]; offsets: number[] }>();
  for (const reference of references) {
    const text = files[reference.path];
    if (text === undefined) continue;
    let file = split.get(reference.path);
    if (!file) {
      const lines = text.split("\n"), offsets: number[] = [];
      for (let line = 0, offset = 0; line < lines.length; offset += lines[line]!.length + 1, line++) offsets.push(offset);
      split.set(reference.path, file = { lines, offsets });
    }
    const { line, column } = reference.start;
    const end = reference.end.line === line ? reference.end.column : file.lines[line - 1]?.length ?? column;
    const view = snippet(file.lines, line, column, end);
    const usage: Usage = { path: reference.path, line, from: Math.max(0, view.from), to: Math.max(0, view.to), snippet: { start: view.start, lines: view.lines }, role: usageRole(text, (file.offsets[line - 1] ?? 0) + column, reference.path) };
    const list = usages.get(reference.bundleId);
    if (list) list.push(usage); else usages.set(reference.bundleId, [usage]);
  }
  for (const list of usages.values()) list.sort((a, b) => Number(!a.role || a.role.startsWith("In <")) - Number(!b.role || b.role.startsWith("In <")) || a.path.localeCompare(b.path) || a.line - b.line);
  return usages;
}

const humanize = (segment: string) => segment.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, char => char.toUpperCase());
/** Where in the app a file renders, as a breadcrumb: routes/settings/admin/+page.svelte → "Settings › Admin". */
export function pageOf(path: string): { page?: string; component?: string } {
  const parts = path.split("/");
  const root = parts.findIndex(part => part === "routes" || part === "pages" || part === "app");
  if (root >= 0) {
    const segments: string[] = [];
    for (const part of parts.slice(root + 1)) {
      if (part.includes(".") || ["components", "forms", "_components", "lib", "ui", "utils", "hooks"].includes(part)) break;
      if (/^\(.*\)$/.test(part) || /^\[.*\]$/.test(part) || part.startsWith("@")) continue;
      segments.push(humanize(part));
    }
    return segments.length ? { page: segments.join(" › ") } : { page: "Home" };
  }
  const file = parts.at(-1) ?? path;
  return { component: humanize(file.replace(/\.(svelte|vue|astro|[cm]?[jt]sx?)$/, "")).toLowerCase() };
}
/** "A button on Settings › Profile", "A toast in the copy to clipboard component", "Part of refresh_failed". */
export function describeUsage(usage: Usage): string {
  const where = pageOf(usage.path), role = usage.role;
  const place = where.page ? `on ${where.page}` : `in the ${where.component} component`;
  if (!role) return where.page ? `Used on ${where.page}` : `Used in the ${where.component} component`;
  if (role.startsWith("Part of ")) return `${role} · ${place}`;
  if (role.startsWith("In <")) return `Inside ${role.slice(3)} ${place}`;
  const noun = role.toLowerCase();
  return `${/^[aeiou]/.test(noun) ? "An" : "A"} ${noun} ${place}`;
}
