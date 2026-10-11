---
title: Branches, forks and pull requests
seoTitle: Branches, forks and pull requests in Fink
description: Edit any branch, keep a separate draft per branch, and contribute to repositories you can't push to through a fork and a pull request.
order: 10
---

## Branches

Fink opens the repository's default branch. Switch branches with the branch menu in the header. Each branch has its own [draft](/docs/drafts), so you can keep unpushed work on several branches at once.

Fink pushes to the branch you opened. It can't create branches. To prepare translations for review, create the branch on GitHub first (for example `translations/de`), open it in Fink, push, and open a pull request on GitHub.

Branches protected with "require a pull request before merging" reject direct pushes from Fink. Push to another branch and open a pull request.

## Without write access: forks

If you can't push to the repository, for example as a community translator for an open source project, the bottom bar shows **Fork to make changes**:

1. Sign in with GitHub and install the Inlang GitHub App on your own account ([github.com/apps/inlang/installations/new](https://github.com/apps/inlang/installations/new)), so Fink can push to your fork. Then choose **Fork**. Fink creates a fork in your account, or uses the one you already have, and opens the same branch and project there.
2. Your edited messages move to the fork's draft. Edits in the **Settings** tab don't move along, so make them again in the fork.
3. Choose **Push**. Fink commits to the branch in your fork.
4. Choose **Open pull request**. GitHub's compare page opens with the title "Update translations" filled in. Submit it there.

Fink doesn't open the pull request for you. You review and submit it on GitHub.

An older fork may be behind the original repository. If you see unexpected differences, sync the fork on GitHub first.

## For maintainers

Translation contributions arrive as normal pull requests. They change only the translation files and only the messages the contributor edited, so they are quick to review. Send contributors a link like `https://fink.inlang.com/?repo=OWNER/REPO&project=project.inlang` to open your project directly. With only `?repo=`, Fink fills in the repository and waits for **Open**.
