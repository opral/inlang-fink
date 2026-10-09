// Which repository files the usage analysis gets. Shared by the Worker (which extracts them from
// the repository archive) and the app (which hands them to the inlang SDK).

/** Code the m-function matcher analyzes. */
const CODE = /\.(?:svelte|vue|astro|[cm]?[jt]sx?)$/i;
/** Markup that can call messages (MDX, mdsvex, templates): the analysis reports it as unsupported, so it is incomplete instead of blind. */
const MARKUP = /\.(?:mdx|svx|md|html?)$/i;
/** Directories that hold app source: a `build` or `dist` folder inside them is source too. */
const SOURCE_DIRECTORIES = new Set(["src", "app", "lib", "routes", "pages", "components", "features", "views"]);
/** Dependencies and framework output, wherever they are. */
const ALWAYS_GENERATED = new Set(["node_modules", ".svelte-kit", ".next", ".nuxt", ".output", ".vercel", ".turbo", "coverage"]);
/** Build output roots: generated unless inside a source directory (`src/features/build/Page.tsx`). */
const OUTPUT = new Set(["dist", "build", "out"]);
/** What Paraglide's compiler writes into its output directory (v1 and v2). */
const PARAGLIDE_OUTPUT = /^(?:runtime|server|registry|messages)(?:\.[cm]?[jt]s|\.d\.[cm]?ts)?$|^\.gitignore$|^\.prettierignore$|^README\.md$/;

/** True for dependencies, build output and Paraglide's generated files, not for app source in folders with those names. */
export function isGeneratedPath(path: string): boolean {
  const parts = path.split("/");
  return parts.some((part, index) => {
    if (ALWAYS_GENERATED.has(part)) return true;
    if (OUTPUT.has(part) && index < parts.length - 1) return !parts.slice(0, index).some(parent => SOURCE_DIRECTORIES.has(parent));
    // only the compiler's own files: `src/features/paraglide/Page.tsx` is app source
    if (part === "paraglide" && index < parts.length - 1) return PARAGLIDE_OUTPUT.test(parts[index + 1]!);
    return false;
  });
}

/** A file whose type can call messages: code, or markup such as MDX that the analysis can't read yet. */
export const mayCallMessages = (path: string) => (CODE.test(path) || MARKUP.test(path)) && !/\.d\.[cm]?ts$/i.test(path);
/** Markup only matters when it mentions messages; a README without `m.` can't call any. */
export const isMarkup = (path: string) => MARKUP.test(path);
export const mentionsMessages = (content: string) => /paraglide|\bm\s*(?:\.\s*[A-Za-z_$]|\[)/.test(content);
