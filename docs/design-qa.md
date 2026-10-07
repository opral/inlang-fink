# Editor design and performance QA

The language dropdown, editor update path, and changes review were audited independently, then checked together in the production browser bundle.

## Findings and fixes

- The custom checkbox popup did not match the v2 controls. Restored the v2 Shoelace multi-select, with a compact trigger, attached positioning, bounded scrolling, reference-language badge, keyboard navigation, Escape, clear selection, and outside-click dismissal.
- Every edit previously read the entire nested catalog, recreated all visible Lit editor properties, and scheduled a full plugin export to count changed files. Edits now reread one affected bundle, preserve the other editor objects and properties, and compare semantic baseline signatures in memory. Full resource exports run when reviewing or pushing changes.
- Review previously displayed complete JSON files. The prototype-inspired diff now shows only changed message keys, side-by-side before/after values, red/green word highlights, variable chips, and changed plural conditions. Additions and deletions are explicit. i18next plural suffixes remain individual resource keys.

The counter represents changed bundles. The push button separately reports the number of changed files. Reverting a bundle to its baseline clears its pending change.

## Storage and measurements

Lix's OPFS adapter already runs its resident engine and SQLite connection in a dedicated browser worker. OPFS provides persistence; repeatedly selecting or exporting the entire catalog was application overhead. The fix retains durable OPFS writes.

Measured in production Chromium with real Lix/OPFS and a synthetic Pocket ID-sized catalog: **669 bundles, 27 languages, 18,063 messages**.

| Operation | Median |
| --- | ---: |
| Read the complete nested catalog | 568 ms |
| Read one edited bundle | 26 ms |
| Export the complete catalog | 3,089 ms |
| Initial local import | 12 seconds |

These are operation measurements on the test machine, excluding network requests and UI rendering. The scoped read is approximately 22 times faster than the full read; removing recurring exports eliminates the larger repeated cost. First-time engine loading and import remain substantial. Resource downloads now use four concurrent requests and loading reports its current stage.

Semantic baselines persist with the project. Existing drafts missing this metadata reconstruct it once in a separate temporary memory engine from their saved canonical resources. Their edited OPFS database remains intact.

## Verification

- Production bundle: plain edits, plural creation, OPFS reload, semantic changed counters and reverts, unchanged editor properties, download, before/after review, and pushing only edited files.
- Legacy draft upgrade with actual production SDK/OPFS: plain and plural edits preserved, baselines recovered exactly, revert cleared changes, and subsequent reopen reused stored signatures.
- Realistic 27-language dropdown: last option can be scrolled into view and selected; keyboard, Escape, outside click, and clear selection checked.
- Desktop and 390-pixel mobile: attached dropdown, readable diff, stacked mobile before/after columns, and no horizontal overflow.
- Diff units cover changed text, nested i18next keys, variables/selectors, plural conditions, additions/deletions, formatting equivalence, and bounded word comparison.
