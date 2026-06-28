/* ==========================================================================
 * AXIOM — Simulation Engine
 * Time, the body, skills, reputation & NPC memory, the living economy,
 * weather, omens, and the cascades that run whether you watch them or not.
 * ========================================================================== */

const Engine = {};

/* ---- small utilities ---------------------------------------------------- */
Engine.clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
Engine.rand = (n) => Math.floor(Math.random() * n);
Engine.pick = (arr) => arr[Engine.rand(arr.length)];
Engine.chance = (p) => Math.random() < p;

Engine.PERIODS = [
  { at: 4,  name: "First Light", prayer: true },
  { at: 8,  name: "Morning",     prayer: true },
  { at: 12, name: "Noon",        prayer: true },
  { at: 16, name: "Afternoon",   prayer: true },
  { at: 20, name: "Dusk",        prayer: true },
  { at: 23, name: "Deep Night",  prayer: true },
];

Engine.period = function (g) {
  let cur = Engine.PERIODS[0];
  for (const p of Engine.PERIODS) if (g.hour >= p.at) cur = p;
  if (g.hour < 4) cur = Engine.PERIODS[5]; // pre-dawn is still Deep Night
  return cur;
};

Engine.isNight = (g) => g.hour >= 21 || g.hour < 5;

/* ---- narrative log ------------------------------------------------------ */
Engine.push = function (g, text, kind) {
  g.log.push({ day: g.day, hour: g.hour, text, kind: kind || "" });
  if (g.log.length > 200) g.log.shift();
};

/* ==========================================================================
 * NPCs — people with lives, schedules, and memory of you.
 * Social-hub weight controls how far an opinion of you propagates.
 * ========================================================================== */
Engine.NPC_DEFS = [
  { id: "arbiter",  name: "Guild Arbiter Semra",  district: "hanging_market", role: "lead market arbiter",        hub: 0.9,  kind: "arbiter",   faction: "guild" },
  { id: "priest",   name: "Junior Priest Eshu",   district: "ziggurat_crown", role: "temple acolyte's superior", hub: 0.6,  kind: "priest",    faction: "temple" },
  { id: "warlord",  name: "Matron Kol",           district: "ironwall",       role: "warlord matriarch",          hub: 0.85, kind: "warlord",   faction: "ironwall" },
  { id: "councilor",name: "Councilor Ditu",       district: "broken_crown",   role: "neighborhood councilor",     hub: 0.8,  kind: "councilor", faction: "broken_crown" },
  { id: "fixer",    name: "The Fixer Vane",       district: "neon_labyrinth", role: "augmentation fixer",         hub: 0.7,  kind: "fixer",     faction: "street" },
  { id: "exec",     name: "Director Aldous",      district: "spire",          role: "Meridian director",          hub: 0.75, kind: "exec",      faction: "corporate" },
  { id: "guide",    name: "Old Pell",             district: "sub_strata",     role: "Sub-Strata map-keeper",      hub: 0.5,  kind: "guide",     faction: "substrata" },
  { id: "doctor",   name: "Doctor Wren",          district: "broken_crown",   role: "informal-network physician", hub: 0.55, kind: "medic",     faction: "broken_crown" },
];

Engine.seedNPCs = function (g) {
  for (const d of Engine.NPC_DEFS) {
    g.npc[d.id] = { disp: 0, mem: [] };
  }
};

Engine.npcAt = function (g, district) {
  return Engine.NPC_DEFS.filter((d) => d.district === district);
};

/* Ensure a memory record exists for any NPC (named or generated ambient). */
Engine.ensureNPC = function (g, id) {
  if (!g.npc[id]) g.npc[id] = { disp: 0, mem: [] };
  return g.npc[id];
};

/* Faction standing — your relationship with the organisation behind a person. */
Engine.factionRep = function (g, faction) {
  if (!g.factionRep) g.factionRep = {};
  return g.factionRep[faction] || 0;
};
Engine.shiftFaction = function (g, faction, delta) {
  if (!faction || faction === "none") return;
  if (!g.factionRep) g.factionRep = {};
  g.factionRep[faction] = Engine.clamp((g.factionRep[faction] || 0) + delta, -100, 100);
};

/* ---- play-style profile (how you actually play) ------------------------- */
Engine.style = function (g, key, n) {
  if (!g.style) g.style = { violence: 0, deception: 0, charity: 0, piety: 0, crime: 0, commerce: 0, wander: 0, loyalty: 0 };
  g.style[key] = (g.style[key] || 0) + (n == null ? 1 : n);
};
/* The trait the player leans on most — used to flavour reactive story beats. */
Engine.dominantStyle = function (g) {
  if (!g.style) return "none";
  let best = "none", bv = 2; // need at least a little to count
  for (const k of Object.keys(g.style)) if (g.style[k] > bv) { bv = g.style[k]; best = k; }
  return best;
};

/* ---- heat / notoriety --------------------------------------------------- */
Engine.addHeat = function (g, n) {
  g.heat = Engine.clamp((g.heat || 0) + n, 0, 100);
  if (n > 0) g.bounty = (g.bounty || 0) + Math.round(n * (3 + Engine.rand(5)));
  if (n >= 12) Engine.push(g, `Word of what you did spreads. Heat rises (${Math.round(g.heat)}).`, "rep");
};
Engine.coolHeat = function (g, n) { g.heat = Engine.clamp((g.heat || 0) - n, 0, 100); if (g.heat <= 0) g.bounty = 0; };

/* ---- the criminal path: underworld standing & rank ---------------------- *
 * Built from how much crime you've done and how the criminal factions regard
 * you. Rank gates the jobs the underworld will trust you with.              */
Engine.RANKS = ["Citizen", "Petty Thief", "Earner", "Operator", "Lieutenant", "Underworld Boss"];
Engine.underworldStanding = function (g) {
  const crime = (g.style && g.style.crime) || 0;
  const fac = Math.max(0, Engine.factionRep(g, "ironwall")) + Math.max(0, Engine.factionRep(g, "street")) + Math.max(0, Engine.factionRep(g, "substrata"));
  return Math.round(crime * 2 + fac);  // 0..~300
};
Engine.underworldRank = function (g) {
  const s = Engine.underworldStanding(g);
  const t = [0, 8, 30, 70, 130, 220];
  let r = 0; for (let i = 0; i < t.length; i++) if (s >= t[i]) r = i;
  return r;
};

/* Region trade price for a good (its own supply/demand, then live drift). */
Engine.regionPrice = function (g, goodId, regionId) {
  const good = AXIOM.GOODS[goodId]; if (!good) return 1;
  const econ = (AXIOM.REGION_ECON && AXIOM.REGION_ECON[regionId]) || null;
  let mod = 1;
  if (econ) { if (econ.produces && econ.produces.includes(goodId)) mod *= 0.6; if (econ.wants && econ.wants.includes(goodId)) mod *= 1.7; }
  return Math.max(1, Math.round(good.base * mod * (g.economy[goodId] || 1)));
};

/* Generalised memory for any NPC, with optional social propagation for hubs. */
Engine.rememberMeta = function (g, meta, delta, note) {
  const rec = Engine.ensureNPC(g, meta.id);
  rec.disp = Engine.clamp(rec.disp + delta, -100, 100);
  rec.mem.push({ day: g.day, delta, note });
  if (rec.mem.length > 12) rec.mem.shift();

  const hub = meta.hub || 0.25;
  if (meta.district) g.rep[meta.district] = Engine.clamp((g.rep[meta.district] || 0) + Math.round(delta * hub), -100, 100);
  Engine.shiftFaction(g, meta.faction, Math.round(delta * (0.5 + hub * 0.5)));

  // Named hubs propagate strong opinions through the social network.
  if (Math.abs(delta) >= 8 && hub >= 0.5) {
    for (const other of Engine.NPC_DEFS) {
      if (other.id === meta.id) continue;
      const reach = hub * other.hub * (other.district === meta.district ? 1 : 0.35);
      if (reach < 0.2) continue;
      const bias = g.npc[other.id].disp >= 0 ? 1 : 0.5;
      const echo = Math.round(delta * reach * bias * 0.5);
      if (echo !== 0) {
        g.npc[other.id].disp = Engine.clamp(g.npc[other.id].disp + echo, -100, 100);
        g.rep[other.district] = Engine.clamp(g.rep[other.district] + Math.round(echo * 0.4), -100, 100);
      }
    }
    if (note) Engine.push(g, `Word of this will travel: ${note}`, "rep");
  }
};

/* An NPC remembers an interaction; emotionally weighty events propagate to
 * socially-near NPCs, distorted by their existing disposition toward you. */
Engine.remember = function (g, npcId, delta, note) {
  const def = Engine.NPC_DEFS.find((d) => d.id === npcId);
  if (!def) return;
  const rec = g.npc[npcId];
  rec.disp = Engine.clamp(rec.disp + delta, -100, 100);
  rec.mem.push({ day: g.day, delta, note });
  if (rec.mem.length > 12) rec.mem.shift();

  // District reputation shifts with the hub's weight behind the opinion.
  g.rep[def.district] = Engine.clamp(g.rep[def.district] + Math.round(delta * def.hub), -100, 100);

  // Propagation: strong events travel the social network, weakening with
  // distance and bending toward each receiver's prior disposition of you.
  if (Math.abs(delta) >= 8) {
    for (const other of Engine.NPC_DEFS) {
      if (other.id === npcId) continue;
      const reach = def.hub * other.hub * (other.district === def.district ? 1 : 0.35);
      if (reach < 0.2) continue;
      const bias = g.npc[other.id].disp >= 0 ? 1 : 0.5; // friendly ears soften bad news, etc.
      const echo = Math.round(delta * reach * bias * 0.5);
      if (echo !== 0) {
        g.npc[other.id].disp = Engine.clamp(g.npc[other.id].disp + echo, -100, 100);
        g.rep[other.district] = Engine.clamp(g.rep[other.district] + Math.round(echo * 0.4), -100, 100);
      }
    }
    if (note) Engine.push(g, `Word of this will travel: ${note}`, "rep");
  }
};

/* ==========================================================================
 * SKILLS — repetition up, neglect down. Decay is checked lazily on use/tick.
 * ========================================================================== */
Engine.skillLevel = function (g, key) {
  const s = g.skills[key];
  if (!s) return 0;
  const idle = g.day - s.lastDay;
  // Grace of 5 days; then ~1.2/day decay, capped so you don't lose everything.
  let decay = idle > 5 ? Math.floor((idle - 5) * 1.2) : 0;
  decay = Math.min(decay, Math.floor(s.level * 0.6));
  return Engine.clamp(s.level - decay, 0, 100);
};

Engine.practice = function (g, key, gain) {
  const s = g.skills[key];
  if (!s) return;
  // Bank current (post-decay) level so decay isn't double-counted.
  s.level = Engine.skillLevel(g, key);
  // Diminishing returns near mastery.
  const eff = gain * (1 - s.level / 130);
  s.level = Engine.clamp(s.level + Math.max(1, Math.round(eff)), 0, 100);
  s.lastDay = g.day;
};

Engine.learn = function (g, key) {
  if (g.skills[key]) g.skills[key].known = true;
};

/* A skill check: level + a roll, lightly penalized by a wrecked body. */
Engine.check = function (g, key, difficulty) {
  const lvl = Engine.skillLevel(g, key);
  const penalty = Engine.bodyPenalty(g);
  const roll = Engine.rand(40);
  const total = lvl + roll - Math.round(penalty * 30);
  Engine.practice(g, key, total >= difficulty ? 3 : 1.5); // you learn even from failure, less
  return { ok: total >= difficulty, total, lvl, roll };
};

/* ==========================================================================
 * THE BODY — hunger, fatigue, injury, augmentation. Returns a 0..1 penalty.
 * ========================================================================== */
Engine.bodyPenalty = function (g) {
  let p = 0;
  if (g.hunger > 60) p += (g.hunger - 60) / 100;
  if (g.fatigue > 60) p += (g.fatigue - 60) / 100;
  if (g.health < 60) p += (60 - g.health) / 120;
  for (const inj of g.injuries) p += inj.severity * 0.1;
  if (g.aug && g.aug.integrity < 40) p += (40 - g.aug.integrity) / 150;
  return Engine.clamp(p, 0, 0.95);
};

Engine.injure = function (g, part, severity) {
  g.injuries.push({ part, severity, day: g.day });
  g.health = Engine.clamp(g.health - severity * 12, 0, 100);
  Engine.push(g, `Injury: ${part} (${["", "minor", "serious", "grave"][severity] || "grave"}). It will not heal on its own quickly.`, "injury");
};

/* Tend an injury — needs medicine skill or a Medical Kit. */
Engine.treat = function (g, useKit) {
  if (g.injuries.length === 0) return { ok: false, msg: "Nothing to treat." };
  const inj = g.injuries[0];
  const med = Engine.skillLevel(g, "medicine");
  const success = useKit || med >= 25 + inj.severity * 15;
  if (success) {
    g.injuries.shift();
    g.health = Engine.clamp(g.health + inj.severity * 8, 0, 100);
    Engine.practice(g, "medicine", 2);
    return { ok: true, msg: `You treat the ${inj.part}. It will still need time, but it will not worsen now.` };
  }
  // Failed treatment risks infection.
  inj.severity = Math.min(3, inj.severity + (Engine.chance(0.4) ? 1 : 0));
  return { ok: false, msg: `Your hands aren't skilled enough. The ${inj.part} risks infection now.` };
};

/* ==========================================================================
 * ECONOMY — base price * district mod * live drift, nudged by weather/cascades.
 * ========================================================================== */
Engine.price = function (g, goodId, district) {
  const good = AXIOM.GOODS[goodId];
  const dist = AXIOM.DISTRICTS[district];
  let pr = good.base * dist.priceMod * (g.economy[goodId] || 1);
  return Math.max(1, Math.round(pr));
};

/* Daily economic drift — random walk toward 1.0, plus weather & cascade shoves. */
Engine.driftEconomy = function (g) {
  const w = AXIOM.WEATHER[g.weather];
  for (const id of Object.keys(g.economy)) {
    let m = g.economy[id];
    m += (1 - m) * 0.08;                 // mean reversion
    m *= 1 + (Math.random() - 0.5) * 0.06; // noise
    if (w.priceUp && w.priceUp.includes(id)) m *= 1.04;
    g.economy[id] = Engine.clamp(m, 0.4, 4);
  }
  // Active cascades push specific goods.
  for (const c of g.cascades) {
    if (c.id === "drought") { g.economy.grain *= 1.05; g.economy.bread *= 1.05; g.economy.water *= 1.03; }
    if (c.id === "windfall") { g.economy.grain *= 0.96; g.economy.bread *= 0.97; }
    if (c.id === "war") { g.economy.contraband *= 1.02; g.economy.parts *= 1.01; g.economy.stim *= 1.01; }
  }
};

/* ==========================================================================
 * WEATHER & OMENS & CASCADES — the world's own momentum.
 * ========================================================================== */
Engine.rollWeather = function (g) {
  if (g.day < g.weatherEnds) return;
  const roll = Math.random();
  let next = "clear";
  if (roll > 0.82) next = "sandstorm";
  else if (roll > 0.66) next = "rain";
  else if (roll > 0.52) next = "heat";
  g.weather = next;
  g.weatherEnds = g.day + 1 + Engine.rand(next === "sandstorm" ? 3 : 2);
  if (next !== "clear")
    Engine.push(g, `Weather turns: ${AXIOM.WEATHER[next].name}. ${AXIOM.WEATHER[next].desc}`, "weather");
};

/* Foretell an event in the God Quarter. The player may act on it or dismiss it. */
Engine.castOmen = function (g) {
  if (g.pendingOmen) return null;
  const kinds = ["drought", "unrest", "raid", "windfall", "power"];
  const ev = Engine.pick(kinds);
  g.pendingOmen = { event: ev, day: g.day + 1 + Engine.rand(2) };
  return AXIOM.OMENS[ev];
};

/* Fulfil a foretold event when its day arrives (omens are accurate). */
Engine.fulfilOmens = function (g) {
  if (!g.pendingOmen || g.day < g.pendingOmen.day) return;
  const ev = g.pendingOmen.event;
  g.pendingOmen = null;
  Engine.triggerCascade(g, ev);
};

Engine.triggerCascade = function (g, id) {
  switch (id) {
    case "drought":
      g.cascades.push({ id: "drought", label: "Drought in the Ur Basin", day: g.day, ttl: 8 });
      Engine.push(g, "A drought has taken hold in the Ur Basin. Grain and bread will climb for weeks; the Broken Crown will feel it first.", "world");
      break;
    case "windfall":
      g.cascades.push({ id: "windfall", label: "Bountiful harvest", day: g.day, ttl: 6 });
      Engine.push(g, "Word from the Basin: a heavy harvest. Staples will soften across the markets.", "world");
      break;
    case "unrest":
      g.rep.broken_crown = Engine.clamp(g.rep.broken_crown - 5, -100, 100);
      Engine.push(g, "Unrest stirs in the Broken Crown — bread prices and old grievances. The street is tense.", "world");
      break;
    case "raid":
      g.cascades.push({ id: "raid", label: "Ironwall raids", day: g.day, ttl: 4 });
      Engine.push(g, "Blood in the Ironwall Quarter. A family is collecting debts by force; the streets there are dangerous.", "world");
      break;
    case "power":
      g.powerOut = true;
      g.flags.powerUntil = g.day + 1;
      Engine.push(g, "The grid fails across the Neon Labyrinth. In the dark, the clinics fill and the surveillance net grows gaps.", "world");
      break;
    case "election": {
      g.cascades.push({ id: "election", label: "Council election", day: g.day, ttl: 6 });
      // a faction gains the upper hand; standings and prices shift accordingly
      const facs = ["guild", "corporate", "broken_crown", "ironwall", "temple"];
      const winner = Engine.pick(facs);
      g.flags.rulingFaction = winner;
      Engine.shiftFaction(g, winner, 4);
      if (winner === "corporate") { g.economy.stim *= 1.04; g.economy.augkit *= 1.04; }
      if (winner === "guild") { g.economy.cloth *= 0.97; g.economy.parts *= 0.97; }
      Engine.push(g, `A council election turns: ${AXIOM.FACTIONS ? AXIOM.FACTIONS[winner] : winner} gains the upper hand. The city's terms shift for a season.`, "world");
      break;
    }
    case "war":
      g.cascades.push({ id: "war", label: "Border war", day: g.day, ttl: 10 });
      g.economy.contraband *= 1.08; g.economy.parts *= 1.05; g.economy.stim *= 1.05;
      Engine.push(g, "War flares on a distant border. Trade routes tighten; contraband, parts, and medicine all climb, and the corporations are hiring.", "world");
      break;
  }
};

Engine.expireCascades = function (g) {
  g.cascades = g.cascades.filter((c) => g.day - c.day < c.ttl);
  if (g.powerOut && g.flags.powerUntil && g.day >= g.flags.powerUntil) {
    g.powerOut = false;
    Engine.push(g, "Power returns to the Neon Labyrinth. The cameras blink back on.", "world");
  }
};

Engine.dangerNow = function (g, district) {
  let d = AXIOM.DISTRICTS[district] ? AXIOM.DISTRICTS[district].danger : 2;
  if (district === "ironwall" && g.cascades.some((c) => c.id === "raid")) d += 2;
  if (district === "neon_labyrinth" && g.powerOut) d += 1;
  if (g.weather === "sandstorm" && district !== "sub_strata") d = Math.max(0, d - 1);
  // Notoriety: the law-and-order districts get hostile when you're wanted.
  if ((g.heat || 0) > 30 && (district === "spire" || district === "ziggurat_crown" || district === "god_quarter")) d += Math.floor(g.heat / 25);
  return d;
};

/* ==========================================================================
 * THE CLOCK — advancing time is where the world lives.
 * Every action costs hours; this is the single chokepoint that ticks the sim.
 * ========================================================================== */
Engine.advance = function (g, hours) {
  for (let i = 0; i < hours; i++) {
    g.hour++;
    // Hourly body drain.
    g.hunger = Engine.clamp(g.hunger + 1.1, 0, 120);
    g.fatigue = Engine.clamp(g.fatigue + 1.4, 0, 120);

    // Starvation / exhaustion / infection erode health.
    if (g.hunger > 85) g.health = Engine.clamp(g.health - 1.5, 0, 100);
    if (g.fatigue > 90) g.health = Engine.clamp(g.health - 1, 0, 100);
    for (const inj of g.injuries) if (inj.severity >= 2 && Engine.chance(0.05)) {
      g.health = Engine.clamp(g.health - 1, 0, 100);
    }
    // Augmentation slowly degrades with use.
    if (g.aug) g.aug.integrity = Engine.clamp(g.aug.integrity - 0.2, 0, 100);

    if (g.hour >= 24) { g.hour -= 24; Engine.newDay(g); }
  }
  if (g.health <= 0 && !g.over) Engine.die(g, "Your body gave out. The world did not pause to notice.");
};

Engine.newDay = function (g) {
  g.day++;
  // Slow natural healing of light injuries when not starving.
  if (g.hunger < 70 && g.fatigue < 70) {
    for (const inj of g.injuries) {
      if (Engine.chance(0.25 + Engine.skillLevel(g, "medicine") / 300)) {
        inj.severity--;
      }
    }
    g.injuries = g.injuries.filter((i) => i.severity > 0);
  }
  Engine.rollWeather(g);
  Engine.fulfilOmens(g);
  Engine.expireCascades(g);
  Engine.driftEconomy(g);

  // The world acts on its own: a small chance each day of an unforetold event.
  if (Engine.chance(0.18) && !g.pendingOmen) {
    Engine.triggerCascade(g, Engine.pick(["drought", "unrest", "raid", "power", "windfall", "election", "war"]));
  }
  // Notoriety fades if you lie low; faster on the road, slower while infamous.
  if (g.heat > 0) { Engine.coolHeat(g, 4); if (g.heat <= 0) Engine.push(g, "The heat on you has cooled. You can move freely again.", "world"); }
  // Reactive storylines react to a new day, if the system is present.
  if (typeof Story !== "undefined" && Story.onNewDay) Story.onNewDay(g);
  Engine.push(g, `Day ${g.day} begins. ${AXIOM.WEATHER[g.weather].name}.`, "day");
};

Engine.die = function (g, msg) {
  g.over = true;
  Engine.push(g, msg, "death");
  Engine.push(g, "There is no chosen one. There was never going to be a rescue. The City keeps moving.", "death");
};

/* ==========================================================================
 * REVELATION — assembling the conspiracy.
 * ========================================================================== */
Engine.checkRevelation = function (g) {
  if (g.flags.revealed) return false;
  if (g.fragments.length >= AXIOM.FRAGMENTS.length) {
    g.flags.revealed = true;
    Engine.push(g, AXIOM.REVELATION, "reveal");
    return true;
  }
  return false;
};
