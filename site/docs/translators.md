---
title: Translators and non-developers
seoTitle: Let translators and PMs edit app translations without git
description: What translators, PMs and writers need to edit your app's translations in Fink, which accounts and access they need, and how their changes reach GitHub.
order: 11
---

Fink is built so people who don't use git, a terminal or a code editor can edit translations. They work in the browser, and Fink turns their edits into a commit.

## What they need

| To… | They need |
|---|---|
| Open a public repository and edit a draft | Nothing. No account. |
| Open a private repository | A GitHub account with access to the repository, and the Inlang GitHub App installed on it |
| Save changes to GitHub | A GitHub account (free). Without it, edits stay in their browser |
| Push straight to a branch | Write access to the repository |
| Contribute without write access | A GitHub account with the Inlang GitHub App installed on it, so Fink can push to their fork. Fink forks the repository and they open a pull request |

Fink has no accounts of its own, no invitations and no roles. Access is whatever GitHub allows.

## A workflow for product teams

1. A developer adds the [inlang project](/docs/set-up-a-project) and installs the Inlang GitHub App on the repository.
2. Add translators and PMs as collaborators on GitHub. Write access is enough.
3. Send them a link like `https://fink.inlang.com/?repo=acme/web&project=project.inlang`.
4. They pick their language under **Translate into**, filter **To do**, and edit.
5. They push to a branch you agreed on, for example `translations`, and you merge it with a pull request. Or they push to the main branch if you trust the checks.

## What protects your app

- Translators edit text, not JSON. They can't break quotes, brackets or keys.
- [Checks](/docs/checks) flag missing variables, unknown variables and missing plural forms before anything is pushed.
- Every change is a commit with a diff your developers can review.

## Limits to know

- Everyone who saves changes needs a GitHub account. A draft can't be shared or exported as translation files, so work done without an account stays in that browser.
- There is no comment thread, screenshot or translation memory. Context lives in your message keys and the reference text.
- Machine translation is not available yet.
