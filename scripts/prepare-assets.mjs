import { readFile, writeFile, readdir, cp, mkdir, unlink, rm } from "node:fs/promises";
import path from "node:path";
const headers = [];
for (const name of await readdir("dist/assets")) {
  if (!name.endsWith(".wasm")) continue;
  const file = path.join("dist/assets", name);
  const original = await readFile(file);
  if (original.length < 25 * 1024 * 1024) continue;
  // The SDK's browser loader uses the emitted .wasm.gz file. wasm-bindgen's
  // unused default URL still causes Vite to emit the original; remove it.
  if (name.startsWith("lix_js_sdk_bg-")) { await unlink(file); continue; }
  throw new Error(`${name} exceeds the Cloudflare asset limit.`);
}
await rm("dist/shoelace", { recursive: true, force: true });
await mkdir("dist/shoelace/assets/icons", { recursive: true });
for (const icon of ["chevron-down", "chevron-up", "x-lg", "check", "plus", "three-dots", "trash", "question-circle"]) {
  await cp(`node_modules/@shoelace-style/shoelace/dist/assets/icons/${icon}.svg`, `dist/shoelace/assets/icons/${icon}.svg`);
}
await writeFile("dist/_headers", `${headers.join("\n\n")}\n\n/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n`);
