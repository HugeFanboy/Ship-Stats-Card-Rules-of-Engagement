/**
 * Converts docs/Rules_of_Engagement.md (an Obsidian note) into a Foundry JournalEntry compendium source:
 * one JournalEntry per chapter (like a book), each with sub-pages; the module's table-of-contents compendium
 * app lists them. Re-run `npm run build:packs` after editing the markdown.
 *
 * Obsidian syntax handled: %% comments %%, #table tags, > [!NOTE] callouts, ![[image]] embeds, [[#Heading]] links.
 */
import MarkdownIt from "markdown-it";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { MODULE_ID, id } from "./ids.mjs";

const SOURCE = "docs/Rules_of_Engagement.md";
const tableId = id("effects-table"); // same id as build/generate-tables.mjs

const slug = (text) => text.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "");

// Inline styles (plus classes) so callouts look right even if the module stylesheet is cached or not loaded.
const NOTE_STYLE = "margin:.75rem 0;padding:.4rem .85rem;border-left:4px solid #3b82f6;border-radius:4px;background:color-mix(in srgb,#3b82f6 14%,transparent)";
const EXAMPLE_STYLE = "margin:.75rem 0;padding:.4rem .85rem;border-left:4px solid color-mix(in srgb,currentColor 40%,transparent);background:color-mix(in srgb,currentColor 6%,transparent);font-style:italic";
const GRAPHS_STYLE = "display:flex;flex-wrap:wrap;justify-content:center;gap:.75rem;margin:.75rem 0";
const FIGURE_STYLE = "flex:1 1 240px;max-width:420px;margin:0;text-align:center";
const IMG_STYLE = "width:100%;height:auto;border-radius:8px;border:1px solid color-mix(in srgb,currentColor 30%,transparent)";
const CAPTION_STYLE = "font-size:.8rem;opacity:.7";

// ---------------------------------------------------------------- 1. clean the Obsidian markdown
let md = readFileSync(SOURCE, "utf8").replace(/\r\n/g, "\n");

// Source correction: the setup roll still said "1 = Close" although Close range no longer exists.
if (md.includes("(1 = Close, 4 = Extreme)")) {
  console.warn('WARNING: docs/Rules_of_Engagement.md still says "1 = Close"; the journal uses "1 = Short". Please fix the source note.');
  md = md.replace("(1 = Close, 4 = Extreme)", "(1 = Short, 4 = Extreme)");
}
const stale = md.match(/\bClose range\b/gi);
if (stale) console.warn(`WARNING: ${stale.length} remaining mention(s) of "Close range" in the source.`);

md = md.replace(/%%[\s\S]*?%%/g, ""); // Obsidian comments (hidden notes, "/ Carrier", Figma links, ...)

// Carrier-class ships don't exist in this ruleset: Battleship is the only top class.
if (/\bCarrier\b/i.test(md)) {
  console.warn("WARNING: docs/Rules_of_Engagement.md still mentions Carrier-class ships; the journal omits them. Please fix the source note.");
  md = md.replace(/Battleship \/ Carrier/g, "Battleship").replace(/Cruiser, Battleship, Carrier/g, "Cruiser or Battleship");
  const left = md.match(/.{0,40}\bCarrier\b.{0,40}/gi);
  if (left) throw new Error(`Unscrubbed Carrier mention(s): ${left.join(" | ")}`);
}
md = md.replace(/^(?!#)(?!>)[^\n|]*[^\s:]\s*#table[ \t]*$\n?/gm, ""); // table caption lines, e.g. "Initiative #table"
md = md.replace(/[ \t]*#table\b/g, ""); // remaining #table tags (headings, inline)

// Foundry-only pointer to the roll table compendium, placed right under the Effects Table heading.
md = md.replace(
  /^### Effects Table[ \t]*$/m,
  `### Effects Table\n\n> [!NOTE]\n> **Foundry:** roll this table from the Ship Combat Tables compendium (@@TABLE@@), or use the *Roll Effects Table* button on a ship's sheet, which also ticks the result under Applied Effects.`
);

// Callouts: "> [!NOTE]" + quoted lines -> a styled box
md = md.replace(/^> \[!(\w+)\][ \t]*\n((?:>.*\n?)+)/gm, (_, type, body) => {
  const text = body.split("\n").map((line) => line.replace(/^>\s?/, "")).join("\n").trim();
  const title = type.charAt(0) + type.slice(1).toLowerCase();
  return `\n<div class="ssc-note" style="${NOTE_STYLE}">\n\n**${title}**\n\n${text}\n\n</div>\n\n`;
});

// The two tactical graph embeds become one block using the module's own (square) artwork.
md = md.replace(
  /!\[\[TacticalGraphWhiteOnBlack\.webp\]\]\s*\n!\[\[TacticalGraphBlackOnWhite\.webp\]\]/,
  `\n<div class="ssc-graphs" style="${GRAPHS_STYLE}">
<figure style="${FIGURE_STYLE}"><img class="is-dark" style="${IMG_STYLE};background:#000" src="modules/${MODULE_ID}/assets/tactical-graph-dark.webp" alt="Tactical graph, white on black"><figcaption style="${CAPTION_STYLE}">Dark</figcaption></figure>
<figure style="${FIGURE_STYLE}"><img class="is-light" style="${IMG_STYLE};background:#fff" src="modules/${MODULE_ID}/assets/tactical-graph-light.webp" alt="Tactical graph, black on white"><figcaption style="${CAPTION_STYLE}">Light</figcaption></figure>
</div>\n`
);

// ---------------------------------------------------------------- 2. split into chapters (entries) and pages
// "Basic Rules" is split into one chapter per second-level heading (Offense, Defense, ...);
// other top-level headings (Actions, Ship Stats) are one chapter each, with their sub-headings as pages.
const SPLIT_H1 = new Set(["Basic Rules"]);
const INTRO_ENTRY = "Basic Rules"; // the text before the first heading joins this chapter

const blocks = [];
let cur = { level: 0, title: "Overview", lines: [] };
for (const line of md.split("\n")) {
  const h = /^(#{1,3}) (.+?)\s*$/.exec(line);
  if (h) { blocks.push(cur); cur = { level: h[1].length, title: h[2], lines: [] }; } else cur.lines.push(line);
}
blocks.push(cur);

const entries = [];
let entry = null;
let h1 = null;
const startEntry = (name) => {
  entry = { name, id: id(`entry-${name}`), pages: [] };
  entries.push(entry);
};
const addPage = (b, depth) => entry.pages.push({ ...b, depth, id: id(`page-${entry.name}-${b.title}`), entry });
for (const b of blocks) {
  if (b.level === 0) { startEntry(INTRO_ENTRY); addPage(b, 1); continue; }
  if (b.level === 1) {
    h1 = b.title;
    if (!(SPLIT_H1.has(h1) && entry?.name === h1)) startEntry(h1);
    addPage(b, 1);
  } else if (b.level === 2) {
    if (SPLIT_H1.has(h1)) { startEntry(b.title); addPage(b, 1); } else addPage(b, 2);
  } else addPage(b, SPLIT_H1.has(h1) ? 2 : 3);
}

// ---------------------------------------------------------------- 3. heading -> target map for [[#Heading]] links
const headingTarget = new Map();
for (const e of entries) {
  for (const p of e.pages) {
    // chapter headings (H1/H2) link to the chapter itself; H3 links to its page; H4+ to a page anchor
    headingTarget.set(p.title, p.level === 3 ? { entry: e, page: p } : { entry: e });
    for (const line of p.lines) {
      const h = /^#{4,6} (.+?)\s*$/.exec(line);
      if (h) headingTarget.set(h[1], { entry: e, page: p, anchor: slug(h[1]) });
    }
  }
}
const base = `Compendium.${MODULE_ID}.rules.JournalEntry`;
const missing = [];
const resolveLink = (heading) => {
  const t = headingTarget.get(heading);
  if (!t) { missing.push(heading); return heading; }
  const uuid = t.page ? `${base}.${t.entry.id}.JournalEntryPage.${t.page.id}${t.anchor ? `#${t.anchor}` : ""}` : `${base}.${t.entry.id}`;
  return `@UUID[${uuid}]{${heading}}`;
};

// ---------------------------------------------------------------- 4. render
const mdi = new MarkdownIt({ html: true });
mdi.core.ruler.push("ssc_heading_ids", (state) => {
  state.tokens.forEach((tok, i) => {
    if (tok.type === "heading_open") tok.attrSet("id", slug(state.tokens[i + 1].content));
  });
});

for (const e of entries) {
  for (const p of e.pages) {
    let src = p.lines.join("\n");
    const links = [];
    src = src.replace(/\[\[#([^\]]+)\]\]/g, (_, heading) => `@@L${links.push(heading) - 1}@@`);
    let html = mdi.render(src);
    html = html.replace(/@@L(\d+)@@/g, (_, n) => resolveLink(links[Number(n)]));
    html = html.replace("@@TABLE@@", `@UUID[Compendium.${MODULE_ID}.tables.RollTable.${tableId}]{Effects Table}`);
    html = html.replace(/<blockquote>/g, `<blockquote class="ssc-example" style="${EXAMPLE_STYLE}">`);
    p.html = html.trim();
  }
  // drop empty pages (e.g. a heading that only introduces its sub-sections)
  e.pages = e.pages.filter((p) => p.html);
}
const kept = entries.filter((e) => e.pages.length);

// Guard: no Obsidian tags (e.g. "#table") may reach the journal. Links/anchors and entities are excluded.
for (const e of kept) for (const p of e.pages) {
  const visible = p.html.replace(/@UUID\[[^\]]*\]/g, "").replace(/<[^>]+>/g, " ").replace(/&#?\w+;/g, " ");
  const tags = visible.match(/(?:^|\s)#[A-Za-z][\w-]*/g);
  if (tags || /#table/i.test(p.title)) throw new Error(`Obsidian tag(s) left on page "${p.title}": ${(tags ?? []).join(", ")}`);
}
if (missing.length) throw new Error(`Unresolved [[#links]]: ${[...new Set(missing)].join(", ")}`);

// ---------------------------------------------------------------- 5. write one JournalEntry source per chapter
const OUT = "packs/_source/rules";
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
kept.forEach((e, i) => {
  const doc = {
    _id: e.id,
    _key: `!journal!${e.id}`,
    name: e.name,
    pages: e.pages.map((p, n) => ({
      _id: p.id,
      _key: `!journal.pages!${e.id}.${p.id}`,
      name: p.title,
      type: "text",
      title: { show: true, level: p.depth },
      image: {},
      text: { format: 1, content: p.html },
      video: { controls: true, volume: 0.5 },
      src: null,
      system: {},
      sort: (n + 1) * 100000,
      ownership: { default: -1 },
      flags: {}
    })),
    folder: null,
    sort: (i + 1) * 100000,
    ownership: { default: 0 },
    flags: { [MODULE_ID]: { chapter: i + 1 }, core: { sheetClass: `${MODULE_ID}.RulesJournalSheet` } }
  };
  writeFileSync(`${OUT}/${String(i + 1).padStart(2, "0")}-${slug(e.name)}.json`, JSON.stringify(doc, null, 2));
});
console.log(`Generated ${kept.length} rules chapters: ${kept.map((e) => `${e.name} (${e.pages.length})`).join(" | ")}`);
