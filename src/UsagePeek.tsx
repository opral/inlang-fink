import { useLayoutEffect, useRef, useState } from "react";
import type { Usage } from "./usage";

// Messages collapsed in this session stay collapsed while paging through the catalog.
const collapsedBundles = new Set<string>();
const Arrow = ({ d }: { d: string }) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;

/** A short peek at where a message is used in the app's code, shown above its translations. */
export function UsagePeek({ bundleId, usages, unused, codeUrl, scope }: { bundleId: string; usages?: Usage[]; unused: boolean; codeUrl: string; scope: string }) {
  const key = `${codeUrl}#${bundleId}`;
  const [collapsed, setCollapsed] = useState(() => collapsedBundles.has(key));
  const [index, setIndex] = useState(0);
  const code = useRef<HTMLPreElement>(null);
  // Long lines scroll sideways; keep the highlighted call in view.
  useLayoutEffect(() => {
    const pre = code.current, mark = pre?.querySelector("mark");
    if (pre && mark) pre.scrollLeft = Math.max(0, mark.offsetLeft - pre.clientWidth / 3);
  }, [index, collapsed, usages]);
  if (unused) return <div slot="message" className="usage-peek unused" role="note" aria-label={`Usage of ${bundleId} in code`}>
    <span className="usage-role unused">Not used in code</span>
    <span className="usage-note">No reference in the app's code at this commit. Check with a developer before deleting it.</span>
  </div>;
  if (!usages?.length) return null;
  const current = Math.min(index, usages.length - 1), usage = usages[current]!;
  const toggle = () => { const next = !collapsed; if (next) collapsedBundles.add(key); else collapsedBundles.delete(key); setCollapsed(next); };
  const shown = scope && usage.path.startsWith(`${scope}/`) ? usage.path.slice(scope.length + 1) : usage.path;
  const slash = shown.lastIndexOf("/"), page = (step: number) => setIndex((current + step + usages.length) % usages.length);
  return <div slot="message" className={collapsed ? "usage-peek collapsed" : "usage-peek"} role="group" aria-label={`Usage of ${bundleId} in code`}>
    <div className="usage-bar">
      {usage.role && <span className="usage-role">{usage.role}</span>}
      <a className="usage-path" href={`${codeUrl}/${encodeURI(usage.path).replace(/[#?]/g, encodeURIComponent)}#L${usage.line}`} target="_blank" rel="noreferrer" aria-label={`${usage.path}, line ${usage.line}, open on GitHub (new tab)`}>{slash >= 0 && <span className="dir">{shown.slice(0, slash + 1)}</span>}<span className="file">{shown.slice(slash + 1)}:{usage.line}</span></a>
      <span className="usage-actions">
        {usages.length > 1 && (collapsed ? <span className="usage-count">{usages.length} usages</span> : <span className="usage-pager" role="group" aria-label="Usages">
          <span aria-live="polite">{current + 1} of {usages.length}</span>
          <button aria-label="Previous usage" onClick={() => page(-1)}><Arrow d="m15 18-6-6 6-6" /></button>
          <button aria-label="Next usage" onClick={() => page(1)}><Arrow d="m9 18 6-6-6-6" /></button>
        </span>)}
        <button className="usage-collapse" aria-expanded={!collapsed} aria-label="Usage in code" title={collapsed ? "Show usage in code" : "Hide usage in code"} onClick={toggle}><Arrow d={collapsed ? "m6 9 6 6 6-6" : "m18 15-6-6-6 6"} /></button>
      </span>
    </div>
    {!collapsed && <pre className="usage-code" ref={code} tabIndex={0} aria-label={`Code in ${usage.path}, line ${usage.line}`}><code>{usage.snippet.lines.map((text, offset) => {
      const line = usage.snippet.start + offset;
      return line === usage.line
        ? <span key={line} className="hit"><span className="ln" aria-hidden="true">{line}</span>{text.slice(0, usage.from)}<mark>{text.slice(usage.from, usage.to)}</mark>{text.slice(usage.to)}</span>
        : <span key={line}><span className="ln" aria-hidden="true">{line}</span>{text || " "}</span>;
    })}</code></pre>}
  </div>;
}
