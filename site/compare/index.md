---
title: Fink compared with translation management systems
seoTitle: Crowdin, Lokalise, Weblate and Tolgee alternatives: Fink compared
description: How Fink, a free browser editor for translation files in GitHub, compares with Crowdin, Lokalise, Weblate and Tolgee, and when each one is the better choice.
order: 0
---

Crowdin, Lokalise, Weblate and Tolgee are **translation management systems** (TMS). They keep a working copy of your translations on their platform, give translators an editor with translation memory, machine translation and review workflows, and sync the results back to your repository.

Fink is **not a TMS**. It is an editor for the translation files that are already in your GitHub repository. There is no second copy and nothing to sync: Fink reads the files from GitHub and commits your edits back.

| | Fink | Typical TMS |
|---|---|---|
| Where translations live | Only in your GitHub repository | On the platform, synced to your repository |
| Getting changes into the repo | Fink commits to your branch, or you open a pull request from a fork | Sync job or CLI, usually as a pull request from a service branch |
| Translator accounts | GitHub account | Platform account, invited per project |
| Formats | i18next JSON, inlang message format (Paraglide JS) | Dozens |
| Translation memory, machine translation, glossary | No | Yes |
| Review workflows, vendors, agencies | No (review happens in GitHub) | Yes |
| Price | Free | Free tiers or open source plans, then paid plans |

## Fink is a good fit when

- Your translations are i18next JSON or Paraglide JS files in a GitHub repository.
- Developers, PMs or volunteers do the translating, and you want their changes as reviewable commits.
- A second source of truth, or a sync that can break, is the problem you want to get rid of.

## A TMS is the better choice when

- An agency or professional translators work on large volumes and rely on translation memory, glossaries and machine translation.
- You need many file formats, design tool integrations, over-the-air updates or approval workflows.
- Your code isn't on github.com.

## Comparisons

- [Fink vs Crowdin](/compare/crowdin)
- [Fink vs Lokalise](/compare/lokalise)
- [Fink vs Weblate](/compare/weblate)
- [Fink vs Tolgee](/compare/tolgee)

Facts about other products are taken from their own websites, last checked October 11, 2026. Each comparison links its sources. Check them for current details.
