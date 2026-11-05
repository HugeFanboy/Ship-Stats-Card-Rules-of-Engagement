/**
 * Project FU adapter (Fabula Ultima, system id "projectfu"). Starts as a copy of the generic adapter:
 * fill in below whatever Project FU needs on top of Foundry core.
 *
 * Every system adapter has the same shape (all members optional except `id`):
 *   id                      the game system id (game.system.id) the adapter is for
 *   dataModel(Base)         returns a subclass of the ship data model with the system's extra hooks
 *   sheet(Base)             returns a subclass of the ship sheet with the system's extra hooks
 *   usesSystemInitiative()  true when the system runs its own initiative and ships must not touch it
 *   init()                  extra set-up, run once during the "init" hook after the actor is registered
 */
export default {
  id: "projectfu",
  dataModel: (Base) => Base,
  sheet: (Base) => Base,
  usesSystemInitiative: () => false,
  init() {}
};
