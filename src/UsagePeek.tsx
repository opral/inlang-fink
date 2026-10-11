import React, { useLayoutEffect, useRef, useState } from "react";
import type { Usage, UsageState } from "./usage";
import { highlight, splitAt } from "./highlight";
import { Dropdown } from "./Menu";

/** A file's line on GitHub; `#` and `?` in paths are escaped. */
const fileUrl = (codeUrl: string, path: string, line?: number) => `${codeUrl}/${encodeURI(path).replace(/[#?]/g, encodeURIComponent)}${line ? `#L${line}` : ""}`;
const relative = (path: string, scope: string) => scope && path.startsWith(`${scope}/`) ? path.slice(scope.length + 1) : path;

const Arrow = ({ d }: { d: string }) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;

/** The code that uses a message: the call with one line of context, the file on GitHub, and a pager. */
export function UsageCode({ usages, codeUrl, scope }: { usages: Usage[]; codeUrl: string; scope: string }) {
  const [index, setIndex] = useState(0);
  const code = useRef<HTMLPreElement>(null);
  const current = Math.min(index, usages.length - 1), usage = usages[current]!;
  // Long lines scroll sideways; keep the highlighted call in view.
  useLayoutEffect(() => {
    const pre = code.current, mark = pre?.querySelector("mark");
    if (pre && mark) pre.scrollLeft = Math.max(0, mark.offsetLeft - pre.clientWidth / 3);
  }, [current, usages]);
  const shown = relative(usage.path, scope);
  const page = (step: number) => setIndex((current + step + usages.length) % usages.length);
  return <div className="usage-code-block">
    <pre className="usage-code" ref={code} tabIndex={0} aria-label={`Code in ${usage.path}, line ${usage.line}`} style={{ "--ln-width": `${String(usage.snippet.start + usage.snippet.lines.length - 1).length}ch` } as React.CSSProperties}><code>{usage.snippet.lines.map((text, offset) => {
      const line = usage.snippet.start + offset, hit = line === usage.line;
      const parts = splitAt(highlight(text), hit ? usage.from : -1, hit ? usage.to : -1);
      // The call itself is one mark; the rest of the line keeps its highlighting.
      const markedText = parts.filter(part => part.marked).map(part => part.token.text).join("");
      let marked = false;
      return <span key={line} className={hit ? "hit" : undefined}><span className="ln" aria-hidden="true">{line}</span>{text ? parts.map((part, index) => {
        if (!part.marked) return <span key={index} className={part.token.kind && `tk-${part.token.kind}`}>{part.token.text}</span>;
        if (marked) return null;
        marked = true;
        return <mark key={index}>{markedText}</mark>;
      }) : " "}</span>;
    })}</code></pre>
    <div className="usage-code-foot">
      <a className="usage-path" href={fileUrl(codeUrl, usage.path, usage.line)} target="_blank" rel="noreferrer" aria-label={`${usage.path}, line ${usage.line}, open on GitHub (new tab)`}>{shown}:{usage.line}</a>
      {usages.length > 1 && <span className="usage-pager" role="group" aria-label="Usages">
        <span aria-live="polite">{current + 1} of {usages.length}</span>
        <button aria-label="Previous usage" onClick={() => page(-1)}><Arrow d="m15 18-6-6 6-6" /></button>
        <button aria-label="Next usage" onClick={() => page(1)}><Arrow d="m9 18 6-6-6-6" /></button>
      </span>}
    </div>
  </div>;
}

const SHOWN_ISSUES = 50;
/**
 * Usage in code, next to the save status: loading, failed, or why no message is labelled Not used
 * in code (no analysis for the format, or calls the analysis couldn't resolve, each with its line on GitHub).
 */
export function UsageStatus({ status, codeUrl, scope }: { status: UsageState; codeUrl: string; scope: string }) {
  if (status.state === "idle") return null;
  if (status.state === "loading") return <span className="usage-status">Finding usage in code…</span>;
  if (status.state === "error") return <span className="usage-status failed" title={status.error}>Usage in code unavailable</span>;
  const unavailable = status.state === "unavailable", issues = status.state === "ready" ? status.issues : [];
  if (!unavailable && !issues.length) return null;
  const label = unavailable ? "Usage in code unavailable" : `Usage in code incomplete`;
  return <Dropdown className="usage-trigger" title={unavailable ? status.reason : "Why no message is labelled Not used in code"} align="end" panelClassName="usage-panel" label={<><span className="usage-dot" aria-hidden="true" />{label}</>}>{() => <>
    {unavailable ? <p className="usage-panel-text">{status.reason}</p> : <>
      <p className="usage-panel-text">Fink couldn't resolve every message call, so it labels no message <strong>Not used in code</strong>. The usages it found are shown on the messages.</p>
      <ul className="usage-issues" aria-label="Unresolved usage">{issues.slice(0, SHOWN_ISSUES).map((issue, index) => <li key={index}>
        <span>{issue.reason}</span>
        {issue.path && <a href={fileUrl(codeUrl, issue.path, issue.start?.line)} target="_blank" rel="noreferrer" aria-label={`${issue.path}${issue.start ? `, line ${issue.start.line}` : ""}, open on GitHub (new tab)`}>{relative(issue.path, scope)}{issue.start ? `:${issue.start.line}` : ""}</a>}
      </li>)}</ul>
      {issues.length > SHOWN_ISSUES && <p className="usage-panel-text">And {issues.length - SHOWN_ISSUES} more.</p>}
    </>}
    <p className="dropdown-note"><a href="/docs/unused-messages" target="_blank" rel="noreferrer">How Fink finds unused messages</a></p>
  </>}</Dropdown>;
}
