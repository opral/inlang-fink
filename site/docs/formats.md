---
title: Supported formats
seoTitle: Supported formats: i18next, next-intl and Paraglide JS · Fink
description: Fink edits i18next JSON, next-intl and inlang message format files (Paraglide JS). What each supports, file and push limits, and what isn't supported yet.
order: 3
---

Fink reads and writes translation files through inlang format plugins. It ships three of them, pinned to tested versions.

| Format | Used by | Settings key | Notes |
|---|---|---|---|
| **i18next JSON** | i18next, react-i18next, next-i18next | `plugin.inlang.i18next` | Nested or flat keys, namespaces, plural suffixes, context. [Details](/docs/i18next) |
| **next-intl** | next-intl | `plugin.inlang.nextIntl` | `messages/{locale}.json`, nested namespaces, files per namespace, ICU plurals, selects and rich text tags. [Details](/docs/next-intl) |
| **inlang message format** | Paraglide JS | `plugin.inlang.messageFormat` | Variables, plurals, selects, exact numbers. [Unused messages](/docs/unused-messages) and usage in code. [Details](/docs/paraglide-js) |

A project must configure exactly one of these. A repository can contain several projects, each with its own format.

## Not supported

If your project uses another format plugin, Fink shows "Unsupported resource plugins" and doesn't open it. This includes:

- ICU MessageFormat files of other libraries (the generic ICU1 plugin), FormatJS / react-intl
- The generic inlang JSON plugin
- gettext PO, XLIFF, YAML, Android XML, iOS `.strings` and `.xcstrings`, ARB

Fink only runs its own bundled plugins. It never loads plugin code from a repository, so it can't add formats on the fly.

## Limits

- Translation files are JSON, at most 1 MiB each.
- One push changes at most 100 files and 5 MiB in total.
- The repository must be on github.com, and GitHub must return its complete file tree. Very large repositories can exceed GitHub's limit.
- Settings must use inlang SDK v3 (`baseLocale` and `locales`).
- Fink needs a current browser with the Origin Private File System, where drafts are stored. It is tested in Chrome. Other current browsers should work but aren't tested.
