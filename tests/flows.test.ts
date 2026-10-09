import { describe, expect, it } from "vitest";
import type { BundleNested, Declaration, MessageNested } from "@inlang/sdk/browser";
import { markupVariable, wrapVariable, joinMessage, markupLabel, messageFromSource, numberInputs, referenceMarkup, renameVariable, splitMessage, unsupportedExactNumber, untranslatedWords, variableSuggestions, words } from "../src/flows";

const v = (name: string) => ({ type: "expression" as const, arg: { type: "variable-reference" as const, name } });
const t = (value: string) => ({ type: "text" as const, value });
const declarations: Declaration[] = [
  { type: "input-variable", name: "count" },
  { type: "input-variable", name: "email" },
  { type: "local-variable", name: "countPlural", value: { type: "expression", arg: { type: "variable-reference", name: "count" }, annotation: { type: "function-reference", name: "plural", options: [] } } },
];
const plural = (locale: string, one: string, other: string): MessageNested => ({
  id: `m-${locale}`, bundle_id: "invites", locale, selectors: [{ type: "variable-reference", name: "countPlural" }],
  variants: [
    { id: `${locale}-one`, message_id: `m-${locale}`, matches: [{ type: "literal-match", key: "countPlural", value: "one" }], pattern: [{ type: "markup-start", name: "b" }, v("count"), t(` ${one}`), { type: "markup-end", name: "b" }, t(" sent to "), { type: "markup-start", name: "link" }, v("email"), { type: "markup-end", name: "link" }] },
    { id: `${locale}-other`, message_id: `m-${locale}`, matches: [{ type: "catchall-match", key: "countPlural" }], pattern: [{ type: "markup-start", name: "b" }, v("count"), t(` ${other}`), { type: "markup-end", name: "b" }, t(" sent to "), { type: "markup-start", name: "link" }, v("email"), { type: "markup-end", name: "link" }] },
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

describe("markup around a variable", () => {
  it("wraps the translation's variable like the reference", () => {
    expect(markupVariable(english, "link")).toBe("email");
    expect(markupVariable(english, "b")).toBeUndefined();
    expect(wrapVariable([v("client"), t(" ønsker adgang")], { type: "markup-start", name: "b" }, "client")).toEqual([{ type: "markup-start", name: "b" }, v("client"), { type: "markup-end", name: "b" }, t(" ønsker adgang")]);
  });
});

describe("variables", () => {
  it("suggests missing variables first and renames or removes them", () => {
    expect(variableSuggestions(english, [v("count")], declarations)).toEqual([{ name: "email", hint: "missing" }, { name: "count", hint: "used" }]);
    expect(renameVariable([t("von "), v("totl"), t(" belegt")], "totl", "total")).toEqual([t("von "), v("total"), t(" belegt")]);
    expect(renameVariable([t("a "), v("x"), t(" b")], "x")).toEqual([t("a  b")]);
  });
});

describe("per-language selectors", () => {
  const russian: MessageNested = { id: "m-ru", bundle_id: "files", locale: "ru", selectors: [], variants: [{ id: "ru-1", message_id: "m-ru", matches: [], pattern: [v("count"), t(" файлов выбрано")] }] };
  const files: BundleNested = { id: "files", declarations: [{ type: "input-variable", name: "count" }], messages: [russian] };

  it("splits one language by number, adding the plural declaration once", () => {
    expect(numberInputs(russian, files.declarations)).toEqual(["count"]);
    const split = splitMessage(files, russian, { plural: "count" });
    expect(split.declarations?.at(-1)).toMatchObject({ type: "local-variable", name: "countPlural" });
    expect(split.variants.map(variant => variant.matches.map(match => match.type === "literal-match" ? match.value : "*").join())).toEqual(["one", "few", "many", "*"]);
    expect(split.variants.every(variant => JSON.stringify(variant.pattern) === JSON.stringify(russian.variants[0]!.pattern))).toBe(true);
    const splitBundle = { ...files, declarations: split.declarations!, messages: [{ ...russian, selectors: split.selectors, variants: split.variants }] };
    const joined = joinMessage(splitBundle, splitBundle.messages[0]!);
    expect(joined.selectors).toEqual([]);
    expect(joined.variants).toHaveLength(1);
    // The declaration the split added goes again, so split + join is no change.
    expect(joined.declarations).toEqual(files.declarations);
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
    expect(untranslatedWords(seeded, [v("count"), t(" Einladungen sent to")])).toEqual(["sent"]);
  });
});

// The forms come from the inlang SDK's selector rules (requiredVariants), the same as its missing-variant check.
describe("forms from the inlang SDK", () => {
  const keys = (variants: { matches: MessageNested["variants"][number]["matches"] }[]) => variants.map(variant => variant.matches.map(match => match.type === "literal-match" ? match.value : "*").join());
  it("treats an ICU exact number and the plural of the same input as one choice", () => {
    // `{count, plural, =0 {…} one {…} other {…}}`: an exact-number selector on count next to countPlural.
    const en: MessageNested = { id: "m-en", bundle_id: "files", locale: "en", selectors: [{ type: "variable-reference", name: "count" }, { type: "variable-reference", name: "countPlural" }], variants: [
      { id: "en-0", message_id: "m-en", matches: [{ type: "literal-match", key: "count", value: "0" }, { type: "catchall-match", key: "countPlural" }], pattern: [t("No files")] },
      { id: "en-one", message_id: "m-en", matches: [{ type: "catchall-match", key: "count" }, { type: "literal-match", key: "countPlural", value: "one" }], pattern: [t("One file")] },
      { id: "en-other", message_id: "m-en", matches: [{ type: "catchall-match", key: "count" }, { type: "catchall-match", key: "countPlural" }], pattern: [v("count"), t(" files")] },
    ] };
    const files: BundleNested = { id: "files", declarations, messages: [en] };
    const shape = messageFromSource(files, en, "ru", "m-ru", true);
    // 0, Russian's categories and the catch-all; never "0 × one".
    expect(keys(shape.variants)).toEqual(["0,*", "*,one", "*,few", "*,many", "*,*"]);
    expect(shape.variants[0]!.pattern).toEqual([t("No files")]);
    expect(shape.variants[2]!.pattern).toEqual(en.variants[2]!.pattern);
    // Japanese has no plural categories but keeps the exact number: 0 and the catch-all, copied from their English forms.
    const japanese = messageFromSource(files, en, "ja", "m-ja", true);
    expect(japanese.selectors).toEqual(en.selectors);
    expect(keys(japanese.variants)).toEqual(["0,*", "*,*"]);
    expect(japanese.variants.map(variant => variant.pattern)).toEqual([en.variants[0]!.pattern, en.variants[2]!.pattern]);
  });

  it("needs the source's select values, and splits by the values other languages use", () => {
    const gender = [{ type: "variable-reference" as const, name: "gender" }];
    const en: MessageNested = { id: "m-en", bundle_id: "invite", locale: "en", selectors: gender, variants: [
      { id: "en-f", message_id: "m-en", matches: [{ type: "literal-match", key: "gender", value: "female" }], pattern: [t("her team")] },
      { id: "en-m", message_id: "m-en", matches: [{ type: "literal-match", key: "gender", value: "male" }], pattern: [t("his team")] },
      { id: "en-x", message_id: "m-en", matches: [{ type: "catchall-match", key: "gender" }], pattern: [t("their team")] },
    ] };
    const de: MessageNested = { id: "m-de", bundle_id: "invite", locale: "de", selectors: [], variants: [{ id: "de-1", message_id: "m-de", matches: [], pattern: [t("ihr Team")] }] };
    const invite: BundleNested = { id: "invite", declarations: [{ type: "input-variable", name: "gender" }], messages: [en, de] };
    expect(keys(messageFromSource(invite, en, "ja", "m-ja", false).variants)).toEqual(["female", "male", "*"]);
    const split = splitMessage(invite, de, { selector: "gender" });
    expect(keys(split.variants)).toEqual(["female", "male", "*"]);
    expect(split.declarations).toBeUndefined();
  });
});

describe("unsupportedExactNumber", () => {
  // i18next imports `count_zero` as an exact 0 on the `count` input next to `countPlural`
  const message: MessageNested = { ...english, selectors: [{ type: "variable-reference", name: "count" }, { type: "variable-reference", name: "countPlural" }],
    variants: english.variants.map(variant => ({ ...variant, matches: [{ type: "catchall-match", key: "count" }, ...variant.matches] })) };
  const i18next: BundleNested = { ...bundle, messages: [message] };
  const exact = (value: string) => ({ id: `en-${value}`, message_id: message.id, matches: [{ type: "literal-match" as const, key: "count", value }, { type: "catchall-match" as const, key: "countPlural" }], pattern: [t("x")] });
  it("allows 0 and plural categories, not other exact numbers", () => {
    expect(unsupportedExactNumber(i18next, exact("0"))).toBeUndefined();
    expect(unsupportedExactNumber(i18next, message.variants[0]!)).toBeUndefined();
    expect(unsupportedExactNumber(i18next, exact("1"))).toBe("1");
    // also a number on the plural selector itself
    expect(unsupportedExactNumber(bundle, { ...english.variants[0]!, id: "en-5", matches: [{ type: "literal-match", key: "countPlural", value: "5" }] })).toBe("5");
  });
});
