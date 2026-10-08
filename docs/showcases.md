# Finding community showcases

Reviewed on 2026-10-07 using GitHub's code search, repository metadata, contributor endpoint, default-branch commit history, and actual settings/resource files. Discovery is a sample of indexed results, not a complete inventory of inlang users. Search can lag repository changes.

| Project | Stars | GitHub contributors | Commits in last 30 days | Locales | Project |
| --- | ---: | ---: | ---: | ---: | --- |
| [Pocket ID](https://github.com/pocket-id/pocket-id) | 9,421 | 104 | 82 | 26 | [frontend/project.inlang](https://github.com/pocket-id/pocket-id/blob/main/frontend/project.inlang/settings.json) |
| [Clash Nyanpasu](https://github.com/libnyanpasu/clash-nyanpasu) | 13,219 | 60 | 100+ | 5 | [frontend/nyanpasu/project.inlang](https://github.com/libnyanpasu/clash-nyanpasu/blob/main/frontend/nyanpasu/project.inlang/settings.json) |
| [Arcane](https://github.com/getarcaneapp/arcane) | 7,759 | 89 | 100+ | 23 | [frontend/project.inlang](https://github.com/getarcaneapp/arcane/blob/main/frontend/project.inlang/settings.json) |
| [UpSnap](https://github.com/seriousm4x/UpSnap) | 6,332 | 41 | 14 | 23 | [frontend/project.inlang](https://github.com/seriousm4x/UpSnap/blob/master/frontend/project.inlang/settings.json) |
| [JetKVM](https://github.com/jetkvm/kvm) | 5,223 | 68 | 79 | 15 | [ui/localization/jetKVM.UI.inlang](https://github.com/jetkvm/kvm/blob/dev/ui/localization/jetKVM.UI.inlang/settings.json) |
| [TanStack Router](https://github.com/TanStack/router) | 15,156 | 463 | 100+ | 2 | [React integration example](https://github.com/TanStack/router/blob/main/examples/react/i18n-paraglide/project.inlang/settings.json) |

Contributor counts are GitHub's reported repository-wide counts and can include bots. They are not counts of translators. Activity is the first 100 commits on the default branch since 2026-09-07 UTC; 100+ means the sample reached its cap. Recent human author counts in these samples were 7, 4, 3, 3, 3, and 10 respectively. These counts help distinguish activity from stars, but are not a census of recent contributors.

All six chosen projects have `baseLocale`, `locales`, and a supported message-format resource pattern. Their base-locale files exist and are valid JSON. TanStack is labeled as an integration example; it does not represent a translated TanStack product. Project paths and counts live in `src/showcaseList.ts`, bundled into the SPA rather than fetched on every visit.

AppFlowy (77,169 stars / 363 contributors) is a strong community lead, but its [current settings](https://github.com/AppFlowy-IO/AppFlowy/blob/main/project.inlang/settings.json) use `sourceLanguageTag` / `languageTags`. Scanopy and AdminJS also have legacy settings. They are excluded from the clickable SDK v3 showcases. Documenso and OpenStatus are active projects, but their default-branch trees did not contain a matching `.inlang/settings.json`; they are not included based on reputation alone.

## Repeat discovery with gh

`gh search code` uses GitHub's legacy code-search API. It does not support the new website's regex search or shell-style `*.inlang` path matching. Search file contents, then filter returned paths:

```sh
gh search code inlang --filename settings.json --limit 100 \
  --json repository,path,url \
  --jq '.[] | select(.repository.isFork == false) | select(.path | test("\\.inlang/settings\\.json$")) | [.repository.nameWithOwner, .path, .url] | @tsv'

# Narrow to a supported resource plugin
gh search code '"plugin.inlang.messageFormat"' \
  --filename settings.json --limit 100 --json repository,path,url

# Verify within a promising repository
gh search code inlang --filename settings.json \
  --repo pocket-id/pocket-id --json path,url
```

Code search is for discovery. Verify the current default branch through the tree API, which also finds custom project names:

```sh
repo=pocket-id/pocket-id
branch=$(gh api "repos/$repo" --jq .default_branch)
gh api "repos/$repo/git/trees/$branch?recursive=1" \
  --jq '.tree[] | select(.path | test("\\.inlang/settings\\.json$")) | .path'

# Stars, forks, archive state, and last push
gh api "repos/$repo" \
  --jq '{name: .full_name, stars: .stargazers_count, forks: .forks_count, archived, pushed_at, default_branch}'

# Contributors, including their contribution totals
gh api --paginate "repos/$repo/contributors?per_page=100" \
  --jq '.[] | [.login, .contributions] | @tsv'

# Actual recent default-branch commits; choose a rolling cutoff date
gh api --paginate "repos/$repo/commits?since=2026-09-07T00:00:00Z&per_page=100" \
  --jq '.[] | [.commit.author.date, (.author.login // .commit.author.name), .sha] | @tsv'

# Recent community PRs
gh search prs --repo "$repo" --created '>=2026-09-07' --limit 100 \
  --json number,title,author,createdAt,state

# Read the settings and check plugin/locale compatibility
gh api "repos/$repo/contents/frontend/project.inlang/settings.json?ref=$branch" \
  --jq .content | base64 --decode
```

The tree API signals `truncated: true` for oversized trees; do not treat a truncated result as proof that no project exists. A repository push can be to a feature branch or caused by a bot, so inspect commits and PR authors before describing a community as active. For a large-community shortlist, start with 1,000+ stars, 30+ contributors, recent human activity, and a real application translation catalog. Then verify Fink can import its resources.

For the newer search engine, use the GitHub website with `path:/\.inlang\/settings\.json$/`. See the [GitHub CLI documentation](https://cli.github.com/manual/gh_search_code) for the distinction between CLI and website search.
