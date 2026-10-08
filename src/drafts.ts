import { openLix } from "@lix-js/sdk";
import { OpfsStorage } from "@lix-js/storage-opfs";
import { readRecent } from "./recent";

// Local drafts: one Lix database in OPFS per repository, branch and project. This registry remembers
// what each database is, when it was last opened and how many changes it holds that GitHub doesn't
// have, so unused databases can be deleted without ever losing unpushed work.
export type Draft = { name: string; owner: string; repo: string; branch: string; projectPath: string; lastOpened: number; /** Unpushed changes; -1 when unknown. */ pending: number };

const KEY = "fink:drafts";
const PREFIX = "fink-v3-";
const UNUSED_AFTER = 30 * 24 * 60 * 60 * 1000;
// Where @lix-js/storage-opfs keeps a database: /lix/sqlite-sahpool/<base64url(name)>, and the Web
// Locks its owner holds while it is open (from @lix-js/storage-opfs; no public delete API yet).
const POOL = ["lix", "sqlite-sahpool"];
const LOCKS = ["lix:opfs-owner:rpc-v4:", "lix:opfs-sqlite:"];
const METADATA = "/fink-context.json";

/** The OPFS database name of a draft. */
export async function draftName(owner: string, repo: string, branch: string, projectPath: string): Promise<string> {
  const key = [owner.toLowerCase(), repo.toLowerCase(), branch, projectPath].join("/");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return PREFIX + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function readDrafts(): Record<string, Draft> {
  try { const value = JSON.parse(localStorage.getItem(KEY) ?? "{}"); return value && typeof value === "object" ? value : {}; } catch { return {}; }
}
function writeDrafts(drafts: Record<string, Draft>) {
  try { localStorage.setItem(KEY, JSON.stringify(drafts)); } catch { /* Storage can be unavailable in private windows. */ }
}
/** Records that a draft was opened (keeping its last known unpushed count). */
export function recordDraft(draft: Omit<Draft, "lastOpened" | "pending"> & { pending?: number }) {
  const drafts = readDrafts(), previous = drafts[draft.name];
  drafts[draft.name] = { ...draft, lastOpened: Date.now(), pending: draft.pending ?? previous?.pending ?? 0 };
  writeDrafts(drafts);
}
export function setDraftPending(name: string, pending: number) {
  const drafts = readDrafts();
  if (drafts[name] && drafts[name].pending !== pending) { drafts[name] = { ...drafts[name], pending }; writeDrafts(drafts); }
}
function forgetDraft(name: string) {
  const drafts = readDrafts();
  delete drafts[name];
  writeDrafts(drafts);
}

const directoryName = (name: string) => btoa(String.fromCharCode(...new TextEncoder().encode(name))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
const nameOf = (directory: string) => {
  try { return new TextDecoder().decode(Uint8Array.from(atob(directory.replaceAll("-", "+").replaceAll("_", "/")), char => char.charCodeAt(0))); } catch { return undefined; }
};
async function poolDirectory(): Promise<FileSystemDirectoryHandle | undefined> {
  try {
    let directory = await navigator.storage.getDirectory();
    for (const part of POOL) directory = await directory.getDirectoryHandle(part);
    return directory;
  } catch { return undefined; }
}
type Entries = FileSystemDirectoryHandle & { entries(): AsyncIterable<[string, FileSystemHandle]> };

/** Bytes and last change of a draft's files. */
export async function draftUsage(name: string): Promise<{ bytes: number; modified: number }> {
  const pool = await poolDirectory();
  let bytes = 0, modified = 0;
  const walk = async (directory: FileSystemDirectoryHandle) => {
    for await (const [, handle] of (directory as Entries).entries()) {
      if (handle.kind === "directory") await walk(handle as FileSystemDirectoryHandle);
      else { const file = await (handle as FileSystemFileHandle).getFile(); bytes += file.size; modified = Math.max(modified, file.lastModified); }
    }
  };
  try { if (pool) await walk(await pool.getDirectoryHandle(directoryName(name))); } catch { /* Not stored. */ }
  return { bytes, modified };
}

/** Names of the Fink drafts stored in OPFS. */
export async function storedDrafts(): Promise<string[]> {
  const pool = await poolDirectory(), names: string[] = [];
  if (!pool) return names;
  for await (const [directory, handle] of (pool as Entries).entries()) {
    const name = handle.kind === "directory" ? nameOf(directory) : undefined;
    if (name?.startsWith(PREFIX)) names.push(name);
  }
  return names;
}

/**
 * Deletes a draft's database. Refuses while any tab has it open: Lix holds Web Locks for an open
 * database, and holding them here keeps another tab from opening it mid-delete.
 */
export async function deleteDraft(name: string): Promise<"deleted" | "in-use"> {
  const locks = navigator.locks;
  if (!locks) return "in-use";
  const held = await locks.query();
  if ([...(held.held ?? []), ...(held.pending ?? [])].some(lock => LOCKS.some(prefix => lock.name === prefix + name))) return "in-use";
  const result = await locks.request(LOCKS[0]! + name, { ifAvailable: true }, async first => {
    if (!first) return "in-use" as const;
    return locks.request(LOCKS[1]! + name, { ifAvailable: true }, async second => {
      if (!second) return "in-use" as const;
      const pool = await poolDirectory();
      try { await pool?.removeEntry(directoryName(name), { recursive: true }); } catch (error) { if ((error as DOMException).name !== "NotFoundError") throw error; }
      return "deleted" as const;
    });
  });
  if (result === "deleted") forgetDraft(name);
  return result;
}

/**
 * Registers drafts created before this registry existed: from the recent projects list when it has
 * them, otherwise by reading the draft's own context (its unpushed count is then unknown).
 */
export async function registerExisting(openName?: string): Promise<void> {
  const drafts = readDrafts(), stored = await storedDrafts();
  const recent = new Map(await Promise.all(readRecent().map(async project => [await draftName(project.owner, project.name, project.branch, project.projectPath), project] as const)));
  for (const name of stored) {
    if (drafts[name] || name === openName) continue;
    const known = recent.get(name);
    if (known) { drafts[name] = { name, owner: known.owner, repo: known.name, branch: known.branch, projectPath: known.projectPath, lastOpened: known.openedAt, pending: known.pending }; continue; }
    try {
      const lix = await openLix({ storage: new OpfsStorage({ name }) });
      try {
        const row = (await lix.execute<{ content: Uint8Array }>("SELECT content FROM lix_file WHERE path = $1", [METADATA])).rows[0];
        const context = row ? JSON.parse(new TextDecoder().decode(row.content)) as { owner: string; name: string; branch: string; projectPath: string } : undefined;
        const { modified } = await draftUsage(name);
        drafts[name] = { name, owner: context?.owner ?? "", repo: context?.name ?? "", branch: context?.branch ?? "", projectPath: context?.projectPath ?? "", lastOpened: modified || Date.now(), pending: -1 };
      } finally { await lix.close(); }
    } catch { /* In use by another tab or unreadable; try again next time. */ }
  }
  // Entries whose storage is gone (site data cleared) are dropped.
  for (const name of Object.keys(drafts)) if (!stored.includes(name) && name !== openName) delete drafts[name];
  writeDrafts(drafts);
}

/** Deletes drafts without unpushed changes that weren't opened for 30 days, or whose branch is gone. */
export async function cleanupDrafts(options: { openName?: string; branches?: { owner: string; repo: string; names: string[] } } = {}): Promise<string[]> {
  const deleted: string[] = [];
  for (const draft of Object.values(readDrafts())) {
    if (draft.name === options.openName || draft.pending !== 0) continue;
    const stale = Date.now() - draft.lastOpened > UNUSED_AFTER;
    const { branches } = options;
    const gone = !!branches && branches.names.length > 0 && draft.owner.toLowerCase() === branches.owner.toLowerCase() && draft.repo.toLowerCase() === branches.repo.toLowerCase() && !branches.names.includes(draft.branch);
    if ((stale || gone) && (await deleteDraft(draft.name)) === "deleted") deleted.push(draft.name);
  }
  return deleted;
}
