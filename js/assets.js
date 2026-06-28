/* ==========================================================================
 * AXIOM — Asset Pipeline (optional, legal, drop-in)
 *
 * The game ships with everything generated from code. This module lets you
 * RAISE FIDELITY by dropping in free, openly-licensed (CC0 / public-domain)
 * assets — HDRI lighting, PBR texture sets, and glTF models. Nothing here
 * ships any third-party art; it only *loads* files you place under assets/.
 *
 * If a file is missing, the loader fails silently and the procedural version
 * is used instead — so the game always runs. See assets/README.md for a
 * vetted list of CC0 sources and exactly where each file goes.
 *
 * IMPORTANT: do NOT use ripped assets from commercial games (Red Dead, Cyber-
 * punk, etc.) — they are copyrighted. Use the CC0 packs listed in the guide.
 * ========================================================================== */

const Assets = {};
window.Assets = Assets;

Assets.ready = false;
Assets.env = null;     // PMREM environment map (from an HDRI), or null
Assets.tex = {};       // kind -> { map, normalMap, roughnessMap, aoMap }
Assets.models = {};    // key  -> THREE.Group (template to clone)
Assets._renderer = null;
Assets._onReady = null;

/* Where the optional files live. Drop matching files in and they're used. */
Assets.config = {
  hdri: "assets/hdri/environment.hdr",
  // PBR texture sets keyed by surface kind (folders containing the maps below)
  textures: {
    brick:    "assets/textures/brick/",
    stone:    "assets/textures/stone/",
    concrete: "assets/textures/concrete/",
    panel:    "assets/textures/panel/",
    plank:    "assets/textures/plank/",
  },
  textureFiles: { map: "albedo.jpg", normalMap: "normal.jpg", roughnessMap: "roughness.jpg", aoMap: "ao.jpg" },
  // glTF models to swap in for the procedural ones (scale/offset are guesses)
  models: {
    moto:      { url: "assets/models/motorcycle.glb", scale: 1, y: 0 },
    car:       { url: "assets/models/car.glb",        scale: 1, y: 0 },
    hover:     { url: "assets/models/hovercar.glb",   scale: 1, y: 0 },
    drone:     { url: "assets/models/drone.glb",      scale: 1, y: 0 },
    character: { url: "assets/models/character.glb",  scale: 1, y: 0 },
  },
};

/* --------------------------------------------------------------------------
 * init — kick off loading. Calls onReady() if anything actually loaded, so the
 * current scene can be rebuilt to pick up the upgraded assets.
 * -------------------------------------------------------------------------- */
Assets.init = function (renderer, onReady) {
  Assets._renderer = renderer;
  Assets._onReady = onReady;
  const jobs = [];
  let loadedAny = false;
  const note = (m) => { try { console.info("[AXIOM assets] " + m); } catch (e) {} };

  // Browsers block file:// asset loads (CORS). Don't even try — just run
  // procedural and tell the user how to enable the upgrade.
  if (location.protocol === "file:") {
    Assets.ready = true;
    note("opened via file:// — the optional CC0 asset upgrades need a server. " +
         "Run `python3 -m http.server` and open http://localhost:8000 to use them. " +
         "Running fully procedural for now (this is fine).");
    return;
  }

  // ---- HDRI environment lighting (highest impact) ----
  if (Assets.config.hdri && typeof THREE.RGBELoader === "function" && typeof THREE.PMREMGenerator === "function") {
    jobs.push(new Promise((res) => {
      let pmrem;
      try { pmrem = new THREE.PMREMGenerator(renderer); pmrem.compileEquirectangularShader(); } catch (e) { return res(); }
      new THREE.RGBELoader().load(Assets.config.hdri, (hdr) => {
        try { Assets.env = pmrem.fromEquirectangular(hdr).texture; hdr.dispose(); pmrem.dispose(); loadedAny = true; note("HDRI loaded → image-based lighting active."); }
        catch (e) {} res();
      }, undefined, () => { note("no HDRI at " + Assets.config.hdri + " — using procedural sky lighting (drop a .hdr there to upgrade)."); res(); });
    }));
  }

  // ---- PBR texture sets per surface kind ----
  if (typeof THREE.TextureLoader === "function") {
    const tl = new THREE.TextureLoader();
    const f = Assets.config.textureFiles;
    for (const kind of Object.keys(Assets.config.textures || {})) {
      const dir = Assets.config.textures[kind];
      jobs.push(new Promise((res) => {
        const set = {}; let pending = 0, gotAlbedo = false; let settled = false;
        const done = () => { if (settled) return; if (pending === 0) { settled = true;
          if (gotAlbedo) { Assets.tex[kind] = set; loadedAny = true; note("PBR set loaded: " + kind); } res(); } };
        const grab = (slot, file, srgb) => {
          if (!file) return; pending++;
          tl.load(dir + file, (t) => {
            t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
            if (srgb) t.encoding = THREE.sRGBEncoding;
            set[slot] = t; if (slot === "map") gotAlbedo = true; pending--; done();
          }, undefined, () => { pending--; done(); });
        };
        grab("map", f.map, true); grab("normalMap", f.normalMap, false);
        grab("roughnessMap", f.roughnessMap, false); grab("aoMap", f.aoMap, false);
        if (pending === 0) done();
      }));
    }
  }

  // ---- glTF models ----
  if (typeof THREE.GLTFLoader === "function") {
    const gl = new THREE.GLTFLoader();
    for (const key of Object.keys(Assets.config.models || {})) {
      const cfg = Assets.config.models[key];
      jobs.push(new Promise((res) => {
        gl.load(cfg.url, (g) => {
          const root = g.scene || (g.scenes && g.scenes[0]);
          if (root) { root.scale.setScalar(cfg.scale || 1); root.userData.yOffset = cfg.y || 0;
            root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
            Assets.models[key] = root; loadedAny = true; note("model loaded: " + key); }
          res();
        }, undefined, () => res());
      }));
    }
  }

  Promise.all(jobs).then(() => {
    Assets.ready = true;
    if (loadedAny && typeof Assets._onReady === "function") Assets._onReady();
    else note("no external assets found — running fully procedural (this is fine). See assets/README.md to upgrade.");
  });
};

/* A repeat-tiled clone of a loaded texture (so one map tiles per object). */
Assets.repeatClone = function (tex, rw, rh) {
  if (!tex) return null;
  const t = tex.clone(); t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rw, rh); t.anisotropy = 4;
  return t;
};

/* A real PBR set for a surface kind, or null to fall back to procedural. */
Assets.set = function (kind) { return Assets.tex[kind] || null; };

/* A fresh clone of a model template, or null. */
Assets.model = function (key) {
  const m = Assets.models[key];
  if (!m) return null;
  const c = m.clone(true); c.userData.yOffset = m.userData.yOffset || 0;
  return c;
};
