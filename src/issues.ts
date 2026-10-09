import type { CheckDiagnostic } from "@inlang/sdk/browser";

// What a translator still has to do, as reported by the inlang SDK's checkProject. Fink groups the
// diagnostics into the To do filters; the cards show them next to the affected form.
export type Issue = Exclude<CheckDiagnostic, { checkId: "unused-message" }>;
export type IssueKind = "missing-translation" | "missing-form" | "empty-form" | "placeholder";
/**
 * The SDK's missing-selector: the reference chooses by an input (`name`, through its `selector`)
 * that this translation has no selector for; `values` are the select values or exact numbers it
 * can't express (empty for a plural).
 */
export type MissingSelector = Extract<Issue, { checkId: "missing-selector" }>;
/** The reference's exact numbers (ICU =0) this translation has no exact-number selector for, if that's what's missing. */
export const missingNumbers = (issue: MissingSelector) => issue.values.length && issue.values.every(value => /^-?\d+(\.\d+)?$/.test(value)) ? issue.values : undefined;
export const missingSelector = (issue: Issue): MissingSelector | undefined => issue.checkId === "missing-selector" ? issue : undefined;
export const issueKind = (issue: Issue): IssueKind =>
  issue.checkId === "missing-translation" || issue.checkId === "empty-translation" ? "missing-translation"
  : issue.checkId === "missing-variant" || missingSelector(issue) ? "missing-form"
  // One form without text while the others have some: exports would contain e.g. `=0 {}`.
  : issue.checkId === "empty-variant" ? "empty-form"
  : "placeholder";
export const isMissing = (issue: Issue) => issue.checkId === "missing-translation" || issue.checkId === "empty-translation";
