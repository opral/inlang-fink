import { HttpError } from "./auth";
import { isGeneratedPath, isTestPath, mayCallMessages } from "../src/sourcePaths";

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

/**
 * Extracts matching UTF-8 files from a gzipped tar stream; the archive's top-level folder is removed
 * from paths. Matching files over MAX_FILE are left out; those whose text matches `mentions` are
 * listed as `skipped`, so the usage analysis is reported incomplete instead of missing their calls.
 */
export async function extractSource(archive: ReadableStream<Uint8Array>, keep: (path: string) => boolean, mentions?: RegExp): Promise<{ files: Record<string, string>; skipped: string[] }> {
  const bytes = new Bytes(archive.pipeThrough(new DecompressionStream("gzip")).getReader());
  const files: Record<string, string> = {}, skipped: string[] = [];
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
    const wanted = (type === "0" || type === "\0") && !!path && keep(path);
    if (wanted && size <= MAX_FILE) {
      const data = await bytes.take(padded);
      if (!data) throw new HttpError(502, "The repository archive ended early.");
      kept += size;
      if (kept > MAX_KEPT) throw new HttpError(413, "The project's source is too large to scan for message usage.");
      files[path] = text(data.subarray(0, size));
    } else if (wanted && mentions) {
      const found = await bytes.scan(size, mentions);
      if (found === undefined || !(await bytes.skip(padded - size))) throw new HttpError(502, "The repository archive ended early.");
      if (found) skipped.push(path);
    } else if (!(await bytes.skip(padded))) throw new HttpError(502, "The repository archive ended early.");
  }
  return { files, skipped };
}
