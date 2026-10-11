---
title: Privacy and telemetry
seoTitle: Fink privacy and telemetry
description: What data Fink sees and stores, where your GitHub token lives, and exactly which anonymous usage events Fink sends.
order: 13
---

## Your translations

- Drafts live in your browser until you push. See [Local drafts](/docs/drafts).
- Fink's server is a Cloudflare Worker that talks to GitHub for you. Translation files, pushed changes and, for [unused messages](/docs/unused-messages), your repository's source code pass through it on the way to and from GitHub. The Worker has no database and stores none of it.
- Pushed changes go only to your GitHub repository.

## Your GitHub sign-in

- Sign-in uses the Inlang GitHub App with OAuth and PKCE.
- Your GitHub token is encrypted inside an HttpOnly cookie. JavaScript on the page can't read it.
- Sessions end after at most 8 hours. Sign out in the account menu.
- Fink can push only to repositories where you have write access and the Inlang GitHub App is installed.

## Telemetry

On fink.inlang.com, Fink sends four anonymous events to PostHog (US) to count usage:

| Event | When | Properties |
|---|---|---|
| `app:session_start` | Fink opens | whether you're signed in |
| `project:project_view` | a project finishes loading | a hashed project ID, number of messages, languages and recent committers |
| `changes:commit_create` | a push succeeds | number of messages and languages |
| `cloud:interest_button_click` | you open machine translation or its request form | which step |

Fink never sends message text, keys, file names or repository names. Signed-in users are counted by a hashed GitHub login. URLs are cut to the page path. There is no autocapture, page view tracking or session recording. Events go through Fink's own domain, and PostHog receives your IP address as with any web request. PostHog also records standard browser and device properties.

Other services the page loads: GitHub avatars and GitHub's API for the star count. Fonts are served by Fink itself.
