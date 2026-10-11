---
title: Local drafts
seoTitle: Local drafts: where Fink keeps unpushed translations
description: Fink saves your edits as a draft in your browser until you push. How drafts are stored, how long they last, and how to delete them.
order: 12
---

Fink saves every edit right away as a **local draft** in your browser, in the Origin Private File System. There is one draft per repository, branch and project. Nothing reaches GitHub until you push.

- **Reloads and restarts are safe.** Open the project again and the draft is still there. The header shows "Draft saved locally".
- **Drafts stay in one browser.** They don't sync between devices or browsers. Push to share your work.
- **Clearing site data deletes drafts.** So does a private window when it closes.
- **Recent projects** on the Fink home page lists your drafts with their number of unpushed changes.
- **Cleanup:** drafts without unpushed changes are deleted after 30 days without use, or when their branch no longer exists.
- **Delete a draft** under **Settings → Local drafts**.

When you open a draft again, Fink first merges the latest changes from GitHub into it. See [When the branch changed](/docs/push#when-the-branch-changed).

**Download project** in the Fink menu saves the draft as a `.lix` file, a snapshot of the draft's database. It is not an export of your translation files.
