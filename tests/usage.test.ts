import { expect, test } from "vitest";
import mFunctionMatcher from "@inlang/plugin-m-function-matcher";
import type { InlangPlugin } from "@inlang/sdk/browser";
import { sourceSnapshot, usagesFromReferences, usageRole } from "../src/usage";

// References come from the inlang m-function matcher's usage analysis (what the SDK's findUsages returns).
async function usages(files: Record<string, string>) {
  const analysis = await (mFunctionMatcher as InlangPlugin).analyzeUsage!({ files: sourceSnapshot(files), settings: { baseLocale: "en", locales: ["en"] } as never });
  return { analysis, byBundle: usagesFromReferences(analysis.references ?? [], files) };
}

const page = `<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { toast } from 'svelte-sonner';
	const items = [{ href: '/settings/apps', label: m.my_apps() }];
	const copy = () => toast.success(m.copied());
</script>

<svelte:head><title>{m.settings_title()}</title></svelte:head>
<Button variant="secondary">
	{m.add_claim()}
</Button>
<Input placeholder={m.search_placeholder()} />
<p>{m.refresh_failed({ resource: m.images() })}</p>
`;

test("turns SDK references into snippets and roles", async () => {
  const { analysis, byBundle } = await usages({ "src/routes/settings/+page.svelte": page });
  expect(analysis.status).toBe("complete");
  const first = (id: string) => byBundle.get(id)?.[0];
  expect(first("add_claim")).toMatchObject({ path: "src/routes/settings/+page.svelte", line: 10, role: "Button" });
  const claim = first("add_claim")!;
  expect(claim.snippet).toEqual({ start: 9, lines: ['<Button variant="secondary">', "\t{m.add_claim()}", "</Button>"] });
  expect(claim.snippet.lines[1]!.slice(claim.from, claim.to)).toBe("m.add_claim()");
  expect(first("my_apps")?.role).toBe("Label");
  expect(first("copied")?.role).toBe("Toast");
  expect(first("settings_title")?.role).toBe("Page title");
  expect(first("search_placeholder")?.role).toBe("Input placeholder");
  expect(first("refresh_failed")?.role).toBe("Text");
  expect(first("images")?.role).toBe("Part of refresh_failed");
});

test("the snapshot leaves out generated Paraglide code, dependencies and non-code files", () => {
  expect(sourceSnapshot({ "src/a.ts": "", "src/lib/paraglide/messages.js": "", "node_modules/x/index.js": "", "src/app.css": "", "src/types.d.ts": "", "src/App.vue": "" }).map(file => file.path)).toEqual(["src/a.ts", "src/App.vue"]);
});

test("roles come from attributes, properties, callees and the nearest element", () => {
  const at = (source: string) => usageRole(source, source.indexOf("m.x"));
  expect(at('<button aria-label={m.x()}>')).toBe("Accessible label");
  expect(at("bulkConfirm({ confirmLabel: m.x() })")).toBe("Confirm button");
  expect(at("<h2 class='a'>{m.x()}</h2>")).toBe("Heading");
  expect(at("<DropdownMenu.Item>{m.x()}</DropdownMenu.Item>")).toBe("Menu item");
  expect(at("<Badge>{m.x()}</Badge>")).toBe("In <Badge>");
  expect(at("<div><img src='a.png'><span>{m.x()}</span></div>")).toBe("Text");
  expect(at("const value = m.x();")).toBeUndefined();
});

test("aliased imports and comments come from the analysis; dynamic lookups make it incomplete", async () => {
  const { byBundle } = await usages({
    "src/a.svelte": "<script>\n\timport * as messages from '$lib/paraglide/messages';\n</script>\n<h1>{messages.welcome()}</h1>\n",
    "src/b.ts": "import { m } from './paraglide/messages';\n// m.commented_out()\n/* m.block() */\nexport const x = m.real();\n",
  });
  expect(byBundle.get("welcome")?.[0]?.role).toBe("Heading");
  expect(byBundle.has("commented_out")).toBe(false);
  expect(byBundle.has("block")).toBe(false);
  expect(byBundle.get("real")?.[0]?.role).toBeUndefined();
  const dynamic = await usages({ "src/c.ts": "import { m } from './paraglide/messages';\nconst label = (key: string) => m[key]();\n" });
  expect(dynamic.analysis.status).toBe("incomplete");
});

test("TypeScript generics, scripts and arrow attributes do not produce element roles", () => {
  const at = (source: string, path = "x.svelte") => usageRole(source, source.indexOf("m.x"), path);
  expect(at("const p: Promise<void> = run(m.x());", "x.ts")).toBeUndefined();
  expect(at("<script lang=\"ts\">\n\tconst items = $state<string[]>([m.x()]);\n</script>")).toBeUndefined();
  expect(at("<p><Icon onclick={() => go()} />{m.x()}</p>")).toBe("Text");
  expect(at("<script>\n\tconst title = m.x();\n</script>")).toBeUndefined();
  expect(at('<Button aria-label="{m.x()}">')).toBe("Accessible label");
  expect(at("<Button onclick={() => (items = [...items, { key: '' }])}>\n\t<Plus class=\"size-4\" />\n\t{m.x()}\n</Button>")).toBe("Button");
});

test("long lines are cut to a window around the call", async () => {
  const { byBundle } = await usages({ "src/long.ts": `import { m } from './paraglide/messages';\nexport const x = [${"'filler', ".repeat(60)}m.far_right()];\n` });
  const usage = byBundle.get("far_right")![0]!, line = usage.snippet.lines[usage.line - usage.snippet.start]!;
  expect(line.length).toBeLessThan(260);
  expect(line.slice(usage.from, usage.to)).toBe("m.far_right()");
});

test("only generated and output roots are left out; markup that mentions messages makes usage incomplete", async () => {
  const paths = (files: Record<string, string>) => sourceSnapshot(files).map(file => file.path);
  expect(paths({
    "src/features/build/Page.tsx": "", "src/lib/dist/format.ts": "", "src/features/paraglide/Picker.tsx": "",
    "dist/index.js": "", "packages/web/build/app.js": "", "src/lib/paraglide/runtime.js": "", "src/paraglide/messages/_index.js": "", "src/paraglide/messages.js": "",
    "docs/intro.mdx": "import { m } from '../src/paraglide/messages.js';\n# {m.title()}", "README.md": "# My app", "public/index.html": "<h1>Hi</h1>",
  })).toEqual(["src/features/build/Page.tsx", "src/lib/dist/format.ts", "src/features/paraglide/Picker.tsx", "docs/intro.mdx"]);
  const { analysis } = await usages({ "docs/intro.mdx": "import { m } from '../src/paraglide/messages.js';\n# {m.title()}", "src/a.ts": "import { m } from './paraglide/messages.js'; m.other();" });
  expect(analysis.status).toBe("incomplete");
});
