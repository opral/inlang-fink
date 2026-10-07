import { expect, test } from "vitest";
import { searchTerms, searchText } from "../src/search";
import type { BundleNested } from "@inlang/sdk/browser";
const bundle = { id: "access_granted", declarations: [], messages: [{ id: "m", bundleId: "access_granted", locale: "de", selectors: [], variants: [{ id: "v", messageId: "m", matches: [], pattern: [{ type: "text", value: "Diese API unterstützt " }, { type: "expression", arg: { type: "variable-reference", name: "count" } }] }] }] } as unknown as BundleNested;
test("search matches every term against ids, message text and variables, not JSON keys", () => {
  const text = searchText(bundle);
  const matches = (query: string) => searchTerms(query).every(term => text.includes(term));
  expect(matches("diese api")).toBe(true);
  expect(matches("API   diese")).toBe(true);
  expect(matches("access_granted count")).toBe(true);
  expect(matches("diese tickets")).toBe(false);
  expect(matches("variable-reference")).toBe(false);
  expect(matches("locale")).toBe(false);
});
