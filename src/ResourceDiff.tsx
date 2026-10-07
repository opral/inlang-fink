import { useMemo } from "react";
import { diffResources, diffText, type TextPart } from "./resourceDiff";
import "./resourceDiff.css";

function Variables({ text }: { text: string }) {
  return <>{text.split(/(\{\{[^{}]+\}\}|\{[^{}]+\})/g).map((part, index) => /^\{/.test(part) ? <mark key={index} className="diff-variable">{part}</mark> : part)}</>;
}
function Pattern({ value, side, parts }: { value?: string; side: "before" | "after"; parts: TextPart[] }) {
  return <div className={`diff-value diff-${side}`}>
    <span className="diff-side-label">{side === "before" ? "Before" : "After"}</span>
    {value === undefined ? <span className="diff-absent">{side === "before" ? "Not present" : "Removed"}</span> : <pre>{parts.map((part, index) => !part.changed ? <Variables key={index} text={part.text} /> : side === "before" ? <del key={index}><Variables text={part.text} /></del> : <ins key={index}><Variables text={part.text} /></ins>)}</pre>}
  </div>;
}

/** Read-only before/after review, following Fink's former DiffBundleView. */
export function ResourceDiff({ before, after }: { before: Record<string, string>; after: Record<string, string> }) {
  const files = useMemo(() => diffResources(before, after), [before, after]);
  return <div className="resource-diff">{files.map(file => <section className="diff-file" key={file.path} aria-label={`Changes in ${file.path}`}>
    <header className="diff-file-heading"><h3>{file.path}</h3><span>{file.messages.length} {file.messages.length === 1 ? "message" : "messages"} changed</span></header>
    {file.error ? <p role="alert">{file.error}</p> : !file.messages.length ? <p className="diff-no-message">Formatting only; no message changes.</p> : file.messages.map(message => <article className={`diff-message diff-message-${message.kind}`} key={message.id} data-diff-message={message.id}>
      <header className="diff-message-heading"><h4>{message.id}</h4><span className={`diff-kind diff-kind-${message.kind}`}>{message.kind}</span></header>
      {message.fields.map(field => {
        const parts = diffText(field.before, field.after);
        return <div className="diff-field" key={field.label}><div className="diff-field-label">{field.label}</div><div className="diff-columns"><Pattern value={field.before} side="before" parts={parts.before} /><Pattern value={field.after} side="after" parts={parts.after} /></div></div>;
      })}
    </article>)}
  </section>)}</div>;
}
