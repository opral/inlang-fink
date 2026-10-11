---
title: Getting started
seoTitle: Getting started with Fink: edit your app's translations on GitHub
description: Open a GitHub repository in Fink, edit translations side by side, review the diff and push a commit to your branch. Requirements and step-by-step setup.
order: 1
---

Fink edits the translation files in a GitHub repository. You need three things:

1. **A GitHub repository** on github.com. GitLab, Bitbucket and GitHub Enterprise Server are not supported.
2. **An inlang project in the repository**: a folder such as `project.inlang` with a `settings.json` file that lists your languages and where the translation files are. If you don't have one, [set one up](/docs/set-up-a-project). It takes one command for i18next and Paraglide JS projects.
3. **A supported format**: [i18next JSON or the inlang message format](/docs/formats) (used by Paraglide JS).

## 1. Open the repository

Go to [fink.inlang.com](https://fink.inlang.com) and paste the repository URL, for example `https://github.com/acme/web` or just `acme/web`. Use the repository's root URL, not a link to a branch or file.

Fink reads the default branch and finds every `*.inlang/settings.json` in it. If the repository has several projects or you want another branch, pick them in the **Branch** and **Project** menus, then choose **Open project**.

Public repositories open without signing in. Private repositories need you to [sign in and grant access](#3-sign-in-and-grant-access) first.

## 2. Edit

Each message is one card with its translations side by side. Choose the language you translate **from** and the languages you translate **into** in the language menu. Use the **To do** filter to see what is missing or broken in those languages. See [Editing translations](/docs/editing) and [Checks](/docs/checks).

Your edits are saved as a [local draft](/docs/drafts) in this browser right away. Nothing is sent to GitHub until you push.

## 3. Sign in and grant access

To push, choose **Sign in with GitHub**. Fink signs you in through the **Inlang** GitHub App. A session lasts at most 8 hours.

The app also needs access to the repository. Install it on your account or organization at [github.com/apps/inlang/installations/new](https://github.com/apps/inlang/installations/new) and select the repositories Fink may use. You can open the same page from **Grant repository access** in Fink's account menu. This is also how Fink gets access to **private repositories**.

## 4. Review and push

The bar at the bottom shows how many messages you changed. Choose **Review** to see a before/after view of every changed message, then **Push**. Fink commits the changed translation files to the branch you opened, as you, and shows a link to the commit.

Only files with changes are committed, and the messages you didn't touch keep their exact formatting. See [Review and push](/docs/push).

Fink pushes to the branch you opened. To have changes reviewed first, create a branch on GitHub, open that branch in Fink, push, and open a pull request on GitHub.

If you don't have write access to the repository, the bar shows **Fork** instead. Fink forks the repository to your account, moves your changes along, and after you push it links you to open a pull request. See [Branches, forks and pull requests](/docs/branches-forks-and-pull-requests).

## Try it on a real project

The [Fink home page](https://fink.inlang.com) lists open source projects that use inlang, such as Pocket ID and the TanStack Router Paraglide example. Open one to try the editor. You can edit a draft without signing in.
