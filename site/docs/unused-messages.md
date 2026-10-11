---
title: Unused messages
seoTitle: Find unused translation keys with Fink (Paraglide JS)
description: Fink finds messages that your code never calls and labels them Not used in code. How detection works, its limits, and when it is switched off.
order: 8
---

In Paraglide JS projects, Fink labels messages that your code never calls as **Not used in code**. Each used message shows where it is called, with a link to the line on GitHub.

## How it works

When you open a project, Fink downloads the repository's source code at the commit your draft is based on and looks for calls like `m.greeting()`. It scans the folder that contains your project and translation files. Tests, stories, type declarations, `node_modules` and build output are skipped.

## Requirements and limits

- **Paraglide JS (inlang message format) projects only.** i18next projects show no usage information.
- **JavaScript, TypeScript and Svelte files.** If the project folder also contains code Fink can't analyze, such as Vue or Astro components, or messages are called dynamically (`m[key]()`), Fink can't be sure. It then shows no unused labels at all rather than wrong ones.
- **Code outside the project folder isn't scanned.** If your app code lives somewhere else, for example `project.inlang` in `packages/i18n` and the app in `apps/web`, messages can be wrongly labelled as unused. Check before deleting.
- Messages you add in your draft are never labelled unused.
- Source files over 512 KiB are skipped, and very large repositories can't be scanned.

## Removing unused messages

Fink doesn't delete unused messages for you. Open the message's ··· menu and choose **Delete message**, then push. Deleting removes the message in every language.
