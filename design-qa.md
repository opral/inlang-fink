# Bundle description simplification

final result: passed

Scope: the shared description interaction and its Fink integration. Sherlock and Parrot compile with the same component and host token mappings; their native VS Code/Figma save and layout smoke tests remain release checks. This result does not certify those unavailable hosts.

## Latest pass: explicit source reference

The user selected the File reference image attached at `/var/folders/ll/x4vx8wns1qd3zbf3kgb2v9s40000gp/T/codex-clipboard-fcfb439e-ec32-473d-8277-e92e3ef114e1.png`. The selected state is checkout_submit with source expanded. The description stays readable and editable. A separate disclosure names `Used in src/Checkout.tsx:2`; the source block highlights the matching call.

Latest desktop evidence: `/Users/samuel/.codex/visualizations/2026/11/03/01a1a316-b64a-7233-9753-0153b4954029/design-evidence/source-reference-desktop.jpg`. The 1280×960 CSS viewport at density 1 was cropped to the actual card at x16/y557/1248×343. Source and implementation were opened in the same comparison input, comparing card content rather than the source image's surrounding whitespace. The actual app retains its compact existing type scale, locale layout and other-language footer. An Open on GitHub link preserves navigation without repeating the filename for a single usage.

Latest normal-width evidence: sibling `source-reference-live.jpg`, the actual 622×401 card at the 654px browser viewport. Narrow evidence: sibling `source-reference-narrow.jpg`, 360×900. Document width and scroll width both equal 360px. The source disclosure, wrapped code, highlighted call and translations remain visible.

All five fidelity surfaces were checked: existing Inter/monospace typography; one source row and a padded rounded code surface; existing neutral/syntax colors and a soft call highlight; the existing chevron asset; exact description, path, line and translation content. No actionable P0/P1/P2 mismatch remains in the scoped implementation. Product density and the retained other-language footer are intentional differences from the generated concept.

Browser checks: click and Enter toggle the disclosure, aria-expanded tracks its state, the controlled source region appears/disappears, the highlighted code and path/line metadata are readable, and the GitHub URL points to the captured revision. Description edits and translation data remain untouched (Changes 0). No browser console error entries were observed.

TypeScript and production build pass. Usage-related tests: 15 passed, one failed. The failing test (`tests/next-intl-usage.test.ts`, “i18next has no usage analysis”) expects unavailable analysis, while the linked current i18next plugin exports analyzeUsage and returns complete. That test imports none of the UI files changed in this pass. It remains an integration-test expectation to reconcile with published versus locally linked plugin versions; no unrelated source-analysis behavior was changed here.

AI scope: this pass improves browser-agent discovery and reading through semantic controls, a labeled source region and DOM source metadata. It does not add a structured agent API or automatically send code to translation providers.

## Earlier description exploration: visual truth and evidence

- Selected direction: first displayed exploration, Quiet inline, refined by the user's request to combine description and code and simplify the presentation.
- Revised visual: `/Users/samuel/.codex/generated_images/01a1a316-b64a-7233-9753-0153b4954029/exec-e08ea2b2-0ca9-4418-9102-f0ddb05ab2f9.png` (1487 × 1058 image pixels; requested 1440 × 1024 desktop design).
- Implementation: local demo at port 5174, sample repository demo/bundle-descriptions.
- Desktop screenshot: `/Users/samuel/.codex/visualizations/2026/11/03/01a1a316-b64a-7233-9753-0153b4954029/design-evidence/fink-simplified-descriptions-desktop.jpg` (1440 × 1024 CSS and image pixels, density 1).
- Narrow screenshot: sibling `fink-simplified-descriptions-narrow.jpg` (360 × 900 CSS and image pixels, density 1).
- Focused implementation: sibling `fink-simplified-live.jpg`, actual first bundle card at the normal 654px browser viewport; clip x16/y287/622×452.

The revised design image and desktop screenshot were opened together in the same comparison input. Compare the bundle header/context region, accounting for the generated reference's approximately 1.033 image scale. Existing shell, status-badge placement, translation layout, content and typography remain the real product's design. The generated mock's duplicate empty-description action is an image artifact: the user's explicit request requires one combined row, which takes precedence.

## Required surfaces

- Fonts/typography: existing Inter and monospace keys retained; context uses the existing 13px secondary text style. No separate Description heading or permanently visible input. Line breaks are preserved without template indentation leaking into displayed text.
- Spacing/layout: description and code action share the existing padded header. No new panel, tint, divider or container. Long text wraps. At 360px document width equals scroll width; guidance and code remain available.
- Colors/tokens: shared control uses the editor's `--inlang-*` text, surface, border and focus tokens. Fink maps its palette; Sherlock and Parrot retain VS Code/Figma mappings.
- Assets: no new raster assets or icons needed. Existing application assets retained.
- Copy/content: one maintained bundle description across languages. Empty state reads “Add description” beside code when available. Source snippets remain accessible through code.

## Interactions checked

- Browser: click guidance to edit, native typing, explicit Save, persisted after reload, Escape discards edits and restores focus, Cmd+Enter saves, code opens/closes source snippet. Sample description restored; Changes returns to zero.
- Browser console: no error entries in the current run.
- Shared component: 113 tests pass, including six guidance tests for safe plain text, source slot, explicit save versus blur, cancellation/focus, whitespace clearing, external updates, bundle switching and disabled reading. The focused six pass again after the final layout wrapper change.
- TypeScript: Fink, Sherlock extension/webview and Parrot checks pass.
- Builds: shared component and Fink/Sherlock/Parrot production UI builds pass with existing bundler warnings.

## Comparison history and findings

The initial component rendered a large native textarea and a separate section. The refinement replaces it with readable guidance in the key header and adds a source-action slot. During testing, preserved template indentation leaked into button text; using the button's textContent property fixed it, followed by passing tests and browser inspection.

No actionable P0/P1/P2 issue remains in the scoped Fink/shared-control change. Full-view composition and the focused header were readable in the comparison; the implementation intentionally follows real product density rather than generated shell drift.

## Implementation checklist

- [x] Shared readable/editable control with Save, Cancel/Escape, Clear and keyboard save.
- [x] Fink description and code combined in the existing header.
- [x] Sherlock header grouping and Parrot compact placement use the shared control.
- [x] Tests, type checks, builds and Fink browser smoke completed.
- [ ] Native VS Code and Figma host smoke before release.

## Follow-up polish

No additional decorative UI is proposed. The coordinated package publication and product dependency updates documented in the bundle-descriptions RFC remain necessary before shipping.
