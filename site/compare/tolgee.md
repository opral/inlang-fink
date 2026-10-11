---
title: Fink vs Tolgee
seoTitle: Fink vs Tolgee: a Tolgee alternative that edits files in git
description: Tolgee is an open source localization platform with in-context editing. Fink edits the translation files in your GitHub repo. When to pick which.
order: 4
---

**Short answer:** Tolgee is an open source localization platform built around in-context editing and its own SDKs. Translations live in Tolgee, and you move them with its CLI or API. Fink edits the translation files in your GitHub repository directly. Pick Tolgee if you want in-app editing, translation memory and AI translation. Pick Fink as a Tolgee alternative if your files in git should stay the only source of truth.

## How they work

**Tolgee** stores keys and translations in a Tolgee project, in the cloud or self-hosted. Developers push and pull files with the Tolgee CLI or API from their CI, or deliver translations through Tolgee's content delivery. Its SDKs let people edit text inside the running app.

**Fink** reads your i18next or Paraglide JS files from GitHub and commits edits back. Nothing to push or pull.

## Comparison

| | Fink | Tolgee |
|---|---|---|
| Where translations live | Your GitHub repository | Tolgee project, exported to your repository or served by Tolgee |
| Getting changes into the repo | Commit or pull request from Fink | Tolgee CLI or API in your CI |
| In-context editing in your app | No | Yes, with Tolgee SDKs |
| File formats | i18next JSON, inlang message format | Many import and export formats, including i18next JSON |
| Translation memory, glossary | No | Yes |
| AI and machine translation | No | Yes |
| Translator accounts | GitHub account | Tolgee account, invited to the project |
| Hosting | Hosted at fink.inlang.com | Tolgee Cloud or self-hosted |
| Price | Free during beta | Free plan with limits, then paid plans. Tolgee announced free plans for open source projects on request |
| License | FCL-1.0-MIT (source-available) | Apache-2.0, with enterprise features under a separate license |

## Choose Tolgee if

- You want people to edit text directly in your running app.
- You need translation memory, AI translation or content delivery.
- You want to self-host a platform.

## Choose Fink if

- Your translations are i18next or Paraglide JS files on GitHub, and they should stay the only source of truth.
- You don't want to add an SDK, a CLI step or a sync to your build.

Sources, last checked October 11, 2026: [tolgee.io](https://tolgee.io), [CLI push and pull](https://docs.tolgee.io/tolgee-cli/push-pull-strings), [supported formats](https://docs.tolgee.io/platform/supported_formats), [pricing](https://tolgee.io/pricing), [license](https://github.com/tolgee/tolgee-platform/blob/main/LICENSE).
