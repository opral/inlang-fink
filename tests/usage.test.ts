import { expect, test } from "vitest";
import { isUnused, scanUsages, usageRole } from "../src/usage";

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

test("finds usages with the inlang matcher, adds nested calls, snippets and roles", async () => {
  const index = await scanUsages({ "src/routes/settings/+page.svelte": page, "src/lib/strings.ts": "export const legacy = 'mentioned_only';" });
  const first = (id: string) => index.usages.get(id)?.[0];
  expect(first("add_claim")).toMatchObject({ path: "src/routes/settings/+page.svelte", line: 10, role: "Button" });
  const claim = first("add_claim")!;
  expect(claim.snippet).toEqual({ start: 9, lines: ['<Button variant="secondary">', "\t{m.add_claim()}", "</Button>"] });
  expect(claim.snippet.lines[1]!.slice(claim.from, claim.to)).toBe("m.add_claim()");
  expect(first("my_apps")?.role).toBe("Label");
  expect(first("copied")?.role).toBe("Toast");
  expect(first("settings_title")?.role).toBe("Page title");
  expect(first("search_placeholder")?.role).toBe("Input placeholder");
  expect(first("refresh_failed")?.role).toBe("Text");
  // The plugin consumes call arguments; the nested message is still found.
  expect(first("images")?.role).toBe("Part of refresh_failed");
  expect(isUnused(index, "add_claim")).toBe(false);
  expect(isUnused(index, "mentioned_only")).toBe(false);
  expect(isUnused(index, "never_referenced")).toBe(true);
});

test("files without a messages import are not matched", async () => {
  const index = await scanUsages({ "src/other.ts": "const m = { hello: () => 'x' }; m.hello();" });
  expect(index.usages.size).toBe(0);
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

test("aliased imports, comments and dynamic lookups are handled conservatively", async () => {
  const index = await scanUsages({
    "src/a.svelte": "<script>\n\timport * as messages from '$lib/paraglide/messages';\n</script>\n<h1>{messages.welcome()}</h1>\n",
    "src/b.ts": "import { m } from './paraglide/messages';\n// m.commented_out()\n/* m.block() */\nexport const x = m.real();\n",
  });
  expect(index.usages.get("welcome")?.[0]?.role).toBe("Heading");
  expect(index.usages.has("commented_out")).toBe(false);
  expect(index.usages.has("block")).toBe(false);
  expect(index.usages.get("real")?.[0]?.role).toBeUndefined();
  expect(isUnused(index, "nowhere")).toBe(true);
  expect(isUnused(index, "has space")).toBe(false);
  const dynamic = await scanUsages({ "src/c.ts": "import { m } from './paraglide/messages';\nconst label = (key: string) => m[key]();\n" });
  expect(isUnused(dynamic, "nowhere")).toBe(false);
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
  const index = await scanUsages({ "src/long.ts": `import { m } from './paraglide/messages';\nexport const x = [${"'filler', ".repeat(60)}m.far_right()];\n` });
  const usage = index.usages.get("far_right")![0]!, line = usage.snippet.lines[usage.line - usage.snippet.start]!;
  expect(line.length).toBeLessThan(260);
  expect(line.slice(usage.from, usage.to)).toBe("m.far_right()");
});
