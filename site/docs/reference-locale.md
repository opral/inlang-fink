---
title: Reference locale
seoTitle: Reference locale (base locale) in Fink
description: The reference locale is the language Fink compares translations against, from baseLocale in settings.json. How to change the language you translate from.
order: 5
---

Every inlang project has a **base locale** (`baseLocale` in `settings.json`), usually English. Fink calls it the **reference locale** and marks it with a **ref** badge.

## What the reference is used for

- It is the default **From** language: the text you read while translating.
- [Checks](/docs/checks) compare each translation with it. If the reference uses `{count}` and the German text doesn't, German gets a "Missing {count}" problem.
- Its plural forms and selects decide which forms other languages need.

## Translate from another language

In the language menu, set **From** to any language, for example to translate Swiss German from German. Checks then compare against that language while you work. The project's base locale doesn't change.

## Edit the reference text

The reference row is editable like any translation: click it and type. You can also add or remove its plural forms, or split it by a number with **Split English by {count}** in the message's ··· menu.

When you add a variable such as `{count}` to the reference, Fink checks the other languages again, so they show **Missing {count}** until it's added there too.

## Change the base locale

Change **Reference locale** in the **Settings** tab and push. Fink writes the new `baseLocale` to `settings.json`. Paraglide JS reads the base locale from the same file. i18next has its own settings, such as `fallbackLng`, so update those in your code as well.
