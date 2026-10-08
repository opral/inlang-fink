import { useState } from "react";
import { Modal } from "./Modal";
import { languageName } from "./languages";

export const MT_EMAIL = "hello@opral.com";
/** What the translator asked to machine translate; the dialog turns it into an email. */
export type MachineTranslationRequest = { source: string; targets: string[]; count: number; message?: string };

export const SparkleIcon = () => <svg className="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></svg>;

/** Machine translation is activated on request for now: ask the translator to email us, which tells us who wants it. */
export function MachineTranslateDialog({ repository, request, onClose }: { repository: string; request: MachineTranslationRequest; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const languages = `${languageName(request.source)} → ${request.targets.map(languageName).join(", ")}`;
  const subject = `Activate machine translation for ${repository}`;
  const body = [
    "Hi Opral team,",
    "",
    `I'd like to use machine translation in Fink for ${repository} (${languages}).`,
    request.message ? `I tried it on the message "${request.message}".` : `About ${request.count} ${request.count === 1 ? "message needs" : "messages need"} a translation.`,
    "",
    "Thanks!",
  ].join("\n");
  const href = `mailto:${MT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const copy = async () => { try { await navigator.clipboard.writeText(MT_EMAIL); setCopied(true); } catch { /* the address is shown anyway */ } };
  return <Modal label="Machine translation" className="mt-dialog" onClose={onClose}>
    <header><h2><SparkleIcon /> Machine translation</h2><button type="button" className="dialog-close" aria-label="Close" onClick={onClose}>×</button></header>
    <p>Machine translation fills in missing translations for {languages}, keeps placeholders like <code>{"{count}"}</code> in place, and leaves every suggestion for you to review before it's committed.</p>
    <p>We're turning it on project by project. Email us at <a href={href}>{MT_EMAIL}</a> and we'll activate it for <strong>{repository}</strong>.</p>
    <div className="mt-actions">
      <button type="button" onClick={() => void copy()}>{copied ? "Copied" : "Copy address"}</button>
      <a className="button primary" href={href} onClick={onClose}>Write email</a>
    </div>
  </Modal>;
}
