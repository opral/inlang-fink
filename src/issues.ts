import { messageIssues as check, type MessageIssue } from "@inlang/editor-component";
import type { BundleNested } from "@inlang/sdk/browser";

// What a translator still has to do for one message in one language (shared editor helpers).
export type Issue = MessageIssue;
export type IssueKind = "missing-translation" | "missing-form" | "placeholder";
export const issueKind = (issue: Issue): IssueKind => issue.type === "missing-translation" || issue.type === "missing-form" ? issue.type : "placeholder";

/** Issues for `locale` compared with the reference locale. */
export function messageIssues(bundle: BundleNested, locale: string, referenceLocale: string): Issue[] {
  const target = bundle.messages.find(message => message.locale === locale);
  const reference = bundle.messages.find(message => message.locale === referenceLocale);
  return check({
    reference: reference && { message: reference, variants: reference.variants },
    target: target && { message: target, variants: target.variants },
    declarations: bundle.declarations,
    locale,
  });
}
