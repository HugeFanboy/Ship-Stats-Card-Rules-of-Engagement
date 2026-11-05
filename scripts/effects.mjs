/**
 * The Effects Table: single source of truth.
 * Used by the ship sheet (checkboxes + roll button) and to generate the RollTable compendium.
 * Keep this file free of Foundry globals so the build scripts can import it from Node.
 */
/**
 * Effects with a direct effect on the sheet's numbers carry machine-readable data:
 *   modifiers:   { stat: +/-n }   added to that stat while the effect is applied
 *   halveEnergy: true             Energy is halved, rounded down (before other Energy changes)
 *   disables:    [stat]           the stat cannot be used (shown as disabled, number kept)
 * All other effects are rules reminders only (they change actions, costs or rolls, not stats).
 */
export const EFFECTS = [
  {
    key: "debris", name: "Debris", range: [1, 8],
    details: "Repairs are made difficult by debris. Expend twice the number of <strong>Energy</strong> dice to repair structural damage."
  },
  {
    key: "sluggishResponse", name: "Sluggish response", range: [9, 16],
    modifiers: { initiative: 2 },
    details: "The crew is disorientated. +2 to <strong>Initiative</strong>."
  },
  {
    key: "skewedBalance", name: "Skewed balance", range: [17, 24],
    modifiers: { evasion: -2 },
    details: "The ship is unbalanced, slowly tilting and drifting. −2 <strong>Evasion</strong> while the effect persists."
  },
  {
    key: "impairedDefense", name: "Impaired defense", range: [25, 32],
    disables: ["armour"],
    details: "You cannot use <strong>Armour</strong> when defending."
  },
  {
    key: "weaponsInstability", name: "Weapons instability", range: [33, 40],
    details: "If not repaired, the next attack decrements your <strong>Volley</strong>. Stacks until repaired or minimum of 1 <strong>Volley</strong>."
  },
  {
    key: "volleyMalfunction", name: "Volley weapons malfunction", range: [41, 48],
    details: "The weapons are damaged and require more energy than they should. Sacrifice 2 additional <strong>Energy</strong> dice when firing <strong>Volley</strong> (that do not count as attack dice)."
  },
  {
    key: "primeMisfire", name: "Prime weapons misfire", range: [49, 56],
    details: "<strong>Prime</strong> weapons may fail to launch. For each dice sacrificed to the attack, roll it (TN 7). On a failed launch (1–6), the ship takes 5 damage and the weapon deals no effect to the target."
  },
  {
    key: "blindspot", name: "Blindspot", range: [57, 64],
    details: "Your aim is off. <em>Enemy Evasion</em> TN −2."
  },
  {
    key: "explosionFire", name: "Explosion/Fire", range: [65, 71],
    details: "At the start of your next turn, inflict 1 damage initially, incrementing the damage each subsequent round until the issue is resolved; in essence, apply 1 damage in the first round, 2 damage in the second round, 3 damage in the third round, and so on."
  },
  {
    key: "lethargicManeuvering", name: "Lethargic maneuvering", range: [72, 78],
    details: "The <em>Maneuver</em> action costs 2 actions."
  },
  {
    key: "rudderJammed", name: "Rudder jammed", range: [79, 85],
    details: "The maneuvering system (the rudder) is jammed (or stuck). You cannot use the <em>Maneuver</em> action."
  },
  {
    key: "leakingEnergy", name: "Leaking energy", range: [86, 92],
    modifiers: { energy: -5 },
    details: "Sacrifice 5 <strong>Energy</strong> dice per round until repaired."
  },
  {
    key: "haemorrhagingEnergy", name: "Haemorrhaging energy", range: [93, 99],
    halveEnergy: true,
    details: "The sails—or reactors—are badly damaged; you can only get half the <strong>Energy</strong> you should (rounded down)."
  },
  {
    key: "criticalDamage", name: "Critical damage", range: [100, 100],
    details: "The ship cannot move and is falling out of the sky, is taking on water, is dead in space, etc. <em>Terminal damage.</em>"
  }
];

export const EFFECT_KEYS = EFFECTS.map((e) => e.key);
export const EFFECT_BY_KEY = new Map(EFFECTS.map((e) => [e.key, e]));

export const effectForRoll = (total) =>
  EFFECTS.find((e) => total >= e.range[0] && total <= e.range[1]);

/** "01‑08" style label; a roll of 100 is printed "00". */
export function rangeLabel({ range: [a, b] }) {
  const f = (n) => String(n === 100 ? 0 : n).padStart(2, "0");
  return a === b ? f(a) : `${f(a)}‑${f(b)}`;
}
