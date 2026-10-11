---
title: Fink vs Lokalise
seoTitle: Fink vs Lokalise: a free Lokalise alternative for GitHub repos
description: Lokalise is an AI localization platform with GitHub sync. Fink is a free browser editor for i18next and Paraglide files in your repo. Differences, and when to pick which.
order: 2
---

**Short answer:** Lokalise is a commercial localization platform with AI translation, automated workflows and many integrations. Fink is a free editor for the translation files in your GitHub repository. Pick Lokalise for automation and professional translation at scale. Pick Fink if your team edits i18next or Paraglide JS translations and you'd rather keep everything in git.

## How they work

**Lokalise** pulls your files into a Lokalise project, through its GitHub app or GitHub Actions. Translators and AI work there, and Lokalise opens a pull request from a new branch to send translations back.

**Fink** reads the files from GitHub when you open the repository, and commits your edits back to the branch. There is no project to keep in sync.

## Comparison

| | Fink | Lokalise |
|---|---|---|
| Where translations live | Your GitHub repository | Lokalise project, synced to your repository |
| GitHub workflow | Direct commits, or a pull request from a fork | Pull requests from a Lokalise branch, via the GitHub app or Actions |
| File formats | i18next JSON, inlang message format | 30+ formats, including i18next JSON |
| AI and machine translation | No | Yes |
| Translation memory | No | Yes |
| Automated workflows, review steps | No (review in GitHub) | Yes |
| Over-the-air updates for mobile | No | Yes |
| Figma integration | No | Yes |
| Translator accounts | GitHub account | Lokalise seat (free translator seats on paid plans) |
| Price | Free during beta | Paid plans by words and seats, with a free trial |
| Source code | Public (FCL-1.0-MIT) | Proprietary |

## Choose Lokalise if

- You want AI translation, automation and workflows across many products and formats.
- Designers work in Figma, or mobile apps need over-the-air updates.
- You have budget for a commercial platform.

## Choose Fink if

- Your translations are i18next or Paraglide JS files in a GitHub repository.
- You want no sync, no second copy and no per-word pricing.
- Reviewing translations as commits and pull requests suits your team.

*Lokalise facts are from lokalise.com and docs.lokalise.com, October 2026.*
