# AXIOM

### *Where empires never died & the future never arrived.*

A playable adaptation of the **AXIOM Game Design Bible v1.0** — an ultra-realistic
RPG set in a city where ancient civilizations never collapsed and technology
arrived before society was ready for it.

The full design bible imagines a AAA open-world title (Unreal Engine 5,
photogrammetry, 2,000 simulated NPCs). This repository is a **faithful, fully
playable implementation of AXIOM's *systems*** in a **first-person 3D world** you
walk through — built with Three.js and running the simulation the bible
describes: the world precedes you, does not care about you, and was already
moving before you opened your eyes.

Each district is a walkable 3D environment built procedurally in its own
civilizational era — the stepped sandstone of the Ziggurat Crown, the neon-lit
towers of the Labyrinth, the low bioluminescent dark of the Sub-Strata — with
interaction stations and gates you physically approach.

> *"You don't enter AXIOM's world. You are inserted into something that was
> already moving, already bleeding, already ancient."*

---

## Play it

No build step, no install, no CDN at runtime (Three.js is vendored locally).
Just open the file:

```
open index.html       # macOS
xdg-open index.html   # Linux
# or serve it:  python3 -m http.server   # then visit http://localhost:8000
```

Works in any modern WebGL browser. Pick a protagonist, then:

| Input | Action |
| --- | --- |
| **Drag** (mouse or touch) | Look around — click-and-drag the view, no cursor capture |
| **← ↑ ↓ →** | Look around with the keyboard (no mouse needed) |
| **W A S D** | Walk through the district |
| **E** | Interact with the station/gate you're standing at |
| **Tab** | Open/close the panels (Skills · Market · Pack · Lore · Story · Record · Menu) |
| **M** / **P** | Toggle sound / cinematic rendering |

The view is **never pointer-locked**, so AXIOM runs unmodified inside an `<iframe>`
embed or on a touch screen — drag to look, just like a map. That makes it
publishable on any static host (GitHub Pages, itch.io, Netlify): upload the
folder, no build and no server required.

Walk up to a **gate** to travel to an adjacent district, an **NPC** to talk, the
**Market** stall to trade, **Rest** to sleep, the **Food Vendor** to eat, and so
on. Key **landmark buildings** are interactive too — approach the Grand Ziggurat
to pray, a warlord keep, the corporate monument, a black-market clinic, or the
deep-dark chamber to examine them for lore or trigger an action. Progress
autosaves to `localStorage` after every action.

---

## What's implemented (straight from the bible)

| Chapter | System | How it plays |
| --- | --- | --- |
| 2–4 | **Stacked civilizational layers** | Eight districts of Ur-Axiom, each its own era, economy, control faction, danger level, and *smell* — from the Mesopotamian Ziggurat Crown to the corporate Spire to the six-thousand-year Sub-Strata underworld. |
| 7–8 | **No chosen one** | Six selectable protagonists drawn from every social level. **Birth determines your ceiling** — status gates which districts you can even enter. You discover who you are by playing, starting at a moment of personal crisis. |
| 7 | **Reputation & NPC memory** | Reputation is not a stat. Named NPCs remember every interaction, and strong events *propagate* through their social network — weakening with distance, bent by each receiver's prior disposition toward you. District standing shifts with the weight of who holds the opinion. |
| 7 | **Living people** | Everyone has a distinct articulated 3D body (rounded torso/limbs, jointed knees & elbows, a sculpted face) that walks with a natural gait, turns its head to look at you on approach, and holds contextual conversations — **Friendly / Neutral / Trade** — that permanently shift your standing with that specific person *and* their faction. People also **strike up conversations with each other** — pairing off, walking together, gesturing and nodding — and break it off the moment you walk up. A medic offers help; an executive threatens security; a warlord demands respect. |
| 7 | **Everyone has a life** | No one just stands around — behaviour **emerges from simulated needs**, not a script. Each NPC owns a **specific home** and a **specific livelihood** (a door they return to, a workplace or stall or shrine), and carries **drifting needs** — hunger, fatigue, loneliness, faith, and a coin purse. A **utility AI** weighs those needs against the hour and their personality to choose what to do next: the hungry seek **food** (and pay for it), the tired go **home to rest** (more so at night), the broke and the greedy go to **work** (and earn), the devout **pray** when their faith runs low, the lonely seek out a **chat**. So the same person walks to the same bench each morning, eats at midday, drinks away their wage, and trudges home at dusk. Guards **patrol**, drunks **loiter**, beggars and buskers hold their **corner**. Every activity has its own animation, and the dialogue box reads out who they are right now — *"lives at the Mudbrick Home · works at the Market Shop · hungry, weary, flat broke · heading home."* |
| 7 | **NPCs with feelings** | Every person carries a **mood** — happy, content, proud, weary, sad, anxious, suspicious, angry, afraid — set by their personality, the district's danger, the hour, and *how they feel about you*. It shows on the **face** (angled brows, a smile or a frown, widened eyes, blinking) and the **body** (a proud chin, a weary stoop, a fearful flinch), with floating **emote bubbles** (♪ ? ! z) popping over their heads. Walk up while wanted and the lawful tense or bristle; someone who trusts you brightens. The dialogue box names what they're feeling and opens with a stage-direction — *\*narrows their eyes at you\**, *\*brightens as you approach\**. |
| 7/2 | **Street life on the corners** | Every urban district fills its lane corners with the people a real city has — **beggars** kneeling with a cupped hand, **night-trade solicitors** leaning and beckoning, **buskers** playing, **street preachers** declaiming the omens, **hawkers** waving down passers-by, **drunks** swaying, **cutpurses** lurking, strung-out **addicts** in the neon — each a fully seeded individual with their own face, drab-or-vivid wardrobe, personality, and archetype dialogue you can stop and talk to (or rob). Up to ~18 per district on top of the residents and named NPCs. |
| 7/8 | **Per-person identity, world-scale** | Each individual is generated from their own seed — unique **face** (eye colour, brows, facial hair, hairstyle), **clothing** (faction headwear, scarves, cloaks, region-accented dress), a **region of origin** among the twelve world regions (all peoples converge on the City), and a **personality** (warmth/pride/greed/nerve/curiosity) that colours their dialogue and how they react to you. Seeded generation means the population is effectively unbounded — unlimited distinct residents, a few dozen rendered at a time. |
| 3/4 | **Every building is enterable** | Walk up to *any* building — an ancient mudbrick home, a medieval fortified house, a market shop, a cyber apartment or corporate office — and step inside a **procedurally generated, furnished interior** themed to its era and function (beds, tables, shelves, hearths, consoles, rugs, plants), with contextual actions (rest, search the room, work the desk, browse the wares). Hand-authored landmark interiors (Grand Ziggurat, Market Hall, clinic, corporate tower, keep, council house) sit on top as multi-floor set-pieces with the residents who belong there. |
| 9 | **Skills earned, never assigned** | Competence improves through **repetition** and **decays through neglect**. Gated skills (hacking, medicine) must be *taught* by an NPC who trusts you before practice does anything. |
| 7/11 | **Reactive storylines** | The game tracks **how you play** (violence / deception / charity / piety / crime / commerce / wandering / loyalty). Story beats fire off your profile, your underworld rank, and your standings — some belong to your protagonist's specific arc, escalating to a **climax that resolves on the choices you made**; others answer the world you've shaped (a blockade draws corporate retaliation; a guild seat means you set the bread price during a drought riot). Every beat is a **choice with no clean option**. A **Story tab** shows who you've become and every decision behind it. |
| 6/7 | **Crime as a career** | Theft, fencing, smuggling, and an **underworld rank ladder** (Petty Thief → Earner → Operator → Lieutenant → Underworld Boss) gating an escalating job board — a criminal path a protagonist can rise through, with heat, bounties, and a made-member arc. |
| 10 | **The body as a real system** | Hunger, fatigue, and health are independent. Injuries have severity, can get infected, and take in-game *weeks* to heal. Augmented protagonists carry hardware that degrades and must be serviced. |
| 11/12 | **A living balance of power** | Eight factions, each rooted in a **different era** — Bronze-Age priesthood, Classical merchant guild, Medieval warlords, modern mutual-aid councils, a Cyberpunk syndicate, the Late-Capital megacorporations, the six-millennia underground, the nomad confederations — contend for the districts. Each has an **ideology, ambition, rivals, and allies**, and a **power score** that shifts daily. The simulation holds **elections** (a council seat turns), **coups** (strength takes a district by force), **pacts** (rising powers ally), **edicts** (your district's ruler levies a tax, calls a curfew, declares a festival), and **wars** (rivals at the breaking point — routes tighten). What you do for a faction nudges its power. A **Politics tab** shows who rules where, the power bars, the web of alliances and rivalries, and every upheaval — and the big ones play as a **cutscene**. |
| — | **Cutscenes** | Letterboxed cinematic camera sweeps mark the big moments — a sweeping **establishing shot** the first time you set foot in each district (with its name and the power that holds it), and orbiting **news cutscenes** when the balance of power breaks. Click or **Esc** to skip. |
| 12 | **A world that runs without you** | A compressed-time clock with six daily prayer periods. A living economy where prices drift, spike, and crash. **Cascades** run in the background — drought, unrest, raids, grid failures, **council elections** (a faction takes the upper hand and prices shift) and **border wars** (routes tighten, contraband climbs) — whether you're watching or not. |
| 5 | **Travel the twelve world regions** | The **Caravanserai** in the Hanging Market opens the world beyond Ur-Axiom. Travel is real — measured in **in-game days**, paid in food, fatigue, and road hazards — to eight visitable territories: the Ur Basin, Haze Coast, Obsidian Highlands, Delta Provinces, Eastern Steppe, Fracture Zone, Northern Holds, and Deep South Kingdoms, each a distinct themed scene with its own people, lore, and goods to scout. |
| 15 | **Every district has a sound** | Soundscapes are **synthesized live** (Web Audio, no files): the slow resonant air of ancient stone, the electrical buzz of the failing grid, the deep rumble of the Sub-Strata, wind on the open steppe. Toggle with **M**. |
| 2/14 | **A planned city, not a scatter** | Each district is laid out on its road grid: the **signature landmark** at the centre, a **plaza ring of service stations** around it, then **city blocks** filled with era buildings aligned to the streets (mudbrick homes, fortified keeps, neon towers, glass offices), with the surround city beyond. Buildings are **solid** — you can't walk through them; the streets actually contain you. |
| 2/14 | **A living megacity** | Every district sits inside a vast city that recedes to the horizon — a GPU-instanced surround of window-lit homes (pitched roofs), offices, and towers fading into the haze — laid over a **painted street grid**: asphalt lanes with edge lines, dashed centres, and **direction chevrons** that always agree with which way the **hundreds of cars** are driving (≈200 per cyber district, one draw call), plus a perimeter ring road under the detailed hero motorcycles/cars/hovercars/drones with spinning wheels, headlights, and banking turns. Skylines vary — setback, tapered, cylindrical, L-shaped, and antenna silhouettes with rooftop tanks and vents. |
| 12 | **Weather as political force** | A sandstorm closes trade routes *and* grounds corporate surveillance drones, opening a window for movement in the dark. The Neon Labyrinth's scheduled power outages do the same. |
| 13 | **Omens that cannot be explained away** | Read in the God Quarter, they foretell events at rates chance does not produce. Dismiss them as superstition and be wrong expensively. |
| 11/13 | **An assembled conspiracy** | The ancient civilization beneath the modern world is never delivered in cutscenes. You assemble it from fragments scattered across districts — some readable only after you've found the one before it. The ending is recognition, not catharsis. |

---

## How it's built

Vanilla JavaScript, no framework, no bundler — plain `<script>` tags. The only
dependency is Three.js, vendored locally as a UMD build so the game runs straight
from `file://` with no server and no network.

```
index.html              # shell, title screen, 3D canvas + HUD overlay
css/styles.css          # era-layered aesthetic (warm ancient stone vs. cold neon)
js/data.js              # the world: districts, protagonists, NPCs, goods, weather, omens, fragments
js/engine.js            # simulation: clock, body, skills, reputation propagation, economy, cascades
js/people.js            # factions, contextual dialogue pools, appearance, ambient resident generation
js/art.js               # graphic art: procedural era textures + SVG crests, faction sigils, logo glyph
js/state.js             # game state + localStorage save/load
js/actions.js           # player actions (travel, work, train, trade, talk, converse, explore, survive)
js/world3d.js           # 3D world: textured era architecture, humanoid NPCs, first-person controls, dialogue, HUD
js/ui.js                # title screen + modal helpers
js/main.js              # bootstrap & control flow
js/vendor/three.min.js  # Three.js r128 (MIT), vendored
```

The simulation core is DOM-free and was smoke-tested headlessly across all six
protagonists (random play, sensible play, and the full conspiracy-assembly path);
the 3D front-end was verified interactively in a headless WebGL browser across
multiple districts.

---

## Graphic art

All art is original and generated from code — no external or copyrighted assets:

- **Procedural era textures** painted to canvas and applied to the 3D ground,
  walls, **buildings, and clothing** — nothing is a flat block: fired-brick
  running bond (ancient), irregular ashlar stone (sacred), cracked concrete
  (medieval fortress), salvage planks (slums), seamed metal panels and a glowing
  neon grid (cyberpunk), veined marble (corporate), and bioluminescent rock
  (underground). A grayscale detail map is tinted per object, so one texture
  surfaces structures of any colour, with tiling scaled to each object's size.
- **Authored SVG heraldry**: a distinct crest for each of the eight districts, a
  sigil for each faction (shown in dialogue), and a title logo glyph of a stepped
  ziggurat rising into a neon spire.
- **Lighting & realism**: normal-mapped surfaces, PCF soft shadows, a gradient
  sky with sun/moon and stars, image-based reflections from a procedural cube
  environment map (metal, marble, glass), and a cinematic vignette + film-grain
  grade.
- **Post-processing pipeline** (the same *technique families* AAA engines use,
  in-browser via Three.js EffectComposer): **SSAO** ambient occlusion, **bloom**
  on genuine highlights, **FXAA** anti-aliasing, and ACES filmic tone mapping.
  Toggle it with **P**. It is a stylized, art-directed *cinematic* look — not
  literal photorealism, which would need photogrammetry assets and a native
  renderer a self-contained no-asset browser game can't ship — but the scene is
  now occluded, bloomed, anti-aliased, and tone-mapped rather than flat-lit.

## Design fidelity

Every system traces back to a chapter of the bible, and the central rule is kept:
**the world does not scale down to accommodate you.** There is no rescue, no
chosen one, and the markets open on schedule the day after you die.

> *"The narrative goal is not catharsis. It is recognition — the feeling of having
> understood something true about power, time, and what it costs to be a person
> inside history."*
