/* ==========================================================================
 * AXIOM — Audio
 * "Every District Has a Sound" (Chapter 15). Soundscapes are SYNTHESIZED with
 * the Web Audio API — no audio files, no assets. Each district gets its own
 * acoustic signature: the slow resonant air of ancient stone, the electrical
 * hum of the failing grid, the deep rumble of the world beneath.
 *
 * Audio needs a user gesture to start (browser policy); GameAudio.ensure() is
 * called on the first click. Toggle with M.
 * ========================================================================== */

const GameAudio = {};
window.GameAudio = GameAudio;

GameAudio.ctx = null;
GameAudio.master = null;
GameAudio.nodes = [];
GameAudio.enabled = true;
GameAudio.current = null;

/* white-noise buffer, reused */
GameAudio._noise = null;
GameAudio._noiseBuf = function () {
  if (GameAudio._noise) return GameAudio._noise;
  const ctx = GameAudio.ctx, len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  GameAudio._noise = buf; return buf;
};

GameAudio.ensure = function () {
  if (GameAudio.ctx) { if (GameAudio.ctx.state === "suspended") GameAudio.ctx.resume(); return; }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    GameAudio.ctx = new AC();
    GameAudio.master = GameAudio.ctx.createGain();
    GameAudio.master.gain.value = 0;
    GameAudio.master.connect(GameAudio.ctx.destination);
    if (GameAudio.current) GameAudio.setDistrict(GameAudio.current.id, GameAudio.current.night);
  } catch (e) { GameAudio.ctx = null; }
};

GameAudio._stop = function () {
  for (const n of GameAudio.nodes) { try { n.stop ? n.stop() : n.disconnect(); } catch (e) {} }
  GameAudio.nodes = [];
};

/* one looping filtered-noise layer */
GameAudio._noiseLayer = function (type, freq, q, gain, lfoRate, lfoDepth) {
  const ctx = GameAudio.ctx;
  const src = ctx.createBufferSource(); src.buffer = GameAudio._noiseBuf(); src.loop = true;
  const filt = ctx.createBiquadFilter(); filt.type = type; filt.frequency.value = freq; filt.Q.value = q || 1;
  const g = ctx.createGain(); g.gain.value = gain;
  src.connect(filt); filt.connect(g); g.connect(GameAudio.master);
  src.start();
  GameAudio.nodes.push(src, filt, g);
  if (lfoRate) { // slow tremolo for "wind" / "buzz" movement
    const lfo = ctx.createOscillator(); lfo.frequency.value = lfoRate;
    const lg = ctx.createGain(); lg.gain.value = lfoDepth || gain * 0.5;
    lfo.connect(lg); lg.connect(g.gain); lfo.start(); GameAudio.nodes.push(lfo, lg);
  }
  return g;
};

/* one drone oscillator */
GameAudio._drone = function (type, freq, gain, detune) {
  const ctx = GameAudio.ctx;
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; if (detune) o.detune.value = detune;
  const g = ctx.createGain(); g.gain.value = gain;
  o.connect(g); g.connect(GameAudio.master); o.start();
  GameAudio.nodes.push(o, g); return o;
};

/* Per-district acoustic recipe. */
GameAudio.RECIPES = {
  ziggurat_crown: (n) => { GameAudio._drone("sine", 70, 0.05); GameAudio._noiseLayer("lowpass", 500, 1, 0.02, 0.08, 0.01); },
  hanging_market: (n) => { GameAudio._noiseLayer("bandpass", 900, 0.7, 0.05, 0, 0); GameAudio._noiseLayer("bandpass", 1800, 1, 0.025, 0.3, 0.02); GameAudio._drone("sine", 110, 0.02); },
  god_quarter:    (n) => { GameAudio._drone("sine", 55, 0.06); GameAudio._drone("sine", 82.5, 0.03, 4); GameAudio._noiseLayer("lowpass", 300, 2, 0.012, 0.05, 0.006); },
  ironwall:       (n) => { GameAudio._noiseLayer("lowpass", 700, 0.6, 0.035, 0.12, 0.02); GameAudio._drone("sine", 60, 0.04); },
  broken_crown:   (n) => { GameAudio._noiseLayer("bandpass", 700, 0.8, 0.04, 0.4, 0.02); GameAudio._drone("sine", 95, 0.025); },
  neon_labyrinth: (n) => { GameAudio._drone("sawtooth", 60, 0.018); GameAudio._noiseLayer("highpass", 3000, 1, 0.02, 8, 0.012); GameAudio._noiseLayer("bandpass", 1400, 2, 0.02, 0.6, 0.015); },
  spire:          (n) => { GameAudio._drone("sine", 220, 0.018); GameAudio._drone("sine", 330, 0.012, 3); GameAudio._noiseLayer("highpass", 5000, 1, 0.008, 0, 0); },
  sub_strata:     (n) => { GameAudio._drone("sine", 42, 0.08); GameAudio._noiseLayer("lowpass", 180, 2, 0.02, 0.03, 0.01); GameAudio._drone("sine", 63, 0.02, 6); },
  interior:       (n) => { GameAudio._drone("sine", 80, 0.03); GameAudio._noiseLayer("lowpass", 600, 1, 0.012, 0.1, 0.006); },
  region:         (n) => { GameAudio._noiseLayer("lowpass", 420, 0.5, 0.04, 0.07, 0.02); GameAudio._noiseLayer("bandpass", 1100, 1.5, 0.012, 0.2, 0.008); GameAudio._drone("sine", 65, 0.02); },
};

GameAudio.setDistrict = function (id, night) {
  GameAudio.current = { id, night };
  if (!GameAudio.ctx) return;
  GameAudio._stop();
  const recipe = GameAudio.RECIPES[id] || GameAudio.RECIPES.interior;
  recipe(night);
  const target = GameAudio.enabled ? 0.5 : 0;
  const t = GameAudio.ctx.currentTime;
  GameAudio.master.gain.cancelScheduledValues(t);
  GameAudio.master.gain.setValueAtTime(GameAudio.master.gain.value, t);
  GameAudio.master.gain.linearRampToValueAtTime(target, t + 1.2);
};

GameAudio.toggle = function () {
  GameAudio.enabled = !GameAudio.enabled;
  if (GameAudio.master) {
    const t = GameAudio.ctx.currentTime;
    GameAudio.master.gain.cancelScheduledValues(t);
    GameAudio.master.gain.setValueAtTime(GameAudio.master.gain.value, t);
    GameAudio.master.gain.linearRampToValueAtTime(GameAudio.enabled ? 0.5 : 0, t + 0.4);
  }
  return GameAudio.enabled;
};
