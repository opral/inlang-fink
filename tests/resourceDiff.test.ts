import { describe, expect, test } from "vitest";
import { diffResources, diffText } from "../src/resourceDiff";
const file = "messages/en.json";
const resources = (value: unknown) => ({ [file]: JSON.stringify(value) });

describe("semantic resource review", () => {
  test("reviews only changed keys, including additions and deletions, without formatting noise", () => {
    const result = diffResources(resources({ same: "Same", hello: "Hello", removed: "Gone", $schema: "old" }), resources({ $schema: "new", added: "New", hello: "Hello {name}", same: "Same" }));
    expect(result[0].messages).toEqual([
      { id: "added", kind: "added", fields: [{ label: "Translation", before: undefined, after: "New" }] },
      { id: "hello", kind: "modified", fields: [{ label: "Translation", before: "Hello", after: "Hello {name}" }] },
      { id: "removed", kind: "removed", fields: [{ label: "Translation", before: "Gone", after: undefined }] },
    ]);
  });
  test("shows changed plural variants and variable definitions without repeating unchanged variants", () => {
    const old = { items: [{ declarations: ["input count"], selectors: ["count"], match: { "count=one": "One", "count=*": "{count} items" } }] };
    const next = { items: [{ declarations: ["input count", "input name"], selectors: ["count"], match: { "count=*": "{count} items", "count=one": "One for {name}", "count=zero": "None" } }] };
    const fields = diffResources(resources(old), resources(next))[0].messages[0].fields;
    expect(fields.map(field => field.label)).toEqual(["Variables", "count=one", "count=zero"]);
    expect(fields[1]).toEqual({ label: "count=one", before: "One", after: "One for {name}" });
    expect(fields[2].before).toBeUndefined();
  });
  test("compares nested i18next keys and array messages, preserving dotted-key identity", () => {
    const old = { account: { name: "Name", items: ["one", "two"] }, "account.name": "Literal" };
    const next = { account: { items: ["one", "three"], name: "Account name" }, "account.name": "Literal" };
    expect(diffResources(resources(old), resources(next))[0].messages.map(message => message.id)).toEqual(["account.items", "account.name"]);
  });
  test("ignores reordered JSON and match maps and includes namespace filenames", () => {
    const old = { item: [{ selectors: ["count"], declarations: ["input count"], match: { "count=one": "One", "count=*": "Many" } }] };
    const next = { item: [{ match: { "count=*": "Many", "count=one": "One" }, declarations: ["input count"], selectors: ["count"] }] };
    expect(diffResources({ "locales/en/common.json": JSON.stringify(old) }, { "locales/en/common.json": JSON.stringify(next) })).toEqual([{ path: "locales/en/common.json", messages: [] }]);
  });
  test("new resources are additions and empty resources display deleted messages", () => {
    expect(diffResources({}, resources({ hello: "Hello" }))[0].messages[0].kind).toBe("added");
    expect(diffResources(resources({ hello: "Hello" }), resources({}))[0].messages[0].kind).toBe("removed");
  });
  test("flags invalid resources instead of silently hiding their changes", () => {
    expect(diffResources(resources({ hello: "Hello" }), { [file]: "not json" })[0].error).toBeTruthy();
  });
  test("highlights inserted and removed words while keeping unchanged text readable", () => {
    expect(diffText("Hello friend, welcome home", "Hello {name}, welcome back")).toEqual({
      before: [{ text: "Hello ", changed: false }, { text: "friend,", changed: true }, { text: " welcome ", changed: false }, { text: "home", changed: true }],
      after: [{ text: "Hello ", changed: false }, { text: "{name},", changed: true }, { text: " welcome ", changed: false }, { text: "back", changed: true }],
    });
    expect(diffText(undefined, "New message").after).toEqual([{ text: "New message", changed: true }]);
  });
  test("bounds word comparison work for exceptionally long translations", () => {
    const before = `${"same ".repeat(5000)}old`;
    const after = `${"same ".repeat(5000)}new`;
    const parts = diffText(before, after);
    expect(parts.before.at(-1)).toEqual({ text: "old", changed: true });
    expect(parts.after.at(-1)).toEqual({ text: "new", changed: true });
    expect(parts.before.map(part => part.text).join("")).toBe(before);
  });
});
