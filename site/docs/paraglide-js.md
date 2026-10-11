---
title: Paraglide JS
seoTitle: Paraglide JS translation editor in the browser · Fink
description: Fink is the browser editor for Paraglide JS projects. Edit the inlang message format side by side, see where each message is used, and find unused messages.
order: 21
---

[Paraglide JS](https://paraglidejs.com) compiles your messages into typesafe functions like `m.greeting({ name })`. Its messages live in an inlang project with the inlang message format, usually `messages/{locale}.json`. Fink opens that project straight from GitHub.

## Set up

If you ran `npx @inlang/paraglide-js@latest init`, your repository already has a `project.inlang` folder and Fink can open it. Paste the repository URL at [fink.inlang.com](https://fink.inlang.com).

## Features for Paraglide JS projects

- **All message features.** Variables, plurals, selects on any input, and forms for exact numbers. See [Plurals, selects and exact numbers](/docs/plurals-and-selects).
- **Usage in code.** Each message card shows where `m.messageName()` is called, with a line of code and a link to the file on GitHub.
- **Unused messages.** Messages with no detected call are labelled **Not used in code**. See [Unused messages](/docs/unused-messages).
- **Exact formatting.** Fink rewrites only the messages you change. Key order, spacing and escapes in the rest of the file stay as they were. See [Review and push](/docs/push).

## Example projects

The TanStack Router Paraglide example, Pocket ID and other open source projects use Paraglide JS. Open them from the [Fink home page](https://fink.inlang.com) to try the editor.
