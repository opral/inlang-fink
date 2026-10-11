---
title: i18next
seoTitle: i18next editor: edit i18next JSON, namespaces and plurals
description: Edit i18next and react-i18next JSON translation files side by side, including namespaces and plurals, and push the changes to GitHub with Fink.
order: 20
---

Fink edits i18next JSON files in your GitHub repository: the files that `i18next`, `react-i18next` and `next-i18next` load. You see each key's translations side by side, Fink flags missing ones, and it commits only the files you changed.

## Set up

Add an inlang project next to your app. The quickest way:

```sh
npx i18next-cli init --inlang
```

This creates `project.inlang/settings.json` for your existing JSON files. Check that the generated `pathPattern` points at your files, then commit the folder and open the repository at [fink.inlang.com](https://fink.inlang.com).

To write the settings by hand, see [Set up a project](/docs/set-up-a-project).

## From i18next paths to pathPattern

i18next configs often use `{{lng}}` and `{{ns}}` in `loadPath`. In inlang settings:

- The language placeholder is `{locale}`.
- There is no namespace placeholder. List each namespace as its own entry (see below).
- Paths are relative to the folder that contains `project.inlang`. Put `project.inlang` next to your app's `package.json`, so `./public/locales/...` points at the right place. In a monorepo, each app can have its own project.

Example for a Next.js app with next-i18next or react-i18next and files at `public/locales/{lng}/{ns}.json`:

```json
{
  "$schema": "https://inlang.com/schema/project-settings",
  "baseLocale": "en",
  "locales": ["en", "fr", "ja"],
  "modules": ["https://cdn.jsdelivr.net/npm/@inlang/plugin-i18next@6/dist/index.js"],
  "plugin.inlang.i18next": {
    "pathPattern": {
      "common": "./public/locales/{locale}/common.json",
      "home": "./public/locales/{locale}/home.json"
    }
  }
}
```

Add an entry when you add a namespace file. Fink only shows namespaces listed here.

## Namespaces

Several files per language work. Give `pathPattern` one entry per namespace:

```json
"plugin.inlang.i18next": {
  "pathPattern": {
    "common": "./public/locales/{locale}/common.json",
    "dashboard": "./public/locales/{locale}/dashboard.json"
  }
}
```

Fink shows messages from all namespaces together and writes each one back to its own file.

## What Fink understands

- **Nested and flat keys.** The plugin detects which one a file uses and keeps it.
- **Interpolation.** `{{name}}` appears as the variable `{name}` in the editor and is written back as `{{name}}`. Unescaped `{{- name}}` and simple formats like `{{value, uppercase}}` are supported.
- **Plurals.** Keys like `item_one`, `item_other` and `item_few` appear as one message with plural forms. See [i18next plural keys](#i18next-plural-keys).
- **Context.** Suffixes like `friend_male` are recognized, including together with plurals. If your keys contain underscores that aren't context, set `contextValues` in the plugin settings.

## i18next plural keys

i18next stores each plural form as its own key with a suffix:

```json
{
  "cart_zero": "Your cart is empty",
  "cart_one": "{{count}} item in your cart",
  "cart_other": "{{count}} items in your cart"
}
```

Fink shows these three keys as one message, `cart`, with the forms 0, one and other. German needs `one` and `other`, Polish adds `few` and `many`. Fink offers the forms each language needs and writes them back as `cart_few`, `cart_many` and so on. Ordinal plurals (`_ordinal_one`, `_ordinal_other`) work the same way. See [Plurals, selects and exact numbers](/docs/plurals-and-selects).

## Limitations

- **Exact numbers:** i18next can only express exactly 0 (`key_zero`) next to the plural categories. Fink won't let you add a form for another exact number in an i18next project.
- **Formatting with options**, such as `{{value, number, minimumFractionDigits: 2}}`, can't be exported.
- **Nesting** (`$t(otherKey)`) is kept but can't be edited as a reference.
- **Unused messages** are not detected for i18next projects. Fink's code analysis only understands Paraglide JS calls.

## Moving to Paraglide JS

The same inlang project can later be used by Paraglide JS, a compiler-based i18n library with typesafe messages. See [paraglidejs.com](https://paraglidejs.com).
