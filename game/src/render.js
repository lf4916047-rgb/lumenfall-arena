// Lumenfall Arena — rendering: everything the canvas shows, drawn with paths and cached
// glow sprites only (no images). The night is layered — a baked nebula-and-starfield plate,
// drifting aurora light, twinkling bright stars — and everything that burns (the warden,
// bolts, shards, the Hollow King) is composited additively so the arena feels lit, not
// painted. Each enemy kind keeps its own silhouette, now shaded and detailed: winged moth,
// dart, ringed spitter, hexagonal brute, and the crowned, rune-ringed Hollow King.

import { COLORS } from './config.js';

const TAU = Math.PI * 2;

// --- Cached plates and sprites ------------------------------------------------
// The static background (deep space, nebulae, the far star layers) and the vignettes are
// rendered once per resize into offscreen canvases; a frame then costs one drawImage for
// all of it. Glow is a radial-gradient sprite per colour, drawn additively — far cheaper
// than shadowBlur everywhere, and it stacks into real bloom where lights overlap.

let bgCanvas = null;
let vignetteCanvas = null;
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

export function initBackground(width, height) {
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

  // Vignettes: a cool one that seats the arena in the dark, and a red one that pulses
  // when the warden is close to falling.
  vignetteCanvas = makeCanvas(width, height);
  const v = vignetteCanvas.getContext('2d');
  const vg = v.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.42, width / 2, height / 2, Math.max(width, height) * 0.74);
  vg.addColorStop(0, 'rgba(3, 4, 16, 0)');
  vg.addColorStop(1, 'rgba(3, 4, 16, 0.52)');
  v.fillStyle = vg;
  v.fillRect(0, 0, width, height);

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
  // The vignette sits over the world but never shakes with it.
  if (vignetteCanvas) ctx.drawImage(vignetteCanvas, 0, 0);
  const player = game.player;
  if (dangerCanvas && game.state === 'playing' && player.alive && player.hp < player.maxHp * 0.3) {
    ctx.globalAlpha = 0.35 + 0.3 * (0.5 + 0.5 * Math.sin(game.time * 5.2));
    ctx.drawImage(dangerCanvas, 0, 0);
    ctx.globalAlpha = 1;
  }
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
  const a = game.arena;
  const fill = ctx.createLinearGradient(0, a.y, 0, a.y + a.h);
  fill.addColorStop(0, '#0e1132');
  fill.addColorStop(0.5, COLORS.arenaFill);
  fill.addColorStop(1, '#080a22');
  ctx.fillStyle = fill;
  ctx.fillRect(a.x, a.y, a.w, a.h);

  // A pool of light at the arena's heart, and the warden's turning rune circles.
  const cx = a.x + a.w / 2;
  const cy = a.y + a.h / 2;
  const pool = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.min(a.w, a.h) * 0.52);
  pool.addColorStop(0, 'rgba(52, 64, 150, 0.20)');
  pool.addColorStop(1, 'rgba(52, 64, 150, 0)');
  ctx.fillStyle = pool;
  ctx.fillRect(a.x, a.y, a.w, a.h);
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
  // Four dim diamonds mark the cardinal points of the floor.
  ctx.fillStyle = 'rgba(140, 155, 255, 0.10)';
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const px = cx + dx * Math.min(a.w, a.h) * 0.36;
    const py = cy + dy * Math.min(a.w, a.h) * 0.36;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-6, -6, 12, 12);
    ctx.restore();
  }

  ctx.strokeStyle = COLORS.gridLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = a.x + 48; x < a.x + a.w; x += 48) { ctx.moveTo(x, a.y); ctx.lineTo(x, a.y + a.h); }
  for (let y = a.y + 48; y < a.y + a.h; y += 48) { ctx.moveTo(a.x, y); ctx.lineTo(a.x + a.w, y); }
  ctx.stroke();

  // The border burns softly, and its corners flare.
  ctx.save();
  ctx.shadowColor = COLORS.arenaLine;
  ctx.shadowBlur = 14;
  ctx.strokeStyle = '#4a54c8';
  ctx.lineWidth = 2;
  ctx.strokeRect(a.x, a.y, a.w, a.h);
  ctx.restore();
  ctx.strokeStyle = 'rgba(160, 170, 255, 0.28)';
  ctx.lineWidth = 1;
  ctx.strokeRect(a.x - 5, a.y - 5, a.w + 10, a.h + 10);
  ctx.strokeStyle = 'rgba(190, 198, 255, 0.75)';
  ctx.lineWidth = 3;
  const cl = 26;
  ctx.beginPath();
  for (const [px, py, sx, sy] of [[a.x, a.y, 1, 1], [a.x + a.w, a.y, -1, 1], [a.x, a.y + a.h, 1, -1], [a.x + a.w, a.y + a.h, -1, -1]]) {
    ctx.moveTo(px + cl * sx, py);
    ctx.lineTo(px, py);
    ctx.lineTo(px, py + cl * sy);
  }
  ctx.stroke();
}

function drawShards(ctx, game) {
  for (const shard of game.shards) {
    const size = shard.large ? 9 : 5.5;
    const pulse = 1 + Math.sin(shard.t) * 0.15;
    const color = shard.large ? COLORS.shardLarge : COLORS.shard;
    drawGlow(ctx, shard.x, shard.y, size * 3.4, COLORS.shard, shard.large ? 0.5 : 0.34);
    ctx.save();
    ctx.translate(shard.x, shard.y);
    ctx.rotate(Math.PI / 4 + shard.t * 0.4);
    const s = size * pulse;
    const grad = ctx.createLinearGradient(0, -s / 2, 0, s / 2);
    grad.addColorStop(0, COLORS.shardLarge);
    grad.addColorStop(0.5, color);
    grad.addColorStop(1, '#0f9d84');
    ctx.fillStyle = grad;
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.fillRect(-s * 0.18, -s * 0.18, s * 0.36, s * 0.36);
    ctx.restore();
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
    drawGlow(ctx, enemy.x, enemy.y, enemy.radius * (enemy.elite ? 2.5 : 2.0), baseColor, enemy.elite ? 0.4 : 0.28);
  }
  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  switch (enemy.kind) {
    case 'moth': drawMoth(ctx, enemy); break;
    case 'darter': drawDarter(ctx, enemy); break;
    case 'brute': drawBrute(ctx, enemy); break;
    case 'spitter': drawSpitter(ctx, game, enemy); break;
    case 'boss': drawBoss(ctx, game, enemy); break;
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
  if (enemy.flash > 0) {
    ctx.globalAlpha = (enemy.flash / 0.09) * 0.75;
    ctx.fillStyle = COLORS.white;
    ctx.beginPath();
    ctx.arc(0, 0, enemy.radius, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
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

function drawMoth(ctx, enemy) {
  const r = enemy.radius;
  const flap = Math.sin(enemy.wobble * 2.4) * 0.5;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.rotate(side * (0.7 + flap * 0.4));
    const wing = ctx.createRadialGradient(0, 0, 1, side * r * 0.85, 0, r * 0.95);
    wing.addColorStop(0, '#ff7ba0');
    wing.addColorStop(0.55, COLORS.enemyMoth);
    wing.addColorStop(1, '#a1123c');
    ctx.fillStyle = wing;
    ctx.beginPath();
    ctx.ellipse(side * r * 0.85, 0, r * 0.82, r * 0.44, 0, 0, TAU);
    ctx.fill();
    // A pale eye-spot on each wing, like a real moth's warning.
    ctx.fillStyle = 'rgba(255, 215, 226, 0.8)';
    ctx.beginPath();
    ctx.arc(side * r * 0.95, 0, r * 0.13, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  const body = ctx.createRadialGradient(-r * 0.2, -r * 0.2, 1, 0, 0, r * 0.66);
  body.addColorStop(0, '#ff8fab');
  body.addColorStop(1, '#c21847');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.62, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ffe3ec';
  ctx.beginPath();
  ctx.arc(-r * 0.16, -r * 0.1, r * 0.13, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(r * 0.16, -r * 0.1, r * 0.13, 0, TAU);
  ctx.fill();
}

function drawDarter(ctx, enemy) {
  const r = enemy.radius;
  const angle = Math.atan2(enemy.vy, enemy.vx);
  ctx.rotate(angle);
  // Speed streaks off the tail while it lunges.
  const speed = Math.hypot(enemy.vx, enemy.vy);
  if (speed > 130) {
    ctx.strokeStyle = 'rgba(255, 122, 77, 0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r * 0.9, r * 0.4);
    ctx.lineTo(-r * (1.6 + speed / 300), r * 0.4);
    ctx.moveTo(-r * 0.9, -r * 0.4);
    ctx.lineTo(-r * (1.6 + speed / 300), -r * 0.4);
    ctx.stroke();
  }
  const bodyGrad = ctx.createLinearGradient(-r, 0, r * 1.3, 0);
  bodyGrad.addColorStop(0, '#a12e08');
  bodyGrad.addColorStop(0.55, COLORS.enemyDarter);
  bodyGrad.addColorStop(1, '#ffc9a3');
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.moveTo(r * 1.3, 0);
  ctx.lineTo(-r * 0.35, r * 0.34);
  ctx.lineTo(-r * 0.95, r * 0.78);
  ctx.lineTo(-r * 0.62, 0);
  ctx.lineTo(-r * 0.95, -r * 0.78);
  ctx.lineTo(-r * 0.35, -r * 0.34);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff1e6';
  ctx.beginPath();
  ctx.arc(r * 0.42, 0, r * 0.2, 0, TAU);
  ctx.fill();
}

function drawBrute(ctx, enemy) {
  const r = enemy.radius;
  ctx.rotate(enemy.wobble * 0.15);
  // Short spikes at the vertices before the shell, so the silhouette bites.
  ctx.fillStyle = '#8a2be2';
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * TAU + Math.PI / 6;
    const bx = Math.cos(angle) * r * 0.92;
    const by = Math.sin(angle) * r * 0.92;
    const tx = Math.cos(angle) * r * 1.18;
    const ty = Math.sin(angle) * r * 1.18;
    const px = Math.cos(angle + 0.22) * r * 0.92;
    const py = Math.sin(angle + 0.22) * r * 0.92;
    ctx.moveTo(bx, by);
    ctx.lineTo(tx, ty);
    ctx.lineTo(px, py);
  }
  ctx.fill();
  const shell = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.2, 0, 0, r * 1.05);
  shell.addColorStop(0, '#d98cff');
  shell.addColorStop(0.5, COLORS.enemyBrute);
  shell.addColorStop(1, '#5e1490');
  ctx.fillStyle = shell;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * TAU;
    const px = Math.cos(angle) * r;
    const py = Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  // A carved inner hexagon and a heart of dark glass with a burning core.
  ctx.strokeStyle = 'rgba(243, 213, 255, 0.5)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * TAU;
    const px = Math.cos(angle) * r * 0.68;
    const py = Math.sin(angle) * r * 0.68;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = '#2a0a3d';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.5, 0, TAU);
  ctx.fill();
  const corePulse = 0.75 + 0.25 * Math.sin(enemy.wobble * 2.2);
  ctx.fillStyle = '#f3d5ff';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.24 * corePulse + r * 0.05, 0, TAU);
  ctx.fill();
}

function drawSpitter(ctx, game, enemy) {
  const r = enemy.radius;
  // The core's gaze tracks the warden.
  const look = Math.atan2(game.player.y - enemy.y, game.player.x - enemy.x);
  const ring = ctx.createLinearGradient(-r, -r, r, r);
  ring.addColorStop(0, '#ff8ae2');
  ring.addColorStop(0.5, COLORS.enemySpitter);
  ring.addColorStop(1, '#a1127c');
  ctx.strokeStyle = ring;
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.85, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 224, 247, 0.4)';
  ctx.lineWidth = 1.4;
  ctx.setLineDash([7, 9]);
  ctx.lineDashOffset = -enemy.wobble * 9;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.62, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  // Three satellite orbs ride the outer ring.
  const orbit = enemy.wobble * 1.4;
  ctx.fillStyle = COLORS.enemySpitter;
  for (let i = 0; i < 3; i++) {
    const a = orbit + (i / 3) * TAU;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85, 3.2, 0, TAU);
    ctx.fill();
  }
  const core = ctx.createRadialGradient(0, 0, 0.5, 0, 0, r * 0.44);
  core.addColorStop(0, '#ffd7f4');
  core.addColorStop(0.45, COLORS.enemySpitter);
  core.addColorStop(1, '#7c0d5c');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.42, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#2b021e';
  ctx.beginPath();
  ctx.arc(Math.cos(look) * r * 0.14, Math.sin(look) * r * 0.14, r * 0.15, 0, TAU);
  ctx.fill();
}

function drawBoss(ctx, game, enemy) {
  const r = enemy.radius;
  const pulse = 1 + Math.sin(game.time * 2.2) * 0.045;
  // The King darkens the air around him: layered auras, rose over violet. (Local
  // coordinates — drawEnemy has already translated the context to the boss.)
  drawGlow(ctx, 0, 0, r * 3.4, '#5c1440', 0.30);
  drawGlow(ctx, 0, 0, r * 2.4, COLORS.boss, 0.34);
  ctx.save();
  // The King is drawn larger than his collision body — he should loom, not fit.
  ctx.scale(pulse * 1.24, pulse * 1.24);

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

  // The crown: seven tall spikes with gemmed tips over a band.
  const crown = ctx.createLinearGradient(0, -r * 1.5, 0, -r * 0.6);
  crown.addColorStop(0, '#fff3c4');
  crown.addColorStop(0.5, COLORS.bossCrown);
  crown.addColorStop(1, '#c78d1d');
  ctx.fillStyle = crown;
  ctx.beginPath();
  for (let i = 0; i < 7; i++) {
    const angle = -Math.PI * 0.88 + (i / 6) * Math.PI * 0.76;
    const spread = 0.13;
    ctx.moveTo(Math.cos(angle - spread) * r * 0.78, Math.sin(angle - spread) * r * 0.78);
    ctx.lineTo(Math.cos(angle) * r * 1.46, Math.sin(angle) * r * 1.46);
    ctx.lineTo(Math.cos(angle + spread) * r * 0.78, Math.sin(angle + spread) * r * 0.78);
  }
  ctx.fill();
  const gems = ['#ff5d8f', '#2ee6c8', '#ff5d8f', '#9be7ff', '#ff5d8f', '#2ee6c8', '#ff5d8f'];
  for (let i = 0; i < 7; i++) {
    const angle = -Math.PI * 0.88 + (i / 6) * Math.PI * 0.76;
    ctx.fillStyle = gems[i];
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * r * 1.46, Math.sin(angle) * r * 1.46, 3.6, 0, TAU);
    ctx.fill();
  }

  // The body: a burning gradient globe with a dark, swirling heart. (No shadowBlur —
  // the layered aura sprites above already bloom him, and blur is the dearest paint
  // a software rasteriser sells.)
  const bodyGrad = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.15, 0, 0, r * 1.05);
  bodyGrad.addColorStop(0, '#ff8fab');
  bodyGrad.addColorStop(0.45, COLORS.boss);
  bodyGrad.addColorStop(1, '#6e0c2a');
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#38040f';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.62, 0, TAU);
  ctx.fill();
  // Swirl arcs turning inside the dark.
  ctx.strokeStyle = 'rgba(255, 93, 143, 0.55)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 3; i++) {
    const start = game.time * 0.9 + (i / 3) * TAU;
    ctx.beginPath();
    ctx.arc(0, 0, r * (0.34 + i * 0.13), start, start + Math.PI * 0.8);
    ctx.stroke();
  }
  // Three eyes: two gold, and the pale third that never blinks.
  ctx.fillStyle = '#ffd97a';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(side * r * 0.3, -r * 0.16, r * 0.145, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#38040f';
    ctx.beginPath();
    ctx.arc(side * r * 0.3, -r * 0.16, r * 0.062, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffd97a';
  }
  drawGlow(ctx, 0, r * 0.04, r * 0.55, '#ffe9b0', 0.55);
  ctx.fillStyle = '#ffe9b0';
  ctx.beginPath();
  ctx.arc(0, r * 0.0, r * 0.16, 0, TAU);
  ctx.fill();
  // A jagged ember mouth.
  ctx.fillStyle = '#ff7a4d';
  ctx.beginPath();
  const mw = r * 0.5;
  const my = r * 0.34;
  ctx.moveTo(-mw, my);
  for (let i = 0; i <= 6; i++) {
    const x = -mw + (i / 6) * mw * 2;
    ctx.lineTo(x, my + (i % 2 === 0 ? 0 : r * 0.1));
  }
  ctx.lineTo(mw, my + r * 0.13);
  ctx.lineTo(-mw, my + r * 0.13);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
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
  ctx.save();
  ctx.translate(player.x, player.y);
  const bodyGrad = ctx.createRadialGradient(-player.radius * 0.3, -player.radius * 0.35, 2, 0, 0, player.radius * 1.1);
  bodyGrad.addColorStop(0, '#fff3c4');
  bodyGrad.addColorStop(0.45, COLORS.player);
  bodyGrad.addColorStop(1, '#d97c06');
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.arc(0, 0, player.radius, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 243, 196, 0.8)';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  // The warden's rotating four-point star.
  ctx.rotate(game.time * 1.8);
  ctx.fillStyle = COLORS.playerCore;
  const r = player.radius * 0.72;
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.quadraticCurveTo(0, 0, 0, r);
  ctx.quadraticCurveTo(0, 0, -r, 0);
  ctx.quadraticCurveTo(0, 0, 0, -r);
  ctx.fill();
  ctx.restore();
  // Dash readiness ring.
  if (game.state === 'playing' && player.dashCd <= 0) {
    ctx.strokeStyle = 'rgba(255, 217, 122, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius + 5 + Math.sin(game.time * 4) * 1.2, 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
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
