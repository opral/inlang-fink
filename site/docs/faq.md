---
title: FAQ
seoTitle: Fink FAQ: pricing, formats, GitHub access and more
description: Answers to common questions about Fink, the browser translation editor for GitHub repositories.
order: 30
---

## What is Fink?

A translation editor that runs in your browser. It opens the translation files in a GitHub repository, shows every language side by side, checks them, and commits your changes back to the branch.

## What does it cost?

Fink is free during the beta.

## Is Fink open source?

Fink is source-available, not OSI open source. The code is public at [github.com/opral/inlang-fink](https://github.com/opral/inlang-fink) under the Fair Core License (FCL-1.0-MIT), and each release becomes MIT-licensed two years after it's published.

## Which formats does Fink support?

i18next JSON and the inlang message format used by Paraglide JS. ICU MessageFormat files, next-intl, PO, XLIFF and others are not supported. See [Supported formats](/docs/formats).

## Does it work with GitLab or Bitbucket?

No. Fink works with repositories on github.com.

## Do translators need a GitHub account?

To save their changes, yes. Without an account they can open a public repository and edit a draft in their browser. See [Translators and non-developers](/docs/translators).

## Does Fink store my translations?

No. Your repository is the only copy. Unpushed edits are kept as a draft in your browser. See [Privacy](/docs/privacy).

## Will Fink reformat my JSON files?

No. Fink commits only files you changed, and in those files the messages you didn't edit keep their exact formatting. See [Review and push](/docs/push).

## Does Fink open pull requests?

Fink pushes commits to a branch. If you don't have write access, it forks the repository and opens GitHub's pull request page for you to submit. See [Branches, forks and pull requests](/docs/branches-forks-and-pull-requests).

## Does Fink machine translate?

Not yet. You can request access from the **Machine translate** button.

## Can I use Fink offline?

Your draft is stored locally, but opening a project and pushing need GitHub.

## Do I need a project.inlang folder?

Yes. It tells Fink your languages and where the files are. i18next and Paraglide JS projects can create one with a single command. See [Set up a project](/docs/set-up-a-project).

## How is Fink different from Crowdin or Lokalise?

They are translation management systems that keep a copy of your translations in their cloud and sync it with your repository. Fink edits the files in the repository directly and has no sync. It also has far fewer features: no translation memory, machine translation or vendor workflows. See the [comparisons](/compare).

## What is inlang?

inlang is the open project format and SDK behind Fink and [Paraglide JS](https://paraglidejs.com). Tools that read the same `project.inlang` work together. See [inlang.com](https://inlang.com).
