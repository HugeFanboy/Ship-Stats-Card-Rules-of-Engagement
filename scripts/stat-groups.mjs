/**
 * Stat grouping for the Play/Edit sheet, mirroring the Figma prototype:
 * four cards, two stats each. In Play mode only the SECOND stat of each card is interactive
 * (Armour, Prime and Systems get -/+ buttons; Initiative gets a roll button).
 *
 * kind: "number"     plain number, edited in Edit mode only
 *       "derived"    computed from other stats (Energy = 3 x Systems)
 *       "pool"       current value + max (Armour, Prime, Systems)
 *       "initiative" dice formula derived from the ship class
 */
export const STAT_GROUPS = [
  {
    title: "SHIPSTATS.Group.Defense",
    stats: [
      { key: "evasion", label: "SHIPSTATS.Evasion", tip: "SHIPSTATS.Tip.Evasion", icon: "navigation", color: "SteelBlue", kind: "number", roll: "evasion" },
      { key: "armour", label: "SHIPSTATS.Armour", tip: "SHIPSTATS.Tip.Armour", icon: "shield", color: "SkyBlue", kind: "pool" }
    ]
  },
  {
    title: "SHIPSTATS.Group.Weapons",
    stats: [
      { key: "volley", label: "SHIPSTATS.Volley", tip: "SHIPSTATS.Tip.Volley", icon: "zap", color: "Crimson", kind: "number" },
      { key: "prime", label: "SHIPSTATS.Prime", tip: "SHIPSTATS.Tip.Prime", icon: "bomb", color: "FireBrick", kind: "pool" }
    ]
  },
  {
    title: "SHIPSTATS.Group.Power",
    stats: [
      { key: "energy", label: "SHIPSTATS.Energy", tip: "SHIPSTATS.Tip.Energy", icon: "battery-charging", color: "Gold", kind: "derived" },
      { key: "systems", label: "SHIPSTATS.Systems", tip: "SHIPSTATS.Tip.Systems", icon: "cpu", color: "Khaki", kind: "pool" }
    ]
  },
  {
    title: "SHIPSTATS.Group.Mobility",
    stats: [
      { key: "maneuverability", label: "SHIPSTATS.Maneuverability", tip: "SHIPSTATS.Tip.Maneuverability", icon: "route", color: "LimeGreen", kind: "number" },
      { key: "initiative", label: "SHIPSTATS.Initiative", tip: "SHIPSTATS.Tip.Initiative", icon: "radar", color: "SpringGreen", kind: "initiative", roll: "initiative" }
    ]
  }
];
