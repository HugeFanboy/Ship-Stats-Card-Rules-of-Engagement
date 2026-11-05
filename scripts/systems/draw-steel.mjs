/**
 * Draw Steel adapter: what the ship actor needs on top of the generic one to run under the Draw Steel system.
 */
import { startShipTurn } from "../combat.mjs";

export default {
  id: "draw-steel",

  /** Draw Steel's combat calls these on every combatant's actor, so ships must answer them. */
  dataModel: (Base) =>
    class DrawSteelShipData extends Base {
      get combat() { return { turns: 1 }; }
      get isMinion() { return false; }
      startCombat() {}
      _onStartTurn() { return startShipTurn(this.parent); }
      _onEndTurn() {}
    },

  /** Draw Steel asks sheets to re-render parts that do not exist here; fall back to ours. */
  sheet: (Base) =>
    class DrawSteelShipSheet extends Base {
      async render(options = {}, _options = {}) {
        if (options && typeof options === "object" && Array.isArray(options.parts)) {
          const parts = options.parts.filter((p) => p in Base.PARTS);
          options = { ...options, parts: parts.length ? parts : Object.keys(Base.PARTS) };
        }
        return super.render(options, _options);
      }
    },

  /** Draw Steel's own initiative mode (side-based, counter initiative): leave initiative alone there. */
  usesSystemInitiative: () => Boolean(game.combats?.isDefaultInitiativeMode),

  init() {}
};
