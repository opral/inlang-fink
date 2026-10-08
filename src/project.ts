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
    progress("Reading project settings…");
    const rawSettings = await readRemoteFile(repo, tree, `${projectPath}/settings.json`);
    const settings: ProjectSettings = JSON.parse(rawSettings);
    // Plugins are bundled and pinned, never evaluated from an untrusted repository.
    project = await openProject({ lix, settings: { ...settings, modules: [] }, providePlugins: pluginsFor(settings) });
    // Metadata is the completed-import marker. Reset incomplete imports before retrying.
    await clearMessages(project);
    const context: RepoContext = { ...repo, branch: tree.branch, projectPath, head: tree.head, tree: tree.tree, settings, original: { [`${projectPath}/settings.json`]: rawSettings }, baseline: {} };
    await importResources(project, repo, tree, context, progress);
    progress("Preparing editor…");
    context.bundleBaseline = bundleSignatures(await readBundles(project));
    context.shas = fileShas(tree, context);
    await saveContext({ project, context });
    return { project, context, close: async () => { await project!.close(); await lix.close(); } };
  } catch (error) { if (project) await project.close(); await lix.close(); throw error; }
}
const readRemoteFile = async (repo: Repo, tree: RepoTree, path: string) => (await api<{ content: string }>(`github/file?${repoQuery({ ...repo, branch: tree.head })}&path=${encodeURIComponent(path)}`)).content;
const fileShas = (tree: RepoTree, context: Pick<RepoContext, "original">) => tree.shas ? Object.fromEntries(Object.keys(context.original).flatMap(path => tree.shas![path] ? [[path, tree.shas![path]]] : [])) : undefined;
async function clearMessages(project: InlangProject) {
  await project.db.transaction().execute(async tx => {
    await tx.deleteFrom("variant").execute();
    await tx.deleteFrom("message").execute();
    await tx.deleteFrom("bundle").execute();
  });
}
/** Resource files the configured plugins would import that exist in `tree`. */
async function resourcePlans(settings: ProjectSettings, projectPath: string, tree: RepoTree) {
  const result = [];
  for (const plugin of pluginsFor(settings)) {
    const plans = await plugin.toBeImportedFiles!({ settings });
    result.push({ plugin, plans: plans.filter(plan => tree.paths.includes(resolveResourcePath(projectPath, plan.path))) });
  }
  return result;
}
/** Downloads the project's resource files at `tree.head` and imports them; records raw files in `context.original`. */
async function importResources(project: InlangProject, repo: Repo, tree: RepoTree, context: RepoContext, progress: (message: string) => void) {
  for (const { plugin, plans: available } of await resourcePlans(context.settings, context.projectPath, tree)) {
    const files = new Array<{ locale: string; content: Uint8Array; toBeImportedFilesMetadata: (typeof available)[number]["metadata"] }>(available.length);
    // Keep requests bounded while avoiding one network round-trip per language.
    let nextFile = 0, downloaded = 0;
    progress(`Downloading language files · 0/${available.length}`);
    await Promise.all(Array.from({ length: Math.min(4, available.length) }, async () => {
      for (;;) {
        const index = nextFile++;
        if (index >= available.length) return;
        const plan = available[index]!;
        const path = resolveResourcePath(context.projectPath, plan.path);
        const content = await readRemoteFile(repo, tree, path);
        context.original[path] = content;
        progress(`Downloading language files · ${++downloaded}/${available.length}`);
        files[index] = { locale: plan.locale, content: new TextEncoder().encode(content), toBeImportedFilesMetadata: plan.metadata };
      }
    }));
    progress(`Importing ${files.length} language files…`);
    await project.importFiles({ pluginKey: plugin.key, files });
  }
}

type MessageShape = { locale: string; selectors: unknown; variants: { matches: unknown; pattern: unknown }[] };
const messageSignature = (message: MessageShape) => JSON.stringify({ locale: message.locale, selectors: message.selectors, variants: message.variants.map(variant => ({ matches: variant.matches, pattern: variant.pattern })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) });

/**
 * Three-way merge of the draft onto a newer remote version, per bundle and per locale.
 * Unchanged local content follows the remote; local edits are kept where the remote did not
 * change the same message; where both changed it, the remote wins (it is the source of truth).
 */
export function mergeBundles(base: Record<string, string>, local: BundleNested[], remote: BundleNested[]): { bundles: BundleNested[]; replaced: string[] } {
  const localById = new Map(local.map(bundle => [bundle.id, bundle])), remoteById = new Map(remote.map(bundle => [bundle.id, bundle]));
  const bundles: BundleNested[] = [], replaced: string[] = [];
  for (const id of new Set([...remoteById.keys(), ...localById.keys(), ...Object.keys(base)])) {
    const ours = localById.get(id), theirs = remoteById.get(id), original = base[id];
    const sOurs = ours && bundleSignature(ours), sTheirs = theirs && bundleSignature(theirs);
    if (sOurs === original) { if (theirs) bundles.push(theirs); continue; }
    if (sTheirs === original || sOurs === sTheirs) { if (ours) bundles.push(ours); continue; }
    // Both changed. A deletion on either side against an edit on the other: the remote decides.
    if (!ours || !theirs) { replaced.push(id); if (theirs) bundles.push(theirs); continue; }
    // Both edited: merge declarations and each locale separately.
    const before = original ? JSON.parse(original) as { declarations: unknown; messages: MessageShape[] } : { declarations: [], messages: [] };
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    const declarations = same(theirs.declarations, before.declarations) ? ours.declarations : theirs.declarations;
    let lost = !same(ours.declarations, before.declarations) && !same(declarations, ours.declarations);
    const merged: BundleNested = { ...theirs, declarations, messages: [] };
    for (const locale of new Set([...theirs.messages, ...ours.messages].map(message => message.locale))) {
      const a = ours.messages.find(message => message.locale === locale), b = theirs.messages.find(message => message.locale === locale);
      const o = before.messages.find(message => message.locale === locale);
      const sa = a && messageSignature(a), sb = b && messageSignature(b), so = o && messageSignature(o);
      const pick = sa === so ? b : sb === so || sa === sb ? a : b;
      if (sa !== so && pick !== a) lost = true;
      if (pick) merged.messages.push({ ...pick, bundleId: id });
    }
    if (lost) replaced.push(id);
    bundles.push(merged);
  }
  return { bundles, replaced };
}

/**
 * Settings merge with the same rule as messages: local edits survive unless the remote changed the
 * same key. Locales merge as sets (local additions and removals apply to the remote list), and the
 * result is always valid: the reference locale is one of the locales.
 */
export function mergeSettings(base: ProjectSettings, local: ProjectSettings, remote: ProjectSettings): ProjectSettings {
  const merged: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(remote), ...Object.keys(local)])) {
    const pick = settingsSignature(local[key]) !== settingsSignature(base[key]) && settingsSignature(remote[key]) === settingsSignature(base[key]) && !key.startsWith("plugin.") && key !== "modules" ? local[key] : remote[key];
    if (pick !== undefined) merged[key] = pick;
  }
  const added = local.locales.filter(locale => !base.locales.includes(locale)), removed = base.locales.filter(locale => !local.locales.includes(locale));
  const locales = [...remote.locales.filter(locale => !removed.includes(locale)), ...added.filter(locale => !remote.locales.includes(locale))];
  merged.locales = locales.length ? locales : [...remote.locales];
  if (!(merged.locales as string[]).includes(merged.baseLocale as string)) merged.baseLocale = remote.baseLocale;
  if (!(merged.locales as string[]).includes(merged.baseLocale as string)) (merged.locales as string[]).unshift(merged.baseLocale as string);
  return merged as ProjectSettings;
}

/**
 * Brings a draft up to date with `tree` without asking the user: GitHub is the source of truth.
 * Returns the bundles whose local edits were replaced by newer remote changes.
 */
export async function syncWithRemote(local: LocalProject, repo: Repo, tree: RepoTree, progress: (message: string) => void = () => {}): Promise<{ replaced: string[] }> {
  const context = local.context;
  if (context.head === tree.head) return { replaced: [] };
  // Fast path: commits that did not touch settings or language files only move the base.
  const settingsPath = `${context.projectPath}/settings.json`;
  if (tree.shas && context.shas && Object.keys(context.original).every(path => context.shas![path] && context.shas![path] === tree.shas![path])) {
    const known = new Set(Object.keys(context.original));
    const added = (await resourcePlans(context.settings, context.projectPath, tree)).some(({ plans }) => plans.some(plan => !known.has(resolveResourcePath(context.projectPath, plan.path))));
    if (!added && tree.shas[settingsPath] === context.shas[settingsPath]) {
      context.head = tree.head; context.tree = tree.tree;
      await saveContext(local);
      return { replaced: [] };
    }
  }
  progress("Updating to the latest version from GitHub…");
  const lix = await openLix();
  let remoteProject: InlangProject | undefined;
  try {
    const rawSettings = await readRemoteFile(repo, tree, settingsPath);
    const remoteSettings: ProjectSettings = JSON.parse(rawSettings);
    remoteProject = await openProject({ lix, settings: { ...remoteSettings, modules: [] }, providePlugins: pluginsFor(remoteSettings) });
    const remote: RepoContext = { ...context, head: tree.head, tree: tree.tree, settings: remoteSettings, original: { [settingsPath]: rawSettings }, baseline: {} };
    await importResources(remoteProject, repo, tree, remote, progress);
    const hadResources = Object.keys(context.original).some(path => path !== settingsPath);
    if (hadResources && !Object.keys(remote.original).some(path => path !== settingsPath)) throw new Error("The latest version on GitHub has no language files for this project. Your draft is unchanged.");
    const remoteBundles = await readBundles(remoteProject);
    const base = await getBaselineSignatures(local);
    const localBundles = await readBundles(local.project);
    const settings = mergeSettings(JSON.parse(context.original[settingsPath]!), context.settings, remoteSettings);
    const merged = mergeBundles(base, localBundles, remoteBundles), replaced = merged.replaced;
    // Messages in locales the project no longer has cannot be pushed; drop them (and report edits).
    const bundles = merged.bundles.map(bundle => {
      const kept = bundle.messages.filter(message => settings.locales.includes(message.locale));
      if (kept.length !== bundle.messages.length && !replaced.includes(bundle.id) && bundleSignature(bundle) !== base[bundle.id]) replaced.push(bundle.id);
      return kept.length === bundle.messages.length ? bundle : { ...bundle, messages: kept };
    });
    progress("Applying your draft…");
    pluginsFor(settings);
    if (settingsSignature(settings) !== settingsSignature(context.settings)) await local.project.settings.set({ ...settings, modules: [] });
    // Rewrite only bundles whose content changed; unchanged rows keep their ids and history.
    const current = new Map(localBundles.map(bundle => [bundle.id, bundleSignature(bundle)]));
    const next = new Set(bundles.map(bundle => bundle.id));
    const changed = bundles.filter(bundle => current.get(bundle.id) !== bundleSignature(bundle));
    const removedIds = [...current.keys()].filter(id => !next.has(id));
    // Batched: one statement per chunk instead of one round trip to the Lix worker per row.
    const chunks = <T,>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
    const rewritten = [...removedIds, ...changed.map(bundle => bundle.id)];
    const messages = changed.flatMap(bundle => bundle.messages.map(message => ({ id: message.id, bundleId: bundle.id, locale: message.locale, selectors: message.selectors })));
    const variants = changed.flatMap(bundle => bundle.messages.flatMap(message => message.variants.map(variant => ({ id: variant.id, messageId: message.id, matches: variant.matches, pattern: variant.pattern }))));
    await local.project.db.transaction().execute(async tx => {
      // Lix supports IN with value lists but not subqueries, so message ids are read first.
      for (const ids of chunks(rewritten, 500)) {
        const messageIds = (await tx.selectFrom("message").select("id").where("bundleId", "in", ids).execute()).map(row => row.id);
        for (const chunk of chunks(messageIds, 500)) await tx.deleteFrom("variant").where("messageId", "in", chunk).execute();
        await tx.deleteFrom("message").where("bundleId", "in", ids).execute();
        await tx.deleteFrom("bundle").where("id", "in", ids).execute();
      }
      for (const rows of chunks(changed.map(bundle => ({ id: bundle.id, declarations: bundle.declarations })), 500)) await tx.insertInto("bundle").values(rows).execute();
      for (const rows of chunks(messages, 500)) await tx.insertInto("message").values(rows).execute();
      for (const rows of chunks(variants, 500)) await tx.insertInto("variant").values(rows).execute();
    });
    progress("Preparing editor…");
    Object.assign(context, { head: tree.head, tree: tree.tree, settings, original: remote.original, baseline: {}, bundleBaseline: bundleSignatures(remoteBundles), shas: fileShas(tree, remote) });
    await saveContext(local);
    return { replaced };
  } finally { if (remoteProject) await remoteProject.close(); await lix.close(); }
}
/** Git's blob hash, so pushed files can be compared with the remote tree without downloading them. */
export async function gitBlobSha(content: string): Promise<string> {
  const body = new TextEncoder().encode(content), header = new TextEncoder().encode(`blob ${body.byteLength}\0`);
  const bytes = new Uint8Array(header.byteLength + body.byteLength); bytes.set(header); bytes.set(body, header.byteLength);
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-1", bytes)), byte => byte.toString(16).padStart(2, "0")).join("");
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
        const path = resolveResourcePath(local.context.projectPath, plan.path);
        const content = local.context.baseline?.[path] ?? local.context.original[path];
        return content === undefined ? [] : [{ locale: plan.locale, content: new TextEncoder().encode(content), toBeImportedFilesMetadata: plan.metadata }];
      });
      await baseline.importFiles({ pluginKey: plugin.key, files });
    }
    local.context.bundleBaseline = bundleSignatures(await readBundles(baseline));
    await saveContext(local);
    return local.context.bundleBaseline;
  } finally { if (baseline) await baseline.close(); await lix.close(); }
}
/** Locales whose messages differ between the baseline signatures and the current bundles. */
export function changedLocales(base: Record<string, string>, current: BundleNested[]): Set<string> {
  const locales = new Set<string>(), byId = new Map(current.map(bundle => [bundle.id, bundle]));
  for (const id of new Set([...Object.keys(base), ...byId.keys()])) {
    const bundle = byId.get(id), original = base[id];
    if (bundle && bundleSignature(bundle) === original) continue;
    const before = original ? JSON.parse(original) as { declarations: unknown; messages: MessageShape[] } : undefined;
    const after = bundle?.messages ?? [], all = new Set([...(before?.messages ?? []).map(message => message.locale), ...after.map(message => message.locale)]);
    // Added, deleted, or re-declared bundles touch every locale they have messages in.
    if (!before || !bundle || JSON.stringify(before.declarations) !== JSON.stringify(bundle.declarations)) { for (const locale of all) locales.add(locale); continue; }
    for (const locale of all) {
      const a = before.messages.find(message => message.locale === locale), b = after.find(message => message.locale === locale);
      if ((a && messageSignature(a)) !== (b && messageSignature(b))) locales.add(locale);
    }
  }
  return locales;
}
/** Exports the resource files of `locales`; a file that existed but has no messages left becomes "{}". */
export async function exportResources(local: Pick<LocalProject, "project" | "context">, locales: Set<string>): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const plugin of pluginsFor(local.context.settings)) {
    for (const plan of await plugin.toBeImportedFiles!({ settings: local.context.settings })) {
      const path = resolveResourcePath(local.context.projectPath, plan.path);
      if (locales.has(plan.locale) && local.context.original[path] !== undefined) files[path] = "{}";
    }
  }
  for (const plugin of pluginsFor(local.context.settings)) {
    for (const file of await local.project.exportFiles({ pluginKey: plugin.key })) {
      if (!locales.has(file.locale)) continue;
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
/** Files to commit: only the locales whose messages changed, plus settings. Untouched files are never rewritten. */
export async function preparePush(local: LocalProject): Promise<{ files: Record<string, string> }> {
  const locales = changedLocales(await getBaselineSignatures(local), await readBundles(local.project));
  const files = locales.size ? await exportResources(local, locales) : {};
  if (settingsChanges(local)) files[`${local.context.projectPath}/settings.json`] = JSON.stringify(local.context.settings, null, 2) + "\n";
  return { files };
}
