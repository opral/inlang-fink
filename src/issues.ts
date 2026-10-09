import type { CheckDiagnostic } from "@inlang/sdk/browser";

// What a translator still has to do, as reported by the inlang SDK's checkProject. Fink groups the
// diagnostics into the To do filters; the cards show them next to the affected form.
export type Issue = Exclude<CheckDiagnostic, { checkId: "unused-message" }>;
export type IssueKind = "missing-translation" | "missing-form" | "empty-form" | "placeholder";
/**
 * The SDK's missing-selector (opral/inlang#4438): the reference chooses by an input (`name`, through
 * its `selector`) that this translation has no selector for. Typed here so it also works with an
 * SDK that doesn't report it yet.
 */
export type MissingSelector = { checkId: "missing-selector"; locale?: string; messageId: string; name: string; selector: string; values?: string[] };
/** The reference's exact numbers (ICU =0) this translation has no exact-number selector for, if that's what's missing. */
export const missingNumbers = (issue: MissingSelector) => issue.values?.length && issue.values.every(value => /^-?\d+(\.\d+)?$/.test(value)) ? issue.values : undefined;
export const missingSelector = (issue: { checkId: string }): MissingSelector | undefined => issue.checkId === "missing-selector" ? issue as unknown as MissingSelector : undefined;
export const issueKind = (issue: Issue): IssueKind =>
  issue.checkId === "missing-translation" || issue.checkId === "empty-translation" ? "missing-translation"
  : issue.checkId === "missing-variant" || missingSelector(issue) ? "missing-form"
  // One form without text while the others have some: exports would contain e.g. `=0 {}`.
  : issue.checkId === "empty-variant" ? "empty-form"
  : "placeholder";
export const isMissing = (issue: Issue) => issue.checkId === "missing-translation" || issue.checkId === "empty-translation";
