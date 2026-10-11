---
title: Fink vs Weblate
seoTitle: Fink vs Weblate: a lighter, git-based translation editor
description: Weblate is an open source, git-integrated localization platform you can host yourself. Fink is a browser editor with nothing to host. Differences, and when to pick which.
order: 3
---

**Short answer:** Weblate and Fink both treat your git repository as the place translations belong. Weblate is a full, open source localization platform (GPL-3.0) with translation memory, many formats and community translation features, which you host yourself or use as a hosted service. Fink is a much smaller browser editor with nothing to install. Pick Weblate for large community translation projects and many formats. Pick Fink for i18next or Paraglide JS projects that want an editor without a server.

## How they work

**Weblate** clones your repository, translators work in Weblate's web interface, and Weblate commits and pushes back, directly or as pull requests. It needs a server (yours, or Hosted Weblate) and per-project configuration of components and file masks.

**Fink** runs in the browser and talks to GitHub directly. You open a repository, edit, and push. There is no server to run and no project to configure beyond the `project.inlang` folder.

## Comparison

| | Fink | Weblate |
|---|---|---|
| Where translations live | Your GitHub repository | Your repository, with Weblate's working copy and database |
| Setup | `project.inlang` folder, open the URL | Weblate server or Hosted Weblate, then components per project |
| Git hosts | github.com only | Any git host |
| File formats | i18next JSON, inlang message format | About 50 formats, including i18next JSON |
| Translation memory, glossary | No | Yes |
| Machine translation | No | Optional |
| Quality checks | Missing translations, variables, plural forms, markup | Many checks |
| Translator accounts | GitHub account | Weblate account, with anonymous suggestions possible |
| Hosting | Hosted at fink.inlang.com | Self-hosted (free) or Hosted Weblate (paid, free Libre plan for open source) |
| License | FCL-1.0-MIT (source-available) | GPL-3.0 |

## Choose Weblate if

- You run a large community translation effort with many languages and translators.
- You need translation memory, glossaries or many file formats.
- You want to self-host under an OSI open source license, or your code isn't on github.com.

## Choose Fink if

- Your project uses i18next or Paraglide JS on GitHub.
- You don't want to run or configure a server.
- Contributors should see every language side by side and send you a normal pull request.

*Weblate facts are from weblate.org and docs.weblate.org, October 2026.*
