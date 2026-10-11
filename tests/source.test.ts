import { expect, test } from "vitest";
import { gzipSync } from "node:zlib";
import { extractSource, isSourcePath, MAX_FILE } from "../worker/source";
import { USAGE_SOURCES } from "../src/sourcePaths";

// Minimal ustar writer for fixtures: pax headers carry paths longer than 100 bytes.
function entry(name: string, body: string, type = "0"): Buffer {
  const data = Buffer.from(body), header = Buffer.alloc(512);
  header.write(name.slice(0, 100), 0); header.write("0000644\0", 100); header.write(data.length.toString(8).padStart(11, "0") + "\0", 124);
  header.write(type, 156); header.write("ustar\0", 257); header.write("00", 263);
  header.write("        ", 148);
  header.write(header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, "0") + "\0 ", 148);
  return Buffer.concat([header, data, Buffer.alloc(Math.ceil(data.length / 512) * 512 - data.length)]);
}
function pax(path: string): Buffer {
  const record = (length: number) => `${length} path=${path}\n`;
  let length = record(0).length; while (record(length).length !== length) length = record(length).length;
  return entry("PaxHeader", record(length), "x");
}
const archive = (...entries: Buffer[]) => new Blob([gzipSync(Buffer.concat([...entries, Buffer.alloc(1024)]))]).stream();

test("extracts only app source within the project scope and strips the archive folder", async () => {
  const long = `repo-sha/frontend/src/routes/${"nested/".repeat(16)}+page.svelte`;
  const { files } = await extractSource(archive(
    entry("pax_global_header", "52 comment=0123456789abcdef0123456789abcdef01234567\n", "g"),
    entry("repo-sha/frontend/src/app.svelte", "<h1>{m.hello()}</h1>"),
    entry("repo-sha/frontend/src/big.png", "x".repeat(2000)),
    pax(long), entry("repo-sha/ignored-short-name", "{m.deep()}"),
    entry("repo-sha/frontend/src/lib/paraglide/messages.js", "export const hello = () => 'Hello'"),
    entry("repo-sha/backend/main.ts", "m.hello()"),
  ), path => isSourcePath(path, "frontend"));
  expect(files).toEqual({ "frontend/src/app.svelte": "<h1>{m.hello()}</h1>", [long.slice("repo-sha/".length)]: "{m.deep()}" });
});

test("source paths skip generated, dependency, declaration and test files", () => {
  expect(isSourcePath("src/routes/+page.svelte", "")).toBe(true);
  expect(isSourcePath("app/components/Button.tsx", "app")).toBe(true);
  for (const path of ["node_modules/x/index.js", "src/paraglide/messages.js", "src/types.d.ts", "src/a.test.ts", "src/a.stories.tsx", ".svelte-kit/output.js", "src/logo.svg", "other/a.ts"]) expect(isSourcePath(path, path.startsWith("other") ? "app" : "")).toBe(false);
});

test("truncated archives fail instead of returning partial source", async () => {
  const full = gzipSync(Buffer.concat([entry("repo-sha/src/a.ts", "x".repeat(4000))]));
  const truncated = gzipSync(Buffer.concat([entry("repo-sha/src/a.ts", "x".repeat(4000))]).subarray(0, 1500));
  await expect(extractSource(new Blob([truncated]).stream(), () => true)).rejects.toMatchObject({ status: 502 });
  await expect(extractSource(new Blob([full]).stream(), () => true)).resolves.toHaveProperty(["files", "src/a.ts"]);
  expect(isSourcePath("src/../etc/x.ts", "")).toBe(false);
  expect(isSourcePath("e2e/login.ts", "")).toBe(false);
});

test("source paths keep app folders named build, dist or paraglide, and markup", () => {
  for (const path of ["src/features/build/Page.tsx", "apps/web/src/dist/x.ts", "src/features/paraglide/Picker.tsx", "docs/intro.mdx", "src/routes/about.md"]) expect(isSourcePath(path, "")).toBe(true);
  for (const path of ["build/index.js", "packages/web/dist/app.js", "src/lib/paraglide/runtime.js", "src/paraglide/messages/_index.js"]) expect(isSourcePath(path, "")).toBe(false);
});

test("a test folder inside routes is a page, minified bundles are build output", () => {
  for (const path of ["src/app/[locale]/test/page.tsx", "app/tests/page.tsx", "src/routes/e2e/+page.svelte"]) expect(isSourcePath(path, ""), path).toBe(true);
  for (const path of ["test/setup.ts", "src/__tests__/a.tsx", "packages/web/tests/fixtures/page.tsx", "src/app/__mocks__/x.ts", "public/vendor/pdf.worker.min.js", "src/app/page.test.tsx"]) expect(isSourcePath(path, ""), path).toBe(false);
});

test("files over the size limit that call messages are reported, not silently left out", async () => {
  const big = (body: string) => body + "\n" + "// filler\n".repeat(Math.ceil((MAX_FILE + 1) / 10));
  const call = big("import { useTranslations } from 'next-intl';\nexport const T = () => useTranslations('Home')('title');");
  // the call after a chunk boundary is found too
  const late = "// filler\n".repeat(Math.ceil((MAX_FILE + 70_000) / 10)) + "const t = await getTranslations('Nav');";
  const result = await extractSource(archive(
    entry("repo-sha/src/app/data.ts", big("export const countries = ['DE', 'FR'];")),
    entry("repo-sha/src/app/huge-page.tsx", call),
    entry("repo-sha/src/app/late.tsx", late),
    entry("repo-sha/src/app/page.tsx", "t('x')"),
  ), path => isSourcePath(path, ""), USAGE_SOURCES["plugin.inlang.nextIntl"]!.mentions);
  expect(result).toEqual({ files: { "src/app/page.tsx": "t('x')" }, skipped: ["src/app/huge-page.tsx", "src/app/late.tsx"] });
});
