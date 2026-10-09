// Switches Fink from the vendored release-PR tarballs (vendor/, opral/inlang#4436) to the published
// npm packages: exact versions in package.json, no @inlang/sdk override, no vendor/, fresh lockfile.
// Run it once the release is on npm: `node scripts/use-released-inlang.mjs`, then commit
// package.json, pnpm-workspace.yaml, pnpm-lock.yaml, the removed vendor/ and this script's removal.
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";

const released = {
  "@inlang/sdk": "4.0.0",
  "@inlang/editor-component": "13.0.0",
  "@inlang/plugin-message-format": "4.5.0",
  "@inlang/plugin-i18next": "6.4.0",
  "@inlang/plugin-m-function-matcher": "2.3.0",
};
const root = new URL("../", import.meta.url);
const npmView = (spec) => execFileSync("npm", ["view", spec, "version"], { cwd: root, stdio: ["ignore", "pipe", "ignore"], encoding: "utf8" }).trim();

// Fail before changing anything if a version isn't published yet.
const missing = Object.entries(released).filter(([name, version]) => {
  try { return npmView(`${name}@${version}`) !== version; } catch { return true; }
});
if (missing.length) {
  console.error(`Not on npm yet: ${missing.map(([name, version]) => `${name}@${version}`).join(", ")}. Nothing changed.`);
  process.exit(1);
}

const packagePath = new URL("package.json", root);
const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
for (const [name, version] of Object.entries(released)) {
  if (!pkg.dependencies[name]?.startsWith("file:vendor/")) throw new Error(`${name} is not vendored (${pkg.dependencies[name]}).`);
  pkg.dependencies[name] = version;
}
writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + "\n");

// Keep onlyBuiltDependencies; drop the vendoring comment and the override.
const workspacePath = new URL("pnpm-workspace.yaml", root);
const workspace = readFileSync(workspacePath, "utf8");
writeFileSync(workspacePath, workspace.slice(0, workspace.indexOf("\n# Unreleased inlang packages")).trimEnd() + "\n");

rmSync(new URL("vendor/", root), { recursive: true, force: true });
rmSync(new URL("scripts/use-released-inlang.mjs", root));

execFileSync("pnpm", ["install"], { cwd: root, stdio: "inherit" });
const lock = readFileSync(new URL("pnpm-lock.yaml", root), "utf8");
if (/vendor\/|file:/.test(lock)) throw new Error("pnpm-lock.yaml still references a vendored tarball.");
console.log("Switched to the released inlang packages. Run `pnpm check` and `pnpm test:e2e`, then commit.");
