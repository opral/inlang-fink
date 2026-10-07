import { openProject, selectBundleNested, type InlangProject, type InlangPlugin, type ProjectSettings, type BundleNested } from "@inlang/sdk/browser";
import { openLix } from "@lix-js/sdk";
import { OpfsStorage } from "@lix-js/storage-opfs";
import i18next from "@inlang/plugin-i18next";
import messageFormat from "@inlang/plugin-message-format";
import { api, outputPath, repoQuery, resolveResourcePath, type RepoContext, type Repo, type RepoTree } from "./repository";

import { settingsSignature } from "./settingsData";

const supported: InlangPlugin<any>[] = [i18next, messageFormat];
export type LocalProject = { project: InlangProject; context: RepoContext; close: () => Promise<void> };
export function pluginsFor(settings: ProjectSettings): InlangPlugin<any>[] {
  if (!settings.baseLocale || !Array.isArray(settings.locales) || !settings.locales.includes(settings.baseLocale)) throw new Error("This editor requires SDK v3 settings with baseLocale and locales.");
  const keys = Object.keys(settings).filter(key => key.startsWith("plugin.") && (settings[key] as { pathPattern?: unknown })?.pathPattern);
  const plugins = supported.filter(plugin => keys.includes(plugin.key));
  const unsupported = keys.filter(key => !plugins.some(plugin => plugin.key === key));
  if (unsupported.length) throw new Error(`Unsupported resource plugins: ${unsupported.join(", ")}. Supported: i18next and inlang message format.`);
  if (plugins.length !== 1) throw new Error("Configure exactly one resource plugin (i18next or inlang message format) per project to avoid ambiguous message ownership.");
  return plugins;
}
export const METADATA = "/fink-context.json";
export async function openRepositoryProject(repo: Repo, tree: RepoTree, projectPath: string, progress: (message: string) => void = () => {}): Promise<LocalProject> {
  const key = [repo.owner.toLowerCase(), repo.name.toLowerCase(), tree.branch, projectPath].join("/");
  const name = `fink-v3-${Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key)))).map(x => x.toString(16).padStart(2, "0")).join("")}`;
  progress("Opening local project…");
  const lix = await openLix({ storage: new OpfsStorage({ name }) });
  let project: InlangProject | undefined;
  try {
    const stored = await lix.execute<{ content: Uint8Array }>("SELECT content FROM lix_file WHERE path = $1", [METADATA]);
    if (stored.rows[0]) {
      progress("Restoring saved draft…");
      const context: RepoContext = JSON.parse(new TextDecoder().decode(stored.rows[0].content));
      project = await openProject({ lix, providePlugins: pluginsFor(context.settings) });
      return { project, context, close: async () => { await project!.close(); await lix.close(); } };
    }
    const readFile = async (path: string) => (await api<{ content: string }>(`github/file?${repoQuery({ ...repo, branch: tree.head })}&path=${encodeURIComponent(path)}`)).content;
    progress("Reading project settings…");
    const rawSettings = await readFile(`${projectPath}/settings.json`);
    const settings: ProjectSettings = JSON.parse(rawSettings);
    const plugins = pluginsFor(settings);
    // Plugins are bundled and pinned, never evaluated from an untrusted repository.
    project = await openProject({ lix, settings: { ...settings, modules: [] }, providePlugins: plugins });
    // Metadata is the completed-import marker. Reset incomplete imports before retrying.
    await project.db.transaction().execute(async tx => {
      await tx.deleteFrom("variant").execute();
      await tx.deleteFrom("message").execute();
      await tx.deleteFrom("bundle").execute();
    });
    const context: RepoContext = { ...repo, branch: tree.branch, projectPath, head: tree.head, tree: tree.tree, settings, original: { [`${projectPath}/settings.json`]: rawSettings }, baseline: {} };
    for (const plugin of plugins) {
      const plans = await plugin.toBeImportedFiles!({ settings });
      const available = plans.filter(plan => tree.paths.includes(resolveResourcePath(projectPath, plan.path)));
      const files = new Array<{ locale: string; content: Uint8Array; toBeImportedFilesMetadata: (typeof available)[number]["metadata"] }>(available.length);
      // Keep requests bounded while avoiding one network round-trip per language.
      let nextFile = 0, downloaded = 0;
      progress(`Downloading language files · 0/${available.length}`);
      await Promise.all(Array.from({ length: Math.min(4, available.length) }, async () => {
        for (;;) {
          const index = nextFile++;
          if (index >= available.length) return;
          const plan = available[index]!;
          const path = resolveResourcePath(projectPath, plan.path);
          const content = await readFile(path);
          context.original[path] = content;
          progress(`Downloading language files · ${++downloaded}/${available.length}`);
          files[index] = { locale: plan.locale, content: new TextEncoder().encode(content), toBeImportedFilesMetadata: plan.metadata };
        }
      }));
      progress(`Importing ${files.length} language files…`);
      await project.importFiles({ pluginKey: plugin.key, files });
    }
    progress("Preparing editor…");
    context.baseline = await exportResources({ project, context });
    context.bundleBaseline = bundleSignatures(await readBundles(project));
    await saveContext({ project, context });
    return { project, context, close: async () => { await project!.close(); await lix.close(); } };
  } catch (error) { if (project) await project.close(); await lix.close(); throw error; }
}
export async function saveContext(local: Pick<LocalProject, "project" | "context">) {
  const bytes = new TextEncoder().encode(JSON.stringify(local.context));
  await local.project.lix.execute("INSERT INTO lix_file (path, content) VALUES ($1, $2) ON CONFLICT(path) DO UPDATE SET content = excluded.content", [METADATA, bytes]);
}
export async function readBundles(project: InlangProject): Promise<BundleNested[]> { return selectBundleNested(project.db).execute(); }
/** Reload only the edited bundle, preserving all other editor object identities. */
export async function readBundle(project: InlangProject, id: string): Promise<BundleNested | undefined> {
  return selectBundleNested(project.db).where("bundle.id", "=", id).executeTakeFirst();
}
/** Compare editable content, excluding IDs regenerated by resource imports. */
export function bundleSignature(bundle: BundleNested): string {
  return JSON.stringify({ declarations: bundle.declarations, messages: bundle.messages.map(message => ({
    locale: message.locale, selectors: message.selectors,
    variants: message.variants.map(variant => ({ matches: variant.matches, pattern: variant.pattern })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  })).sort((a, b) => a.locale.localeCompare(b.locale)) });
}
export function bundleSignatures(bundles: BundleNested[]): Record<string, string> {
  return Object.fromEntries(bundles.map(bundle => [bundle.id, bundleSignature(bundle)]));
}
/** Upgrade old persisted drafts without replacing their edited OPFS database. */
export async function getBaselineSignatures(local: LocalProject): Promise<Record<string, string>> {
  if (local.context.bundleBaseline) return local.context.bundleBaseline;
  const lix = await openLix();
  let baseline: InlangProject | undefined;
  try {
    const settings = local.context.settings;
    const plugins = pluginsFor(settings);
    baseline = await openProject({ lix, settings: { ...settings, modules: [] }, providePlugins: plugins });
    for (const plugin of plugins) {
      const plans = await plugin.toBeImportedFiles!({ settings });
      const files = plans.flatMap(plan => {
        const content = local.context.baseline[resolveResourcePath(local.context.projectPath, plan.path)];
        return content === undefined ? [] : [{ locale: plan.locale, content: new TextEncoder().encode(content), toBeImportedFilesMetadata: plan.metadata }];
      });
      await baseline.importFiles({ pluginKey: plugin.key, files });
    }
    local.context.bundleBaseline = bundleSignatures(await readBundles(baseline));
    await saveContext(local);
    return local.context.bundleBaseline;
  } finally { if (baseline) await baseline.close(); await lix.close(); }
}
export async function exportResources(local: Pick<LocalProject, "project" | "context">): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const path of Object.keys(local.context.original)) {
    if (!path.endsWith(".inlang/settings.json")) files[path] = "{}";
  }
  for (const plugin of pluginsFor(local.context.settings)) {
    for (const file of await local.project.exportFiles({ pluginKey: plugin.key })) {
      const path = resolveResourcePath(local.context.projectPath, outputPath(local.context.settings, plugin.key, file));
      const content = new TextDecoder().decode(file.content);
      if (files[path] !== undefined && files[path] !== "{}") throw new Error(`Multiple outputs target ${path}.`);
      files[path] = content;
    }
  }
  return files;
}
export function settingsChanges(local: Pick<LocalProject, "context">) {
  const before: ProjectSettings = JSON.parse(local.context.original[`${local.context.projectPath}/settings.json`]!);
  return settingsSignature(before) === settingsSignature(local.context.settings) ? undefined : { before, after: structuredClone(local.context.settings) };
}
export async function preparePush(local: LocalProject): Promise<{ files: Record<string, string>; resources: Record<string, string> }> {
  const changes: Record<string, string> = {};
  const resources = await exportResources(local);
  for (const [path, content] of Object.entries(resources)) {
    if (content !== local.context.baseline[path]) changes[path] = content;
  }
  if (settingsChanges(local)) changes[`${local.context.projectPath}/settings.json`] = JSON.stringify(local.context.settings, null, 2) + "\n";
  return { files: changes, resources };
}
