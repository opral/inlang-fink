# Fink

**The translation editor for your GitHub repo.**

Fink is a free, open source editor for the translation files in a GitHub repository. Open a repo in your browser, edit every language of a message side by side, check your work, and commit the changes straight to your branch. Your repository stays the only copy of your translations: nothing to import, export or sync.

**[fink.inlang.com](https://fink.inlang.com)** · [Documentation](https://fink.inlang.com/docs) · [For teams](https://fink.inlang.com/teams) · [Compared with Crowdin, Lokalise, Weblate and Tolgee](https://fink.inlang.com/compare)

## Features

- **Every language side by side.** One message with all its translations, plural forms and selects. No switching between `en.json` and `de.json`.
- **Checks before you push.** Missing and empty translations, missing or unknown variables and missing plural forms, with one-click fixes.
- **Unused messages.** Find messages that nothing in your code uses (Paraglide JS and next-intl).
- **Commits only what you changed.** Fink writes to your branch and leaves the rest of each file byte for byte as it was. It never force-pushes.
- **Local drafts.** Unpushed work is kept in your browser, and Fink merges remote changes into your draft if the branch moved.
- **No account of its own.** Sign in with GitHub. Fink can push only where you have write access and the Inlang GitHub App is installed.

## Supported formats

| Format | Used by |
| --- | --- |
| i18next JSON | i18next, react-i18next, next-i18next |
| next-intl | next-intl (`messages/{locale}.json`) |
| inlang message format | Paraglide JS |

A repository needs a `project.inlang` folder that tells Fink which format it uses. See [Set up a project](https://fink.inlang.com/docs/set-up-a-project) (for Paraglide JS: `npx @inlang/paraglide-js init`) and [Supported formats](https://fink.inlang.com/docs/formats) for details and limits.

## Get started

1. Go to [fink.inlang.com](https://fink.inlang.com) and paste a GitHub repository URL.
2. Pick a branch and project, then edit the messages.
3. Review the changes and push.

The [getting started guide](https://fink.inlang.com/docs/getting-started) walks through it. Not sure where to start? [Community projects](https://fink.inlang.com/) lists repositories that use Fink.

## Privacy

Drafts stay in your browser until you push. Fink's server only forwards requests to GitHub and stores nothing. Fink counts usage with a few anonymous events and never sends message texts, keys or file names. See [Privacy and telemetry](https://fink.inlang.com/docs/privacy).

## Contributing

Fink is part of [inlang](https://inlang.com). Issues and pull requests are welcome. You need Node 22+ and the pnpm version in `package.json`.

```sh
pnpm install --frozen-lockfile
cp .dev.vars.example .dev.vars
pnpm build
pnpm dev:worker
```

An empty secret in `.dev.vars` still allows reading public repositories. Run `pnpm check` for typecheck, unit tests and build, and `pnpm test:e2e` for the browser test. Maintainers: see [deployment notes](docs/deployment.md).

## License

[MIT](./LICENSE)
