# AXIOM — Design-Bible Coverage

An honest map of the AXIOM Game Design Bible (v1.0, 15 chapters) against what
this playable adaptation actually implements. This is a self-contained,
no-build **browser game** (vanilla JS + Three.js), so the *systems* of the
bible are the target — not its AAA rendering tech.

Legend: ✅ implemented · 🟡 partial / approximated · 🔜 added in this pass ·
⛔ out of reach for a browser game (engine-level).

| # | Chapter | Status | Notes |
| --- | --- | --- | --- |
| 1 | Core Philosophy — the world precedes the player | ✅ | No tutorial, no chosen one; the sim (time/economy/weather/cascades) runs whether you watch or not. |
| 2 | Architecture of Eras — time stacks on itself | ✅/🟡 | Eight era-distinct districts (Mesopotamian → medieval → cyber) with era textures, silhouettes, and the stair-spined ziggurat. Not literal vertical strata inside one wall. |
| 3 | Ur-Axiom — the living city | ✅ | Cascades (drought → grain → slum hardship → unrest), an instanced megacity skyline, crowds. The 2–3M figure is illustrative, not a literal agent count. |
| 4 | The Districts | ✅ | All eight built, walkable, era-themed, with residents, landmarks, and enterable buildings. |
| 5 | The World Regions — twelve territories | 🔜 | **Added this pass:** a travel layer to all twelve regions (over in-game days, with route hazards), each a visitable themed scene. |
| 6 | Friction / the seams — collision points | 🟡/🔜 | Collision lore lives in landmark *examine* panels; **added this pass:** interactive seam **world-events** (the silence-law drone route, the wall that doesn't legally exist) you can encounter and choose in. |
| 7 | Social Systems — thirty protagonists, no chosen one | ✅/🔜 | No chosen one; birth-status gating; reputation + per-NPC memory + social propagation + faction standing. Protagonists expanded toward the bible's count. |
| 8 | Character Discovery | 🟡 | You pick a protagonist and are dropped into their crisis; personality is discovered through play. Not the deep pre-loaded relationship reveals (e.g. meeting your father) the bible describes. |
| 9 | Skill Systems — competence earned, never assigned | ✅ | Repetition-up / decay-down for combat, social, and knowledge-gated technical skills; failure still teaches a little. |
| 10 | Survival & Injury — the body as a real system | ✅ | Independent hunger/fatigue/health, injuries with severity & infection, augmentation degradation & service. |
| 11 | Narrative — no binary morality | ✅/🟡 | Mixed, propagating consequences; the ancient conspiracy assembled from scattered fragments → a recognition ending. Less branching authored story. |
| 12 | Living World — the world runs without you | ✅/🔜 | Compressed clock, six prayer periods, drifting economy, weather-as-force, omens, day/night. **Added this pass:** elections and wars as background cascades. A literal 2,000-NPC sim is approximated by an unbounded generator. |
| 13 | Fantastical — the divine that can't be explained away | ✅ | Omens that come true at better-than-chance rates; the God Quarter "place where nothing happens"; the deep mythology assembled across districts. |
| 14 | Sci-Fi / Cyberpunk layer | ✅ | The three megacorporations as factions (Meridian / UADC / The Board), augmentation with failure modes, degraded-tech flavor and satire. |
| 15 | Technical Foundation | 🟡/🔜/⛔ | Rendering is a Three.js **cinematic** pipeline (normal maps, shadows, SSAO, bloom, env reflections, instancing) + an optional CC0 asset path — **not** UE5/Nanite/Lumen/photogrammetry (⛔ engine-level). **Added this pass:** per-district **audio soundscapes** (Ch.15 "Every District Has a Sound"). |

## Honestly out of reach (and why)
- **UE5 / Nanite / Lumen / photogrammetry / ray tracing** — these are native-engine
  features; a browser game can approach the *look* cinematically but not match it.
- **A literal 2,000-agent live simulation** — we render dozens at once and generate
  unlimited *distinct* people deterministically, which gives the feel at a fraction
  of the cost.
- **The full 30 hand-authored protagonist storylines** — the framework and several
  protagonists exist; thirty fully-authored narratives is a content scope beyond
  one build.

## What this pass adds toward the gaps
Per-district **audio**, the **twelve world regions** as a travel layer, **more
protagonists**, **election/war** cascades, and interactive **seam events** — see the
commits following this file.
