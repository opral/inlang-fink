---
title: Checks
seoTitle: Translation checks: missing translations, variables, plurals
description: Every problem Fink reports, what it means and how to fix it: missing translations, missing or unknown variables, missing plural forms, unused messages.
order: 7
---

Fink checks every message with the inlang SDK's checks, comparing each translation with the language you translate from. Problems appear as a label on the card and under the **To do** filter. They are warnings: you can push with open problems.

| Card label | Check | What it means | How to fix it |
|---|---|---|---|
| **Missing** / **Missing in German, French** | `missing-translation`, `empty-translation` | The language has no translation, or only empty text. Your app shows its fallback. | Choose **Translate to …** or **Start from …** and write the translation, or type into the empty text. |
| **Missing {count} in German** | `missing-variable` | The reference uses the variable `{count}`, the German text doesn't. Users would not see the number. | Choose **Insert {count}**, or type `{` where it belongs and pick `{count}`. |
| **Unexpected {cnt} in German** | `unknown-variable` | The German text uses a variable the reference doesn't have, often a typo. At runtime it would stay empty or appear literally. | Choose **Replace** to use the suggested variable, or **Remove**. |
| **Link missing in German** (or Bold, Italic…) | `missing-markup` | The reference wraps text in markup, such as a link, that the translation lacks. | Use the one-click action, such as **Link {email}** when the markup wraps a variable, or **Add link at the cursor**. |
| **Not split by {count}** | `missing-selector` | The reference has plural or select forms, this language has one text. | Choose **Split by {count}**. See [Plurals](/docs/plurals-and-selects). |
| **No form for 0** | `missing-selector` | The reference has a form for an exact number that this language doesn't choose by at all. | If the message is one text, choose **Split by {count}** first. Then add the form for 0 in **Edit structure…**. |
| **2 forms missing** | `missing-variant` | Some plural, select or exact-number forms that the language needs have no text. | Choose **+ Add … form** or **+ Add a form for 0** for each. |
| **Form one is empty** / **3 forms are empty** | `empty-variant` | One form has no text while others do. The app would show an empty string for it. | Write the form's text, or **Remove** it if it's optional. |
| **Not used in code** | `unused-message` | No call to this message was found in your code. Only in Paraglide JS projects. | Delete it if it's really unused. See [Unused messages](/docs/unused-messages). |

Fink also shows **Still in English** (or your source language) when a translation started from the source text still contains source words.

## The To do filter

**To do** groups the problems into **Missing translation**, **Missing forms**, **Empty forms** and **Placeholder problems** (variables and markup). The counts cover the languages selected in **Translate into**. The language menu shows how much is open per language.

Unused messages are not counted as to do.
