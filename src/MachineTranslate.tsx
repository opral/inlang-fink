import { Modal } from "./Modal";
import { languageName } from "./languages";
import { capture } from "./telemetry";

/** What the translator asked to machine translate; the dialog turns it into an email. */
export type MachineTranslationRequest = { source: string; targets: string[]; count: number; message?: string };

export const SparkleIcon = () => <svg className="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></svg>;

/** The form where translators ask for machine translation; requests tell us who wants it. */
export const MT_FORM = "https://docs.google.com/forms/d/e/1FAIpQLSdwui1r1rFu1AXMPKa-g2ggDHOTvNFrmrxWDubaaYLHv8_4Mg/viewform";

/** Machine translation is activated on request for now: the dialog explains it and links to the request form. */
export function MachineTranslateDialog({ repository, request, onClose }: { repository: string; request: MachineTranslationRequest; onClose: () => void }) {
  const languages = `${languageName(request.source)} → ${request.targets.map(languageName).join(", ")}`;
  return <Modal label="Machine translation" className="mt-dialog" onClose={onClose}>
    <header><h2><SparkleIcon /> Machine translation</h2><button type="button" className="dialog-close" aria-label="Close" onClick={onClose}>×</button></header>
    <p>Machine translation fills in missing translations for {languages}, keeps placeholders like <code>{"{count}"}</code> in place, and leaves every suggestion for you to review before it's committed.</p>
    <p>We're turning it on project by project. Request access and we'll activate it for <strong>{repository}</strong>.</p>
    <div className="mt-actions">
      <button type="button" onClick={onClose}>Not now</button>
      <a className="button primary" href={MT_FORM} target="_blank" rel="noreferrer" onClick={() => { capture("cloud:interest_button_click", { topic: "machine_translation", step: "form" }); onClose(); }}>Request access</a>
    </div>
  </Modal>;
}
