import { describe, expect, it } from "vitest";
import type { BundleNested, Declaration, MessageNested } from "@inlang/sdk/browser";
import { closestName, joinMessage, markupLabel, messageFromSource, numberInputs, referenceMarkup, renameVariable, splitMessage, untranslatedWords, variableSuggestions, words } from "../src/flows";

const v = (name: string) => ({ type: "expression" as const, arg: { type: "variable-reference" as const, name } });
const t = (value: string) => ({ type: "text" as const, value });
const declarations: Declaration[] = [
  { type: "input-variable", name: "count" },
  { type: "input-variable", name: "email" },
  { type: "local-variable", name: "countPlural", value: { type: "expression", arg: { type: "variable-reference", name: "count" }, annotation: { type: "function-reference", name: "plural", options: [] } } },
];
const plural = (locale: string, one: string, other: string): MessageNested => ({
  id: `m-${locale}`, bundleId: "invites", locale, selectors: [{ type: "variable-reference", name: "countPlural" }],
  variants: [
    { id: `${locale}-one`, messageId: `m-${locale}`, matches: [{ type: "literal-match", key: "countPlural", value: "one" }], pattern: [{ type: "markup-start", name: "b" }, v("count"), t(` ${one}`), { type: "markup-end", name: "b" }, t(" sent to "), { type: "markup-start", name: "link" }, v("email"), { type: "markup-end", name: "link" }] },
    { id: `${locale}-other`, messageId: `m-${locale}`, matches: [{ type: "catchall-match", key: "countPlural" }], pattern: [{ type: "markup-start", name: "b" }, v("count"), t(` ${other}`), { type: "markup-end", name: "b" }, t(" sent to "), { type: "markup-start", name: "link" }, v("email"), { type: "markup-end", name: "link" }] },
  ],
});
const english = plural("en", "invitation", "invitations");
const bundle: BundleNested = { id: "invites", declarations, messages: [english] };

describe("markup", () => {
  it("names markup in words and offers the reference's tags with their text", () => {
    expect(markupLabel("link")).toBe("Link");
    expect(markupLabel("strong")).toBe("Bold");
    expect(markupLabel("icon")).toBe("<icon>");
    const markup = referenceMarkup(english);
    expect(markup.paired.map(item => item.label)).toEqual(["Bold like “{count} invitation”", "Link like “{email}”"]);
  });
});

describe("variables", () => {
  it("suggests missing variables first and catches misspellings", () => {
    expect(variableSuggestions(english, [v("count")], declarations)).toEqual([{ name: "email", hint: "missing" }, { name: "count", hint: "used" }]);
    expect(closestName("totl", ["used", "total"])).toBe("total");
    expect(closestName("banana", ["used", "total"])).toBeUndefined();
    expect(renameVariable([t("von "), v("totl"), t(" belegt")], "totl", "total")).toEqual([t("von "), v("total"), t(" belegt")]);
    expect(renameVariable([t("a "), v("x"), t(" b")], "x")).toEqual([t("a  b")]);
  });
});

describe("per-language selectors", () => {
  const russian: MessageNested = { id: "m-ru", bundleId: "files", locale: "ru", selectors: [], variants: [{ id: "ru-1", messageId: "m-ru", matches: [], pattern: [v("count"), t(" файлов выбрано")] }] };
  const files: BundleNested = { id: "files", declarations: [{ type: "input-variable", name: "count" }], messages: [russian] };

  it("splits one language by number, adding the plural declaration once", () => {
    expect(numberInputs(russian, files.declarations)).toEqual(["count"]);
    const split = splitMessage(files, russian, { plural: "count" });
    expect(split.declarations?.at(-1)).toMatchObject({ type: "local-variable", name: "countPlural" });
    expect(split.variants.map(variant => variant.matches.map(match => match.type === "literal-match" ? match.value : "*").join())).toEqual(["one", "few", "many", "*"]);
    expect(split.variants.every(variant => JSON.stringify(variant.pattern) === JSON.stringify(russian.variants[0]!.pattern))).toBe(true);
    const joined = joinMessage({ ...russian, selectors: split.selectors, variants: split.variants });
    expect(joined.selectors).toEqual([]);
    expect(joined.variants).toHaveLength(1);
  });
});

describe("start from the source", () => {
  it("copies forms, tokens and markup for languages with plurals", () => {
    const shape = messageFromSource(bundle, english, "ru", "m-ru", true);
    expect(shape.variants.map(variant => variant.matches.map(match => match.type === "literal-match" ? match.value : "*").join())).toEqual(["one", "few", "many", "*"]);
    expect(shape.variants[0]!.pattern).toEqual(english.variants[0]!.pattern);
    expect(shape.variants[1]!.pattern).toEqual(english.variants[1]!.pattern);
    expect(messageFromSource(bundle, english, "de", "m-de", false).variants.every(variant => variant.pattern.length === 0)).toBe(true);
  });

  it("drops a plural the language doesn't have (Japanese)", () => {
    const shape = messageFromSource(bundle, english, "ja", "m-ja", false);
    expect(shape.selectors).toEqual([]);
    expect(shape.variants).toHaveLength(1);
  });

  it("tracks which source words are left", () => {
    const seeded = words(english.variants[1]!.pattern);
    expect(seeded).toEqual(["invitations", "sent", "to"]);
    expect(untranslatedWords(seeded, [v("count"), t(" Einladungen sent to")])).toEqual(["sent", "to"]);
  });
});
