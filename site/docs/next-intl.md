---
title: next-intl
seoTitle: next-intl editor: edit messages, plurals and rich text
description: Edit next-intl message files in your GitHub repository with Fink: namespaces, ICU plurals, selects and rich text, pushed back as small diffs.
order: 21
---

Fink edits next-intl message files in your GitHub repository: the `messages/{locale}.json` files that `useTranslations` and `getTranslations` read. You see each message's translations side by side, Fink flags missing ones and broken plurals, variables or tags, shows where each message is used in your code, and commits only the lines you changed.

## Set up

Add `project.inlang/settings.json` next to your app's `package.json`. Paths are relative to the folder that contains `project.inlang`:

```json
{
  "$schema": "https://inlang.com/schema/project-settings",
  "baseLocale": "en",
  "locales": ["en", "de", "fr"],
  "modules": [
    "https://cdn.jsdelivr.net/npm/@inlang/plugin-next-intl@2/dist/index.js"
  ],
  "plugin.inlang.nextIntl": {
    "pathPattern": "./messages/{locale}.json"
  }
}
```

List the locales of your `routing.ts` in `locales`. `baseLocale` is the language you write first, usually your `defaultLocale`. Commit the folder and open the repository at [fink.inlang.com](https://fink.inlang.com).

### Files per namespace

If you split messages into one file per namespace, give `pathPattern` one entry per namespace:

```json
"plugin.inlang.nextIntl": {
  "pathPattern": {
    "HomePage": "./messages/{locale}/home.json",
    "Checkout": "./messages/{locale}/checkout.json"
  }
}
```

The messages of `./messages/en/home.json` appear as `HomePage.title` and so on, as `useTranslations("HomePage")` reads them. Fink writes each one back to its own file. A new message must start with one of the namespaces, such as `HomePage.subtitle`: Fink can't push a message that has no file.

## What Fink understands

- **Namespaces.** `{ "Home": { "title": "…" } }` is the message `Home.title`, as `t("Home.title")` or `useTranslations("Home")` reads it. A new message is nested at its dots.
- **Arguments.** `{name}` appears as the variable `{name}`.
- **Plurals.** `{count, plural, =0 {…} one {# item} other {# items}}` appears as one message with a form for exactly 0 and the plural forms each language needs, for example `few` and `many` in Polish. `#` is the number. Any exact number (`=0`, `=1`, `=12`) works. See [Plurals, selects and exact numbers](/docs/plurals-and-selects).
- **Selects and ordinals.** `{gender, select, female {…} other {…}}` and `{place, selectordinal, one {#st} …}` work the same way, also nested in each other.
- **Rich text.** Tags such as `<b>…</b>` and `<link>…</link>`, for `t.rich()` and `t.markup()`, are shown as tags that translators can keep, move or wrap around text. Fink flags a translation that lost one.
- **Number and date formats.** `{price, number, ::currency/EUR}` and `{date, date, short}` are kept as written.
- **Escaping.** Quoted text like `'{name}'` shows as `{name}`. When you type `{` or a tag as text, Fink quotes it so that next-intl shows it as text.

Arrays and other values that aren't messages (for `t.raw()`) are kept in the files but not shown.

## Small diffs

Fink writes only the messages you changed. Every other line of the file, its key order, indentation and quoting, stays byte for byte. A plural you edit is written as one ICU string, such as `{count, plural, =0 {No items} one {# item} other {# items}}`.

## Limitations

- **Unused messages and usage in code** come from your `useTranslations`, `getTranslations` and `t()` calls. Dynamic keys, a `t` passed on or exported, wrapper packages, globbed message catalogs, key types and `t.raw()` or `t.has()` on a namespace make the result incomplete, and Fink labels no message unused. See [Unused messages](/docs/unused-messages#next-intl).
- **Tags around a plural**, such as `<b>{count, plural, …}</b>`, are written into each form, `{count, plural, one {<b>…</b>} …}`, once you edit the message. next-intl renders both the same.
- **Self-closing tags** like `<br/>` are text in next-intl. Use `<br></br>`.
- A message next-intl can't parse is shown as text and written back as it was, unless you edit it.
- With `sourceLanguageFilePath`, the file of the reference locale, change the reference locale in `settings.json` in your repository, not in Fink.
