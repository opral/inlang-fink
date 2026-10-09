import type { CheckDiagnostic } from "@inlang/sdk/browser";

// What a translator still has to do, as reported by the inlang SDK's checkProject. Fink groups the
// diagnostics into the To do filters; the cards show them next to the affected form.
export type Issue = Exclude<CheckDiagnostic, { checkId: "unused-message" }>;
export type IssueKind = "missing-translation" | "missing-form" | "empty-form" | "placeholder";
export const issueKind = (issue: Issue): IssueKind =>
  issue.checkId === "missing-translation" || issue.checkId === "empty-translation" ? "missing-translation"
  : issue.checkId === "missing-variant" ? "missing-form"
  // One form without text while the others have some: exports would contain e.g. `=0 {}`.
  : issue.checkId === "empty-variant" ? "empty-form"
  : "placeholder";
export const isMissing = (issue: Issue) => issue.checkId === "missing-translation" || issue.checkId === "empty-translation";
