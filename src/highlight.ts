// Minimal syntax highlighting for one line of JS/TS/Svelte/JSX in the code peek. Line-based and
// stateless (no multi-line strings or comments), which is enough for one line of context around a call.
export type Token = { text: string; kind?: "comment" | "string" | "tag" | "attr" | "keyword" | "number" | "punct" | "call" };

const KEYWORDS = "import|from|export|default|const|let|var|function|return|if|else|for|of|in|await|async|new|class|extends|type|interface|as|true|false|null|undefined|this|typeof|each|then|catch|try|switch|case|break";
const RULES: [RegExp, Token["kind"]][] = [
  [/\/\/.*$|\/\*.*?\*\/|<!--.*?-->/y, "comment"],
  [/"(?:\\.|[^"\\])*"?|'(?:\\.|[^'\\])*'?|`(?:\\.|[^`\\])*`?/y, "string"],
  [/<\/?[A-Za-z][\w.:-]*|\/?>/y, "tag"],
  [/[A-Za-z_:@][\w:.-]*(?=\s*=)/y, "attr"],
  [/\{[#/:@](?:if|else|each|await|then|catch|key|html|const|debug|render|snippet)\b/y, "keyword"],
  [new RegExp(`\\b(?:${KEYWORDS})\\b`, "y"), "keyword"],
  [/\b\d+(?:\.\d+)?\b/y, "number"],
  [/[A-Za-z_$][\w$]*(?=\s*\()/y, "call"],
  [/[{}()[\];,]/y, "punct"],
];

export function highlight(line: string): Token[] {
  const tokens: Token[] = [];
  let plain = "";
  for (let index = 0; index < line.length;) {
    let matched = false;
    for (const [rule, kind] of RULES) {
      rule.lastIndex = index;
      const match = rule.exec(line);
      if (!match || !match[0]) continue;
      if (plain) { tokens.push({ text: plain }); plain = ""; }
      tokens.push({ text: match[0], kind });
      index += match[0].length;
      matched = true;
      break;
    }
    if (!matched) {
      // Identifiers in one piece so a keyword inside a word ("format") isn't matched.
      const word = /[\w$]+|./y; word.lastIndex = index;
      const part = word.exec(line)![0];
      plain += part; index += part.length;
    }
  }
  if (plain) tokens.push({ text: plain });
  return tokens;
}

/** Splits tokens at [from, to) so the message call can be marked inside highlighted code. */
export function splitAt(tokens: Token[], from: number, to: number): { token: Token; marked: boolean }[] {
  const result: { token: Token; marked: boolean }[] = [];
  let offset = 0;
  for (const token of tokens) {
    const end = offset + token.text.length;
    for (const [start, stop, marked] of [[offset, Math.min(end, from), false], [Math.max(offset, from), Math.min(end, to), true], [Math.max(offset, to), end, false]] as const)
      if (stop > start) result.push({ token: { ...token, text: token.text.slice(start - offset, stop - offset) }, marked });
    offset = end;
  }
  return result;
}
