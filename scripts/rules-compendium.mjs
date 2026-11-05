/**
 * Rules of Engagement compendium: shown as a book-style table of contents (like the Draw Steel system's
 * journal compendiums), with Previous / Contents / Next navigation on every chapter and a paper-style sheet.
 * Nothing is imported into the world; players read straight from the compendium.
 */
import { MODULE_ID } from "./constants.mjs";

const PACK_ID = `${MODULE_ID}.rules`;
const l = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

/**
 * Journal sheet for the rules chapters. It extends Foundry's CORE journal sheet on purpose: some game systems
 * (Draw Steel, for one) register their own themed journal sheet as the default for every journal, which would
 * restyle these chapters. Each chapter selects this sheet through its `core.sheetClass` flag.
 */
export class RulesJournalSheet extends foundry.applications.sheets.journal.JournalEntrySheet {
  static DEFAULT_OPTIONS = { classes: ["ssc-rules"] };
}
export const RULES_SHEET_ID = `${MODULE_ID}.RulesJournalSheet`;

/** Compendium window that renders the rules journal pack as a table of contents. */
export class RulesCompendiumTOC extends foundry.applications.sidebar.apps.Compendium {
  static DEFAULT_OPTIONS = {
    classes: ["ssc-rules", "ssc-toc"],
    position: { width: 760, height: 900 },
    window: { contentTag: "article", resizable: true }
  };

  static PARTS = {
    header: { template: `modules/${MODULE_ID}/templates/rules-toc/header.hbs`, templates: [] },
    contents: { template: `modules/${MODULE_ID}/templates/rules-toc/contents.hbs`, templates: [] }
  };

  /** @inheritdoc */
  _createContextMenus() {
    this._createContextMenu(this._getEntryContextOptions, "[data-document-id][data-entry-id]", {
      fixed: true,
      parentClassHooks: false,
      hookName: "getJournalEntryContextOptions"
    });
  }

  /** The base class assumes a directory part this window does not use. */
  _configureRenderParts(options) {
    return foundry.utils.deepClone(this.constructor.PARTS);
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.header = { title: l("SHIPSTATS.Rules.Title"), intro: l("SHIPSTATS.Rules.Intro") };
    const documents = (await this.collection.getDocuments()).sort((a, b) => a.sort - b.sort);
    context.chapters = documents.map((entry) => ({
      id: entry.id,
      name: entry.name,
      // chapters list their sub-sections (second-level pages) beneath the chapter title
      pages: entry.pages.contents
        .filter((p) => p.title.level === 2)
        .sort((a, b) => a.sort - b.sort)
        .map((p) => ({ id: p.id, entryId: entry.id, name: p.name }))
    }));
    return context;
  }

  /** Open the chapter (and the clicked page, if any). */
  async _onClickEntry(event, target) {
    const entryId = target.closest("[data-entry-id]")?.dataset.entryId;
    if (!entryId) return;
    const entry = await this.collection.getDocument(entryId);
    if (!entry) return;
    // Open with the module's own (core-styled) sheet even if the flag didn't resolve.
    const sheet = entry.sheet instanceof RulesJournalSheet ? entry.sheet : new RulesJournalSheet({ document: entry });
    sheet.render({ force: true, pageId: target.closest("[data-page-id]")?.dataset.pageId });
  }

  /** No search box in this view. */
  _onSearchFilter(event, query, rgx, html) {}
}

/** Previous / Contents / Next bar at the top of every rules chapter. */
async function injectNavigation(app, element) {
  const doc = app.document;
  const pack = game.packs.get(PACK_ID);
  if (!pack) return;
  const index = (await pack.getIndex({ fields: ["sort"] })).contents.sort((a, b) => a.sort - b.sort);
  const i = index.findIndex((e) => e._id === doc.id);
  const make = (entry, rel) => {
    const li = document.createElement("li");
    if (!entry) return li;
    const a = document.createElement("a");
    a.classList.add("content-link");
    a.dataset.link = "";
    a.dataset.uuid = entry.uuid ?? `Compendium.${PACK_ID}.JournalEntry.${entry._id}`;
    a.dataset.tooltip = l(`SHIPSTATS.Rules.${rel === "prev" ? "Previous" : "Next"}`);
    a.dataset.tooltipDirection = rel === "prev" ? "LEFT" : "RIGHT";
    a.textContent = rel === "prev" ? `← ${entry.name}` : `${entry.name} →`;
    li.append(a);
    return li;
  };
  const contents = document.createElement("li");
  const up = document.createElement("a");
  up.classList.add("ssc-contents-link");
  up.textContent = l("SHIPSTATS.Rules.Contents");
  up.addEventListener("click", (ev) => { ev.preventDefault(); pack.render(true); });
  contents.append(up);

  const nav = document.createElement("nav");
  nav.classList.add("ssc-book-nav");
  const list = document.createElement("ul");
  list.append(make(index[i - 1], "prev"), contents, make(index[i + 1], "next"));
  nav.append(list);

  if (!element.isConnected) return;
  element.querySelectorAll(".ssc-book-nav").forEach((n) => n.remove());
  const anchor = element.querySelector(".journal-entry-content .journal-header");
  if (anchor) anchor.after(nav);
  else (element.querySelector(".journal-entry-pages") ?? element.querySelector(".window-content"))?.prepend(nav);
}

export function openRulesCompendium() {
  const pack = game.packs.get(PACK_ID);
  if (!pack) {
    ui.notifications.error(l("SHIPSTATS.Rules.Missing"));
    return null;
  }
  return pack.render(true);
}

/** Settings menu entry: acts as a button (no window of its own). */
class OpenRulesMenu extends foundry.applications.api.ApplicationV2 {
  async render() {
    openRulesCompendium();
    return this;
  }
}

export function registerRulesCompendium() {
  foundry.applications.apps.DocumentSheetConfig.registerSheet(foundry.documents.JournalEntry, MODULE_ID, RulesJournalSheet, {
    makeDefault: false,
    label: "SHIPSTATS.Rules.SheetLabel"
  });

  game.settings.registerMenu(MODULE_ID, "openRules", {
    name: "SHIPSTATS.Settings.Rules.Name",
    label: "SHIPSTATS.Settings.Rules.Label",
    hint: "SHIPSTATS.Settings.Rules.Hint",
    icon: "fa-solid fa-book",
    type: OpenRulesMenu,
    restricted: false
  });

  // Style every chapter of the rules compendium and add the navigation bar.
  Hooks.on("renderJournalEntrySheet", (app, element) => {
    if (app.document?.pack !== PACK_ID) return;
    element.classList.add("ssc-rules");
    injectNavigation(app, element).catch((err) => console.warn(`${MODULE_ID} | navigation failed`, err));
  });

  // Show the pack as a table of contents instead of the plain directory list.
  Hooks.once("setup", () => {
    const pack = game.packs.get(PACK_ID);
    if (pack) pack.applicationClass = RulesCompendiumTOC;
  });
}
