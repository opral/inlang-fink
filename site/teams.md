---
title: Your team edits translations. Nobody touches JSON or git.
seoTitle: Fink for teams: translators and PMs edit app text without git
description: Translators and product managers edit your app's text in the browser. Fink checks it and commits it to the branch you opened on GitHub.
layout: page
navTitle: Fink for teams
---

Translators and product managers edit your app's text in the browser. Fink checks the text and saves it as a commit on GitHub. Developers review the change like any other commit.

<p class="page-cta"><a class="site-cta" href="/">Open a repository</a> <a href="/docs/translators">Read the guide for translators</a></p>

## What a translator or PM does

1. Open the link a developer sent you. It opens the project in Fink. The link also decides where your changes go. You don't choose that.
2. Pick your language in the language menu.
3. Choose **To do** to see the text that is missing or has problems.
4. Type the translation. The source text is shown above each field.
5. Choose **Sign in with GitHub** the first time, then **Push**. Fink saves your changes to GitHub.

No terminal. No code editor. No JSON files.

## What Fink checks

Fink compares each translation with the source text and shows a warning when:

- a translation is missing or empty,
- a variable such as `{name}` is missing or misspelled,
- a plural form, such as the text for "1 item" or "5 items", is missing.

Most warnings have a button that fixes them. You can push with open warnings. See [Checks](/docs/checks).

## Where your changes go

When you push, Fink saves your changes as a **commit** (a saved set of changes) on the **branch** (a copy of the project) that your link opened. Fink does not open a pull request.

- **Review first.** A developer creates a branch on GitHub, for example `translations`, and sends you a link to it. You push to that branch. The developer then opens a **pull request** (a request to add the changes to the main branch) on GitHub, checks your changes and merges them.
- **Main branch.** If your developer sends you a link to the main branch, your changes are there right away. They still reach the app only when a developer releases a new version.
- **No write access.** Fink makes a copy of the project in your GitHub account (a **fork**) and you push there. Fink then shows a link to GitHub's pull request page. You submit the pull request on GitHub.

Your text appears in the app after a developer merges it and releases a new version of the app. Fink does not publish anything to the app.

Before you push, **Review** shows each changed text before and after. Only the files you changed are committed, and only the texts you edited change in them.

## Mistakes

- Before you push: undo with ⌘Z or Ctrl+Z, or edit the text again. Nothing is on GitHub yet.
- After you push: edit the text again and push again. A developer can also undo the commit on GitHub.

## What each person needs

| Person | Needs |
|---|---|
| Translator or PM who saves changes | A free GitHub account with write access to the repository |
| Translator without write access | A free GitHub account with the Inlang GitHub App installed, so Fink can push to the fork. A developer can help with this. |
| Someone who only looks | Nothing, for public repositories. Changes stay in that browser and can't be saved. |
| Developer | Sets up the project once (below) |

Fink has no accounts, invitations or roles of its own. GitHub decides who can push.

## Setup for developers

1. Add a `project.inlang` folder to the repository. For i18next, run `npx i18next-cli init --inlang`. Paraglide JS projects already have one. See [Set up a project](/docs/set-up-a-project).
2. Install the [Inlang GitHub App](https://github.com/apps/inlang/installations/new) on the repository.
3. Add translators and PMs as collaborators on GitHub, or let them work through forks.
4. Send them a link: `https://fink.inlang.com/?repo=OWNER/REPO&project=project.inlang`.

## Limits

- Everyone who saves changes needs a GitHub account.
- Only repositories on github.com.
- Only i18next JSON and Paraglide JS (inlang message format) files. See [Supported formats](/docs/formats).
- No comments, screenshots or translation memory. Machine translation is not available yet.

Fink is free and open source (MIT).
