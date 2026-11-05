import { MODULE_ID, DEFAULT_TN, RANGES } from "./constants.mjs";
import { SHIP_CLASSES, MOD_STATS, classDefaults } from "./ship-data.mjs";
import { EFFECTS, EFFECT_BY_KEY, rangeLabel } from "./effects.mjs";
import { currentTarget, createAttackCard, pushInitiative, rollEffectsTable, warnHull } from "./combat.mjs";
import { STAT_GROUPS } from "./stat-groups.mjs";
import { icon } from "./icons.mjs";
import { ROLES, ROLE_KEYS, ACTIONS_PER_ROUND, ROLLABLE_ACTIONS, actionWeight } from "./actions.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
const { DialogV2 } = foundry.applications.api;

// stat key -> label key, taken from the stat groups (Initiative, Energy, ...)
const STAT_LABELS = Object.fromEntries(STAT_GROUPS.flatMap((g) => g.stats.map((s) => [s.key, s.label])));

const l = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

export default class ShipSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  /**
   * Play mode (default): track current values, roll dice, apply damage and effects.
   * Edit mode: change maximums and base stats. Per-window UI state, not saved on the actor.
   */
  #editMode = false;

  /** Last initiative total rolled from this window (shown next to the dice, like the prototype). */
  #lastInitiative = null;

  static DEFAULT_OPTIONS = {
    classes: ["ship-stats-card", "ship-sheet"],
    position: { width: 640, height: "auto" },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      toggleMode: ShipSheet.#onToggleMode,
      allocate: ShipSheet.#onAllocate,
      toggleAction: ShipSheet.#onToggleAction,
      resetTurn: ShipSheet.#onResetTurn,
      rollAction: ShipSheet.#onRollAction,
      adjust: ShipSheet.#onAdjust,
      hull: ShipSheet.#onHull,
      toggleEffect: ShipSheet.#onToggleEffect,
      clearEffects: ShipSheet.#onClearEffects,
      roll: ShipSheet.#onRoll
    }
  };

  /** Foundry's own tab system (nav.tabs with data-action="tab"). */
  static TABS = {
    primary: {
      tabs: [
        { id: "stats", label: "SHIPSTATS.Tab.Stats" },
        { id: "actions", label: "SHIPSTATS.Tab.Actions" }
      ],
      initial: "stats"
    }
  };

  tabGroups = { primary: "stats" };

  static PARTS = {
    body: { template: "modules/ship-stats-card/templates/ship-sheet.hbs", scrollable: [""] }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.document.system;
    const edit = this.isEditable && this.#editMode;

    context.actor = this.document;
    context.system = system;
    context.icons = {
      heart: icon("heart"),
      swords: icon("swords"),
      wrench: icon("wrench"),
      dices: icon("dices"),
      plus: icon("plus"),
      minus: icon("minus"),
      help: icon("circle-help"),
      trash: icon("trash-2")
    };
    context.canEdit = this.isEditable;
    context.tabs = this.#prepareTabs();
    context.actionsTab = this.#prepareActions(system);
    context.editMode = edit;
    context.className = l(SHIP_CLASSES[system.shipClass]?.label ?? "");
    context.classChoices = Object.fromEntries(
      Object.entries(SHIP_CLASSES).map(([k, v]) => [k, l(v.label)])
    );

    // Structural Integrity (top card)
    const hull = system.structure;
    context.hull = {
      value: hull.value,
      max: hull.max,
      percent: hull.max > 0 ? Math.clamp((hull.value / hull.max) * 100, 0, 100) : 0
    };

    // The four grouped stat cards
    context.groups = STAT_GROUPS.map((group) => ({
      title: l(group.title),
      stats: group.stats.map((stat) => this.#prepareStat(stat, system, edit))
    }));

    // Applied effects
    context.effects = EFFECTS.map((e) => ({
      key: e.key,
      name: e.name,
      details: e.details,
      range: rangeLabel(e),
      active: system.effects.has(e.key)
    }));
    context.activeEffects = context.effects.filter((e) => e.active);

    // Modifications: one per stat, edited in Edit mode, listed in Play mode
    context.modList = MOD_STATS.filter((key) => system.mods[key].active).map((key) => ({
      key,
      label: l(STAT_LABELS[key]),
      text: system.mods[key].text,
      placeholder: l("SHIPSTATS.ModPlaceholder", { stat: l(STAT_LABELS[key]) })
    }));
    context.hasModifications = context.modList.some((m) => m.text.trim());
    return context;
  }

  /** Tab links and the active tab, in the shape Foundry's tab styling expects. */
  #prepareTabs() {
    const group = "primary";
    const active = this.tabGroups[group] ?? "stats";
    return Object.fromEntries(
      ShipSheet.TABS[group].tabs.map((tab) => [
        tab.id,
        { id: tab.id, group, label: l(tab.label), active: tab.id === active, cssClass: tab.id === active ? "item active" : "item" }
      ])
    );
  }

  /** Context for the Actions tab: Energy summary, crew roles with their allocation and actions. */
  #prepareActions(system) {
    const { available, allocated, unallocated } = system.energy;
    const used = system.actionsUsed;
    const usedCount = Array.from(used).reduce((n, key) => n + actionWeight(key, system.effects), 0);
    const roles = ROLES.map((role) => {
      const value = system.allocation[role.key];
      return {
        key: role.key,
        name: role.name,
        value,
        // the most this role's box can hold: what is left plus what it already has
        max: value + unallocated,
        actions: role.actions.map((action) => {
          const notes = [];
          let disabled = false;
          for (const [effectKey, note] of Object.entries(action.notes ?? {})) {
            if (!system.effects.has(effectKey)) continue;
            if (note === "disabled") {
              disabled = true;
              notes.push(`${EFFECT_BY_KEY.get(effectKey).name}: cannot be used`);
            } else notes.push(note);
          }
          return { key: action.key, name: action.name, cost: action.cost, details: action.details, used: used.has(action.key), disabled, notes, rollable: ROLLABLE_ACTIONS.has(action.key), rollLabel: action.rollLabel ?? "" };
        })
      };
    });
    return { available, allocated, unallocated, usedCount, limit: ACTIONS_PER_ROUND, overLimit: usedCount > ACTIONS_PER_ROUND, roles };
  }

  #prepareStat(stat, system, edit) {
    const mod = system.mods[stat.key];
    const data = {
      key: stat.key,
      label: l(stat.label),
      tip: l(stat.tip),
      iconSvg: icon(stat.icon),
      color: stat.color,
      edit,
      isNumber: stat.kind === "number",
      isDerived: stat.kind === "derived",
      isPool: stat.kind === "pool",
      isInitiative: stat.kind === "initiative",
      roll: stat.roll ?? "",
      path: `system.${stat.key}`,
      modActive: mod.active,
      modValue: mod.value,
      notes: system.effectNotes[stat.key] ?? [],
      disabled: Boolean(system.effectDisabled[stat.key])
    };
    switch (stat.kind) {
      case "number":
        data.value = system.effective[stat.key]; // shown in Play mode
        data.base = system[stat.key]; // edited in Edit mode
        // NPC ships can only move half their Maneuverability (rounded down).
        data.hasHalf = stat.key === "maneuverability" && system.isNPC;
        data.half = Math.floor(data.value / 2);
        break;
      case "derived":
        data.value = system.energy.max;
        data.committed = system.energy.committed;
        break;
      case "pool":
        data.value = system.effective[stat.key].value;
        data.max = system.effective[stat.key].max;
        data.base = system[stat.key].value;
        data.baseMax = system[stat.key].max;
        break;
      case "initiative":
        data.value = system.initiativeDice;
        // Show the total modifier (Mod box + applied effects) next to the dice, e.g. "+1" or "−2".
        if (mod.active || system.effectMods.initiative) {
          const bonus = system.initiativeBonus;
          data.initiativeMod = `${bonus < 0 ? "−" : "+"}${Math.abs(bonus)}`;
        }
        data.lastRoll = this.#lastInitiative;
        break;
    }
    return data;
  }

  /** Move Energy dice into or out of a crew position (never more than is left to allocate). */
  static async #onAllocate(event, target) {
    const { role, delta } = target.dataset;
    const energy = this.document.system.energy;
    const current = this.document.system.allocation[role];
    const room = current + energy.unallocated;
    const next = delta === "all" ? room : delta === "none" ? 0 : current + Number(delta);
    await this.document.update({ [`system.allocation.${role}`]: Math.clamp(next, 0, room) });
  }

  /** Tick an action as taken this turn (or untick it). */
  static async #onToggleAction(event, target) {
    const used = new Set(this.document.system.actionsUsed);
    const key = target.dataset.key;
    if (used.has(key)) used.delete(key);
    else used.add(key);
    await this.document.update({ "system.actionsUsed": Array.from(used) });
  }

  /** Clear this turn's allocation and used actions (also done automatically when the ship's turn starts). */
  static async #onResetTurn() {
    await this.document.update({
      "system.allocation": Object.fromEntries(ROLE_KEYS.map((k) => [k, 0])),
      "system.actionsUsed": [],
      "system.energy.spent": 0,
      "system.energy.bonus": 0,
      "system.systems.overworkEnergy": this.document.system.systems.overwork
    });
  }

  /** The actions already used this turn plus `key`, ready for an update. */
  #usedWith(key) {
    return Array.from(new Set([...this.document.system.actionsUsed, key]));
  }

  /** Ask for a number of dice (and optional extra form fields). Returns the form data or null. */
  async #askDice({ title, label, max, value, extra = "", ok = null }) {
    const result = await DialogV2.input({
      window: { title },
      content: `<div class="form-group"><label>${label}</label><div class="form-fields">
        <input type="number" name="dice" min="1" max="${max}" step="1" value="${Math.min(value ?? max, max)}" autofocus></div></div>${extra}`,
      ok: ok ?? { label: l("SHIPSTATS.RollAction"), icon: "fa-solid fa-dice-d20" },
      rejectClose: false
    });
    if (!result) return null;
    const dice = Math.clamp(Math.trunc(Number(result.dice)), 1, max);
    return dice >= 1 ? { ...result, dice } : null;
  }

  /**
   * Update for rolling an action: the role gives up `spent` Energy dice (they leave the pool for this
   * turn), `returned` of them go to another position, and the action is ticked as used.
   */
  #rollUpdate(key, role, spent, { returned = 0, to = null } = {}) {
    const s = this.document.system;
    const update = {
      [`system.allocation.${role}`]: Math.max(0, s.allocation[role] - spent),
      "system.energy.spent": s.energy.spent + spent - returned,
      "system.actionsUsed": this.#usedWith(key)
    };
    if (returned && to) update[`system.allocation.${to}`] = s.allocation[to] + returned;
    return update;
  }

  /** Roll Nd12 against a TN and post the result; returns the number of successes. */
  async #rollSuccesses(dice, tn, flavor) {
    const roll = await new Roll(`${dice}d12cs>=${tn}`).evaluate();
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.document }),
      flavor: `${flavor} (TN ${tn})`
    });
    return roll.total;
  }

  static async #onRollAction(event, target) {
    const key = target.dataset.key;
    const doc = this.document;
    const s = doc.system;
    const say = (html) =>
      ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: doc }), content: `<p>${html}</p>` });
    const roleName = (role) => ROLES.find((r) => r.key === role).name;
    // Does this role have Energy to use? Returns its allocation or 0 after a warning.
    const energyOf = (role) => {
      const n = s.allocation[role];
      if (n < 1) ui.notifications.warn(l("SHIPSTATS.NoEnergyForRole", { role: roleName(role) }));
      return n;
    };

    switch (key) {
      case "overworkCrew": {
        // Roll all Energy dice that are still unallocated; each success is an extra die to hand out.
        const pool = s.energy.unallocated;
        if (pool < 1) return ui.notifications.warn(l("SHIPSTATS.NoDiceAvailable"));
        const ask = await this.#askDice({
          title: ROLES[0].actions[0].name, label: l("SHIPSTATS.DiceToRoll", { max: pool }), max: pool, value: pool
        });
        if (!ask) return;
        const successes = await this.#rollSuccesses(ask.dice, DEFAULT_TN, `${doc.name}: Overwork the Crew`);
        // The extra Energy is added on top of the normal pool, and the Systems loss is tracked apart from
        // the base value (it shows on the stat, and Energy follows it from the next turn).
        const before = s.effective.systems.value;
        const overwork = Math.min(s.systems.overwork + 1, s.systems.value);
        await doc.update({
          "system.energy.bonus": s.energy.bonus + successes,
          "system.systems.overwork": overwork,
          "system.actionsUsed": this.#usedWith(key)
        });
        return say(`Overwork the Crew: <strong>+${successes}</strong> Energy dice to distribute now. Systems ${before} → ${Math.max(0, before - (overwork - s.systems.overwork))} (no Effects Table roll).`);
      }
      case "attack": {
        // One dialog for every kind of attack: weapons, ramming (commit / make contact) and boarding.
        const rudder = s.effects.has("rudderJammed");
        const types = [
          ["volley", "Volley"],
          ["prime", s.effects.has("primeMisfire") ? "Prime (misfire: each die rolls TN 7)" : "Prime"],
          ...(rudder ? [] : [["ramCommit", "Ramming: commit dice"], ["ramHit", "Ramming: make contact"]]),
          ["boarding", "Boarding (Short range only)"]
        ];
        const targeted = currentTarget();
        const lastRange = Math.clamp(Number(game.settings.get(MODULE_ID, "lastRange")) || 0, 0, 3);
        const content = `
          <p>${targeted ? `Target: <strong>${targeted.actor.name}</strong>` : "No ship targeted: results are posted to chat only. Target a ship (T key) to run the exchange automatically."}</p>
          <div class="form-group"><label>Attack</label><div class="form-fields"><select name="type">${
            types.map(([v, n]) => `<option value="${v}">${n}</option>`).join("")}</select></div></div>
          <div class="form-group"><label>Energy dice</label><div class="form-fields">
            <input type="number" name="dice" min="1" step="1" value="${Math.max(1, Math.min(s.allocation.pilot, s.effective.volley))}"></div></div>
          <div class="form-group ssc-range-row"><label>Range to target</label><div class="form-fields"><select name="range">${
            RANGES.map((r, i) => `<option value="${i}"${i === lastRange ? " selected" : ""}>${r}</option>`).join("")}</select></div></div>
          <div class="form-group ssc-system-row"><label>Target a system (no damage; on a hit, Systems \u22121 and an Effects Table roll)</label>
            <div class="form-fields"><input type="checkbox" name="system"></div></div>
          <p class="notes ssc-attack-hint"></p>`;
        const hints = {
          volley: `Sacrifice up to ${s.effective.volley} dice (Volley). The target rolls Evasion against them.`,
          prime: `Sacrifice up to ${s.effective.volley} dice. The target rolls Evasion against them.`,
          ramCommit: `Commit up to ${s.effective.maneuverability} dice in total (${s.energy.committed} committed) over several rounds. Target must be in sector 1.`,
          ramHit: "Enter the dice left after the target's Evasion. Each deals 1 damage to both ships, then they are rolled: each success adds 5 damage.",
          boarding: "Sacrifice up to Volley dice. Each Evasion success cancels two of them; dice left over mean you board."
        };
        const ask = await DialogV2.input({
          window: { title: `${doc.name}: Attack` },
          content,
          ok: { label: "Attack", icon: "fa-solid fa-burst" },
          render: (event, dialog) => {
            const el = dialog.element;
            const sel = el.querySelector("[name=type]");
            const sync = () => {
              el.querySelector(".ssc-range-row").style.display = sel.value === "ramCommit" ? "none" : "";
              el.querySelector(".ssc-system-row").style.display = ["volley", "prime"].includes(sel.value) ? "" : "none";
              el.querySelector(".ssc-attack-hint").textContent = hints[sel.value] ?? "";
              if (sel.value === "ramHit") el.querySelector("[name=dice]").value = Math.max(1, s.energy.committed);
            };
            sel.addEventListener("change", sync);
            sync();
          },
          rejectClose: false
        });
        if (!ask) return;
        const type = ask.type;
        const asked = Math.trunc(Number(ask.dice));
        if (!(asked >= 1)) return;
        const pilot = s.allocation.pilot;
        const hull = s.structure;
        const step = Math.clamp(Math.trunc(Number(ask.range)) || 0, 0, 3);
        if (type !== "ramCommit") game.settings.set(MODULE_ID, "lastRange", step);
        const markUsed = { "system.actionsUsed": this.#usedWith(key) };

        if (type === "ramHit") {
          // Contact: the remaining dice hurt both ships, then are expended (TN rises with range).
          if (targeted) {
            // Ramming against a targeted ship: the target evades, then the impact is resolved on the card.
            await doc.update({ "system.energy.committed": 0, ...markUsed });
            return createAttackCard({ attacker: doc, target: targeted.actor, type: "ram", dice: asked, step });
          }
          const tn = DEFAULT_TN + step;
          const successes = await this.#rollSuccesses(asked, tn, `${doc.name}: Ramming`);
          const next = Math.max(0, hull.value - asked);
          await doc.update({
            "system.structure.value": next,
            "system.energy.committed": 0,
            "system.actionsUsed": this.#usedWith(key)
          });
          warnHull(doc, asked, next);
          return say(`Ramming: ${asked} dice hit, dealing <strong>${asked}</strong> damage to the enemy and to ${doc.name} (${hull.value} \u2192 ${next}). ${successes} success${successes === 1 ? "" : "es"} add <strong>${successes * 5}</strong> damage to the enemy: <strong>${asked + successes * 5}</strong> in total.`);
        }

        if (type === "ramCommit") {
          const n = Math.min(asked, pilot, Math.max(0, s.effective.maneuverability - s.energy.committed));
          if (pilot < 1) return ui.notifications.warn(l("SHIPSTATS.NoEnergyForRole", { role: roleName("pilot") }));
          if (n < 1) return ui.notifications.warn(l("SHIPSTATS.NoDiceAvailable"));
          await doc.update({
            "system.allocation.pilot": pilot - n,
            "system.energy.committed": s.energy.committed + n,
            "system.actionsUsed": this.#usedWith(key)
          });
          return say(`Ramming: ${doc.name} commits <strong>${n}</strong> dice (${s.energy.committed + n} committed in total).`);
        }

        // Volley, Prime and Boarding sacrifice dice from the Pilot's Energy.
        const extra = type === "volley" && s.effects.has("volleyMalfunction") ? 2 : 0;
        const max = Math.min(s.effective.volley, pilot - extra);
        if (pilot < 1) return ui.notifications.warn(l("SHIPSTATS.NoEnergyForRole", { role: roleName("pilot") }));
        if (max < 1) return ui.notifications.warn(l("SHIPSTATS.NoDiceAvailable"));
        if (type === "prime" && s.effective.prime.value < 1) return ui.notifications.warn("No Prime charges left.");
        const n = Math.min(asked, max);
        const spend = this.#rollUpdate(key, "pilot", n + extra);
        // The Prime weapon has a limited number of uses: each Prime attack takes one charge.
        if (type === "prime") spend["system.prime.value"] = Math.max(0, s.prime.value - 1);
        const extraNote = extra ? ` (+${extra} extra dice lost to Volley malfunction)` : "";

        if (type === "prime" && s.effects.has("primeMisfire")) {
          // Prime misfire: each Prime die is rolled at TN 7; failures hurt the ship and never launch.
          const launched = await this.#rollSuccesses(n, 7, `${doc.name}: Prime launch (misfire)`);
          const failed = n - launched;
          const damage = failed * 5;
          const next = Math.max(0, hull.value - damage);
          await doc.update({ ...spend, "system.structure.value": next });
          warnHull(doc, damage, next);
          if (targeted && launched > 0) {
            await say(`Prime misfire: ${failed} of ${n} dice misfire${damage ? `; ${doc.name} takes <strong>${damage}</strong> damage (${hull.value} \u2192 ${next})` : ""}.`);
            return createAttackCard({ attacker: doc, target: targeted.actor, type: "prime", dice: launched, step, targeted: Boolean(ask.system) });
          }
          return say(`Prime attack: <strong>${launched}</strong> of ${n} dice launch${damage ? `; <strong>${failed}</strong> misfire, so ${doc.name} takes <strong>${damage}</strong> damage (${hull.value} \u2192 ${next})` : ""}. The target rolls Evasion against ${launched} dice.`);
        }

        await doc.update(spend);
        if (targeted) {
          const notes = extra ? [`Volley malfunction: ${extra} extra dice lost`] : [];
          return createAttackCard({ attacker: doc, target: targeted.actor, type, dice: n, step, targeted: Boolean(ask.system) && type !== "boarding", notes });
        }
        if (type === "boarding") {
          return say(`Boarding attack: <strong>${n}</strong> dice sacrificed${extraNote}. Each Evasion success cancels <strong>two</strong> of them; if any remain, ${doc.name} boards.`);
        }
        const blind = s.effects.has("blindspot") ? " Blindspot: the target's Evasion TN is 2 lower." : "";
        return say(`${type === "prime" ? "Prime" : "Volley"} attack: <strong>${n}</strong> dice sacrificed${extraNote}. The target rolls Evasion against ${n} dice (TN falls by 2 per range step beyond Medium).${blind}`);
      }
      case "repairSystem": {
        // Sacrifice Energy equal to the Systems damage (all the Captain has left, up to that damage).
        const damage = s.effective.systems.max - s.effective.systems.value;
        if (damage < 1) return ui.notifications.info(l("SHIPSTATS.NoSystemsDamage"));
        const n = Math.min(energyOf("captain"), damage);
        if (n < 1) return;
        // Systems lost to Overwork the Crew come back first, then the base value goes up (never past its maximum).
        const fromOverwork = Math.min(n, s.systems.overwork);
        const value = Math.min(s.systems.max, s.systems.value + (n - fromOverwork));
        await doc.update({
          ...this.#rollUpdate(key, "captain", n),
          "system.systems.overwork": s.systems.overwork - fromOverwork,
          "system.systems.value": value
        });
        const after = s.effective.systems.value + n;
        return say(`Repair System: <strong>${n}</strong> Energy dice sacrificed, Systems ${s.effective.systems.value} \u2192 ${Math.min(s.effective.systems.max, after)}.`);
      }
      case "maneuver": {
        // Every movement step sacrifices 1 Energy die: the player chooses how many, up to what the Pilot has left and Maneuverability
        // (NPC ships move at most half of it, rounded down).
        const cap = s.isNPC ? Math.floor(s.effective.maneuverability / 2) : s.effective.maneuverability;
        const n = Math.min(energyOf("pilot"), cap);
        if (n < 1) return s.allocation.pilot < 1 ? undefined : ui.notifications.warn(l("SHIPSTATS.NoDiceAvailable"));
        const ask = await this.#askDice({
          title: "Maneuver", label: l("SHIPSTATS.DiceToSpend", { max: n }), max: n, value: n,
          ok: { label: "Maneuver", icon: "fa-solid fa-ship" }
        });
        if (!ask) return;
        await doc.update(this.#rollUpdate(key, "pilot", ask.dice));
        return say(`Maneuver: <strong>${ask.dice}</strong> Energy dice sacrificed, up to ${ask.dice} movement step${ask.dice === 1 ? "" : "s"} (Move in, Move out or Shift Sector).`);
      }
      case "analyse": {
        const max = energyOf("sensors");
        if (max < 1) return;
        const ask = await this.#askDice({ title: "Analyse", label: l("SHIPSTATS.DiceToRoll", { max }), max, value: max });
        if (!ask) return;
        const successes = await this.#rollSuccesses(ask.dice, DEFAULT_TN, `${doc.name}: Analyse`);
        await doc.update(this.#rollUpdate(key, "sensors", ask.dice));
        return say(`Analyse: <strong>${successes}</strong> stat${successes === 1 ? "" : "s"} of the enemy Stat Sheet revealed.`);
      }
      case "targetSystem": {
        const max = Math.min(energyOf("sensors"), s.effective.systems.value);
        if (max < 1) return s.allocation.sensors < 1 ? undefined : ui.notifications.warn(l("SHIPSTATS.NoDiceAvailable"));
        const ask = await this.#askDice({ title: "Target System", label: l("SHIPSTATS.DiceToRoll", { max }), max, value: max });
        if (!ask) return;
        const successes = await this.#rollSuccesses(ask.dice, DEFAULT_TN, `${doc.name}: Target System`);
        // Successful dice are donated to the Pilot's Attack (they stay in the pool, now at the Pilot).
        await doc.update(this.#rollUpdate(key, "sensors", ask.dice, { returned: successes, to: "pilot" }));
        return say(`Target System: <strong>${successes}</strong> dice donated to the Pilot for an Attack.`);
      }
      case "repairStructural": {
        const per = s.effects.has("debris") ? 2 : 1;
        const have = energyOf("mechanic");
        const max = Math.floor(have / per);
        if (max < 1) return have < 1 ? undefined : ui.notifications.warn(l("SHIPSTATS.NoDiceAvailable"));
        const ask = await this.#askDice({
          title: "Repair Structural Damage", label: l("SHIPSTATS.DiceToRoll", { max }), max, value: max,
          extra: per > 1 ? `<p class="notes">${l("SHIPSTATS.DebrisCost", { max })}</p>` : ""
        });
        if (!ask) return;
        const successes = await this.#rollSuccesses(ask.dice, DEFAULT_TN, `${doc.name}: Repair Structural Damage`);
        const hull = s.structure;
        const next = Math.min(hull.max, hull.value + successes);
        await doc.update({ ...this.#rollUpdate(key, "mechanic", ask.dice * per), "system.structure.value": next });
        return say(`Repair Structural Damage: <strong>${next - hull.value}</strong> Structural Integrity restored (${hull.value} → ${next}).`);
      }
      case "repairCritical": {
        const max = Math.min(energyOf("mechanic"), s.effective.systems.value);
        if (max < 1) return s.allocation.mechanic < 1 ? undefined : ui.notifications.warn(l("SHIPSTATS.NoDiceAvailable"));
        const options = EFFECTS.filter((e) => s.effects.has(e.key))
          .map((e) => `<option value="${e.key}">${e.name}</option>`).join("");
        const extra = options
          ? `<div class="form-group"><label>${l("SHIPSTATS.RepairWhich")}</label><div class="form-fields"><select name="effect"><option value="">${l("SHIPSTATS.RepairNone")}</option>${options}</select></div></div>`
          : "";
        const ask = await this.#askDice({
          title: "Repair Critical Damage", label: l("SHIPSTATS.DiceToRoll", { max }), max, value: max, extra
        });
        if (!ask) return;
        const successes = await this.#rollSuccesses(ask.dice, DEFAULT_TN, `${doc.name}: Repair Critical Damage`);
        const update = this.#rollUpdate(key, "mechanic", ask.dice);
        let text = successes > 0 ? "Repaired (or patched)." : "The repair fails.";
        if (successes > 0 && ask.effect) {
          update["system.effects"] = Array.from(s.effects).filter((k) => k !== ask.effect);
          text = `Repaired: ${EFFECT_BY_KEY.get(ask.effect).name} removed.`;
        }
        await doc.update(update);
        return say(`Repair Critical Damage: ${text}`);
      }
    }
  }

  /** Typing in an allocation box can never hand out more Energy than the ship has available. */
  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    // Picking another ship class loads that class's default stats (Example Ships table). Done here as well
    // as in the data model so the form's own (old) stat values can never win.
    const newClass = data.system?.shipClass;
    if (event?.target?.name === "system.shipClass" && newClass !== this.document.system.shipClass) {
      const defaults = classDefaults(newClass);
      if (defaults) {
        foundry.utils.mergeObject(data, { system: defaults });
        ui.notifications.info(l("SHIPSTATS.ClassLoaded", { class: l(SHIP_CLASSES[newClass].label) }));
      }
    }
    const alloc = data.system?.allocation;
    const role = event?.target?.name?.match(/^system\.allocation\.(\w+)$/)?.[1];
    if (alloc && role) {
      const available = this.document.system.energy.available;
      const others = ROLE_KEYS.filter((k) => k !== role).reduce((n, k) => n + (Number(alloc[k]) || 0), 0);
      alloc[role] = Math.clamp(Math.trunc(Number(alloc[role]) || 0), 0, Math.max(0, available - others));
    }
    return data;
  }

  static async #onToggleMode() {
    this.#editMode = !this.#editMode;
    await this.render();
  }

  /** Increment/decrement a pool value, clamped to 0..max. */
  static async #onAdjust(event, target) {
    const { path, delta } = target.dataset;
    const current = foundry.utils.getProperty(this.document, path) ?? 0;
    const max = foundry.utils.getProperty(this.document, path.replace(/\.value$/, ".max"));
    // A negative modification must not push the displayed value below 0: base >= -modification.
    const statKey = path.split(".")[1];
    const mods = this.document.system.mods?.[statKey];
    const min = mods?.active ? Math.max(0, -mods.value) : 0;
    // Repairing Systems first undoes Systems lost to Overwork the Crew.
    if (path === "system.systems.value" && Number(delta) > 0 && this.document.system.systems.overwork > 0) {
      return this.document.update({ "system.systems.overwork": this.document.system.systems.overwork - 1 });
    }
    const next = Math.clamp(current + Number(delta), min, max ?? Infinity);
    await this.document.update({ [path]: next });
  }

  /** Take Damage / Repair Damage dialogs for Structural Integrity. */
  static async #onHull(event, target) {
    const damage = target.dataset.mode === "damage";
    const result = await DialogV2.input({
      window: { title: l(damage ? "SHIPSTATS.ApplyDamage" : "SHIPSTATS.RepairDamage") },
      content: `<div class="form-group"><label>${l(damage ? "SHIPSTATS.DamageAmount" : "SHIPSTATS.RepairAmount")}</label>
        <div class="form-fields"><input type="number" name="amount" min="1" step="1" autofocus></div></div>`,
      ok: {
        label: l(damage ? "SHIPSTATS.ApplyDamage" : "SHIPSTATS.ApplyRepair"),
        icon: damage ? "fa-solid fa-burst" : "fa-solid fa-wrench"
      },
      rejectClose: false
    });
    const amount = Math.trunc(Number(result?.amount));
    if (!(amount > 0)) return;

    const hull = this.document.system.structure;
    const next = damage ? Math.max(0, hull.value - amount) : Math.min(hull.max, hull.value + amount);
    await this.document.update({ "system.structure.value": next });

    const data = { name: this.document.name, amount, from: hull.value, to: next };
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.document }),
      content: `<p>${l(damage ? "SHIPSTATS.TookDamage" : "SHIPSTATS.Repaired", data)}</p>`
    });
    // Rules: 10+ damage in a single salvo means a roll on the Effects Table.
    if (damage) warnHull(this.document, amount, next);
  }

  /** Tick or untick one Effects Table result on this ship. */
  static async #onToggleEffect(event, target) {
    const effects = new Set(this.document.system.effects);
    const key = target.dataset.key;
    if (effects.has(key)) effects.delete(key);
    else effects.add(key);
    await this.document.update({ "system.effects": Array.from(effects) });
  }

  /** Remove every applied effect (offered in Edit mode only). */
  static async #onClearEffects() {
    if (!this.document.system.effects.size) return;
    const confirmed = await DialogV2.confirm({
      window: { title: l("SHIPSTATS.ClearEffects") },
      content: `<p>${l("SHIPSTATS.ClearEffectsConfirm", { name: this.document.name })}</p>`,
      rejectClose: false,
      modal: true
    });
    if (confirmed) await this.document.update({ "system.effects": [] });
  }

  static async #onRoll(event, target) {
    const system = this.document.system;
    const speaker = ChatMessage.getSpeaker({ actor: this.document });
    switch (target.dataset.roll) {
      case "initiative": {
        const bonus = system.initiativeBonus;
        const formula = bonus ? `${system.initiativeDice} ${bonus > 0 ? "+" : "-"} ${Math.abs(bonus)}` : system.initiativeDice;
        const roll = await new Roll(formula).evaluate();
        this.#lastInitiative = roll.total;
        await roll.toMessage({
          speaker,
          flavor: `${l("SHIPSTATS.Initiative")} (${l("SHIPSTATS.LowerFirst")})`
        });
        await pushInitiative(this.document, roll.total);
        return this.render();
      }
      case "effects": {
        const { effects } = await rollEffectsTable(this.document);
        return this.document.update({ "system.effects": effects });
      }
      case "evasion": {
        const dice = system.effective.evasion;
        if (dice < 1) return;
        const roll = await new Roll(`${dice}d12cs>=${DEFAULT_TN}`).evaluate();
        return roll.toMessage({
          speaker,
          flavor: `${l("SHIPSTATS.Evasion")} (TN ${DEFAULT_TN})`
        });
      }
    }
  }
}
