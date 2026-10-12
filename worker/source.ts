import { HttpError } from "./auth";
import { analyzedFile, isGeneratedPath, isTestPath, mayCallMessages, type UsageSource } from "../src/sourcePaths";

/** App source and markup that can reference messages; generated, test and dependency files are skipped. */
export function isSourcePath(path: string, scope: string): boolean {
  if (scope && !path.startsWith(`${scope}/`)) return false;
  if (!mayCallMessages(path) || isGeneratedPath(path) || isTestPath(path)) return false;
  return !path.split("/").some(part => !part || part === "." || part === "..");
}

export const MAX_FILE = 512 * 1024;
const MAX_KEPT = 25 * 1024 * 1024;
const MAX_ARCHIVE = 400 * 1024 * 1024;

/** A queue of stream chunks that can take or skip bytes without re-copying the whole buffer. */
class Bytes {
  private chunks: Uint8Array[] = [];
  private length = 0;
  read = 0;
  constructor(private reader: ReadableStreamDefaultReader<Uint8Array>) {}
  private async fill(size: number): Promise<boolean> {
    while (this.length < size) {
      const { value, done } = await this.reader.read();
      if (done) return false;
      this.chunks.push(value); this.length += value.byteLength;
    }
    return true;
  }
  async take(size: number): Promise<Uint8Array | undefined> {
    if (!(await this.fill(size))) return;
    const out = new Uint8Array(size);
    let offset = 0;
    while (offset < size) {
      const chunk = this.chunks[0]!, count = Math.min(chunk.byteLength, size - offset);
      out.set(chunk.subarray(0, count), offset); offset += count;
      if (count === chunk.byteLength) this.chunks.shift(); else this.chunks[0] = chunk.subarray(count);
    }
    this.length -= size; this.read += size;
    return out;
  }
  async skip(size: number): Promise<boolean> {
    while (size > 0) {
      if (!this.length && !(await this.fill(1))) return false;
      const chunk = this.chunks[0]!, count = Math.min(chunk.byteLength, size);
      if (count === chunk.byteLength) this.chunks.shift(); else this.chunks[0] = chunk.subarray(count);
      this.length -= count; this.read += count; size -= count;
    }
    return true;
  }
  /** Reads `size` bytes in chunks and tells whether their text matches `pattern`, without holding the whole file. */
  async scan(size: number, pattern: RegExp): Promise<boolean | undefined> {
    const decoder = new TextDecoder();
    let left = size, tail = "";
    while (left > 0) {
      const chunk = await this.take(Math.min(64 * 1024, left));
      if (!chunk) return;
      left -= chunk.byteLength;
      const text = tail + decoder.decode(chunk, { stream: left > 0 });
      if (pattern.test(text)) return (await this.skip(left)) ? true : undefined;
      tail = text.slice(-256);
    }
    return false;
  }
}

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const field = (header: Uint8Array, start: number, length: number) => { const raw = header.subarray(start, start + length); const end = raw.indexOf(0); return text(end < 0 ? raw : raw.subarray(0, end)); };
const paxPath = (bytes: Uint8Array) => { for (const record of text(bytes).split("\n")) { const value = record.slice(record.indexOf(" ") + 1); if (value.startsWith("path=")) return value.slice(5); } };

export type ExtractOptions = {
  /** App source in the scanned package. */
  keep: (path: string) => boolean;
  /** The format's usage analysis: files it wouldn't get are left out, oversized and outside files that call messages are listed. */
  source?: UsageSource;
  /** The scanned package; app source elsewhere is checked for calls (`outside`). */
  scope?: string;
};
export type Extracted = { files: Record<string, string>; skipped: string[]; outside: string[] };

const parentDirectory = (path: string) => path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
const within = (path: string, directory: string) => !directory || path.startsWith(`${directory}/`);

/**
 * Extracts matching UTF-8 files from a gzipped tar stream; the archive's top-level folder is removed
 * from paths. With a usage `source`, a file is only kept when the analysis gets it, and no file that
 * can call messages is dropped silently. App source outside the scanned package that imports the
 * format is analyzed too when its package is related (above the scope, used by it or using it, per
 * package.json); in other packages it is listed as `outside`, unless the package has an inlang project
 * of its own. Files over MAX_FILE that call messages are listed as `skipped` (or `outside`).
 */
export async function extractSource(archive: ReadableStream<Uint8Array>, options: ExtractOptions): Promise<Extracted> {
  const { keep, source, scope = "" } = options;
  const bytes = new Bytes(archive.pipeThrough(new DecompressionStream("gzip")).getReader());
  const files: Record<string, string> = {}, skipped: string[] = [], elsewhere = new Map<string, string | undefined>(), packages = new Map<string, { name?: string; dependencies: string[] }>(), projects: string[] = [];
  let kept = 0, longPath: string | undefined;
  for (;;) {
    const header = await bytes.take(512);
    if (!header || header.every(byte => byte === 0)) break;
    const size = parseInt(field(header, 124, 12).trim() || "0", 8), type = String.fromCharCode(header[156] ?? 0), padded = Math.ceil(size / 512) * 512;
    if (bytes.read > MAX_ARCHIVE) throw new HttpError(413, "The repository archive is too large to scan for message usage.");
    if (!Number.isFinite(size) || size < 0) throw new HttpError(502, "The repository archive is malformed.");
    if (type === "x" || type === "L") {
      if (size > 64 * 1024) throw new HttpError(502, "The repository archive is malformed.");
      const data = await bytes.take(padded);
      if (!data) throw new HttpError(502, "The repository archive ended early.");
      longPath = type === "L" ? field(data, 0, size) : paxPath(data.subarray(0, size)) ?? longPath;
      continue;
    }
    const prefix = field(header, 345, 155), name = longPath ?? (prefix ? `${prefix}/${field(header, 0, 100)}` : field(header, 0, 100));
    longPath = undefined;
    const path = name.split("/").slice(1).join("/"), file = (type === "0" || type === "\0") && !!path;
    if (file && /(?:^|\/)package\.json$/.test(path) && !isGeneratedPath(path)) {
      // Which packages use which: code in a related package can call this project's messages.
      packages.set(parentDirectory(path), { dependencies: [] });
      if (source && scope && size <= 256 * 1024) {
        const data = await bytes.take(padded);
        if (!data) throw new HttpError(502, "The repository archive ended early.");
        try {
          const manifest = JSON.parse(text(data.subarray(0, size))) as Record<string, unknown>;
          const names = (key: string) => manifest[key] && typeof manifest[key] === "object" ? Object.keys(manifest[key] as object) : [];
          packages.set(parentDirectory(path), { name: typeof manifest.name === "string" ? manifest.name : undefined, dependencies: ["dependencies", "devDependencies", "peerDependencies"].flatMap(names) });
        } catch { /* not JSON: a package without known relations */ }
        continue;
      }
    }
    if (file && /(?:^|\/)[^/]+\.inlang\/settings\.json$/.test(path) && !isTestPath(path) && !isGeneratedPath(path)) projects.push(parentDirectory(parentDirectory(path)));
    const wanted = file && keep(path), other = file && !wanted && !!source && !!scope && !within(path, scope) && isSourcePath(path, "") && source.analyzes.test(path);
    if (wanted && size <= MAX_FILE) {
      const data = await bytes.take(padded);
      if (!data) throw new HttpError(502, "The repository archive ended early.");
      const content = text(data.subarray(0, size));
      if (source && !analyzedFile(source, path, content)) continue;
      kept += size;
      if (kept > MAX_KEPT) throw new HttpError(413, "The project's source is too large to scan for message usage.");
      files[path] = content;
    } else if (other && size <= MAX_FILE) {
      // decided once all package.json files are known
      const data = await bytes.take(padded);
      if (!data) throw new HttpError(502, "The repository archive ended early.");
      const content = text(data.subarray(0, size));
      if (!source!.imports.test(content)) continue;
      kept += size;
      if (kept > MAX_KEPT) throw new HttpError(413, "The project's source is too large to scan for message usage.");
      elsewhere.set(path, content);
    } else if ((wanted && source) || other) {
      const found = await bytes.scan(size, wanted ? source!.mentions : source!.imports);
      if (found === undefined || !(await bytes.skip(padded - size))) throw new HttpError(502, "The repository archive ended early.");
      if (found && wanted) skipped.push(path);
      else if (found) elsewhere.set(path, undefined);
    } else if (!(await bytes.skip(padded))) throw new HttpError(502, "The repository archive ended early.");
  }
  const outside: string[] = [];
  if (elsewhere.size) {
    const reach = relatedPackages(scope, packages);
    for (const [path, content] of elsewhere) {
      const directory = packageOf(packages, path);
      const isRelated = directory === scope || within(scope, directory) || reach.has(directory);
      // another app's own inlang project: it calls its own messages
      if (!isRelated && projects.some(project => project === directory || within(project, directory))) continue;
      if (!isRelated) outside.push(path);
      else if (content === undefined) skipped.push(path);
      else files[path] = content;
    }
  }
  return { files, skipped, outside };
}

/** The package directory a file belongs to: its nearest folder with a package.json, or the repository root. */
function packageOf(packages: Map<string, unknown>, path: string): string {
  for (let directory = parentDirectory(path); ; directory = parentDirectory(directory)) if (packages.has(directory) || !directory) return directory;
}

/** The scope's package, the packages that use it (also through others), and the packages those use, by package.json names. */
function relatedPackages(scope: string, packages: Map<string, { name?: string; dependencies: string[] }>): Set<string> {
  const byName = new Map([...packages].flatMap(([path, info]) => info.name ? [[info.name, path] as const] : []));
  const users = new Set([packageOf(packages, `${scope}/package.json`)]), names = new Set<string>();
  for (let grew = true; grew;) {
    grew = false;
    for (const user of users) { const name = packages.get(user)?.name; if (name) names.add(name); }
    for (const [path, info] of packages) if (!users.has(path) && info.dependencies.some(dependency => names.has(dependency))) { users.add(path); grew = true; }
  }
  const reach = new Set(users);
  for (const path of reach) for (const dependency of packages.get(path)?.dependencies ?? []) { const used = byName.get(dependency); if (used !== undefined) reach.add(used); }
  return reach;
}
