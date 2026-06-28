/* ==========================================================================
 * AXIOM — World Data
 * "Where empires never died & the future never arrived."
 *
 * The world precedes the player. Everything in this file describes a city that
 * would exist whether the player was in it or not: districts stacked in
 * civilizational layers, people with lives of their own, an economy that moves
 * on its own clock. Nothing here is a "level". It is a place.
 * ========================================================================== */

const AXIOM = {};

/* --------------------------------------------------------------------------
 * SOCIAL STATUS
 * Birth determines your ceiling. Status is not bought; it gates access.
 * -------------------------------------------------------------------------- */
AXIOM.STATUS = {
  undocumented: { rank: 0, label: "Undocumented",  blurb: "No papers, no record. The city does not admit you exist." },
  augmented:    { rank: 1, label: "Augmented",     blurb: "Hardware in your body, debt in your future." },
  merchant:     { rank: 2, label: "Merchant",      blurb: "Coin opens some doors and closes others." },
  clergy:       { rank: 3, label: "Clergy",        blurb: "The temple's weight stands behind your name." },
  noble:        { rank: 4, label: "Bloodline",     blurb: "Born to people who hold ground others die for." },
};

/* --------------------------------------------------------------------------
 * DISTRICTS — eight worlds inside one set of walls.
 * minStatus gates entry; entering above your station has consequences.
 * priceMod: multiplier applied to base goods prices (cost of living).
 * -------------------------------------------------------------------------- */
AXIOM.DISTRICTS = {
  ziggurat_crown: {
    name: "The Ziggurat Crown",
    era: "Era I — Mesopotamian Foundation",
    tagline: "The oldest living district on Earth.",
    desc: "Fired-brick streets laid in herringbone four thousand years ago, oriented to catch the dawn on days the priests still count. Cedar resin in the stones. The hierarchy here is religious, not economic — a junior priest outweighs a rich merchant, and everyone knows it.",
    control: "The High Priesthood",
    minStatus: 0,
    priceMod: 1.1,
    danger: 1,
    smell: "cedar resin and incense burned without interruption for forty centuries",
    explore: "crown",
  },
  hanging_market: {
    name: "The Hanging Market",
    era: "Era I–II — Market Heritage",
    tagline: "Where every trade route in the world terminates.",
    desc: "Terraced gardens turned into the most vital commerce in the world. Raw goods below, manufactured goods at mid-level, luxury and information above. A dozen languages at once over stone channels that have drained this hill since before most districts existed.",
    control: "The Guild Council",
    minStatus: 0,
    priceMod: 1.0,
    danger: 2,
    smell: "roasting meat, fermented grain, river mud, and a hundred spices",
    explore: "market",
  },
  god_quarter: {
    name: "The God Quarter",
    era: "Sacred — Era I through present",
    tagline: "Where the divine leaves marks.",
    desc: "No secular government has ever fully held this ground; every attempt failed in ways that ruined the government that tried. The light is heavier here. Arguments end without resolution because both parties instinctively do not want to finish them. The omens are accurate at rates chance does not produce.",
    control: "Every faith that ever held power",
    minStatus: 0,
    priceMod: 1.2,
    danger: 0,
    smell: "old smoke and something colder underneath it",
    explore: "quarter",
  },
  ironwall: {
    name: "The Ironwall Quarter",
    era: "Era III–V — Fortified Medieval Core",
    tagline: "Where old war never ended.",
    desc: "Built when the city fractured into warlord fiefdoms. Windows begin at the second story; the street is an arrow-loop's killing ground. The families evolved into criminal-militia-aristocracy hybrids who run the best black markets in the city and sit, technically, inside the government they regard as a competitor.",
    control: "The Warlord Families",
    minStatus: 0,
    priceMod: 0.95,
    danger: 4,
    smell: "cold stone, oil, and gun-bluing",
    explore: "ironwall",
  },
  broken_crown: {
    name: "The Broken Crown",
    era: "Collision Layer — all eras at once",
    tagline: "Forty thousand unregistered lives.",
    desc: "Not a slum so much as a city within the city, built over the ruins of the old administrative district by people who had nowhere else to go and became geniuses of space and salvage. Information moves fastest here. Trust is earned in time, not points — and it buys what wealth cannot.",
    control: "Neighborhood councils",
    minStatus: 0,
    priceMod: 0.8,
    danger: 3,
    smell: "cook-fires, wet concrete, and forty thousand lives pressed close",
    explore: "crown_broken",
  },
  neon_labyrinth: {
    name: "The Neon Labyrinth",
    era: "Era VI — Cyberpunk Core",
    tagline: "Where the city went wrong at speed.",
    desc: "Built vertically until the lowest of its five levels never sees the sun. The grid runs above capacity; outages are scheduled and everyone plans around them — because in the dark, the augmentation clinics fill and the surveillance net grows gaps. Augmented citizens are the dominant demographic.",
    control: "Contested — clinics, fixers, corp patrols",
    minStatus: 0,
    priceMod: 1.05,
    danger: 3,
    smell: "ozone, coolant, and the sweetness of failing electronics",
    explore: "neon",
  },
  spire: {
    name: "The Spire District",
    era: "Era VI — Corporate Fortress",
    tagline: "Power made visible.",
    desc: "Towers tall enough to put their highest floors above the smog — sunlight is something the corporations paid for. The streets are genuinely clean. Biometric checkpoints at every entrance. The ancient layer was razed completely here; that absence is the most aggressive political gesture any faction has ever made.",
    control: "Meridian Systems · UADC · The Board",
    minStatus: 2,
    priceMod: 1.6,
    danger: 2,
    smell: "filtered air, money, and nothing else",
    explore: "spire",
  },
  sub_strata: {
    name: "The Sub-Strata",
    era: "Underground — all eras, the world beneath",
    tagline: "Six thousand years of underworld.",
    desc: "An entire second city carved downward across millennia: Mesopotamian drainage, Roman cisterns, medieval cellars, smuggling routes, dead boring projects. Bioluminescent fungus and stolen power. Without a guide or a very good map, getting lost down here can mean not being found.",
    control: "Whoever holds the maps",
    minStatus: 0,
    priceMod: 0.9,
    danger: 5,
    smell: "wet stone, fungus, and still air that has not moved in centuries",
    explore: "substrata",
    needsGuide: true,
  },
};

/* District adjacency — travel takes hours and passes through the world. */
AXIOM.ROUTES = {
  ziggurat_crown: ["god_quarter", "hanging_market"],
  hanging_market: ["ziggurat_crown", "god_quarter", "ironwall", "broken_crown", "neon_labyrinth"],
  god_quarter:    ["ziggurat_crown", "hanging_market", "sub_strata"],
  ironwall:       ["hanging_market", "neon_labyrinth", "broken_crown"],
  broken_crown:   ["hanging_market", "ironwall", "sub_strata"],
  neon_labyrinth: ["hanging_market", "ironwall", "spire", "sub_strata"],
  spire:          ["neon_labyrinth"],
  sub_strata:     ["god_quarter", "broken_crown", "neon_labyrinth"],
};

/* --------------------------------------------------------------------------
 * PROTAGONISTS — there is no chosen one. Thirty in the bible; here are six,
 * one from each level of the hierarchy. Birth is not an equalizer.
 * -------------------------------------------------------------------------- */
AXIOM.PROTAGONISTS = [
  {
    id: "acolyte",
    name: "Nin-shubur",
    role: "Temple Acolyte",
    status: "clergy",
    home: "ziggurat_crown",
    born: "Raised inside the Grand Ziggurat; you have never been hungry and never been free.",
    skills: { rhetoric: 35, medicine: 20, navigation: 10 },
    money: 60,
    crisis: "Your superior has accused you of altering a prayer record. You did not. Someone did.",
    tone: "faith",
  },
  {
    id: "merchant",
    name: "Dabir",
    role: "Merchant's Heir",
    status: "merchant",
    home: "hanging_market",
    born: "Eight hundred years of family ledger sit behind your name in the Hanging Market.",
    skills: { rhetoric: 30, deception: 25, navigation: 15 },
    money: 220,
    crisis: "A rival has been undercutting the family stall for three months. Today your father asks you to handle it.",
    tone: "trade",
  },
  {
    id: "scion",
    name: "Vesha Kol",
    role: "Ironwall Scion",
    status: "noble",
    home: "ironwall",
    born: "A warlord family's child — protection fees and old blood. Doors open before you knock.",
    skills: { blade: 40, deception: 20, rhetoric: 15 },
    money: 180,
    crisis: "Your family expects you to collect from a Broken Crown clinic that cannot pay. The clinic kept you alive once.",
    tone: "blood",
  },
  {
    id: "runner",
    name: "Cipher",
    role: "Augmented Runner",
    status: "augmented",
    home: "neon_labyrinth",
    born: "Black-market optics and a debt to the fixer who installed them. You move when the lights go out.",
    skills: { hacking: 35, navigation: 30, blade: 15 },
    money: 40,
    aug: { name: "salvaged optic suite", integrity: 70 },
    crisis: "Your optics flicker false color at the worst times, and the warranty was never yours. Maintenance is due.",
    tone: "wire",
  },
  {
    id: "slumborn",
    name: "Hale",
    role: "Broken Crown Native",
    status: "undocumented",
    home: "broken_crown",
    born: "No papers, no record, and a council that raised you. The city does not admit you exist.",
    skills: { navigation: 35, engineering: 25, deception: 20 },
    money: 18,
    crisis: "The corporation that bought your block has dated the demolition. Eight thousand people live behind that wall.",
    tone: "grit",
  },
  {
    id: "lawspeaker",
    name: "Tem Aravat",
    role: "Steppe Law-Speaker",
    status: "merchant",
    home: "hanging_market",
    born: "Carrying the oral law of an Eastern Steppe confederation into a city that writes everything down.",
    skills: { rhetoric: 40, navigation: 30, medicine: 15 },
    money: 90,
    crisis: "Your confederation sent you to recover a stolen herd-ledger. The trail ends in the Sub-Strata.",
    tone: "steppe",
  },
  {
    id: "highlander",
    name: "Garo Vask",
    role: "Obsidian Highlander",
    status: "undocumented",
    home: "ironwall",
    born: "Born to a quarrying clan that has refused the city's submission for centuries; you came down anyway.",
    skills: { blade: 45, navigation: 25, medicine: 10 },
    money: 35,
    crisis: "A city broker sold your clan's obsidian under a forged charter. You came to take it back or break the deal.",
    tone: "blood",
  },
  {
    id: "fracturehack",
    name: "Cy Rax",
    role: "Fracture-Zone Engineer",
    status: "augmented",
    home: "neon_labyrinth",
    born: "Raised in the Fracture Zone making functional things from broken ones; you understand corporate systems too well.",
    skills: { hacking: 45, engineering: 30, navigation: 15 },
    money: 25,
    aug: { name: "homebuilt neural shunt", integrity: 60 },
    crisis: "A corp you once sabotaged has finally put a name — yours — to the breach. They are looking in the Labyrinth.",
    tone: "wire",
  },
  {
    id: "dyula",
    name: "Keita Diallo",
    role: "Deep-South Dyula Trader",
    status: "merchant",
    home: "hanging_market",
    born: "Of the great merchant networks of the Deep South Kingdoms; your family's routes reach every corner of the map.",
    skills: { rhetoric: 38, deception: 22, navigation: 20 },
    money: 260,
    crisis: "A corporate logistics firm is trying to cut your family out of a route you've held for six generations.",
    tone: "trade",
  },
  {
    id: "holdsnoble",
    name: "Sif Asgersdottir",
    role: "Northern Holds Noble",
    status: "noble",
    home: "ironwall",
    born: "A noble of the Northern Holds, sent south to watch the corporations the way your elders learned to.",
    skills: { blade: 35, rhetoric: 25, navigation: 15 },
    money: 200,
    crisis: "A mining charter your family contests as fraudulent is about to be ratified — here, in the city, this week.",
    tone: "blood",
  },
  {
    id: "deltarunner",
    name: "Ngozi Aba",
    role: "Delta Water-Runner",
    status: "undocumented",
    home: "broken_crown",
    born: "From the water-mobile city-states of the Delta Provinces; you read water and current the way others read streets.",
    skills: { navigation: 40, deception: 20, engineering: 18 },
    money: 22,
    crisis: "You carried a message into the city that someone powerful would kill to keep unread. Now you can't leave.",
    tone: "grit",
  },
];

/* --------------------------------------------------------------------------
 * SKILLS — competence earned, never assigned. Improves through repetition,
 * decays through neglect. Knowledge-gated skills must be taught first.
 * -------------------------------------------------------------------------- */
AXIOM.SKILLS = {
  blade:       { name: "Blade",       desc: "Footwork, timing, the physics of edged combat. Decays fast without practice." },
  rhetoric:    { name: "Rhetoric",    desc: "Persuasion, negotiation, reading a breaking point." },
  deception:   { name: "Deception",  desc: "Lying with fluency. Harder against people who know you." },
  hacking:     { name: "Hacking",     desc: "Corporate systems. Requires knowledge before practice helps.", gated: true },
  engineering: { name: "Engineering", desc: "Making functional things out of broken ones." },
  medicine:    { name: "Medicine",    desc: "Wounds, infection, the informal medical networks.", gated: true },
  navigation:  { name: "Navigation",  desc: "Reading streets, forests, tunnels, and the deep Sub-Strata." },
};

/* --------------------------------------------------------------------------
 * GOODS — the economy is a simulation, not a shop. Prices drift, spike, and
 * crash on weather and events; what you do moves them.
 * -------------------------------------------------------------------------- */
AXIOM.GOODS = {
  grain:    { name: "Grain",        base: 4,   tag: "food",    staple: true },
  fish:     { name: "River Fish",   base: 6,   tag: "food" },
  bread:    { name: "Bread",        base: 5,   tag: "food",    staple: true },
  water:    { name: "Clean Water",  base: 3,   tag: "food" },
  cloth:    { name: "Cloth",        base: 12,  tag: "goods" },
  parts:    { name: "Salvage Parts",base: 18,  tag: "tech" },
  stim:     { name: "Medical Kit",  base: 40,  tag: "tech" },
  augkit:   { name: "Aug Coolant",  base: 55,  tag: "tech" },
  relic:    { name: "Clay Tablet",  base: 90,  tag: "relic" },
  contraband:{name: "Contraband",   base: 70,  tag: "illicit" },
};

/* Which goods each district trades, and whether buying/selling is favorable. */
AXIOM.MARKETS = {
  ziggurat_crown: ["grain", "bread", "relic"],
  hanging_market: ["grain", "fish", "bread", "water", "cloth", "parts", "relic"],
  god_quarter:    ["relic", "water"],
  ironwall:       ["parts", "contraband", "stim"],
  broken_crown:   ["bread", "water", "parts", "stim"],
  neon_labyrinth: ["parts", "stim", "augkit", "contraband"],
  spire:          ["stim", "augkit", "cloth"],
  sub_strata:     ["contraband", "relic", "parts"],
};

/* --------------------------------------------------------------------------
 * WEATHER — environment as political force. Each state ripples into prices,
 * surveillance, and travel.
 * -------------------------------------------------------------------------- */
AXIOM.WEATHER = {
  clear:     { name: "Clear",      desc: "The haze sits low but the routes are open.",                travel: 1.0, surveil: 1.0 },
  sandstorm: { name: "Sandstorm",  desc: "A wall of grit off the Eastern Steppe. Routes close; drones are grounded.", travel: 2.0, surveil: 0.4, priceUp: ["grain","fish","bread","water"] },
  rain:      { name: "Acid Rain",  desc: "It comes off the Haze Coast and stains the awnings.",       travel: 1.3, surveil: 0.8 },
  heat:      { name: "Heat",       desc: "The kind of heat that makes water a weapon.",               travel: 1.1, surveil: 1.0, priceUp: ["water"] },
};

/* --------------------------------------------------------------------------
 * OMENS — read in the God Quarter. Not labeled "omen"; they simply precede
 * events at rates chance does not produce. Dismiss them and be wrong expensively.
 * -------------------------------------------------------------------------- */
AXIOM.OMENS = {
  drought:   "The river-priests have stopped the dawn libation. The water remembers a dry year coming.",
  unrest:    "Inanna's doves left the Crown at once this morning. The street will turn before the moon does.",
  raid:      "A blade was found rust-locked in its sheath in the temple armory. Old iron warns of new blood.",
  windfall:  "The grain-omen fell favorable three mornings running. What is scarce will soon be cheap.",
  power:     "The lamps in the lower temple guttered though there was no wind. The grid will fail in the Labyrinth.",
};

/* --------------------------------------------------------------------------
 * CONSPIRACY — the ancient civilization beneath the modern world. Not
 * delivered in cutscenes; assembled by the player from fragments scattered
 * across the world, some of which require a knowledge chain to even read.
 * -------------------------------------------------------------------------- */
AXIOM.FRAGMENTS = [
  { id: "f1", where: "sub_strata",     name: "A sealed cistern inscription", needs: null,
    text: "Below the Roman water, older water. The inscription names a city that the temple records say never existed: ERIDU-THAT-WAS, drowned on purpose." },
  { id: "f2", where: "god_quarter",    name: "A temple marginal note", needs: "f1",
    text: "A scribe's hand in the prayer-record margin: 'The gods we name are not the ones who built the deep walls. We inherited their quarter. We did not earn it.'" },
  { id: "f3", where: "ziggurat_crown", name: "An off-alignment doorway", needs: "f2",
    text: "One doorway in the Crown is oriented to no star anyone tracks now — it points at a horizon position the sky held four thousand years before the Crown was built. Someone aligned it to a memory." },
  { id: "f4", where: "broken_crown",   name: "An elder's account", needs: null,
    text: "An old woman of the council: 'The ruins we live in were an administration. But the administration was built over something it was administering. We are the fourth city to forget.'" },
  { id: "f5", where: "sub_strata",     name: "The deep-dark chamber", needs: "f3",
    text: "In a passage with no light, a chamber where violence has never happened. On the wall, the same off-star alignment as the Crown doorway. The builders below and the gods above are not the same — and the gods know it." },
];

/* Closing recognition when all fragments are assembled. */
AXIOM.REVELATION =
  "You set the fragments beside each other and the shape arrives — not as catharsis, " +
  "but as recognition. The Mesopotamian gods the Crown still serves are tenants. " +
  "Eridu-That-Was was drowned by its own builders to bury something, and every city " +
  "since — Sumer, the empire, the corporations razing the Spire's foundations — has " +
  "built over the grave without knowing it was a grave. The future never arrived " +
  "because the past was never finished with this place. You understand something true " +
  "now about power, time, and what it costs to be a person inside history. No one will " +
  "believe you. That was always the point.";

/* --------------------------------------------------------------------------
 * CRIME JOBS — the underworld career. Jobs unlock with your underworld rank;
 * each escalates the risk, the pay, the heat, and the standing it buys you with
 * the criminal factions. This is a path a protagonist can rise through.
 * skill: which competence the job tests. faction: who you earn standing with.
 * -------------------------------------------------------------------------- */
AXIOM.CRIME_JOBS = [
  { id: "lift",      name: "Work a pickpocket route", minRank: 0, skill: "deception",  diff: 40, payMin: 12, payMax: 30,  heat: 4,  faction: "street",
    desc: "Run the crowds at the Hanging Market and the lower terraces. Low pay, low heat — the first rung." },
  { id: "boost",     name: "Boost a parked hauler",   minRank: 1, skill: "navigation", diff: 48, payMin: 25, payMax: 60,  heat: 8,  faction: "ironwall",
    desc: "Lift goods off a corporate hauler before the route resumes. Quick, if your nerve holds." },
  { id: "burgle",    name: "Burgle an empty office",  minRank: 1, skill: "deception",  diff: 52, payMin: 40, payMax: 90,  heat: 12, faction: "ironwall",
    desc: "A Spire clerk's flat, emptied during a curfew window. In and out before the patrol cycles." },
  { id: "crack",     name: "Crack a corp data-vault", minRank: 2, skill: "hacking",    diff: 58, payMin: 70, payMax: 150, heat: 16, faction: "street",
    desc: "Pull a saleable dataset out of a Meridian node while the grid's down. Pure skill, pure risk." },
  { id: "run",       name: "Run a smuggling route",   minRank: 2, skill: "navigation", diff: 56, payMin: 60, payMax: 130, heat: 14, faction: "substrata",
    desc: "Carry a sealed load through the Sub-Strata past three factions' eyes. The map is everything." },
  { id: "racket",    name: "Run a protection racket", minRank: 3, skill: "rhetoric",   diff: 60, payMin: 90, payMax: 180, heat: 18, faction: "ironwall",
    desc: "Lean on a row of market stalls for the family's cut. Some pay; some need persuading." },
  { id: "heist",     name: "Crew a warehouse heist",  minRank: 3, skill: "blade",      diff: 64, payMin: 140, payMax: 280, heat: 24, faction: "ironwall",
    desc: "A guild bonded-goods warehouse, a six-minute window, a crew counting on you. It can go very wrong." },
  { id: "vault",     name: "The Spire vault job",     minRank: 4, skill: "hacking",    diff: 70, payMin: 300, payMax: 600, heat: 34, faction: "street",
    desc: "The job every earner dreams of and most die on: a corporate vault, above the smog. Boss work." },
];

/* --------------------------------------------------------------------------
 * REGION ECONOMICS — each region produces some goods cheaply and wants others
 * dearly. Buy where it's made, sell where it's needed: the Dyula's whole trade.
 * produces -> ~0.6x price · wants -> ~1.7x price (see Engine.regionPrice).
 * barter: the Steppe values goods over coin — your coin buys little there.
 * -------------------------------------------------------------------------- */
AXIOM.REGION_ECON = {
  ur_basin:   { produces: ["grain", "fish", "water", "bread"], wants: ["cloth", "parts", "stim"] },
  haze_coast: { produces: ["parts", "stim", "augkit"],          wants: ["grain", "fish", "water"] },
  obsidian:   { produces: ["relic", "parts"],                   wants: ["grain", "bread", "cloth"] },
  delta:      { produces: ["fish", "water", "cloth"],           wants: ["parts", "stim", "grain"] },
  steppe:     { produces: ["grain", "cloth"],                   wants: ["parts", "stim", "augkit"], barter: true },
  fracture:   { produces: ["parts", "contraband"],              wants: ["stim", "water", "grain"] },
  holds:      { produces: ["cloth", "relic", "grain"],          wants: ["parts", "stim", "augkit"] },
  deep_south: { produces: ["relic", "cloth", "grain"],          wants: ["parts", "augkit", "contraband"] },
};

if (typeof module !== "undefined") module.exports = AXIOM;
