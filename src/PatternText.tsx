import type { ReactNode } from "react";
import type { Pattern } from "@inlang/sdk/browser";

const FORMATTING: Record<string, string> = { b: "strong", strong: "strong", bold: "strong", i: "em", em: "em", italic: "em", a: "u", link: "u", u: "u" };

/** Read-only pattern: text, variables as quiet `{name}` tokens, known markup as real formatting. */
export function PatternText({ pattern }: { pattern: Pattern }) {
  const root: ReactNode[] = [], stack: { name: string; children: ReactNode[] }[] = [];
  const push = (node: ReactNode) => (stack.at(-1)?.children ?? root).push(node);
  pattern.forEach((part, index) => {
    if (part.type === "text") push(part.value);
    else if (part.type === "expression") {
      const name = part.arg.type === "variable-reference" ? part.arg.name : part.arg.value;
      push(<span key={index} className="token" title={part.annotation ? `${name} · ${part.annotation.name}` : name}>{`{${name}}`}</span>);
    } else if (part.type === "markup-start") stack.push({ name: part.name, children: [] });
    else if (part.type === "markup-end") {
      const open = stack.pop();
      if (open) { const Tag = (FORMATTING[open.name] ?? "span") as "span"; push(<Tag key={index} className={FORMATTING[open.name] ? undefined : "markup"} data-markup={open.name}>{open.children}</Tag>); }
    } else push(<span key={index} className="markup-tag">{`<${part.name}/>`}</span>);
  });
  while (stack.length) { const open = stack.pop()!; push(<span key={`open-${stack.length}`}>{open.children}</span>); }
  return <>{root}</>;
}
