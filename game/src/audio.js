// Lumenfall Arena — audio: every sound is synthesized with WebAudio, no audio files.
// A tiny synth voice helper (oscillator + gain envelope, optional pitch slide and noise)
// backs the named effects, and a quiet pentatonic arpeggio loops as ambient music.
// The context is created lazily on the first user gesture, as browsers require.

let ctx = null;
let master = null;
let musicGain = null;
let noiseBuffer = null;
let musicTimer = null;
let musicStep = 0;
let muted = false;

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = value;
  if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.02);
}

export function toggleMuted() {
  setMuted(!muted);
  return muted;
}

// Call from any user gesture (key press, click). Safe to call repeatedly and in headless
// browsers: every failure is swallowed and the game simply stays silent.
export function ensureAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return;
  }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.16;
    musicGain.connect(master);
    noiseBuffer = makeNoiseBuffer(ctx);
    startMusic();
  } catch {
    ctx = null;
  }
}

function makeNoiseBuffer(audioCtx) {
  const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.5, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

// One synthesized tone: frequency (optionally sliding to `slideTo`), duration, wave shape,
// peak gain and destination bus. All effects are built from this and noiseBurst.
function tone({ freq, slideTo = null, dur = 0.12, type = 'sine', gain = 0.2, bus = null, delay = 0 }) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
  env.gain.setValueAtTime(gain, t0);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(env).connect(bus ?? master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noiseBurst({ dur = 0.15, gain = 0.2, freq = 1200, q = 0.8, delay = 0 }) {
  if (!ctx || muted || !noiseBuffer) return;
  const t0 = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = q;
  const env = ctx.createGain();
  env.gain.setValueAtTime(gain, t0);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(env).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

// --- Named effects -----------------------------------------------------------

export function sfxShoot() {
  tone({ freq: 880 + Math.random() * 120, slideTo: 340, dur: 0.07, type: 'square', gain: 0.045 });
}

export function sfxHit() {
  noiseBurst({ dur: 0.05, gain: 0.07, freq: 2400 });
}

export function sfxEnemyDie() {
  tone({ freq: 320, slideTo: 60, dur: 0.16, type: 'sawtooth', gain: 0.10 });
  noiseBurst({ dur: 0.12, gain: 0.08, freq: 700 });
}

export function sfxPickup(step = 0) {
  const base = 620 * Math.pow(1.059, Math.min(step, 12));
  tone({ freq: base, dur: 0.06, type: 'sine', gain: 0.07 });
  tone({ freq: base * 1.5, dur: 0.08, type: 'sine', gain: 0.05, delay: 0.03 });
}

export function sfxLevelUp() {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((freq, i) => tone({ freq, dur: 0.16, type: 'triangle', gain: 0.14, delay: i * 0.07 }));
}

export function sfxHurt() {
  tone({ freq: 200, slideTo: 70, dur: 0.2, type: 'sawtooth', gain: 0.16 });
  noiseBurst({ dur: 0.14, gain: 0.12, freq: 400 });
}

export function sfxDash() {
  noiseBurst({ dur: 0.16, gain: 0.09, freq: 1800, q: 0.4 });
  tone({ freq: 300, slideTo: 720, dur: 0.12, type: 'sine', gain: 0.05 });
}

export function sfxBossWarn() {
  for (let i = 0; i < 3; i++) {
    tone({ freq: 146.83, dur: 0.3, type: 'sawtooth', gain: 0.16, delay: i * 0.36 });
    tone({ freq: 220, dur: 0.3, type: 'square', gain: 0.07, delay: i * 0.36 });
  }
}

export function sfxNova() {
  tone({ freq: 160, slideTo: 480, dur: 0.22, type: 'triangle', gain: 0.10 });
  noiseBurst({ dur: 0.18, gain: 0.06, freq: 900 });
}

export function sfxZap() {
  noiseBurst({ dur: 0.07, gain: 0.08, freq: 3200, q: 2 });
  tone({ freq: 1400, slideTo: 300, dur: 0.06, type: 'square', gain: 0.04 });
}

export function sfxUiClick() {
  tone({ freq: 660, dur: 0.05, type: 'triangle', gain: 0.08 });
}

export function sfxVictory() {
  const notes = [392, 523.25, 659.25, 783.99, 1046.5, 1318.5];
  notes.forEach((freq, i) => tone({ freq, dur: 0.34, type: 'triangle', gain: 0.13, delay: i * 0.11 }));
}

export function sfxDefeat() {
  const notes = [392, 329.63, 261.63, 196];
  notes.forEach((freq, i) => tone({ freq, dur: 0.4, type: 'triangle', gain: 0.13, delay: i * 0.16 }));
}

// --- Ambient music -----------------------------------------------------------
// A slow A-minor pentatonic arpeggio over a soft sub pad, scheduled a step at a time so it
// loops forever without a big lookahead buffer. Deliberately quiet: it sits under the game.

const ARP_NOTES = [220, 261.63, 329.63, 392, 523.25, 392, 329.63, 261.63];

function startMusic() {
  if (musicTimer) return;
  musicTimer = setInterval(() => {
    if (!ctx || muted || ctx.state !== 'running') return;
    const freq = ARP_NOTES[musicStep % ARP_NOTES.length];
    tone({ freq, dur: 0.5, type: 'sine', gain: 0.5, bus: musicGain });
    if (musicStep % 8 === 0) tone({ freq: 110, dur: 2.4, type: 'triangle', gain: 0.35, bus: musicGain });
    if (musicStep % 8 === 4) tone({ freq: 164.81, dur: 2.4, type: 'triangle', gain: 0.25, bus: musicGain });
    musicStep++;
  }, 340);
}
