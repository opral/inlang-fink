---
title: Fink vs Lokalise
seoTitle: Fink vs Lokalise: a free Lokalise alternative for GitHub repos
description: Lokalise is an AI localization platform with GitHub sync. Fink is a free editor for the i18next, next-intl and Paraglide files in your repo. When to pick which.
order: 2
---

**Short answer:** Lokalise is a commercial localization platform with AI translation, automated workflows and many integrations. Fink is a free editor for the translation files in your GitHub repository. Pick Lokalise for automation and professional translation at scale. Pick Fink as a free Lokalise alternative if your team edits i18next, next-intl or Paraglide JS translations and you'd rather keep everything in git.

## How they work

**Lokalise** pulls your files into a Lokalise project, through its GitHub app or GitHub Actions. Translators and AI work there, and Lokalise opens a pull request from a new branch to send translations back.

**Fink** reads the files from GitHub when you open the repository, and commits your edits back to the branch. There is no project to keep in sync.

## Comparison

| | Fink | Lokalise |
|---|---|---|
| Where translations live | Your GitHub repository | Lokalise project, synced to your repository |
| GitHub workflow | Direct commits, or a pull request from a fork | Pull requests from a Lokalise branch, via the GitHub app or Actions |
| File formats | i18next JSON, next-intl, inlang message format | Many formats, including i18next JSON |
| AI and machine translation | No | Yes |
| Translation memory | No | Yes |
| Automated workflows, review steps | No (review in GitHub) | Yes |
| Over-the-air updates for mobile | No | Yes |
| Figma integration | No | Yes |
| Translator accounts | GitHub account | Lokalise account in your team |
| Price | Free | Paid plans by words and seats, with a free trial |
| Source code | Open source (MIT) | Proprietary |

## Choose Lokalise if

- You want AI translation, automation and workflows across many products and formats.
- Designers work in Figma, or mobile apps need over-the-air updates.
- You have budget for a commercial platform.

## Choose Fink if

- Your translations are i18next, next-intl or Paraglide JS files in a GitHub repository.
- You want no sync, no second copy and no per-word pricing.
- Reviewing translations as commits and pull requests suits your team.

Sources, last checked October 11, 2026: [lokalise.com](https://lokalise.com), [GitHub app](https://docs.lokalise.com/en/articles/1684090-github), [GitHub Actions](https://developers.lokalise.com/docs/github-actions), [pricing](https://lokalise.com/pricing).
