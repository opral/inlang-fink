import { execSync } from "node:child_process";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
// Lix's current engine exceeds Workers' per-asset limit. Serve a gzip asset and
// decompress explicitly in the SDK's compiler; do not rely on CDN re-encoding.
function compressedLixWasm(): Plugin {
  return {
    name: "fink-compressed-lix-wasm",
    apply: "build",
    transform(source, id) {
      if (!id.includes("@lix-js") || !id.endsWith("/wasm-init.js")) return;
      if (!source.includes('new URL("./wasm/lix_js_sdk_bg.wasm", import.meta.url)') || !source.includes('async function compileWasmResponse(response) {')) throw new Error("Lix WASM loader changed; update the compressed asset adapter before deploying.");
      const file = this.emitFile({ type: "asset", name: "lix-engine.wasm.gz", source: gzipSync(readFileSync(join(dirname(id), "wasm/lix_js_sdk_bg.wasm")), { level: 9 }) });
      return source.replace('new URL("./wasm/lix_js_sdk_bg.wasm", import.meta.url)', `new URL(import.meta.ROLLUP_FILE_URL_${file}, import.meta.url)`)
        .replace('async function compileWasmResponse(response) {', 'async function compileWasmResponse(response) { response = new Response(response.clone().body.pipeThrough(new DecompressionStream("gzip")), { headers: { "Content-Type": "application/wasm" } });');
    },
  };
}
// Telemetry's app_version: the package version plus the commit it was built from.
const commit = process.env.GITHUB_SHA?.slice(0, 7) ?? (() => { try { return execSync("git rev-parse --short HEAD").toString().trim(); } catch { return "dev"; } })();
const appVersion = `${JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version}+${commit}`;

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  plugins: [react(), compressedLixWasm()],
  resolve: {
    alias: [{ find: /^@inlang\/sdk$/, replacement: "@inlang/sdk/browser" }],
    // The linked inlang packages (pnpm overrides) bring their own @inlang/sdk and Lix: use one instance of each.
    dedupe: ["@inlang/sdk", "@lix-js/sdk"],
  },
  worker: { format: "es", plugins: () => [compressedLixWasm()] },
  build: { target: "es2022" },
  optimizeDeps: { exclude: ["@inlang/sdk", "@lix-js/sdk", "@lix-js/storage-opfs"] },
  server: {
    proxy: { "/api": "http://localhost:8787" },
    // The linked checkouts of opral/inlang#4438 and #4437, see pnpm-workspace.yaml.
    fs: { allow: [".", resolve("../inlang-project-checks"), resolve("../inlang-editor-components")] },
  },
});
