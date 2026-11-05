/**
 * Settings button that opens the Rules of Engagement journal.
 * The journal ships in a compendium; the first use imports ONE world copy (flagged, never duplicated).
 */
const MODULE_ID = "ship-stats-card";
const PACK_ID = `${MODULE_ID}.rules`;
const ENTRY_NAME = "Rules of Engagement";
const FLAG = "rulesJournal";
const l = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

/** An existing world copy: flagged by this module, imported from the compendium, or sharing its id. */
function findWorldCopy(sourceId, sourceUuid) {
  return (
    game.journal.find((j) => j.getFlag(MODULE_ID, FLAG) || j._stats?.compendiumSource === sourceUuid) ??
    game.journal.get(sourceId) ??
    null
  );
}

/** Internal links point at the compendium copy; repoint them at the world copy's pages. */
async function relinkPages(entry, sourcePages) {
  const idByName = new Map(entry.pages.map((p) => [p.name, p.id]));
  const idMap = new Map(sourcePages.map((p) => [p.id, idByName.get(p.name)]));
  const re = new RegExp(`@UUID\\[Compendium\\.${PACK_ID.replace(/\./g, "\\.")}\\.JournalEntry\\.\\w+\\.JournalEntryPage\\.(\\w+)`, "g");
  const updates = [];
  for (const page of entry.pages) {
    const content = page.text?.content ?? "";
    const next = content.replace(re, (match, pageId) =>
      idMap.get(pageId) ? `@UUID[JournalEntry.${entry.id}.JournalEntryPage.${idMap.get(pageId)}` : match
    );
    if (next !== content) updates.push({ _id: page.id, "text.content": next });
  }
  if (updates.length) await entry.updateEmbeddedDocuments("JournalEntryPage", updates);
}

export async function openRulesJournal() {
  const pack = game.packs.get(PACK_ID);
  const index = pack ? await pack.getIndex() : null;
  const source = index?.find((e) => e.name === ENTRY_NAME);
  if (!source) {
    ui.notifications.error(l("SHIPSTATS.Rules.Missing"));
    return null;
  }
  const sourceUuid = source.uuid ?? `Compendium.${PACK_ID}.JournalEntry.${source._id}`;

  // 1) Already in the world: just open it (never create a second copy).
  const existing = findWorldCopy(source._id, sourceUuid);
  if (existing) {
    if (game.user.isGM && !existing.getFlag(MODULE_ID, FLAG)) await existing.setFlag(MODULE_ID, FLAG, true);
    existing.sheet.render(true);
    return existing;
  }

  // 2) Not imported yet. Only a GM can create it; players read the compendium copy meanwhile.
  if (!game.user.isGM) {
    const doc = await pack.getDocument(source._id);
    ui.notifications.info(l("SHIPSTATS.Rules.OpenedFromCompendium"));
    doc.sheet.render(true);
    return doc;
  }

  // 3) GM: import exactly one copy, readable by players.
  const sourceDoc = await pack.getDocument(source._id);
  const entry = await game.journal.importFromCompendium(
    pack,
    source._id,
    {
      ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER },
      flags: { [MODULE_ID]: { [FLAG]: true } }
    },
    { keepId: true }
  );
  try {
    await relinkPages(entry, sourceDoc.pages);
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not repoint the journal's internal links`, err);
  }
  ui.notifications.info(l("SHIPSTATS.Rules.Imported", { name: entry.name }));
  entry.sheet.render(true);
  return entry;
}

/** Settings menu entry: acts as a button (no window of its own). */
class OpenRulesJournalMenu extends foundry.applications.api.ApplicationV2 {
  async render() {
    await openRulesJournal();
    return this;
  }
}

export function registerRulesJournalSettings() {
  game.settings.registerMenu(MODULE_ID, "openRulesJournal", {
    name: "SHIPSTATS.Settings.Rules.Name",
    label: "SHIPSTATS.Settings.Rules.Label",
    hint: "SHIPSTATS.Settings.Rules.Hint",
    icon: "fa-solid fa-book",
    type: OpenRulesJournalMenu,
    restricted: false
  });
}
