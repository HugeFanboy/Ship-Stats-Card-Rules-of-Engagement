import { EFFECTS, EFFECT_KEYS } from "./effects.mjs";
import { ACTION_KEYS } from "./actions.mjs";

const { SchemaField, NumberField, StringField, HTMLField, SetField, BooleanField } = foundry.data.fields;

/**
 * Ship classes: initiative dice (lower roll acts first) and the Example Ships table of the rules.
 * Energy is not listed: it is 3 x Systems.
 */
export const SHIP_CLASSES = {
  battleship: { label: "SHIPSTATS.Class.battleship", initiative: "2d12", stats: { structure: 50, evasion: 2, armour: 20, volley: 12, prime: 12, systems: 30, maneuverability: 2 } },
  cruiser: { label: "SHIPSTATS.Class.cruiser", initiative: "2d10", stats: { structure: 40, evasion: 3, armour: 12, volley: 10, prime: 8, systems: 25, maneuverability: 3 } },
  frigate: { label: "SHIPSTATS.Class.frigate", initiative: "2d8", stats: { structure: 30, evasion: 4, armour: 7, volley: 8, prime: 6, systems: 15, maneuverability: 4 } },
  corvette: { label: "SHIPSTATS.Class.corvette", initiative: "2d6", stats: { structure: 20, evasion: 5, armour: 5, volley: 6, prime: 5, systems: 10, maneuverability: 5 } },
  destroyer: { label: "SHIPSTATS.Class.destroyer", initiative: "2d4", stats: { structure: 10, evasion: 8, armour: 2, volley: 4, prime: 3, systems: 6, maneuverability: 6 } }
};

/** The system data (full pools, nothing damaged) for a ship class's default stat layout. */
export function classDefaults(shipClass) {
  const st = SHIP_CLASSES[shipClass]?.stats;
  if (!st) return null;
  const pool = (n) => ({ value: n, max: n });
  return {
    structure: pool(st.structure),
    armour: pool(st.armour),
    prime: pool(st.prime),
    systems: { ...pool(st.systems), overwork: 0, overworkEnergy: 0 },
    evasion: st.evasion,
    volley: st.volley,
    maneuverability: st.maneuverability
  };
}

/** Stats that can carry a modification (one per stat, as in the rules). */
export const MOD_STATS = ["evasion", "armour", "volley", "prime", "energy", "systems", "maneuverability", "initiative"];

const int = (initial, min = 0) =>
  new NumberField({ required: true, nullable: false, integer: true, min, initial });

// Every pool has a value and a max, so it can be used as a token bar.
// A stat modification: an optional +/- number plus the modification's name and description.
const modification = () =>
  new SchemaField({
    active: new BooleanField({ required: true, initial: false }),
    value: new NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
    text: new StringField({ required: true, blank: true, initial: "" })
  });

const pool = (value, max) => new SchemaField({ value: int(value), max: int(max) });

export default class ShipData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      shipClass: new StringField({
        required: true,
        blank: false,
        initial: "destroyer",
        choices: Object.keys(SHIP_CLASSES)
      }),
      structure: pool(10, 10), // Structural Integrity
      // overwork: Systems lost to Overwork the Crew (separate from the base value; repairs remove it first).
      // overworkEnergy: the part of that loss already reflected in Energy (catches up when the ship's turn starts).
      systems: new SchemaField({ value: int(6), max: int(6), overwork: int(0), overworkEnergy: int(0) }),
      armour: pool(2, 2),
      prime: pool(3, 3), // Prime weapon ammo/charges
      evasion: int(8),
      volley: int(4),
      maneuverability: int(6),
      // committed: dice held over from earlier rounds (e.g. ramming). spent: dice used by rolled actions
      // this turn. bonus: extra dice from Overwork the Crew this turn. spent and bonus reset each turn.
      energy: new SchemaField({ committed: int(0), spent: int(0), bonus: int(0) }),
      // Energy dice given to each crew position this turn (reset when the ship's turn starts).
      allocation: new SchemaField({ captain: int(0), sensors: int(0), pilot: int(0), mechanic: int(0) }),
      // Actions already taken this turn (reset when the ship's turn starts).
      actionsUsed: new SetField(new StringField({ required: true, blank: false, choices: ACTION_KEYS })),
      isNPC: new BooleanField({ required: true, initial: false }),
      mods: new SchemaField(Object.fromEntries(MOD_STATS.map((key) => [key, modification()]))),
      effects: new SetField(new StringField({ required: true, blank: false, choices: EFFECT_KEYS })),
      notes: new HTMLField()
    };
  }

  /** Older versions stored effects as free text; reset to an empty set. */
  static migrateData(source) {
    if (typeof source.effects === "string") source.effects = [];
    // Ramming and Boarding are now options of the Attack action.
    if (Array.isArray(source.actionsUsed)) source.actionsUsed = source.actionsUsed.filter((k) => ACTION_KEYS.includes(k));
    return super.migrateData(source);
  }

  prepareDerivedData() {
    const cls = SHIP_CLASSES[this.shipClass] ?? SHIP_CLASSES.destroyer;
    this.initiativeDice = cls.initiative;

    // Applied Effects Table results that change numbers (kept separate from the stat modifications).
    const effectMods = Object.fromEntries(MOD_STATS.map((key) => [key, 0]));
    const effectNotes = Object.fromEntries(MOD_STATS.map((key) => [key, []]));
    const effectDisabled = {};
    let halveEnergy = false;
    for (const effect of EFFECTS) {
      if (!this.effects.has(effect.key)) continue;
      for (const [stat, delta] of Object.entries(effect.modifiers ?? {})) {
        effectMods[stat] += delta;
        effectNotes[stat].push(`${effect.name} ${delta > 0 ? "+" : "\u2212"}${Math.abs(delta)}`);
      }
      if (effect.halveEnergy) {
        halveEnergy = true;
        effectNotes.energy.push(`${effect.name} \u00d7\u00bd`);
      }
      for (const stat of effect.disables ?? []) {
        effectDisabled[stat] = true;
        effectNotes[stat].push(`${effect.name}: cannot be used`);
      }
    }
    this.effectMods = effectMods;
    this.effectNotes = effectNotes;
    this.effectDisabled = effectDisabled;

    // Effective values = base + modification + applied effects (never below 0). Base fields stay
    // untouched so the Edit mode and token bars keep working with the stored numbers.
    const mod = (key) => (this.mods[key].active ? this.mods[key].value : 0);
    const flat = (key) => Math.max(0, this[key] + mod(key) + effectMods[key]);
    const poolOf = (key) => ({
      value: Math.max(0, this[key].value + mod(key) + effectMods[key]),
      max: Math.max(0, this[key].max + mod(key) + effectMods[key])
    });
    this.effective = {
      evasion: flat("evasion"),
      volley: flat("volley"),
      maneuverability: flat("maneuverability"),
      armour: poolOf("armour"),
      prime: poolOf("prime"),
      systems: poolOf("systems")
    };
    // Overwork the Crew takes Systems off the shown value without touching the base value.
    if (this.systems.overwork > 0) {
      this.effective.systems.value = Math.max(0, this.effective.systems.value - this.systems.overwork);
      this.effectNotes.systems.push(`Overwork \u2212${this.systems.overwork}`);
    }
    this.initiativeBonus = mod("initiative") + effectMods.initiative;

    // Energy = 3 x Systems (base value, as in the prototype) + the Energy modification;
    // Haemorrhaging energy halves it (rounded down), then Leaking energy takes 5 off.
    // Committed dice may exceed the maximum.
    let energy = Math.max(0, Math.max(0, this.systems.value - this.systems.overworkEnergy) * 3 + mod("energy"));
    if (halveEnergy) energy = Math.floor(energy / 2);
    this.energy.max = Math.max(0, energy + effectMods.energy) + this.energy.bonus;
    if (this.energy.bonus) effectNotes.energy.push(`Overwork +${this.energy.bonus}`);
    this.energy.available = Math.max(0, this.energy.max - this.energy.committed - this.energy.spent);
    // Energy handed out to crew positions; what is left can still be allocated.
    this.energy.allocated = Object.values(this.allocation).reduce((sum, n) => sum + n, 0);
    this.energy.unallocated = Math.max(0, this.energy.available - this.energy.allocated);
  }

  /** Changing the ship class loads that class's default stats (Example Ships table), at full strength. */
  async _preUpdate(changes, options, user) {
    const allowed = await super._preUpdate(changes, options, user);
    if (allowed === false) return false;
    const next = foundry.utils.getProperty(changes, "system.shipClass");
    const defaults = next && next !== this.shipClass ? classDefaults(next) : null;
    if (defaults) foundry.utils.mergeObject(changes, { system: defaults }, { overwrite: false });
  }

  /** Ships get a linked token (one shared state per ship) with bars for Structure and Systems. */
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if (allowed === false) return false;
    // A ship created with a class (and no stats of its own) starts with that class's stat layout.
    const cls = data.system?.shipClass;
    if (cls && !data.system.structure && classDefaults(cls)) this.parent.updateSource({ system: classDefaults(cls) });
    if (!foundry.utils.hasProperty(data, "prototypeToken.actorLink")) {
      this.parent.updateSource({
        prototypeToken: {
          actorLink: true,
          displayBars: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
          displayName: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
          bar1: { attribute: "structure" },
          bar2: { attribute: "systems" }
        }
      });
    }
  }
}
