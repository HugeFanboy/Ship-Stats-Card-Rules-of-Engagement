# Ship-Stats-Card-Rules-of-Engagement
A d12-based abstract ship-to-ship combat mini-game: ship actors with linked tokens and a trackable stat sheet, example ships, a Tactical Graph scene, and the Rules of Engagement. Works in any game system; Draw Steel has dedicated support.

## Supporting a game system

The ship actor type (`ship-stats-card.ship`) is declared in `module.json` and registered by `scripts/ship-actor.mjs`, which does not depend on any game system. Anything a particular system needs lives in an adapter file under `scripts/systems/`:

| File | Used for |
| --- | --- |
| `scripts/systems/generic.mjs` | Any system without its own adapter (core Combat tracker and initiative) |
| `scripts/systems/draw-steel.mjs` | Draw Steel (combat hooks on the actor, sheet re-render fix, side-based initiative) |

To add a system:

1. Copy `scripts/systems/generic.mjs` to `scripts/systems/<system-id>.mjs`, set `id` to the system's id and fill in only what that system needs (`dataModel`, `sheet`, `usesSystemInitiative`, `init`).
2. Add it to `ADAPTERS` in `scripts/systems/index.mjs`.
3. For the Example Ships compendium, add an Actor pack named `ships-<system-id>` with `"path": "packs/ships-<system-id>"` and `"system": "<system-id>"` to `module.json`, then run `npm run build:packs`. All ships packs are built from `packs/_source/ships`.
