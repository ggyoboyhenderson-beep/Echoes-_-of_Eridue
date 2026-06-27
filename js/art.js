/* ==========================================================================
 * AXIOM — Art
 * Original, self-generated graphic art: procedural era textures for the 3D
 * world, plus authored SVG crests, faction sigils, and a logo glyph. No
 * external or copyrighted assets — everything here is drawn from code.
 * ========================================================================== */

const Art = {};
window.Art = Art;

/* ---- colour helpers ----------------------------------------------------- */
function _rgb(hex) { return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]; }
function _css(hex, a) { const [r, g, b] = _rgb(hex); return `rgba(${r},${g},${b},${a == null ? 1 : a})`; }
function _shade(hex, f) { let [r, g, b] = _rgb(hex); const c = (v) => Math.max(0, Math.min(255, Math.round(v * f))); return `rgb(${c(r)},${c(g)},${c(b)})`; }
function _rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* ==========================================================================
 * Procedural textures (require THREE — loaded before this file).
 * pattern(kind, base, accent) -> CanvasTexture
 * ========================================================================== */
Art.pattern = function (kind, base, accent, seed) {
  const S = 256, c = document.createElement("canvas"); c.width = c.height = S;
  const x = c.getContext("2d");
  const rnd = _rng(seed || 1234);
  x.fillStyle = _shade(base, 1); x.fillRect(0, 0, S, S);

  const grain = (n, max, alpha) => { // subtle surface grain
    for (let i = 0; i < n; i++) {
      x.fillStyle = `rgba(0,0,0,${(rnd() * alpha).toFixed(3)})`;
      x.fillRect(rnd() * S, rnd() * S, 1 + rnd() * max, 1 + rnd() * max);
    }
  };

  switch (kind) {
    case "brick": { // fired-brick running bond
      const bw = 42, bh = 20, mortar = _shade(base, 0.7);
      x.fillStyle = mortar; x.fillRect(0, 0, S, S);
      for (let row = 0, y = 0; y < S; row++, y += bh) {
        const off = (row % 2) * (bw / 2);
        for (let bx = -bw; bx < S; bx += bw) {
          x.fillStyle = _shade(base, 0.85 + rnd() * 0.3);
          x.fillRect(bx + off + 1, y + 1, bw - 2, bh - 2);
        }
      }
      grain(900, 2, 0.18); break;
    }
    case "stone": { // irregular ashlar blocks
      x.fillStyle = _shade(base, 0.6); x.fillRect(0, 0, S, S);
      let y = 0;
      while (y < S) {
        const h = 26 + rnd() * 22; let bx = 0;
        while (bx < S) {
          const w = 34 + rnd() * 40;
          x.fillStyle = _shade(base, 0.8 + rnd() * 0.35);
          x.fillRect(bx + 1.5, y + 1.5, w - 3, h - 3);
          bx += w;
        }
        y += h;
      }
      grain(1200, 3, 0.2); break;
    }
    case "concrete": { // cracked, stained slab
      grain(2600, 3, 0.16);
      x.strokeStyle = _shade(base, 0.55); x.lineWidth = 1.4;
      for (let i = 0; i < 7; i++) { // cracks
        x.beginPath(); let px = rnd() * S, py = rnd() * S; x.moveTo(px, py);
        for (let s = 0; s < 6; s++) { px += (rnd() - 0.5) * 60; py += (rnd() - 0.5) * 60; x.lineTo(px, py); }
        x.stroke();
      }
      for (let i = 0; i < 20; i++) { x.fillStyle = `rgba(0,0,0,${(rnd() * 0.1).toFixed(3)})`; x.fillRect(rnd() * S, rnd() * S, 20 + rnd() * 50, 20 + rnd() * 50); }
      break;
    }
    case "shanty": { // patchwork salvage
      for (let i = 0; i < 90; i++) {
        x.fillStyle = _shade(base, 0.6 + rnd() * 0.6);
        x.fillRect(rnd() * S, rnd() * S, 12 + rnd() * 40, 10 + rnd() * 30);
      }
      x.globalAlpha = 0.5; grain(1400, 2, 0.2); x.globalAlpha = 1; break;
    }
    case "neon": { // dark deck with a glowing grid
      x.fillStyle = _shade(base, 1); x.fillRect(0, 0, S, S);
      grain(1800, 2, 0.25);
      const g = 32;
      x.strokeStyle = _css(accent, 0.5); x.lineWidth = 1;
      x.shadowColor = _css(accent, 0.9); x.shadowBlur = 6;
      for (let i = 0; i <= S; i += g) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, S); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(S, i); x.stroke(); }
      x.shadowBlur = 0; break;
    }
    case "marble": { // clean veined stone
      x.fillStyle = _shade(base, 1); x.fillRect(0, 0, S, S);
      x.strokeStyle = _shade(base, 0.82); x.lineWidth = 1.2;
      for (let i = 0; i < 14; i++) {
        x.beginPath(); let px = rnd() * S, py = rnd() * S; x.moveTo(px, py);
        for (let s = 0; s < 8; s++) { px += (rnd() - 0.5) * 70; py += (rnd() - 0.5) * 40; x.lineTo(px, py); } x.stroke();
      }
      const g2 = 64; x.strokeStyle = _shade(base, 0.9); x.lineWidth = 0.6;
      for (let i = 0; i <= S; i += g2) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, S); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(S, i); x.stroke(); }
      break;
    }
    case "fungal": { // wet dark rock with bioluminescence
      x.fillStyle = _shade(base, 1); x.fillRect(0, 0, S, S);
      grain(2200, 3, 0.3);
      for (let i = 0; i < 60; i++) {
        const r = 1 + rnd() * 3; x.fillStyle = `rgba(77,255,154,${(0.15 + rnd() * 0.5).toFixed(3)})`;
        x.shadowColor = "rgba(77,255,154,0.9)"; x.shadowBlur = 8;
        x.beginPath(); x.arc(rnd() * S, rnd() * S, r, 0, 7); x.fill();
      }
      x.shadowBlur = 0; break;
    }
    case "sand": default: { // layered sediment bands
      for (let y = 0; y < S; y += 6 + rnd() * 6) {
        x.fillStyle = _shade(base, 0.85 + rnd() * 0.3); x.fillRect(0, y, S, 6 + rnd() * 6);
      }
      grain(1000, 2, 0.12); break;
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
};

/* --------------------------------------------------------------------------
 * Grayscale DETAIL textures for buildings & clothing. These are near-white
 * with darker pattern lines, so when used as a `map` they multiply against the
 * material's colour — one texture textures objects of any colour.
 * -------------------------------------------------------------------------- */
Art._gray = {};
Art.grayPattern = function (kind) {
  if (Art._gray[kind]) return Art._gray[kind];
  const S = 128, c = document.createElement("canvas"); c.width = c.height = S;
  const x = c.getContext("2d");
  const rnd = _rng(kind.length * 777 + 3);
  const G = (v) => `rgb(${v},${v},${v})`;
  x.fillStyle = G(232); x.fillRect(0, 0, S, S);

  switch (kind) {
    case "brick": { // running-bond brick, dark mortar
      const bw = 32, bh = 16;
      x.fillStyle = G(150); x.fillRect(0, 0, S, S);
      for (let row = 0, y = 0; y < S; row++, y += bh)
        for (let bx = -bw; bx < S; bx += bw) {
          const off = (row % 2) * (bw / 2);
          x.fillStyle = G(210 + (rnd() * 35 | 0));
          x.fillRect(bx + off + 1.5, y + 1.5, bw - 3, bh - 3);
        }
      break;
    }
    case "stone": { // irregular ashlar, dark grout
      x.fillStyle = G(140); x.fillRect(0, 0, S, S);
      let y = 0;
      while (y < S) { const h = 18 + rnd() * 18; let bx = 0;
        while (bx < S) { const w = 24 + rnd() * 30; x.fillStyle = G(195 + (rnd() * 45 | 0));
          x.fillRect(bx + 2, y + 2, w - 4, h - 4); bx += w; } y += h; }
      break;
    }
    case "concrete": { // grain + faint seams + stains
      for (let i = 0; i < 1400; i++) { const v = 200 + (rnd() * 55 | 0); x.fillStyle = G(v); x.fillRect(rnd() * S, rnd() * S, 1, 1); }
      x.strokeStyle = G(170); x.lineWidth = 1;
      for (let i = 0; i < 3; i++) { const px = (rnd() * S) | 0; x.beginPath(); x.moveTo(px, 0); x.lineTo(px, S); x.stroke(); }
      for (let i = 0; i < 10; i++) { x.fillStyle = `rgba(0,0,0,${(rnd() * 0.08).toFixed(3)})`; x.fillRect(rnd() * S, rnd() * S, 14 + rnd() * 30, 14 + rnd() * 30); }
      break;
    }
    case "panel": { // metal panel grid with seams + rivets
      const p = 32; x.fillStyle = G(225); x.fillRect(0, 0, S, S);
      x.strokeStyle = G(150); x.lineWidth = 2;
      for (let i = 0; i <= S; i += p) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, S); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(S, i); x.stroke(); }
      x.fillStyle = G(120);
      for (let gy = p / 2; gy < S; gy += p) for (let gx = p / 2; gx < S; gx += p) { x.beginPath(); x.arc(gx, gy, 1.4, 0, 7); x.fill(); }
      break;
    }
    case "plank": { // horizontal salvage planks
      const ph = 16;
      for (let y = 0; y < S; y += ph) { const v = 195 + (rnd() * 50 | 0); x.fillStyle = G(v); x.fillRect(0, y + 1, S, ph - 2);
        x.fillStyle = G(140); x.fillRect(0, y, S, 1); }
      for (let i = 0; i < 600; i++) { x.fillStyle = `rgba(0,0,0,${(rnd() * 0.12).toFixed(3)})`; x.fillRect(rnd() * S, rnd() * S, 1, 2 + rnd() * 4); }
      break;
    }
    case "cloth": default: { // soft woven fabric
      for (let i = 0; i < 2200; i++) { const v = 205 + (rnd() * 45 | 0); x.fillStyle = G(v); x.fillRect(rnd() * S, rnd() * S, 2, 1); }
      x.strokeStyle = "rgba(0,0,0,0.05)"; x.lineWidth = 1;
      for (let i = 0; i < S; i += 4) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, S); x.stroke(); }
      break;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  Art._gray[kind] = t;
  return t;
};

/* A detail texture cloned to a given tiling (cached by kind+repeat bucket). */
Art._detailCache = {};
Art.detail = function (kind, rw, rh) {
  const key = `${kind}|${rw}|${rh}`;
  if (Art._detailCache[key]) return Art._detailCache[key];
  const base = Art.grayPattern(kind);
  const t = base.clone(); t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rw, rh); t.anisotropy = 4;
  Art._detailCache[key] = t;
  return t;
};

/* Materials for the 3D world, themed per district. */
Art.groundMaterial = function (theme) {
  const t = Art.pattern(theme.tex, theme.ground, theme.texAccent || theme.wall, theme.seed);
  t.repeat.set(theme.groundRepeat || 9, theme.groundRepeat || 9);
  return new THREE.MeshStandardMaterial({ map: t, roughness: 1 });
};
Art.wallMaterial = function (theme) {
  const t = Art.pattern(theme.wallTex || theme.tex, theme.wall, theme.texAccent || theme.ground, (theme.seed || 1) + 7);
  t.repeat.set(6, 2);
  return new THREE.MeshStandardMaterial({ map: t, roughness: 1 });
};

/* ==========================================================================
 * SVG crests & sigils (DOM). Use currentColor so CSS controls the hue.
 * ========================================================================== */
function svg(inner, vb) { return `<svg viewBox="0 0 ${vb || 32} ${vb || 32}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`; }

Art.emblem = function (id) {
  switch (id) {
    case "ziggurat_crown": return svg(`<path d="M6 26h20M9 26v-4h14v4M12 22v-4h8v4M15 18v-4h2v4" fill="currentColor" fill-opacity="0.12"/><path d="M16 6l3 4h-6z" fill="currentColor"/>`);
    case "hanging_market": return svg(`<path d="M16 5v6M9 11h14M9 11l-3 8h6zM23 11l3 8h-6zM6 19a3 3 0 006 0M20 19a3 3 0 006 0" />`);
    case "god_quarter": return svg(`<circle cx="16" cy="16" r="4"/><circle cx="16" cy="16" r="1.5" fill="currentColor"/><path d="M16 4v4M16 24v4M4 16h4M24 16h4M8 8l3 3M21 21l3 3M24 8l-3 3M11 21l-3 3"/>`);
    case "ironwall": return svg(`<path d="M7 7h4v3h3V7h4v3h3V7h4v8a9 12 0 01-11 13A9 12 0 017 15z" fill="currentColor" fill-opacity="0.12"/>`);
    case "broken_crown": return svg(`<path d="M6 22l-2-11 6 5 4-9 2 6-2 3M26 22l2-11-6 5-2-4" fill="currentColor" fill-opacity="0.12"/><path d="M6 22h11M19 18l1 4h6"/>`);
    case "neon_labyrinth": return svg(`<path d="M18 4l-9 13h6l-2 11 11-15h-7z" fill="currentColor" fill-opacity="0.18"/>`);
    case "spire": return svg(`<path d="M16 3l5 23H11zM7 26h18" fill="currentColor" fill-opacity="0.1"/><path d="M16 3l5 23H11z"/>`);
    case "sub_strata": return svg(`<path d="M4 10c4 4 20 4 24 0M5 16c4 4 18 4 22 0M7 22c3 3 15 3 18 0"/>`);
    default: return svg(`<circle cx="16" cy="16" r="6"/>`);
  }
};

Art.sigil = function (faction) {
  switch (faction) {
    case "guild": return svg(`<path d="M16 5v18M9 23h14M16 9l-7 6a4 4 0 008 0zM16 9l7 6a4 4 0 01-8 0z"/>`);
    case "temple": return svg(`<path d="M16 4c3 4 4 7 0 11-4-4-3-7 0-11zM16 15c2 3 3 5 0 9-3-4-2-6 0-9z" fill="currentColor" fill-opacity="0.15"/>`);
    case "ironwall": return svg(`<path d="M6 6l20 20M26 6L6 26" stroke-width="2"/><path d="M6 6l4 1-1 4M26 6l-4 1 1 4M6 26l4-1-1-4M26 26l-4-1 1-4"/>`);
    case "broken_crown": return svg(`<path d="M8 20c2-3 4-3 8-3s6 0 8 3M11 17l1-5 4 4 4-4 1 5" fill="currentColor" fill-opacity="0.12"/>`);
    case "street": return svg(`<path d="M18 4l-9 13h6l-2 11 11-15h-7z" fill="currentColor" fill-opacity="0.2"/>`);
    case "corporate": return svg(`<path d="M16 4l10 6v12l-10 6L6 22V10z" fill="currentColor" fill-opacity="0.1"/><path d="M16 4l10 6v12l-10 6L6 22V10z"/>`);
    case "substrata": return svg(`<circle cx="12" cy="12" r="5"/><path d="M15 15l9 9M21 21l3-1-1-3"/>`);
    case "steppe": return svg(`<circle cx="16" cy="11" r="4"/><path d="M16 4v3M16 15v6M9 22c3-3 11-3 14 0"/>`);
    default: return svg(`<circle cx="16" cy="16" r="5"/>`);
  }
};

/* The title glyph: a stepped ancient base rising into a thin modern spire. */
Art.logo = function () {
  return `<svg viewBox="0 0 120 90" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g stroke="#d8a657" stroke-width="2" stroke-linejoin="round">
      <path d="M16 80h88" />
      <path d="M28 80V68h64v12" fill="#d8a657" fill-opacity="0.08"/>
      <path d="M38 68V56h44v12" fill="#d8a657" fill-opacity="0.08"/>
      <path d="M48 56V44h24v12" fill="#d8a657" fill-opacity="0.08"/>
    </g>
    <g stroke="#38d0c8" stroke-width="2" stroke-linecap="round">
      <path d="M60 44V10" />
      <path d="M60 10l5 6M60 10l-5 6" />
      <path d="M52 30h16M54 24h12M56 18h8" stroke-opacity="0.8"/>
    </g>
    <circle cx="60" cy="8" r="2.5" fill="#38d0c8"/>
  </svg>`;
};
