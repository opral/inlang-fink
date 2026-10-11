---
title: Set up a project
seoTitle: Add a project.inlang folder for Fink (i18next and Paraglide JS)
description: Fink needs an inlang project folder in your repository. Create project.inlang/settings.json for i18next JSON or Paraglide JS with one command, or by hand.
order: 2
---

Fink finds your translations through an **inlang project**: a folder whose name ends in `.inlang`, usually `project.inlang`, with a `settings.json` inside. The file lists your languages and tells the format plugin where your translation files are. Commit it to the repository like any other config file.

## i18next projects

If your app uses i18next with JSON files, the i18next CLI can create the project for you:

```sh
npx i18next-cli init --inlang
```

Or create `project.inlang/settings.json` by hand. Paths are relative to the folder that contains `project.inlang`:

```json
{
  "$schema": "https://inlang.com/schema/project-settings",
  "baseLocale": "en",
  "locales": ["en", "de", "fr"],
  "modules": [
    "https://cdn.jsdelivr.net/npm/@inlang/plugin-i18next@6/dist/index.js"
  ],
  "plugin.inlang.i18next": {
    "pathPattern": "./locales/{locale}.json"
  }
}
```

With namespaces (several files per language), use one entry per namespace. See [i18next](/docs/i18next).

```json
"plugin.inlang.i18next": {
  "pathPattern": {
    "common": "./public/locales/{locale}/common.json",
    "settings": "./public/locales/{locale}/settings.json"
  }
}
```

## Paraglide JS projects

`npx @inlang/paraglide-js@latest init` creates `project.inlang` with the inlang message format plugin. Its settings look like this:

```json
{
  "$schema": "https://inlang.com/schema/project-settings",
  "baseLocale": "en",
  "locales": ["en", "de"],
  "modules": [
    "https://cdn.jsdelivr.net/npm/@inlang/plugin-message-format@4/dist/index.js",
    "https://cdn.jsdelivr.net/npm/@inlang/plugin-m-function-matcher@2/dist/index.js"
  ],
  "plugin.inlang.messageFormat": {
    "pathPattern": "./messages/{locale}.json"
  }
}
```

See [Paraglide JS](/docs/paraglide-js).

## Rules Fink checks

- `baseLocale` must be set and included in `locales`. Older projects that use `sourceLanguageTag` and `languageTags` must be migrated first.
- Configure **exactly one** format plugin: `plugin.inlang.i18next` or `plugin.inlang.messageFormat`, with a `pathPattern`. Fink reports any other format plugin as unsupported. See [Supported formats](/docs/formats).
- `pathPattern` must be relative and stay inside the repository.
- Fink uses its own pinned copies of the two plugins. It never runs code from the `modules` URLs in your repository. Keep `modules` for other inlang tools, such as the Paraglide compiler or the inlang CLI.

## Several projects in one repository

A monorepo can have several `.inlang` folders, for example `apps/web/project.inlang` and `apps/admin/project.inlang`. Fink lists them all when you open the repository, and you can switch between them from the Fink menu.

## Learn more about inlang

inlang is the open project format behind Fink and Paraglide JS. Read the [inlang documentation](https://inlang.com/docs) for the full settings reference.
