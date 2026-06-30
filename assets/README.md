# AXIOM — Optional Asset Pack (legal, drop-in)

The game runs **fully procedural** with no files here. This folder is an
**optional upgrade path**: drop in free, openly-licensed assets and the game
loads them automatically (see `js/assets.js`). If a file is missing, the
procedural version is used — so nothing breaks.

> ⚠️ **Do not** use assets ripped from commercial games (Red Dead Redemption,
> Cyberpunk 2077, etc.). Those are copyrighted and illegal to redistribute.
> Everything below is **CC0 / public-domain** — free for any use, including
> commercial, with no attribution required.

After adding files, just reload the page. You'll see `[AXIOM assets] …` notes in
the browser console telling you what loaded.

> **You must serve the game over http to load assets.** Browsers block all
> `file://` asset loading for security, so opening `index.html` directly runs
> the procedural version only. To use this pack, run a local server from the
> project root and open the http URL:
>
> ```
> python3 -m http.server      # then visit http://localhost:8000
> ```

---

## 1. HDRI environment lighting — biggest single upgrade

One `.hdr` file gives the whole world real image-based lighting and reflections.

- **Where to get it (CC0):** Poly Haven → https://polyhaven.com/hdris
  (e.g. a city/street or overcast HDRI; download the `.hdr`, 2K is plenty)
- **Put it here:** `assets/hdri/environment.hdr`

## 2. PBR texture sets — real surfaces

Each set is a folder of maps. Put the four files named exactly as below.

- **Where to get them (CC0):**
  - ambientCG → https://ambientcg.com (Bricks, PavingStones, Concrete, Metal, Planks)
  - Poly Haven → https://polyhaven.com/textures
  - cc0-textures / cc0textures
- **File names per set:** `albedo.jpg`, `normal.jpg`, `roughness.jpg`, `ao.jpg`
  (rename the downloaded maps to these; `albedo` is required, the rest optional)
- **Folders (surface kind → drop the set here):**

  | Kind | Folder | Suggested CC0 source |
  | --- | --- | --- |
  | brick    | `assets/textures/brick/`    | ambientCG "Bricks" |
  | stone    | `assets/textures/stone/`    | ambientCG "PavingStones" / "Rock" |
  | concrete | `assets/textures/concrete/` | ambientCG "Concrete" |
  | panel    | `assets/textures/panel/`    | ambientCG "Metal" / "MetalPlates" |
  | plank    | `assets/textures/plank/`    | ambientCG "Planks" / "WoodFloor" |

## 3. glTF models — vehicles (and more)

Drop `.glb` files to replace the procedural motorcycle/car/hovercar/drone.

- **Where to get them (CC0):**
  - Quaternius → https://quaternius.com (vehicle packs)
  - Poly Haven models → https://polyhaven.com/models
  - Kenney → https://kenney.nl/assets (3D)
  - Sketchfab with the **License = CC0** filter
- **Put them here (exact names):**
  - `assets/models/motorcycle.glb`
  - `assets/models/car.glb`
  - `assets/models/hovercar.glb`
  - `assets/models/drone.glb`
- **Scale/offset:** models come in different sizes. If one looks too big/small
  or floats, tweak `scale` / `y` in `Assets.config.models` in `js/assets.js`.
  (Use `.glb`, not `.gltf+bin`. Draco-compressed models would also need a Draco
  decoder, which isn't wired up — pick uncompressed `.glb`.)

### 3b. Realistic human characters (Quaternius "SOURCE" pack)

The default people are built procedurally so they can **walk, gesture, change
mood, and act out their routines** — that animation is driven by a hand-built
skeleton, so it only works on the procedural body.

You can swap in the free **Quaternius CC0 human base models** (the realistic
rigged figures, ~13k tris, 20 hairstyles) for a sculpted look:

- Get them at **https://quaternius.com** (the "Universal Animated/SOURCE" human
  pack — CC0, free for any use). Export a single figure to **`.glb`**.
- Put it at **`assets/models/character.glb`** and host the game over **HTTP(S)**
  (browsers block `file://` model loads).
- **Caveat — animation:** a loaded `.glb` is a single skinned mesh, so the
  procedural gait/gesture/mood rig can't drive it; with the current hook the
  imported figure renders but stands still. To make a sculpted model *move*,
  it needs the **Universal Animation Library** clips played through a
  `THREE.AnimationMixer` (a planned upgrade). Until then the procedural body is
  the better choice for a *living* crowd.

---

## Notes

- All loaders fail **silently** to the procedural fallback, so partial packs are
  fine (e.g. just an HDRI, or just a couple of texture sets).
- Loading happens once at startup; when assets finish, the current scene
  rebuilds itself to use them.
- This keeps your repository free of third-party art: you add the files locally
  (they're git-ignored by default below), or commit only assets whose CC0
  license you've verified.
