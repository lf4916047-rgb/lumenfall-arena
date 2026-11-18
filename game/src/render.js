// Lumenfall Arena — rendering: everything the canvas shows. The arena is a place:
// a ruined temple court under a nebula sky, baked once into a plate — clustered
// nebula clouds, a dense starfield, a ringed planet in the margin sky, stone-tile
// floors with cracks and wear over a radial mosaic, a glowing summoning circle at
// the court's heart (its outer glyph ring turns slowly on a plate of its own), a
// dusk horizon of spires and broken pillars along the far wall, headless statues
// and a fallen column at the edges. Everything that burns (the warden, bolts,
// shards, the Hollow King) is composited additively over that plate so the arena
// feels lit, not painted. The creatures themselves are pre-rendered sprites
// (sprites.js bakes them once at load): a hooded Star-warden, fuzzy void moths,
// bat-winged gloomwings, horned hexshell hulks, the floating Watcher, and the
// tall robed Hollow King — the frame loop just blits the current frame.

import { COLORS } from './config.js';
import { getTouchUI } from './input.js';
import { getSprites, getShardSprite, blit, blitFlash, HOLLOW_HEART } from './sprites.js';

const TAU = Math.PI * 2;

// --- Cached plates and sprites ------------------------------------------------
// The static background (deep space, nebulae, the far star layers) and the vignettes are
// rendered once per resize into offscreen canvases; a frame then costs one drawImage for
// all of it. Glow is a radial-gradient sprite per colour, drawn additively — far cheaper
// than shadowBlur everywhere, and it stacks into real bloom where lights overlap.

let bgCanvas = null;
let dangerCanvas = null;
let ringCanvas = null;
let twinkles = [];

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(width));
  canvas.height = Math.max(1, Math.floor(height));
  return canvas;
}

function parseColor(color) {
  if (color.startsWith('#')) {
    const n = parseInt(color.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const parts = color.match(/[\d.]+/g).map(Number);
  return [parts[0], parts[1], parts[2]];
}

// --- Background bake helpers ----------------------------------------------------
// Everything in this section runs once per resize, into the plate; nothing here
// is paid for per frame.

// A woven star polygon: connect every `step`-th of `points` vertices until the
// path closes. {7/2} and {7/3} overlaid read as one intricate heptagram.
function starPath(c, cx, cy, r, points, step, rot) {
  c.beginPath();
  for (let i = 0; i <= points; i++) {
    const idx = (i * step) % points;
    const ang = rot + (idx / points) * TAU;
    const x = cx + Math.cos(ang) * r;
    const y = cy + Math.sin(ang) * r;
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.closePath();
}

// One rune glyph, centred on the origin with its stem vertical; `size` is the
// half-height. Eight stroke variants — stems, branches, diamonds, hooks — so a
// ring of them reads as writing, not decoration. The caller sets stroke style
// and transforms (glyphs around a ring are rotated to stand radially).
function drawRune(c, size, variant) {
  const s = size;
  c.beginPath();
  c.moveTo(0, -s);
  c.lineTo(0, s);
  switch (variant % 8) {
    case 0:
      c.moveTo(0, -s * 0.55); c.lineTo(s * 0.62, -s);
      c.moveTo(0, -s * 0.05); c.lineTo(s * 0.62, -s * 0.5);
      break;
    case 1:
      c.moveTo(0, s * 0.55); c.lineTo(s * 0.62, s);
      c.moveTo(0, s * 0.05); c.lineTo(s * 0.62, s * 0.5);
      break;
    case 2:
      c.moveTo(0, -s); c.lineTo(s * 0.55, -s * 0.45);
      c.lineTo(0, s * 0.1); c.lineTo(-s * 0.55, -s * 0.45);
      c.closePath();
      break;
    case 3:
      c.moveTo(-s * 0.5, -s * 0.3); c.lineTo(s * 0.5, -s * 0.3);
      c.moveTo(0, s * 0.2); c.lineTo(s * 0.6, s * 0.7);
      break;
    case 4:
      c.moveTo(-s * 0.5, -s); c.lineTo(s * 0.5, 0);
      c.moveTo(s * 0.5, -s); c.lineTo(-s * 0.5, 0);
      break;
    case 5:
      c.moveTo(0, -s); c.lineTo(s * 0.6, -s * 0.2); c.lineTo(0, s * 0.6);
      break;
    case 6:
      c.moveTo(s * 0.45, -s); c.lineTo(s * 0.45, s);
      c.moveTo(0, -s * 0.4); c.lineTo(s * 0.45, -s * 0.4);
      break;
    default:
      c.moveTo(0, -s * 0.2); c.lineTo(s * 0.55, -s * 0.75);
      c.moveTo(0, s * 0.35); c.lineTo(s * 0.55, s * 0.9);
      break;
  }
  c.stroke();
}

// A headless warden-statue on its plinth, standing on the floor at (x, y) —
// plinth base at y, figure rising `h` above it. Pure silhouette with a breath
// of rim light down one edge; the swarm walks over its shadow unbothered.
function bakeStatue(c, x, y, h, broken) {
  c.fillStyle = '#070922';
  c.fillRect(x - 17, y - 8, 34, 8);
  c.fillStyle = 'rgba(150, 162, 255, 0.20)';
  c.fillRect(x - 17, y - 8, 34, 1.4);
  const top = y - 8 - h;
  c.fillStyle = '#05061a';
  c.beginPath();
  c.moveTo(x - 8, top + 14);
  c.lineTo(x + 8, top + 14);
  c.lineTo(x + 14, y - 8);
  c.lineTo(x - 14, y - 8);
  c.closePath();
  c.fill();
  c.fillRect(x - 10, top + 8, 20, 8);            // shoulders
  c.fillRect(x - 3.5, top + (broken ? 7 : 3), 7, 7); // the neck, ending in air
  c.fillRect(x + 8, top + 16, 5, 14);            // one arm's stump
  if (!broken) c.fillRect(x - 13, top + 16, 5, 18); // the other arm, hanging
  c.fillStyle = 'rgba(150, 162, 255, 0.26)';
  c.fillRect(x - 8.5, top + 14, 1.3, h - 14);    // rim light
}

// A toppled column by its plinth: drum segments still strung along the shaft,
// one drum rolled loose. Dark stone, a pale line where the night catches it.
function bakeFallenColumn(c, x, y) {
  c.fillStyle = '#070922';
  c.fillRect(x - 30, y - 11, 32, 22);
  c.fillStyle = 'rgba(150, 162, 255, 0.18)';
  c.fillRect(x - 30, y - 11, 32, 1.4);
  c.fillStyle = '#060818';
  c.beginPath();
  c.roundRect(x + 8, y - 8, 76, 16, 8);
  c.fill();
  c.strokeStyle = 'rgba(150, 162, 255, 0.13)';
  c.lineWidth = 1;
  for (const dx of [27, 46, 65]) {
    c.beginPath();
    c.moveTo(x + dx, y - 7);
    c.lineTo(x + dx, y + 7);
    c.stroke();
  }
  c.strokeStyle = 'rgba(170, 182, 255, 0.22)';
  c.beginPath();
  c.moveTo(x + 14, y - 6.5);
  c.lineTo(x + 78, y - 6.5);
  c.stroke();
  c.fillStyle = '#060818';
  c.beginPath();
  c.arc(x + 102, y + 4, 9, 0, TAU);
  c.fill();
  c.strokeStyle = 'rgba(170, 182, 255, 0.20)';
  c.beginPath();
  c.arc(x + 102, y + 4, 9, Math.PI * 1.05, Math.PI * 1.65);
  c.stroke();
}

const glowCache = new Map();
function glowSprite(color) {
  let sprite = glowCache.get(color);
  if (sprite) return sprite;
  const [r, g, b] = parseColor(color);
  sprite = makeCanvas(128, 128);
  const c = sprite.getContext('2d');
  const grad = c.createRadialGradient(64, 64, 2, 64, 64, 64);
  grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.85)`);
  grad.addColorStop(0.28, `rgba(${r}, ${g}, ${b}, 0.34)`);
  grad.addColorStop(0.62, `rgba(${r}, ${g}, ${b}, 0.10)`);
  grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  c.fillStyle = grad;
  c.fillRect(0, 0, 128, 128);
  glowCache.set(color, sprite);
  return sprite;
}

// One additive halo of light. `radius` is the halo's full extent; alpha rides on top of
// the sprite's own falloff, so overlapping lights bloom instead of banding.
function drawGlow(ctx, x, y, radius, color, alpha) {
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha;
  ctx.drawImage(glowSprite(color), x - radius, y - radius, radius * 2, radius * 2);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

export function initBackground(width, height, arena) {
  // The baked plate: deep space, clustered nebula clouds, a ringed planet, and
  // three static star layers. The temple court bakes in further below.
  bgCanvas = makeCanvas(width, height);
  const c = bgCanvas.getContext('2d');
  c.fillStyle = COLORS.bgDeep;
  c.fillRect(0, 0, width, height);
  const centre = c.createRadialGradient(width / 2, height / 2, 60, width / 2, height / 2, Math.max(width, height) * 0.66);
  centre.addColorStop(0, COLORS.bgGlow);
  centre.addColorStop(1, 'rgba(7, 8, 34, 0)');
  c.fillStyle = centre;
  c.fillRect(0, 0, width, height);

  // Nebula clouds with real presence: each wash is a cluster of overlapping
  // blobs, so the colour pools and thins like cloud instead of reading as one
  // perfect circle. Violet, teal and magenta over the deep indigo.
  const nebulae = [
    { x: 0.20, y: 0.22, r: 0.54, color: '#4a2a9f', alpha: 0.30 },
    { x: 0.84, y: 0.16, r: 0.46, color: '#7e1d5e', alpha: 0.27 },
    { x: 0.74, y: 0.84, r: 0.58, color: '#0d5a6e', alpha: 0.25 },
    { x: 0.10, y: 0.88, r: 0.42, color: '#27408f', alpha: 0.23 },
    { x: 0.55, y: 0.45, r: 0.38, color: '#5c1440', alpha: 0.17 },
    { x: 0.44, y: 0.06, r: 0.32, color: '#2a6e8f', alpha: 0.15 },
  ];
  for (const n of nebulae) {
    const [r, g, b] = parseColor(n.color);
    const R = Math.max(width, height) * n.r;
    for (let i = 0; i < 6; i++) {
      const bx = width * n.x + (Math.random() - 0.5) * R * 0.72;
      const by = height * n.y + (Math.random() - 0.5) * R * 0.72;
      const br = R * (0.34 + Math.random() * 0.38);
      const grad = c.createRadialGradient(bx, by, 4, bx, by, br);
      grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${n.alpha * (0.45 + Math.random() * 0.5)})`);
      grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      c.fillStyle = grad;
      c.fillRect(bx - br, by - br, br * 2, br * 2);
    }
  }

  // A ringed planet hangs in the top margin's sky, faint enough to sit behind
  // the HUD. Back ring, disc, a night-side shadow, then the ring's front arc.
  {
    const px = width * 0.66;
    const py = 40;
    const pr = 15;
    const halo = c.createRadialGradient(px, py, 2, px, py, pr * 3.6);
    halo.addColorStop(0, 'rgba(150, 170, 255, 0.16)');
    halo.addColorStop(1, 'rgba(150, 170, 255, 0)');
    c.fillStyle = halo;
    c.fillRect(px - pr * 3.6, py - pr * 3.6, pr * 7.2, pr * 7.2);
    c.save();
    c.translate(px, py);
    c.rotate(-0.32);
    c.scale(1, 0.34);
    c.strokeStyle = 'rgba(178, 190, 255, 0.34)';
    c.lineWidth = 2.4;
    c.beginPath();
    c.arc(0, 0, pr * 1.95, 0, TAU);
    c.stroke();
    c.restore();
    c.fillStyle = 'rgba(122, 134, 204, 0.85)';
    c.beginPath();
    c.arc(px, py, pr, 0, TAU);
    c.fill();
    c.save();
    c.beginPath();
    c.arc(px, py, pr, 0, TAU);
    c.clip();
    c.fillStyle = 'rgba(190, 200, 255, 0.30)';
    c.beginPath();
    c.arc(px - pr * 0.34, py - pr * 0.38, pr * 0.55, 0, TAU);
    c.fill();
    c.fillStyle = 'rgba(5, 6, 24, 0.38)';
    c.beginPath();
    c.arc(px + pr * 0.42, py + pr * 0.30, pr * 0.92, 0, TAU);
    c.fill();
    c.restore();
    c.save();
    c.translate(px, py);
    c.rotate(-0.32);
    c.scale(1, 0.34);
    c.strokeStyle = 'rgba(198, 208, 255, 0.5)';
    c.lineWidth = 2.4;
    c.beginPath();
    c.arc(0, 0, pr * 1.95, 0.15, Math.PI - 0.15);
    c.stroke();
    c.restore();
  }

  const starLayers = [
    { count: 320, rMin: 0.4, rMax: 1.0, alpha: 0.5, tint: '#8f9be0' },
    { count: 170, rMin: 0.8, rMax: 1.5, alpha: 0.75, tint: '#aab4ff' },
    { count: 46, rMin: 1.2, rMax: 1.9, alpha: 0.9, tint: '#e8ecff' },
  ];
  for (const layer of starLayers) {
    c.fillStyle = layer.tint;
    for (let i = 0; i < layer.count; i++) {
      c.globalAlpha = layer.alpha * (0.4 + Math.random() * 0.6);
      c.beginPath();
      c.arc(Math.random() * width, Math.random() * height, layer.rMin + Math.random() * (layer.rMax - layer.rMin), 0, TAU);
      c.fill();
    }
  }
  c.globalAlpha = 1;

  // The bright foreground stars are live so they can twinkle and sparkle.
  twinkles = [];
  const tints = ['#dfe6ff', '#ffe9b0', '#9be7ff', '#ffc4d6'];
  for (let i = 0; i < 46; i++) {
    twinkles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      r: 1.1 + Math.random() * 1.3,
      phase: Math.random() * TAU,
      speed: 0.7 + Math.random() * 1.6,
      tint: tints[Math.floor(Math.random() * tints.length)],
    });
  }

  // The arena's static dressing bakes into the plate too — the whole temple
  // court: stone floor, mosaic, summoning circle, ruins, horizon, the burning
  // border. Per frame this all used to cost gradient fills and a shadowBlur
  // stroke; baked, it costs nothing. Only the turning rings stay live (they
  // are drawn in drawArena).
  if (arena) {
    const a = arena;
    const cx = a.x + a.w / 2;
    const cy = a.y + a.h / 2;
    const u = Math.min(a.w, a.h);

    // --- Floor base: stone-dark, a breath translucent so the nebula tints it.
    const fill = c.createLinearGradient(0, a.y, 0, a.y + a.h);
    fill.addColorStop(0, 'rgba(15, 18, 54, 0.94)');
    fill.addColorStop(0.5, 'rgba(11, 14, 44, 0.96)');
    fill.addColorStop(1, 'rgba(7, 8, 28, 0.98)');
    c.fillStyle = fill;
    c.fillRect(a.x, a.y, a.w, a.h);

    // --- Radial mosaic: broad bands and wedges fanning from the court's heart.
    c.save();
    c.beginPath();
    c.rect(a.x, a.y, a.w, a.h);
    c.clip();
    const wedges = 28;
    c.fillStyle = 'rgba(130, 145, 255, 0.05)';
    for (let i = 0; i < wedges; i += 2) {
      c.beginPath();
      c.moveTo(cx, cy);
      c.arc(cx, cy, u * 0.62, (i / wedges) * TAU, ((i + 1) / wedges) * TAU);
      c.closePath();
      c.fill();
    }
    c.strokeStyle = 'rgba(150, 162, 255, 0.07)';
    for (const rr of [0.22, 0.37, 0.52]) {
      c.lineWidth = u * 0.028;
      c.beginPath();
      c.arc(cx, cy, u * rr, 0, TAU);
      c.stroke();
    }
    c.restore();

    // --- Stone tiles: every tile its own tone — violet-worn, slate, lifted,
    // sunk — laid over the mosaic, with dark grout in the seams.
    const tile = 46;
    for (let ty = a.y; ty < a.y + a.h; ty += tile) {
      for (let tx = a.x; tx < a.x + a.w; tx += tile) {
        const v = Math.random();
        if (v < 0.12) c.fillStyle = 'rgba(64, 58, 120, 0.16)';
        else if (v < 0.24) c.fillStyle = 'rgba(24, 40, 84, 0.20)';
        else if (v < 0.55) c.fillStyle = 'rgba(88, 96, 190, 0.07)';
        else c.fillStyle = 'rgba(0, 0, 10, 0.10)';
        c.fillRect(tx, ty, Math.min(tile, a.x + a.w - tx), Math.min(tile, a.y + a.h - ty));
      }
    }
    c.strokeStyle = 'rgba(3, 4, 16, 0.5)';
    c.lineWidth = 1.5;
    c.beginPath();
    for (let x = a.x + tile; x < a.x + a.w; x += tile) { c.moveTo(x, a.y); c.lineTo(x, a.y + a.h); }
    for (let y = a.y + tile; y < a.y + a.h; y += tile) { c.moveTo(a.x, y); c.lineTo(a.x + a.w, y); }
    c.stroke();

    // --- Cracks wander tile to tile; worn patches pool dark or shine faintly.
    c.strokeStyle = 'rgba(2, 3, 12, 0.45)';
    for (let i = 0; i < 26; i++) {
      let x = a.x + Math.random() * a.w;
      let y = a.y + Math.random() * a.h;
      let ang = Math.random() * TAU;
      c.lineWidth = 1 + Math.random();
      c.beginPath();
      c.moveTo(x, y);
      const segs = 3 + Math.floor(Math.random() * 4);
      for (let s = 0; s < segs; s++) {
        ang += (Math.random() - 0.5) * 1.1;
        const len = 8 + Math.random() * 16;
        x += Math.cos(ang) * len;
        y += Math.sin(ang) * len;
        c.lineTo(x, y);
      }
      c.stroke();
    }
    for (let i = 0; i < 16; i++) {
      const x = a.x + Math.random() * a.w;
      const y = a.y + Math.random() * a.h;
      const r = 30 + Math.random() * 80;
      const g = c.createRadialGradient(x, y, 2, x, y, r);
      g.addColorStop(0, Math.random() < 0.7 ? 'rgba(0, 0, 8, 0.13)' : 'rgba(190, 198, 255, 0.05)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      c.fillStyle = g;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }

    // --- The pool of light at the court's heart.
    const pool = c.createRadialGradient(cx, cy, 10, cx, cy, u * 0.55);
    pool.addColorStop(0, 'rgba(70, 76, 160, 0.16)');
    pool.addColorStop(1, 'rgba(70, 76, 160, 0)');
    c.fillStyle = pool;
    c.fillRect(a.x, a.y, a.w, a.h);

    // --- The summoning circle, baked: an amber-and-teal glow, a woven
    // heptagram, rune glyphs standing between the inner rings, tick marks at
    // the rim. Its outermost glyph ring is NOT here — it turns, slowly, on a
    // separate plate drawn in drawArena.
    const wash = c.createRadialGradient(cx, cy, 4, cx, cy, u * 0.36);
    wash.addColorStop(0, 'rgba(255, 179, 64, 0.10)');
    wash.addColorStop(0.55, 'rgba(255, 179, 64, 0.045)');
    wash.addColorStop(0.8, 'rgba(46, 230, 200, 0.05)');
    wash.addColorStop(1, 'rgba(46, 230, 200, 0)');
    c.fillStyle = wash;
    c.fillRect(cx - u * 0.36, cy - u * 0.36, u * 0.72, u * 0.72);
    starPath(c, cx, cy, u * 0.165, 7, 2, -Math.PI / 2);
    c.strokeStyle = 'rgba(255, 196, 110, 0.40)';
    c.lineWidth = 1.6;
    c.stroke();
    starPath(c, cx, cy, u * 0.165, 7, 3, -Math.PI / 2);
    c.strokeStyle = 'rgba(255, 196, 110, 0.26)';
    c.stroke();
    const ring = (r, style, w) => {
      c.strokeStyle = style;
      c.lineWidth = w;
      c.beginPath();
      c.arc(cx, cy, r, 0, TAU);
      c.stroke();
    };
    ring(u * 0.175, 'rgba(46, 230, 200, 0.50)', 2);
    ring(u * 0.185, 'rgba(46, 230, 200, 0.22)', 1);
    ring(u * 0.245, 'rgba(255, 196, 110, 0.42)', 2.5);
    ring(u * 0.256, 'rgba(255, 196, 110, 0.20)', 1);
    c.strokeStyle = 'rgba(46, 230, 200, 0.55)';
    c.lineWidth = 1.4;
    for (let i = 0; i < 14; i++) {
      const ang = (i / 14) * TAU;
      c.save();
      c.translate(cx + Math.cos(ang) * u * 0.22, cy + Math.sin(ang) * u * 0.22);
      c.rotate(ang + Math.PI / 2);
      drawRune(c, u * 0.011, i * 5 + 2);
      c.restore();
    }
    c.strokeStyle = 'rgba(255, 196, 110, 0.30)';
    c.lineWidth = 1.4;
    c.beginPath();
    for (let i = 0; i < 60; i++) {
      const ang = (i / 60) * TAU;
      const r0 = u * 0.272;
      const r1 = u * (i % 5 === 0 ? 0.288 : 0.282);
      c.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
      c.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
    }
    c.stroke();

    // --- Ruins on the floor: two headless wardens keep the edges, and a
    // toppled column lies where it fell.
    bakeStatue(c, a.x + a.w - 52, a.y + a.h * 0.36, 56, false);
    bakeStatue(c, a.x + 56, a.y + a.h * 0.58, 44, true);
    bakeFallenColumn(c, a.x + a.w * 0.10, a.y + a.h * 0.82);

    // --- The far wall: a dusk horizon band inside the arena's top edge.
    // Spires and broken towers silhouette against a violet sky and a pale
    // moon; a ruined parapet runs the wall's length. All of it dark — the
    // swarm crosses it as shadow crosses a mural.
    const hb = Math.min(96, a.h * 0.14);
    const by = a.y;
    const sky = c.createLinearGradient(0, by, 0, by + hb);
    sky.addColorStop(0, '#0d0b30');
    sky.addColorStop(0.75, '#241543');
    sky.addColorStop(1, '#31194d');
    c.fillStyle = sky;
    c.fillRect(a.x, by, a.w, hb);
    const mx = a.x + a.w * 0.70;
    const my = by + hb * 0.40;
    const mr = hb * 0.30;
    const halo = c.createRadialGradient(mx, my, 2, mx, my, mr * 3.4);
    halo.addColorStop(0, 'rgba(214, 222, 255, 0.20)');
    halo.addColorStop(1, 'rgba(214, 222, 255, 0)');
    c.fillStyle = halo;
    c.fillRect(mx - mr * 3.4, my - mr * 3.4, mr * 6.8, mr * 6.8);
    c.fillStyle = 'rgba(226, 232, 255, 0.92)';
    c.beginPath();
    c.arc(mx, my, mr, 0, TAU);
    c.fill();
    c.save();
    c.beginPath();
    c.arc(mx, my, mr, 0, TAU);
    c.clip();
    c.fillStyle = 'rgba(168, 178, 224, 0.35)';
    for (const [ox, oy, orr] of [[-0.3, -0.15, 0.22], [0.25, 0.3, 0.16], [0.05, -0.42, 0.12]]) {
      c.beginPath();
      c.arc(mx + ox * mr, my + oy * mr, orr * mr, 0, TAU);
      c.fill();
    }
    c.restore();
    // Far spires: a jagged roofline of mountains and broken towers.
    c.fillStyle = '#0a0c2c';
    c.beginPath();
    c.moveTo(a.x, by + hb);
    let sx = a.x;
    while (sx < a.x + a.w) {
      const peakW = 26 + Math.random() * 70;
      const peakH = hb * (0.25 + Math.random() * 0.5);
      c.lineTo(sx + peakW * 0.5, by + hb - peakH);
      c.lineTo(Math.min(sx + peakW, a.x + a.w), by + hb - hb * Math.random() * 0.12);
      sx += peakW;
    }
    c.lineTo(a.x + a.w, by + hb);
    c.closePath();
    c.fill();
    // The parapet: a wall walk with broken battlements, pillars standing on
    // it, one snapped, an arch fragment reaching from the left, a headless
    // statue keeping the right.
    const wy = by + hb - 9;
    c.fillStyle = '#05061a';
    c.fillRect(a.x, wy, a.w, 9);
    for (let bx = a.x + 6; bx < a.x + a.w - 10; bx += 17 + Math.random() * 22) {
      if (Math.random() < 0.35) continue; // whole merlons are simply gone
      c.fillRect(bx, wy - 4 - Math.random() * 3, 9, 7);
    }
    const pillar = (fx, hgt, snapped) => {
      const px = a.x + a.w * fx;
      c.fillRect(px, wy - hgt, 13, hgt);
      if (!snapped) c.fillRect(px - 2.5, wy - hgt - 4, 18, 4.5);
      else {
        c.beginPath();
        c.moveTo(px, wy - hgt);
        c.lineTo(px + 6, wy - hgt + 4);
        c.lineTo(px + 13, wy - hgt + 1);
        c.lineTo(px + 13, wy - hgt - 3);
        c.closePath();
        c.fill();
      }
    };
    pillar(0.08, hb * 0.52, false);
    pillar(0.30, hb * 0.34, true);
    pillar(0.88, hb * 0.62, false);
    // The arch: a thick broken span rising from the parapet at the left.
    c.strokeStyle = '#05061a';
    c.lineWidth = 10;
    c.beginPath();
    c.arc(a.x + a.w * 0.30, wy + 6, a.w * 0.145, Math.PI * 1.02, Math.PI * 1.52);
    c.stroke();
    c.strokeStyle = 'rgba(150, 160, 255, 0.26)';
    c.lineWidth = 1.6;
    c.beginPath();
    c.arc(a.x + a.w * 0.30, wy + 6, a.w * 0.145 + 5.5, Math.PI * 1.04, Math.PI * 1.50);
    c.stroke();
    // A small headless statue on the wall walk.
    c.fillStyle = '#05061a';
    const stx = a.x + a.w * 0.585;
    c.fillRect(stx - 8, wy - 4, 16, 4);
    c.beginPath();
    c.moveTo(stx - 4.5, wy - 20);
    c.lineTo(stx + 4.5, wy - 20);
    c.lineTo(stx + 7.5, wy - 4);
    c.lineTo(stx - 7.5, wy - 4);
    c.closePath();
    c.fill();
    c.fillRect(stx - 5.5, wy - 25, 11, 5.5);
    c.fillRect(stx - 2, wy - 28, 4, 3.5);
    // Rim light along the wall's top edge, then the band fades into the floor.
    c.fillStyle = 'rgba(158, 170, 255, 0.22)';
    c.fillRect(a.x, wy - 1, a.w, 1.2);
    const fade = c.createLinearGradient(0, by + hb, 0, by + hb + 26);
    fade.addColorStop(0, 'rgba(5, 6, 26, 0.55)');
    fade.addColorStop(1, 'rgba(5, 6, 26, 0)');
    c.fillStyle = fade;
    c.fillRect(a.x, by + hb, a.w, 26);

    // --- The burning border frames the court, as before.
    c.save();
    c.shadowColor = COLORS.arenaLine;
    c.shadowBlur = 14;
    c.strokeStyle = '#4a54c8';
    c.lineWidth = 2;
    c.strokeRect(a.x, a.y, a.w, a.h);
    c.restore();
    c.strokeStyle = 'rgba(160, 170, 255, 0.28)';
    c.lineWidth = 1;
    c.strokeRect(a.x - 5, a.y - 5, a.w + 10, a.h + 10);
    c.strokeStyle = 'rgba(190, 198, 255, 0.75)';
    c.lineWidth = 3;
    const cl = 26;
    c.beginPath();
    for (const [px, py, sx2, sy2] of [[a.x, a.y, 1, 1], [a.x + a.w, a.y, -1, 1], [a.x, a.y + a.h, 1, -1], [a.x + a.w, a.y + a.h, -1, -1]]) {
      c.moveTo(px + cl * sx2, py);
      c.lineTo(px, py);
      c.lineTo(px, py + cl * sy2);
    }
    c.stroke();
  }

  // The summoning circle's outer ring rides its own plate: two rings, sixteen
  // rune glyphs standing between them, diamond sparks on the rim. drawArena
  // blits it under a slow rotation — one transformed drawImage per frame.
  ringCanvas = null;
  if (arena) {
    const a = arena;
    const u = Math.min(a.w, a.h);
    const R = u * 0.335;
    const half = Math.ceil(R + u * 0.03 + 6);
    ringCanvas = makeCanvas(half * 2, half * 2);
    const rc = ringCanvas.getContext('2d');
    rc.translate(half, half);
    rc.strokeStyle = 'rgba(255, 196, 110, 0.50)';
    rc.lineWidth = 2.5;
    rc.beginPath();
    rc.arc(0, 0, R, 0, TAU);
    rc.stroke();
    rc.strokeStyle = 'rgba(46, 230, 200, 0.30)';
    rc.lineWidth = 1.2;
    rc.beginPath();
    rc.arc(0, 0, R - u * 0.035, 0, TAU);
    rc.stroke();
    rc.strokeStyle = 'rgba(255, 214, 140, 0.75)';
    rc.lineWidth = 1.6;
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * TAU;
      rc.save();
      rc.rotate(ang);
      rc.translate(R - u * 0.0175, 0);
      rc.rotate(Math.PI / 2);
      drawRune(rc, u * 0.013, i * 3 + 1);
      rc.restore();
    }
    rc.fillStyle = 'rgba(255, 214, 140, 0.5)';
    for (let i = 0; i < 16; i++) {
      const ang = ((i + 0.5) / 16) * TAU;
      rc.save();
      rc.rotate(ang);
      rc.translate(R + u * 0.012, 0);
      rc.rotate(Math.PI / 4);
      rc.fillRect(-1.6, -1.6, 3.2, 3.2);
      rc.restore();
    }
  }

  // The cool vignette that seats the arena in the dark bakes over the plate;
  // only the red danger vignette stays its own canvas, since it pulses live.
  const vg = c.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.42, width / 2, height / 2, Math.max(width, height) * 0.74);
  vg.addColorStop(0, 'rgba(3, 4, 16, 0)');
  vg.addColorStop(1, 'rgba(3, 4, 16, 0.52)');
  c.fillStyle = vg;
  c.fillRect(0, 0, width, height);

  dangerCanvas = makeCanvas(width, height);
  const d = dangerCanvas.getContext('2d');
  const dg = d.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.36, width / 2, height / 2, Math.max(width, height) * 0.72);
  dg.addColorStop(0, 'rgba(120, 4, 24, 0)');
  dg.addColorStop(1, 'rgba(150, 6, 30, 0.55)');
  d.fillStyle = dg;
  d.fillRect(0, 0, width, height);
}

export function renderGame(ctx, game, width, height) {
  drawBackground(ctx, game, width, height);
  ctx.save();
  if (game.shake > 0.2) {
    ctx.translate((Math.random() - 0.5) * game.shake, (Math.random() - 0.5) * game.shake);
  }
  drawArena(ctx, game);
  drawRings(ctx, game);
  drawShards(ctx, game);
  drawZaps(ctx, game);
  for (const enemy of game.enemies) drawEnemy(ctx, game, enemy);
  drawOrbitOrbs(ctx, game);
  drawBolts(ctx, game);
  if (game.player.alive || game.state === 'title') drawPlayer(ctx, game);
  drawParticles(ctx, game);
  drawFloatTexts(ctx, game);
  ctx.restore();
  // (The cool vignette is baked into the background plate now; only the red
  // danger pulse still draws over the world, and it never shakes with it.)
  const player = game.player;
  if (dangerCanvas && game.state === 'playing' && player.alive && player.hp < player.maxHp * 0.3) {
    ctx.globalAlpha = 0.35 + 0.3 * (0.5 + 0.5 * Math.sin(game.time * 5.2));
    ctx.drawImage(dangerCanvas, 0, 0);
    ctx.globalAlpha = 1;
  }
  // Touch controls ride above the world, and exist only on touch devices.
  if (game.state === 'playing') drawTouchControls(ctx);
}

// The touch controls: a quiet dash ring bottom-right, and — while a thumb is down —
// the stick's base ring with its knob. Two stroked circles apiece, no shadowBlur, so
// a frame still costs nothing worth measuring. getTouchUI() is null off touch
// devices, where this returns before touching a single pixel.
function drawTouchControls(ctx) {
  const ui = getTouchUI();
  if (!ui) return;
  ctx.save();
  const d = ui.dash;
  ctx.globalAlpha = d.active ? 0.92 : 0.55;
  ctx.beginPath();
  ctx.arc(d.x, d.y, d.r, 0, TAU);
  ctx.fillStyle = d.active ? 'rgba(255, 179, 64, 0.30)' : 'rgba(14, 17, 46, 0.55)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255, 217, 122, 0.85)';
  ctx.stroke();
  ctx.fillStyle = '#ffd97a';
  ctx.font = '800 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('DASH', d.x, d.y + 0.5);
  ctx.globalAlpha = 1;
  if (ui.stick) {
    const s = ui.stick;
    ctx.beginPath();
    ctx.arc(s.baseX, s.baseY, s.baseR, 0, TAU);
    ctx.fillStyle = 'rgba(120, 132, 255, 0.10)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(190, 198, 255, 0.40)';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(s.knobX, s.knobY, s.knobR, 0, TAU);
    ctx.fillStyle = 'rgba(232, 234, 255, 0.38)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.stroke();
  }
  ctx.restore();
}

function drawBackground(ctx, game, width, height) {
  if (bgCanvas) {
    ctx.drawImage(bgCanvas, 0, 0);
  } else {
    ctx.fillStyle = COLORS.bgDeep;
    ctx.fillRect(0, 0, width, height);
  }
  // No drifting aurora veil: a screen-wide additive blit every frame measured out as
  // the single dearest paint in the scene, and the baked nebula plate already washes
  // the dark in violet and teal. The backdrop still moves — twinkles, motes, runes.
  // Twinkling bright stars; the largest throw a four-point sparkle.
  for (const star of twinkles) {
    const tw = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(game.time * star.speed + star.phase));
    ctx.globalAlpha = tw;
    ctx.fillStyle = star.tint;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.r, 0, TAU);
    ctx.fill();
    if (star.r > 1.9) {
      const s = star.r * 4.2 * tw;
      ctx.strokeStyle = star.tint;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(star.x - s, star.y);
      ctx.lineTo(star.x + s, star.y);
      ctx.moveTo(star.x, star.y - s);
      ctx.lineTo(star.x, star.y + s);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function drawArena(ctx, game) {
  // Everything static about the arena — floor, mosaic, ruins, horizon, border —
  // is baked into the background plate. What stays live: the summoning circle's
  // outer glyph ring, turning very slowly on its own plate (one transformed
  // blit), and one faint dashed circle turning inside it.
  const a = game.arena;
  const cx = a.x + a.w / 2;
  const cy = a.y + a.h / 2;
  const u = Math.min(a.w, a.h);
  if (ringCanvas) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(game.time * 0.02);
    ctx.drawImage(ringCanvas, -ringCanvas.width / 2, -ringCanvas.height / 2);
    ctx.restore();
  }
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = 'rgba(140, 155, 255, 0.08)';
  ctx.lineWidth = 9;
  ctx.setLineDash([30, 20]);
  ctx.rotate(game.time * 0.045);
  ctx.beginPath();
  ctx.arc(0, 0, u * 0.215, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawShards(ctx, game) {
  // One baked sprite per shard (glow and gem together), pulsed by scale alone.
  const img = getShardSprite();
  for (const shard of game.shards) {
    const size = shard.large ? 9 : 5.5;
    const extent = size * 4.6 * (1 + Math.sin(shard.t) * 0.15);
    ctx.drawImage(img, shard.x - extent / 2, shard.y - extent / 2, extent, extent);
  }
}

function drawRings(ctx, game) {
  for (const ring of game.rings) {
    const k = 1 - ring.life / ring.maxLife;
    const radius = ring.maxRadius * (0.25 + 0.75 * k);
    // A soft wash of light inside the shockwave, then the wave itself, doubled.
    ctx.globalAlpha = (1 - k) * 0.10;
    ctx.fillStyle = ring.color;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, radius, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = (1 - k) * 0.85;
    ctx.strokeStyle = ring.color;
    ctx.lineWidth = ring.width * (1 - k) + 0.5;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, radius, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = (1 - k) * 0.4;
    ctx.strokeStyle = COLORS.white;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, radius * 0.92, 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawZaps(ctx, game) {
  for (const zap of game.zaps) {
    const alpha = Math.max(0, zap.life / zap.maxLife);
    ctx.globalAlpha = alpha;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = zap.color;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    zap.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    // A white-hot core down the middle of the bolt.
    ctx.globalAlpha = alpha * 0.85;
    ctx.strokeStyle = COLORS.white;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    zap.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawEnemy(ctx, game, enemy) {
  // Everything hostile smoulders: a low halo in its own colour under the body.
  const baseColor = COLORS[{ moth: 'enemyMoth', darter: 'enemyDarter', brute: 'enemyBrute', spitter: 'enemySpitter', boss: 'boss' }[enemy.kind]];
  if (enemy.kind !== 'boss') {
    // The small fry burn a little tighter — at swarm density their halos are
    // the single biggest sheet of additive blending in the frame.
    const glowR = enemy.elite ? 2.2 : (enemy.kind === 'moth' || enemy.kind === 'darter') ? 1.7 : 2.0;
    drawGlow(ctx, enemy.x, enemy.y, enemy.radius * glowR, baseColor, enemy.elite ? 0.4 : 0.28);
  }
  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  if (enemy.kind === 'boss') {
    drawBoss(ctx, game, enemy);
  } else {
    const sprites = getSprites();
    const set = sprites[enemy.kind][enemy.elite ? 'elite' : 'normal'];
    // Each kind lives at its own tempo: the moth's wingbeat is frantic, the
    // Watcher's tentacles barely stir. framePhase staggers a swarm out of sync.
    let frame = 0;
    if (enemy.kind === 'moth') {
      frame = Math.floor(game.time * 15 + enemy.framePhase * 3) % 3;
      ctx.rotate(Math.atan2(enemy.vy, enemy.vx));
    } else if (enemy.kind === 'darter') {
      frame = Math.floor(game.time * 11 + enemy.framePhase * 2) % 2;
      ctx.rotate(Math.atan2(enemy.vy, enemy.vx));
    } else if (enemy.kind === 'brute') {
      frame = Math.floor(game.time * 5.5 + enemy.framePhase) % 2;
      ctx.rotate(Math.atan2(enemy.vy, enemy.vx) + Math.sin(enemy.wobble * 0.6) * 0.05);
    } else if (enemy.kind === 'spitter') {
      frame = Math.floor(game.time * 1.7 + enemy.framePhase) % 2;
      ctx.rotate(Math.sin(enemy.wobble * 0.3) * 0.2);
    }
    blit(ctx, set, frame, enemy.radius);
    if (enemy.kind === 'spitter') drawWatcherPupil(ctx, game, enemy);
    if (enemy.flash > 0) blitFlash(ctx, set, frame, enemy.radius, (enemy.flash / 0.09) * 0.8);
  }
  if (enemy.elite) {
    ctx.strokeStyle = COLORS.bossCrown;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, enemy.radius + 4, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 217, 122, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, enemy.radius + 7, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
  // A slim health bar over anything tougher than a moth.
  if ((enemy.maxHp >= 30 || enemy.elite) && enemy.kind !== 'boss' && enemy.hp < enemy.maxHp) {
    const w = enemy.radius * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(enemy.x - enemy.radius, enemy.y - enemy.radius - 11, w, 5);
    ctx.fillStyle = COLORS.hp;
    ctx.fillRect(enemy.x - enemy.radius + 0.5, enemy.y - enemy.radius - 10.5, (w - 1) * Math.max(0, enemy.hp / enemy.maxHp), 2.4);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillRect(enemy.x - enemy.radius + 0.5, enemy.y - enemy.radius - 8.4, (w - 1) * Math.max(0, enemy.hp / enemy.maxHp), 1.1);
  }
}

// The Watcher's pupil is the one piece of the sprite that stays live: it rolls
// in its socket to track the warden, so the horror is always looking at you.
function drawWatcherPupil(ctx, game, enemy) {
  const r = enemy.radius;
  const look = Math.atan2(game.player.y - enemy.y, game.player.x - enemy.x);
  const px = Math.cos(look) * r * 0.13;
  const py = Math.sin(look) * r * 0.13;
  ctx.fillStyle = '#2b021e';
  ctx.beginPath();
  ctx.arc(px, py, r * 0.17, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.beginPath();
  ctx.arc(px - r * 0.05, py - r * 0.05, r * 0.05, 0, TAU);
  ctx.fill();
}

// The Hollow King: layered auras and his turning rune ring stay live, but the King
// himself is the baked sprite — crown, skull, ribcage and robe — bobbing slowly
// and swaying as he comes. Live swirl arcs still turn inside his dark heart.
function drawBoss(ctx, game, enemy) {
  const r = enemy.radius;
  drawGlow(ctx, 0, 0, r * 2.9, '#5c1440', 0.30);
  drawGlow(ctx, 0, 0, r * 2.0, COLORS.boss, 0.34);

  // A turning ring of runes and ember-shards at his court's edge.
  ctx.save();
  ctx.rotate(game.time * 0.35);
  ctx.strokeStyle = 'rgba(255, 217, 122, 0.5)';
  ctx.lineWidth = 2;
  ctx.setLineDash([14, 10]);
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.38, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = COLORS.bossCrown;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    ctx.save();
    ctx.translate(Math.cos(a) * r * 1.38, Math.sin(a) * r * 1.38);
    ctx.rotate(a + game.time * 1.4);
    ctx.fillRect(-3.4, -3.4, 6.8, 6.8);
    ctx.restore();
  }
  ctx.restore();

  // The King himself, drawn larger than his collision body — he should loom.
  const sprites = getSprites();
  const set = sprites.boss;
  const frame = Math.floor(game.time * 1.1) % 2;
  const scale = r * 1.32;
  ctx.save();
  ctx.translate(0, Math.sin(game.time * 1.6) * 4);
  ctx.rotate(Math.sin(game.time * 0.9) * 0.02);
  blit(ctx, set, frame, scale);
  if (enemy.flash > 0) blitFlash(ctx, set, frame, scale, (enemy.flash / 0.09) * 0.8);
  ctx.restore();

  // Swirl arcs turning inside the dark of his heart.
  const hx = HOLLOW_HEART.x * scale;
  const hy = HOLLOW_HEART.y * scale + Math.sin(game.time * 1.6) * 4;
  ctx.strokeStyle = 'rgba(255, 93, 143, 0.6)';
  ctx.lineWidth = 2.5;
  for (let i = 0; i < 3; i++) {
    const start = game.time * 0.9 + (i / 3) * TAU;
    ctx.beginPath();
    ctx.arc(hx, hy, scale * (0.13 + i * 0.055), start, start + Math.PI * 0.8);
    ctx.stroke();
  }
  drawGlow(ctx, hx, hy, scale * 0.5, '#ffe9b0', 0.35);
}

function drawOrbitOrbs(ctx, game) {
  // A faint guide circle so players can read the blades' reach.
  if (game.weapons.orbitOrbs.length > 0) {
    ctx.strokeStyle = 'rgba(155, 231, 255, 0.13)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(game.player.x, game.player.y, Math.hypot(game.weapons.orbitOrbs[0].x - game.player.x, game.weapons.orbitOrbs[0].y - game.player.y), 0, TAU);
    ctx.stroke();
  }
  for (const orb of game.weapons.orbitOrbs) {
    drawGlow(ctx, orb.x, orb.y, 26, COLORS.spark, 0.4);
    ctx.save();
    ctx.translate(orb.x, orb.y);
    ctx.rotate(game.time * 6);
    const blade = ctx.createLinearGradient(0, -10, 0, 10);
    blade.addColorStop(0, '#e8fbff');
    blade.addColorStop(0.5, COLORS.spark);
    blade.addColorStop(1, '#2e7ea6');
    ctx.fillStyle = blade;
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(7, 0);
    ctx.lineTo(0, 10);
    ctx.lineTo(-7, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(0, 0, 2.4, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

function drawBolts(ctx, game) {
  ctx.lineCap = 'round';
  for (const bolt of game.bolts) {
    const color = bolt.color ?? COLORS.bolt;
    // A comet streak behind the head, along the bolt's own velocity — a plain
    // translucent stroke; with dozens of bolts in flight it costs almost nothing.
    const trail = 0.045;
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = color;
    ctx.lineWidth = bolt.radius * 1.5;
    ctx.beginPath();
    ctx.moveTo(bolt.x - bolt.vx * trail, bolt.y - bolt.vy * trail);
    ctx.lineTo(bolt.x, bolt.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    drawGlow(ctx, bolt.x, bolt.y, bolt.radius * 4.4, color, bolt.friendly ? 0.5 : 0.42);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(bolt.x, bolt.y, bolt.radius, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(bolt.x, bolt.y, bolt.radius * 0.45, 0, TAU);
    ctx.fill();
  }
}

function drawPlayer(ctx, game) {
  const player = game.player;
  // The afterimage trail: fading ghosts of where the warden just was, hottest mid-dash.
  if (player.trail) {
    for (const ghost of player.trail) {
      const age = game.time - ghost.t;
      const k = 1 - age / 0.3;
      if (k <= 0) continue;
      drawGlow(ctx, ghost.x, ghost.y, player.radius * (ghost.dash ? 2.6 : 1.9), COLORS.player, (ghost.dash ? 0.30 : 0.13) * k);
    }
  }
  drawGlow(ctx, player.x, player.y, player.radius * 3.6, COLORS.player, 0.42);
  // Blink while invulnerable after a hit.
  if (player.iframes > 0 && game.state === 'playing' && Math.floor(game.time * 14) % 2 === 0) {
    ctx.globalAlpha = 0.35;
  }
  // The warden himself: the baked hooded figure, turned toward his stride, his
  // cloak swaying a breath behind the turn. Two frames trade as he moves.
  const sprites = getSprites();
  const moving = player.trail && player.trail.length > 0;
  const frame = moving ? Math.floor(game.time * 8) % 2 : 0;
  const sway = Math.sin(game.time * (moving ? 6.4 : 2.2)) * (moving ? 0.06 : 0.03);
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate((player.faceAngle ?? 0) + sway);
  blit(ctx, sprites.player, frame, player.radius);
  ctx.restore();
  ctx.globalAlpha = 1;
  // Dash readiness ring.
  if (game.state === 'playing' && player.dashCd <= 0) {
    ctx.strokeStyle = 'rgba(255, 217, 122, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius + 5 + Math.sin(game.time * 4) * 1.2, 0, TAU);
    ctx.stroke();
  }
}

function drawParticles(ctx, game) {
  // Plain motes first, then everything that burns, composited additively in one pass.
  for (const p of game.particles) {
    if (p.add) continue;
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (p.life / p.maxLife) + 0.4, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'lighter';
  for (const p of game.particles) {
    if (!p.add) continue;
    const k = Math.max(0, p.life / p.maxLife);
    if (p.glow) {
      // Flashes swell as they die; sparks shrink. Both ride the same sprite.
      const radius = p.flash ? p.size * (1.6 - k * 0.6) : p.size * 5.2 * k + 2;
      ctx.globalAlpha = p.flash ? k * 0.85 : k * 0.5;
      ctx.drawImage(glowSprite(p.color), p.x - radius, p.y - radius, radius * 2, radius * 2);
    }
    ctx.globalAlpha = k;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * k + 0.4, 0, TAU);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

function drawFloatTexts(ctx, game) {
  ctx.textAlign = 'center';
  for (const t of game.texts) {
    const age = 1 - t.life / t.maxLife;
    // A quick pop as the number lands, then it settles and drifts up.
    const pop = age < 0.16 ? 0.55 + (age / 0.16) * 0.6 : 1.15 - (age - 0.16) * 0.22;
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.scale(pop, pop);
    ctx.globalAlpha = Math.max(0, t.life / t.maxLife);
    ctx.font = `700 ${t.size}px system-ui, sans-serif`;
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = 'rgba(4, 5, 18, 0.85)';
    ctx.strokeText(t.text, 0, 0);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, 0, 0);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}
