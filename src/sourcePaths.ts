// Which repository files the usage analysis gets. Shared by the Worker (which extracts them from
// the repository archive) and the app (which hands them to the inlang SDK).
//
// A file left out that calls messages makes its messages look unused, so every filter here errs
// on the side of including a file: the analysis reports what it can't read, and the result is
// incomplete instead of wrong.

/** Code: JavaScript, TypeScript and components. */
const CODE = /\.(?:svelte|vue|astro|[cm]?[jt]sx?)$/i;
/** Markup that can call messages (MDX, mdsvex, Markdown compiled as MDX, templates). */
const MARKUP = /\.(?:mdx|svx|md|html?)$/i;
/** Directories that hold app source: a `build` or `dist` folder inside them is source too. */
const SOURCE_DIRECTORIES = new Set(["src", "app", "lib", "routes", "pages", "components", "features", "views"]);
/** Directories of routes: a `test` folder inside them is a page, not tests. */
const ROUTE_DIRECTORIES = new Set(["app", "pages", "routes"]);
/** Dependencies and framework output, wherever they are. */
const ALWAYS_GENERATED = new Set(["node_modules", ".svelte-kit", ".next", ".nuxt", ".output", ".vercel", ".turbo", "coverage"]);
/** Build output roots: generated unless inside a source directory (`src/features/build/Page.tsx`). */
const OUTPUT = new Set(["dist", "build", "out"]);
/** What Paraglide's compiler writes into its output directory (v1 and v2). */
const PARAGLIDE_OUTPUT = /^(?:runtime|server|registry|messages)(?:\.[cm]?[jt]s|\.d\.[cm]?ts)?$|^\.gitignore$|^\.prettierignore$|^README\.md$/;
/** Test folders, unless they are a route (`app/test/page.tsx`). */
const TEST_DIRECTORIES = new Set(["__tests__", "__mocks__", "tests", "test", "e2e", "cypress", "playwright"]);

/** True for dependencies, build output, minified bundles and Paraglide's generated files, not for app source in folders with those names. */
export function isGeneratedPath(path: string): boolean {
  const parts = path.split("/");
  if (/\.min\.[cm]?js$/i.test(parts.at(-1)!)) return true;
  return parts.some((part, index) => {
    if (ALWAYS_GENERATED.has(part)) return true;
    if (OUTPUT.has(part) && index < parts.length - 1) return !parts.slice(0, index).some(parent => SOURCE_DIRECTORIES.has(parent));
    // only the compiler's own files: `src/features/paraglide/Page.tsx` is app source
    if (part === "paraglide" && index < parts.length - 1) return PARAGLIDE_OUTPUT.test(parts[index + 1]!);
    return false;
  });
}

/** Tests, mocks and stories: messages called only there are unused in the app. */
export function isTestPath(path: string): boolean {
  const parts = path.split("/");
  if (/\.(test|spec|stories)\.[^/]+$/.test(parts.at(-1)!)) return true;
  return parts.slice(0, -1).some((part, index) => (part === "__tests__" || part === "__mocks__") || (TEST_DIRECTORIES.has(part) && !parts.slice(0, index).some(parent => ROUTE_DIRECTORIES.has(parent))));
}

/** A file whose type can call messages: code, or markup such as MDX. Type declarations can't call them. */
export const mayCallMessages = (path: string) => (CODE.test(path) || MARKUP.test(path)) && !/\.d\.[cm]?ts$/i.test(path);

/** Markdown code blocks and spans are examples, not code that runs. */
const withoutMarkdownCode = (content: string) => content.replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^ {0,3}\1[`~]*[ \t]*$|(?![\s\S]))/gm, "").replace(/`[^`\n]+`/g, "");
const MARKDOWN = /\.(?:mdx|svx|md)$/i;

/**
 * How a format's usage analysis reads the source. `analyzes`: files that always go to the analysis
 * (it reads them, or reports them as unsupported). `mentions`: how any other file that may call
 * messages shows that it does; such files go to the analysis too, which reports them as unsupported.
 */
export type UsageSource = { analyzes: RegExp; mentions: RegExp };

/** The format plugins whose usage analysis Fink runs, by settings key. Formats without one have no usage information. */
export const USAGE_SOURCES: Record<string, UsageSource> = {
  // Paraglide JS: the m-function matcher reads JavaScript, TypeScript and Svelte. Vue and Astro
  // components are always included, so the analysis is incomplete rather than blind to them.
  "plugin.inlang.messageFormat": { analyzes: CODE, mentions: /paraglide|\bm\s*(?:\.\s*[A-Za-z_$]|\[)/ },
  // next-intl: the plugin's own analysis reads JavaScript, TypeScript and MDX. Other files can only
  // call next-intl through an import of it or one of its functions; a README that names next-intl can't.
  "plugin.inlang.nextIntl": { analyzes: /\.(?:[cm]?[jt]sx?|mdx)$/i, mentions: /\bfrom\s*["']next-intl\b|\b(?:require|import)\s*\(\s*["']next-intl\b|\b(?:useTranslations|getTranslations|createTranslator|useMessages|getMessages|useExtracted|getExtracted)\b/ },
};

/** The settings key of the project's format plugin that has a usage analysis, if any. */
export const usagePlugin = (settings: Record<string, unknown>): string | undefined => Object.keys(USAGE_SOURCES).find(key => key in settings);

/** Whether a file that passed the path filters goes to `source`'s analysis. */
export function analyzedFile(source: UsageSource, path: string, content: string): boolean {
  if (source.analyzes.test(path)) return true;
  return source.mentions.test(MARKDOWN.test(path) ? withoutMarkdownCode(content) : content);
}
