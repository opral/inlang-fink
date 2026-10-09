# Selector match guidance

The shared component change is in [inlang PR #4433](https://github.com/opral/inlang/pull/4433). Fink consumes the same sources and compiled modules through the pinned `@inlang/editor-component@12.0.0` pnpm patch. Replace the patch with the published package version once released; no production package publish is part of this change.

Selector headers identify their resolver type. The match menu derives options from declaration annotations and aliases, not variable names. Known `plural` resolvers use the message locale, cardinal/ordinal type, and literal digit options to offer categories with number examples. `*` is explicitly a fallback, distinct from `other`. Unsupported locales, unknown options, and runtime-dependent options remain open rather than assuming English rules. Text and other resolver outputs allow custom literals and suggest existing values.

Known plural categories are validated before emitting a save; invalid input remains visible with an error. The add-selector dialog uses the same category derivation and excludes variables already selected. Existing drafts are preserved, including selectors duplicated before this fix. Read-only rich diffs hide the new menu controls.

Validation: seven shared rule tests, changed component typechecking against SDK 3.1.0, and four production Chromium tests covering menus, English/Arabic examples, validation, custom literal persistence, duplicate prevention, OPFS reload, editing, rich review, and changed-file push. The full shared monorepo CI command was attempted but Nx is not installed in this workspace.
