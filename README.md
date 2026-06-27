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
| **Click** | Lock the mouse and look around |
| **W A S D** | Walk through the district |
| **E** | Interact with the station/gate you're standing at |
| **Tab** | Open/close the panels (Skills · Market · Pack · Lore · Record · Menu) |
| **Esc** | Release the cursor |

Walk up to a **gate** to travel to an adjacent district, an **NPC** to talk, the
**Market** stall to trade, **Rest** to sleep, the **Food Vendor** to eat, and so
on. Progress autosaves to `localStorage` after every action.

---

## What's implemented (straight from the bible)

| Chapter | System | How it plays |
| --- | --- | --- |
| 2–4 | **Stacked civilizational layers** | Eight districts of Ur-Axiom, each its own era, economy, control faction, danger level, and *smell* — from the Mesopotamian Ziggurat Crown to the corporate Spire to the six-thousand-year Sub-Strata underworld. |
| 7–8 | **No chosen one** | Six selectable protagonists drawn from every social level. **Birth determines your ceiling** — status gates which districts you can even enter. You discover who you are by playing, starting at a moment of personal crisis. |
| 7 | **Reputation & NPC memory** | Reputation is not a stat. Named NPCs remember every interaction, and strong events *propagate* through their social network — weakening with distance, bent by each receiver's prior disposition toward you. District standing shifts with the weight of who holds the opinion. |
| 9 | **Skills earned, never assigned** | Competence improves through **repetition** and **decays through neglect**. Gated skills (hacking, medicine) must be *taught* by an NPC who trusts you before practice does anything. |
| 10 | **The body as a real system** | Hunger, fatigue, and health are independent. Injuries have severity, can get infected, and take in-game *weeks* to heal. Augmented protagonists carry hardware that degrades and must be serviced. |
| 12 | **A world that runs without you** | A compressed-time clock with six daily prayer periods. A living economy where prices drift, spike, and crash. **Cascades**: a drought drives up grain, which hits the Broken Crown hardest, which stirs unrest — whether you're watching or not. |
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
js/state.js             # game state + localStorage save/load
js/actions.js           # player actions (travel, work, train, trade, talk, explore, survive)
js/world3d.js           # 3D world: procedural era architecture, first-person controls, interaction, HUD
js/ui.js                # title screen + modal helpers
js/main.js              # bootstrap & control flow
js/vendor/three.min.js  # Three.js r128 (MIT), vendored
```

The simulation core is DOM-free and was smoke-tested headlessly across all six
protagonists (random play, sensible play, and the full conspiracy-assembly path);
the 3D front-end was verified interactively in a headless WebGL browser across
multiple districts.

---

## Design fidelity

Every system traces back to a chapter of the bible, and the central rule is kept:
**the world does not scale down to accommodate you.** There is no rescue, no
chosen one, and the markets open on schedule the day after you die.

> *"The narrative goal is not catharsis. It is recognition — the feeling of having
> understood something true about power, time, and what it costs to be a person
> inside history."*
