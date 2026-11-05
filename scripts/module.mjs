import { MODULE_ID } from "./constants.mjs";
import { registerShipActor } from "./ship-actor.mjs";
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

  registerShipActor();
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
