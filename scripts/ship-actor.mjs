/**
 * The ship actor type ("ship-stats-card.ship"), declared in module.json under documentTypes.
 * Registers its data model, token attributes and sheet, applying the adapter for the world's
 * game system (see scripts/systems/).
 */
import { MODULE_ID, SHIP_TYPE } from "./constants.mjs";
import ShipData from "./ship-data.mjs";
import ShipSheet from "./ship-sheet.mjs";
import { systemAdapter } from "./systems/index.mjs";

/** Call from the "init" hook. */
export function registerShipActor() {
  const adapter = systemAdapter();

  CONFIG.Actor.dataModels[SHIP_TYPE] = adapter.dataModel(ShipData);

  // Attributes selectable as token bars / values.
  CONFIG.Actor.trackableAttributes[SHIP_TYPE] = {
    bar: ["structure", "systems", "armour", "prime"],
    value: ["evasion", "volley", "maneuverability", "energy.committed"]
  };

  foundry.applications.apps.DocumentSheetConfig.registerSheet(Actor, MODULE_ID, adapter.sheet(ShipSheet), {
    types: [SHIP_TYPE],
    makeDefault: true,
    label: "SHIPSTATS.SheetLabel"
  });

  adapter.init();
  console.log(`${MODULE_ID} | Ship actor registered (system adapter: ${adapter.id})`);
}
