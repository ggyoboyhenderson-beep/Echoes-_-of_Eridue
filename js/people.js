/* ==========================================================================
 * AXIOM — People
 * Every person has a distinct body, skin, hair, and dress; a faction; a memory
 * of you; and a contextual pool of lines that reflect their role, district, and
 * personality. Ambient residents are generated deterministically per district,
 * so the same people are there each time you return — and they remember you.
 * ========================================================================== */

const People = {};
window.People = People;

/* ---- factions ----------------------------------------------------------- */
AXIOM.FACTIONS = {
  guild:        "The Guild Council",
  temple:       "The High Priesthood",
  ironwall:     "The Warlord Families",
  broken_crown: "The Broken Crown Councils",
  street:       "The Labyrinth Underworld",
  corporate:    "The Megacorporations",
  substrata:    "The Sub-Strata Networks",
  steppe:       "The Steppe Confederations",
  none:         "Unaffiliated",
};

/* Default faction for ambient residents of a district. */
People.districtFaction = {
  ziggurat_crown: "temple", hanging_market: "guild", god_quarter: "temple",
  ironwall: "ironwall", broken_crown: "broken_crown", neon_labyrinth: "street",
  spire: "corporate", sub_strata: "substrata",
};

/* Which ambient archetypes populate each district. */
People.districtKinds = {
  ziggurat_crown: ["devotee", "laborer", "scribe"],
  hanging_market: ["merchant", "laborer", "scribe"],
  god_quarter:    ["devotee", "pilgrim"],
  ironwall:       ["soldier", "laborer"],
  broken_crown:   ["vagrant", "laborer", "medic"],
  neon_labyrinth: ["augmented", "scribe", "vagrant"],
  spire:          ["scribe", "guard"],
  sub_strata:     ["vagrant", "smuggler", "nomad"],
};

/* ---- appearance palettes ------------------------------------------------ */
AXIOM.BODY = {
  builds: ["thin", "muscular", "fat", "tall", "short", "average", "average"],
  skin: [0xf2c9a0, 0xe0a878, 0xc88a55, 0xa9683c, 0x8a5a30, 0x6e451f, 0x4d2e16, 0xf6d4b8, 0x7a4a28],
  hair: [0x1a1410, 0x2a1f16, 0x4a3320, 0x6e4a28, 0x8a6a3a, 0xb0902a, 0xc8c8c8, 0x8a8a8a, 0x101010, 0x5a2a1a],
  // clothing palettes keyed by faction/role
  cloth: {
    temple:   [0xcdb892, 0xb8a070, 0xa8946a, 0xe6d8b0],
    guild:    [0x9a4a2a, 0x3a6a8a, 0x7a6a3a, 0x8a3a5a],
    ironwall: [0x33312e, 0x2a2c34, 0x4a3020, 0x222020],
    broken_crown: [0x6a5236, 0x7a5a3a, 0x4a5a4a, 0x5a4a6a, 0x7a3a3a],
    street:   [0x1a1a26, 0x38d0c8, 0xff5c7a, 0xc850ff, 0x2a2a3a],
    corporate:[0xeaf0f6, 0xc8d0da, 0x2a3a4a, 0x9aaaba],
    substrata:[0x14181c, 0x2a3a2a, 0x1a2a1a, 0x3a3a2a],
    steppe:   [0x7a5a3a, 0x9a7a4a, 0x5a6a4a, 0x8a6a5a],
    none:     [0x555555, 0x665544, 0x4a4a5a],
  },
};

/* ---- name generation (district-flavoured) ------------------------------- */
People._names = {
  default: ["Aru","Bel","Dara","Eshu","Far","Gula","Hira","Ish","Kanu","Lir","Mara","Nabu","Oru","Pell","Qen","Rema","Sib","Tem","Ulla","Vesh","Yara","Zin","Adda","Sael","Tirin","Veka","Olu","Hane","Suri","Kesh"],
  corporate: ["Aldwin","Brask","Cael","Doran","Eira","Voss","Hale","Kade","Lorne","Maren","Pryce","Quill","Reyes","Stahl","Thorne","Vance"],
  steppe: ["Batu","Choto","Gerel","Naran","Oktai","Sube","Tana","Yesu","Altan","Bayan"],
};
People.nameFor = function (rnd, district) {
  const pool = district === "spire" ? People._names.corporate
    : district === "sub_strata" ? People._names.default.concat(People._names.steppe)
    : People._names.default;
  return pool[(rnd() * pool.length) | 0];
};

/* ==========================================================================
 * Dialogue pools. Original writing. tiers: hostile / neutral / friendly.
 * greet = opening line; Friendly/Neutral/Trade = responses to your choice.
 * ========================================================================== */
AXIOM.DIALOGUE = {
  /* --- named principals --- */
  arbiter: { personality: "shrewd, unbribable",
    greet: { hostile: ["The arbiter does not look up. \"You again. The Market has a long memory and a short patience.\""],
             neutral: ["\"State your business. The floor opens in an hour and I have disputes stacked to the rafters.\""],
             friendly: ["\"Ah — a face the Market trusts. Sit. What do you need settled?\""] },
    Friendly: ["\"Loyalty is a currency here, and you are accumulating it. Spend it wisely.\"", "\"I will remember you spoke straight. That is rarer than gold on this hill.\""],
    Neutral: ["\"Prices are prices. The guilds set them; I only keep them honest.\"", "\"Mind the lower terraces. Raw goods, raw tempers.\""],
    Trade: ["\"Then trade. But undercut a guild stall and you'll answer to the council, not to me.\""] },

  priest: { personality: "doctrinal, anxious about hierarchy",
    greet: { hostile: ["\"You bring noise into a quiet place. The temple notices such things.\""],
             neutral: ["\"Walk softly. The dawn alignment is in three days and the records must be perfect.\""],
             friendly: ["\"The light favors you today. Speak — quietly.\""] },
    Friendly: ["\"If you ever stand accused before the elders, I will say what I saw. That is no small promise.\"", "\"Faith is mostly attendance. You attend. The gods notice that.\""],
    Neutral: ["\"The Crown's blessing is required for every coronation. That is why we are still here, and the corporations are not.\""],
    Trade: ["\"We deal in tablets and rites, not coin. But the lower altar will sell you bread blessed and plain alike.\""] },

  warlord: { personality: "proud, transactional, dangerous",
    greet: { hostile: ["Matron Kol's hand rests near a blade. \"You owe this family respect you have not paid.\""],
             neutral: ["\"Speak plainly and quickly. The Ironwall does not reward hesitation.\""],
             friendly: ["\"You've shown spine. The family can use spine. Sit where I can see your hands.\""] },
    Friendly: ["\"Cross us and you bleed. Serve us and you eat. You seem to grasp the arithmetic.\"", "\"I'll put your name to the crews. Don't make me regret the ink.\""],
    Neutral: ["\"Protection is a service. Everyone in our streets pays for it, one way or another.\""],
    Trade: ["\"Contraband, weapons, the things the law pretends don't move — we move them. What do you want, and what will you risk?\""] },

  councilor: { personality: "weary, principled, sharp",
    greet: { hostile: ["\"We feed our own here. People who take and never give are not our own.\""],
             neutral: ["\"Forty thousand of us and no papers between us. What do you need, stranger?\""],
             friendly: ["\"You've put in work for this block. That makes you ours, papers or no.\""] },
    Friendly: ["\"When the corporation comes for the wall, I'll know which side you stand on. Today you stood right.\"", "\"Trust here is slow and it is real. You're building it.\""],
    Neutral: ["\"The councils manage what the city refuses to. Water, disputes, the dead. Mind how you walk in it.\""],
    Trade: ["\"We share more than we sell. But the bread and water stalls are honest — buy there.\""] },

  fixer: { personality: "amused, mercenary, observant",
    greet: { hostile: ["Vane doesn't take the cig from their mouth. \"You're heat I don't need. Move along.\""],
             neutral: ["\"Looking for work, parts, or a new pair of eyes? I do all three. Badly, but cheap.\""],
             friendly: ["\"My favorite stray. The grid's out at the next rotation — perfect time for the kind of thing you came to ask about.\""] },
    Friendly: ["\"Keep your hardware serviced and your debts current and we'll get along for years.\"", "\"I'll teach you the basics of cutting a corp filter. Don't get caught; it's bad for my reputation.\""],
    Neutral: ["\"Power schedule's public. Everything that matters happens in the gaps between the lights.\""],
    Trade: ["\"Parts, coolant, the occasional thing that fell off a corporate truck. The clinic's open — let's deal.\""] },

  exec: { personality: "polished, cold, threatening under courtesy",
    greet: { hostile: ["Director Aldous smiles without warmth. \"Security has your description. I'd reconsider being here.\""],
             neutral: ["\"You're off your floor. Make this brief and make it worth Meridian's time.\""],
             friendly: ["\"A useful asset returns. Sit. We can be generous to people who are generous to us.\""] },
    Friendly: ["\"There's always a contract for someone who understands incentives. You do.\"", "\"Meridian rewards loyalty. It also notices its absence — permanently.\""],
    Neutral: ["\"We razed the ancient layer here because the past is a liability on a balance sheet. Sentiment is expensive.\""],
    Trade: ["\"Augment-grade product, warrantied and clean — unlike whatever the Labyrinth sold you. At Spire prices, naturally.\""] },

  guide: { personality: "patient, secretive, kind to the worthy",
    greet: { hostile: ["Old Pell's lamp turns away. \"The deep dark doesn't take strangers gently. Nor do I.\""],
             neutral: ["\"Mind your step. Down here a wrong turn isn't a mistake, it's an ending.\""],
             friendly: ["\"There you are. The tunnels have been quiet — quiet the way they are before they aren't.\""] },
    Friendly: ["\"Earn a little more of my trust and I'll put a map in your hands. Few things down here matter more.\"", "\"You listen before you walk. That's why you're still breathing.\""],
    Neutral: ["\"Six thousand years of people who needed to not be seen. That's all the Sub-Strata is. That's everything it is.\""],
    Trade: ["\"Relics, salvage, things older than the temple records admit. I'll deal — to those who don't haggle like fools.\""] },

  medic: { personality: "gentle, exhausted, unflinching",
    greet: { hostile: ["\"I patch anyone, even people I dislike. Hold still and stop talking.\""],
             neutral: ["\"You hurt? Sit. I've got clean hands and not much else.\""],
             friendly: ["\"Good, it's you. Take the better chair. Now — where does it hurt, friend?\""] },
    Friendly: ["\"I'll teach you to close a wound so it doesn't kill you slow. The networks need more hands.\"", "\"You've never let one of ours bleed out. I don't forget that.\""],
    Neutral: ["\"Wounds that aren't treated get infected. Infections that aren't treated bury people. Don't be stubborn.\""],
    Trade: ["\"Kits, clean water, what little medicine the corps haven't priced out of reach. Take what you need at cost.\""] },

  /* --- ambient archetypes --- */
  devotee: { personality: "serene", role: "temple devotee",
    greet: { hostile: ["\"Your noise does not belong near the god-house.\""], neutral: ["\"Peace on your road. The incense has burned here longer than any of us.\""], friendly: ["\"The light fall kindly on you, friend.\""] },
    Friendly: ["\"Walk in grace. The old gods keep their own accounts.\""], Neutral: ["\"The processions move at dawn. Don't cross them.\""], Trade: ["\"I've nothing to sell. Only prayers, and those are free.\""] },
  pilgrim: { personality: "awed", role: "pilgrim",
    greet: { hostile: ["\"Leave me to my prayers.\""], neutral: ["\"I walked forty days to stand in this quarter. They say the omens here are never wrong.\""], friendly: ["\"You feel it too, don't you? The heaviness of the air.\""] },
    Friendly: ["\"Bless you for your kindness to a stranger.\""], Neutral: ["\"They say arguments cannot be finished inside the quarter. I begin to believe it.\""], Trade: ["\"A pilgrim carries nothing worth selling.\""] },
  merchant: { personality: "quick-tongued", role: "market trader",
    greet: { hostile: ["\"No credit for you. Move on.\""], neutral: ["\"Best prices on the terrace, friend — for you, almost honest ones.\""], friendly: ["\"My favorite customer! Come, come, I have just the thing.\""] },
    Friendly: ["\"For a friend? A discount that wounds me. Take it, take it.\""], Neutral: ["\"Eight hundred years my family's held this stall. We know what things are worth.\""], Trade: ["\"Now you speak my language. Step to the stall and let's haggle properly.\""] },
  laborer: { personality: "blunt, tired", role: "day laborer",
    greet: { hostile: ["\"Got no time for trouble. Got a quota.\""], neutral: ["\"Long shift. You need something or just blocking the light?\""], friendly: ["\"Ha — you again. Pull a crate, talk while I work.\""] },
    Friendly: ["\"You're alright. Most folk look straight through us.\""], Neutral: ["\"Work doesn't stop because you're standing there.\""], Trade: ["\"Sell? On my wages? Try the stalls, friend.\""] },
  scribe: { personality: "precise", role: "clerk",
    greet: { hostile: ["\"This is a registered matter. You are not registered.\""], neutral: ["\"Forms, ledgers, filings. The city runs on them. What's your business?\""], friendly: ["\"Ah, a familiar name in my ledger. How can I expedite you?\""] },
    Friendly: ["\"I'll see your paperwork moves to the top of the stack. Quietly.\""], Neutral: ["\"Everything is recorded. Almost everything. The interesting things aren't.\""], Trade: ["\"I deal in information, not goods. And information has a price you may not like.\""] },
  soldier: { personality: "watchful, hard", role: "family enforcer",
    greet: { hostile: ["\"Wrong street, wrong face. Walk.\""], neutral: ["\"This block belongs to the family. Behave on it.\""], friendly: ["\"The Matron speaks well of you. That buys you a nod from me. Don't waste it.\""] },
    Friendly: ["\"Stand with the family and the family stands with you. Simple as that.\""], Neutral: ["\"Eyes up at the second story. That's where the loops are. Old habits, good ones.\""], Trade: ["\"Iron and contraband move through here. You'd want the Matron's say-so first.\""] },
  vagrant: { personality: "sharp, surviving", role: "the displaced",
    greet: { hostile: ["\"Got nothing for you to take, so move on.\""], neutral: ["\"Spare a thought, or a coin, or just don't kick me. Any of the three.\""], friendly: ["\"You — you're decent. Don't see much of that down here.\""] },
    Friendly: ["\"I see everything from down here. Someday that'll be worth something to you.\""], Neutral: ["\"The councils keep us alive. The city pretends we're not here.\""], Trade: ["\"I find things. Salvage, mostly. Might have something you need, for the right price.\""] },
  augmented: { personality: "jittery, proud", role: "augmented citizen",
    greet: { hostile: ["Their optics flick red at you. \"Back off. My calibration's bad today.\""], neutral: ["\"New eyes, secondhand. The color's wrong but I see in the dark now. Worth it, mostly.\""], friendly: ["\"Hey, it's you! My favorite walking battery for a slow night.\""] },
    Friendly: ["\"You ever need to move unseen, find me when the grid drops. I owe you one.\""], Neutral: ["\"The clinics keep us running. Corporate warranty doesn't reach this deep.\""], Trade: ["\"Parts, coolant, a line on a good fixer. I trade in all of it.\""] },
  guard: { personality: "officious", role: "corporate security",
    greet: { hostile: ["\"You're flagged. One more step and I call it in.\""], neutral: ["\"Spire District. Badged personnel only. State your clearance.\""], friendly: ["\"Cleared and noted. Move along, and keep it clean.\""] },
    Friendly: ["\"Stay on the good list and the checkpoints stay easy. That's the whole arrangement.\""], Neutral: ["\"Everything up here is watched. That's the product we're selling, really.\""], Trade: ["\"I don't deal on shift. Try the corporate vendors — warrantied, overpriced, legal.\""] },
  smuggler: { personality: "cagey", role: "tunnel smuggler",
    greet: { hostile: ["\"Didn't see you. You didn't see me. Keep it that way.\""], neutral: ["\"Routes are mine to know and yours to pay for. What're you moving?\""], friendly: ["\"There's my reliable shadow. Got a job, if you've got the nerve.\""] },
    Friendly: ["\"Run with me a few times and I'll trust you with the deep routes. Few ever earn that.\""], Neutral: ["\"Every passage floods, collapses, or ends in someone's territory. Memorize, or pay a guide.\""], Trade: ["\"Contraband, relics, things with no papers. Down here, that's just commerce.\""] },
  nomad: { personality: "proud, plain-spoken", role: "steppe traveler",
    greet: { hostile: ["\"City manners. I have no use for them or for you.\""], neutral: ["\"I am far from the grass. Speak straight; I've no patience for city circling.\""], friendly: ["\"You speak plainly. Good. The confederations value that above gold.\""] },
    Friendly: ["\"Could you ride, fight, and navigate, my people would have use for you. Coin means nothing to us.\""], Neutral: ["\"The law-speakers hold a thousand years of law in memory alone. Your city writes everything and remembers nothing.\""], Trade: ["\"Horses, hides, knowledge of the routes. None of it sold the way cities sell.\""] },

  /* fallback */
  _default: { personality: "ordinary",
    greet: { hostile: ["\"...what do you want?\""], neutral: ["\"Yes? I'm busy.\""], friendly: ["\"Oh — hello again.\""] },
    Friendly: ["\"Kind of you to stop.\""], Neutral: ["\"Mind how you go.\""], Trade: ["\"Nothing to sell, sorry.\""] },
};

/* ---- contextual line picker -------------------------------------------- */
People.pool = function (kind) { return AXIOM.DIALOGUE[kind] || AXIOM.DIALOGUE._default; };
People.tier = function (disp) { return disp > 20 ? "friendly" : disp < -20 ? "hostile" : "neutral"; };
People.pickGreet = function (kind, disp) {
  const p = People.pool(kind), arr = p.greet[People.tier(disp)] || p.greet.neutral;
  return arr[(Math.random() * arr.length) | 0];
};
People.pickResponse = function (kind, mode) {
  const p = People.pool(kind), arr = p[mode] || AXIOM.DIALOGUE._default[mode];
  return arr[(Math.random() * arr.length) | 0];
};
People.personality = function (kind) { return People.pool(kind).personality || "ordinary"; };

/* ==========================================================================
 * Deterministic ambient residents per district. Same seed => same people.
 * Returns metas: {id, name, role, kind, faction, district, ambient, hub, appear}
 * ========================================================================== */
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

People.appearance = function (rnd, faction, kind) {
  const B = AXIOM.BODY;
  // bias build by archetype
  let build = B.builds[(rnd() * B.builds.length) | 0];
  if (kind === "soldier" || kind === "guard") build = rnd() > 0.4 ? "muscular" : "tall";
  if (kind === "vagrant") build = rnd() > 0.5 ? "thin" : "short";
  if (kind === "warlord") build = "muscular";
  const palette = B.cloth[faction] || B.cloth.none;
  return {
    build,
    skin: B.skin[(rnd() * B.skin.length) | 0],
    hair: B.hair[(rnd() * B.hair.length) | 0],
    cloth: palette[(rnd() * palette.length) | 0],
    cloth2: palette[(rnd() * palette.length) | 0],
  };
};

People.ambientFor = function (district) {
  const rnd = mulberry32(hash("amb:" + district));
  const kinds = People.districtKinds[district] || ["laborer"];
  const faction = People.districtFaction[district] || "none";
  const count = 3 + ((rnd() * 3) | 0); // 3..5 residents
  const list = [];
  for (let i = 0; i < count; i++) {
    const kind = kinds[(rnd() * kinds.length) | 0];
    const fac = kind === "nomad" ? "steppe" : kind === "guard" ? "corporate" : faction;
    list.push({
      id: `amb_${district}_${i}`,
      name: People.nameFor(rnd, district),
      role: People.pool(kind).role || "resident",
      kind, faction: fac, district, ambient: true, hub: 0.18,
      appear: People.appearance(rnd, fac, kind),
    });
  }
  return list;
};

/* Appearance for a named principal (stable per id). */
People.namedAppearance = function (def) {
  const rnd = mulberry32(hash("named:" + def.id));
  const ap = People.appearance(rnd, def.faction, def.kind);
  if (def.kind === "exec") ap.build = "tall";
  if (def.kind === "warlord") ap.build = "muscular";
  if (def.kind === "guide" || def.kind === "priest") ap.hair = 0xc8c8c8; // elder
  return ap;
};
