/* ==========================================================================
 * AXIOM — Player Actions
 * Each action costs hours (the world ticks), touches the body, the economy,
 * reputation, or the conspiracy. Returns {msg, kind} for the UI to render.
 * ========================================================================== */

const Actions = {};

/* Helper: spend time and return a result line. */
Actions._do = function (g, hours, msg, kind) {
  Engine.advance(g, hours);
  Engine.push(g, msg, kind || "act");
  return { msg, kind };
};

/* ---- TRAVEL -------------------------------------------------------------- */
Actions.travel = function (g, dest) {
  if (!AXIOM.ROUTES[g.here].includes(dest)) return { msg: "There is no direct route from here.", kind: "warn" };
  const d = AXIOM.DISTRICTS[dest];

  // Status gate — entering above your station.
  if (AXIOM.STATUS[g.status].rank < d.minStatus) {
    const ck = Engine.check(g, "deception", 55);
    if (!ck.ok) {
      Engine.advance(g, 1);
      return Actions._do(g, 0, `The checkpoint into ${d.name} turns you back. Your station does not reach here, and your story did not hold.`, "warn");
    }
  }

  // Sub-Strata needs a guide or strong navigation.
  if (d.needsGuide && Engine.skillLevel(g, "navigation") < 35 && !g.flags.haveMap) {
    if (Engine.check(g, "navigation", 60).ok === false) {
      Engine.advance(g, 2);
      Engine.injure(g, "twisted ankle", 1);
      return { msg: "Without a guide or a good map, the Sub-Strata swallows you. You find your way back out, but not unhurt.", kind: "warn" };
    }
  }

  const w = AXIOM.WEATHER[g.weather];
  let hours = Math.round((1 + AXIOM.DISTRICTS[dest].danger * 0.4) * w.travel);

  // Danger en route.
  const danger = Engine.dangerNow(g, dest);
  let msg = `You make your way to ${d.name}. ${d.smell ? "The air here is " + d.smell + "." : ""}`;
  if (Engine.chance(danger * 0.05)) {
    if (Engine.check(g, g.skills.blade.level > g.skills.deception.level ? "blade" : "deception", 50).ok) {
      msg += " A shakedown on the way — you talk or fight your way clear.";
    } else {
      const loss = Math.min(g.money, 10 + Engine.rand(20));
      g.money -= loss;
      Engine.injure(g, "bruised ribs", 1);
      msg += ` You're jumped en route. They take ${loss} shekels and leave you sore.`;
    }
  }
  g.here = dest;
  return Actions._do(g, hours, msg, "travel");
};

/* ---- SURVIVAL ------------------------------------------------------------ */
Actions.eat = function (g) {
  // Prefer bread, then fish, then grain from inventory.
  const order = ["bread", "fish", "grain", "water"];
  const have = order.find((id) => (g.inventory[id] || 0) > 0);
  if (!have) return { msg: "You have no food. Hunger is a logistical problem you have not solved.", kind: "warn" };
  g.inventory[have]--;
  const relief = have === "water" ? 8 : 30;
  g.hunger = Engine.clamp(g.hunger - relief, 0, 120);
  return Actions._do(g, 1, `You eat ${AXIOM.GOODS[have].name.toLowerCase()}. The edge comes off the hunger.`, "body");
};

Actions.sleep = function (g) {
  const d = AXIOM.DISTRICTS[g.here];
  const danger = Engine.dangerNow(g, g.here);
  const safe = g.here === g.flags.safehouse || danger <= 1 || (g.rep[g.here] || 0) > 30;
  if (!safe && Engine.chance(0.25 + danger * 0.05)) {
    const loss = Math.min(g.money, 5 + Engine.rand(25));
    g.money -= loss;
    Engine.advance(g, 4);
    return { msg: `You try to sleep rough in ${d.name}, but it is not safe ground for you. You're robbed of ${loss} shekels and wake worse than before.`, kind: "warn" };
  }
  const hrs = 7;
  g.fatigue = Engine.clamp(g.fatigue - 60, 0, 120);
  return Actions._do(g, hrs, `You sleep ${hrs} hours${safe ? " on safe ground" : ""}. The body resets a little.`, "body");
};

Actions.treat = function (g) {
  const useKit = (g.inventory.stim || 0) > 0;
  const r = Engine.treat(g, useKit && Engine.skillLevel(g, "medicine") < 40);
  if (useKit && r.ok && Engine.skillLevel(g, "medicine") < 40) g.inventory.stim--;
  Engine.advance(g, 1);
  Engine.push(g, r.msg, r.ok ? "body" : "warn");
  return { msg: r.msg, kind: r.ok ? "body" : "warn" };
};

/* ---- WORK (district-flavored income) ------------------------------------ */
Actions.work = function (g) {
  const d = g.here;
  let pay = 0, skill = "rhetoric", msg = "";
  switch (d) {
    case "hanging_market":
      skill = "rhetoric";
      { const ck = Engine.check(g, "rhetoric", 45);
        pay = ck.ok ? 18 + Engine.rand(14) : 6 + Engine.rand(6);
        msg = ck.ok ? "You broker a stall sale and skim an honest margin." : "You haggle all afternoon for thin coin."; }
      break;
    case "neon_labyrinth":
      skill = "hacking";
      if (!g.skills.hacking.known) return { msg: "Running data work needs hacking you haven't learned. Find a teacher first.", kind: "warn" };
      { const ck = Engine.check(g, "hacking", 50 - (g.powerOut ? 15 : 0));
        pay = ck.ok ? 26 + Engine.rand(20) : 4;
        msg = ck.ok ? "You move a packet past a corp filter for a fixer's fee." + (g.powerOut ? " The outage made it easy." : "") : "A trace nearly catches you. You bail with nothing."; }
      break;
    case "ironwall":
      skill = "blade";
      { const ck = Engine.check(g, "blade", 50);
        pay = ck.ok ? 22 + Engine.rand(16) : 8;
        if (!ck.ok && Engine.chance(0.4)) Engine.injure(g, "cut forearm", 1);
        msg = ck.ok ? "You stand a night of muscle work for a family crew." : "The work goes badly. You barely earn, and nearly bleed."; }
      break;
    case "broken_crown":
      skill = "engineering";
      { const ck = Engine.check(g, "engineering", 40);
        pay = ck.ok ? 12 + Engine.rand(10) : 5;
        msg = ck.ok ? "You patch a cistern pump for the council; they pay what they can and remember it." : "You tinker for hours with too few parts.";
        if (ck.ok) Engine.remember(g, "councilor", 4, "you kept the water running"); }
      break;
    case "ziggurat_crown":
      skill = "rhetoric";
      pay = 10 + Engine.rand(8);
      msg = "You copy prayer-records and recite at the lesser altar. The temple feeds and pays you a little.";
      break;
    case "spire":
      skill = "rhetoric";
      pay = 30 + Engine.rand(20);
      msg = "Contract clerical work inside a tower. Clean, well-paid, and watched.";
      break;
    default:
      pay = 6 + Engine.rand(8);
      msg = "You scrape together odd work.";
  }
  g.money += pay;
  Engine.practice(g, skill, 2);
  return Actions._do(g, 4, `${msg} (+${pay} shekels)`, "work");
};

/* ---- TRAIN a skill ------------------------------------------------------- */
Actions.train = function (g, key) {
  const s = g.skills[key];
  if (!s) return { msg: "Unknown discipline.", kind: "warn" };
  if (AXIOM.SKILLS[key].gated && !s.known) {
    return { msg: `${AXIOM.SKILLS[key].name} is knowledge-gated. You must be taught before practice does anything but waste effort. Look for a teacher.`, kind: "warn" };
  }
  if (g.fatigue > 85) return { msg: "You're too exhausted to train usefully. Sleep first.", kind: "warn" };
  Engine.practice(g, key, 4);
  g.fatigue = Engine.clamp(g.fatigue + 8, 0, 120);
  return Actions._do(g, 3, `You drill ${AXIOM.SKILLS[key].name.toLowerCase()} until the body remembers it a little better. (now ${Engine.skillLevel(g, key)})`, "train");
};

/* ---- TRADE --------------------------------------------------------------- */
Actions.buy = function (g, goodId) {
  if (!AXIOM.MARKETS[g.here].includes(goodId)) return { msg: "That isn't traded here.", kind: "warn" };
  const cost = Engine.price(g, goodId, g.here);
  if (g.money < cost) return { msg: `You can't afford ${AXIOM.GOODS[goodId].name} (${cost} shekels).`, kind: "warn" };
  g.money -= cost;
  g.inventory[goodId] = (g.inventory[goodId] || 0) + 1;
  // Buying nudges the price up a hair (you are part of the market).
  g.economy[goodId] = Engine.clamp((g.economy[goodId] || 1) * 1.01, 0.4, 4);
  return Actions._do(g, 1, `You buy ${AXIOM.GOODS[goodId].name} for ${cost} shekels.`, "trade");
};

Actions.sell = function (g, goodId) {
  if ((g.inventory[goodId] || 0) <= 0) return { msg: "You have none of those.", kind: "warn" };
  let cut = AXIOM.MARKETS[g.here].includes(goodId) ? 0.9 : 0.6; // off-market sells poorly
  const price = Math.max(1, Math.round(Engine.price(g, goodId, g.here) * cut));
  g.inventory[goodId]--;
  g.money += price;
  g.economy[goodId] = Engine.clamp((g.economy[goodId] || 1) * 0.99, 0.4, 4);
  return Actions._do(g, 1, `You sell ${AXIOM.GOODS[goodId].name} for ${price} shekels.`, "trade");
};

/* ---- TALK to an NPC ------------------------------------------------------ */
Actions.talk = function (g, npcId) {
  const def = Engine.NPC_DEFS.find((d) => d.id === npcId && d.district === g.here);
  if (!def) return { msg: "They're not here right now. People keep their own schedules.", kind: "warn" };
  const rec = g.npc[npcId];

  // Some NPCs teach gated skills if they trust you.
  const teaches = { fixer: "hacking", doctor: "medicine", guide: "navigation" };
  let extra = "";
  if (teaches[npcId] && rec.disp >= 15 && !g.skills[teaches[npcId]].known) {
    Engine.learn(g, teaches[npcId]);
    extra = ` They decide you're worth teaching, and open up the basics of ${AXIOM.SKILLS[teaches[npcId]].name.toLowerCase()} to you.`;
  }
  if (npcId === "guide" && rec.disp >= 25 && !g.flags.haveMap) {
    g.flags.haveMap = true;
    extra += " Old Pell trusts you with a copy of a Sub-Strata map — a thing of enormous value.";
  }

  // A persuasion attempt that shifts disposition.
  const ck = Engine.check(g, "rhetoric", 45 - Math.round(rec.disp / 4));
  const delta = ck.ok ? 6 : -3;
  Engine.remember(g, npcId, delta, ck.ok ? `${def.name} warms to you` : `${def.name} is unimpressed`);
  const mood = rec.disp > 25 ? "speaks to you like an ally" : rec.disp < -25 ? "barely tolerates your presence" : "measures you carefully";
  const msg = `${def.name}, ${def.role}, ${mood}.${extra} ${ck.ok ? "The conversation goes well." : "It does not land as you hoped."}`;
  return Actions._do(g, 1, msg, "talk");
};

/* ---- CONVERSE: Friendly / Neutral / Trade -------------------------------
 * Each choice permanently shifts your relationship with this specific person
 * and their faction. Lines are drawn from a contextual pool by role & mood.
 * meta: {id, name, role, kind, faction, district, ambient, hub, teaches?}
 * Returns {line, delta, disp, openMarket}.
 * -------------------------------------------------------------------------- */
Actions.converse = function (g, meta, mode) {
  Engine.ensureNPC(g, meta.id);
  g.met = g.met || {};
  g.met[meta.id] = true;
  const rec = g.npc[meta.id];
  let delta = 0, openMarket = false, perk = "";

  if (mode === "Friendly") {
    // A genuine attempt at rapport — rhetoric reads the breaking point.
    const ck = Engine.check(g, "rhetoric", 45 - Math.round(rec.disp / 4));
    delta = ck.ok ? 7 : 2;
    // Named teachers open gated skills / the map once they trust you.
    if (!meta.ambient) {
      const teaches = { fixer: "hacking", doctor: "medicine", medic: "medicine", guide: "navigation" };
      const t = teaches[meta.kind];
      if (t && rec.disp + delta >= 15 && g.skills[t] && !g.skills[t].known) {
        Engine.learn(g, t); perk = ` They judge you worth teaching, and open the basics of ${AXIOM.SKILLS[t].name.toLowerCase()} to you.`;
      }
      if (meta.kind === "guide" && rec.disp + delta >= 25 && !g.flags.haveMap) {
        g.flags.haveMap = true; perk = " Old Pell presses a copy of a Sub-Strata map into your hands — a thing of enormous value.";
      }
    }
  } else if (mode === "Trade") {
    delta = 2;
    openMarket = (AXIOM.MARKETS[g.here] || []).length > 0;
  } else { // Neutral
    delta = rec.disp < 0 ? 1 : 0;
  }

  Engine.rememberMeta(g, meta, delta, delta >= 7 ? `${meta.name} warms to you` : null);
  Engine.advance(g, 1);

  const line = People.pickResponse(meta.kind, mode) + perk;
  Engine.push(g, `${meta.name}: ${line}`, "talk");
  return { line, delta, disp: g.npc[meta.id].disp, openMarket };
};

/* ---- READ OMENS (God Quarter only) --------------------------------------- */
Actions.omen = function (g) {
  if (g.here !== "god_quarter") return { msg: "Omens are read in the God Quarter, where the divine leaves marks.", kind: "warn" };
  const text = Engine.castOmen(g);
  if (!text) return Actions._do(g, 1, "The signs are quiet today; what was foretold has not yet come to pass.", "omen");
  return Actions._do(g, 1, `You sit with the temple readers. ${text} Dismiss it as superstition at your own expense.`, "omen");
};

/* ---- PRAY at a temple landmark (Grand Ziggurat / sanctum) ---------------- */
Actions.pray = function (g) {
  Engine.advance(g, 2);
  g.fatigue = Engine.clamp(g.fatigue + 6, 0, 120);
  Engine.shiftFaction(g, "temple", 3);
  g.rep[g.here] = Engine.clamp((g.rep[g.here] || 0) + 2, -100, 100);
  // The divine occasionally answers in ways too specific to be chance.
  let extra = "";
  if (!g.pendingOmen && Engine.chance(0.5)) {
    const text = Engine.castOmen(g);
    if (text) extra = " As you rise, a temple reader murmurs a warning: " + text;
  }
  const msg = "You ascend to the summit and pray among the cedar smoke. The priesthood notes your devotion." + extra;
  Engine.push(g, msg, "omen");
  return { msg, kind: "omen" };
};

/* ---- EXPLORE (find fragments, salvage, trouble) -------------------------- */
Actions.explore = function (g) {
  const d = AXIOM.DISTRICTS[g.here];
  const danger = Engine.dangerNow(g, g.here);

  // Conspiracy fragment discovery — gated by knowledge chain & navigation.
  const frag = AXIOM.FRAGMENTS.find(
    (f) => f.where === g.here && !g.fragments.includes(f.id) && (!f.needs || g.fragments.includes(f.needs))
  );
  if (frag && Engine.check(g, "navigation", 40 + danger * 3).ok) {
    g.fragments.push(frag.id);
    Engine.advance(g, 3);
    Engine.push(g, `You find something the world forgot: ${frag.name}.`, "reveal");
    Engine.push(g, frag.text, "fragment");
    const revealed = Engine.checkRevelation(g);
    return { msg: `${frag.name} — ${frag.text}`, kind: "fragment", revealed };
  }

  // Otherwise: salvage, money, or trouble depending on the district.
  let msg, kind = "explore";
  if (Engine.chance(danger * 0.06)) {
    // Trouble.
    if (Engine.check(g, Engine.skillLevel(g, "blade") > 30 ? "blade" : "navigation", 50).ok) {
      msg = "You stumble into something you shouldn't have, but get clear of it.";
    } else {
      Engine.injure(g, "knife wound", 1 + Engine.rand(2));
      kind = "warn";
      msg = "You wander into the wrong corner. It costs you blood to get back out.";
    }
  } else if (Engine.chance(0.5)) {
    const loot = Engine.pick(AXIOM.MARKETS[g.here]);
    g.inventory[loot] = (g.inventory[loot] || 0) + 1;
    msg = `You scavenge the ${d.name} and turn up ${AXIOM.GOODS[loot].name}.`;
  } else {
    const found = 4 + Engine.rand(12);
    g.money += found;
    msg = `You work the district's edges and come away with ${found} shekels and a better feel for the ground.`;
    Engine.practice(g, "navigation", 1.5);
  }
  return Actions._do(g, 3, msg, kind);
};

/* ---- AUGMENTATION maintenance (Neon Labyrinth) --------------------------- */
Actions.tuneAug = function (g) {
  if (!g.aug) return { msg: "You carry no augmentation to maintain.", kind: "warn" };
  const hasCoolant = (g.inventory.augkit || 0) > 0;
  const fixerTrust = g.npc.fixer && g.npc.fixer.disp >= 0;
  if (g.here !== "neon_labyrinth") return { msg: "Augmentation work happens in the Neon Labyrinth's clinics.", kind: "warn" };
  if (!hasCoolant && !fixerTrust) return { msg: "You need Aug Coolant, or a fixer who'll front you the work on trust.", kind: "warn" };
  if (hasCoolant) g.inventory.augkit--;
  g.aug.integrity = Engine.clamp(g.aug.integrity + 35, 0, 100);
  Engine.remember(g, "fixer", 2, "you keep your hardware serviced");
  return Actions._do(g, 2, `A back-room clinic flushes and recalibrates your ${g.aug.name}. Integrity is back up to ${Math.round(g.aug.integrity)}.`, "body");
};
