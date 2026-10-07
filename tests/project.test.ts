import { describe, expect, it } from "vitest";
import type { BundleNested } from "@inlang/sdk/browser";
import { bundleSignature, bundleSignatures } from "../src/project";

const bundle: BundleNested = {
  id: "hello", declarations: [], messages: [
    { id: "message-a", bundleId: "hello", locale: "en", selectors: [], variants: [
      { id: "variant-a", messageId: "message-a", matches: [], pattern: [{ type: "text", value: "Hello" }] },
    ] },
    { id: "message-b", bundleId: "hello", locale: "de", selectors: [], variants: [
      { id: "variant-b", messageId: "message-b", matches: [], pattern: [{ type: "text", value: "Hallo" }] },
    ] },
  ],
};
describe("semantic draft baselines", () => {
  it("ignores regenerated IDs and message query order", () => {
    const imported = structuredClone(bundle);
    imported.messages.reverse();
    imported.messages.forEach(message => {
      message.id += "-reimported";
      message.variants.forEach(variant => { variant.id += "-reimported"; variant.messageId = message.id; });
    });
    expect(bundleSignature(imported)).toBe(bundleSignature(bundle));
  });
  it("detects changed translations and returns to baseline after a revert", () => {
    const baseline = bundleSignatures([bundle]);
    const edited = structuredClone(bundle);
    edited.messages[0]!.variants[0]!.pattern = [{ type: "text", value: "Changed" }];
    expect(bundleSignature(edited)).not.toBe(baseline.hello);
    edited.messages[0]!.variants[0]!.pattern = [{ type: "text", value: "Hello" }];
    expect(bundleSignature(edited)).toBe(baseline.hello);
    edited.messages.pop();
    expect(bundleSignature(edited)).not.toBe(baseline.hello);
  });
});
