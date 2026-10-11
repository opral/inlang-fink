---
title: Plurals, selects and exact numbers
seoTitle: Plurals, selects and exact numbers (i18next and Paraglide JS)
description: How Fink handles plural forms (one, few, many, other), selects such as gender, and forms for exact numbers like 0, per language.
order: 6
---

Some messages need several **forms**: "1 ticket" and "5 tickets", or a different text for each gender. Fink shows them as forms inside one message, per language, for i18next plural keys (`_one`, `_other`, `_zero`) and Paraglide JS plural and select messages alike.

## Plurals

Each language has its own plural categories. English uses `one` and `other`. Polish adds `few` and `many`. Arabic uses all six: `zero`, `one`, `two`, `few`, `many`, `other`. Japanese has none.

- When the reference splits a message by a number such as `{count}` and your language doesn't yet, the card shows **Not split by {count}** with a **Split by {count}** button. Fink adds the forms your language needs.
- **+ Add … form** adds a missing category. **Remove** deletes an optional one.
- Each form lists example numbers, for example Polish `few` with 2–4, 22…. **Preview** lets you try values and shows which form is used.
- **Use one text again** merges the forms back into one text, for example for a language that doesn't need them.
- Languages without plurals get a single text.

## Exact numbers

A form for an exact number takes priority over the plural category. A typical use is "No tickets" for 0.

- If the reference has a form for 0 and your language doesn't choose by exact numbers yet, the card shows **No form for 0**. Add the form in **Edit structure…** (split the message by `{count}` first if it is one text).
- If your language already has exact-number forms but one is missing, the card shows **1 form missing** with **+ Add a form for 0**.
- **i18next** supports only exactly 0 (`key_zero`). Other exact numbers can't be saved in i18next projects.
- **inlang message format** (Paraglide JS) supports any exact number.

## Selects

A select chooses a form by a text input, for example `{gender}` with the forms `female`, `male` and `*` (anything else).

- The ··· menu offers **Split … by {variable}** for inputs the other languages already use.
- The **Edit structure…** dialog adds and removes selectors and forms for the languages you are working in.
- `*` is the fallback form and matches any value. It is different from the plural category `other`.

## Checks

Missing forms and empty forms appear under **To do → Missing forms** and **Empty forms**. See [Checks](/docs/checks).
