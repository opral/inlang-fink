# Deploying Fink

Maintainer notes: how Fink is deployed to Cloudflare, how secrets are managed and how the repository was extracted from `opral/inlang`.

## Cloudflare deployment

Workers Static Assets serves the SPA. The Worker needs no paid storage service. Hosting remains subject to Cloudflare's free-plan quotas. The SDK's 81 MiB Lix engine exceeds the per-asset limit: the Vite adapter emits a roughly 19 MiB gzip asset and decompresses it in the browser before WebAssembly compilation. The build rejects an incompatible upstream loader change. SDK and Lix versions are pinned.

Deployment credentials come from **Infisical**, using GitHub Actions OIDC. No long-lived Infisical credential is stored in GitHub. Create a Fink folder in your Infisical project containing:

| Infisical secret | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Token with Workers Scripts edit access for the Opral account |
| `GITHUB_CLIENT_SECRET` | Existing Inlang App's OAuth client secret |
| `SESSION_SECRET` | Random secret with at least 32 characters, shared across Workers |
| `GITHUB_CLIENT_ID` (optional) | Override the public Inlang App client ID in `wrangler.jsonc` |

Create separate Infisical OIDC identities for preview and production, with read access to this folder. Use issuer `https://token.actions.githubusercontent.com`, audience `https://github.com/opral`, and bind the `repository` claim to `opral/inlang-fink`. Bind `sub` to `repo:opral/inlang-fink:environment:preview` or `repo:opral/inlang-fink:environment:production`, respectively.

Set these **GitHub repository variables**:

| Variable | Value |
| --- | --- |
| `INFISICAL_PROJECT_SLUG` | Infisical project slug |
| `INFISICAL_PREVIEW_IDENTITY_ID` | Preview OIDC identity UUID |
| `INFISICAL_PRODUCTION_IDENTITY_ID` | Production OIDC identity UUID |
| `INFISICAL_ENVIRONMENT` (optional) | Secret environment slug; defaults to `prod` |
| `INFISICAL_SECRET_PATH` (optional) | Secret folder; defaults to `/fink` |
| `INFISICAL_DOMAIN` (optional) | Infisical origin; defaults to `https://app.infisical.com` |

The deploy script supplies only the GitHub client secret and session secret to Worker bindings through a private temporary file, then deletes the file. The Cloudflare API token is used only to authorize deployment. CI fetches secrets after building and testing the SPA.

The existing App needs these callback URLs, next to its live (Render) callback:

- `https://fink-migration-preview.opral.workers.dev/api/auth/callback`: the stable callback Worker, set as `GITHUB_CALLBACK_ORIGIN` in `wrangler.jsonc`. Login on any workers.dev origin (`fink.opral.workers.dev`, PR previews) goes through it. It relays the sealed session to the origin that started the login. Credentials are never sent in browser-readable JSON. Only `fink.inlang.com`, `fink.opral.workers.dev`, `fink-pr-<number>.opral.workers.dev` and the `GITHUB_CALLBACK_ORIGIN` origin itself (e.g. `http://localhost:8787` locally) are accepted. Keep the `fink-migration-preview` Worker: workers.dev logins and PR previews depend on it.
- `https://fink.inlang.com/api/auth/callback`: login on `fink.inlang.com` completes on that domain. Add it before DNS points at the Worker.

Every Worker shares `SESSION_SECRET`, so a session sealed by the callback Worker opens on the others.

The workflow builds, tests, and deploys same-repository PRs to `fink-pr-<number>.opral.workers.dev`, registers a GitHub environment URL, and deletes the Worker when the PR closes. Fork PRs run checks without receiving secrets. Merges to `main` deploy both the `fink` Worker and the stable callback Worker. A workflow dispatch also deploys production. Deployment fails with a setup message when required secrets are missing. This repository is configured to read the Inlang project (`inlang-mzyi`), production environment, `/fink` folder.

For manual deployment, sign in to Infisical and inject the same folder's secrets (replace the project ID, environment and path with your configured values):

```sh
infisical login
infisical run --projectId <project-id> --env prod --path /fink -- pnpm deploy:preview
```

`pnpm deploy:preview` updates the stable preview Worker. `pnpm deploy:production` updates both production and the stable callback Worker. Both commands require Infisical's three deployment secrets in the environment and build before deploying.

Switching `fink.inlang.com` and retiring Render are separate rollout steps after live sign-in/push validation. `wrangler.jsonc` attaches no route or custom domain, and a test keeps it that way: every Worker deploys with it, and Wrangler in CI replaces existing domains and DNS records without asking. To switch, add the `fink.inlang.com` callback URL above, delete the `fink` CNAME to Render in the `inlang.com` zone, and add `fink.inlang.com` as a Custom Domain of the `fink` Worker (Workers & Pages → fink → Settings → Domains & Routes). Do the last two steps back to back: resolvers that look the name up in between can cache "no such name" for up to 30 minutes (the zone's negative-cache TTL). Deploys leave Custom Domains that the config doesn't declare in place. Afterwards, remove `fink.inlang.com` from the Render service. To declare it in code instead, pass `--domain fink.inlang.com` in `scripts/deploy.mjs` for the `fink` target only.

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
