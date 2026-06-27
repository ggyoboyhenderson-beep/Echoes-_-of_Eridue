/* ==========================================================================
 * AXIOM — Game State
 * The save is the player's specific history. No other player has it.
 * ========================================================================== */

const State = {
  data: null,        // the live game state object
  SAVE_KEY: "axiom.save.v1",
};

/* Build a fresh game state from a chosen protagonist. */
State.newGame = function (protoId) {
  const p = AXIOM.PROTAGONISTS.find((x) => x.id === protoId);
  const skills = {};
  for (const k of Object.keys(AXIOM.SKILLS)) {
    const lvl = p.skills[k] || 0;
    // lastDay: how recently practiced. Start "fresh" so nothing decays day one.
    skills[k] = { level: lvl, lastDay: 0, known: !AXIOM.SKILLS[k].gated || lvl > 0 };
  }

  const g = {
    proto: p.id,
    name: p.name,
    role: p.role,
    status: p.status,
    tone: p.tone,

    // World clock — compressed real time. 6 prayer periods per day.
    day: 1,
    hour: 7,          // 0..23

    // Location
    here: p.home,

    // Body as a system (0..100). Not a single health bar.
    hunger: 25,       // higher = hungrier
    fatigue: 20,      // higher = more tired
    health: 100,
    injuries: [],     // [{part, severity, day}]
    aug: p.aug ? Object.assign({}, p.aug) : null,

    money: p.money,
    skills,

    // Reputation per district (-100..100) and per-NPC memory.
    rep: {},
    factionRep: {},   // faction -> standing (-100..100)
    npc: {},          // id -> {disp, mem:[...], }
    met: {},          // id -> true once you have spoken with this specific person

    inventory: {},    // goodId -> qty
    fragments: [],    // discovered conspiracy fragment ids
    flags: {},        // misc story flags

    // Living-world simulation
    weather: "clear",
    weatherEnds: 1,
    economy: {},      // goodId -> drift multiplier
    cascades: [],     // active world events {id, label, day, ttl}
    pendingOmen: null,// {event, day} foretold, awaiting fulfilment
    powerOut: false,  // Neon Labyrinth grid state

    log: [],          // narrative log lines
    crisis: p.crisis,
    over: false,
  };

  for (const d of Object.keys(AXIOM.DISTRICTS)) g.rep[d] = 0;
  for (const id of Object.keys(AXIOM.GOODS)) g.economy[id] = 1.0;

  // Seed the NPC world (people who exist independent of the player).
  Engine.seedNPCs(g);

  State.data = g;
  Engine.push(g, `You wake in ${AXIOM.DISTRICTS[g.here].name}. ${p.crisis}`, "crisis");
  Engine.push(g, "Nobody explains anything to you. The world was already moving before you opened your eyes.");
  return g;
};

State.save = function () {
  try {
    localStorage.setItem(State.SAVE_KEY, JSON.stringify(State.data));
    return true;
  } catch (e) { return false; }
};

State.load = function () {
  try {
    const raw = localStorage.getItem(State.SAVE_KEY);
    if (!raw) return null;
    State.data = JSON.parse(raw);
    return State.data;
  } catch (e) { return null; }
};

State.hasSave = function () {
  try { return !!localStorage.getItem(State.SAVE_KEY); } catch (e) { return false; }
};

State.wipe = function () {
  try { localStorage.removeItem(State.SAVE_KEY); } catch (e) {}
  State.data = null;
};
