---
title: Editing translations
seoTitle: Editing translations in Fink: side by side, search and filters
description: How to edit messages in Fink: pick the languages you translate from and into, search, filter what's missing, insert variables, add and delete messages.
order: 4
---

Fink shows one card per message. The top row is the language you translate **from**, usually the [reference locale](/docs/reference-locale). Below it are the languages you translate **into**. Every row is editable.

## Choose languages

Open the language menu in the toolbar:

- **From** is the language you read. It defaults to the project's [reference locale](/docs/reference-locale).
- **Translate into** lists every language with how much work is open. Pick one or several.
- **Review all languages** shows every language of each message at once.

Fink remembers your choice per project in this browser.

## Find messages

- **Search messages and keys** matches message keys, text and variable names. Every word you type must match.
- **All / To do / Edited** filters the list. **To do** shows only messages with open work in your selected languages, split into **Missing translation**, **Missing forms**, **Empty forms** and **Placeholder problems**. See [Checks](/docs/checks).
- The list shows 25 messages per page.

## Edit text

Click a translation and type. Changes are saved to your [local draft](/docs/drafts) after a short pause.

- **Variables**: type `{` to insert a variable. Fink suggests the variables the reference uses first.
- **Missing translation**: choose **Translate to …** to start empty, or **Start from English** (or your source language) to copy the source and overwrite it. Words still in the source language are underlined until you change them.
- **Markup** such as links or bold text comes from the reference message and can be inserted from the suggestions.
- **Undo and redo** work with ⌘Z / Ctrl+Z and ⇧⌘Z / Ctrl+Y for edits made in this session.

## Add and delete messages

- **Add message** asks for a new message key and puts the cursor in its reference text. Then fill in the translations.
- **Delete message** in a card's ··· menu deletes the message in every language.
- Renaming a key isn't supported yet. Add a new message and delete the old one, and update your code.

## Project settings

The **Settings** tab edits the reference locale, the list of languages and experimental flags. Adding a language creates its file on push. Plugin settings and paths stay as they are in the repository.

## What Fink doesn't do

Fink has no translation memory, glossary, screenshots, comments or in-context editing. Machine translation is not available yet: the **Machine translate** button only lets you request access.
