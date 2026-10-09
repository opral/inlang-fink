import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const names = process.argv.slice(2);
if (!names.length || names.some(name => !/^(fink|fink-migration-preview|fink-pr-[1-9][0-9]*)$/.test(name))) {
  throw new Error("Choose fink, fink-migration-preview, or fink-pr-<number> as deployment targets.");
}
for (const key of ["CLOUDFLARE_API_TOKEN", "GITHUB_CLIENT_SECRET", "SESSION_SECRET"]) {
  if (!process.env[key]?.trim()) throw new Error(`Missing ${key}. Fetch the Fink deployment folder from Infisical first.`);
}
if (process.env.SESSION_SECRET.length < 32) throw new Error("SESSION_SECRET must have at least 32 characters.");

const directory = mkdtempSync(join(tmpdir(), "fink-deploy-"));
const file = join(directory, "worker-secrets.json");
try {
  // The Cloudflare API token authorizes deployment; it never becomes a Worker binding.
  writeFileSync(file, JSON.stringify({ GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET, SESSION_SECRET: process.env.SESSION_SECRET }), { mode: 0o600 });
  const env = { ...process.env, CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID || "11a1a6f76d167248cc6987e978efb7e5", WRANGLER_SEND_METRICS: "false" };
  delete env.GITHUB_CLIENT_SECRET;
  delete env.SESSION_SECRET;
  for (const name of names) {
    const args = ["exec", "wrangler", "deploy", "--name", name, "--secrets-file", file];
    if (process.env.GITHUB_CLIENT_ID) args.push("--var", `GITHUB_CLIENT_ID:${process.env.GITHUB_CLIENT_ID}`);
    const result = spawnSync("pnpm", args, { cwd: fileURLToPath(new URL("..", import.meta.url)), env, stdio: "inherit" });
    if (result.error) throw new Error("Wrangler could not be started.");
    if (result.status !== 0) { process.exitCode = result.status || 1; break; }
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
