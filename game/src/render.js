// Lumenfall Arena — rendering: everything the canvas shows. The night is layered —
// a baked nebula-and-starfield plate, twinkling bright stars — and everything that
// burns (the warden, bolts, shards, the Hollow King) is composited additively so
// the arena feels lit, not painted. The creatures themselves are pre-rendered
// sprites (sprites.js bakes them once at load): a hooded Star-warden, fuzzy void
// moths, bat-winged gloomwings, horned hexshell hulks, the floating Watcher, and
// the tall robed Hollow King — the frame loop just blits the current frame.

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
  // The baked plate: deep space, five nebula washes, and two static star layers.
  bgCanvas = makeCanvas(width, height);
  const c = bgCanvas.getContext('2d');
  c.fillStyle = COLORS.bgDeep;
  c.fillRect(0, 0, width, height);
  const centre = c.createRadialGradient(width / 2, height / 2, 60, width / 2, height / 2, Math.max(width, height) * 0.66);
  centre.addColorStop(0, COLORS.bgGlow);
  centre.addColorStop(1, 'rgba(7, 8, 34, 0)');
  c.fillStyle = centre;
  c.fillRect(0, 0, width, height);

  const nebulae = [
    { x: 0.22, y: 0.26, r: 0.46, color: '#3b2a8f', alpha: 0.20 },
    { x: 0.82, y: 0.18, r: 0.38, color: '#5c1440', alpha: 0.16 },
    { x: 0.72, y: 0.82, r: 0.50, color: '#0d4a5c', alpha: 0.15 },
    { x: 0.12, y: 0.86, r: 0.34, color: '#27408f', alpha: 0.14 },
    { x: 0.52, y: 0.52, r: 0.30, color: '#6e1d4e', alpha: 0.10 },
  ];
  for (const n of nebulae) {
    const [r, g, b] = parseColor(n.color);
    const rad = Math.max(width, height) * n.r;
    const grad = c.createRadialGradient(width * n.x, height * n.y, 4, width * n.x, height * n.y, rad);
    grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${n.alpha})`);
    grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    c.fillStyle = grad;
    c.fillRect(0, 0, width, height);
  }

  const starLayers = [
    { count: 150, rMin: 0.4, rMax: 1.0, alpha: 0.5, tint: '#8f9be0' },
    { count: 80, rMin: 0.8, rMax: 1.5, alpha: 0.75, tint: '#aab4ff' },
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
  for (let i = 0; i < 36; i++) {
    twinkles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      r: 1.1 + Math.random() * 1.3,
      phase: Math.random() * TAU,
      speed: 0.7 + Math.random() * 1.6,
      tint: tints[Math.floor(Math.random() * tints.length)],
    });
  }

  // The arena's static dressing bakes into the plate too — its fill gradient, the
  // pool of light, the grid, the burning border. Per frame this all used to cost
  // two full-arena gradient fills and a shadowBlur stroke; baked, it costs nothing.
  // Only the turning rune circles stay live (they are drawn in drawArena).
  if (arena) {
    const a = arena;
    const fill = c.createLinearGradient(0, a.y, 0, a.y + a.h);
    fill.addColorStop(0, '#0e1132');
    fill.addColorStop(0.5, COLORS.arenaFill);
    fill.addColorStop(1, '#080a22');
    c.fillStyle = fill;
    c.fillRect(a.x, a.y, a.w, a.h);
    const cx = a.x + a.w / 2;
    const cy = a.y + a.h / 2;
    const pool = c.createRadialGradient(cx, cy, 10, cx, cy, Math.min(a.w, a.h) * 0.52);
    pool.addColorStop(0, 'rgba(52, 64, 150, 0.20)');
    pool.addColorStop(1, 'rgba(52, 64, 150, 0)');
    c.fillStyle = pool;
    c.fillRect(a.x, a.y, a.w, a.h);
    c.fillStyle = 'rgba(140, 155, 255, 0.10)';
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const px = cx + dx * Math.min(a.w, a.h) * 0.36;
      const py = cy + dy * Math.min(a.w, a.h) * 0.36;
      c.save();
      c.translate(px, py);
      c.rotate(Math.PI / 4);
      c.fillRect(-6, -6, 12, 12);
      c.restore();
    }
    c.strokeStyle = COLORS.gridLine;
    c.lineWidth = 1;
    c.beginPath();
    for (let x = a.x + 48; x < a.x + a.w; x += 48) { c.moveTo(x, a.y); c.lineTo(x, a.y + a.h); }
    for (let y = a.y + 48; y < a.y + a.h; y += 48) { c.moveTo(a.x, y); c.lineTo(a.x + a.w, y); }
    c.stroke();
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
    for (const [px, py, sx, sy] of [[a.x, a.y, 1, 1], [a.x + a.w, a.y, -1, 1], [a.x, a.y + a.h, 1, -1], [a.x + a.w, a.y + a.h, -1, -1]]) {
      c.moveTo(px + cl * sx, py);
      c.lineTo(px, py);
      c.lineTo(px, py + cl * sy);
    }
    c.stroke();
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
  // Everything static about the arena — fill, pool, grid, border — is baked into
  // the background plate. What stays live is the warden's turning rune circles.
  const a = game.arena;
  const cx = a.x + a.w / 2;
  const cy = a.y + a.h / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = 'rgba(140, 155, 255, 0.08)';
  ctx.lineWidth = 9;
  ctx.setLineDash([30, 20]);
  ctx.rotate(game.time * 0.045);
  ctx.beginPath();
  ctx.arc(0, 0, 148, 0, TAU);
  ctx.stroke();
  ctx.rotate(-game.time * 0.075);
  ctx.lineWidth = 3;
  ctx.setLineDash([5, 15]);
  ctx.strokeStyle = 'rgba(140, 155, 255, 0.10)';
  ctx.beginPath();
  ctx.arc(0, 0, 196, 0, TAU);
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
