/**
 * Crew roles and the actions each position can take, from the Rules of Engagement.
 * Free of Foundry globals so it can be tested in Node.
 *
 * notes: { effectKey: text | "disabled" } - applied Effects Table results that change the action.
 */
export const ACTIONS_PER_ROUND = 3;

export const ROLES = [
  {
    key: "captain",
    name: "Captain / Engineer",
    actions: [
      {
        key: "overworkCrew", name: "Overwork the Crew", cost: "Decrement Systems",
        details: "Increase the available <strong>Energy</strong> dice. Roll all the available <strong>Energy</strong> dice; each success is an extra <strong>Energy</strong> dice you can distribute immediately. Doing so decrements <strong>Systems</strong> but does not provoke a roll on the Effects Table."
      },
      {
        key: "repairSystem", name: "Repair System", cost: "Sacrifice [Systems damage]", rollLabel: "Use Energy",
        details: "Sacrifice a number of <strong>Energy</strong> dice equal to the <strong>Systems</strong> damage taken to increment the <strong>Systems</strong> back up, i.e., repair the system damage. You cannot exceed the maximum <strong>Systems</strong> rating for the ship with this action."
      }
    ]
  },
  {
    key: "sensors",
    name: "Sensors / Weapons Officer",
    actions: [
      {
        key: "analyse", name: "Analyse", cost: "Expend at will",
        details: "Analyse an opponent to get more information. Expend at will. Each success can provide you with one stat of your choice on the enemy Stat Sheet."
      },
      {
        key: "targetSystem", name: "Target System", cost: "Expend up to [current Systems], Commit successes",
        details: "Target a system on the enemy’s ship. Expend a number of <strong>Energy</strong> dice up to your <em>current</em> [<strong>Systems</strong>]. Each success is a dice that can be donated to the Pilot to <em>Attack</em>, although this action trades damage for effect."
      }
    ]
  },
  {
    key: "pilot",
    name: "Pilot / Helmsman",
    actions: [
      {
        key: "maneuver", name: "Maneuver", cost: "Sacrifice up to [Maneuverability]", repeatable: true, rollLabel: "Use Energy",
        details: "Maneuver the ship along one vector: Move in, Move out, Shift Sector. Each movement step sacrifices 1 <strong>Energy</strong> dice. You can sacrifice up to [<strong>Maneuverability</strong>] dice. You can move twice per round as one action. You can split this action: perform a maneuver, take another action, perform a second maneuver.",
        notes: { rudderJammed: "disabled", lethargicManeuvering: "Lethargic maneuvering: costs 2 actions" }
      },
      {
        key: "attack", name: "Attack", cost: "Sacrifice up to [Volley]",
        rollLabel: "Attack…",
        details: "Select a weapon type (<strong>Volley</strong> or <strong>Prime</strong>). Sacrifice a number of dice to fire. An attack triggers an <strong>Evasion</strong> roll from the target. Each of their success cancels one weapon damage, i.e., one of your sacrificed dice.<ul><li><strong>Ramming:</strong> target must be in sector 1. Commit up to your <strong>Maneuverability</strong> over several rounds; at contact the target evades, each remaining die deals 1 damage to both ships, then the rest are expended (TN 9 Short, 10 Medium, 11 Long, 12 Extreme) for +5 damage per success.</li><li><strong>Boarding:</strong> target within Short range. Sacrifice up to <strong>Volley</strong>; each Evasion success cancels <strong>two</strong> dice. Any dice left let you board.</li></ul>",
        notes: {
          volleyMalfunction: "Volley malfunction: sacrifice 2 additional Energy dice when firing Volley",
          primeMisfire: "Prime misfire: each Prime die rolls TN 7 or the ship takes 5 damage",
          weaponsInstability: "Weapons instability: the next attack decrements your Volley",
          blindspot: "Blindspot: enemy Evasion TN −2",
          rudderJammed: "Rudder jammed: Ramming unavailable"
        }
      }
    ]
  },
  {
    key: "mechanic",
    name: "Mechanic / Carpenter",
    actions: [
      {
        key: "repairStructural", name: "Repair Structural Damage", cost: "Expend at will",
        details: "Repair damage to the <strong>Structural Integrity</strong>. Expend <strong>Energy</strong> dice: 1 success equals 1 point of damage repaired.",
        notes: { debris: "Debris: expend twice the number of Energy dice" }
      },
      {
        key: "repairCritical", name: "Repair Critical Damage", cost: "Expend [current Systems]",
        details: "Repair damage from the Effects Table. Expend a number of <strong>Energy</strong> dice up to your <em>current</em> <strong>Systems</strong> value. At least one success repairs the damage—or at least patches it so that it is no longer an immediate threat to the ship and its crew. A failed roll has no effect."
      }
    ]
  }
];

/** Actions that have a dice roll button on the sheet. */
export const ROLLABLE_ACTIONS = new Set(["repairSystem", "maneuver", "overworkCrew", "analyse", "targetSystem", "attack", "repairStructural", "repairCritical"]);

export const ROLE_KEYS = ROLES.map((r) => r.key);
export const ACTION_KEYS = ROLES.flatMap((r) => r.actions.map((a) => a.key));

/** How many of the 3 actions each used action takes up (Lethargic maneuvering makes Maneuver cost 2). */
export function actionWeight(key, effects) {
  return key === "maneuver" && effects.has("lethargicManeuvering") ? 2 : 1;
}
