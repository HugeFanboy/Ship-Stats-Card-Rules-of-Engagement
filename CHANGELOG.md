# Changelog

## 0.4.0
- The ship actor type is now system-agnostic: `scripts/ship-actor.mjs` registers it (data model, token bars, sheet) in any game system.
- Everything specific to one game system lives in its own adapter file under `scripts/systems/` (`draw-steel.mjs`; `generic.mjs` is used for systems without one). The Draw Steel combat hooks, sheet re-render fix and side-based initiative check moved there, unchanged.
- The pack build compiles the Example Ships into every `ships` / `ships-<system-id>` Actor pack listed in module.json, so a new system gets the compendium with one module.json entry.
- Added a Project FU adapter (`scripts/systems/projectfu.mjs`), starting as a copy of the generic one.

## 0.3.2
- Clean-up, no behaviour changes: shared constants (module id, ship type, target number, ranges) live in one file; the Effects Table roll and the hull-damage reminders are single shared functions; effect lookups use a map; repeated "mark action used" code merged.

## 0.3.1
- Fix: combats containing ships would not start under Draw Steel. Draw Steel calls its own combat methods (startCombat, turn start/end, turn counters) on every combatant's actor; ships now answer them.
- Draw Steel's side-based initiative mode is left alone: ship initiative sorting, the tracker roll and the Initiative-button push only apply when the system is not using its own initiative.
- A ship's turn start (reset + Energy allocation prompt) now also runs when Draw Steel activates the ship's combatant.
- Ship sheets ignore re-render requests for parts they do not have.

## 0.3.0
- Targeting: Attack uses the ship you target with Foundry's target tool. It posts an attack card in chat; the target's owner (or GM) clicks "Roll Evasion" to choose Evasion dice, optionally add Armour (which then drops by 1) and roll against a TN lowered by range (-2 per step beyond Medium, Blindspot -2). Boarding cancels two dice per success; Prime deals 5 if any die gets through; Ramming resolves impact damage on both ships and rolls the survivors by range.
- "Apply" button on the card: damage goes to Structural Integrity or (player's choice) Systems, and 10+ damage rolls the Effects Table automatically. Targeting a system trades damage for -1 Systems and an Effects Table roll. Everything that changes another ship runs through the GM's client.
- Attack dialog asks for the range to the target and remembers the last one. Prime attacks use one Prime charge.
- Combat tracker: the Initiative button writes the total into the active combat (adding the ship's token if needed), ships sort lowest first, and the tracker's own initiative roll uses the ship's dice.
- At the start of a ship's turn, whoever plays it gets an Energy allocation dialog and the Actions tab opens (client setting to turn this off).
- No target selected: attacks behave as before (chat message only).

## 0.2.12
- Maneuver asks how many Energy dice to spend (default: the most allowed) instead of using them all.

## 0.2.11
- Repair System and Maneuver get a "Use Energy" button. Repair System sacrifices all the Captain's remaining Energy up to the Systems damage and restores Systems (Overwork loss first). Maneuver sacrifices all the Pilot's remaining Energy up to Maneuverability (half for NPC ships).

## 0.2.10
- Class change now also loads the default stats from the sheet itself (not only the data model), and shows a "Loaded the default ... stats" notice.

## 0.2.9
- Changing a ship's class loads that class's stats from the Example Ships table (Structural Integrity, Evasion, Armour, Volley, Prime, Systems, Maneuverability; Energy follows as 3 x Systems), with every pool at full strength. Overwork loss is cleared; Mods, effects and notes are kept. New ships created with a class start with its stats too.

## 0.2.8
- Attack is now one action with an "Attack..." dialog: Volley, Prime, Ramming (commit dice / make contact) or Boarding. Ramming and Boarding are no longer separate actions.
- Volley/Prime/Boarding sacrifice dice from the Pilot's Energy (Volley malfunction adds 2 extra dice; Prime misfire rolls each die at TN 7). Ramming commit uses the Committed Energy counter; contact deals the dice as damage to both ships and rolls them by range for +5 per success. Rudder jammed hides the ramming options.

## 0.2.7
- Stats/Actions now use Foundry's own tab system and styling (same look as other sheets).
- Actions tab: crew roles are laid out as responsive cards in a grid (two columns, one when narrow); summary numbers sit in one row.
- Stylesheet renamed to styles/ssc-v3.css so Foundry/browser caches load the new styles.

## 0.2.6
- Fix: the Stats/Actions tabs did nothing because their action name clashed with Foundry's built-in `tab` action. Renamed.

## 0.2.5
- Prime misfire: while the effect is active, Attack gets a "Roll Prime launch" button. Each sacrificed die is rolled at TN 7; every failed die costs the ship 5 damage, and only the launched dice reach the target's Evasion roll.
- Overwork the Crew: the extra Energy is added on top of the normal pool (shown as a note on Energy), and the Systems loss is tracked separately from the base Systems value. Energy follows it from the next turn. Repairing Systems with + removes Overwork loss first.

## 0.2.4
- Actions tab: Roll buttons for Overwork the Crew, Analyse, Target System, Repair Structural Damage, Repair Critical Damage and Ramming (d12s, TN 9; ramming TN by range). Each asks how many dice, posts the roll to chat and ticks the action as used.
- Dice spent by a roll are taken from that position's Energy and leave the pool for the turn. Target System successes move to the Pilot.
- Overwork the Crew: successes become extra Energy to hand out this turn and Systems goes down by 1 (no Effects Table roll).
- Repair Structural Damage restores Structural Integrity (Debris doubles the Energy cost). Repair Critical Damage can remove an applied effect on success.
- Bonus and spent Energy reset when the ship's turn starts.

## 0.2.3
- Ship sheet: new Actions tab. All rule actions grouped by crew role (Captain/Engineer, Sensors/Weapons, Pilot/Helmsman, Mechanic/Carpenter), with costs, descriptions and notes from active effects (e.g. Rudder jammed disables Maneuver).
- Energy allocation per role: typing a number (or -/+/All) reduces "Left to allocate"; values are clamped to the available Energy.
- Action tracking: tick used actions; counter shows actions used out of 3 (Maneuver counts double under Lethargic maneuvering).
- Allocation and used actions reset at the start of each combat turn of the ship (GM client), and via "Reset this turn".

## 0.2.2
- Tactical Graph scene: grid size 125 px (tokens half as large); the artwork is unchanged at 2478 x 2478 px.

## 0.2.1
- Rules chapters use their own core-based journal sheet, so systems that restyle all journals (Draw Steel) no longer change their look.
- Rules compendium now uses Foundry's own theme colors and fonts (light and dark) instead of custom ones.
- Rules of Engagement is now a book-style compendium: 10 chapters with a table of contents window, Previous/Contents/Next navigation, light/dark paper styling. No world copy is created any more; the settings button opens the compendium.

## 0.2.0
- Ship sheet: grouped Play/Edit layout, stat modifiers, NPC switch, Lucide icons, Applied Effects checklist.
- Applied Effects now change the sheet: Skewed balance, Sluggish response, Impaired defense, Leaking energy, Haemorrhaging energy.
- Edit mode: "Clear all effects" button.
- Tactical Graph scene (settings button) with dark/light theme setting.
- Rules of Engagement journal compendium, plus a settings button that opens it (imports one copy, never duplicates).
- Battleship is the only top ship class (Carrier removed from the rules text and the module).
