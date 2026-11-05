/**
 * Generic adapter: used for any game system without a file of its own in this folder.
 * The ship actor relies only on Foundry core here (core Combat tracker, core initiative).
 *
 * Every system adapter has the same shape (all members optional except `id`):
 *   id                      the game system id (game.system.id) the adapter is for
 *   dataModel(Base)         returns a subclass of the ship data model with the system's extra hooks
 *   sheet(Base)             returns a subclass of the ship sheet with the system's extra hooks
 *   usesSystemInitiative()  true when the system runs its own initiative and ships must not touch it
 *   init()                  extra set-up, run once during the "init" hook after the actor is registered
 */
export default {
  id: "generic",
  dataModel: (Base) => Base,
  sheet: (Base) => Base,
  usesSystemInitiative: () => false,
  init() {}
};
