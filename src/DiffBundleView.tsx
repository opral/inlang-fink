// Restores the rich two-column prototype from opral/inlang/packages/fink.
// SDK v3 uses persisted semantic baselines instead of the prototype's old change tables.
import { useMemo } from "react";
import SlDetails from "@shoelace-style/shoelace/dist/react/details/index.js";
import type { BundleNested, ProjectSettings } from "@inlang/sdk/browser";
import SingleDiffBundle from "./SingleDiffBundle";
import "./richDiff.css";

export function baselineBundle(id: string, signature?: string, current?: BundleNested): BundleNested | undefined {
  if (signature === undefined) return;
  const value = JSON.parse(signature) as BundleNested;
  // Baselines sort semantic content for comparison. Restore the editor's visual
  // ordering so identical locales and plural conditions line up across sides.
  const order = current?.messages.map(message => message.locale) ?? [];
  value.messages.sort((a, b) => {
    const left = order.indexOf(a.locale), right = order.indexOf(b.locale);
    return (left < 0 ? order.length : left) - (right < 0 ? order.length : right);
  });
  for (const message of value.messages) {
    const variants = current?.messages.find(value => value.locale === message.locale)?.variants ?? [];
    const rank = (matches: unknown) => {
      const index = variants.findIndex(value => JSON.stringify(value.matches) === JSON.stringify(matches));
      return index < 0 ? variants.length : index;
    };
    message.variants.sort((a, b) => rank(a.matches) - rank(b.matches));
  }
  return { ...value, id, messages: value.messages.map((message, index) => {
    const messageId = `baseline-message-${index}`;
    return { ...message, id: messageId, bundle_id: id, variants: message.variants.map((variant, index) => ({ ...variant, id: `${messageId}-variant-${index}`, message_id: messageId })) };
  }) };
}

export function RichDiff({ baseline, bundles, bundleIds, settings }: { baseline: Record<string, string>; bundles: BundleNested[]; bundleIds: string[]; settings: ProjectSettings }) {
  const pairs = useMemo(() => {
    const current = new Map(bundles.map(bundle => [bundle.id, bundle]));
    return bundleIds.map(id => ({ id, before: baselineBundle(id, baseline[id], current.get(id)), after: current.get(id) }));
  }, [baseline, bundles, bundleIds]);
  return <div className="rich-diff">{pairs.map(pair => <DiffBundleView key={pair.id} {...pair} settings={settings} />)}</div>;
}

export default function DiffBundleView({ id, before, after, settings }: { id: string; before?: BundleNested; after?: BundleNested; settings: ProjectSettings }) {
  const changes: string[] = [];
  if (!before || !after) changes.push(before ? "Delete bundle" : "Add bundle");
  else if (JSON.stringify(before.declarations) !== JSON.stringify(after.declarations)) changes.push("Update variables");
  for (const locale of new Set([...(before?.messages ?? []).map(m => m.locale), ...(after?.messages ?? []).map(m => m.locale)])) {
    const oldMessage = before?.messages.find(m => m.locale === locale), message = after?.messages.find(m => m.locale === locale);
    if (!oldMessage || !message) changes.push(`${message ? "Add" : "Delete"} translation · ${locale}`);
    else {
      if (JSON.stringify(oldMessage.selectors) !== JSON.stringify(message.selectors)) changes.push(`Update selectors · ${locale}`);
      const oldVariants = oldMessage.variants.map(v => JSON.stringify({ matches: v.matches, pattern: v.pattern })).sort();
      const variants = message.variants.map(v => JSON.stringify({ matches: v.matches, pattern: v.pattern })).sort();
      if (JSON.stringify(oldVariants) !== JSON.stringify(variants)) changes.push(`Update variants · ${locale}`);
    }
  }
  return <section className="rich-diff-bundle" data-diff-message={id}>
    <header className="rich-diff-heading"><h3>{id}</h3><SlDetails summary={`${changes.length} ${changes.length === 1 ? "change" : "changes"}`}><ul>{changes.map(change => <li key={change}>{change}</li>)}</ul></SlDetails></header>
    <div className="rich-diff-columns">
      <div className="rich-diff-side" data-diff-side="before"><h4>Before</h4><SingleDiffBundle bundle={before} other={after} settings={settings} side="before" /></div>
      <div className="rich-diff-side" data-diff-side="after"><h4>After</h4><SingleDiffBundle bundle={after} other={before} settings={settings} side="after" /></div>
    </div>
  </section>;
}
