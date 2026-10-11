// Designed layouts for static pages with `design:` in their frontmatter (site/compare/index.md, site/teams.md).
// The Markdown stays the single source of the text, for the .md twin and llms-full.txt as much as for
// the HTML: each `## section` is rendered by the handler that matches it, and anything unknown falls
// back to plain prose, so edits to the Markdown never disappear from the page.
import { Marked } from "marked";

const marked = new Marked({ gfm: true });
const escape = text => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slug = text => text.toLowerCase().replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const inline = text => marked.parseInline(text, { async: false });
const blocks = tokens => marked.parser(tokens, { async: false });

/** The text before the first `## ` and each `## ` section with its tokens. */
export function splitSections(markdown) {
  const [intro, ...rest] = markdown.split(/^## /m);
  return { intro: marked.lexer(intro), sections: rest.map(block => { const [title, ...body] = block.split("\n"); return { title: title.trim(), id: slug(title), tokens: marked.lexer(body.join("\n")) }; }) };
}
const content = tokens => tokens.filter(token => token.type !== "space");
/** "**Role:** text" → ["Role", "text"]; items without a bold lead → ["", text]. */
export function leadOf(text) {
  const match = /^\*\*([^*]+?):?\*\*:?\s*([\s\S]*)$/.exec(text.trim());
  return match ? [match[1].replace(/[.:]$/, ""), match[2]] : ["", text];
}

const svg = (paths, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const arrow = `<svg class="flow-arrow" width="22" height="12" viewBox="0 0 22 12" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M1 6h19M15 1l5 5-5 5"/></svg>`;
const yes = `<svg class="mark yes" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Yes"><path d="M5 12l4 4 10-10"/></svg>`;
const no = `<svg class="mark no" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" role="img" aria-label="No"><path d="M6 12h12"/></svg>`;
const ICONS = {
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
  commit: '<circle cx="12" cy="12" r="3"/><path d="M3 12h6M15 12h6"/>',
  pull: '<circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/><path d="M6 8v8M18 16V9a3 3 0 0 0-3-3h-4"/><path d="M13 4l-2 2 2 2"/>',
  release: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  code: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
};
const repoForm = (id, hint = "") => `<form class="cta-form" action="/" method="get"><label class="visually-hidden" for="${id}">GitHub repository</label><input id="${id}" name="repo" placeholder="github.com/owner/repo" inputmode="url" autocapitalize="off" autocomplete="off" spellcheck="false" required><button type="submit">Open</button></form>${hint}`;
const ctaBand = (id, hint) => `<section class="cta-band" aria-labelledby="${id}-title"><div class="cta-text"><h2 id="${id}-title">Try Fink on your repository</h2><p>Free and open source (MIT). Sign in with GitHub to push.</p></div><div class="cta-side">${repoForm(id, hint)}</div></section>`;
const prose = section => `<section class="d-section prose" aria-labelledby="${section.id}"><h2 id="${section.id}">${inline(section.title)}</h2>${blocks(section.tokens)}</section>`;

/* /compare */

/** ✓ and – per row of the comparison table: [Fink column, typical TMS column]. Rows not listed get no icons. */
export const COMPARE_MARKS = {
  "Where translations live": ["yes"], "Getting changes into the repo": ["yes"], "Setup": ["yes"],
  "Checks": ["yes", "yes"], "Formats": [undefined, "yes"],
  "Translation memory, machine translation, glossary": ["no", "yes"], "Review workflows, vendors, agencies": ["no", "yes"],
  "Price": ["yes"], "Source code": ["yes"],
};
const flowCard = (title, steps, text, fink) => `<div class="flow-card${fink ? " fink" : ""}"><h3>${title}</h3><div class="flow" aria-hidden="true">${steps}</div><p>${text}</p></div>`;
const box = (text, kind = "") => `<span class="flow-box ${kind}">${text}</span>`;
const verb = text => `<span class="flow-verb">${text}</span>`;

function compareTable(table) {
  const head = `<thead><tr>${table.header.map((cell, index) => `<th scope="col"${index === 1 ? ' class="ours"' : ""}>${inline(cell.text)}</th>`).join("")}</tr></thead>`;
  const rows = table.rows.map(row => {
    const label = row[0].text.trim(), marks = COMPARE_MARKS[label] ?? [];
    return `<tr><th scope="row">${inline(label)}</th>${row.slice(1).map((cell, index) => { const mark = marks[index] === "yes" ? yes : marks[index] === "no" ? no : ""; return `<td${index === 0 ? ' class="ours"' : ""}><span class="cell">${mark}<span>${inline(cell.text)}</span></span></td>`; }).join("")}</tr>`;
  }).join("");
  return `<div class="table-wrap"><table class="compare-table">${head}<tbody>${rows}</tbody></table></div>`;
}

export function compareMain(page, breadcrumbs) {
  const { intro, sections } = splitSections(page.body);
  const out = [`<section class="d-hero">${breadcrumbs}<h1>${escape(page.title)}</h1><div class="d-lead">${blocks(intro)}</div></section>`];
  const fits = [];
  const flushFits = () => { if (fits.length) out.push(`<section class="fits" aria-label="Which one fits">${fits.splice(0).join("")}</section>`); };
  for (const section of sections) {
    const tokens = content(section.tokens);
    const table = tokens.find(token => token.type === "table");
    const list = tokens.find(token => token.type === "list");
    if (section.id !== "how-they-work" && !section.id.endsWith("fits-when")) flushFits();
    if (section.id === "how-they-work") {
      const paragraphs = tokens.filter(token => token.type === "paragraph").map(token => leadOf(token.text));
      const text = name => inline(paragraphs.find(([lead]) => lead.toLowerCase() === name)?.[1] ?? "");
      out.push(`<section class="flows" aria-labelledby="${section.id}"><h2 id="${section.id}" class="visually-hidden">${inline(section.title)}</h2>`
        + flowCard("With a TMS", `${box("Your repo", "mono")}${verb("upload")}${arrow}${box("TMS copy", "tms")}${arrow}${verb("sync PR")}${arrow}${box("Your repo", "mono")}`, text("with a tms"), false)
        + flowCard("With Fink", `${box("Your repo", "mono")}${verb("read")}${arrow}${box("Fink editor", "fink")}${arrow}${verb("commit")}${arrow}${box("Your repo", "mono")}`, text("with fink"), true)
        + `</section>`);
    } else if (table) {
      out.push(`<section class="d-section" aria-labelledby="${section.id}"><h2 id="${section.id}">${inline(section.title)}</h2>${compareTable(table)}${blocks(tokens.filter(token => token !== table))}</section>`);
    } else if (section.id.endsWith("fits-when") && list) {
      const ours = /^fink\b/i.test(section.title);
      fits.push(`<div class="fit-card${ours ? " fink" : ""}"><h2 id="${section.id}">${inline(section.title)}</h2>${blocks(tokens)}</div>`);
    } else if (list && list.items.every(item => /^\[[^\]]+\]\(\/compare\//.test(item.text))) {
      const cards = list.items.map(item => {
        const [, name, href, line] = /^\[([^\]]+)\]\(([^)]+)\):?\s*([\s\S]*)$/.exec(item.text);
        return `<a class="tool-card" href="${escape(href)}"><span class="tool-name">${escape(name)}</span>${line ? `<span class="tool-line">${inline(line)}</span>` : ""}<span class="tool-more">Read the comparison</span></a>`;
      }).join("");
      out.push(`<section class="d-section" aria-labelledby="${section.id}"><h2 id="${section.id}">${inline(section.title)}</h2><div class="tool-grid">${cards}</div><div class="facts">${blocks(tokens.filter(token => token !== list))}</div></section>`);
    } else out.push(prose(section));
  }
  flushFits();
  out.push(ctaBand("compare-cta", ""));
  return out.join("\n");
}

/* /teams */

const ROLE = { "translator or pm": ["translator", "Translator or PM"], developer: ["developer", "Developer"], fink: ["fink", "Fink"] };
const roleOf = lead => ROLE[lead.toLowerCase()] ?? ["other", lead];
const STEP_ICONS = ["link", "edit", "commit", "pull", "release"];

function steps(section, tokens) {
  const list = tokens.find(token => token.type === "list" && token.ordered);
  const items = list.items.map((item, index) => {
    const [lead, text] = leadOf(item.text), [role, label] = roleOf(lead);
    return `<li class="step ${role}"><span class="step-top"><span class="step-icon">${svg(ICONS[STEP_ICONS[index]] ?? ICONS.edit)}</span><span class="step-role">${escape(label)}</span></span><span class="step-number">Step ${index + 1}</span><span class="step-text">${inline(text)}</span></li>`;
  }).join("");
  return `<section class="d-section" aria-labelledby="${section.id}"><h2 id="${section.id}">${inline(section.title)}</h2><ol class="steps">${items}</ol><div class="d-note">${blocks(tokens.filter(token => token !== list))}</div></section>`;
}

function checks(section, tokens) {
  const list = tokens.find(token => token.type === "list");
  const cards = list.items.map(item => {
    const [lead, text] = leadOf(item.text);
    return `<li class="check-card"><span class="check-chip">${inline(lead)}</span><span class="check-text">${inline(text)}</span></li>`;
  }).join("");
  const before = tokens.slice(0, tokens.indexOf(list)), after = tokens.slice(tokens.indexOf(list) + 1);
  return `<section class="d-section" aria-labelledby="${section.id}"><h2 id="${section.id}">${inline(section.title)}</h2><div class="d-intro">${blocks(before)}</div><ul class="checks">${cards}</ul>${after.length ? `<div class="d-note">${blocks(after)}</div>` : ""}</section>`;
}

function roles(section, tokens) {
  const list = tokens.find(token => token.type === "list");
  const cards = list.items.map(item => {
    const [lead, text] = leadOf(item.text), [role] = roleOf(lead);
    const icon = role === "translator" ? ICONS.person : role === "developer" ? ICONS.code : ICONS.eye;
    return `<li class="role-card ${role}"><span class="role-icon">${svg(icon, 22)}</span><h3>${escape(lead)}</h3><div>${inline(text)}</div></li>`;
  }).join("");
  return `<section class="d-section" aria-labelledby="${section.id}"><h2 id="${section.id}">${inline(section.title)}</h2><ul class="roles">${cards}</ul><div class="d-note">${blocks(tokens.filter(token => token !== list))}</div></section>`;
}

export const TEAMS_LINK = "fink.inlang.com/?repo=owner/repo&amp;project=project.inlang&amp;branch=translations";

export function teamsMain(page, breadcrumbs, shot) {
  const { intro, sections } = splitSections(page.body);
  const out = [`<section class="d-hero split"><div class="d-hero-text">${breadcrumbs}<h1>${escape(page.title)}</h1><div class="d-lead">${blocks(intro)}</div><p class="d-actions"><a class="button-primary" href="/">Open a repository</a><a href="/docs/translators">Read the guide for translators</a></p></div><div class="shot">${shot}</div></section>`];
  const notes = [];
  const flushNotes = () => { if (notes.length) out.push(`<div class="notes">${notes.splice(0).join("")}</div>`); };
  for (const section of sections) {
    const tokens = content(section.tokens);
    const handler = { "how-a-change-gets-into-your-app": steps, "what-fink-checks": checks, "what-each-person-needs": roles }[section.id];
    const usable = handler && tokens.some(token => token.type === "list");
    if (usable) { flushNotes(); out.push(handler(section, tokens)); }
    else notes.push(`<section class="note-card prose" aria-labelledby="${section.id}"><h2 id="${section.id}">${inline(section.title)}</h2>${blocks(section.tokens)}</section>`);
  }
  flushNotes();
  out.push(ctaBand("teams-cta", `<p class="cta-hint">Send this link to your translators: <code>${TEAMS_LINK}</code></p>`));
  return out.join("\n");
}
