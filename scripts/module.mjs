import { MODULE_ID, SHIP_TYPE } from "./constants.mjs";
import ShipData from "./ship-data.mjs";
import ShipSheet from "./ship-sheet.mjs";
import { registerTacticalGraphSettings } from "./tactical-graph.mjs";
import { registerRulesCompendium } from "./rules-compendium.mjs";
import { registerCombat, startShipTurn } from "./combat.mjs";


Hooks.once("ready", () => registerCombat());

Hooks.once("init", () => {
  registerTacticalGraphSettings();
  registerRulesCompendium();

  // Last range chosen in the Attack dialog, and the turn-start Energy prompt.
  game.settings.register(MODULE_ID, "lastRange", { scope: "client", config: false, type: Number, default: 1 });
  game.settings.register(MODULE_ID, "promptAllocation", {
    name: "SHIPSTATS.Settings.PromptAllocation",
    hint: "SHIPSTATS.Settings.PromptAllocationHint",
    scope: "client", config: true, type: Boolean, default: true
  });

  CONFIG.Actor.dataModels[SHIP_TYPE] = ShipData;

  // Attributes selectable as token bars / values.
  CONFIG.Actor.trackableAttributes[SHIP_TYPE] = {
    bar: ["structure", "systems", "armour", "prime"],
    value: ["evasion", "volley", "maneuverability", "energy.committed"]
  };

  foundry.applications.apps.DocumentSheetConfig.registerSheet(Actor, MODULE_ID, ShipSheet, {
    types: [SHIP_TYPE],
    makeDefault: true,
    label: "SHIPSTATS.SheetLabel"
  });
});

/* ------------------------------------------------------------------ */
/*  Combat: a ship's Energy allocation and used actions reset when its  */
/*  turn starts.                                                        */
/* ------------------------------------------------------------------ */

// With several GMs online, only one client performs the update.
Hooks.on("combatTurnChange", async (combat, prior, current) => {
  if (game.users.activeGM !== game.user) return;
  const combatant = combat.combatants.get(current?.combatantId) ?? combat.turns?.[current?.turn];
  await startShipTurn(combatant?.actor);
});

Hooks.on("combatStart", async (combat) => {
  if (game.users.activeGM !== game.user) return;
  // Every ship starts the battle with a clean slate; the first ship to act also gets the allocation prompt.
  const first = combat.combatant?.actor;
  for (const combatant of combat.combatants) {
    if (combatant.actor !== first) await startShipTurn(combatant.actor, { prompt: false });
  }
  await startShipTurn(first);
});
