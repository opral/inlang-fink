# Fink

A standalone browser editor for inlang SDK v3 projects. Open a GitHub repository, select a branch and `.inlang` project, edit messages, review the generated resources, and commit directly to that branch.

## Architecture

The React SPA runs the inlang SDK and the prototype's published message editor components in the browser. Lix stores each repository/branch/project draft in OPFS. Browser reloads restore the draft; editing needs no server database. Clearing browser storage deletes drafts. OPFS requires a supported browser and a secure origin (or localhost).

One Cloudflare Worker serves static assets, handles GitHub App OAuth, and calls GitHub's REST API. There is no git client, git proxy, Render service, or analytics. Tokens stay in encrypted HttpOnly cookies. Login uses PKCE and encrypted state; sessions expire after at most eight hours. The existing **Inlang** GitHub App is reused. Install the App on repositories you want to push to.

Commits preserve the existing Git tree and update the branch without force. Fink rejects a push if the branch changed after opening the project. Drafts remain local. Automatic conflict reconciliation is not implemented; opening the project again restores its draft rather than discarding it.

## Supported projects

- SDK v3 `baseLocale` / `locales` settings in unpacked `*.inlang/settings.json` files. No legacy SDK compatibility.
- Bundled, pinned inlang message-format and i18next plugins, including i18next namespaces. Configure one resource plugin per project. Arbitrary remote plugin code is not executed.
- Message variables, expressions, selectors, plural variants, match conditions, missing translations, and adding/deleting messages and variants through the published editor components.
- JSON resources up to 1 MiB per file; up to 100 changed resource files and 5 MiB per push. GitHub truncated repository trees are rejected.

File formatting follows the resource plugin on changed files. Untouched files are excluded from commits. Plugin configuration and locale settings are read from the repository rather than edited in Fink. The read API uses GitHub's anonymous quota until sign-in.

## Development

Use Node 22+ and the pnpm version in `package.json`.

```sh
pnpm install --frozen-lockfile
cp .dev.vars.example .dev.vars
pnpm build
pnpm dev:worker
# Optional: Vite with hot reload in a second terminal
pnpm dev
```

Configure `.dev.vars` for local GitHub sign-in; an empty secret still permits public repository reads. Local OAuth needs an App callback pointing to your local Worker. `GITHUB_CALLBACK_ORIGIN` must match that callback origin.

```sh
pnpm check
pnpm exec playwright install chromium
pnpm test:e2e
```

The browser test runs the production build through Wrangler. It edits plain and plural translations, checks OPFS reload persistence and unchanged plural matches, and verifies that only edited files are submitted. GitHub requests are mocked; it does not prove live OAuth credentials or GitHub permissions.

## Cloudflare deployment

Workers Static Assets serves the SPA. The Worker needs no paid storage service. Hosting remains subject to Cloudflare's free-plan quotas. The SDK's 81 MiB Lix engine exceeds the per-asset limit: the Vite adapter emits a roughly 19 MiB gzip asset and decompresses it in the browser before WebAssembly compilation. The build rejects an incompatible upstream loader change. SDK and Lix versions are pinned.

The Opral account is configured in the workflow. Set these **GitHub repository secrets**:

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Token with Workers Scripts edit access for the Opral account |
| `FINK_GITHUB_CLIENT_SECRET` | Existing Inlang App's OAuth client secret |
| `FINK_SESSION_SECRET` | New random secret with at least 32 characters, shared across Workers |

Add `https://fink-migration-preview.opral.workers.dev/api/auth/callback` to the existing App's callback URLs, preserving its live callback. Deploy that stable callback Worker with the same two secrets used for previews. `wrangler.jsonc` sets this origin and the `opral` Workers subdomain. PR Workers use this stable callback and relay the sealed session to the originating preview. Credentials are never sent in browser-readable JSON. Only `fink-pr-<number>.opral.workers.dev` preview origins are accepted.

The workflow builds, tests, and deploys same-repository PRs to `fink-pr-<number>.opral.workers.dev`, registers a GitHub environment URL, and deletes the Worker when the PR closes. Fork PRs run checks without receiving secrets. Merges to `main` deploy the `fink` Worker. A workflow dispatch also deploys production. Deployment fails with a setup message when required secrets are missing.

For manual deployment, authenticate Wrangler and configure Worker secrets:

```sh
pnpm exec wrangler secret put GITHUB_CLIENT_SECRET --name fink-migration-preview
pnpm exec wrangler secret put SESSION_SECRET --name fink-migration-preview
pnpm build
pnpm exec wrangler deploy --name fink-migration-preview
```

Switching `fink.inlang.com` and retiring Render are separate rollout steps after live sign-in/push validation. This workflow configures no custom-domain route.

## Extracted history

The extraction starts at `opral/inlang` commit `494db8fe8f4923ce5c5f68f6f0934d9054e288f3`. `git-filter-repo` retained 240 commits affecting historical Fink paths and moved their contents to the repository root. The destination repository's history was merged rather than replaced.

```sh
git filter-repo --force \
  --path packages/fink/ --path packages/fink2/ \
  --path inlang/packages/fink/ --path inlang/source-code/fink2/ \
  --path-rename packages/fink/: --path-rename packages/fink2/: \
  --path-rename inlang/packages/fink/: --path-rename inlang/source-code/fink2/: \
  --refs main
```

Hashes change during filtering. The extraction merge precedes the standalone implementation so the original prototype history remains inspectable.
