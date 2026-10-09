import { afterEach, expect, test } from "vitest";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const temporary: string[] = [];
afterEach(() => { for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }); });
/**
 * A fake `pnpm` that records how Wrangler would be called. The script must never reach the real
 * pnpm or Wrangler: PATH holds only the fake, so a fake that can't run fails the test instead of
 * deploying. The fake is a /bin/sh script that runs Node by its quoted path, since a `#!` line
 * can't hold a Node path with spaces (e.g. "~/Library/Application Support/…" on macOS), and an
 * unrunnable PATH entry is skipped for the next one.
 */
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "fink-deploy-test-")); temporary.push(directory);
  const capture = join(directory, "capture.json");
  const recorder = join(directory, "record.cjs");
  writeFileSync(recorder, `const fs = require('node:fs');\nconst args = process.argv.slice(2);\nconst file = args[args.indexOf('--secrets-file') + 1];\nfs.writeFileSync(process.env.CAPTURE, JSON.stringify({args, file, bindings: JSON.parse(fs.readFileSync(file)), mode: fs.statSync(file).mode & 511, auth: process.env.CLOUDFLARE_API_TOKEN, leaked: Boolean(process.env.GITHUB_CLIENT_SECRET || process.env.SESSION_SECRET)}));\nprocess.exit(Number(process.env.TEST_EXIT || 0));\n`);
  const binary = join(directory, "pnpm");
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  writeFileSync(binary, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(recorder)} "$@"\n`);
  chmodSync(binary, 0o700);
  const env = { ...process.env, PATH: directory, CAPTURE: capture, CLOUDFLARE_API_TOKEN: "deployment-test-only", GITHUB_CLIENT_SECRET: "app-test-only", SESSION_SECRET: "session-test-only".repeat(3) };
  return { capture, env };
}
const script = resolve("scripts/deploy.mjs");
test("deployment keeps the API token out of bindings and removes private files after success and failure", () => {
  for (const exit of [0, 7]) {
    const { capture, env } = fixture();
    const result = spawnSync(process.execPath, [script, "fink-pr-83"], { env: { ...env, TEST_EXIT: String(exit) }, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(exit);
    const data = JSON.parse(readFileSync(capture, "utf8"));
    expect(data.bindings).toEqual({ GITHUB_CLIENT_SECRET: env.GITHUB_CLIENT_SECRET, SESSION_SECRET: env.SESSION_SECRET });
    expect(data.auth).toBe(env.CLOUDFLARE_API_TOKEN);
    expect(data.mode).toBe(0o600);
    expect(data.leaked).toBe(false);
    expect(data.args.slice(0, 5)).toEqual(["exec", "wrangler", "deploy", "--name", "fink-pr-83"]);
    expect(existsSync(data.file)).toBe(false);
  }
});
test("invalid targets and missing credentials fail before invoking Wrangler", () => {
  for (const args of [[], ["some-other-worker"]]) {
    const { capture, env } = fixture();
    expect(spawnSync(process.execPath, [script, ...args], { env }).status).not.toBe(0);
    expect(existsSync(capture)).toBe(false);
  }
  const { capture, env } = fixture();
  const result = spawnSync(process.execPath, [script, "fink"], { env: { ...env, GITHUB_CLIENT_SECRET: "" }, encoding: "utf8" });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("Missing GITHUB_CLIENT_SECRET");
  expect(existsSync(capture)).toBe(false);
});
