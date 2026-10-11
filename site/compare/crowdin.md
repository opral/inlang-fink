---
title: Fink vs Crowdin
seoTitle: Fink vs Crowdin: a free, git-native Crowdin alternative
description: Crowdin is a full localization platform that syncs with GitHub. Fink is a free editor for the translation files in your repo. When to pick which.
order: 1
---

**Short answer:** Crowdin is a complete localization platform for teams that work with professional translators, machine translation and many integrations. Fink is a free, much smaller tool: a browser editor for the i18next, next-intl or Paraglide JS files already in your GitHub repository. Pick Crowdin for scale and translator tooling. Pick Fink as a free Crowdin alternative if you want to edit translations where they live, without a sync.

## How they work

**Crowdin** keeps your strings in a Crowdin project. Its GitHub integration uploads source files from your repository, translators work in Crowdin's editor, and Crowdin sends translations back as a pull request from a service branch (by default prefixed `l10n_`). Configuration lives in a `crowdin.yml` file. You can also use the Crowdin CLI or GitHub Action.

**Fink** has no copy of your strings. It reads the translation files from GitHub when you open the repository and commits your edits back to the branch. Contributors without write access push to a fork and open a pull request.

## Comparison

| | Fink | Crowdin |
|---|---|---|
| Where translations live | Your GitHub repository | Crowdin project, synced to your repository |
| GitHub workflow | Direct commits, or a pull request from a fork | Pull requests from a service branch, via the GitHub integration, CLI or Action |
| Other hosts | github.com only | GitHub, GitLab, Bitbucket and many more integrations |
| File formats | i18next JSON, next-intl, inlang message format | Dozens of formats, including i18next JSON |
| Translation memory, glossary | No | Yes |
| Machine translation, AI | No | Yes, many engines |
| QA checks | Missing translations, variables, plural forms, markup | Many QA checks |
| In-context editing, screenshots | No | Yes |
| Workflows, vendors, crowdsourcing | No | Yes |
| Translator accounts | GitHub account | Crowdin account, invited to the project |
| Price | Free | Paid plans by hosted words and managers. Free for eligible open source projects |
| Source code | Open source (MIT) | Proprietary |

## Choose Crowdin if

- An agency or many professional translators work in the tool every day.
- You need translation memory, machine translation, glossaries or screenshots.
- You localize more than i18next, next-intl or Paraglide files, such as mobile, docs or design files.
- Your code lives outside github.com.

## Choose Fink if

- Your app uses i18next, next-intl or Paraglide JS and its translations are in a GitHub repository.
- Developers, PMs or community volunteers translate, and you want changes as normal commits and pull requests.
- You want no second source of truth, no sync configuration and no per-word pricing.

## Moving from Crowdin

Your translation files are already in your repository if Crowdin synced them there. Merge the last Crowdin pull request, [add a project.inlang folder](/docs/set-up-a-project), and open the repository in Fink. Crowdin's translation memory and glossary don't move to Fink.

Sources, last checked October 11, 2026: [crowdin.com](https://crowdin.com), [GitHub integration](https://support.crowdin.com/github-integration/), [pricing](https://crowdin.com/pricing), [open source projects](https://crowdin.com/page/open-source-project-setup-request).
