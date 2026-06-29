# AXIOM — Design-Bible Coverage

An honest map of the AXIOM Game Design Bible (v1.0, 15 chapters) against what
this playable adaptation actually implements. This is a self-contained,
no-build **browser game** (vanilla JS + Three.js), so the *systems* of the
bible are the target — not its AAA rendering tech.

Legend: ✅ implemented · 🟡 partial / approximated · ⛔ out of reach for a
browser game (engine-level).

| # | Chapter | Status | Notes |
| --- | --- | --- | --- |
| 1 | Core Philosophy — the world precedes the player | ✅ | No tutorial, no chosen one; the sim (time / economy / weather / cascades / **politics**) runs whether you watch or not. Markets open the day after you die. |
| 2 | Architecture of Eras — time stacks on itself | ✅/🟡 | Eight era-distinct districts (Mesopotamian → medieval → cyber → corporate) with era textures, silhouettes, the stair-spined ziggurat, and now **metropolis-scale** skylines. Approximated as adjacent era-districts, **not** literal vertical strata inside one wall. |
| 3 | Ur-Axiom — the living city | ✅ | Cascades (drought → grain → hardship → unrest), a vast instanced surround skyline, dense traffic, crowds with daily routines. The 2–3M figure is illustrative, not a literal agent count. |
| 4 | The Districts | ✅ | All eight built, walkable, era-themed, on a real road grid with a plaza core, **monumental enterable buildings**, residents, and landmarks. |
| 5 | The World Regions — twelve territories | ✅ | A travel layer to all twelve regions (paid in in-game days + route hazards), each a visitable themed scene with its own people, lore, and goods. |
| 6 | Friction / the seams — collision points | 🟡 | Collision lore in landmark *examine* panels + interactive seam world-events (the silence-law drone route, the wall that doesn't legally exist). Now reinforced by the **political simulation** (control of a district shifts the rules at its seams). |
| 7 | Social Systems — no chosen one | ✅ | Birth-status gating; reputation + per-NPC memory + social propagation + faction standing. **Each NPC now carries a mood/emotion** (face + body + dialogue) **and a daily purpose** — they own a home and livelihood and act on drifting needs (hunger, fatigue, loneliness, faith, coin). |
| 8 | Character Discovery | 🟡 | You pick a protagonist, are dropped into their crisis, and discover who you are through play. **Reactive per-protagonist storylines** branch on how you play (violence / charity / piety / crime…) toward a climax. Not the deep pre-loaded relationship reveals (meeting your father) the bible describes. |
| 9 | Skill Systems — competence earned, never assigned | ✅ | Repetition-up / decay-down for combat, social, and knowledge-gated technical skills; failure still teaches. |
| 10 | Survival & Injury — the body as a real system | ✅ | Independent hunger / fatigue / health; injuries with severity & infection; augmentation degradation & service. |
| 11 | Narrative — no binary morality | ✅/🟡 | Mixed, propagating consequences; the ancient conspiracy assembled from scattered fragments → a recognition ending; a **crime career path** (theft → fence → smuggle → underworld rank). Less *hand-authored* branching than the bible's 30 full storylines. |
| 12 | Living World — the world runs without you | ✅ | Compressed clock, six prayer periods, drifting economy, weather-as-force, omens, day/night, **and a full era-spanning political simulation** (eight factions, power scores, control of districts, elections / coups / pacts / edicts / wars). A literal 2,000-NPC sim is approximated by an unbounded deterministic generator. |
| 13 | Fantastical — the divine that can't be explained away | ✅ | Omens that come true at better-than-chance rates; the God Quarter; the deep mythology assembled across districts. |
| 14 | Sci-Fi / Cyberpunk layer | ✅ | The three megacorporations as factions (Meridian / UADC / The Board), augmentation with failure modes, degraded-tech flavor and satire, neon megascraper skyline. |
| 15 | Technical Foundation | 🟡/⛔ | Three.js **cinematic** pipeline (normal maps, PCF shadows, SSAO, bloom, env reflections, GPU instancing, ACES) + per-district **audio** + **cutscenes** + an optional CC0 asset path — **not** UE5 / Nanite / Lumen / photogrammetry (⛔ engine-level). |

## Honestly out of reach (and why)
- **UE5 / Nanite / Lumen / photogrammetry / ray tracing** — native-engine features.
  A browser game can approach the *look* cinematically but cannot match it.
- **A literal 2,000-agent live simulation** — we render dozens at once and generate
  unlimited *distinct* people deterministically, which gives the feel at a fraction
  of the cost.
- **The full 30 hand-authored protagonist storylines** — the framework, eleven
  protagonists, and reactive branching exist; thirty fully-authored narratives is a
  content scope beyond one build.
- **Literal vertical era-strata inside a single structure** — rendered as adjacent
  era-districts instead.

## Where it goes *beyond* the original brief
Cursor-free controls (drag / arrow-keys / tap), building collision, a road grid
with directional traffic, NPC **emotions** and **needs-driven daily routines**,
a deep **political simulation** with cutscenes, and a metropolis-scale map.
