---
title: Review and push
seoTitle: Review and push: what Fink commits to your GitHub repo
description: Fink commits only the translation files you changed and keeps the rest of each file byte for byte. How review, commits, conflicts and pushes work.
order: 9
---

When you push, Fink writes your draft back to the translation files and commits them to the branch on GitHub.

## Review

The **Changes** tab, or **Review** in the bottom bar, compares your draft with the branch. For every changed message you see the text before and after, per language, with a list of what changed: added translations, changed variables, new forms, deleted messages. Settings changes are listed separately.

## What gets committed

- **Only files with changes.** Translation files you didn't touch are not part of the commit.
- **Only the messages you changed.** Fink gives the format plugin the file as it is on GitHub. The messages you didn't edit keep their exact text and formatting: key order, indentation, escapes and line endings. Your diff on GitHub shows only your edits.
- **Settings** are written to `settings.json`, formatted with two-space indentation, only when you changed them in the **Settings** tab.
- **No deleted files.** Deleting a file's last message keeps the file. Removing a language keeps its file too.
- **Empty translations** are removed from the file, so your app falls back to another language instead of showing an empty string.

## The commit

Fink commits through GitHub's API as you, the signed-in user. GitHub marks the commit as verified. The commit message is:

```
chore: update translations

Pushed via https://fink.inlang.com

Co-authored-by: Fink <hello@inlang.com>
```

Fink never force-pushes and never creates branches.

## When the branch changed

Someone else may push to the branch while you work. Before pushing, Fink fetches the latest commit and merges it into your draft:

- Changes on GitHub to messages you didn't edit are applied.
- Your edits to other messages are kept.
- If the same message in the same language changed on both sides, **the version on GitHub wins**. The card shows **Updated from GitHub** and Fink tells you which edit was replaced.

Fink then pushes on top of the latest commit and retries if the branch moves again.

## When a push fails

- **"Sign in before pushing"**: sign in with GitHub.
- **"Check GitHub App access"** or **"GitHub rejected the commit"**: install the Inlang GitHub App on the repository, and check branch protection. Protected branches that require pull requests reject direct pushes. Use a fork instead. See [Branches, forks and pull requests](/docs/branches-forks-and-pull-requests).
- **"Couldn't write the … files"**: the format can't express something in your draft, for example an exact number other than 0 in i18next. Nothing was pushed. Fix the message and push again.
