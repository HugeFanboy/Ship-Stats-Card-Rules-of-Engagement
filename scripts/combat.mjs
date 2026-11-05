/**
 * Ship-to-ship combat flow: targeting, attack chat cards, Evasion prompts, damage, Combat tracker
 * integration and the Energy allocation prompt at the start of a ship's turn.
 *
 * Players cannot edit ships they do not own, so every step that changes another ship runs on the
 * active GM's client, reached through the module socket.
 */
import { MODULE_ID, SHIP_TYPE, DEFAULT_TN, RANGES } from "./constants.mjs";
import { effectForRoll } from "./effects.mjs";
import { ROLES } from "./actions.mjs";

const { DialogV2 } = foundry.applications.api;

const SOCKET = `module.${MODULE_ID}`;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const plural = (n, word, many = `${word}s`) => (n === 1 ? word : many);

/* ------------------------------------------------------------------ */
/*  Targeting                                                           */
/* ------------------------------------------------------------------ */

/** The ship the user has targeted (Foundry's target tool), or null. */
export function currentTarget() {
  const token = [...game.user.targets][0];
  const actor = token?.actor;
  return actor?.type === SHIP_TYPE ? { token, actor } : null;
}

/* ------------------------------------------------------------------ */
/*  Attack cards                                                        */
/* ------------------------------------------------------------------ */

const TYPE_LABEL = { volley: "Volley attack", prime: "Prime attack", boarding: "Boarding attack", ram: "Ramming" };

function cardHtml(st) {
  const out = [];
  out.push(`<div class="ssc-attack-card">`);
  out.push(`<h4>${TYPE_LABEL[st.type]}${st.targeted ? " (targeting a system)" : ""}</h4>`);
  out.push(`<p><strong>${esc(st.attackerName)}</strong> → <strong>${esc(st.targetName)}</strong>: <strong>${st.dice}</strong> ${plural(st.dice, "die", "dice")}, ${RANGES[st.step]} range.</p>`);
  for (const note of st.notes ?? []) out.push(`<p class="ssc-card-note">${esc(note)}</p>`);

  if (st.status === "pending") {
    out.push(`<p>${esc(st.targetName)} rolls Evasion at TN ${st.tn}${st.type === "boarding" ? "; each success cancels two dice" : ""}.</p>`);
    out.push(`<button type="button" data-ssc="evade">Roll Evasion</button>`);
  } else {
    const def = [];
    if (st.armourUsed) def.push(`Armour cancels ${st.armourCancel}`);
    def.push(`Evasion ${st.evasionSuccesses} ${plural(st.evasionSuccesses, "success", "successes")} of ${st.evasionDice}${st.type === "boarding" ? " (×2)" : ""}`);
    out.push(`<p>${def.join("; ")}: <strong>${st.remaining}</strong> ${plural(st.remaining, "die", "dice")} get through.</p>`);
    if (st.type === "ram" && st.selfDamage) {
      out.push(`<p>Impact: ${esc(st.attackerName)} takes ${st.selfDamage} damage${st.attackerDestroyed ? " and is destroyed (no further damage)" : `; ramming dice: ${st.ramSuccesses} ${plural(st.ramSuccesses, "success", "successes")} (+${st.ramSuccesses * 5})`}.</p>`);
    }
    if (st.boarded) out.push(`<p><strong>${esc(st.attackerName)} boards ${esc(st.targetName)}.</strong></p>`);
    else if (st.type === "boarding") out.push(`<p>The boarding attempt is repelled.</p>`);
    if (st.effectHit) out.push(`<p><strong>System hit:</strong> ${esc(st.targetName)} loses 1 Systems and rolls on the Effects Table.</p>`);
    else if (st.damage > 0) out.push(`<p><strong>${st.damage}</strong> damage to ${esc(st.targetName)}${st.damage >= 10 ? " (10 or more: Effects Table)" : ""}.</p>`);
    else if (!st.boarded && st.type !== "boarding") out.push(`<p>No damage gets through.</p>`);

    if (st.status === "applied") out.push(`<p class="ssc-card-applied">${esc(st.summary)}</p>`);
    else if (st.damage > 0 || st.effectHit) out.push(`<button type="button" data-ssc="apply">Apply to ${esc(st.targetName)}</button>`);
  }
  out.push(`</div>`);
  return out.join("");
}

/** Post an attack card against a targeted ship; the target's owner is then asked to roll Evasion. */
export async function createAttackCard({ attacker, target, type, dice, step, targeted = false, notes = [] }) {
  const blind = attacker.system.effects.has("blindspot");
  // Weapons are effective out to Medium; each range step beyond lowers the Evasion TN by 2.
  const tn = type === "ram" ? DEFAULT_TN : Math.max(2, DEFAULT_TN - 2 * Math.max(0, step - 1) - (blind ? 2 : 0));
  const noteList = [...notes];
  if (blind && type !== "ram") noteList.push("Blindspot: Evasion TN −2");
  if (type !== "ram" && step > 1) noteList.push(`Beyond Medium range: Evasion TN −2 per step`);
  const st = {
    status: "pending", type, dice, step, tn, targeted,
    attackerUuid: attacker.uuid, attackerName: attacker.name,
    targetUuid: target.uuid, targetName: target.name,
    notes: noteList
  };
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: attacker }),
    content: cardHtml(st),
    flags: { [MODULE_ID]: { attack: st } }
  });
}

Hooks.on("renderChatMessageHTML", (message, html) => {
  if (!message.getFlag(MODULE_ID, "attack")) return;
  html.querySelectorAll("[data-ssc]").forEach((button) =>
    button.addEventListener("click", (event) => {
      event.preventDefault();
      onCardButton(message, button.dataset.ssc);
    })
  );
});

async function onCardButton(message, action) {
  const st = message.getFlag(MODULE_ID, "attack");
  const target = await fromUuid(st.targetUuid);
  if (!target) return ui.notifications.warn("The target ship no longer exists.");
  if (!game.user.isGM && !target.testUserPermission(game.user, "OWNER")) {
    return ui.notifications.warn(`Only the owner of ${target.name} (or the GM) can do that.`);
  }
  if (action === "evade" && st.status === "pending") return evade(message, st, target);
  if (action === "apply" && st.status === "resolved") return apply(message, st, target);
}

/** The defender: choose Evasion dice and whether to add Armour, roll, and hand the result to the GM. */
async function evade(message, st, target) {
  const s = target.system;
  const max = s.effective.evasion;
  const armour = s.effective.armour.value;
  const content = `
    <div class="form-group"><label>Evasion dice (max ${max})</label>
      <div class="form-fields"><input type="number" name="dice" min="0" max="${max}" step="1" value="${max}" autofocus></div></div>
    ${armour > 0 ? `<div class="form-group"><label>Add Armour (${armour}), then it drops by 1</label>
      <div class="form-fields"><input type="checkbox" name="armour" checked></div></div>` : ""}
    <p class="notes">${st.dice} incoming ${plural(st.dice, "die", "dice")}, TN ${st.tn}${st.type === "boarding" ? ", each success cancels two" : ""}.</p>`;
  const result = await DialogV2.input({
    window: { title: `${target.name}: Evade` },
    content,
    ok: { label: "Evade", icon: "fa-solid fa-person-running" },
    rejectClose: false
  });
  if (!result) return;
  const dice = Math.clamp(Math.trunc(Number(result.dice)) || 0, 0, max);
  const armourUsed = Boolean(result.armour) && armour > 0;
  let successes = 0;
  if (dice > 0) {
    const roll = await new Roll(`${dice}d12cs>=${st.tn}`).evaluate();
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: target }),
      flavor: `${target.name}: Evasion (TN ${st.tn})`
    });
    successes = roll.total;
  }
  await toGM({ op: "evaded", messageId: message.id, dice, successes, armourUsed });
}

/** The defender: split damage between Structural Integrity and Systems, then hand it to the GM. */
async function apply(message, st, target) {
  let systemsPoints = 0;
  if (st.damage > 0 && !st.effectHit) {
    const room = Math.min(st.damage, target.system.systems.value);
    if (room > 0) {
      const result = await DialogV2.input({
        window: { title: `${target.name}: Apply ${st.damage} damage` },
        content: `<div class="form-group"><label>Points taken from Systems instead of Structural Integrity (0 to ${room})</label>
          <div class="form-fields"><input type="number" name="systems" min="0" max="${room}" step="1" value="0" autofocus></div></div>`,
        ok: { label: "Apply damage", icon: "fa-solid fa-burst" },
        rejectClose: false
      });
      if (!result) return;
      systemsPoints = Math.clamp(Math.trunc(Number(result.systems)) || 0, 0, room);
    }
  }
  await toGM({ op: "apply", messageId: message.id, systemsPoints });
}

/* ------------------------------------------------------------------ */
/*  GM side                                                             */
/* ------------------------------------------------------------------ */

async function toGM(data) {
  const gm = game.users.activeGM;
  if (!gm) return ui.notifications.warn("A GM must be connected to resolve this step.");
  if (gm === game.user) return handleGM(data);
  game.socket.emit(SOCKET, data, { recipients: [gm.id] });
}

async function handleGM(data) {
  switch (data.op) {
    case "evaded": return resolveEvade(data);
    case "apply": return applyDamage(data);
  }
}

async function saveCard(message, st) {
  await message.update({ content: cardHtml(st), [`flags.${MODULE_ID}.attack`]: st });
}

async function resolveEvade({ messageId, dice, successes, armourUsed }) {
  const message = game.messages.get(messageId);
  const st = foundry.utils.deepClone(message?.getFlag(MODULE_ID, "attack"));
  if (!st || st.status !== "pending") return;
  const target = await fromUuid(st.targetUuid);
  const attacker = await fromUuid(st.attackerUuid);
  if (!target) return;

  const armourValue = target.system.effective.armour.value;
  const armourCancel = armourUsed ? Math.min(armourValue, st.dice) : 0;
  const remaining = Math.max(0, st.dice - armourCancel - successes * (st.type === "boarding" ? 2 : 1));
  Object.assign(st, {
    status: "resolved", evasionDice: dice, evasionSuccesses: successes, armourUsed, armourCancel, remaining,
    damage: 0, effectHit: false, boarded: false
  });
  if (armourUsed && target.system.armour.value > 0) {
    await target.update({ "system.armour.value": target.system.armour.value - 1 });
  }

  switch (st.type) {
    case "volley": st.damage = remaining; break;
    case "prime": st.damage = remaining > 0 ? 5 : 0; break; // Prime: 5 damage if any die gets through
    case "boarding": st.boarded = remaining > 0; break;
    case "ram": {
      // Each remaining die hurts both ships; the survivors are then rolled (TN rises with range) for +5 each.
      if (remaining > 0 && attacker) {
        const hull = attacker.system.structure;
        const next = Math.max(0, hull.value - remaining);
        await attacker.update({ "system.structure.value": next });
        st.selfDamage = remaining;
        st.attackerDestroyed = next === 0;
        st.damage = remaining;
        st.ramSuccesses = 0;
        if (!st.attackerDestroyed) {
          const tn = DEFAULT_TN + st.step;
          const roll = await new Roll(`${remaining}d12cs>=${tn}`).evaluate();
          await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: attacker }), flavor: `${attacker.name}: Ramming dice (TN ${tn})` });
          st.ramSuccesses = roll.total;
          st.damage = remaining + 5 * roll.total;
        }
      }
      break;
    }
  }
  // Targeting a system trades damage for an effect.
  if (st.targeted && (st.type === "volley" || st.type === "prime")) {
    st.effectHit = remaining > 0;
    st.damage = 0;
  }
  await saveCard(message, st);
}

async function applyDamage({ messageId, systemsPoints }) {
  const message = game.messages.get(messageId);
  const st = foundry.utils.deepClone(message?.getFlag(MODULE_ID, "attack"));
  if (!st || st.status !== "resolved") return;
  const target = await fromUuid(st.targetUuid);
  if (!target) return;
  const s = target.system;
  const update = {};
  const lines = [];
  let systems = s.systems.value;

  if (st.damage > 0) {
    const sp = Math.clamp(Math.trunc(Number(systemsPoints)) || 0, 0, Math.min(st.damage, systems));
    const hullDamage = st.damage - sp;
    const hull = Math.max(0, s.structure.value - hullDamage);
    systems -= sp;
    update["system.structure.value"] = hull;
    lines.push(`${hullDamage} to Structural Integrity (${s.structure.value} → ${hull})${sp ? `, ${sp} to Systems` : ""}`);
    if (hull === 0) lines.push(`${target.name} is destroyed`);
  }
  let rollEffects = st.damage >= 10;
  if (st.effectHit) {
    systems = Math.max(0, systems - 1);
    lines.push(`Systems ${s.systems.value} → ${systems}`);
    rollEffects = true;
  }
  if (systems !== s.systems.value) update["system.systems.value"] = systems;

  if (rollEffects) {
    const { effect, effects } = await rollEffectsTable(target);
    update["system.effects"] = effects;
    lines.push(`Effect: ${effect.name}`);
  }
  await target.update(update);
  st.status = "applied";
  st.summary = `Applied: ${lines.join("; ")}.`;
  await saveCard(message, st);
}

/** Roll d100 on the Effects Table, post the result, and return the effect plus the ship's new effect list. */
export async function rollEffectsTable(actor) {
  const roll = await new Roll("1d100").evaluate();
  const effect = effectForRoll(roll.total);
  const effects = new Set(actor.system.effects);
  const already = effects.has(effect.key);
  effects.add(effect.key);
  const note = already ? ` <em>(${game.i18n.localize("SHIPSTATS.AlreadyApplied")})</em>` : "";
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `<strong>${game.i18n.localize("SHIPSTATS.EffectsTable")}: ${effect.name}</strong>${note}<br>${effect.details}`
  });
  return { effect, effects: Array.from(effects) };
}

/** Reminders after a ship took damage: 10 or more in one salvo means an Effects Table roll; 0 Structure means destroyed. */
export function warnHull(actor, damage, hullAfter) {
  if (damage >= 10) ui.notifications.warn(game.i18n.format("SHIPSTATS.RollEffectsReminder", { name: actor.name, amount: damage }));
  if (damage && hullAfter === 0) ui.notifications.error(game.i18n.format("SHIPSTATS.Destroyed", { name: actor.name }));
}

/* ------------------------------------------------------------------ */
/*  Sockets, Combat tracker and turn start                              */
/* ------------------------------------------------------------------ */

/** Draw Steel's own initiative mode (side-based, counter initiative): leave initiative alone there. */
const usesSystemInitiative = () => Boolean(game.combats?.isDefaultInitiativeMode);

export function registerCombat() {
  game.socket.on(SOCKET, async (data) => {
    if (data.op === "allocate") {
      const actor = await fromUuid(data.actorUuid);
      return actor ? promptAllocation(actor) : undefined;
    }
    if (game.user === game.users.activeGM) return handleGM(data);
  });

  // Lower initiative acts first: sort ships ascending (other combatants keep the normal order).
  const proto = CONFIG.Combat.documentClass.prototype;
  const original = proto._sortCombatants;
  proto._sortCombatants = function (a, b) {
    if (!usesSystemInitiative() && a.actor?.type === SHIP_TYPE && b.actor?.type === SHIP_TYPE) {
      const ia = Number.isFinite(a.initiative) ? a.initiative : Infinity;
      const ib = Number.isFinite(b.initiative) ? b.initiative : Infinity;
      if (ia !== ib) return ia < ib ? -1 : 1;
      return (a.id ?? "") < (b.id ?? "") ? -1 : 1;
    }
    return original.call(this, a, b);
  };

  // The tracker's own "roll initiative" button uses the ship's dice (class dice plus modifiers).
  const combatant = CONFIG.Combatant.documentClass.prototype;
  const originalRoll = combatant.getInitiativeRoll;
  combatant.getInitiativeRoll = function (formula) {
    if (this.actor?.type === SHIP_TYPE && !usesSystemInitiative()) return new Roll(shipInitiativeFormula(this.actor.system));
    return originalRoll.call(this, formula);
  };
}

export function shipInitiativeFormula(system) {
  const bonus = system.initiativeBonus;
  return bonus ? `${system.initiativeDice} ${bonus > 0 ? "+" : "-"} ${Math.abs(bonus)}` : system.initiativeDice;
}

/** Put a rolled initiative total into the active Combat (adding the ship's token if it is missing). */
export async function pushInitiative(actor, total) {
  const combat = game.combat;
  if (!combat || usesSystemInitiative()) return;
  try {
    let combatant = combat.combatants.find((c) => c.actorId === actor.id);
    if (!combatant) {
      const token = actor.getActiveTokens()[0];
      if (!token) return;
      [combatant] = await combat.createEmbeddedDocuments("Combatant", [{ tokenId: token.id, sceneId: token.scene.id, actorId: actor.id }]);
    }
    await combat.setInitiative(combatant.id, total);
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not set initiative in the Combat tracker`, err);
  }
}

const RESET = {
  "system.allocation": { captain: 0, sensors: 0, pilot: 0, mechanic: 0 },
  "system.actionsUsed": [],
  "system.energy.spent": 0,
  "system.energy.bonus": 0
};
const recentTurns = new Map();

/**
 * A ship's turn begins: clear its per-turn Energy and actions, then ask for the new allocation.
 * Called from the combat hooks (GM client) and from the ship's own _onStartTurn, which Draw Steel's
 * combat calls; the guard keeps the two routes from both firing.
 */
export async function startShipTurn(actor, { prompt = true } = {}) {
  if (actor?.type !== SHIP_TYPE || !actor.isOwner) return;
  const now = Date.now();
  if (now - (recentTurns.get(actor.id) ?? 0) < 2000) return;
  recentTurns.set(actor.id, now);
  try {
    await actor.update({ ...RESET, "system.systems.overworkEnergy": actor.system.systems.overwork });
  } catch (err) {
    return console.error(`${MODULE_ID} | Could not reset the turn of ${actor.name}`, err);
  }
  if (!prompt) return;
  if (game.user.isGM) notifyTurnStart(actor);
  else promptAllocation(actor);
}

/** GM client, after a ship's turn data was reset: ask whoever plays the ship to allocate Energy. */
export function notifyTurnStart(actor) {
  const owners = game.users.filter((u) => u.active && !u.isGM && actor.testUserPermission(u, "OWNER"));
  const recipients = owners.length ? owners.map((u) => u.id) : [game.user.id];
  for (const id of recipients) {
    if (id === game.user.id) promptAllocation(actor);
    else game.socket.emit(SOCKET, { op: "allocate", actorUuid: actor.uuid }, { recipients: [id] });
  }
}

/** One dialog to hand out this turn's Energy to the four crew positions. */
export async function promptAllocation(actor) {
  if (!game.settings.get(MODULE_ID, "promptAllocation")) return;
  const s = actor.system;
  const available = Math.max(0, s.energy.max - s.energy.committed);
  const content = `
    <p>Energy available: <strong>${available}</strong>. Left to allocate: <strong class="ssc-left">${available}</strong></p>
    ${ROLES.map((r) => `<div class="form-group"><label>${r.name}</label>
      <div class="form-fields"><input type="number" name="${r.key}" min="0" max="${available}" step="1" value="0"></div></div>`).join("")}`;
  const result = await DialogV2.input({
    window: { title: `${actor.name}: Allocate Energy` },
    content,
    ok: { label: "Allocate", icon: "fa-solid fa-bolt" },
    render: (event, dialog) => {
      const el = dialog.element;
      const left = el.querySelector(".ssc-left");
      const update = () => {
        const used = [...el.querySelectorAll("input[type=number]")].reduce((n, i) => n + (Number(i.value) || 0), 0);
        left.textContent = String(available - used);
        left.style.color = used > available ? "#f87171" : "";
      };
      el.addEventListener("input", update);
      update();
    },
    rejectClose: false
  });
  if (!result) return;
  let left = available;
  const allocation = {};
  for (const role of ROLES) {
    const value = Math.clamp(Math.trunc(Number(result[role.key])) || 0, 0, left);
    allocation[role.key] = value;
    left -= value;
  }
  await actor.update({ "system.allocation": allocation });
  try {
    await actor.sheet.render({ force: true });
    actor.sheet.changeTab("actions", "primary");
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not open the Actions tab`, err);
  }
}
