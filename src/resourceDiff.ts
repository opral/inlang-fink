/** Compare plugin exports by message and variant, independent of JSON formatting. */
export type DiffField = { label: string; before?: string; after?: string };
export type MessageDiff = { id: string; kind: "added" | "removed" | "modified"; fields: DiffField[] };
export type ResourceDiff = { path: string; messages: MessageDiff[]; error?: string };
export type TextPart = { text: string; changed: boolean };

/** Word comparison, bounded so long translations cannot block the review UI. */
export function diffText(before = "", after = ""): { before: TextPart[]; after: TextPart[] } {
  const left = before.match(/\s+|[^\s]+/g) ?? [], right = after.match(/\s+|[^\s]+/g) ?? [];
  const unchangedLeft = new Set<number>(), unchangedRight = new Set<number>();
  if (left.length * right.length <= 250_000 && left.length <= 4000 && right.length <= 4000) {
    const width = right.length + 1;
    const lengths = new Uint16Array((left.length + 1) * width);
    for (let i = left.length - 1; i >= 0; i--) for (let j = right.length - 1; j >= 0; j--) {
      lengths[i * width + j] = left[i] === right[j] ? lengths[(i + 1) * width + j + 1] + 1 : Math.max(lengths[(i + 1) * width + j], lengths[i * width + j + 1]);
    }
    let i = 0, j = 0;
    while (i < left.length && j < right.length) {
      if (left[i] === right[j]) { unchangedLeft.add(i++); unchangedRight.add(j++); }
      else if (lengths[(i + 1) * width + j] >= lengths[i * width + j + 1]) i++;
      else j++;
    }
  } else {
    let prefix = 0;
    while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) { unchangedLeft.add(prefix); unchangedRight.add(prefix++); }
    let i = left.length - 1, j = right.length - 1;
    while (i >= prefix && j >= prefix && left[i] === right[j]) { unchangedLeft.add(i--); unchangedRight.add(j--); }
  }
  const parts = (tokens: string[], unchanged: Set<number>) => {
    const result: TextPart[] = [];
    tokens.forEach((text, index) => {
      const changed = !unchanged.has(index), previous = result[result.length - 1];
      if (previous?.changed === changed) previous.text += text;
      else result.push({ text, changed });
    });
    return result;
  };
  return { before: parts(left, unchangedLeft), after: parts(right, unchangedRight) };
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
const object = (value: Json | undefined): value is { [key: string]: Json } => !!value && typeof value === "object" && !Array.isArray(value);
function stable(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (object(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
const display = (value: Json) => typeof value === "string" ? value : JSON.stringify(value, null, 2);

function messages(resource: string | undefined): Map<string, Json> {
  const result = new Map<string, Json>();
  if (resource === undefined) return result;
  const root: Json = JSON.parse(resource);
  if (!object(root)) throw new Error("Expected a JSON message object.");
  const visit = (value: Json, segments: string[]) => {
    if (object(value)) {
      for (const [key, child] of Object.entries(value)) visit(child, [...segments, key]);
    } else {
      // Quote dotted keys so nested and literal-dot message IDs cannot collide.
      const id = segments.map(segment => segment.includes(".") ? JSON.stringify(segment) : segment).join(".");
      result.set(id, value);
    }
  };
  for (const [key, value] of Object.entries(root)) if (key !== "$schema") visit(value, [key]);
  return result;
}

function fields(value: Json | undefined): Map<string, Json> {
  const result = new Map<string, Json>();
  if (value === undefined) return result;
  if (Array.isArray(value) && value.length > 0 && value.every(part => object(part) && object(part.match))) {
    value.forEach((part, index) => {
      if (!object(part) || !object(part.match)) return;
      const prefix = value.length > 1 ? `Message ${index + 1} · ` : "";
      if (part.declarations !== undefined) result.set(`${prefix}Variables`, part.declarations);
      if (part.selectors !== undefined) result.set(`${prefix}Selectors`, part.selectors);
      for (const [condition, pattern] of Object.entries(part.match)) result.set(`${prefix}${condition || "Translation"}`, pattern);
    });
  } else result.set("Translation", value);
  return result;
}

/** after contains the changed files, before is the full canonical baseline. */
export function diffResources(before: Record<string, string>, after: Record<string, string>): ResourceDiff[] {
  return Object.keys(after).sort().map(path => {
    try {
      const oldMessages = messages(before[path]);
      const newMessages = messages(after[path]);
      const changes: MessageDiff[] = [];
      for (const id of [...new Set([...oldMessages.keys(), ...newMessages.keys()])].sort()) {
        const oldValue = oldMessages.get(id), newValue = newMessages.get(id);
        if (oldValue !== undefined && newValue !== undefined && stable(oldValue) === stable(newValue)) continue;
        const oldFields = fields(oldValue), newFields = fields(newValue);
        const changesInFields: DiffField[] = [];
        for (const label of new Set([...oldFields.keys(), ...newFields.keys()])) {
          const oldField = oldFields.get(label), newField = newFields.get(label);
          if (oldField !== undefined && newField !== undefined && stable(oldField) === stable(newField)) continue;
          changesInFields.push({ label, before: oldField === undefined ? undefined : display(oldField), after: newField === undefined ? undefined : display(newField) });
        }
        changes.push({ id, kind: oldValue === undefined ? "added" : newValue === undefined ? "removed" : "modified", fields: changesInFields });
      }
      return { path, messages: changes };
    } catch {
      return { path, messages: [], error: "This resource could not be compared as JSON. Review the file in GitHub before pushing." };
    }
  });
}
