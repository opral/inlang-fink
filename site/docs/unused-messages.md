---
title: Unused messages
seoTitle: Find unused translation keys with Fink (Paraglide JS, next-intl)
description: Fink finds messages that your code never calls and labels them Not used in code. How detection works, its limits, and when it is switched off.
order: 8
---

In Paraglide JS and next-intl projects, Fink labels messages that your code never calls as **Not used in code**. Each used message shows where it is called, with a link to the line on GitHub.

## How it works

When you open a project, Fink downloads the repository's source code at the commit your draft is based on and finds the calls of each message, such as `m.greeting()` in Paraglide JS or `t("greeting")` in next-intl. The analysis comes from the format's inlang plugin.

Fink scans the package that contains your project: the nearest folder with a `package.json` at or above the project and its translation files, or the whole repository if there is none. Tests, stories, type declarations, `node_modules`, build output and minified files are skipped. Code that imports next-intl, or imports from a `paraglide` folder, in other packages of the repository is analyzed too when the packages are related in their `package.json` files (one uses the other) or it sits above your package. In any other package it makes the result incomplete, unless that package has its own inlang project.

If Fink can't be sure about every call, it labels no message unused rather than a wrong one. The project bar then shows **Usage in code incomplete**. Click it to see each call or file Fink couldn't analyze, with a link to it on GitHub. Usages it found are still shown.

## Paraglide JS

- **JavaScript, TypeScript and Svelte files** are analyzed. Vue and Astro components make the result incomplete, and so do Markdown, MDX or HTML files that mention messages: Fink can't analyze them.
- **Dynamic calls** such as `m[key]()`, and `m` passed on or re-exported, make the result incomplete.

## next-intl

- **JavaScript, TypeScript and MDX files** are analyzed. Markdown or other files that import next-intl or name one of its functions, such as `useTranslations`, outside code blocks make the result incomplete: Fink can't analyze them. A README that only names next-intl doesn't.
- Fink resolves `useTranslations("Home")` and `await getTranslations("Home")` followed by `t("title")`, `t.rich("title")` or `t.markup("title")` to `Home.title`. It also resolves `t("Home.title")` without a namespace, nested namespaces, `createTranslator`, keys from constants, and arrays of keys:

  ```tsx
  const t = useTranslations("Home");
  ["title", "subtitle"].map(key => <p key={key}>{t(key)}</p>);
  ```

- Passing all messages to `NextIntlClientProvider` or returning them from `getRequestConfig` is not a usage.

These make the result incomplete:

- **Dynamic keys and namespaces,** such as ``t(`items.${id}`)``, `t(key)` or `useTranslations(namespace)`.
- **A `t` passed on:** to a function or component, returned from a hook, exported or stored.
- **Wrappers:** next-intl functions imported under their own names from your own module or package, such as `import { useTranslations } from "@repo/i18n"`, re-exports, and wrappers in other packages of the repository.
- **`t.raw()` and `t.has()` on a namespace,** such as `t.raw("links")` for an array or object of messages.
- **Messages read directly:** `useMessages()` or `getMessages()` other than for `NextIntlClientProvider`, an imported message file, or globbed catalogs such as `import.meta.glob`.
- **Message files nested under another key** than their namespace, such as `messages: { Legacy: en }`.
- **Key types,** such as `MessageKeys`, `keyof Messages` or `Parameters<typeof t>`. Typing next-intl itself (`Messages: typeof messages`) is fine.
- **`useExtracted()` and `getExtracted()`,** and files the plugin can't parse.

A wrapper with another name from a package that isn't in the repository, such as `useT` from a shared npm package, can't be detected. Its messages can be labelled unused. Check before deleting.

## i18next

Fink can't analyze i18next calls yet. i18next projects show no usages and no unused messages, and the project bar says **Usage in code unavailable**.

## Limits

- **In other packages,** only files that import next-intl or from a `paraglide` folder are analyzed. If no message is called in the analyzed code at all, the result is incomplete.
- Messages you add in your draft are never labelled unused.
- Source files over 512 KB aren't analyzed. If one of them mentions messages, the result is incomplete. Very large repositories can't be scanned.

## Removing unused messages

Fink doesn't delete unused messages for you. Open the message's ··· menu and choose **Delete message**, then push. Deleting removes the message in every language.
