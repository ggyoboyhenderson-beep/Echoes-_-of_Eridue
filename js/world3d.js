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
      Actions = window.Actions, UI = window.UI;

const World = {};
window.World3D = World;

/* ---- module state ------------------------------------------------------- */
let renderer, scene, camera, clock;
let yaw = 0, pitch = 0;
const keys = {};
const player = { pos: new THREE.Vector3(0, 1.7, 18), vel: new THREE.Vector3() };
let interactables = [];   // {pos, radius, label, type, run}
let focus = null;
let labelSprites = [];
let started = false;
let toastTimer = 0;

const ACTIVATE = 4.2;     // proximity radius to interact
const BOUND = 27;         // half-size of a district plot

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
  renderer.shadowMap.enabled = false;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  camera = new THREE.PerspectiveCamera(72, 1, 0.1, 400);
  clock = new THREE.Clock();
  scene = new THREE.Scene();

  resize();
  addEventListener("resize", resize);

  // input
  addEventListener("keydown", (e) => {
    keys[e.code] = true;
    if (e.code === "KeyE") { if (dialogOpen()) closeDialog(); else World.interact(); }
    if (e.code === "Tab") { e.preventDefault(); if (!dialogOpen()) World.togglePanels(); }
  });
  addEventListener("keyup", (e) => { keys[e.code] = false; });

  canvas.addEventListener("click", () => { if (!panelsOpen() && !dialogOpen()) canvas.requestPointerLock(); });

  // dialogue buttons
  document.getElementById("dlg-friendly").onclick = () => chooseDialog("Friendly");
  document.getElementById("dlg-neutral").onclick = () => chooseDialog("Neutral");
  document.getElementById("dlg-trade").onclick = () => chooseDialog("Trade");
  document.getElementById("dlg-leave").onclick = () => closeDialog();
  document.addEventListener("pointerlockmove", () => {});
  document.addEventListener("mousemove", (e) => {
    if (document.pointerLockElement === canvas) {
      yaw -= e.movementX * 0.0022;
      pitch = Math.max(-1.2, Math.min(1.2, pitch - e.movementY * 0.0022));
    }
  });

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
}

/* ======================================================================== */
World.start = function () {
  started = true;
  World.buildDistrict(State.data.here, true);
  World.updateHUD();
};

/* ---- helpers to add geometry -------------------------------------------- */
function box(w, h, d, color, x, y, z, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color, roughness: opts.rough ?? 0.9, metalness: opts.metal ?? 0.0,
    emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.ei ?? 1,
  });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  scene.add(m);
  return m;
}
function light(color, intensity, x, y, z, dist = 30) {
  const l = new THREE.PointLight(color, intensity, dist, 2);
  l.position.set(x, y, z); scene.add(l); return l;
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

  scene.background = new THREE.Color(theme.sky);
  scene.fog = new THREE.Fog(theme.sky, theme.fogNear, theme.fogFar);
  scene.add(new THREE.HemisphereLight(theme.hemiSky, theme.hemiGround, theme.hemiInt));
  const sun = new THREE.DirectionalLight(theme.sun, theme.sunInt);
  sun.position.set(20, 40, 10); scene.add(sun);

  // ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(BOUND * 2 + 8, BOUND * 2 + 8),
    new THREE.MeshStandardMaterial({ color: theme.ground, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2; scene.add(ground);

  // perimeter wall (with gate gaps implied by short height)
  const ph = theme.wallH;
  for (const [w, h, dz, x, y, z] of [
    [BOUND * 2, ph, 1, 0, ph / 2, -BOUND],
    [BOUND * 2, ph, 1, 0, ph / 2, BOUND],
    [1, ph, BOUND * 2, -BOUND, ph / 2, 0],
    [1, ph, BOUND * 2, BOUND, ph / 2, 0],
  ]) box(w, h, dz, theme.wall, x, y, z, { rough: 1 });

  // era architecture
  theme.build(rnd);

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

  // gates to adjacent districts on the perimeter
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

  // populate the district with people who live in it
  spawnPeople(g, id, rnd);

  // spawn
  if (spawnCenter) { player.pos.set(0, 1.7, 16); yaw = Math.PI; pitch = 0; }
  player.vel.set(0, 0, 0);

  World.updateHUD();
};

function station(type, label, color, run) { return { type, label, color, run }; }

/* ======================================================================== */
/* PEOPLE — anatomically-built humanoids that walk, react, and remember.    */
let agents = [];
const REACT = 7.5;        // distance at which a person notices and turns to you

/* Build a humanoid from torso/head/limbs with varied proportions. */
function makeHuman(ap) {
  const grp = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: ap.skin, roughness: 0.85 });
  const hairM = new THREE.MeshStandardMaterial({ color: ap.hair, roughness: 0.9 });
  const cloth = new THREE.MeshStandardMaterial({ color: ap.cloth, roughness: 0.95 });
  const cloth2 = new THREE.MeshStandardMaterial({ color: ap.cloth2, roughness: 0.95 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x14100c, roughness: 0.6 });
  const mk = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);

  // proportions by build
  let tw = 0.42, td = 0.24, aw = 0.13, belly = 0;
  if (ap.build === "thin")     { tw = 0.34; td = 0.20; aw = 0.11; }
  if (ap.build === "muscular") { tw = 0.52; td = 0.30; aw = 0.17; }
  if (ap.build === "fat")      { tw = 0.56; td = 0.40; aw = 0.15; belly = 0.18; }
  const legH = 0.82, torsoH = 0.66, headS = 0.26, armLen = 0.60;
  const shoulderY = legH + torsoH;

  // legs (pivot at hip so they can swing)
  const legX = tw * 0.28;
  const mkLeg = (sx) => {
    const piv = new THREE.Object3D(); piv.position.set(sx, legH, 0);
    const thigh = mk(0.17, legH, 0.18, cloth2); thigh.position.y = -legH / 2; piv.add(thigh);
    const foot = mk(0.18, 0.12, 0.30, dark); foot.position.set(0, -legH + 0.02, 0.06); piv.add(foot);
    grp.add(piv); return piv;
  };
  const llegPivot = mkLeg(-legX), rlegPivot = mkLeg(legX);

  // torso
  const torso = mk(tw, torsoH, td, cloth); torso.position.y = legH + torsoH / 2; grp.add(torso);
  if (belly) { const b = mk(tw * 0.9, torsoH * 0.5, td + belly, cloth); b.position.set(0, legH + torsoH * 0.35, 0.04); grp.add(b); }

  // arms (pivot at shoulder)
  const armX = tw / 2 + aw / 2;
  const mkArm = (sx) => {
    const piv = new THREE.Object3D(); piv.position.set(sx, shoulderY - 0.05, 0);
    const upper = mk(aw, armLen, aw, cloth); upper.position.y = -armLen / 2; piv.add(upper);
    const hand = mk(aw * 1.1, 0.14, aw * 1.1, skin); hand.position.y = -armLen + 0.02; piv.add(hand);
    grp.add(piv); return piv;
  };
  const larmPivot = mkArm(-armX), rarmPivot = mkArm(armX);

  // neck + head
  const neck = mk(0.12, 0.1, 0.12, skin); neck.position.y = shoulderY + 0.05; grp.add(neck);
  const head = mk(headS, headS + 0.04, headS, skin); head.position.y = shoulderY + 0.05 + headS / 2 + 0.05; grp.add(head);
  // face (on +Z)
  const fz = headS / 2 + 0.001;
  const eyeL = mk(0.05, 0.04, 0.02, dark); eyeL.position.set(-0.06, 0.03, fz); head.add(eyeL);
  const eyeR = eyeL.clone(); eyeR.position.x = 0.06; head.add(eyeR);
  const nose = mk(0.04, 0.06, 0.04, skin); nose.position.set(0, -0.01, fz); head.add(nose);
  const mouth = mk(0.10, 0.02, 0.02, dark); mouth.position.set(0, -0.08, fz); head.add(mouth);
  // hair (cap + back)
  const cap = mk(headS + 0.03, 0.10, headS + 0.03, hairM); cap.position.set(0, headS / 2 + 0.02, 0); head.add(cap);
  const back = mk(headS + 0.02, headS * 0.7, 0.06, hairM); back.position.set(0, 0.04, -headS / 2 - 0.01); head.add(back);

  // overall scale for tall/short
  let s = 1; if (ap.build === "tall") s = 1.15; if (ap.build === "short") s = 0.82;
  grp.scale.setScalar(s);

  return { grp, parts: { llegPivot, rlegPivot, larmPivot, rarmPivot, head } };
}

/* Spawn the named principals + ambient residents as walking agents. */
function spawnPeople(g, id, rnd) {
  agents = [];
  const metas = [];
  for (const def of Engine.npcAt(g, id)) {
    metas.push({ id: def.id, name: def.name, role: def.role, kind: def.kind,
      faction: def.faction, district: id, ambient: false, hub: def.hub,
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

/* test/debug hooks */
World._agentCount = () => agents.length;
World._agentPositions = () => agents.map((a) => [a.grp.position.x.toFixed(2), a.grp.position.z.toFixed(2), a.state]);
World._openFirstDialogue = () => { if (agents[0]) openDialogue(agents[0].meta, agents[0]); };

function pickWander(rnd) {
  const r = (rnd ? rnd() : Math.random());
  const a = (rnd ? rnd() : Math.random()) * Math.PI * 2;
  const rad = 6 + r * (BOUND - 9);
  return new THREE.Vector3(Math.cos(a) * rad, 0, Math.sin(a) * rad);
}

function updateAgents(dt) {
  const dlgAgent = World._dialog && World._dialog.agent;
  for (const ag of agents) {
    const gp = ag.grp.position;
    const dxp = player.pos.x - gp.x, dzp = player.pos.z - gp.z;
    const distP = Math.hypot(dxp, dzp);
    let moving = false, targetFacing = ag.facing;

    if (ag === dlgAgent || distP < REACT) {
      // react to your approach: stop and turn to face you
      ag.state = "react";
      targetFacing = Math.atan2(dxp, dzp);
      if (!ag.greeted) ag.greeted = true;
    } else {
      ag.state = "wander";
      const dx = ag.target.x - gp.x, dz = ag.target.z - gp.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.0) { ag.target = pickWander(); }
      else {
        const step = ag.speed * dt;
        gp.x += (dx / d) * step; gp.z += (dz / d) * step;
        moving = true; targetFacing = Math.atan2(dx, dz);
      }
    }

    // smooth turn
    let df = targetFacing - ag.facing;
    while (df > Math.PI) df -= Math.PI * 2; while (df < -Math.PI) df += Math.PI * 2;
    ag.facing += df * Math.min(1, dt * 8);
    ag.grp.rotation.y = ag.facing;

    // limb swing (natural arm-leg counter-swing while walking)
    const targetAmp = moving ? 0.55 : 0;
    ag.amp += (targetAmp - ag.amp) * Math.min(1, dt * 6);
    ag.phase += dt * ag.speed * 5.5;
    const sw = Math.sin(ag.phase) * ag.amp;
    ag.parts.llegPivot.rotation.x = sw;
    ag.parts.rlegPivot.rotation.x = -sw;
    ag.parts.larmPivot.rotation.x = -sw;
    ag.parts.rarmPivot.rotation.x = sw;
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

/* ======================================================================== */
/* Per-era architecture builders. Each adds meshes; `rnd` is seeded.        */
const THEMES = {
  ziggurat_crown: {
    sky: 0x3a2c1c, ground: 0xb59668, wall: 0x8a6e4a, wallH: 7,
    fogNear: 18, fogFar: 90, hemiSky: 0xffe0b0, hemiGround: 0x5a4530, hemiInt: 0.7,
    sun: 0xffd9a0, sunInt: 1.1,
    build(rnd) {
      // central stepped ziggurat
      const tiers = 6; let w = 16;
      for (let i = 0; i < tiers; i++) {
        box(w, 1.6, w, i % 2 ? 0x9a7a52 : 0x8a6e4a, 0, 0.8 + i * 1.6, 0, { rough: 1 });
        w -= 2.2;
      }
      box(3, 2, 3, 0xc89a55, 0, tiers * 1.6 + 1, 0, { emissive: 0x402a10, ei: 0.6 });
      light(0xffcf80, 10, 0, tiers * 1.6 + 2, 0, 40);
    },
  },
  hanging_market: {
    sky: 0x2a2418, ground: 0x9a8458, wall: 0x6a5838, wallH: 6,
    fogNear: 16, fogFar: 80, hemiSky: 0xffe6b8, hemiGround: 0x4a3c28, hemiInt: 0.7,
    sun: 0xffdca0, sunInt: 0.9,
    build(rnd) {
      // terraced platforms + colourful stalls
      for (let t = 0; t < 3; t++) {
        box(40 - t * 8, 1, 40 - t * 8, t % 2 ? 0x7a6444 : 0x6a5838, 0, 0.5 + t, 0, { rough: 1 });
      }
      const cols = [0xb0452b, 0x2b7ab0, 0x2bb06a, 0xb0962b, 0x7a2bb0];
      for (let i = 0; i < 24; i++) {
        const x = (rnd() - 0.5) * 44, z = (rnd() - 0.5) * 44;
        if (Math.hypot(x, z) < 13) continue;
        box(1.6, 1.6, 1.6, cols[(rnd() * cols.length) | 0], x, 0.8 + 3, z, { rough: 0.8 });
        box(2.2, 0.2, 2.2, 0xcfa86a, x, 2 + 3, z); // awning
      }
    },
  },
  god_quarter: {
    sky: 0x161a22, ground: 0x3a3a44, wall: 0x2a2c34, wallH: 9,
    fogNear: 10, fogFar: 60, hemiSky: 0x9aa6c0, hemiGround: 0x202028, hemiInt: 0.4,
    sun: 0x8090b0, sunInt: 0.4,
    build(rnd) {
      // ring of tall columns + central glowing altar
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2, r = 17;
        box(1.4, 14, 1.4, 0x3a3c46, Math.cos(a) * r, 7, Math.sin(a) * r, { rough: 1 });
      }
      box(4, 1, 4, 0x4a4c58, 0, 0.5, 0, {});
      const altar = box(2, 2, 2, 0xe6b450, 0, 2, 0, { emissive: 0xe6b450, ei: 0.8 });
      light(0xffd070, 9, 0, 3.5, 0, 22);
    },
  },
  ironwall: {
    sky: 0x1c1c1e, ground: 0x44423e, wall: 0x33312e, wallH: 12,
    fogNear: 12, fogFar: 55, hemiSky: 0x9a9690, hemiGround: 0x222020, hemiInt: 0.35,
    sun: 0xb0a890, sunInt: 0.4,
    build(rnd) {
      // tall fortified blocks + corner towers, oppressive
      for (let i = 0; i < 5; i++) {
        const x = (rnd() - 0.5) * 36, z = (rnd() - 0.5) * 36;
        if (Math.hypot(x, z) < 12) continue;
        const h = 8 + rnd() * 8;
        box(5, h, 5, 0x35332f, x, h / 2, z, { rough: 1 });
        // narrow second-storey window slits (emissive)
        box(0.3, 0.8, 0.3, 0x4a3520, x, h * 0.6, z + 2.6, { emissive: 0xff7a30, ei: 0.6 });
      }
      for (const [sx, sz] of [[-22, -22], [22, -22], [-22, 22], [22, 22]])
        box(4, 16, 4, 0x2e2c29, sx, 8, sz, { rough: 1 });
    },
  },
  broken_crown: {
    sky: 0x241c16, ground: 0x4a3e30, wall: 0x3a3026, wallH: 6,
    fogNear: 14, fogFar: 65, hemiSky: 0xd0b088, hemiGround: 0x2a2018, hemiInt: 0.6,
    sun: 0xffc080, sunInt: 0.6,
    build(rnd) {
      // organic stacked shanties + cookfire lights
      const cols = [0x6a5236, 0x7a5a3a, 0x5a4a3a, 0x8a6a44];
      for (let i = 0; i < 40; i++) {
        const x = (rnd() - 0.5) * 46, z = (rnd() - 0.5) * 46;
        if (Math.hypot(x, z) < 9) continue;
        const stack = 1 + ((rnd() * 3) | 0);
        for (let s = 0; s < stack; s++) {
          const sz = 2 + rnd() * 1.5;
          box(sz, 2, sz, cols[(rnd() * cols.length) | 0], x + (rnd() - 0.5), 1 + s * 2, z + (rnd() - 0.5), { rough: 1 });
        }
        if (rnd() > 0.7) light(0xff8030, 3, x, 1.5, z, 7); // cookfire
      }
    },
  },
  neon_labyrinth: {
    sky: 0x0a0a12, ground: 0x14141c, wall: 0x1a1a26, wallH: 16,
    fogNear: 10, fogFar: 55, hemiSky: 0x303048, hemiGround: 0x08080c, hemiInt: 0.3,
    sun: 0x4040a0, sunInt: 0.25,
    build(rnd) {
      const neon = [0x38d0c8, 0xff5c7a, 0xc850ff, 0x50ff9a, 0xffd23a];
      for (let i = 0; i < 18; i++) {
        const x = (rnd() - 0.5) * 46, z = (rnd() - 0.5) * 46;
        if (Math.hypot(x, z) < 10) continue;
        const h = 10 + rnd() * 18;
        box(4, h, 4, 0x16161f, x, h / 2, z, { rough: 0.5, metal: 0.3 });
        const c = neon[(rnd() * neon.length) | 0];
        // vertical neon strips
        box(0.3, h * 0.8, 0.3, c, x + 2.1, h / 2, z, { emissive: c, ei: 1.4 });
        box(0.3, 0.3, 4.2, c, x, h * (0.3 + rnd() * 0.5), z, { emissive: c, ei: 1.2 });
        if (rnd() > 0.5) light(c, 5, x, h * 0.5, z, 14);
      }
    },
  },
  spire: {
    sky: 0x9ab0c8, ground: 0xc8ccd2, wall: 0xdfe4ea, wallH: 14,
    fogNear: 30, fogFar: 140, hemiSky: 0xffffff, hemiGround: 0x90a0b0, hemiInt: 0.9,
    sun: 0xffffff, sunInt: 1.4,
    build(rnd) {
      // clean tall glass towers, sterile
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2, r = 16 + rnd() * 4;
        const x = Math.cos(a) * r, z = Math.sin(a) * r, h = 26 + rnd() * 20;
        box(5, h, 5, 0xeaf0f6, x, h / 2, z, { rough: 0.1, metal: 0.6, emissive: 0x223344, ei: 0.15 });
      }
      box(8, 1, 8, 0xf0f4f8, 0, 0.5, 0, { metal: 0.4, rough: 0.2 });
    },
  },
  sub_strata: {
    sky: 0x05070a, ground: 0x171c18, wall: 0x12161a, wallH: 5,
    fogNear: 6, fogFar: 34, hemiSky: 0x16301f, hemiGround: 0x05080a, hemiInt: 0.35,
    sun: 0x103018, sunInt: 0.15,
    build(rnd) {
      // low ceiling + pillars + bioluminescent points
      const ceil = new THREE.Mesh(
        new THREE.PlaneGeometry(BOUND * 2 + 8, BOUND * 2 + 8),
        new THREE.MeshStandardMaterial({ color: 0x0c100e, roughness: 1 })
      );
      ceil.rotation.x = Math.PI / 2; ceil.position.y = 6; scene.add(ceil);
      for (let i = 0; i < 24; i++) {
        const x = (rnd() - 0.5) * 48, z = (rnd() - 0.5) * 48;
        if (Math.hypot(x, z) < 7) continue;
        box(1.4, 6, 1.4, 0x14181c, x, 3, z, { rough: 1 });
        if (rnd() > 0.4) {
          const fung = box(0.5, 0.5, 0.5, 0x4dff9a, x, 1 + rnd() * 4, z + 0.9, { emissive: 0x4dff9a, ei: 1.6 });
          light(0x4dff9a, 2.2, x, fung.position.y, z + 0.9, 6);
        }
      }
    },
  },
  _default: {
    sky: 0x222222, ground: 0x555555, wall: 0x444444, wallH: 6,
    fogNear: 16, fogFar: 80, hemiSky: 0xaaaaaa, hemiGround: 0x333333, hemiInt: 0.6,
    sun: 0xffffff, sunInt: 0.8, build() {},
  },
};

/* ======================================================================== */
/* main loop                                                                */
function loop() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (started && !panelsOpen() && !dialogOpen()) updateMovement(dt);
  if (started) updateAgents(dt);

  // camera orientation
  camera.position.copy(player.pos);
  const dir = new THREE.Vector3(
    Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)
  );
  camera.lookAt(player.pos.clone().add(dir));

  // billboards already face camera (sprites). Update focus.
  if (started) updateFocus();

  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) document.getElementById("toast").textContent = ""; }

  renderer.render(scene, camera);
}

function updateMovement(dt) {
  const speed = 8;
  const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  const s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const move = new THREE.Vector3().addScaledVector(fwd, f).addScaledVector(right, s);
  if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed * dt);
  player.pos.add(move);
  // clamp to plot
  player.pos.x = Math.max(-BOUND + 1.5, Math.min(BOUND - 1.5, player.pos.x));
  player.pos.z = Math.max(-BOUND + 1.5, Math.min(BOUND - 1.5, player.pos.z));
  player.pos.y = 1.7;
}

function updateFocus() {
  let best = null, bestD = Infinity;
  for (const it of interactables) {
    const dx = it.pos.x - player.pos.x, dz = it.pos.z - player.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < it.radius && dist < bestD) { best = it; bestD = dist; }
  }
  focus = best;
  const prompt = document.getElementById("prompt");
  if (focus) prompt.innerHTML = `<span class="key">E</span> ${focus.label}`;
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
  document.getElementById("hud-district").textContent = d.name;

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
  State.save();
  World.updateHUD();
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
  document.getElementById("dlg-name").textContent = meta.name;
  const pers = People.personality(meta.kind);
  document.getElementById("dlg-role").textContent =
    `${meta.role} · ${AXIOM.FACTIONS[meta.faction] || "Unaffiliated"} — ${pers}`;

  // standing with this person + their faction
  const tierName = ["marked", "disliked", "known to", "trusted by", "honored by"];
  const t = rec.disp > 50 ? 4 : rec.disp > 15 ? 3 : rec.disp > -15 ? 2 : rec.disp > -50 ? 1 : 0;
  const tc = ["#d9534f", "#e0a046", "#8a7f6e", "#6fcf6f", "#6fcf6f"][t];
  const fr = Engine.factionRep(g, meta.faction);
  document.getElementById("dlg-standing").innerHTML =
    `<span class="tier" style="color:${tc}">${tierName[t]} them (${rec.disp})</span>
     <span class="muted" style="margin-left:8px">faction standing: ${fr}</span>`;

  const line = greeting ? People.pickGreet(meta.kind, rec.disp) : (d.lastLine || "");
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
