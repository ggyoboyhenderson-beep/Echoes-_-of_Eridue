/* ==========================================================================
 * AXIOM — 3D World
 * A first-person, walkable rendering of Ur-Axiom's stacked-era districts,
 * driving the same simulation core (data/engine/state/actions). Procedural
 * geometry only — no external assets — so the city builds instantly.
 * ========================================================================== */

/* Classic script: THREE is the global from the vendored UMD build; the
 * simulation modules expose their globals on window via the HTML bridge. */
(function () {
"use strict";
const THREE = window.THREE;
const AXIOM = window.AXIOM, Engine = window.Engine, State = window.State,
      Actions = window.Actions, UI = window.UI, Art = window.Art;

const World = {};
window.World3D = World;

/* ---- module state ------------------------------------------------------- */
let renderer, scene, camera, clock;
let composer, ssaoPass, bloomPass, fxaaPass, ppOn = true;
let yaw = 0, pitch = 0;
let dragging = false, dragX = 0, dragY = 0; // cursor-free drag-to-look
let freeCam = false;                         // dev-only detached camera (verification)
const keys = {};
const player = { pos: new THREE.Vector3(0, 1.7, 18), vel: new THREE.Vector3() };
let interactables = [];   // {pos, radius, label, type, run}
let focus = null;
let labelSprites = [];
let started = false;
let toastTimer = 0;

const ACTIVATE = 4.2;     // proximity radius to interact
const BOUND = 27;         // half-size of a district plot

/* interior (walk-in building) state */
let inInterior = false;
let interiorSpec = null;
let returnDistrict = null;

/* world-region travel state */
let inRegion = false;
let currentRegion = null;
let returnFromRegion = null;
let currentFloor = 0;
let currentFloorY = 0;
const INNER = 13;         // half-size of an interior floor
const FLOOR_H = 4;        // floor-to-ceiling height

/* ---- tiny seeded RNG for stable district layouts ------------------------ */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/* ======================================================================== */
World.init = function () {
  const canvas = document.getElementById("scene");
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  camera = new THREE.PerspectiveCamera(72, 1, 0.1, 400);
  clock = new THREE.Clock();
  scene = new THREE.Scene();

  buildComposer();
  // optional CC0 asset pipeline — upgrades lighting/textures/models if present
  if (window.Assets && Assets.init) Assets.init(renderer, () => World.rebuildCurrent());
  resize();
  addEventListener("resize", resize);

  // input
  addEventListener("keydown", (e) => {
    keys[e.code] = true;
    if (e.code.startsWith("Arrow")) e.preventDefault(); // arrow keys = look, don't scroll
    if (e.code === "KeyE") { if (dialogOpen()) closeDialog(); else World.interact(); }
    if (e.code === "Tab") { e.preventDefault(); if (!dialogOpen()) World.togglePanels(); }
    if (e.code === "KeyP") { ppOn = !ppOn; toast(`Cinematic rendering ${ppOn ? "on" : "off"}.`, ""); }
    if (e.code === "KeyM" && window.GameAudio) toast(`Sound ${GameAudio.toggle() ? "on" : "off"}.`, "");
  });
  addEventListener("keyup", (e) => { keys[e.code] = false; });
  // Never let a key get "stuck" when the tab/window loses focus mid-press.
  const clearKeys = () => { for (const k in keys) keys[k] = false; dragging = false; canvas.classList.remove("grabbing"); };
  addEventListener("blur", clearKeys);
  document.addEventListener("visibilitychange", () => { if (document.hidden) clearKeys(); });

  // Cursor-free look: click-and-drag (mouse or touch) turns the camera, no
  // pointer-lock — so the game runs anywhere, including embeds and mobile.
  const lookActive = () => started && !panelsOpen() && !dialogOpen();
  let downX = 0, downY = 0, moved = 0;            // tap-vs-drag discrimination
  canvas.addEventListener("pointerdown", (e) => {
    if (window.GameAudio) GameAudio.ensure();
    if (!lookActive()) return;
    dragging = true; dragX = downX = e.clientX; dragY = downY = e.clientY; moved = 0;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    canvas.classList.add("grabbing");
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging || !lookActive()) return;
    yaw -= (e.clientX - dragX) * 0.0042;
    pitch = Math.max(-1.2, Math.min(1.2, pitch - (e.clientY - dragY) * 0.0042));
    moved += Math.abs(e.clientX - dragX) + Math.abs(e.clientY - dragY);
    dragX = e.clientX; dragY = e.clientY;
  });
  const endDrag = (e) => {
    if (dragging && moved < 6 && lookActive() && focus) World.interact(); // a clean tap = interact (mouse + touch)
    dragging = false; canvas.classList.remove("grabbing");
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("pointerleave", endDrag);

  // dialogue buttons
  document.getElementById("dlg-friendly").onclick = () => chooseDialog("Friendly");
  document.getElementById("dlg-neutral").onclick = () => chooseDialog("Neutral");
  document.getElementById("dlg-trade").onclick = () => chooseDialog("Trade");
  document.getElementById("dlg-rob").onclick = () => chooseRob();
  document.getElementById("dlg-leave").onclick = () => closeDialog();

  // panel wiring
  document.querySelectorAll("#panels .panel-tabs button[data-t]").forEach((b) =>
    b.onclick = () => World.showPanel(b.dataset.t));
  document.getElementById("panels-close").onclick = () => World.togglePanels(false);

  renderer.setAnimationLoop(loop);
};

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  sizeComposer();
}

/* ---- post-processing pipeline (the AAA-technique families, in-browser) --- */
function buildComposer() {
  if (typeof THREE.EffectComposer !== "function") { ppOn = false; return; } // graceful fallback
  composer = new THREE.EffectComposer(renderer);
  composer.addPass(new THREE.RenderPass(scene, camera));
  // Ambient occlusion — contact shadowing in creases and corners.
  if (THREE.SSAOPass) {
    ssaoPass = new THREE.SSAOPass(scene, camera, innerWidth, innerHeight);
    ssaoPass.kernelRadius = 1.1; ssaoPass.minDistance = 0.0015; ssaoPass.maxDistance = 0.12;
    composer.addPass(ssaoPass);
  }
  // Bloom — only genuinely bright things (sky, neon, lamps) glow.
  if (THREE.UnrealBloomPass) {
    bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.7, 0.92);
    composer.addPass(bloomPass);
  }
  // FXAA — cheap edge anti-aliasing as the final present pass.
  if (THREE.FXAAShader) {
    fxaaPass = new THREE.ShaderPass(THREE.FXAAShader);
    composer.addPass(fxaaPass);
  }
}
function sizeComposer() {
  if (!composer) return;
  const w = innerWidth, h = innerHeight, dpr = Math.min(devicePixelRatio, 2);
  composer.setSize(w, h);
  if (ssaoPass) ssaoPass.setSize(w, h);
  if (bloomPass) bloomPass.setSize(w, h);
  if (fxaaPass) fxaaPass.material.uniforms["resolution"].value.set(1 / (w * dpr), 1 / (h * dpr));
}
World._ppOn = () => ppOn && !!composer;

/* ======================================================================== */
World.start = function () {
  started = true;
  World.buildDistrict(State.data.here, true);
  World.updateHUD();
};

/* ---- helpers to add geometry -------------------------------------------- */
let currentBuildKind = null;   // detail texture used by theme.build() structures
let currentDistrictId = null;  // district being built (for generated interiors)

function box(w, h, d, color, x, y, z, opts = {}) {
  const matOpts = {
    color, roughness: opts.rough ?? 0.9, metalness: opts.metal ?? 0.0,
    emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.ei ?? 1,
  };
  // Apply a tinted detail texture + normal map to surfaces — skip glow accents.
  const kind = opts.tex !== undefined ? opts.tex : currentBuildKind;
  const glowing = opts.emissive && (opts.ei ?? 1) >= 0.8 && !opts.emissiveMap;
  if (kind && Art && !glowing) {
    const rw = Math.max(1, Math.round((w + d) / 3));
    const rh = Math.max(1, Math.round(h / 2.2));
    const real = Art.realDetail ? Art.realDetail(kind, rw, rh) : null;
    if (real) { matOpts.map = real.map; if (real.normalMap) { matOpts.normalMap = real.normalMap; matOpts.normalScale = new THREE.Vector2(0.8, 0.8); } matOpts.color = 0xffffff; }
    else { matOpts.map = Art.detail(kind, rw, rh); matOpts.normalMap = Art.detailNormal(kind, rw, rh); matOpts.normalScale = new THREE.Vector2(0.8, 0.8); }
  }
  if (opts.emissiveMap) { matOpts.emissiveMap = opts.emissiveMap; if (!matOpts.emissive) matOpts.emissive = 0xffffff; }
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial(matOpts));
  m.position.set(x, y, z);
  // Only sizeable structures cast shadows (keeps the shadow pass cheap).
  m.castShadow = !glowing && (w > 1.6 || h > 2.6 || d > 1.6);
  m.receiveShadow = !glowing;
  scene.add(m);
  return m;
}
function light(color, intensity, x, y, z, dist = 30) {
  const l = new THREE.PointLight(color, intensity, dist, 2);
  l.position.set(x, y, z); scene.add(l); return l;
}
function shadeHex(hex, f) {
  let r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return (c(r) << 16) | (c(g) << 8) | c(b);
}

/* ---- prop toolkit (street furniture that makes a place feel inhabited) --- */
function cyl(rt, rb, h, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 12), mat);
  m.position.set(x, y, z); m.castShadow = h > 2.5; m.receiveShadow = true; scene.add(m); return m;
}
function lampPost(x, z, color, h) {
  h = h || 2.6;
  box(0.12, h, 0.12, 0x26242a, x, h / 2, z, { tex: null, rough: 0.5, metal: 0.5 });
  box(0.26, 0.22, 0.26, color, x, h, z, { emissive: color, ei: 1.3, tex: null });
  light(color, 5.5, x, h, z, 11);
}
function brazier(x, z) {
  cyl(0.16, 0.22, 0.5, new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.8, metalness: 0.4 }), x, 0.25, z);
  box(0.3, 0.22, 0.3, 0xff7a25, x, 0.62, z, { emissive: 0xff6a10, ei: 1.5, tex: null });
  light(0xff7a30, 5, x, 0.9, z, 9);
}
function crate(x, z, s, kind) {
  s = s || (0.6 + Math.random() * 0.4);
  box(s, s, s, 0x6a5236, x, s / 2, z, { tex: kind || "plank", rough: 0.95 });
}
function barrel(x, z) {
  const h = 0.85, r = 0.32;
  cyl(r, r, h, new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.8, metalness: 0.2 }), x, h / 2, z);
}
function banner(x, z, color, w, h, y) {
  box(w || 0.5, h || 1.6, 0.04, color, x, (y != null ? y : 2.7), z, { tex: "cloth", rough: 0.9 });
}
function wire(a, b, color) {
  const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const len = dir.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, len, 5),
    new THREE.MeshStandardMaterial({ color: color || 0x16140f, roughness: 0.8 }));
  m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  scene.add(m);
}
function windows(x, z, w, h, d, color, night, rnd) {
  const ei = night ? 1.1 : 0.12;
  const cols = Math.max(1, Math.floor(w / 0.9)), rows = Math.max(1, Math.floor(h / 1.6));
  for (const fz of [d / 2 + 0.02, -d / 2 - 0.02]) {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (rnd() > 0.62) continue;
      const wx = x + (c - (cols - 1) / 2) * 0.9;
      const wy = 1.4 + r * 1.6;
      box(0.34, 0.6, 0.06, color, wx, wy, z + fz, { emissive: color, ei, tex: null });
    }
  }
}

/* ---- interactive landmarks -------------------------------------------------
 * Register an interaction zone on a building. run(g) may open a modal, trigger
 * an Action, or return {panel}. A faint glowing marker hints it's interactive.
 * -------------------------------------------------------------------------- */
function landmark(x, z, r, label, run, markerColor) {
  if (markerColor !== null) {
    const c = markerColor || 0xe6b450;
    box(0.18, 0.18, 0.18, c, x, 2.4, z, { emissive: c, ei: 1.4, tex: null });
    light(c, 2.2, x, 2.6, z, 6);
  }
  interactables.push({ type: "landmark", label, pos: new THREE.Vector3(x, 1, z), radius: r, mesh: null, run });
}
function examine(title, text, kind) {
  return () => {
    if (document.pointerLockElement) document.exitPointerLock();
    UI.modal(`<h2>${title}</h2><p style="font-size:14px">${text}</p>`);
    Engine.push(State.data, `You examine ${title}.`, kind || "explore");
    return {};
  };
}

/* ======================================================================== */
/* TRAFFIC — motorcycles, cars, hovercars and drones to make the city move.  */
let vehicles = [];

// A detailed wheel: a round torus tyre, a metal rim with crossed spokes and a
// hub cap. Spinning the pivot around X turns the visible spokes.
function wheel(r, tyreMat, rimMat) {
  const piv = new THREE.Object3D();
  const tyre = new THREE.Mesh(new THREE.TorusGeometry(r * 0.74, r * 0.30, 10, 20), tyreMat);
  tyre.rotation.y = Math.PI / 2;                         // axle along X
  piv.add(tyre);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.52, r * 0.52, r * 0.5, 16), rimMat || tyreMat);
  rim.rotation.z = Math.PI / 2; piv.add(rim);
  for (let s = 0; s < 3; s++) {                          // spokes (make spin visible)
    const sp = new THREE.Mesh(new THREE.BoxGeometry(r * 0.52, r * 0.9, r * 0.14), rimMat || tyreMat);
    sp.rotation.x = (s / 3) * Math.PI; piv.add(sp);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.2, r * 0.2, r * 0.56, 10), rimMat || tyreMat);
  hub.rotation.z = Math.PI / 2; piv.add(hub);
  return piv;
}

function makeVehicle(kind, color, night) {
  // a loaded CC0 glTF model takes over if one is configured & present
  if (window.Assets && Assets.model) {
    const m = Assets.model(kind);
    if (m) { const g = new THREE.Group(); m.position.y = m.userData.yOffset || 0; g.add(m); return { grp: g, wheels: [] }; }
  }
  const grp = new THREE.Group();
  const body  = new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.65, envMapIntensity: 1.1 });
  const trim  = new THREE.MeshStandardMaterial({ color: shadeHex(color, 0.6), roughness: 0.4, metalness: 0.6 });
  const dark  = new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 0.6, metalness: 0.4 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xb9c0cc, roughness: 0.22, metalness: 0.95 });
  const tyre  = new THREE.MeshStandardMaterial({ color: 0x0c0c10, roughness: 0.92 });
  const rimM  = new THREE.MeshStandardMaterial({ color: 0xc4c9d2, roughness: 0.3, metalness: 0.9 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1b2a3a, roughness: 0.08, metalness: 0.9, emissive: 0x0c1622, emissiveIntensity: 0.3 });
  const head  = new THREE.MeshStandardMaterial({ color: 0xfff0c0, emissive: 0xfff0c0, emissiveIntensity: night ? 1.8 : 0.45 });
  const tail  = new THREE.MeshStandardMaterial({ color: 0xff3030, emissive: 0xff2020, emissiveIntensity: night ? 1.5 : 0.5 });
  const mk = (w, h, d, mat, x, y, z, rx) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); if (rx) m.rotation.x = rx; m.castShadow = true; grp.add(m); return m; };
  const wheels = [];

  if (kind === "moto") {
    mk(0.30, 0.30, 1.2, body, 0, 0.58, 0);              // tank/spine
    mk(0.34, 0.20, 0.5, dark, 0, 0.74, -0.18);          // seat
    mk(0.30, 0.16, 0.3, trim, 0, 0.60, 0.42);           // engine block
    const fork = mk(0.12, 0.5, 0.12, chrome, 0, 0.74, 0.6, -0.35); // raked forks
    mk(0.5, 0.07, 0.1, dark, 0, 0.92, 0.62);            // handlebars
    mk(0.12, 0.1, 0.5, chrome, 0.16, 0.5, -0.55);       // exhaust pipe
    const rider = new THREE.Group(); rider.position.set(0, 0.86, 0.0);
    const rb = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.52, 8), new THREE.MeshStandardMaterial({ color: 0x222028, roughness: 0.7 })); rb.position.y = 0.26; rb.rotation.x = 0.4; rider.add(rb);
    const ra = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6), new THREE.MeshStandardMaterial({ color: 0x222028, roughness: 0.7 })); ra.position.set(0, 0.4, 0.28); ra.rotation.x = 1.1; rider.add(ra);
    const rh = new THREE.Mesh(GEO.sphere, new THREE.MeshStandardMaterial({ color: 0x14141c, roughness: 0.35, metalness: 0.3 })); rh.scale.setScalar(0.13); rh.position.set(0, 0.6, -0.04); rider.add(rh);
    grp.add(rider);
    const wf = wheel(0.32, tyre, rimM); wf.position.set(0, 0.32, 0.66); grp.add(wf); wheels.push(wf);
    const wr = wheel(0.34, tyre, rimM); wr.position.set(0, 0.34, -0.62); grp.add(wr); wheels.push(wr);
    mk(0.16, 0.16, 0.06, head, 0, 0.74, 0.84);          // headlight
    mk(0.1, 0.08, 0.05, tail, 0, 0.64, -0.82);
  } else if (kind === "hover") {
    mk(1.15, 0.26, 2.7, body, 0, 0.72, 0);              // hull
    mk(1.0, 0.18, 2.3, trim, 0, 0.58, 0, 0);            // lower hull
    mk(0.95, 0.34, 1.35, glass, 0, 0.98, -0.1);         // canopy
    mk(0.7, 0.12, 0.5, body, 0, 1.16, -0.1);            // spine fin
    mk(0.18, 0.5, 0.7, trim, 0.62, 0.95, -1.0, 0.3);    // rear fins
    mk(0.18, 0.5, 0.7, trim, -0.62, 0.95, -1.0, 0.3);
    const glow = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.5 });
    mk(1.0, 0.07, 2.4, glow, 0, 0.5, 0);                // anti-grav glow underside
    mk(0.3, 0.3, 0.12, glow, 0, 0.72, -1.4);            // thruster
    mk(0.55, 0.1, 0.08, head, 0, 0.74, 1.38);
    mk(0.55, 0.1, 0.08, tail, 0, 0.74, -1.42);
  } else { // car — beveled multi-part body with arches, bumpers, mirrors, grille
    mk(1.74, 0.30, 3.7, body, 0, 0.50, 0);              // lower body
    mk(1.78, 0.22, 3.5, dark, 0, 0.34, 0);              // sill/underbody
    mk(1.7, 0.30, 2.1, body, 0, 0.76, -0.1);            // shoulder line
    mk(1.5, 0.16, 1.15, body, 0, 0.74, 1.25);           // hood
    mk(1.5, 0.16, 0.95, body, 0, 0.74, -1.55);          // boot
    // tapered greenhouse + glass
    mk(1.42, 0.46, 1.55, trim, 0, 1.04, -0.1);          // roof pillars
    mk(1.30, 0.42, 1.62, glass, 0, 1.04, -0.1);         // wrap glass
    mk(1.22, 0.30, 0.06, glass, 0, 1.02, 0.72);         // windshield
    // bumpers + grille + plate
    mk(1.66, 0.24, 0.2, dark, 0, 0.44, 1.85);
    mk(1.66, 0.24, 0.2, dark, 0, 0.44, -1.85);
    mk(1.05, 0.16, 0.06, chrome, 0, 0.56, 1.9);         // grille
    mk(0.34, 0.12, 0.04, chrome, 0, 0.4, 1.96);         // plate
    // mirrors
    mk(0.12, 0.1, 0.22, body, 0.82, 0.92, 0.66); mk(0.12, 0.1, 0.22, body, -0.82, 0.92, 0.66);
    // wheel arches (dark fenders) over each wheel
    const wp = [[0.82, 1.2], [-0.82, 1.2], [0.82, -1.2], [-0.82, -1.2]];
    for (const [wx, wz] of wp) {
      mk(0.16, 0.5, 0.92, dark, wx * 1.02, 0.6, wz);    // arch
      const w = wheel(0.36, tyre, rimM); w.position.set(wx, 0.34, wz); grp.add(w); wheels.push(w);
    }
    // lights
    mk(0.3, 0.16, 0.06, head, 0.5, 0.56, 1.9); mk(0.3, 0.16, 0.06, head, -0.5, 0.56, 1.9);
    mk(0.28, 0.14, 0.06, tail, 0.52, 0.6, -1.9); mk(0.28, 0.14, 0.06, tail, -0.52, 0.6, -1.9);
  }
  return { grp, wheels };
}

function spawnTraffic(id, night) {
  vehicles = [];
  // per-district traffic profile (sacred/oldest places stay quiet)
  const profile = {
    hanging_market: { n: 6, kinds: ["moto", "moto", "car"], drones: 2 },
    ironwall:       { n: 5, kinds: ["moto", "car"], drones: 1 },
    broken_crown:   { n: 6, kinds: ["moto", "moto", "moto", "car"], drones: 2 },
    neon_labyrinth: { n: 9, kinds: ["moto", "hover", "hover", "car"], drones: 6 },
    spire:          { n: 6, kinds: ["hover", "hover", "car"], drones: 5 },
    ziggurat_crown: { n: 2, kinds: ["moto"], drones: 1 },
    god_quarter:    { n: 0, kinds: [], drones: 0 },
    sub_strata:     { n: 0, kinds: [], drones: 0 },
  }[id] || { n: 3, kinds: ["moto", "car"], drones: 1 };

  const motoCols = [0x8a2a2a, 0x2a4a8a, 0x2a8a5a, 0xc8a030, 0x222228, 0x8a3a6a];
  for (let i = 0; i < profile.n; i++) {
    const kind = profile.kinds[i % profile.kinds.length];
    const v = makeVehicle(kind, motoCols[(Math.random() * motoCols.length) | 0], night);
    const lane = i % 3;                                   // three concentric ring lanes
    const rx = BOUND - 2.5 - lane * 2.6, rz = BOUND - 2.5 - lane * 2.6;
    const dir = lane === 1 ? -1 : 1;                       // middle lane runs opposite
    const hoverY = kind === "hover" ? 1.2 + Math.random() * 2.5 : 0;
    scene.add(v.grp);
    vehicles.push({ grp: v.grp, wheels: v.wheels, kind, rx, rz, dir,
      angle: Math.random() * Math.PI * 2, speed: kind === "hover" ? 7 + Math.random() * 4 : 5 + Math.random() * 4, y: hoverY });
  }
  // drifting drones above the rooftops
  for (let i = 0; i < profile.drones; i++) {
    const c = id === "spire" ? 0x88c0ff : 0x38d0c8;
    const d = new THREE.Group();
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.5), new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 0.5, metalness: 0.6 })); d.add(b);
    const l = new THREE.Mesh(GEO.sphere, new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.6 })); l.scale.setScalar(0.08); l.position.y = -0.12; d.add(l);
    scene.add(d);
    vehicles.push({ grp: d, drone: true, rx: 10 + Math.random() * 14, rz: 10 + Math.random() * 14,
      dir: Math.random() > 0.5 ? 1 : -1, angle: Math.random() * 6.28, speed: 3 + Math.random() * 3, y: 9 + Math.random() * 8 });
  }
}

function updateVehicles(dt) {
  for (const v of vehicles) {
    v.angle += v.dir * v.speed * dt / Math.max(8, (v.rx + v.rz) / 2);
    const x = Math.cos(v.angle) * v.rx, z = Math.sin(v.angle) * v.rz;
    v.grp.position.set(x, v.y, z);
    const dx = -Math.sin(v.angle) * v.rx * v.dir, dz = Math.cos(v.angle) * v.rz * v.dir;
    v.grp.rotation.y = Math.atan2(dx, dz);
    if (v.drone) { v.grp.position.y = v.y + Math.sin(v.angle * 3) * 0.4; v.grp.rotation.z = 0; continue; }
    v.grp.rotation.z = -v.dir * 0.06;                      // bank into the turn
    if (v.wheels) for (const w of v.wheels) w.rotation.x += v.speed * dt * 3;
  }
}

/* ======================================================================== */
/* MEGACITY — GPU-instanced surrounding city + dense traffic. One draw call
 * renders hundreds of buildings or cars, so the world reads as a vast city.   */
const _dummy = new THREE.Object3D();
let cityTraffic = null, cityTrafficData = [];

/* The city that stretches past the district walls in every direction:
 * a near band of homes, then mid-rise offices, then a far skyline of towers. */
function buildSurroundCity(theme, night) {
  const modern = theme.tex === "neon" || theme.tex === "panel" || theme.tex === "marble";
  const N = 360;
  // lit windows on EVERY building now — warm for old eras, cool for modern
  const winColor = modern ? (theme.tex === "marble" ? 0xbfe2ff : 0x38d0c8) : 0xffcf8a;
  const win = Art ? Art.windowTex(winColor, night, 4242) : null;
  if (win) win.repeat.set(2, 4);
  const mat = new THREE.MeshStandardMaterial({
    roughness: modern ? 0.45 : 0.9, metalness: modern ? 0.4 : 0.07,
    emissiveMap: win, emissive: win ? 0xffffff : 0x000000, emissiveIntensity: win ? (night ? 0.8 : 0.18) : 0,
  });
  const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, N);
  bodies.frustumCulled = false; bodies.castShadow = false; bodies.receiveShadow = false;

  const roofMat = new THREE.MeshStandardMaterial({ color: shadeHex(theme.wall, 0.5), roughness: 0.85, metalness: 0.05 });
  const roofGeo = new THREE.ConeGeometry(0.72, 1, 4);       // 4-sided pitched roof
  const capMat = new THREE.MeshStandardMaterial({ color: shadeHex(theme.wall, 0.72), roughness: 0.8, metalness: modern ? 0.3 : 0.1 });
  const capGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofs = [], caps = [];

  const c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2;
    // distance ring controls scale: near = homes, mid = offices, far = towers
    const t = Math.random();
    const r = BOUND + 6 + t * 96;
    const h = t < 0.33 ? 2 + Math.random() * 4 : t < 0.66 ? 6 + Math.random() * 12 : 14 + Math.random() * 40;
    const w = (t < 0.33 ? 2.5 : 4) + Math.random() * (t < 0.33 ? 2 : 6);
    const d = w * (0.8 + Math.random() * 0.5);
    const x = Math.cos(a) * r, z = Math.sin(a) * r, rot = Math.random() * Math.PI;
    _dummy.position.set(x, h / 2, z); _dummy.rotation.set(0, rot, 0); _dummy.scale.set(w, h, d);
    _dummy.updateMatrix(); bodies.setMatrixAt(i, _dummy.matrix);
    c.setHex(theme.wall).multiplyScalar(0.6 + Math.random() * 0.7);
    bodies.setColorAt(i, c);

    if (t < 0.33) {                                          // a house — pitched roof
      const rw = Math.max(w, d) * 0.82, rh = 0.8 + Math.random() * 1.0;
      _dummy.position.set(x, h + rh / 2, z); _dummy.rotation.set(0, rot + Math.PI / 4, 0); _dummy.scale.set(rw, rh, rw);
      _dummy.updateMatrix(); roofs.push(_dummy.matrix.clone());
    } else if (Math.random() < 0.7) {                        // office/tower — rooftop block
      const cw = w * (0.4 + Math.random() * 0.2), ch = 0.6 + Math.random() * 1.0;
      _dummy.position.set(x + (Math.random() - 0.5) * w * 0.3, h + ch / 2, z + (Math.random() - 0.5) * d * 0.3);
      _dummy.rotation.set(0, rot, 0); _dummy.scale.set(cw, ch, cw);
      _dummy.updateMatrix(); caps.push(_dummy.matrix.clone());
    }
  }
  bodies.instanceColor.needsUpdate = true; scene.add(bodies);
  if (roofs.length) { const rm = new THREE.InstancedMesh(roofGeo, roofMat, roofs.length); rm.frustumCulled = false; roofs.forEach((m, i) => rm.setMatrixAt(i, m)); scene.add(rm); }
  if (caps.length)  { const cm = new THREE.InstancedMesh(capGeo, capMat, caps.length); cm.frustumCulled = false; caps.forEach((m, i) => cm.setMatrixAt(i, m)); scene.add(cm); }
}

/* A detailed walk-up home/office: foundation, window-lit body, roof, door, and
 * a night porch light — used for the buildings you can actually reach & enter. */
const ERA_WALL = { ancient: 0x8a6e4a, market: 0x9a7a52, medieval: 0x6e6a60, cyber: 0x2a2c38, corporate: 0xcfd6de };
function detailHouse(x, z, w, h, era, night, isOffice) {
  const modern = era === "cyber" || era === "corporate";
  const wallHex = ERA_WALL[era] || 0x8a6e4a;
  const winColor = modern ? 0x9fd8ff : 0xffcf8a;
  box(w * 1.08, 0.4, w * 1.08, shadeHex(wallHex, 0.7), x, 0.2, z, { rough: 0.95 });  // foundation
  const body = box(w, h, w, wallHex, x, h / 2 + 0.2, z, { rough: modern ? 0.4 : 0.9, metal: modern ? 0.4 : 0.07 });
  const win = Art && Art.windowTex(winColor, night, (x * 7 + z * 3) | 0);
  if (win) {
    win.repeat.set(Math.max(1, Math.round(w / 2)), Math.max(2, Math.round(h / 3)));
    body.material.emissiveMap = win; body.material.emissive = new THREE.Color(0xffffff);
    body.material.emissiveIntensity = night ? 0.7 : 0.18; body.material.needsUpdate = true;
  }
  if (modern || isOffice) {                                  // flat roof + rooftop unit
    box(w * 1.05, 0.45, w * 1.05, shadeHex(wallHex, 0.8), x, h + 0.45, z, { rough: 0.7, metal: modern ? 0.3 : 0.1 });
    box(w * 0.4, 0.7, w * 0.4, 0x2a2a30, x, h + 0.9, z, { tex: "panel", metal: 0.4 });
  } else {                                                   // pitched roof
    const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.82, h * 0.5, 4),
      new THREE.MeshStandardMaterial({ color: shadeHex(wallHex, 0.5), roughness: 0.85 }));
    roof.rotation.y = Math.PI / 4; roof.position.set(x, h + 0.2 + h * 0.25, z);
    roof.castShadow = roof.receiveShadow = true; scene.add(roof);
  }
  box(w * 0.34, 1.7, 0.12, 0x2a211a, x, 1.05, z + w / 2 + 0.02, { tex: null, rough: 0.7 });  // door
  if (night) light(winColor, 3, x, 2.0, z + w / 2 + 0.4, 6);                                 // porch light
}

// The lane grid shared by the roads and the cars that drive on them, so the
// painted arrows always agree with which way traffic is moving.
function laneGrid() {
  const lanes = [];
  for (let k = -3; k <= 3; k++) {
    if (!k) continue;
    lanes.push({ axis: "x", fixed: k * 6.6, dir: k % 2 ? 1 : -1 });
    lanes.push({ axis: "z", fixed: k * 6.6, dir: k % 2 ? -1 : 1 });
  }
  return lanes;
}
const TRAFFIC_COUNT = { neon_labyrinth: 200, spire: 130, hanging_market: 170,
  ironwall: 130, broken_crown: 170, ziggurat_crown: 50, god_quarter: 0, sub_strata: 0 };

/* Visible streets: a grid of asphalt lanes with edge lines, dashed centres, and
 * direction chevrons, plus a perimeter ring road under the circling vehicles. */
function buildRoads(id) {
  if (!Art || !Art.roadTex) return;
  const cnt = TRAFFIC_COUNT[id] != null ? TRAFFIC_COUNT[id] : 90;
  if (!cnt) return;                                  // quiet districts get no streets
  const len = BOUND * 2, segs = Math.max(2, Math.round(len / 7));
  for (const ln of laneGrid()) {
    const horizontal = ln.axis === "x";
    const reverse = horizontal ? ln.dir < 0 : ln.dir > 0;
    const tex = Art.roadTex(horizontal, reverse);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    if (horizontal) tex.repeat.set(segs, 1); else tex.repeat.set(1, segs);
    const mat = new THREE.MeshStandardMaterial({
      map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.14,
      roughness: 0.92, metalness: 0.0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const geo = horizontal ? new THREE.PlaneGeometry(len, 3.7) : new THREE.PlaneGeometry(3.7, len);
    const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; m.receiveShadow = true;
    if (horizontal) m.position.set(0, 0.02, ln.fixed); else m.position.set(ln.fixed, 0.02, 0);
    scene.add(m);
  }
  // perimeter ring road for the hero vehicles that circle the plot
  const ring = new THREE.Mesh(new THREE.RingGeometry(BOUND - 7, BOUND - 0.6, 56),
    new THREE.MeshStandardMaterial({ color: 0x1b1b20, roughness: 0.92, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.012; ring.receiveShadow = true; scene.add(ring);
  for (const rr of [BOUND - 5.2, BOUND - 2.6]) {     // faint lane lines on the ring
    const ln = new THREE.Mesh(new THREE.RingGeometry(rr - 0.07, rr + 0.07, 72),
      new THREE.MeshBasicMaterial({ color: 0xc9c4a6, transparent: true, opacity: 0.5 }));
    ln.rotation.x = -Math.PI / 2; ln.position.y = 0.03; scene.add(ln);
  }
}

/* Hundreds of cars on a street grid, one InstancedMesh, per-instance colour. */
function buildGroundTraffic(id, night) {
  cityTraffic = null; cityTrafficData = [];
  const n = TRAFFIC_COUNT[id];
  const count = n != null ? n : 90;
  if (!count) return;
  const geo = new THREE.BoxGeometry(1.5, 0.6, 3.0);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.45 });
  const im = new THREE.InstancedMesh(geo, mat, count);
  im.frustumCulled = false; im.castShadow = false;
  const cols = [0x8a2a2a, 0x2a4a8a, 0x2a8a5a, 0xc8a030, 0x222228, 0x8a3a6a, 0xb0b4bc, 0x30384a, 0xc86a2a];
  // the same one-way lane grid the painted roads use
  const lanes = laneGrid();
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const lane = lanes[i % lanes.length];
    cityTrafficData.push({ axis: lane.axis, fixed: lane.fixed, dir: lane.dir,
      p: (Math.random() - 0.5) * (BOUND * 2 - 4), speed: 4 + Math.random() * 6 });
    c.setHex(cols[(Math.random() * cols.length) | 0]); im.setColorAt(i, c);
  }
  im.instanceColor.needsUpdate = true;
  scene.add(im); cityTraffic = im;
  updateGroundTraffic(0);
}
function updateGroundTraffic(dt) {
  if (!cityTraffic) return;
  const lim = BOUND - 1.2;
  for (let i = 0; i < cityTrafficData.length; i++) {
    const d = cityTrafficData[i];
    d.p += d.dir * d.speed * dt;
    if (d.p > lim) d.p = -lim; else if (d.p < -lim) d.p = lim;
    if (d.axis === "x") { _dummy.position.set(d.p, 0.35, d.fixed); _dummy.rotation.set(0, d.dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0); }
    else { _dummy.position.set(d.fixed, 0.35, d.p); _dummy.rotation.set(0, d.dir > 0 ? 0 : Math.PI, 0); }
    _dummy.scale.set(1, 1, 1); _dummy.updateMatrix();
    cityTraffic.setMatrixAt(i, _dummy.matrix);
  }
  cityTraffic.instanceMatrix.needsUpdate = true;
}

/* A high-rise in one of several silhouettes, so skylines aren't all boxes. */
function cityTower(rnd, x, z, w, h, color, opts) {
  opts = opts || {};
  const win = (mw, mh, mx, my, mz, seed) => {
    const t = Art && Art.windowTex(opts.winColor || 0xbfe2ff, opts.night, seed | 0);
    const m = box(mw, mh, mw, color, mx, my, mz, { rough: opts.rough != null ? opts.rough : 0.45, metal: opts.metal != null ? opts.metal : 0.45, emissiveMap: t, emissive: 0xffffff, ei: opts.night ? 0.85 : 0.26 });
    if (t) m.material.emissiveMap.repeat.set(Math.max(1, Math.round(mw / 3)), Math.max(2, Math.round(mh / 5)));
    return m;
  };
  const sil = opts.silhouette || ["box", "box", "setback", "setback", "taper", "cylinder", "L", "antenna"][(rnd() * 8) | 0];
  if (sil === "setback") {
    let cw = w, cy = 0; const tiers = 2 + ((rnd() * 2) | 0);
    for (let t = 0; t < tiers; t++) { const th = h / tiers; win(cw, th, x, cy + th / 2, z, x * 13 + z * 7 + t); cy += th; cw *= 0.72; }
  } else if (sil === "taper") {
    const g = new THREE.CylinderGeometry(w * 0.32, w * 0.6, h, 4);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.5 }));
    m.rotation.y = Math.PI / 4; m.position.set(x, h / 2, z); m.castShadow = true; m.receiveShadow = true; scene.add(m);
  } else if (sil === "cylinder") {
    const t = Art && Art.windowTex(opts.winColor || 0xbfe2ff, opts.night, (x | 0) + 9);
    const g = new THREE.CylinderGeometry(w * 0.5, w * 0.56, h, 16);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.5, emissiveMap: t, emissive: t ? 0xffffff : 0x000000, emissiveIntensity: opts.night ? 0.8 : 0.24 }));
    if (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, Math.max(2, Math.round(h / 5))); }
    m.position.set(x, h / 2, z); m.castShadow = true; m.receiveShadow = true; scene.add(m);
  } else if (sil === "L") {
    win(w, h, x, h / 2, z - w * 0.22, x + z); box(w * 0.55, h * 0.8, w, color, x - w * 0.22, h * 0.4, z, { rough: 0.45, metal: 0.45, emissiveMap: Art && Art.windowTex(opts.winColor || 0xbfe2ff, opts.night, x - z), emissive: 0xffffff, ei: opts.night ? 0.85 : 0.26 });
  } else if (sil === "antenna") {
    win(w, h, x, h / 2, z, x + z * 3);
    box(0.12, h * 0.45, 0.12, 0x2a2a30, x, h + h * 0.22, z, { tex: null, metal: 0.6 });
    box(0.18, 0.18, 0.18, 0xff4040, x, h + h * 0.45, z, { emissive: 0xff3030, ei: 1.4, tex: null });
  } else {
    win(w, h, x, h / 2, z, x * 5 + z);
  }
  if (opts.neon) { const c = opts.stripColor || 0x38d0c8; box(0.26, h * 0.85, 0.26, c, x + w / 2 + 0.05, h / 2, z, { emissive: c, ei: 1.5, tex: null }); }
  // rooftop clutter
  if (rnd() > 0.55 && sil !== "taper" && sil !== "cylinder") {
    if (rnd() > 0.5) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.8, 10), new THREE.MeshStandardMaterial({ color: 0x3a3630, roughness: 0.85 })); t.position.set(x + (rnd() - 0.5) * w * 0.4, h + 0.4, z + (rnd() - 0.5) * w * 0.4); t.castShadow = true; scene.add(t); }
    else box(0.6, 0.5, 0.6, 0x2a2a30, x + (rnd() - 0.5) * w * 0.3, h + 0.25, z, { tex: "panel", metal: 0.4 });
  }
}

/* Gradient sky dome, a sun or moon disc, and stars at night. */
function buildSky(theme, g) {
  if (theme.tex === "fungal") return; // the Sub-Strata is underground; no sky

  const top = theme.skyTop != null ? theme.skyTop : shadeHex(theme.sky, 0.45);
  const cnv = document.createElement("canvas"); cnv.width = 16; cnv.height = 256;
  const cx = cnv.getContext("2d"); const grd = cx.createLinearGradient(0, 0, 0, 256);
  const hx = (n) => "#" + n.toString(16).padStart(6, "0");
  grd.addColorStop(0, hx(top)); grd.addColorStop(0.6, hx(shadeHex(theme.sky, 0.8))); grd.addColorStop(1, hx(theme.sky));
  cx.fillStyle = grd; cx.fillRect(0, 0, 16, 256);
  const skyTex = new THREE.CanvasTexture(cnv);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(190, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false })
  );
  scene.add(dome);

  const night = Engine.isNight(g);
  // celestial disc
  const discC = document.createElement("canvas"); discC.width = discC.height = 64;
  const dc = discC.getContext("2d"); const rg = dc.createRadialGradient(32, 32, 2, 32, 32, 32);
  const cc = night ? "230,235,255" : "255,240,200";
  rg.addColorStop(0, `rgba(${cc},1)`); rg.addColorStop(0.5, `rgba(${cc},0.7)`); rg.addColorStop(1, `rgba(${cc},0)`);
  dc.fillStyle = rg; dc.fillRect(0, 0, 64, 64);
  const disc = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(discC), transparent: true, fog: false, depthWrite: false }));
  disc.scale.set(night ? 16 : 22, night ? 16 : 22, 1);
  disc.position.set(70, 110, -120);
  scene.add(disc);

  // stars
  if (night) {
    const N = 420, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const u = Math.random() * Math.PI * 2, v = Math.random() * 0.5 + 0.04;
      const r = 175;
      pos[i * 3] = Math.cos(u) * Math.cos(v) * r;
      pos[i * 3 + 1] = Math.sin(v) * r + 10;
      pos[i * 3 + 2] = Math.sin(u) * Math.cos(v) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xdde6ff, size: 0.9, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.9 }));
    scene.add(stars);
  }
}
function makeLabel(text, color = "#e6b450") {
  const c = document.createElement("canvas"); c.width = 256; c.height = 64;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "rgba(10,8,6,0.65)"; ctx.fillRect(0, 0, 256, 64);
  ctx.font = "26px Georgia"; ctx.fillStyle = color; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, 128, 34, 240);
  const tex = new THREE.CanvasTexture(c);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  spr.scale.set(4, 1, 1);
  return spr;
}

/* ======================================================================== */
World.buildDistrict = function (id, spawnCenter) {
  // clear
  while (scene.children.length) scene.remove(scene.children[0]);
  interactables = []; labelSprites = []; focus = null;

  const g = State.data;
  const d = AXIOM.DISTRICTS[id];
  const rnd = mulberry32(hash(id));
  const theme = THEMES[id] || THEMES._default;
  currentDistrictId = id;
  inRegion = false; inInterior = false;

  scene.background = new THREE.Color(theme.sky);
  scene.fog = new THREE.Fog(theme.sky, theme.fogNear, theme.fogFar);
  scene.environment = (window.Assets && Assets.env) ? Assets.env : (Art ? Art.envMap(theme.sky, theme.ground, theme.texAccent) : null);
  scene.add(new THREE.HemisphereLight(theme.hemiSky, theme.hemiGround, theme.hemiInt));
  const sun = new THREE.DirectionalLight(theme.sun, theme.sunInt);
  sun.position.set(28, 46, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 140;
  sun.shadow.camera.left = -BOUND - 6; sun.shadow.camera.right = BOUND + 6;
  sun.shadow.camera.top = BOUND + 6; sun.shadow.camera.bottom = -BOUND - 6;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
  scene.add(sun);

  // sky dome + celestial body + stars at night
  buildSky(theme, g);

  // ground (procedurally textured per era)
  const groundMat = Art ? Art.groundMaterial(theme) : new THREE.MeshStandardMaterial({ color: theme.ground, roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(BOUND * 2 + 8, BOUND * 2 + 8), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  // perimeter wall (with gate gaps implied by short height)
  const ph = theme.wallH;
  const wallMat = Art ? Art.wallMaterial(theme) : new THREE.MeshStandardMaterial({ color: theme.wall, roughness: 1 });
  for (const [w, h, dz, x, y, z] of [
    [BOUND * 2, ph, 1, 0, ph / 2, -BOUND],
    [BOUND * 2, ph, 1, 0, ph / 2, BOUND],
    [1, ph, BOUND * 2, -BOUND, ph / 2, 0],
    [1, ph, BOUND * 2, BOUND, ph / 2, 0],
  ]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, dz), wallMat); m.position.set(x, y, z); scene.add(m); }

  // era architecture (textured with the district's building surface)
  currentBuildKind = BUILD_TEX[id] || null;
  theme.build(rnd, Engine.isNight(g));
  currentBuildKind = null;

  // night dimming + power outage flavour
  const night = Engine.isNight(g);

  /* ---- stations ---- */
  const inner = [];
  inner.push(station("eat",   "Food Vendor",  0x9c6b3a, (g) => Actions.eat(g)));
  inner.push(station("sleep", "Rest",         0x6b5030, (g) => Actions.sleep(g)));
  inner.push(station("work",  "Work",         0x7a6a48, (g) => Actions.work(g)));
  inner.push(station("explore","Explore",     0x5a7a5a, (g) => Actions.explore(g)));
  inner.push(station("train", "Training",     0x4a6a8a, () => ({ panel: "skills" })));
  if (AXIOM.MARKETS[id] && AXIOM.MARKETS[id].length)
    inner.push(station("market", "Market", 0xc8a050, () => ({ panel: "market" })));
  if (id === "god_quarter") inner.push(station("omen", "Omen Altar", 0xe6b450, (g) => Actions.omen(g)));
  if (g.aug && id === "neon_labyrinth") inner.push(station("clinic", "Aug Clinic", 0x38d0c8, (g) => Actions.tuneAug(g)));

  // place inner stations on a ring
  const R = 11;
  inner.forEach((s, i) => {
    const a = (i / inner.length) * Math.PI * 2 + 0.4;
    placeStation(s, Math.cos(a) * R, Math.sin(a) * R, theme);
  });

  // gates to adjacent districts on the perimeter (posts share the wall surface)
  currentBuildKind = BUILD_TEX[id] || null;
  const adj = AXIOM.ROUTES[id];
  adj.forEach((dest, i) => {
    const a = (i / adj.length) * Math.PI * 2;
    const gx = Math.cos(a) * (BOUND - 2.5), gz = Math.sin(a) * (BOUND - 2.5);
    const dd = AXIOM.DISTRICTS[dest];
    const locked = AXIOM.STATUS[g.status].rank < dd.minStatus;
    const s = station("gate", `${locked ? "🔒 " : "→ "}${dd.name}`, locked ? 0x7a3a3a : 0x3a6a7a,
      (gg) => Actions.travel(gg, dest));
    s.dest = dest;
    placeGate(s, gx, gz, a, theme, locked);
  });
  currentBuildKind = null;

  // populate the district with people, set the streets in motion, and surround
  // it with the vast city that stretches to the horizon in every direction
  spawnPeople(g, id, rnd);
  spawnTraffic(id, Engine.isNight(g));
  if (id !== "sub_strata") buildSurroundCity(theme, Engine.isNight(g));
  buildRoads(id);
  buildGroundTraffic(id, Engine.isNight(g));

  // a few enterable buildings at the walls — the reachable edge of the city
  // that stretches beyond this district
  if (id !== "god_quarter" && id !== "sub_strata") {
    const era = DISTRICT_ERA[id] || "market";
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2;
      const ex = Math.cos(a) * (BOUND - 3), ez = Math.sin(a) * (BOUND - 3);
      const bw = 3.5, bh = 5 + rnd() * 3;
      const office = i % 2 === 0;
      detailHouse(ex, ez, bw, bh, era, Engine.isNight(g), office);
      registerBuilding(ex, ez, bw, office ? "Outer-City Office" : "Outer-City Home", office ? "office" : "home", era);
    }
  }

  // the underworld has a presence in the criminal districts — fence & job board
  if (["ironwall", "neon_labyrinth", "sub_strata", "broken_crown"].includes(id)) {
    const ux = -6, uz = 9;
    box(0.18, 0.18, 0.18, 0xc0392b, ux, 2.2, uz, { emissive: 0xc0392b, ei: 1.3, tex: null });
    light(0xc0392b, 2.2, ux, 2.4, uz, 6);
    interactables.push({ type: "landmark", label: "The Underworld — fence goods & take jobs",
      pos: new THREE.Vector3(ux, 1, uz), radius: 4, mesh: null, run: () => { World.openCrime(); return {}; } });
  }

  // spawn
  if (spawnCenter) { player.pos.set(0, 1.7, 16); yaw = Math.PI; pitch = 0; }
  player.vel.set(0, 0, 0);

  if (window.GameAudio) GameAudio.setDistrict(id, Engine.isNight(g));
  World.updateHUD();
};

function station(type, label, color, run) { return { type, label, color, run }; }

/* ======================================================================== */
/* PEOPLE — anatomically-built humanoids that walk, react, and remember.    */
let agents = [];
const REACT = 7.5;        // distance at which a person notices and turns to you

/* Build a humanoid from torso/head/limbs with varied proportions. */
/* Shared low-poly primitives — rounded, not boxy. */
const GEO = {
  sphere: new THREE.SphereGeometry(1, 10, 8),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 12),     // unit, scaled per part
};
// soft round contact-shadow decal shared by all people
let CONTACT_TEX = null;
function contactShadow() {
  if (!CONTACT_TEX) {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const x = c.getContext("2d"); const g = x.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, "rgba(0,0,0,0.5)"); g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g; x.fillRect(0, 0, 64, 64); CONTACT_TEX = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3),
    new THREE.MeshBasicMaterial({ map: CONTACT_TEX, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.02; return m;
}
function meshOf(geo, mat, shadow) {
  const m = new THREE.Mesh(geo, mat);
  if (shadow !== false) { m.castShadow = true; m.receiveShadow = true; }
  return m;
}
/* a tapered limb segment (cylinder) from radius rTop..rBot over length len.
 * Human parts do not cast shadows individually (a contact shadow grounds them). */
function limb(mat, rTop, rBot, len) {
  return meshOf(new THREE.CylinderGeometry(rTop, rBot, len, 10), mat, false);
}
function ball(mat, r) { const m = meshOf(GEO.sphere, mat, false); m.scale.setScalar(r); return m; }
function ballE(mat, rx, ry, rz) { const m = meshOf(GEO.sphere, mat, false); m.scale.set(rx, ry, rz); return m; }

function makeHuman(ap) {
  // a loaded CC0 character model takes over if one is present (tinted by dress)
  if (window.Assets && Assets.model) {
    const m = Assets.model("character");
    if (m) {
      const grp = new THREE.Group(); m.position.y = m.userData.yOffset || 0; grp.add(m);
      m.traverse((o) => { if (o.isMesh && o.material) { o.material = o.material.clone(); if (o.material.color) o.material.color.setHex(ap.cloth); } });
      let s = 1; if (ap.build === "tall") s = 1.12; if (ap.build === "short") s = 0.86;
      grp.scale.setScalar(s); grp.add(contactShadow());
      const dummy = () => new THREE.Object3D();
      return { grp, parts: { llegPivot: dummy(), rlegPivot: dummy(), larmPivot: dummy(), rarmPivot: dummy(), lknee: dummy(), rknee: dummy(), lelbow: dummy(), relbow: dummy(), head: dummy() } };
    }
  }
  const grp = new THREE.Group();
  const weave = Art ? Art.detail("cloth", 2, 3) : null;
  const skin = new THREE.MeshStandardMaterial({ color: ap.skin, roughness: 0.7 });
  const hairM = new THREE.MeshStandardMaterial({ color: ap.hair, roughness: 0.85 });
  const cloth = new THREE.MeshStandardMaterial({ color: ap.cloth, roughness: 0.9, map: weave });
  const cloth2 = new THREE.MeshStandardMaterial({ color: ap.cloth2, roughness: 0.9, map: weave });
  const dark = new THREE.MeshStandardMaterial({ color: 0x140f0b, roughness: 0.6 });
  const belt = new THREE.MeshStandardMaterial({ color: shadeHex(ap.cloth2, 0.55), roughness: 0.7 });

  // proportions by build (radii, not box widths) — kept slender so they read human
  let chest = 0.155, waist = 0.12, arm = 0.05, leg = 0.072, belly = 0;
  if (ap.build === "thin")     { chest = 0.13;  waist = 0.10; arm = 0.043; leg = 0.062; }
  if (ap.build === "muscular") { chest = 0.185; waist = 0.135; arm = 0.066; leg = 0.086; }
  if (ap.build === "fat")      { chest = 0.20;  waist = 0.20; arm = 0.058; leg = 0.088; belly = 0.07; }
  const thighL = 0.50, shinL = 0.46, upArmL = 0.36, foreL = 0.34;
  const hipY = thighL + shinL + 0.1;          // pelvis height
  const torsoH = 0.62, shoulderY = hipY + torsoH;

  // ---- pelvis ----
  const pelvis = limb(cloth2, waist * 1.05, waist, 0.2); pelvis.position.y = hipY; grp.add(pelvis);
  const beltR = meshOf(new THREE.CylinderGeometry(waist * 1.1, waist * 1.1, 0.06, 14), belt); beltR.position.y = hipY + 0.1; grp.add(beltR);

  // ---- legs: hip pivot -> thigh, knee ball, shin, foot ----
  const legX = waist * 0.6;
  const mkLeg = (sx) => {
    const piv = new THREE.Object3D(); piv.position.set(sx, hipY, 0); grp.add(piv);
    const thigh = limb(cloth2, leg, leg * 0.8, thighL); thigh.position.y = -thighL / 2; piv.add(thigh);
    const knee = ball(cloth2, leg * 0.85); knee.position.y = -thighL; piv.add(knee);
    const shinPiv = new THREE.Object3D(); shinPiv.position.y = -thighL; piv.add(shinPiv);
    const shin = limb(cloth2, leg * 0.75, leg * 0.55, shinL); shin.position.y = -shinL / 2; shinPiv.add(shin);
    const ankle = ball(skin, leg * 0.5); ankle.position.y = -shinL; shinPiv.add(ankle);
    const foot = meshOf(new THREE.BoxGeometry(leg * 1.4, 0.08, 0.28), dark); foot.position.set(0, -shinL - 0.035, 0.08); shinPiv.add(foot);
    return { piv, knee: shinPiv };
  };
  const L = mkLeg(-legX), R = mkLeg(legX);

  // ---- torso (tapered shoulders->waist), subtle chest & optional belly ----
  const torso = limb(cloth, chest, waist, torsoH); torso.position.y = hipY + torsoH / 2; grp.add(torso);
  const cb = chest * 0.96;
  const chestBall = ballE(cloth, cb, cb * 0.66, cb * 0.72); chestBall.position.set(0, shoulderY - 0.14, 0.01); grp.add(chestBall);
  if (belly) { const wb = waist + belly; const b = ballE(cloth, wb, wb * 0.7, wb * 0.95); b.position.set(0, hipY + 0.16, 0.03); grp.add(b); }
  // shoulder yoke
  const yoke = ballE(cloth, chest * 1.25, chest * 0.4, chest * 0.7); yoke.position.y = shoulderY - 0.05; grp.add(yoke);

  // ---- arms: shoulder ball -> upper -> elbow -> forearm -> hand ----
  const shX = chest + arm * 0.7;
  const mkArm = (sx) => {
    const piv = new THREE.Object3D(); piv.position.set(sx, shoulderY - 0.06, 0); grp.add(piv);
    const shoulder = ball(cloth, arm * 1.25); piv.add(shoulder);
    const upper = limb(cloth, arm, arm * 0.9, upArmL); upper.position.y = -upArmL / 2; piv.add(upper);
    const elbowPiv = new THREE.Object3D(); elbowPiv.position.y = -upArmL; piv.add(elbowPiv);
    const elbow = ball(cloth, arm * 0.95); elbowPiv.add(elbow);
    const fore = limb(skin, arm * 0.85, arm * 0.7, foreL); fore.position.y = -foreL / 2; elbowPiv.add(fore);
    const hand = ballE(skin, arm * 1.1, arm * 1.32, arm * 0.77); hand.position.y = -foreL - 0.02; elbowPiv.add(hand);
    return { piv, elbow: elbowPiv };
  };
  const AL = mkArm(-shX), AR = mkArm(shX);

  // ---- neck + head + face + hair (per-person features) ----
  const browM = new THREE.MeshStandardMaterial({ color: ap.brow != null ? ap.brow : ap.hair, roughness: 0.85 });
  const eyeColMat = new THREE.MeshStandardMaterial({ color: ap.eye != null ? ap.eye : 0x3a2a18, roughness: 0.35 });
  const accentMat = new THREE.MeshStandardMaterial({ color: ap.accent != null ? ap.accent : ap.cloth2, roughness: 0.85, map: weave });

  const neck = limb(skin, 0.06, 0.07, 0.12); neck.position.y = shoulderY + 0.02; grp.add(neck);
  const head = new THREE.Group(); head.position.y = shoulderY + 0.28; grp.add(head);
  const skull = ballE(skin, 0.16 * 0.92, 0.16 * 1.05, 0.16); head.add(skull);
  const jaw = ballE(skin, 0.12 * 0.9, 0.12 * 0.8, 0.12 * 0.95); jaw.position.set(0, -0.08, 0.02); head.add(jaw);
  const nose = ball(skin, 0.035); nose.position.set(0, -0.02, 0.15); head.add(nose);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xf4f0e8, roughness: 0.4 });
  const eyeWhiteL = ballE(eyeMat, 0.035, 0.035, 0.018); eyeWhiteL.position.set(-0.06, 0.02, 0.13); head.add(eyeWhiteL);
  const eyeWhiteR = eyeWhiteL.clone(); eyeWhiteR.position.x = 0.06; head.add(eyeWhiteR);
  const irisL = ball(eyeColMat, 0.022); irisL.position.set(-0.06, 0.02, 0.15); head.add(irisL);
  const irisR = irisL.clone(); irisR.position.x = 0.06; head.add(irisR);
  const pupilL = ball(dark, 0.011); pupilL.position.set(-0.06, 0.02, 0.162); head.add(pupilL);
  const pupilR = pupilL.clone(); pupilR.position.x = 0.06; head.add(pupilR);
  // eyebrows
  const ebL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.02), browM); ebL.position.set(-0.06, 0.06, 0.15); head.add(ebL);
  const ebR = ebL.clone(); ebR.position.x = 0.06; head.add(ebR);

  // facial hair
  if (ap.facial === "beard" || ap.facial === "goatee") {
    const bd = ballE(hairM, 0.12, ap.facial === "goatee" ? 0.06 : 0.11, 0.1); bd.position.set(0, -0.1, 0.06); head.add(bd);
  }
  if (ap.facial === "stubble") { const st = ballE(hairM, 0.115, 0.07, 0.095); st.position.set(0, -0.1, 0.05); st.material = new THREE.MeshStandardMaterial({ color: ap.hair, roughness: 1, transparent: true, opacity: 0.4 }); head.add(st); }
  if (ap.facial === "mustache" || ap.facial === "beard") { const ms = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.02, 0.02), hairM); ms.position.set(0, -0.045, 0.15); head.add(ms); }

  // hair by style
  const style = ap.hairStyle || "short";
  if (style !== "bald") {
    const cap = ballE(hairM, 0.168, 0.168 * 0.85, 0.168); cap.position.set(0, 0.05, -0.01); head.add(cap);
    if (style === "short" || style === "cropped") { const b = ballE(hairM, 0.15, 0.12, 0.105); b.position.set(0, 0.01, -0.08); head.add(b); }
    if (style === "long") { const b = ballE(hairM, 0.16, 0.26, 0.12); b.position.set(0, -0.12, -0.07); head.add(b); }
    if (style === "wild") { for (let k = 0; k < 5; k++) { const t = ball(hairM, 0.05); t.position.set((Math.random() - 0.5) * 0.28, 0.12 + Math.random() * 0.08, (Math.random() - 0.5) * 0.2); head.add(t); } }
    if (style === "topknot") { const k = ball(hairM, 0.06); k.position.set(0, 0.2, -0.02); head.add(k); }
  }

  // headwear
  const hwMat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, map: weave });
  switch (ap.headwear) {
    case "hood": { const h = ballE(accentMat, 0.2, 0.2, 0.2); h.position.set(0, 0.04, -0.04); head.add(h);
      const back = ballE(accentMat, 0.18, 0.22, 0.12); back.position.set(0, -0.05, -0.12); head.add(back); break; }
    case "cap": { const c = ballE(hwMat(shadeHex(ap.cloth, 0.7)), 0.17, 0.09, 0.17); c.position.set(0, 0.12, 0); head.add(c);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.16), hwMat(shadeHex(ap.cloth, 0.6))); brim.position.set(0, 0.1, 0.13); head.add(brim); break; }
    case "helmet": { const h = ballE(new THREE.MeshStandardMaterial({ color: 0x6a6660, roughness: 0.4, metalness: 0.6 }), 0.19, 0.2, 0.19); h.position.set(0, 0.04, 0); head.add(h); break; }
    case "turban": { const tu = ballE(hwMat(ap.accent), 0.2, 0.16, 0.2); tu.position.set(0, 0.1, 0); head.add(tu); break; }
    case "veil": { const v = ballE(accentMat, 0.19, 0.24, 0.16); v.position.set(0, -0.02, -0.06); v.material.transparent = true; v.material.opacity = 0.85; head.add(v); break; }
    case "fur": { const f = ballE(hwMat(0x4a3a28), 0.21, 0.16, 0.21); f.position.set(0, 0.12, 0); head.add(f); break; }
    case "skullcap": { const sc = ballE(hwMat(ap.accent), 0.165, 0.1, 0.165); sc.position.set(0, 0.13, 0); head.add(sc); break; }
    case "visor": { const v = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.06), new THREE.MeshStandardMaterial({ color: 0x101018, emissive: ap.accent, emissiveIntensity: 0.8 })); v.position.set(0, 0.03, 0.15); head.add(v); break; }
    case "earpiece": { const e = ball(new THREE.MeshStandardMaterial({ color: 0x202028, emissive: 0x38d0c8, emissiveIntensity: 0.6 }), 0.03); e.position.set(0.15, 0, 0.04); head.add(e); break; }
    case "lamp": { const l = ball(new THREE.MeshStandardMaterial({ color: 0x4dff9a, emissive: 0x4dff9a, emissiveIntensity: 1.4 }), 0.04); l.position.set(0, 0.14, 0.12); head.add(l); break; }
    case "mohawk": { for (let k = 0; k < 4; k++) { const m = ballE(hwMat(ap.accent), 0.03, 0.12, 0.05); m.position.set(0, 0.16, 0.06 - k * 0.05); head.add(m); } break; }
    case "scarf": { const s = ballE(accentMat, 0.18, 0.1, 0.18); s.position.set(0, 0.04, -0.04); head.add(s); break; }
  }

  // neck scarf
  if (ap.scarf) { const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 10), accentMat); sc.position.y = shoulderY - 0.02; grp.add(sc); }
  // back cloak
  if (ap.cloak) { const ck = new THREE.Mesh(new THREE.BoxGeometry(chest * 2.2, torsoH + 0.5, 0.08), accentMat); ck.position.set(0, hipY + torsoH / 2, -chest - 0.05); ck.castShadow = false; grp.add(ck); }

  grp.add(contactShadow());

  // overall scale for tall/short
  let s = 1; if (ap.build === "tall") s = 1.16; if (ap.build === "short") s = 0.84;
  grp.scale.setScalar(s);

  return {
    grp,
    parts: {
      llegPivot: L.piv, rlegPivot: R.piv, lknee: L.knee, rknee: R.knee,
      larmPivot: AL.piv, rarmPivot: AR.piv, lelbow: AL.elbow, relbow: AR.elbow,
      head, torso: grp,
    },
  };
}

/* Spawn the named principals + ambient residents as walking agents. */
function spawnPeople(g, id, rnd) {
  agents = [];
  const metas = [];
  for (const def of Engine.npcAt(g, id)) {
    metas.push({ id: def.id, name: def.name, role: def.role, kind: def.kind,
      faction: def.faction, district: id, ambient: false, hub: def.hub,
      originName: "Ur-Axiom", personality: People.namedPersonality(def.id),
      appear: People.namedAppearance(def) });
  }
  for (const m of People.ambientFor(id)) metas.push(m);

  metas.forEach((meta, i) => {
    const built = makeHuman(meta.appear);
    const a = (i / metas.length) * Math.PI * 2 + rnd() * 0.5;
    const r = 8 + rnd() * 12;
    built.grp.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    built.grp.rotation.y = rnd() * Math.PI * 2;
    scene.add(built.grp);

    // floating name tag
    const known = (g.met && g.met[meta.id]);
    const tag = makeLabel(meta.name, meta.ambient ? "#cdbf9a" : "#e6b450");
    tag.position.set(0, 2.05 / built.grp.scale.x, 0); tag.scale.set(3.4, 0.85, 1);
    built.grp.add(tag);

    const agent = {
      meta, grp: built.grp, parts: built.parts,
      facing: built.grp.rotation.y, target: pickWander(rnd),
      speed: 1.2 + rnd() * 0.8, phase: rnd() * 6.28, amp: 0,
      state: "wander", greeted: false,
    };
    agents.push(agent);

    // interactable shares the agent's live position
    interactables.push({
      type: "npc", label: `Speak with ${meta.name}`, pos: built.grp.position,
      radius: 3.3, mesh: null, meta, agent,
      run: () => { openDialogue(meta, agent); return {}; },
    });
  });
}

/* ======================================================================== */
/* INTERIORS — walk-in, multi-floor buildings. Each room has a function, and
 * the function is the reason the room exists.                               */
let floorLabels = [];
function placeInteriorStation(s, x, z, baseY, floor) {
  const m = box(1.0, 1.1, 1.0, s.color, x, baseY + 0.55, z, { emissive: s.color, ei: 0.3, tex: null });
  light(s.color, 4, x, baseY + 2.2, z, 7);
  const lbl = makeLabel(s.label, "#" + new THREE.Color(s.color).getHexString());
  lbl.position.set(x, baseY + 1.7, z); scene.add(lbl); labelSprites.push(lbl);
  floorLabels.push({ spr: lbl, floor });
  interactables.push({ type: s.itype || "station", label: s.label, floor,
    pos: new THREE.Vector3(x, baseY + 1, z), radius: ACTIVATE, mesh: m, run: s.run });
}
function setInteriorFloorVis() {
  for (const fl of floorLabels) fl.spr.visible = (fl.floor === currentFloor);
}

function spawnInteriorNPC(meta, x, z, baseY, floor, facing) {
  const built = makeHuman(meta.appear || People.namedAppearance(meta));
  built.grp.position.set(x, baseY, z);
  built.grp.rotation.y = facing || 0;
  scene.add(built.grp);
  const tag = makeLabel(meta.name, meta.ambient ? "#cdbf9a" : "#e6b450");
  tag.position.set(0, 2.05 / built.grp.scale.x, 0); tag.scale.set(3.4, 0.85, 1);
  built.grp.add(tag);
  const agent = { meta, grp: built.grp, parts: built.parts, facing: facing || 0,
    target: built.grp.position.clone(), speed: 0, phase: Math.random() * 6.28, amp: 0,
    state: "idle", greeted: false, stationary: true, floor, baseY };
  agents.push(agent);
  interactables.push({ type: "npc", label: `Speak with ${meta.name}`, floor,
    pos: built.grp.position, radius: 3.3, mesh: null, meta, agent,
    run: () => { openDialogue(meta, agent); return {}; } });
}

function changeFloor(target) {
  currentFloor = target; currentFloorY = target * FLOOR_H;
  player.pos.set(INNER - 4, currentFloorY + 1.7, INNER - 4);
  setInteriorFloorVis();
  updateFocus();
}

/* ======================================================================== */
/* WORLD REGIONS — travel beyond Ur-Axiom to the territories of the world.    */
function addWanderer(meta, x, z) {
  const built = makeHuman(meta.appear || People.appearance(mulberry32(hash(meta.id))(), meta.faction, meta.kind));
  built.grp.position.set(x, 0, z); built.grp.rotation.y = Math.random() * 6.28; scene.add(built.grp);
  const tag = makeLabel(meta.name, "#cdbf9a"); tag.position.set(0, 2.05 / built.grp.scale.x, 0); tag.scale.set(3.4, 0.85, 1); built.grp.add(tag);
  const agent = { meta, grp: built.grp, parts: built.parts, facing: built.grp.rotation.y,
    target: pickWander(), speed: 1.0 + Math.random() * 0.8, phase: Math.random() * 6.28, amp: 0, state: "wander", greeted: false };
  agents.push(agent);
  interactables.push({ type: "npc", label: `Speak with ${meta.name}`, pos: built.grp.position, radius: 3.3, mesh: null, meta, agent, run: () => { openDialogue(meta, agent); return {}; } });
}

const REGION_ORDER = ["ur_basin", "haze_coast", "obsidian", "delta", "steppe", "fracture", "holds", "deep_south"];
const REGION_INFO = {
  ur_basin: { name: "The Ur Basin", days: 1, tag: "ancient heartland", kind: "laborer", goods: ["grain", "fish", "water"],
    lore: "The alluvial flatland around the City, irrigated by canals maintained for four millennia because no government survives letting them fail. Geography is fate here; families have worked these plots beyond counting.",
    theme: { sky: 0x3a2c1c, ground: 0xb59668, tex: "sand", rep: 14, hemiSky: 0xffe0b0, hemiGround: 0x5a4530, hemiInt: 0.7, sun: 0xffd9a0, sunInt: 1.1, fogNear: 22, fogFar: 130 },
    build(rnd) {
      for (let i = 0; i < 16; i++) { const x = (rnd() - 0.5) * 72, z = (rnd() - 0.5) * 72; if (Math.hypot(x, z) < 8) continue; const h = 3 + rnd() * 5; box(3, h, 3, rnd() > 0.5 ? 0x9a7a52 : 0x8a6e4a, x, h / 2, z, { tex: "brick" }); }
      for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(90, 3), new THREE.MeshStandardMaterial({ color: 0x3a5a6a, roughness: 0.2, metalness: 0.3 })); m.rotation.x = -Math.PI / 2; m.position.set(0, 0.03, -24 + i * 22); m.receiveShadow = true; scene.add(m); }
    } },
  haze_coast: { name: "The Haze Coast", days: 3, tag: "cyberpunk industry", kind: "augmented", goods: ["parts", "stim", "augkit"],
    lore: "A two-hundred-kilometre industrial megaplex where most of the world's goods are made and most of its makers live in conditions the corporations call 'dynamic'. The sea is the colour of lead; the resistance here is organised and very hard to kill.",
    theme: { sky: 0x4a4a46, ground: 0x3a3a38, tex: "concrete", rep: 12, hemiSky: 0x9a9a96, hemiGround: 0x222020, hemiInt: 0.5, sun: 0xb0b0a8, sunInt: 0.5, fogNear: 14, fogFar: 90 },
    build(rnd) {
      for (let i = 0; i < 10; i++) { const x = (rnd() - 0.5) * 72, z = (rnd() - 0.5) * 72; if (Math.hypot(x, z) < 8) continue; const h = 8 + rnd() * 14; cyl(1.2, 1.7, h, new THREE.MeshStandardMaterial({ color: 0x44464a, roughness: 0.8, metalness: 0.3 }), x, h / 2, z); const sm = ball(new THREE.MeshStandardMaterial({ color: 0x6a6a6a, transparent: true, opacity: 0.5, roughness: 1 }), 1.6); sm.position.set(x, h + 1.6, z); scene.add(sm); }
      const cc = [0x8a3a3a, 0x3a6a8a, 0x6a8a3a, 0x8a7a3a];
      for (let i = 0; i < 22; i++) box(2.4, 2, 5, cc[(rnd() * cc.length) | 0], (rnd() - 0.5) * 72, 1, (rnd() - 0.5) * 72, { tex: "panel", metal: 0.3 });
    } },
  obsidian: { name: "The Obsidian Highlands", days: 4, tag: "cold highland", kind: "soldier", goods: ["relic", "parts"],
    lore: "Mountainous, cold, and culturally sealed — named for the volcanic glass quarried here for ten thousand years. The highland clans have refused political submission for the whole recorded history of the City's expansion, at enormous cost, because they understand what follows submission.",
    theme: { sky: 0x2a2e3a, ground: 0x2a2a30, tex: "stone", rep: 10, hemiSky: 0x9aa6c0, hemiGround: 0x202028, hemiInt: 0.5, sun: 0xc0d0e0, sunInt: 0.7, fogNear: 12, fogFar: 80 },
    build(rnd) {
      for (let i = 0; i < 18; i++) { const x = (rnd() - 0.5) * 74, z = (rnd() - 0.5) * 74; if (Math.hypot(x, z) < 6) continue; const h = 4 + rnd() * 11; const m = new THREE.Mesh(new THREE.ConeGeometry(2 + rnd() * 2, h, 5), new THREE.MeshStandardMaterial({ color: rnd() > 0.7 ? 0x14141a : 0x2a2a32, roughness: 0.7, metalness: 0.25 })); m.position.set(x, h / 2, z); m.castShadow = true; m.receiveShadow = true; scene.add(m); }
    } },
  delta: { name: "The Delta Provinces", days: 3, tag: "water city-states", kind: "merchant", goods: ["fish", "water", "cloth"],
    lore: "A patchwork of semi-autonomous city-states at the mouth of the great river, connected by water and a dizzying variety of governments. Those that took corporate technology early are productive and dependent; those that refused kept their independence and pay for it.",
    theme: { sky: 0x3a4a4a, ground: 0x223230, tex: "stone", rep: 10, hemiSky: 0xa0c0c0, hemiGround: 0x1a2826, hemiInt: 0.6, sun: 0xd0e0e0, sunInt: 0.8, fogNear: 16, fogFar: 100 },
    build(rnd) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(180, 180), new THREE.MeshStandardMaterial({ color: 0x2a4a4a, roughness: 0.18, metalness: 0.45 })); w.rotation.x = -Math.PI / 2; w.position.y = 0.08; scene.add(w);
      for (let i = 0; i < 14; i++) { const x = (rnd() - 0.5) * 64, z = (rnd() - 0.5) * 64; if (Math.hypot(x, z) < 6) continue; for (const [dx, dz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) box(0.16, 1.8, 0.16, 0x4a3a28, x + dx, 0.9, z + dz, { tex: null }); box(2.2, 1.3, 2.2, 0x6a5236, x, 2.1, z, { tex: "plank" }); box(2.6, 0.2, 2.6, 0x3a3630, x, 2.85, z, { tex: "panel", metal: 0.3 }); }
    } },
  steppe: { name: "The Eastern Steppe", days: 5, tag: "nomad grassland", kind: "nomad", goods: ["grain", "cloth"],
    lore: "The largest landmass in the world and the least governed — grassland crossed by nomadic confederations whose seasonal routes are the real political map. They do not value money; they value horses, intelligence, and demonstrated personal capability.",
    theme: { sky: 0x6a7a8a, ground: 0x6a7a4a, tex: "sand", rep: 16, hemiSky: 0xcfe0f0, hemiGround: 0x4a5a30, hemiInt: 0.8, sun: 0xfff4d8, sunInt: 1.2, fogNear: 30, fogFar: 150 },
    build(rnd) {
      for (let i = 0; i < 16; i++) { const x = (rnd() - 0.5) * 78, z = (rnd() - 0.5) * 78; if (Math.hypot(x, z) < 6) continue; const d = ball(new THREE.MeshStandardMaterial({ color: 0xcdbf9a, roughness: 0.9 }), 1.7); d.scale.set(1, 0.7, 1); d.position.set(x, 1.05, z); d.castShadow = true; scene.add(d); box(0.4, 0.6, 0.4, 0x6a5236, x, 0.3, z + 1.6, { tex: null }); }
      for (let i = 0; i < 6; i++) { const x = (rnd() - 0.5) * 70, z = (rnd() - 0.5) * 70; box(0.5, 0.6, 1.4, 0x5a4030, x, 1.0, z, { tex: null }); box(0.4, 0.7, 0.3, 0x5a4030, x, 1.3, z + 0.8, { tex: null }); for (const lz of [-0.5, 0.5]) { box(0.14, 0.7, 0.14, 0x3a2a1a, x - 0.18, 0.35, z + lz, { tex: null }); box(0.14, 0.7, 0.14, 0x3a2a1a, x + 0.18, 0.35, z + lz, { tex: null }); } }
    } },
  fracture: { name: "The Fracture Zone", days: 4, tag: "ruined cyber-infra", kind: "vagrant", goods: ["parts", "contraband", "stim"],
    lore: "What rapid corporate development looks like after the development stops and the consequences arrive. Infrastructure built for thirty years, now in its fiftieth with no maintenance and no responsible owner. The most creative place in the world — because broken systems make people who can rebuild them.",
    theme: { sky: 0x3a3440, ground: 0x3a3a3a, tex: "concrete", rep: 12, hemiSky: 0x8a86a0, hemiGround: 0x1a1820, hemiInt: 0.45, sun: 0x9a8aff, sunInt: 0.5, fogNear: 12, fogFar: 78 },
    build(rnd) {
      for (let i = 0; i < 8; i++) { const x = (rnd() - 0.5) * 70, z = (rnd() - 0.5) * 70; box(6, 0.8, 16, 0x44423e, x, 6, z, { tex: "concrete" }); box(1, 6, 1, 0x3a3834, x - 2, 3, z - 6, { tex: "concrete" }); box(1, 6, 1, 0x3a3834, x + 2, 3, z + 6, { tex: "concrete" }); if (rnd() > 0.5) box(0.2, 1.4, 1.2, 0x38d0c8, x + 3, 7, z, { emissive: 0x38d0c8, ei: 1.2, tex: null }); }
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(180, 180), new THREE.MeshStandardMaterial({ color: 0x1a2426, roughness: 0.3, metalness: 0.4 })); fl.rotation.x = -Math.PI / 2; fl.position.y = 0.06; scene.add(fl);
    } },
  holds: { name: "The Northern Holds", days: 5, tag: "feudal forest", kind: "soldier", goods: ["cloth", "relic"],
    lore: "Dense temperate forest broken by stone keeps and river-valley trade routes. The noble families resist modernisation not from ignorance but from a sophisticated understanding that the corporations' kind of modernisation means subordination. Their castles can still withstand a siege — a non-incidental fact.",
    theme: { sky: 0x3a4a3a, ground: 0x2a3a22, tex: "stone", rep: 12, hemiSky: 0xaacaa0, hemiGround: 0x1a2616, hemiInt: 0.6, sun: 0xd8e0c0, sunInt: 0.8, fogNear: 14, fogFar: 88 },
    build(rnd) {
      for (let i = 0; i < 26; i++) { const x = (rnd() - 0.5) * 80, z = (rnd() - 0.5) * 80; if (Math.hypot(x, z) < 5) continue; cyl(0.3, 0.45, 3, new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.9 }), x, 1.5, z); const c = ball(new THREE.MeshStandardMaterial({ color: rnd() > 0.5 ? 0x2a5a2a : 0x366a30, roughness: 0.9 }), 2.2); c.scale.set(1, 1.3, 1); c.position.set(x, 4.6, z); c.castShadow = true; scene.add(c); }
      box(9, 13, 9, 0x55524c, 18, 6.5, -12, { tex: "concrete" }); for (let m = 0; m < 4; m++) box(2, 1, 2, 0x46443e, 18 - 3 + (m % 2) * 6, 13.5, -12 - 3 + ((m / 2) | 0) * 6, { tex: "concrete" });
    } },
  deep_south: { name: "The Deep South Kingdoms", days: 6, tag: "golden empires", kind: "merchant", goods: ["relic", "cloth", "grain"],
    lore: "Among the wealthiest and most politically sophisticated states in the world — and the most systematically underestimated, a misunderstanding they have spent centuries learning to leverage. Their merchant networks, the Dyula, reach every corner of the map; the corporations who think they manage the relationship have misidentified who manages whom.",
    theme: { sky: 0x5a3a1a, ground: 0x8a6a42, tex: "brick", rep: 13, hemiSky: 0xffd8a0, hemiGround: 0x4a3018, hemiInt: 0.75, sun: 0xffdc90, sunInt: 1.1, fogNear: 20, fogFar: 120 },
    build(rnd) {
      box(34, 5, 3, 0x6a5236, 0, 2.5, -24, { tex: "brick" }); box(3, 5, 34, 0x6a5236, -24, 2.5, 0, { tex: "brick" });
      for (let i = 0; i < 12; i++) { const x = (rnd() - 0.5) * 60, z = (rnd() - 0.5) * 60; if (Math.hypot(x, z) < 8) continue; const h = 4 + rnd() * 7; box(4, h, 4, 0x7a6042, x, h / 2, z, { tex: "brick" }); box(0.7, 0.7, 0.7, 0xc8a030, x, h + 0.35, z, { emissive: 0x6a5010, ei: 0.5, tex: null }); }
    } },
};

World.buildRegion = function (id) {
  inRegion = true; currentRegion = id;
  const info = REGION_INFO[id]; const g = State.data;
  while (scene.children.length) scene.remove(scene.children[0]);
  interactables = []; agents = []; vehicles = []; cityTraffic = null; cityTrafficData = []; labelSprites = []; floorLabels = []; focus = null;

  const th = info.theme;
  const themeLike = { sky: th.sky, ground: th.ground, wall: th.ground, tex: th.tex, groundRepeat: th.rep, seed: hash(id), texAccent: th.sun, skyTop: shadeHex(th.sky, 0.6) };
  scene.background = new THREE.Color(th.sky);
  scene.fog = new THREE.Fog(th.sky, th.fogNear, th.fogFar);
  scene.environment = (window.Assets && Assets.env) ? Assets.env : (Art ? Art.envMap(th.sky, th.ground) : null);
  scene.add(new THREE.HemisphereLight(th.hemiSky, th.hemiGround, th.hemiInt));
  const sun = new THREE.DirectionalLight(th.sun, th.sunInt);
  sun.position.set(28, 46, 18); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 160; sun.shadow.camera.left = -90; sun.shadow.camera.right = 90; sun.shadow.camera.top = 90; sun.shadow.camera.bottom = -90; sun.shadow.bias = -0.0006; scene.add(sun);
  buildSky(themeLike, g);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), Art ? Art.groundMaterial(themeLike) : new THREE.MeshStandardMaterial({ color: th.ground }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  const rnd = mulberry32(hash("region:" + id));
  info.build(rnd);

  // region residents
  const fac = info.kind === "nomad" ? "steppe" : "none";
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + rnd(); const r = 8 + rnd() * 10; addWanderer(People.onePerson("reg:" + id + ":" + i, info.kind, fac, "ur_basin"), Math.cos(a) * r, Math.sin(a) * r); }

  // landmark + stations
  const sx = 0, sz = -10;
  box(2, 2.4, 2, th.sun, sx, 1.2, sz, { emissive: th.sun, ei: 0.4, tex: null }); light(th.sun, 5, sx, 2.5, sz, 18);
  interactables.push({ type: "landmark", label: `Examine ${info.name}`, pos: new THREE.Vector3(sx, 1, sz), radius: 4, mesh: null, run: examine(info.name, info.lore, "world") });
  const ST = (label, color, x, z, run) => interactables.push({ type: "station", label, color, pos: new THREE.Vector3(x, 1, z), radius: ACTIVATE, mesh: box(1.1, 1.2, 1.1, color, x, 0.6, z, { emissive: color, ei: 0.3, tex: null }), run });
  ST("Scout the region", 0x5a7a5a, -8, 4, (g) => Actions.scout(g, info.name, info.goods));
  ST("Make camp & rest", 0x6b5030, 8, 4, (g) => Actions.sleep(g));
  ST("Trade with locals", 0xc8a050, 8, -4, () => { World.openRegionMarket(id); return {}; });
  ST("Train navigation", 0x4a6a8a, -8, -4, () => ({ panel: "skills" }));
  // return gate
  const gx = 0, gz = BOUND - 3;
  box(0.8, 5, 0.8, th.ground, gx - 2, 2.5, gz, { rough: 1 }); box(0.8, 5, 0.8, th.ground, gx + 2, 2.5, gz, { rough: 1 }); box(5.2, 0.8, 1, 0x3a6a7a, gx, 5.2, gz, { emissive: 0x3a6a7a, ei: 0.5, tex: null });
  const lbl = makeLabel("→ Return to Ur-Axiom", "#9ad"); lbl.position.set(gx, 6.4, gz); lbl.scale.set(6, 1.4, 1); scene.add(lbl); labelSprites.push(lbl);
  interactables.push({ type: "return", label: "Return to Ur-Axiom", pos: new THREE.Vector3(gx, 1, gz - 1.5), radius: ACTIVATE + 1, mesh: null, run: () => { World.returnRegion(); return {}; } });

  player.pos.set(0, 1.7, 16); yaw = Math.PI; pitch = 0; player.vel.set(0, 0, 0);
  if (window.GameAudio) GameAudio.setDistrict("region", Engine.isNight(g));
  World.updateHUD();
};

/* The underworld: fence goods and take jobs to climb the criminal ladder. */
World.openCrime = function () {
  if (document.pointerLockElement) document.exitPointerLock();
  const g = State.data;
  const rank = Engine.underworldRank(g), standing = Engine.underworldStanding(g);
  let html = `<h2>The Underworld</h2>`;
  html += `<p class="muted small">Your standing is the only currency the families trust. Heat is the price. Rise far enough and the city's locks open for you.</p>`;
  html += `<div style="display:flex;justify-content:space-between;align-items:center;margin:8px 0 12px">
    <span><b style="color:var(--bad)">${Engine.RANKS[rank]}</b> <span class="muted small">· standing ${standing} · heat ${Math.round(g.heat || 0)}</span></span>
    <button class="ghost" onclick="window.World3D.fenceGoods()">Fence hot goods</button></div>`;
  html += `<div style="max-height:46vh;overflow-y:auto">`;
  for (const job of AXIOM.CRIME_JOBS) {
    const locked = rank < job.minRank;
    html += `<div style="padding:8px 0;border-bottom:1px solid var(--line)">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
        <span><b style="color:${locked ? "var(--muted)" : "var(--sand)"}">${job.name}</b> <span class="muted small">· ${job.skill} · ${job.payMin}–${job.payMax}sh · heat ${job.heat}</span></span>
        ${locked ? `<span class="muted small">needs ${Engine.RANKS[job.minRank]}</span>` : `<button class="primary" onclick="window.World3D.takeCrimeJob('${job.id}')">Take job</button>`}
      </div><div class="muted small" style="margin-top:3px">${job.desc}</div></div>`;
  }
  html += `</div>`;
  UI.modal(html);
};
World.takeCrimeJob = function (id) {
  UI.closeModal();
  const g = State.data; const res = Actions.crimeJob(g, id);
  if (res && res.msg) toast(res.msg, res.kind);
  if (typeof Story !== "undefined" && Story.check) Story.check(g);
  State.save(); World.updateHUD();
  if (g.over) UI.gameOver(g);
};
World.fenceGoods = function () {
  UI.closeModal();
  const g = State.data; const res = Actions.fence(g);
  if (res && res.msg) toast(res.msg, res.kind);
  State.save(); World.updateHUD();
};

/* A region's own market — different prices from the City. Buy what's produced
 * cheap here, carry it to where it's wanted dear. The Dyula's whole craft. */
World.openRegionMarket = function (regionId) {
  if (document.pointerLockElement) document.exitPointerLock();
  const g = State.data; const econ = AXIOM.REGION_ECON[regionId] || {};
  const info = REGION_INFO[regionId] || { name: regionId };
  const goods = Array.from(new Set([].concat(econ.produces || [], econ.wants || [], ["grain", "water", "parts"])));
  let html = `<h2>Trade — ${info.name}</h2><p class="muted small">${econ.barter ? "These people value goods over coin; your shekels buy little here. Trade what you carry." : "Local prices. What's made here is cheap; what they lack is dear."}</p>`;
  for (const id of goods) {
    const price = Engine.regionPrice(g, id, regionId);
    const sell = Math.max(1, Math.round(price * (econ.barter ? 0.5 : 0.9)));
    const tagP = (econ.produces || []).includes(id) ? '<span class="muted small">· local</span>' : (econ.wants || []).includes(id) ? '<span style="color:var(--warn)" class="small">· in demand</span>' : "";
    html += `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--line)">
      <span>${AXIOM.GOODS[id].name} ${tagP}</span>
      <span><span class="muted small">buy ${price} · sell ${sell}${(g.inventory[id] || 0) ? ` (have ${g.inventory[id]})` : ""}</span>
        <button class="ghost mini" onclick="window.World3D.regionBuy('${regionId}','${id}')">buy</button>
        <button class="ghost mini" onclick="window.World3D.regionSell('${regionId}','${id}')">sell</button></span></div>`;
  }
  UI.modal(html);
};
World.regionBuy = function (regionId, id) {
  const g = State.data; const cost = Engine.regionPrice(g, id, regionId);
  if (g.money < cost) { toast(`You can't afford ${AXIOM.GOODS[id].name} (${cost}).`, "warn"); return; }
  g.money -= cost; g.inventory[id] = (g.inventory[id] || 0) + 1;
  g.economy[id] = Engine.clamp((g.economy[id] || 1) * 1.01, 0.4, 4);
  Engine.style(g, "commerce", 1); State.save(); World.updateHUD(); World.openRegionMarket(regionId);
};
World.regionSell = function (regionId, id) {
  const g = State.data; if ((g.inventory[id] || 0) <= 0) { toast("You have none of those.", "warn"); return; }
  const econ = AXIOM.REGION_ECON[regionId] || {};
  const price = Math.max(1, Math.round(Engine.regionPrice(g, id, regionId) * (econ.barter ? 0.5 : 0.9)));
  g.inventory[id]--; g.money += price; g.economy[id] = Engine.clamp((g.economy[id] || 1) * 0.99, 0.4, 4);
  Engine.style(g, "commerce", 1); State.save(); World.updateHUD(); World.openRegionMarket(regionId);
};

World.openRegions = function () {
  if (document.pointerLockElement) document.exitPointerLock();
  let html = `<h2>The Caravanserai</h2><p class="muted small">Beyond Ur-Axiom lie the territories of the world. Travel is real — measured in days, paid in food and risk. Eat and rest before you set out.</p>`;
  for (const id of REGION_ORDER) { const r = REGION_INFO[id]; html += `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--line)"><span><b style="color:var(--sand)">${r.name}</b> <span class="muted small">· ${r.days} days · ${r.tag}</span></span><button class="primary" onclick="window.World3D.travelToRegion('${id}')">Travel</button></div>`; }
  UI.modal(html);
};

World.travelToRegion = function (id) {
  UI.closeModal();
  const g = State.data, info = REGION_INFO[id]; if (!info || g.over) return;
  if (!inRegion) returnFromRegion = g.here;
  Engine.advance(g, info.days * 9);
  g.fatigue = Engine.clamp(g.fatigue + info.days * 5, 0, 120);
  Engine.push(g, `You set out for ${info.name} — ${info.days} day${info.days > 1 ? "s" : ""} on the road. The City falls away behind you.`, "travel");
  if (Math.random() < 0.25) {
    if (Math.random() < 0.5) { Engine.injure(g, "road exhaustion", 1); }
    else { const loss = Math.min(g.money, 8 + Engine.rand(24)); g.money -= loss; Engine.push(g, `Bandits on the road relieve you of ${loss} shekels.`, "warn"); }
  }
  if (g.over) { UI.gameOver(g); return; }
  World.buildRegion(id);
  State.save();
};

World.returnRegion = function () {
  const g = State.data, info = REGION_INFO[currentRegion] || { days: 2 };
  Engine.advance(g, info.days * 9);
  g.fatigue = Engine.clamp(g.fatigue + info.days * 5, 0, 120);
  inRegion = false; const back = returnFromRegion || "hanging_market"; currentRegion = null;
  Engine.push(g, "You make the long journey back to Ur-Axiom.", "travel");
  if (g.over) { UI.gameOver(g); return; }
  World.buildDistrict(back, true);
  State.save();
};

function namedMeta(id, district) {
  const def = Engine.NPC_DEFS.find((d) => d.id === id); if (!def) return null;
  return { id: def.id, name: def.name, role: def.role, kind: def.kind, faction: def.faction,
    district, ambient: false, hub: def.hub, originName: "Ur-Axiom",
    personality: People.namedPersonality(def.id), appear: People.namedAppearance(def) };
}

/* Interior blueprints. Every room states why it exists and gives you something
 * to do that belongs there — the floor IS the reason. */
/* ======================================================================== */
/* PROCEDURAL INTERIORS — so EVERY building is enterable and furnished.       */
const ERA_PAL = {
  ancient:   { wood: 0x7a5a30, cloth: 0xb8a070, accent: 0xc89a55, metal: 0x6a5236, screen: 0xc89a55, glow: false, fire: true },
  medieval:  { wood: 0x3a2a1a, cloth: 0x6a5236, accent: 0x8a6a3a, metal: 0x44423e, screen: 0xff7a30, glow: false, fire: true },
  market:    { wood: 0x6a5030, cloth: 0x9a4a2a, accent: 0xb0962b, metal: 0x7a6a3a, screen: 0xc8a050, glow: false, fire: true },
  cyber:     { wood: 0x2a2a34, cloth: 0x3a3a4a, accent: 0xff5c7a, metal: 0x22222a, screen: 0x38d0c8, glow: true, fire: false },
  corporate: { wood: 0xc8d0da, cloth: 0x9aaaba, accent: 0x88c0ff, metal: 0xdfe4ea, screen: 0xbfe2ff, glow: true, fire: false },
};
const ERA_ENV = {
  ancient:   { floorTex: "brick", floorColor: 0x8a6e4a, wallTex: "brick", wallColor: 0x6a5238, sky: 0x1a130c, hemi: 0x7a6648 },
  medieval:  { floorTex: "concrete", floorColor: 0x44423e, wallTex: "concrete", wallColor: 0x33312e, sky: 0x141414, hemi: 0x8a8680 },
  market:    { floorTex: "plank", floorColor: 0x6a5030, wallTex: "brick", wallColor: 0x6a5838, sky: 0x1c160e, hemi: 0x8a7450 },
  cyber:     { floorTex: "panel", floorColor: 0x1c1c26, wallTex: "panel", wallColor: 0x16161f, sky: 0x06060c, hemi: 0x303048 },
  corporate: { floorTex: "marble", floorColor: 0xdfe4ea, wallTex: "marble", wallColor: 0xc8ccd2, sky: 0x9ab0c8, hemi: 0xdfe8f0 },
};

/* ---- furniture pieces (decoration) ---- */
function _fxBed(x, z, y, p) {
  box(1.2, 0.3, 2.2, p.wood, x, y + 0.15, z, { tex: null, rough: 0.9 });
  box(1.1, 0.2, 2.0, p.cloth, x, y + 0.4, z, { tex: null, rough: 0.95 });
  box(1.0, 0.16, 0.4, shadeHex(p.cloth, 1.3), x, y + 0.52, z - 0.8, { tex: null });
}
function _fxTable(x, z, y, p) {
  box(1.4, 0.1, 0.9, p.wood, x, y + 0.75, z, { tex: null, rough: 0.8 });
  box(0.3, 0.7, 0.3, shadeHex(p.wood, 0.8), x, y + 0.38, z, { tex: null });
}
function _fxChair(x, z, y, p, rot) {
  const s = box(0.42, 0.1, 0.42, p.wood, x, y + 0.45, z, { tex: null });
  const b = box(0.42, 0.5, 0.08, p.wood, x, y + 0.7, z - 0.17, { tex: null });
  s.rotation.y = rot || 0; b.rotation.y = rot || 0;
}
function _fxShelf(x, z, y, p) {
  box(1.4, 2.0, 0.3, shadeHex(p.wood, 0.85), x, y + 1.0, z, { tex: null, rough: 0.9 });
  const bk = [0x9a3a3a, 0x3a6a8a, 0x8a8a4a, 0x4a7a5a, 0xa06a3a];
  for (let r = 0; r < 3; r++) for (let i = 0; i < 5; i++)
    box(0.16, 0.34, 0.18, bk[(Math.random() * bk.length) | 0], x - 0.55 + i * 0.27, y + 0.55 + r * 0.55, z + 0.02, { tex: null });
}
function _fxRug(x, z, y, p) { box(2.6, 0.03, 1.9, p.accent, x, y + 0.03, z, { tex: null, rough: 1 }); }
function _fxConsole(x, z, y, p) {
  box(1.5, 0.8, 0.7, p.metal, x, y + 0.4, z, { tex: "panel", metal: 0.4 });
  box(1.0, 0.6, 0.06, p.screen, x, y + 1.1, z + 0.3, { emissive: p.screen, ei: p.glow ? 1.2 : 0.5, tex: null });
}
function _fxHearth(x, z, y, p) {
  box(1.4, 1.2, 0.5, p.metal, x, y + 0.6, z, { tex: "stone" });
  box(0.8, 0.4, 0.3, 0xff7a25, x, y + 0.3, z + 0.15, { emissive: 0xff6a10, ei: 1.4, tex: null });
  light(0xff7a30, 4, x, y + 0.6, z + 0.4, 8);
}
function _fxPlant(x, z, y, p) {
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.3, 8), new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9 }));
  pot.position.set(x, y + 0.15, z); scene.add(pot);
  const f = ball(new THREE.MeshStandardMaterial({ color: 0x2a6a3a, roughness: 0.9 }), 0.28); f.position.set(x, y + 0.5, z); scene.add(f);
}
function _fxArt(x, z, y, p, faceZ) { box(0.9, 0.7, 0.05, p.accent, x, y + 2.4, z, { tex: "cloth" }); }
function _fxCrate(x, z, y) { box(0.7, 0.7, 0.7, 0x6a5236, x, y + 0.35, z, { tex: "plank" }); }
function _fxLamp(x, z, y, p) { box(0.16, 0.16, 0.16, p.screen, x, y + 1.6, z, { emissive: p.screen, ei: 1.2, tex: null }); light(p.screen, 3, x, y + 1.6, z, 8); }
function _fxWardrobe(x, z, y, p) { box(1.2, 2.0, 0.6, shadeHex(p.wood, 0.8), x, y + 1.0, z, { tex: null, rough: 0.85 }); box(0.05, 1.2, 0.05, p.accent, x, y + 1.0, z + 0.32, { tex: null }); }
function _fxStove(x, z, y, p) { box(0.8, 0.9, 0.7, p.metal, x, y + 0.45, z, { tex: p.glow ? "panel" : "stone", metal: 0.3 }); box(0.6, 0.2, 0.5, 0xff7a25, x, y + 0.95, z, { emissive: 0xff6a10, ei: 1.1, tex: null }); }
function _fxStool(x, z, y, p) { box(0.3, 0.45, 0.3, p.wood, x, y + 0.22, z, { tex: null }); box(0.34, 0.08, 0.34, shadeHex(p.wood, 1.2), x, y + 0.46, z, { tex: null }); }
function _fxWorkbench(x, z, y, p) { box(1.6, 0.9, 0.7, p.metal, x, y + 0.45, z, { tex: "panel", metal: 0.3 }); for (let i = 0; i < 3; i++) box(0.18, 0.18, 0.18, [0xb0452b, 0x2b7ab0, 0x2bb06a][i], x - 0.5 + i * 0.5, y + 1.0, z, { tex: null }); }
function _fxBarrel(x, z, y) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.8, 10), new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.85 })); m.position.set(x, y + 0.4, z); scene.add(m); }

/* Furnish a room by its function. Anchors hug the walls so the floor stays
 * walkable; the station ring (r~7.5) and the door (+z) are kept clear. */
function furnishRoom(room, y, era, floorDef) {
  const p = ERA_PAL[era] || ERA_PAL.cyber;
  const W = INNER - 2;                                   // wall anchor distance
  // a few wall slots away from the entrance side (+z)
  const A = [[-W, -W + 3], [W, -W + 3], [-W, 2], [W, 2], [0, -W]];
  const at = (i) => A[i % A.length];
  if (room === "office") {
    let s = at(0); _fxConsole(s[0], s[1], y, p);
    s = at(2); _fxConsole(s[0], s[1], y, p);
    s = at(1); _fxShelf(s[0], s[1], y, p);
    _fxChair(-W + 1, -W + 3.6, y, p, Math.PI); _fxChair(W - 1, -W + 3.6, y, p, Math.PI);
    _fxRug(0, -2, y, p); _fxPlant(W - 1, -W + 1, y, p);
    s = at(4); _fxArt(s[0], -INNER + 0.4, y, p);
    _fxLamp(0, -3, y, p);
  } else if (room === "shop") {
    box(5, 1.0, 1.0, p.wood, 0, y + 0.5, -2, { tex: "plank" });           // counter
    for (let i = 0; i < 4; i++) box(0.32, 0.32, 0.32, [0xb0452b, 0x2b7ab0, 0x2bb06a, 0xb0962b][i], -1.5 + i, y + 1.15, -2, { tex: null });
    let s = at(0); _fxShelf(s[0], s[1], y, p); s = at(1); _fxShelf(s[0], s[1], y, p);
    _fxCrate(-W + 1, 3, y); _fxCrate(W - 1, 3, y);
    _fxArt(0, -INNER + 0.4, y, p); if (p.glow) _fxLamp(0, -2, y, p);
  } else if (room === "bedroom") {
    _fxBed(-W + 1.5, -W + 3, y, p); _fxShelf(W, 0, y, p); _fxRug(-W + 2, 0, y, p);
    _fxArt(0, -INNER + 0.4, y, p); _fxPlant(W - 1, -W + 1, y, p);
    if (p.fire) _fxHearth(W, -W + 3, y, p); else _fxLamp(0, -3, y, p);
  } else if (room === "storeroom") {
    for (let i = 0; i < 8; i++) _fxCrate((Math.random() - 0.5) * (W * 1.4), -W + 2 + Math.random() * (W), y);
    let s = at(1); _fxShelf(s[0], s[1], y, p);
  } else { // living / hall — a furnished home with a kitchen nook
    _fxRug(0, -2, y, p); _fxTable(0, -2, y, p);
    _fxChair(-1.1, -2, y, p, Math.PI / 2); _fxChair(1.1, -2, y, p, -Math.PI / 2);
    let s = at(0); _fxShelf(s[0], s[1], y, p);
    s = at(1); if (p.fire) _fxHearth(s[0], s[1], y, p); else _fxConsole(s[0], s[1], y, p);
    s = at(2); _fxBed(s[0], s[1], y, p);
    _fxStove(W - 1.2, -W + 2, y, p); _fxStool(W - 2.6, -W + 2, y, p);   // kitchen nook
    _fxWardrobe(-W + 1, 4, y, p);
    _fxPlant(W - 1, -W + 1, y, p); _fxArt(0, -INNER + 0.4, y, p);
    if (p.glow) _fxLamp(W - 1, 2, y, p);
  }
  // a little lived-in clutter, randomized so no two rooms are identical
  const clutter = 2 + ((Math.random() * 3) | 0);
  for (let i = 0; i < clutter; i++) {
    const cx = (Math.random() - 0.5) * (W * 1.6), cz = -W + 2 + Math.random() * (W * 1.2);
    if (Math.abs(cx) < 2.5 && Math.abs(cz + 2) < 2.5) continue; // keep the centre clear
    const r = Math.random();
    if (r < 0.4) _fxCrate(cx, cz, y);
    else if (r < 0.65) _fxBarrel(cx, cz, y);
    else if (r < 0.85) _fxStool(cx, cz, y, p);
    else _fxPlant(cx, cz, y, p);
  }
}

/* Generate a furnished interior spec for any building, by type + era. The
 * occasional resident is a distinct generated individual you can talk to. */
function genInterior(type, era, seed) {
  const rnd = mulberry32((seed >>> 0) || 7);
  const env = ERA_ENV[era] || ERA_ENV.cyber;
  const district = currentDistrictId || "broken_crown";
  const faction = (window.People && People.districtFaction[district]) || "none";
  const resident = (kind, chance) => (rnd() < (chance == null ? 0.5 : chance) && window.People)
    ? [People.onePerson(seed + ":" + kind, kind, faction, district)] : [];
  const ST = (label, color, run) => ({ label, color, run });
  const rest = ST("Rest here", 0x6b5030, (g) => Actions.sleep(g));
  const search = ST("Search the room", 0x5a7a5a, (g) => Actions.search(g));
  const work = ST("Work at the desk", 0x4a6a8a, (g) => Actions.work(g));
  const shop = ST("Browse the wares", 0xc8a050, () => ({ panel: "market" }));
  const eat = ST("Eat something", 0x9c6b3a, (g) => Actions.eat(g));
  let title, floors;
  if (type === "office") {
    title = era === "corporate" ? "Corporate Office" : "Office";
    floors = [{ name: "Office Floor", room: "office", stations: [work, search], npcs: resident("scribe", 0.6) }];
    if (rnd() > 0.45) floors.push({ name: "Upper Office", room: "office", stations: [work], npcs: resident("scribe", 0.4) });
  } else if (type === "shop") {
    title = "Shopfront";
    floors = [{ name: "Shop Floor", room: "shop", stations: [shop, search], npcs: resident("merchant", 0.7) }];
    if (rnd() > 0.6) floors.push({ name: "Storeroom", room: "storeroom", stations: [search] });
  } else {
    title = type === "tenement" ? "Tenement" : "Residence";
    const homeKind = era === "ancient" ? "devotee" : era === "cyber" ? "augmented" : "laborer";
    floors = [{ name: "Living Quarters", room: "living", stations: [rest, eat, search], npcs: resident(homeKind, 0.45) }];
    if (rnd() > 0.5) floors.push({ name: "Bedroom", room: "bedroom", stations: [rest, search], npcs: resident(homeKind, 0.3) });
  }
  return Object.assign({ title, floors, era }, env);
}

/* Make a placed building enterable: a door marker + an interaction zone. */
function registerBuilding(x, z, w, label, type, era) {
  const pal = ERA_PAL[era] || ERA_PAL.cyber;
  const dc = pal.glow ? pal.screen : 0xffcf80;
  box(1.0, 1.9, 0.14, dc, x, 0.95, z + w / 2 + 0.07, { emissive: dc, ei: pal.glow ? 0.9 : 0.4, tex: null });
  interactables.push({
    type: "enter", label: `Enter — ${label}`, pos: new THREE.Vector3(x, 1, z + w / 2 + 1),
    radius: Math.max(3, w / 2 + 2), mesh: null,
    run: () => { World.enterBuilding(genInterior(type, era, (x * 73 + z * 31) | 0)); return {}; },
  });
}

function buildSpec(kind, district) {
  const g = State.data;
  const ST = (label, color, run, itype) => ({ label, color, run, itype });
  const buy = (id) => (g) => Actions.buy(g, id);
  const market = { label: "Trade at the counter", color: 0xc8a050, run: () => ({ panel: "market" }) };

  switch (kind) {
    case "temple": return {
      title: "The Grand Ziggurat", floorTex: "brick", floorColor: 0x8a6e4a, wallTex: "brick", wallColor: 0x6a5238, sky: 0x1a130c, hemi: 0x7a6648,
      floors: [
        { name: "Offering Hall", stations: [ST("Pray", 0xffcf80, (g) => Actions.pray(g)), ST("Buy blessed bread", 0xc89a55, buy("bread")), ST("Examine the votive walls", 0x9a8a6a, examine("Votive Walls", "Four thousand years of offerings, layered plaster over plaster. The oldest are illegible; people still leave new ones, because the gods here are not metaphors and the omens are accurate at rates chance does not produce."))] },
        { name: "Scriptorium", stations: [ST("Copy prayer-records (work)", 0x7a6a48, (g) => Actions.work(g)), ST("Study rhetoric", 0x4a6a8a, () => ({ panel: "skills" }))], npcs: [namedMeta("priest", district)].filter(Boolean) },
        { name: "Summit Sanctum", stations: [ST("Pray at the summit", 0xffcf80, (g) => Actions.pray(g)), ST("Examine the off-star doorway", 0xe6b450, examine("The Off-Star Doorway", "One doorway here is oriented to no star anyone tracks now — it points at a horizon position the sky held thousands of years before the Crown was built. Someone aligned it to a memory.", "fragment"))] },
      ],
    };
    case "bazaar": return {
      title: "The Hanging Market Hall", floorTex: "brick", floorColor: 0x9a8458, wallTex: "brick", wallColor: 0x6a5838, sky: 0x1c160e, hemi: 0x8a7450,
      floors: [
        { name: "Raw Goods", stations: [ST("Buy grain", 0xb0962b, buy("grain")), ST("Buy river fish", 0x2b7ab0, buy("fish")), ST("Buy clean water", 0x2bb06a, buy("water")), ST("Haggle a shift (work)", 0x7a6a48, (g) => Actions.work(g))] },
        { name: "Manufactured Goods", stations: [ST("Buy cloth", 0xb0452b, buy("cloth")), ST("Buy salvage parts", 0x7a2bb0, buy("parts")), market] },
        { name: "Luxury & Information", stations: [ST("Buy a clay tablet", 0xe6b450, buy("relic")), ST("Examine the information brokers", 0x9aa6c0, examine("The Brokers' Gallery", "The upper terrace sells what the lower ones cannot: rumor, leverage, the location of a debtor. Every trade route in the world terminates somewhere below, and all of it is known up here, for a price."))], npcs: [namedMeta("arbiter", district)].filter(Boolean) },
      ],
    };
    case "clinic": return {
      title: "Back-room Aug Clinic", floorTex: "panel", floorColor: 0x1c1c26, wallTex: "panel", wallColor: 0x16161f, sky: 0x05050a, hemi: 0x303048,
      floors: [
        { name: "Triage", stations: [ST("Treat a wound", 0x5a7a5a, (g) => Actions.treat(g)), ST("Rest in recovery", 0x6b5030, (g) => Actions.sleep(g)), ST("Buy a medical kit", 0x38d0c8, buy("stim"))], npcs: [namedMeta("fixer", district)].filter(Boolean) },
        { name: "Aug Bay", stations: [ST("Service augmentation", 0x38d0c8, (g) => Actions.tuneAug(g)), ST("Buy aug coolant", 0xc850ff, buy("augkit")), ST("Examine the parts wall", 0xff5c7a, examine("The Parts Wall", "Components from three incompatible manufacturers, sorted by what fails first. Corporate augments are clean and warrantied; everything here is cheaper, more creative, and fails in ways from inconvenient to disfiguring."))] },
      ],
    };
    case "spire": return {
      title: "Meridian Tower", floorTex: "marble", floorColor: 0xdfe4ea, wallTex: "marble", wallColor: 0xc8ccd2, sky: 0x9ab0c8, hemi: 0xffffff,
      floors: [
        { name: "Lobby", stations: [ST("Pass the biometric checkpoint", 0x88c0ff, examine("Biometric Lobby", "Genuinely clean, in a city where almost nothing is. Citizens here are corporate employees with contractual residences — lose the job, lose the home in thirty days. The anxiety is part of the product.")), ST("Buy clean stim", 0x9aaaba, buy("stim"))] },
        { name: "Open-plan Offices", stations: [ST("Contract clerical work", 0x7a8a9a, (g) => Actions.work(g)), ST("Study negotiation", 0x4a6a8a, () => ({ panel: "skills" }))] },
        { name: "Executive Suite", stations: [ST("Examine the above-the-smog view", 0xbfe2ff, examine("Above the Smog", "These floors sit above the city's permanent haze; clear sky and real sunlight, paid for deliberately in the architectural brief while the population below breathes the rest."))], npcs: [namedMeta("exec", district)].filter(Boolean) },
      ],
    };
    case "keep": return {
      title: "The Kol Keep", floorTex: "concrete", floorColor: 0x44423e, wallTex: "concrete", wallColor: 0x33312e, sky: 0x141414, hemi: 0x9a9690,
      floors: [
        { name: "Great Hall", stations: [ST("Examine the family banners", 0xff7a30, examine("The Family Banners", "Eight hundred years of a warlord line that became criminal organisation, private militia, political faction, and aristocracy at once. Three of their children sit in the city's legal government."))], npcs: [namedMeta("warlord", district)].filter(Boolean) },
        { name: "Armory", stations: [ST("Buy contraband", 0xc0392b, buy("contraband")), ST("Buy salvage parts", 0x7a6a48, buy("parts")), ST("Drill with the blade", 0x4a6a8a, () => ({ panel: "skills" }))] },
      ],
    };
    case "council": return {
      title: "The Council House", floorTex: "plank", floorColor: 0x6a5236, wallTex: "plank", wallColor: 0x4a3f33, sky: 0x18120c, hemi: 0xd0b088,
      floors: [
        { name: "Council Room", stations: [ST("Examine the dispute ledger", 0x38d0c8, examine("The Dispute Ledger", "Neighborhood councils, resource committees, and dispute-resolution bodies manage what the city refuses to. More responsive than anything official, because the people running it live here.")), ST("Petition for work", 0x5a7a5a, (g) => Actions.work(g))], npcs: [namedMeta("councilor", district)].filter(Boolean) },
        { name: "Infirmary", stations: [ST("Treat a wound", 0x5a7a5a, (g) => Actions.treat(g)), ST("Buy clean water", 0x2bb06a, buy("water"))], npcs: [namedMeta("doctor", district)].filter(Boolean) },
      ],
    };
  }
  return { title: "Building", floors: [{ name: "Ground Floor", stations: [] }] };
}

World.enterBuilding = function (spec) {
  inInterior = true; interiorSpec = spec; returnDistrict = State.data.here;
  currentFloor = 0; currentFloorY = 0;
  while (scene.children.length) scene.remove(scene.children[0]);
  interactables = []; agents = []; vehicles = []; cityTraffic = null; cityTrafficData = []; labelSprites = []; floorLabels = []; focus = null;

  const sky = spec.sky != null ? spec.sky : 0x14110d;
  scene.background = new THREE.Color(sky);
  scene.fog = new THREE.Fog(sky, 14, 46);
  scene.environment = (window.Assets && Assets.env) ? Assets.env : (Art ? Art.envMap(sky, spec.floorColor || 0x3a332a) : null);
  scene.add(new THREE.HemisphereLight(spec.hemi || 0x6a6660, 0x100d0a, 0.55));
  const sun = new THREE.DirectionalLight(0xfff0d8, 0.25); sun.position.set(8, 20, 6); scene.add(sun);

  const nF = spec.floors.length;
  const floorMat = () => new THREE.MeshStandardMaterial({ color: spec.floorColor || 0x4a3f33, roughness: 1,
    map: Art && Art.detail(spec.floorTex || "stone", 6, 6), normalMap: Art && Art.detailNormal(spec.floorTex || "stone", 6, 6) });
  const wallMat = new THREE.MeshStandardMaterial({ color: spec.wallColor || 0x3a332a, roughness: 1,
    map: Art && Art.detail(spec.wallTex || "stone", 4, 2), normalMap: Art && Art.detailNormal(spec.wallTex || "stone", 4, 2) });

  for (let f = 0; f < nF; f++) {
    const baseY = f * FLOOR_H;
    const floorDef = spec.floors[f];
    // slab
    const slab = new THREE.Mesh(new THREE.BoxGeometry(INNER * 2 + 1, 0.3, INNER * 2 + 1), floorMat());
    slab.position.set(0, baseY - 0.15, 0); slab.receiveShadow = true; scene.add(slab);
    // perimeter walls (with a doorway gap on the ground floor entrance side)
    const wh = FLOOR_H;
    const seg = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat); m.position.set(x, y, z); m.receiveShadow = true; m.castShadow = true; scene.add(m); };
    seg(INNER * 2, wh, 0.4, 0, baseY + wh / 2, -INNER);                       // back
    seg(0.4, wh, INNER * 2, -INNER, baseY + wh / 2, 0);                       // left
    seg(0.4, wh, INNER * 2, INNER, baseY + wh / 2, 0);                        // right
    if (f === 0) { // front wall with a door gap in the middle
      seg(INNER - 1.5, wh, 0.4, -(INNER + 1.5) / 2 - 0.25, baseY + wh / 2, INNER);
      seg(INNER - 1.5, wh, 0.4, (INNER + 1.5) / 2 + 0.25, baseY + wh / 2, INNER);
      seg(3, wh - 2.4, 0.4, 0, baseY + wh - (wh - 2.4) / 2, INNER);          // lintel above door
    } else {
      seg(INNER * 2, wh, 0.4, 0, baseY + wh / 2, INNER);
    }
    // ceiling for the top floor
    if (f === nF - 1) { const c = new THREE.Mesh(new THREE.BoxGeometry(INNER * 2 + 1, 0.3, INNER * 2 + 1), wallMat); c.position.set(0, baseY + wh - 0.15, 0); scene.add(c); }
    // a couple of interior partition stubs to suggest rooms
    seg(0.3, wh - 0.6, 8, -2, baseY + (wh - 0.6) / 2, -INNER + 6);
    seg(8, wh - 0.6, 0.3, INNER - 6, baseY + (wh - 0.6) / 2, 2);
    // lighting per floor
    light(0xffe2b0, 7, 0, baseY + wh - 0.6, 0, 24);
    light(0xffe2b0, 4, -7, baseY + 2.4, -6, 12);
    light(0xffe2b0, 4, 7, baseY + 2.4, 6, 12);
    // floor label banner
    const fl = makeLabel(`${f + 1}F · ${floorDef.name}`, "#e6b450");
    fl.position.set(0, baseY + wh - 0.5, -INNER + 0.6); fl.scale.set(6, 1.4, 1); scene.add(fl);
    floorLabels.push({ spr: fl, floor: f });

    // stations on this floor (arranged on a ring)
    const st = floorDef.stations || [];
    st.forEach((s, i) => {
      const ang = (i / Math.max(1, st.length)) * Math.PI * 1.4 - Math.PI * 0.7;
      const r = 7.5;
      placeInteriorStation(s, Math.cos(ang) * r, Math.sin(ang) * r - 1, baseY, f);
    });
    // furnish & decorate the room according to its type and era
    furnishRoom(floorDef.room || "hall", baseY, spec.era || "cyber", floorDef);
    // resident NPCs on this floor
    (floorDef.npcs || []).forEach((meta, i) => {
      spawnInteriorNPC(meta, -8 + i * 5, -INNER + 4, baseY, f, 0);
    });

    // stairs up / down at a back corner
    const sx = -INNER + 3.5, sz = -INNER + 3.5;
    if (f < nF - 1) {
      for (let k = 0; k < 6; k++) box(2.4, 0.3, 0.7, 0x5a4a38, sx, baseY + 0.15 + k * 0.5, sz + k * 0.6, { tex: "stone" });
      interactables.push({ type: "stairs", label: `Go up — ${spec.floors[f + 1].name}`, floor: f,
        pos: new THREE.Vector3(sx, baseY + 1, sz + 1.8), radius: 3, mesh: null,
        run: () => { changeFloor(f + 1); return { msg: `You climb to the ${spec.floors[f + 1].name}.`, kind: "travel" }; } });
    }
    if (f > 0) {
      interactables.push({ type: "stairs", label: `Go down — ${spec.floors[f - 1].name}`, floor: f,
        pos: new THREE.Vector3(INNER - 4, baseY + 1, INNER - 4), radius: 3, mesh: null,
        run: () => { changeFloor(f - 1); return { msg: `You descend to the ${spec.floors[f - 1].name}.`, kind: "travel" }; } });
      box(1.6, 0.2, 1.6, 0x4a3f33, INNER - 4, baseY + 0.1, INNER - 4, { tex: "stone" });
    }
  }

  // exit door on the ground floor
  box(3, FLOOR_H - 0.4, 0.2, 0x2a2018, 0, FLOOR_H / 2 - 0.2, INNER - 0.1, { emissive: 0x1a1208, ei: 0.2, tex: null });
  interactables.push({ type: "exit", label: `Step outside — ${AXIOM.DISTRICTS[returnDistrict].name}`, floor: 0,
    pos: new THREE.Vector3(0, 1, INNER - 1.5), radius: 3.2, mesh: null,
    run: () => { World.exitBuilding(); return {}; } });

  player.pos.set(0, 1.7, INNER - 3); yaw = Math.PI; pitch = 0;
  setInteriorFloorVis();
  if (window.GameAudio) GameAudio.setDistrict("interior", false);
  World.updateHUD();
};

World.exitBuilding = function () {
  inInterior = false; interiorSpec = null; currentFloor = 0; currentFloorY = 0;
  World.buildDistrict(returnDistrict, true);
};

/* Rebuild the scene in place (used when optional assets finish loading). */
World.rebuildCurrent = function () {
  if (!started) return;
  if (inRegion && currentRegion) World.buildRegion(currentRegion);
  else if (inInterior && interiorSpec) World.enterBuilding(interiorSpec);
  else if (State.data) World.buildDistrict(State.data.here, false);
};

/* test/debug hooks */
World._agentCount = () => agents.length;
World._agentPositions = () => agents.map((a) => [a.grp.position.x.toFixed(2), a.grp.position.z.toFixed(2), a.state]);
World._openFirstDialogue = () => { if (agents[0]) openDialogue(agents[0].meta, agents[0]); };
World._landmarks = () => interactables.filter((i) => i.type === "landmark").map((i) => i.label);
World._gotoLandmark = (n) => {
  const ls = interactables.filter((i) => i.type === "landmark"); const it = ls[n || 0]; if (!it) return null;
  player.pos.set(it.pos.x, 1.7, it.pos.z + 1.5); yaw = Math.PI; updateFocus();
  return focus ? focus.label : null;
};
World._focusLabel = () => focus ? focus.label : null;
World._dbgYaw = () => yaw;
World._pos = () => [+player.pos.x.toFixed(2), +player.pos.z.toFixed(2)];
World._keyDown = (c) => !!keys[c];
World._tp = (x, z, y) => { player.pos.set(x, 1.7, z); if (y !== undefined) yaw = y; };
World._pokeSocial = () => { for (const a of agents) if (!a.partner) a.socialCD = 0; };
World._freecam = (x, y, z, yw, pt) => { freeCam = true; player.pos.set(x, y, z); yaw = yw; pitch = pt; };
World._agentStates = () => agents.map((a) => a.state);
World._vehicles = () => vehicles.map((v) => [v.grp.position.x.toFixed(1), v.grp.position.z.toFixed(1), v.kind || (v.drone ? "drone" : "?")]);
World._cityCars = () => cityTrafficData.length;
World._enterables = () => interactables.filter((i) => i.type === "enter").map((i) => i.label);
World._enterFirst = () => { const e = interactables.filter((i) => i.type === "enter")[0]; if (e) { e.run(); return e.label; } return null; };
World._goto = (type, n) => {
  const list = interactables.filter((i) => i.type === type && (i.floor === undefined || i.floor === currentFloor));
  const it = list[n || 0]; if (!it) return null;
  player.pos.set(it.pos.x, currentFloorY + 1.7, it.pos.z + 1.2); updateFocus();
  return focus ? focus.label : null;
};
World._stations = () => interactables.filter((i) => (i.floor === undefined || i.floor === currentFloor) && (i.type === "station" || i.type === "exit" || i.type === "stairs" || i.type === "npc")).map((i) => i.type + ":" + i.label);
World._floor = () => currentFloor;
World._inInterior = () => inInterior;
World._inspect = (i) => { const a = agents[i || 0]; if (!a) return; a.grp.position.set(0, 0, 0);
  a.state = "frozen"; a.facing = a.grp.rotation.y = Math.PI * 0.82;
  player.pos.set(0, 1.62, 3.3); yaw = Math.PI; pitch = -0.06; };

World._bbox = (i) => {
  const a = agents[i || 0]; if (!a) return null;
  const b = new THREE.Box3().setFromObject(a.grp);
  const s = new THREE.Vector3(); b.getSize(s);
  return { min: [b.min.x.toFixed(2), b.min.y.toFixed(2), b.min.z.toFixed(2)],
           max: [b.max.x.toFixed(2), b.max.y.toFixed(2), b.max.z.toFixed(2)],
           size: [s.x.toFixed(2), s.y.toFixed(2), s.z.toFixed(2)],
           children: a.grp.children.length };
};

function pickWander(rnd) {
  const r = (rnd ? rnd() : Math.random());
  const a = (rnd ? rnd() : Math.random()) * Math.PI * 2;
  const rad = 6 + r * (BOUND - 9);
  return new THREE.Vector3(Math.cos(a) * rad, 0, Math.sin(a) * rad);
}

// Two NPCs strike up a conversation: they pair off, walk together, and chat.
function breakPair(ag) {
  const pr = ag.partner;
  ag.partner = null; ag.talkT = 0; ag.socialCD = 4 + Math.random() * 5;
  if (pr && pr.partner === ag) { pr.partner = null; pr.talkT = 0; pr.socialCD = 4 + Math.random() * 5; }
}
function maybeSocialise(ag) {
  if (ag.partner) return;
  if (ag.socialCD == null) { ag.socialCD = 2 + Math.random() * 5; return; }
  if (ag.socialCD > 0) return;
  ag.socialCD = 5 + Math.random() * 6;
  const gp = ag.grp.position;
  for (const o of agents) {
    if (o === ag || o.partner || o.state === "react" || o.state === "frozen" || o.floor !== ag.floor) continue;
    const od = Math.hypot(o.grp.position.x - gp.x, o.grp.position.z - gp.z);
    const reach = (ag.stationary || o.stationary) ? 2.6 : 8;  // can't walk over if rooted
    if (od > 1.0 && od < reach) {
      if (Math.hypot(player.pos.x - o.grp.position.x, player.pos.z - o.grp.position.z) < REACT) continue;
      const t = 4 + Math.random() * 6;
      ag.partner = o; o.partner = ag; ag.talkT = o.talkT = t;
      return;
    }
  }
}

function updateAgents(dt) {
  const dlgAgent = World._dialog && World._dialog.agent;
  for (const ag of agents) {
    if (ag.socialCD != null && !ag.partner) ag.socialCD -= dt;  // tick conversation cooldown
    if (ag.state === "frozen") { // inspector pose: gentle idle only
      ag.idle = (ag.idle || 0) + dt; const br = Math.sin(ag.idle * 1.6) * 0.04;
      ag.parts.larmPivot.rotation.x = br; ag.parts.rarmPivot.rotation.x = -br;
      continue;
    }
    const gp = ag.grp.position;
    const dxp = player.pos.x - gp.x, dzp = player.pos.z - gp.z;
    const distP = Math.hypot(dxp, dzp);
    const sameFloor = (ag.floor === undefined || ag.floor === currentFloor);
    let moving = false, targetFacing = ag.facing;
    ag.gesture = 0;

    // the player always takes priority over chatting with a neighbour
    const playerNear = sameFloor && (ag === dlgAgent || distP < REACT);
    if (playerNear && ag.partner) breakPair(ag);

    if (playerNear) {
      // react to your approach: stop and turn to face you
      ag.state = "react";
      targetFacing = Math.atan2(dxp, dzp);
      if (!ag.greeted) ag.greeted = true;
    } else if (ag.partner) {
      // socialising with another NPC: close the gap, then face them and talk
      const pr = ag.partner, pgp = pr.grp.position;
      const dx = pgp.x - gp.x, dz = pgp.z - gp.z, d = Math.hypot(dx, dz) || 1;
      targetFacing = Math.atan2(dx, dz);
      if (!agents.includes(pr)) { breakPair(ag); }
      else if (d > 2.1 && !ag.stationary) {
        const step = ag.speed * 0.8 * dt; gp.x += dx / d * step; gp.z += dz / d * step;
        moving = true; ag.state = "approach";
      } else {
        ag.state = "talk"; ag.gesture = 1; ag.talkT -= dt; if (ag.talkT <= 0) breakPair(ag);
      }
    } else if (ag.stationary) {
      ag.state = "idle"; targetFacing = ag.facing;
      maybeSocialise(ag);
    } else {
      ag.state = "wander";
      // brief pauses make wandering read as natural, not robotic
      if (ag.pause > 0) { ag.pause -= dt; targetFacing = ag.facing; }
      else {
        const dx = ag.target.x - gp.x, dz = ag.target.z - gp.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.0) { ag.target = pickWander(); ag.pause = Math.random() < 0.5 ? 0.6 + Math.random() * 2.2 : 0; }
        else {
          const step = ag.speed * dt;
          gp.x += (dx / d) * step; gp.z += (dz / d) * step;
          moving = true; targetFacing = Math.atan2(dx, dz);
        }
      }
      maybeSocialise(ag);
    }

    // smooth turn
    let df = targetFacing - ag.facing;
    while (df > Math.PI) df -= Math.PI * 2; while (df < -Math.PI) df += Math.PI * 2;
    ag.facing += df * Math.min(1, dt * 8);
    ag.grp.rotation.y = ag.facing;

    const P = ag.parts;
    // gait: hips/shoulders counter-swing; knees & elbows bend on the back-swing
    const targetAmp = moving ? 0.6 : 0;
    ag.amp += (targetAmp - ag.amp) * Math.min(1, dt * 6);
    ag.phase += dt * ag.speed * 5.5;
    const sw = Math.sin(ag.phase) * ag.amp;
    const swc = Math.cos(ag.phase) * ag.amp;
    P.llegPivot.rotation.x = sw;  P.rlegPivot.rotation.x = -sw;
    if (P.lknee) P.lknee.rotation.x = Math.max(0, -sw) * 1.1;
    if (P.rknee) P.rknee.rotation.x = Math.max(0, sw) * 1.1;
    P.larmPivot.rotation.x = -sw; P.rarmPivot.rotation.x = sw;
    if (P.lelbow) P.lelbow.rotation.x = Math.max(0, sw) * 0.7 + 0.1;
    if (P.relbow) P.relbow.rotation.x = Math.max(0, -sw) * 0.7 + 0.1;

    // idle breathing / weight-shift sway, and a vertical bob while walking
    ag.idle = (ag.idle || Math.random() * 6) + dt;
    const breathe = Math.sin(ag.idle * 1.6) * 0.02;
    const bob = moving ? Math.abs(Math.sin(ag.phase)) * 0.04 * ag.amp : 0;
    ag.grp.position.y = (ag.baseY || 0) + bob;
    if (!moving) { P.larmPivot.rotation.x = breathe; P.rarmPivot.rotation.x = -breathe; }

    // conversational gesturing — a raised, moving hand while talking
    if (ag.gesture) {
      const gh = Math.sin(ag.idle * 3.4);
      P.rarmPivot.rotation.x = -0.5 - Math.max(0, gh) * 0.7;
      P.larmPivot.rotation.x = 0.06 + Math.sin(ag.idle * 2.2) * 0.06;
      if (P.relbow) P.relbow.rotation.x = 0.45 + Math.max(0, gh) * 0.6;
    }

    // head turns toward you when you're near (reacting to your approach)
    if (P.head) {
      let hy = 0, hx = 0;
      if (ag.state === "react") {
        const local = Math.atan2(dxp, dzp) - ag.facing;
        let n = local; while (n > Math.PI) n -= Math.PI * 2; while (n < -Math.PI) n += Math.PI * 2;
        hy = Math.max(-0.9, Math.min(0.9, n));
        hx = Math.max(-0.4, Math.min(0.4, (player.pos.y - ((ag.baseY || 0) + 1.86)) * -0.3));
      } else if (ag.state === "talk" && ag.partner) {
        const pgp = ag.partner.grp.position;
        let n = Math.atan2(pgp.x - gp.x, pgp.z - gp.z) - ag.facing;
        while (n > Math.PI) n -= Math.PI * 2; while (n < -Math.PI) n += Math.PI * 2;
        hy = Math.max(-0.6, Math.min(0.6, n));
        hx = Math.sin(ag.idle * 2.6) * 0.13;            // nodding along
      } else { hy = Math.sin(ag.idle * 0.7) * 0.25; }
      P.head.rotation.y += (hy - P.head.rotation.y) * Math.min(1, dt * 6);
      P.head.rotation.x += (hx - P.head.rotation.x) * Math.min(1, dt * 6);
    }
  }
}

function placeStation(s, x, z, theme) {
  const h = 1.2;
  const m = box(1.1, h, 1.1, s.color, x, h / 2, z, {
    emissive: s.color, ei: 0.25, rough: 0.6,
  });
  light(s.color, 6, x, 2.4, z, 9);
  const lbl = makeLabel(s.label, "#" + new THREE.Color(s.color).getHexString());
  lbl.position.set(x, h + 1.2, z);
  scene.add(lbl); labelSprites.push(lbl);
  s.pos = new THREE.Vector3(x, 1, z); s.radius = ACTIVATE; s.mesh = m;
  interactables.push(s);
}

function placeGate(s, x, z, angle, theme, locked) {
  // an arch: two posts + lintel
  const c = s.color;
  box(0.8, 5, 0.8, theme.wall, x - 2 * Math.sin(angle), 2.5, z + 2 * Math.cos(angle), { rough: 1 });
  box(0.8, 5, 0.8, theme.wall, x + 2 * Math.sin(angle), 2.5, z - 2 * Math.cos(angle), { rough: 1 });
  box(5.2, 0.8, 1, c, x, 5.2, z, { emissive: c, ei: locked ? 0.1 : 0.5 });
  light(c, 7, x, 4, z, 12);
  const lbl = makeLabel(s.label, locked ? "#d9534f" : "#9ad");
  lbl.position.set(x, 6.4, z); lbl.scale.set(6, 1.4, 1);
  scene.add(lbl); labelSprites.push(lbl);
  s.pos = new THREE.Vector3(x, 1, z); s.radius = ACTIVATE + 1; s.mesh = null;
  interactables.push(s);
}

/* Civilizational era of each district — used to theme generated interiors. */
const DISTRICT_ERA = {
  ziggurat_crown: "ancient", hanging_market: "market", god_quarter: "ancient",
  ironwall: "medieval", broken_crown: "market", neon_labyrinth: "cyber",
  spire: "corporate", sub_strata: "medieval",
};

/* Detail texture used for each district's buildings. */
const BUILD_TEX = {
  ziggurat_crown: "brick", hanging_market: "brick", god_quarter: "stone",
  ironwall: "concrete", broken_crown: "plank", neon_labyrinth: "panel",
  spire: "panel", sub_strata: "stone",
};

/* ======================================================================== */
/* Per-era architecture builders. Each adds meshes; `rnd` is seeded.        */
const THEMES = {
  ziggurat_crown: {
    tex: "brick", groundRepeat: 8, seed: 11,
    sky: 0x3a2c1c, ground: 0xb59668, wall: 0x8a6e4a, wallH: 7,
    fogNear: 18, fogFar: 90, hemiSky: 0xffe0b0, hemiGround: 0x5a4530, hemiInt: 0.7,
    sun: 0xffd9a0, sunInt: 1.1,
    build(rnd, night) {
      // central stepped ziggurat with a front stair
      const tiers = 7; let w = 18;
      for (let i = 0; i < tiers; i++) {
        box(w, 1.6, w, i % 2 ? 0x9a7a52 : 0x8a6e4a, 0, 0.8 + i * 1.6, 0, { rough: 1 });
        box(2.6, 1.6, (w / 2) + 0.6, 0x7a6042, 0, 0.8 + i * 1.6, w / 2 - 1, { rough: 1 }); // stair spine
        w -= 2.2;
      }
      box(3.2, 2.4, 3.2, 0xc89a55, 0, tiers * 1.6 + 1.2, 0, { emissive: 0x6a4a18, ei: 0.5 });
      light(0xffcf80, 9, 0, tiers * 1.6 + 2, 0, 42);
      landmark(0, 10.5, 4, "Enter the Grand Ziggurat", () => { World.enterBuilding(buildSpec("temple", "ziggurat_crown")); return {}; }, 0xffcf80);
      // braziers up the approach + banners + offering crates
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + 0.3, r = 13; brazier(Math.cos(a) * r, Math.sin(a) * r); }
      for (let i = 0; i < 10; i++) {
        const x = (rnd() - 0.5) * 46, z = (rnd() - 0.5) * 46; if (Math.hypot(x, z) < 14) continue;
        if (rnd() > 0.5) banner(x, z, [0x9a2a2a, 0x2a4a8a, 0xc8a050][(rnd() * 3) | 0], 0.5, 2.0, 3);
        else crate(x, z, 0.7, "brick");
      }
      for (let i = 0; i < 4; i++) brazier((rnd() - 0.5) * 40, (rnd() - 0.5) * 40);
      // ancient mudbrick dwellings clustered around the temple — enterable homes
      for (let i = 0; i < 12; i++) {
        const x = (rnd() - 0.5) * 46, z = (rnd() - 0.5) * 46; if (Math.hypot(x, z) < 16) continue;
        const bw = 3 + rnd() * 2, bh = 3 + rnd() * 3;
        box(bw, bh, bw, rnd() > 0.5 ? 0x9a7a52 : 0x8a6e4a, x, bh / 2, z, { rough: 1 });
        registerBuilding(x, z, bw, rnd() > 0.7 ? "Scribe's House" : "Mudbrick Home", "home", "ancient");
      }
    },
  },
  hanging_market: {
    tex: "brick", groundRepeat: 9, seed: 22,
    sky: 0x2a2418, ground: 0x9a8458, wall: 0x6a5838, wallH: 6,
    fogNear: 16, fogFar: 80, hemiSky: 0xffe6b8, hemiGround: 0x4a3c28, hemiInt: 0.7,
    sun: 0xffdca0, sunInt: 0.9,
    build(rnd, night) {
      // terraced platforms
      for (let t = 0; t < 3; t++)
        box(40 - t * 8, 1, 40 - t * 8, t % 2 ? 0x7a6444 : 0x6a5838, 0, 0.5 + t, 0, { rough: 1 });
      const cols = [0xb0452b, 0x2b7ab0, 0x2bb06a, 0xb0962b, 0x7a2bb0, 0xc86a2a];
      // dense market stalls: counter + canopy + goods + an awning post
      for (let i = 0; i < 46; i++) {
        const x = (rnd() - 0.5) * 46, z = (rnd() - 0.5) * 46;
        if (Math.hypot(x, z) < 12) continue;
        const c = cols[(rnd() * cols.length) | 0];
        box(1.9, 1.0, 1.2, 0x6a513a, x, 0.5, z, { tex: "plank", rough: 0.9 });   // counter
        if (rnd() > 0.45) registerBuilding(x, z, 1.9, "Market Shop", "shop", "market");
        box(2.3, 0.16, 1.7, c, x, 1.9, z, { tex: "cloth", rough: 0.85 });          // canopy
        box(0.1, 1.9, 0.1, 0x4a3a28, x - 1, 0.95, z - 0.7, { tex: null });          // posts
        box(0.1, 1.9, 0.1, 0x4a3a28, x + 1, 0.95, z + 0.7, { tex: null });
        for (let gj = 0; gj < 3; gj++)                                              // goods on the counter
          box(0.3, 0.3, 0.3, cols[(rnd() * cols.length) | 0], x - 0.6 + gj * 0.6, 1.15, z, { tex: null, rough: 0.7 });
        if (rnd() > 0.6) crate(x + (rnd() - 0.5) * 2, z + (rnd() - 0.5) * 2, 0.6, "plank");
        if (rnd() > 0.7) barrel(x + (rnd() - 0.5) * 2, z + (rnd() - 0.5) * 2);
      }
      // hanging banners and lamps strung over the lanes
      for (let i = 0; i < 14; i++) {
        const x = (rnd() - 0.5) * 44, z = (rnd() - 0.5) * 44; if (Math.hypot(x, z) < 12) continue;
        if (rnd() > 0.5) banner(x, z, cols[(rnd() * cols.length) | 0], 0.5, 1.4, 3.4);
        else lampPost(x, z, 0xffcf80, 3);
      }
      // the three-storey market hall (raw / manufactured / luxury)
      box(7, 9, 7, 0x6a5838, 14, 4.5, -8, { tex: "brick" });
      box(7.4, 0.4, 7.4, 0x7a6444, 14, 9, -8, { tex: "brick" });
      landmark(14, -3, 4, "Enter the Market Hall",
        () => { World.enterBuilding(buildSpec("bazaar", "hanging_market")); return {}; }, 0xc8a050);
      // the caravanserai — where every trade route in the world begins
      box(6, 4, 6, 0x6a5838, -14, 2, -8, { tex: "brick" });
      box(7, 0.5, 7, 0x7a6444, -14, 4.2, -8, { tex: "brick" });
      landmark(-14, -3, 4, "The Caravanserai — travel the world's regions",
        () => { World.openRegions(); return {}; }, 0xe6b450);
    },
  },
  god_quarter: {
    tex: "stone", groundRepeat: 6, seed: 33,
    sky: 0x161a22, ground: 0x3a3a44, wall: 0x2a2c34, wallH: 9,
    fogNear: 10, fogFar: 60, hemiSky: 0x9aa6c0, hemiGround: 0x202028, hemiInt: 0.4,
    sun: 0x8090b0, sunInt: 0.4,
    build(rnd, night) {
      // two concentric colonnades with capitals + bases
      for (const [n, r, h] of [[12, 17, 14], [16, 23, 11]]) {
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r;
          box(1.6, 0.5, 1.6, 0x4a4c58, x, 0.25, z, { tex: "stone" });             // base
          cyl(0.6, 0.7, h, new THREE.MeshStandardMaterial({ color: 0x3a3c46, roughness: 1, map: Art && Art.detail("stone", 1, 4), normalMap: Art && Art.detailNormal("stone", 1, 4) }), x, h / 2 + 0.5, z);
          box(1.5, 0.6, 1.5, 0x44464f, x, h + 0.6, z, { tex: "stone" });           // capital
        }
      }
      // raised dais + glowing altar + flanking braziers + standing statues
      box(6, 1, 6, 0x4a4c58, 0, 0.5, 0, { tex: "stone" });
      box(2, 2, 2, 0xe6b450, 0, 2, 0, { emissive: 0xe6b450, ei: 0.85, tex: null });
      light(0xffd070, 10, 0, 3.5, 0, 24);
      brazier(-4, 4); brazier(4, 4); brazier(-4, -4); brazier(4, -4);
      landmark(0, 3.4, 3.2, "Pray at the Inner Sanctum",
        (g) => Actions.pray(g), 0xe6b450);
      landmark(13, 6, 3, "The place where nothing happens",
        examine("The Quiet Ground", "A patch of the quarter where, by every account anyone can find, violence has simply never occurred. People in extreme distress grow calm here. The temple offers no explanation; it does not call it anything. It only keeps the lamps lit and lets the stones be what they are.", "omen"), 0x9aa6c0);
      for (let i = 0; i < 6; i++) {                                                // idol statues
        const a = i * Math.PI / 3 + 0.5, r = 11, x = Math.cos(a) * r, z = Math.sin(a) * r;
        box(1, 0.5, 1, 0x52535c, x, 0.25, z, { tex: "stone" });
        box(0.7, 2.2, 0.5, 0x5a5b64, x, 1.6, z, { tex: "stone" });
        box(0.5, 0.5, 0.5, 0x62636c, x, 2.95, z, { tex: "stone" });
      }
    },
  },
  ironwall: {
    tex: "concrete", groundRepeat: 6, seed: 44,
    sky: 0x1c1c1e, ground: 0x44423e, wall: 0x33312e, wallH: 12,
    fogNear: 12, fogFar: 55, hemiSky: 0x9a9690, hemiGround: 0x222020, hemiInt: 0.35,
    sun: 0xb0a890, sunInt: 0.4,
    build(rnd, night) {
      // tall fortified blocks with crenellations and arrow-slits
      for (let i = 0; i < 10; i++) {
        const x = (rnd() - 0.5) * 38, z = (rnd() - 0.5) * 38;
        if (Math.hypot(x, z) < 11) continue;
        const w = 4 + rnd() * 2.5, h = 8 + rnd() * 9;
        box(w, h, w, 0x35332f, x, h / 2, z, { rough: 1 });
        registerBuilding(x, z, w, rnd() > 0.5 ? "Fortified Home" : "Family Barracks", rnd() > 0.5 ? "home" : "office", "medieval");
        for (let m = 0; m < 4; m++) box(w / 4, 0.7, 0.5, 0x2e2c29, x - w / 2 + 0.5 + m * (w / 4), h + 0.35, z + w / 2, { tex: "concrete" }); // merlons
        for (let s = 0; s < 3; s++) box(0.25, 0.9, 0.3, 0x140e08, x, 2 + s * 2.2, z + w / 2 + 0.01, { emissive: 0xff7a30, ei: night ? 0.8 : 0.2, tex: null }); // arrow-slits
      }
      // corner keeps with battlements + braziers atop
      for (const [sx, sz] of [[-22, -22], [22, -22], [-22, 22], [22, 22]]) {
        box(4.4, 17, 4.4, 0x2e2c29, sx, 8.5, sz, { rough: 1 });
        for (let m = 0; m < 4; m++) box(1, 0.8, 1, 0x262420, sx - 1.4 + (m % 2) * 2.8, 17.4, sz - 1.4 + ((m / 2) | 0) * 2.8, { tex: "concrete" });
        brazier(sx, sz + 3);
      }
      landmark(-22, -18, 4.5, "Enter the Kol Keep",
        () => { World.enterBuilding(buildSpec("keep", "ironwall")); return {}; }, 0xff7a30);
      // ground clutter: crates, barrels, chains between keeps
      for (let i = 0; i < 10; i++) { const x = (rnd() - 0.5) * 40, z = (rnd() - 0.5) * 40; if (Math.hypot(x, z) < 9) continue; rnd() > 0.5 ? crate(x, z, 0.8, "concrete") : barrel(x, z); }
      wire([-22, 12, -22], [22, 12, -22], 0x14120e); wire([-22, 12, 22], [22, 12, 22], 0x14120e);
    },
  },
  broken_crown: {
    tex: "shanty", groundRepeat: 7, seed: 55,
    sky: 0x241c16, ground: 0x4a3e30, wall: 0x3a3026, wallH: 6,
    fogNear: 14, fogFar: 65, hemiSky: 0xd0b088, hemiGround: 0x2a2018, hemiInt: 0.6,
    sun: 0xffc080, sunInt: 0.6,
    build(rnd, night) {
      // organic stacked shanties, salvage roofs, cookfires
      const cols = [0x6a5236, 0x7a5a3a, 0x5a4a3a, 0x8a6a44, 0x6a5a4a];
      const laundry = [0x9a3a3a, 0x3a6a8a, 0x8a8a4a, 0xa06a3a, 0x4a7a5a];
      const tops = [];
      for (let i = 0; i < 54; i++) {
        const x = (rnd() - 0.5) * 48, z = (rnd() - 0.5) * 48;
        if (Math.hypot(x, z) < 8) continue;
        const stack = 1 + ((rnd() * 3) | 0); let topY = 0;
        for (let s = 0; s < stack; s++) {
          const sz = 1.8 + rnd() * 1.6, hh = 1.8 + rnd() * 0.6;
          box(sz, hh, sz, cols[(rnd() * cols.length) | 0], x + (rnd() - 0.5), topY + hh / 2, z + (rnd() - 0.5), { rough: 1 });
          topY += hh;
          if (rnd() > 0.5) box(sz + 0.5, 0.1, sz + 0.5, 0x3a3630, x, topY + 0.05, z, { tex: "panel", metal: 0.4 }); // tin roof
        }
        if (rnd() > 0.55) { light(0xff8030, 2.6, x, 1.4, z, 7); box(0.4, 0.3, 0.4, 0xff7a25, x, 0.3, z, { emissive: 0xff6a10, ei: 1.4, tex: null }); }
        if (rnd() > 0.7) crate(x + 1.5, z, 0.6);
        if (rnd() > 0.8) barrel(x - 1.5, z);
        if (rnd() > 0.35) registerBuilding(x, z, 2.6, rnd() > 0.7 ? "Salvaged Tenement" : "Home", rnd() > 0.7 ? "tenement" : "home", "market");
        if (topY > 2) tops.push([x, topY, z]);
      }
      // a communal cistern — the heart of the district's self-governance
      box(4, 1.4, 4, 0x3a4a4a, 7, 0.7, -6, { tex: "concrete" });
      box(3, 0.3, 3, 0x2a5a6a, 7, 1.5, -6, { emissive: 0x1a3a4a, ei: 0.3, tex: null });
      landmark(7, -6, 3.2, "The Council Cistern",
        examine("The Council Cistern", "Salvaged solar panels feed ancient aqueduct lines into a shared tank, kept by rotating volunteer teams who know by heart which walls bear load and which water channels serve the whole block. There is no formal government here, but there is governance — more responsive than anything the city provides, because the people running it live here and depend on it working.", "world"), 0x38d0c8);
      // the council house — a salvaged tenement that runs the district
      box(6, 6, 6, 0x5a4a3a, -8, 3, -8, { tex: "plank" });
      box(6.4, 0.4, 6.4, 0x3a3630, -8, 6, -8, { tex: "panel", metal: 0.4 });
      landmark(-8, -3.5, 4, "Enter the Council House",
        () => { World.enterBuilding(buildSpec("council", "broken_crown")); return {}; }, 0xffc080);

      // cables + laundry strung between rooftops
      for (let i = 0; i + 1 < tops.length && i < 26; i += 2) {
        const a = tops[i], b = tops[(i + 3) % tops.length];
        if (Math.hypot(a[0] - b[0], a[2] - b[2]) > 14) continue;
        wire(a, b, 0x14110c);
        const mx = (a[0] + b[0]) / 2, mz = (a[2] + b[2]) / 2, my = Math.min(a[1], b[1]) - 0.3;
        if (rnd() > 0.4) banner(mx, mz, laundry[(rnd() * laundry.length) | 0], 0.4, 0.6, my);
      }
    },
  },
  neon_labyrinth: {
    tex: "neon", groundRepeat: 10, seed: 66, texAccent: 0x38d0c8,
    sky: 0x0a0a12, ground: 0x14141c, wall: 0x1a1a26, wallH: 16,
    fogNear: 10, fogFar: 55, hemiSky: 0x303048, hemiGround: 0x08080c, hemiInt: 0.3,
    sun: 0x4040a0, sunInt: 0.25,
    build(rnd, night) {
      const neon = [0x38d0c8, 0xff5c7a, 0xc850ff, 0x50ff9a, 0xffd23a, 0x40a0ff];
      const tops = [];
      for (let i = 0; i < 24; i++) {
        const x = (rnd() - 0.5) * 48, z = (rnd() - 0.5) * 48;
        if (Math.hypot(x, z) < 9) continue;
        const w = 3.4 + rnd() * 2.4, h = 9 + rnd() * 21;
        const c = neon[(rnd() * neon.length) | 0];
        cityTower(rnd, x, z, w, h, 0x16161f, { neon: true, night: true, winColor: c, stripColor: c, metal: 0.35, rough: 0.5 });
        registerBuilding(x, z, w, rnd() > 0.5 ? "Apartment Block" : "Office Tower", rnd() > 0.5 ? "home" : "office", "cyber");
        const sc = neon[(rnd() * neon.length) | 0];
        box(0.1, 1.6, 1.4, sc, x + w / 2 + 0.2, h * (0.4 + rnd() * 0.4), z, { emissive: sc, ei: 1.4, tex: null }); // holo sign
        if (rnd() > 0.6) light(c, 5, x, h * 0.5, z, 16);
        tops.push([x, h, z, c]);
      }
      // sagging power/data cables between towers
      for (let i = 0; i + 1 < tops.length && i < 30; i++) {
        const a = tops[i], b = tops[(i + 2) % tops.length];
        if (Math.hypot(a[0] - b[0], a[2] - b[2]) > 16) continue;
        wire([a[0], a[1] * 0.7, a[2]], [b[0], b[1] * 0.7, b[2]], 0x0c0c12);
      }
      for (let i = 0; i < 8; i++) lampPost((rnd() - 0.5) * 44, (rnd() - 0.5) * 44, neon[(rnd() * neon.length) | 0], 3.2);
      // a back-room augmentation clinic that runs in the dark
      box(5, 4, 4, 0x14141c, -10, 2, 8, { tex: "panel", metal: 0.4 });
      box(1, 2.2, 0.2, 0xff5c7a, -10, 1.6, 10.05, { emissive: 0xff5c7a, ei: 1.2, tex: null });
      landmark(-10, 10.5, 3.5, "Enter the Aug Clinic",
        () => { World.enterBuilding(buildSpec("clinic", "neon_labyrinth")); return {}; }, 0xff5c7a);
    },
  },
  spire: {
    tex: "marble", groundRepeat: 5, seed: 77,
    sky: 0x9ab0c8, ground: 0xc8ccd2, wall: 0xdfe4ea, wallH: 14,
    fogNear: 30, fogFar: 140, hemiSky: 0xffffff, hemiGround: 0x90a0b0, hemiInt: 0.9,
    sun: 0xffffff, sunInt: 1.4,
    build(rnd, night) {
      // clean tall glass towers in varied silhouettes, with baked lit windows
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2, r = 15 + rnd() * 7;
        const x = Math.cos(a) * r, z = Math.sin(a) * r, w = 4.5 + rnd() * 2.2, h = 24 + rnd() * 26;
        cityTower(rnd, x, z, w, h, 0xeaf0f6, { night, winColor: 0xbfe2ff, metal: 0.65, rough: 0.12 });
        registerBuilding(x, z, w, "Corporate Office", "office", "corporate");
        box(0.3, 2, 0.3, 0xcfe0ee, x, h + 1, z, { emissive: 0x88c0ff, ei: night ? 1.2 : 0.4, tex: null }); // beacon
      }
      // central monument + reflecting plaza + planters
      box(10, 1, 10, 0xf0f4f8, 0, 0.5, 0, { metal: 0.4, rough: 0.15 });
      box(1.2, 9, 1.2, 0xdfe8f0, 0, 5, 0, { metal: 0.6, rough: 0.1, emissive: 0x4a6a8a, ei: 0.3 });
      box(2.4, 0.6, 2.4, 0xe6eef4, 0, 9.3, 0, { metal: 0.7, rough: 0.1, emissive: 0x88c0ff, ei: 0.6, tex: null });
      landmark(0, 6.5, 3.5, "The Razed Foundation",
        examine("The Razed Foundation", "Every other district in the city is built on top of what came before. Here the corporations demolished the ancient layer completely and started from a cleared footprint — the only place in Ur-Axiom where the deep history is simply absent. Every faction has read that erasure and remembered it. The absence is the most aggressive political gesture anyone has made.", "world"), 0x88c0ff);
      landmark(15, 0, 4, "Enter Meridian Tower",
        () => { World.enterBuilding(buildSpec("spire", "spire")); return {}; }, 0xbfe2ff);
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3, r = 7; box(1.4, 0.8, 1.4, 0xd8e2ea, Math.cos(a) * r, 0.4, Math.sin(a) * r, { tex: "panel", metal: 0.3 }); box(1, 1, 1, 0x2a5a3a, Math.cos(a) * r, 1.2, Math.sin(a) * r, { tex: null, rough: 1 }); }
    },
  },
  sub_strata: {
    tex: "fungal", groundRepeat: 8, seed: 88,
    sky: 0x05070a, ground: 0x171c18, wall: 0x12161a, wallH: 5,
    fogNear: 6, fogFar: 34, hemiSky: 0x16301f, hemiGround: 0x05080a, hemiInt: 0.35,
    sun: 0x103018, sunInt: 0.15,
    build(rnd, night) {
      // low vaulted ceiling + dense pillars + arches + bioluminescence + pipes
      const ceil = new THREE.Mesh(
        new THREE.PlaneGeometry(BOUND * 2 + 8, BOUND * 2 + 8),
        new THREE.MeshStandardMaterial({ color: 0x0c100e, roughness: 1, map: Art && Art.detail("stone", 8, 8), normalMap: Art && Art.detailNormal("stone", 8, 8) })
      );
      ceil.rotation.x = Math.PI / 2; ceil.position.y = 6; ceil.receiveShadow = true; scene.add(ceil);
      const pillars = [];
      for (let i = 0; i < 40; i++) {
        const x = (rnd() - 0.5) * 50, z = (rnd() - 0.5) * 50;
        if (Math.hypot(x, z) < 6) continue;
        box(1.3, 6, 1.3, 0x14181c, x, 3, z, { tex: "stone" });
        box(1.7, 0.5, 1.7, 0x181c20, x, 5.7, z, { tex: "stone" });          // capital meeting the vault
        pillars.push([x, z]);
        const n = (rnd() * 3) | 0;
        for (let f = 0; f < n; f++) {                                        // fungus clusters
          const fy = 0.5 + rnd() * 4.5, fx = x + (rnd() - 0.5) * 1.4, fz = z + (rnd() - 0.5) * 1.4;
          box(0.3 + rnd() * 0.3, 0.3, 0.3 + rnd() * 0.3, 0x4dff9a, fx, fy, fz, { emissive: 0x4dff9a, ei: 1.7, tex: null });
          if (rnd() > 0.5) light(0x4dff9a, 2, fx, fy, fz, 6);
        }
        if (rnd() > 0.7) crate(x + 1.4, z, 0.6, "concrete");
      }
      // a still, lightless chamber where violence has never happened
      box(3, 3, 3, 0x0a0e0c, 0, 1.5, -4, { tex: "stone" });
      landmark(0, -1, 3, "The Deep-Dark Chamber",
        examine("The Deep-Dark Chamber", "A passage with no light at all opens into a space where, the old residents swear, nothing bad has ever occurred. On the far wall an alignment is cut to a star position the sky held thousands of years before the city above was built. The builders below and the gods above were not the same — and the builders knew it first.", "fragment"), 0x4dff9a);

      // stolen pipes/cables running between pillars under the ceiling
      for (let i = 0; i + 1 < pillars.length && i < 24; i += 2) {
        const a = pillars[i], b = pillars[(i + 5) % pillars.length];
        if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 13) continue;
        wire([a[0], 5.4, a[1]], [b[0], 5.4, b[1]], 0x223026);
      }
    },
  },
  _default: {
    tex: "sand", groundRepeat: 8, seed: 99,
    sky: 0x222222, ground: 0x555555, wall: 0x444444, wallH: 6,
    fogNear: 16, fogFar: 80, hemiSky: 0xaaaaaa, hemiGround: 0x333333, hemiInt: 0.6,
    sun: 0xffffff, sunInt: 0.8, build() {},
  },
};

/* ======================================================================== */
/* main loop                                                                */
function loop() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (started && !panelsOpen() && !dialogOpen()) { updateLook(dt); updateMovement(dt); }
  if (started) updateAgents(dt);
  if (started && !inInterior) { updateVehicles(dt); updateGroundTraffic(dt); }

  // camera orientation
  camera.position.copy(player.pos);
  const dir = new THREE.Vector3(
    Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)
  );
  camera.lookAt(player.pos.clone().add(dir));

  // billboards already face camera (sprites). Update focus.
  if (started) updateFocus();

  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) document.getElementById("toast").textContent = ""; }

  if (ppOn && composer) composer.render(); else renderer.render(scene, camera);
}

// Keyboard look — arrow keys turn the view, so no mouse is needed at all.
function updateLook(dt) {
  const turn = 1.9 * dt, look = 1.5 * dt;
  if (keys.ArrowLeft)  yaw += turn;
  if (keys.ArrowRight) yaw -= turn;
  if (keys.ArrowUp)    pitch = Math.min(1.2, pitch + look);
  if (keys.ArrowDown)  pitch = Math.max(-1.2, pitch - look);
}

function updateMovement(dt) {
  if (freeCam) return;          // detached camera holds its position
  const speed = 8;
  const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  const s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const move = new THREE.Vector3().addScaledVector(fwd, f).addScaledVector(right, s);
  if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed * dt);
  player.pos.add(move);
  // clamp to the plot (or the current interior floor)
  const b = inInterior ? INNER : BOUND;
  player.pos.x = Math.max(-b + 1.5, Math.min(b - 1.5, player.pos.x));
  player.pos.z = Math.max(-b + 1.5, Math.min(b - 1.5, player.pos.z));
  player.pos.y = (inInterior ? currentFloorY : 0) + 1.7;
}

function updateFocus() {
  let best = null, bestD = Infinity;
  for (const it of interactables) {
    if (inInterior && it.floor !== undefined && it.floor !== currentFloor) continue;
    const dx = it.pos.x - player.pos.x, dz = it.pos.z - player.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < it.radius && dist < bestD) { best = it; bestD = dist; }
  }
  focus = best;
  const prompt = document.getElementById("prompt");
  if (focus) prompt.innerHTML = `<span class="key">E</span><span class="key">tap</span> ${focus.label}`;
  else prompt.textContent = "";

  // pulse focused mesh
  for (const it of interactables) if (it.mesh) it.mesh.scale.setScalar(it === focus ? 1.15 : 1);
}

/* ======================================================================== */
World.interact = function () {
  if (!started || panelsOpen() || !focus) return;
  const g = State.data;
  if (g.over) return;
  const res = focus.run(g);
  if (res && res.panel) { World.togglePanels(true); World.showPanel(res.panel); return; }
  if (res && res.msg) toast(res.msg, res.kind);
  Engine.checkRevelation(g);
  State.save();
  // travel rebuilds the world
  if (focus && focus.type === "gate" && g.here === focus.dest) {
    World.buildDistrict(g.here, true);
  }
  World.updateHUD();
  if (typeof Story !== "undefined" && Story.check) Story.check(g);
  if (g.over) UI.gameOver(g);
  if (res && res.revealed) revelationModal();
  if (g.over) UI.gameOver(g);
};

function toast(msg, kind) {
  const t = document.getElementById("toast");
  t.className = "k-" + (kind || "");
  t.textContent = msg;
  toastTimer = 5.5;
}

/* ======================================================================== */
/* HUD                                                                      */
World.updateHUD = function () {
  const g = State.data; if (!g) return;
  const d = AXIOM.DISTRICTS[g.here];
  document.getElementById("hud-name").textContent = g.name;
  document.getElementById("hud-role").textContent = `${g.role} · ${AXIOM.STATUS[g.status].label}`;
  document.getElementById("hud-day").textContent = `Day ${g.day}`;
  const per = Engine.period(g);
  document.getElementById("hud-period").textContent =
    `${String(g.hour).padStart(2, "0")}:00 · ${per.name}${Engine.isNight(g) ? " · night" : ""}`;
  document.getElementById("hud-weather").textContent = AXIOM.WEATHER[g.weather].name;
  document.getElementById("hud-money").textContent = `${g.money} shekels`;
  const heatEl = document.getElementById("hud-heat");
  if (heatEl) heatEl.textContent = (g.heat || 0) > 0 ? `🔥 Heat ${Math.round(g.heat)}` : "";
  const distChip = document.getElementById("hud-district");
  if (inRegion && currentRegion && REGION_INFO[currentRegion]) {
    distChip.innerHTML = `<span class="crest">${Art.emblem("world")}</span>${REGION_INFO[currentRegion].name}`;
  } else if (inInterior && interiorSpec) {
    const fl = interiorSpec.floors[currentFloor];
    distChip.innerHTML = `<span class="crest">${Art.emblem(returnDistrict)}</span>${interiorSpec.title} · ${currentFloor + 1}F ${fl ? fl.name : ""}`;
  } else {
    distChip.innerHTML = `<span class="crest">${Art.emblem(g.here)}</span>${d.name}`;
  }

  const bar = (label, val, invert) => {
    const pct = Math.max(0, Math.min(100, val));
    const c = invert ? (pct > 75 ? "#d9534f" : pct > 50 ? "#e0a046" : "#6fcf6f")
                     : (pct < 25 ? "#d9534f" : pct < 50 ? "#e0a046" : "#6fcf6f");
    return `<div class="v3"><span class="v3l">${label}</span>
      <span class="v3b"><span style="width:${pct}%;background:${c}"></span></span></div>`;
  };
  let html = bar("Health", g.health, false) + bar("Hunger", g.hunger, true) + bar("Fatigue", g.fatigue, true);
  if (g.aug) html += bar("Aug", g.aug.integrity, false);
  if (g.injuries.length) html += `<div class="v3 inj">⚠ ${g.injuries.map(i => i.part).join(", ")}</div>`;
  document.getElementById("vitals3d").innerHTML = html;
};

/* ======================================================================== */
/* Panels (cursor released)                                                 */
function panelsOpen() { return !document.getElementById("panels").hidden; }

World.togglePanels = function (force) {
  const panels = document.getElementById("panels");
  const open = force === undefined ? panels.hidden : force;
  panels.hidden = !open;
  if (open) {
    if (document.pointerLockElement) document.exitPointerLock();
    World.showPanel(World._tab || "skills");
  }
};

World.showPanel = function (tab) {
  World._tab = tab;
  const g = State.data;
  document.querySelectorAll("#panels .panel-tabs button[data-t]").forEach((b) =>
    b.classList.toggle("primary", b.dataset.t === tab));
  const body = document.getElementById("panel-body");
  body.innerHTML = "";

  if (tab === "skills") {
    body.appendChild(el("p", "muted small", "Competence is earned through repetition and decays through neglect. Gated skills (🔒) must be taught first. Training costs hours and fatigue."));
    for (const k of Object.keys(AXIOM.SKILLS)) {
      const lvl = Engine.skillLevel(g, k), known = g.skills[k].known;
      const row = el("div", "prow");
      row.innerHTML = `<span class="pn">${AXIOM.SKILLS[k].name}</span>
        <span class="pbar"><span style="width:${lvl}%"></span></span><span class="pv">${known ? lvl : "🔒"}</span>`;
      if (known) {
        const b = el("button", "ghost mini", "train");
        b.onclick = () => { panelAct(() => Actions.train(g, k)); };
        row.appendChild(b);
      }
      row.title = AXIOM.SKILLS[k].desc;
      body.appendChild(row);
    }
  }

  if (tab === "market") {
    const goods = AXIOM.MARKETS[g.here] || [];
    body.appendChild(el("p", "muted small", `Prices in ${AXIOM.DISTRICTS[g.here].name} move with weather, events, and you. Off-market sales pay poorly.`));
    if (!goods.length) body.appendChild(el("p", "muted", "Nothing is traded openly here."));
    for (const id of goods) {
      const price = Engine.price(g, id, g.here), drift = g.economy[id] || 1;
      const arrow = drift > 1.1 ? "▲" : drift < 0.9 ? "▼" : "·";
      const row = el("div", "prow");
      row.innerHTML = `<span class="pn">${AXIOM.GOODS[id].name} <span class="muted">${arrow}</span></span>
        <span class="pv coin">${price}</span>`;
      const buy = el("button", "ghost mini", "buy");
      buy.onclick = () => panelAct(() => Actions.buy(g, id));
      const sell = el("button", "ghost mini", `sell${(g.inventory[id] || 0) ? ` (${g.inventory[id]})` : ""}`);
      sell.onclick = () => panelAct(() => Actions.sell(g, id));
      const acts = el("span"); acts.append(buy, sell); row.appendChild(acts);
      body.appendChild(row);
    }
  }

  if (tab === "pack") {
    const items = Object.entries(g.inventory).filter(([, q]) => q > 0);
    if (!items.length) body.appendChild(el("p", "muted", "Your pack is empty."));
    for (const [id, q] of items)
      body.appendChild(el("div", "prow", `<span class="pn">${AXIOM.GOODS[id].name}</span><span class="pv">×${q}</span>`));
    if (g.flags.haveMap) body.appendChild(el("div", "prow", `<span class="pn" style="color:#d8a657">Sub-Strata Map</span><span class="pv">priceless</span>`));
  }

  if (tab === "lore") {
    body.appendChild(el("p", "muted small", `The world beneath the world — assembled by you (${g.fragments.length}/${AXIOM.FRAGMENTS.length}).`));
    for (const f of AXIOM.FRAGMENTS) {
      const got = g.fragments.includes(f.id);
      body.appendChild(el("div", "prow lore",
        got ? `<span><b style="color:#d8a657">${f.name}</b><br><span class="muted">${f.text}</span></span>`
            : `<span class="muted">??? — undiscovered (in ${AXIOM.DISTRICTS[f.where].name})</span>`));
    }
    if (g.flags.revealed) body.appendChild(el("p", "reveal", AXIOM.REVELATION));
  }

  if (tab === "story") {
    // who you've become — profile, underworld standing, and your choices so far
    const proto = AXIOM.PROTAGONISTS.find((p) => p.id === g.proto);
    body.appendChild(el("p", "muted small", `${g.name} — ${g.role}. “${proto ? proto.crisis : ""}”`));
    const d = (window.Engine && Engine.dominantStyle) ? Engine.dominantStyle(g) : "none";
    body.appendChild(el("div", "prow", `<span class="pn">You play as</span><span class="pv" style="color:var(--cedar)">${d}</span>`));
    if (window.Engine && Engine.underworldRank) {
      const r = Engine.underworldRank(g);
      body.appendChild(el("div", "prow", `<span class="pn">Underworld</span><span class="pv">${Engine.RANKS[r]} · standing ${Engine.underworldStanding(g)}${(g.heat || 0) > 0 ? ` · 🔥${Math.round(g.heat)}` : ""}</span>`));
    }
    // style bars
    const st = g.style || {};
    for (const k of Object.keys(st)) {
      const v = Math.min(100, (st[k] || 0) * 4);
      body.appendChild(el("div", "prow", `<span class="pn">${k}</span><span class="pbar"><span style="width:${v}%"></span></span>`));
    }
    // faction standings
    if (g.factionRep) for (const f of Object.keys(g.factionRep)) {
      if (!g.factionRep[f]) continue;
      const c = g.factionRep[f] > 0 ? "var(--good)" : "var(--bad)";
      body.appendChild(el("div", "prow", `<span class="pn">${(AXIOM.FACTIONS && AXIOM.FACTIONS[f]) || f}</span><span class="pv" style="color:${c}">${g.factionRep[f]}</span>`));
    }
    // the decisions you've made
    body.appendChild(el("p", "muted small", "Your story so far —"));
    const slog = (g.story && g.story.log) || [];
    if (!slog.length) body.appendChild(el("p", "muted", "Your story is still unwritten. Play, and the world will respond."));
    for (const s of slog.slice().reverse())
      body.appendChild(el("div", "prow lore", `<span style="font-size:12px"><b style="color:var(--cedar)">D${s.day} · ${s.title}</b><br><span class="muted">${s.choice}</span><br><span style="color:var(--sand-dim)">${s.line}</span></span>`));
  }

  if (tab === "log") {
    for (const l of g.log.slice(-50).reverse())
      body.appendChild(el("div", "logline " + (l.kind || ""),
        `<span class="ts">D${l.day} ${String(l.hour).padStart(2, "0")}:00</span>${l.text}`));
  }

  if (tab === "menu") {
    body.appendChild(el("p", "muted", AXIOM.STATUS[g.status].blurb));
    const save = el("button", "primary", "Save history"); save.onclick = () => { State.save(); toast("History saved.", ""); };
    const restart = el("button", "ghost danger", "Abandon & restart");
    restart.onclick = () => { if (confirm("Abandon this life?")) { State.wipe(); location.reload(); } };
    const wrap = el("div", "menu-row"); wrap.append(save, restart); body.appendChild(wrap);
    body.appendChild(el("p", "muted small", "Autosaves after every action. Tab resumes the City."));
  }
};

function panelAct(fn) {
  const g = State.data;
  fn(g);
  Engine.checkRevelation(g);
  if (typeof Story !== "undefined" && Story.check) Story.check(g);
  State.save();
  World.updateHUD();
  if (Story._active) return; // a story beat took over; resume panel after
  World.showPanel(World._tab);
}

function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

function revelationModal() {
  UI.modal(`<h2>Recognition</h2><p style="font-style:italic">${AXIOM.REVELATION}</p>
    <p class="muted small">The narrative goal was never catharsis. It was understanding something true about power, time, and what it costs to be a person inside history.</p>`);
}

/* ======================================================================== */
/* DIALOGUE — Friendly / Neutral / Trade, with contextual lines & memory.   */
function dialogOpen() { return !document.getElementById("dialog").hidden; }

function openDialogue(meta, agent) {
  World._dialog = { meta, agent };
  if (document.pointerLockElement) document.exitPointerLock();
  document.getElementById("dialog").hidden = false;
  drawPortrait(meta.appear);
  renderDialog(true);
}

function renderDialog(greeting) {
  const g = State.data, d = World._dialog; if (!d) return;
  const meta = d.meta;
  const rec = Engine.ensureNPC(g, meta.id);
  document.getElementById("dlg-name").innerHTML =
    `<span class="sigil">${Art.sigil(meta.faction)}</span>${meta.name}`;
  const pers = People.personality(meta);
  const origin = meta.originName && meta.originName !== "Ur-Axiom" ? ` · of ${meta.originName}` : "";
  document.getElementById("dlg-role").textContent =
    `${meta.role} · ${AXIOM.FACTIONS[meta.faction] || "Unaffiliated"}${origin} — ${pers}`;

  // standing with this person + their faction
  const tierName = ["marked", "disliked", "known to", "trusted by", "honored by"];
  const t = rec.disp > 50 ? 4 : rec.disp > 15 ? 3 : rec.disp > -15 ? 2 : rec.disp > -50 ? 1 : 0;
  const tc = ["#d9534f", "#e0a046", "#8a7f6e", "#6fcf6f", "#6fcf6f"][t];
  const fr = Engine.factionRep(g, meta.faction);
  document.getElementById("dlg-standing").innerHTML =
    `<span class="tier" style="color:${tc}">${tierName[t]} them (${rec.disp})</span>
     <span class="muted" style="margin-left:8px">faction standing: ${fr}</span>`;

  const line = greeting ? People.pickGreet(meta, rec.disp) : (d.lastLine || "");
  document.getElementById("dlg-line").textContent = line;

  const tradeBtn = document.getElementById("dlg-trade");
  tradeBtn.disabled = !(AXIOM.MARKETS[g.here] || []).length;
}

function chooseDialog(mode) {
  const g = State.data, d = World._dialog; if (!d || g.over) return;
  const res = Actions.converse(g, d.meta, mode);
  d.lastLine = res.line;
  document.getElementById("dlg-line").textContent = res.line;
  renderDialog(false);
  World.updateHUD();
  State.save();
  if (res.openMarket && mode === "Trade") { closeDialog(); World.togglePanels(true); World.showPanel("market"); }
}

function chooseRob() {
  const g = State.data, d = World._dialog; if (!d || g.over) return;
  const res = Actions.rob(g, d.meta);
  d.lastLine = res.msg;
  document.getElementById("dlg-line").textContent = res.msg;
  renderDialog(false);
  World.updateHUD();
  State.save();
  if (typeof Story !== "undefined" && Story.check) Story.check(g);
  // a botched robbery ends the conversation
  if (!res.robbed) setTimeout(closeDialog, 900);
}

function closeDialog() {
  document.getElementById("dialog").hidden = true;
  World._dialog = null;
}

/* A simple front-view portrait drawn from the body's colours. */
function drawPortrait(ap) {
  const c = document.getElementById("dlg-portrait"); if (!c) return;
  const x = c.getContext("2d");
  x.clearRect(0, 0, 96, 120);
  const hex = (n) => "#" + n.toString(16).padStart(6, "0");
  let tw = 30, head = 24;
  if (ap.build === "thin") tw = 22; if (ap.build === "muscular") tw = 38; if (ap.build === "fat") tw = 44;
  const cx = 48;
  // legs
  x.fillStyle = hex(ap.cloth2); x.fillRect(cx - tw / 2 + 3, 78, tw / 2 - 4, 36); x.fillRect(cx + 2, 78, tw / 2 - 4, 36);
  // torso
  x.fillStyle = hex(ap.cloth); x.fillRect(cx - tw / 2, 44, tw, 38);
  // arms
  x.fillRect(cx - tw / 2 - 8, 46, 8, 34); x.fillRect(cx + tw / 2, 46, 8, 34);
  // head
  x.fillStyle = hex(ap.skin); x.fillRect(cx - head / 2, 16, head, head + 4);
  // hair
  x.fillStyle = hex(ap.hair); x.fillRect(cx - head / 2 - 1, 12, head + 2, 9);
  // eyes
  x.fillStyle = "#14100c"; x.fillRect(cx - 6, 26, 3, 3); x.fillRect(cx + 3, 26, 3, 3);
}

})(); // end World3D IIFE
