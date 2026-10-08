import { HttpError } from "./auth";

/** App source that can reference messages; generated, test and dependency files are skipped. */
export function isSourcePath(path: string, scope: string): boolean {
  if (scope && !path.startsWith(`${scope}/`)) return false;
  if (!/\.(svelte|vue|astro|[cm]?[jt]sx?)$/.test(path) || /\.d\.[cm]?ts$/.test(path)) return false;
  if (/\.(test|spec|stories)\.[^/]+$/.test(path)) return false;
  const parts = path.split("/");
  if (parts.some(part => !part || part === "." || part === "..")) return false;
  return !parts.some(part => ["node_modules", "paraglide", "dist", ".svelte-kit", ".next", ".output", "__tests__", "__mocks__", "tests", "test", "e2e", "cypress", "playwright", "coverage"].includes(part));
}

const MAX_FILE = 512 * 1024;
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
}

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const field = (header: Uint8Array, start: number, length: number) => { const raw = header.subarray(start, start + length); const end = raw.indexOf(0); return text(end < 0 ? raw : raw.subarray(0, end)); };
const paxPath = (bytes: Uint8Array) => { for (const record of text(bytes).split("\n")) { const value = record.slice(record.indexOf(" ") + 1); if (value.startsWith("path=")) return value.slice(5); } };

/** Extracts matching UTF-8 files from a gzipped tar stream; the archive's top-level folder is removed from paths. */
export async function extractSource(archive: ReadableStream<Uint8Array>, keep: (path: string) => boolean): Promise<Record<string, string>> {
  const bytes = new Bytes(archive.pipeThrough(new DecompressionStream("gzip")).getReader());
  const files: Record<string, string> = {};
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
    const path = name.split("/").slice(1).join("/");
    if ((type === "0" || type === "\0") && size <= MAX_FILE && path && keep(path)) {
      const data = await bytes.take(padded);
      if (!data) throw new HttpError(502, "The repository archive ended early.");
      kept += size;
      if (kept > MAX_KEPT) throw new HttpError(413, "The project's source is too large to scan for message usage.");
      files[path] = text(data.subarray(0, size));
    } else if (!(await bytes.skip(padded))) throw new HttpError(502, "The repository archive ended early.");
  }
  return files;
}
