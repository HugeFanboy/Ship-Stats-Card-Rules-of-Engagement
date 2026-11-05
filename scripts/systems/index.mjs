/**
 * Game system adapters for the ship actor type.
 *
 * The ship actor itself (data model, sheet, combat flow) is system-agnostic. Anything a particular
 * game system needs on top of it lives in one file per system in this folder. To support another
 * system: copy generic.mjs to <system-id>.mjs, fill in what that system needs, and add it to
 * ADAPTERS below (and, for the Example Ships compendium, add a "ships-<system-id>" pack to module.json).
 */
import generic from "./generic.mjs";
import drawSteel from "./draw-steel.mjs";
import projectFU from "./projectfu.mjs";

export const ADAPTERS = Object.fromEntries([drawSteel, projectFU].map((a) => [a.id, a]));

/** The adapter for the world's game system, or the generic one when the system has none. */
export function systemAdapter() {
  const adapter = ADAPTERS[globalThis.game?.system?.id];
  return adapter ? { ...generic, ...adapter } : generic;
}
