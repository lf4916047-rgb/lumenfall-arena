// Lumenfall Arena — rendering: everything the canvas shows, drawn with paths only (no
// images). Each enemy kind has its own silhouette — winged moth, dart, ringed spitter,
// hexagonal brute, crowned Hollow King — so the field reads at a glance in the palette.

import { COLORS } from './config.js';

const TAU = Math.PI * 2;
let stars = [];

export function initBackground(width, height) {
  stars = [];
  for (let i = 0; i < 130; i++) {
    stars.push({ x: Math.random() * width, y: Math.random() * height, r: Math.random() * 1.4 + 0.4, phase: Math.random() * TAU });
  }
}

export function renderGame(ctx, game, width, height) {
  ctx.save();
  drawBackground(ctx, game, width, height);
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
}

function drawBackground(ctx, game, width, height) {
  ctx.fillStyle = COLORS.bgDeep;
  ctx.fillRect(0, 0, width, height);
  const glow = ctx.createRadialGradient(width / 2, height / 2, 60, width / 2, height / 2, Math.max(width, height) * 0.62);
  glow.addColorStop(0, COLORS.bgGlow);
  glow.addColorStop(1, 'rgba(7, 8, 34, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
  for (const star of stars) {
    const twinkle = 0.35 + 0.3 * Math.sin(game.time * 1.7 + star.phase);
    ctx.globalAlpha = twinkle;
    ctx.fillStyle = '#aab4ff';
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawArena(ctx, game) {
  const a = game.arena;
  ctx.fillStyle = COLORS.arenaFill;
  ctx.fillRect(a.x, a.y, a.w, a.h);
  ctx.strokeStyle = COLORS.gridLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = a.x + 48; x < a.x + a.w; x += 48) { ctx.moveTo(x, a.y); ctx.lineTo(x, a.y + a.h); }
  for (let y = a.y + 48; y < a.y + a.h; y += 48) { ctx.moveTo(a.x, y); ctx.lineTo(a.x + a.w, y); }
  ctx.stroke();
  ctx.strokeStyle = COLORS.arenaLine;
  ctx.lineWidth = 2;
  ctx.strokeRect(a.x, a.y, a.w, a.h);
  ctx.strokeStyle = 'rgba(120, 132, 255, 0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(a.x - 5, a.y - 5, a.w + 10, a.h + 10);
}

function drawShards(ctx, game) {
  for (const shard of game.shards) {
    const size = shard.large ? 9 : 5.5;
    const pulse = 1 + Math.sin(shard.t) * 0.15;
    ctx.save();
    ctx.translate(shard.x, shard.y);
    ctx.rotate(Math.PI / 4 + shard.t * 0.4);
    ctx.shadowColor = COLORS.shard;
    ctx.shadowBlur = 10;
    ctx.fillStyle = shard.large ? COLORS.shardLarge : COLORS.shard;
    const s = size * pulse;
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.restore();
  }
}

function drawRings(ctx, game) {
  for (const ring of game.rings) {
    const k = 1 - ring.life / ring.maxLife;
    ctx.globalAlpha = (1 - k) * 0.8;
    ctx.strokeStyle = ring.color;
    ctx.lineWidth = ring.width * (1 - k) + 0.5;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, ring.maxRadius * (0.25 + 0.75 * k), 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawZaps(ctx, game) {
  for (const zap of game.zaps) {
    ctx.globalAlpha = Math.max(0, zap.life / zap.maxLife);
    ctx.strokeStyle = zap.color;
    ctx.lineWidth = 2;
    ctx.shadowColor = zap.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    zap.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
}

function drawEnemy(ctx, game, enemy) {
  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  switch (enemy.kind) {
    case 'moth': drawMoth(ctx, enemy); break;
    case 'darter': drawDarter(ctx, enemy); break;
    case 'brute': drawBrute(ctx, enemy); break;
    case 'spitter': drawSpitter(ctx, enemy); break;
    case 'boss': drawBoss(ctx, game, enemy); break;
  }
  if (enemy.elite) {
    ctx.strokeStyle = COLORS.bossCrown;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, enemy.radius + 4, 0, TAU);
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
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(enemy.x - enemy.radius, enemy.y - enemy.radius - 10, w, 4);
    ctx.fillStyle = COLORS.hp;
    ctx.fillRect(enemy.x - enemy.radius, enemy.y - enemy.radius - 10, w * Math.max(0, enemy.hp / enemy.maxHp), 4);
  }
}

function drawMoth(ctx, enemy) {
  const r = enemy.radius;
  const flap = Math.sin(enemy.wobble * 2.4) * 0.5;
  ctx.fillStyle = COLORS.enemyMoth;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.rotate(side * (0.7 + flap * 0.4));
    ctx.beginPath();
    ctx.ellipse(side * r * 0.85, 0, r * 0.78, r * 0.42, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.62, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ffd7e2';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.24, 0, TAU);
  ctx.fill();
}

function drawDarter(ctx, enemy) {
  const r = enemy.radius;
  const angle = Math.atan2(enemy.vy, enemy.vx);
  ctx.rotate(angle);
  ctx.fillStyle = COLORS.enemyDarter;
  ctx.beginPath();
  ctx.moveTo(r * 1.25, 0);
  ctx.lineTo(-r * 0.9, r * 0.72);
  ctx.lineTo(-r * 0.45, 0);
  ctx.lineTo(-r * 0.9, -r * 0.72);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffe3d3';
  ctx.beginPath();
  ctx.arc(r * 0.25, 0, r * 0.26, 0, TAU);
  ctx.fill();
}

function drawBrute(ctx, enemy) {
  const r = enemy.radius;
  ctx.rotate(enemy.wobble * 0.15);
  ctx.fillStyle = COLORS.enemyBrute;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * TAU;
    const px = Math.cos(angle) * r;
    const py = Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#2a0a3d';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.55, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#f3d5ff';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.26, 0, TAU);
  ctx.fill();
}

function drawSpitter(ctx, enemy) {
  const r = enemy.radius;
  ctx.strokeStyle = COLORS.enemySpitter;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.85, 0, TAU);
  ctx.stroke();
  const orbit = enemy.wobble * 1.4;
  ctx.fillStyle = COLORS.enemySpitter;
  ctx.beginPath();
  ctx.arc(Math.cos(orbit) * r * 0.85, Math.sin(orbit) * r * 0.85, 3.4, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.42, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ffe0f7';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.18, 0, TAU);
  ctx.fill();
}

function drawBoss(ctx, game, enemy) {
  const r = enemy.radius;
  const pulse = 1 + Math.sin(game.time * 2.2) * 0.04;
  ctx.save();
  ctx.scale(pulse, pulse);
  // Crown of spikes.
  ctx.fillStyle = COLORS.bossCrown;
  ctx.beginPath();
  for (let i = 0; i < 7; i++) {
    const angle = -Math.PI * 0.85 + (i / 6) * Math.PI * 0.7;
    const x1 = Math.cos(angle) * r * 0.8;
    const y1 = Math.sin(angle) * r * 0.8;
    const x2 = Math.cos(angle) * r * 1.22;
    const y2 = Math.sin(angle) * r * 1.22;
    const xm = Math.cos(angle + 0.12) * r * 0.8;
    const ym = Math.sin(angle + 0.12) * r * 0.8;
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(xm, ym);
  }
  ctx.fill();
  // Body.
  ctx.shadowColor = COLORS.boss;
  ctx.shadowBlur = 26;
  ctx.fillStyle = COLORS.boss;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#4d0a1e';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.66, 0, TAU);
  ctx.fill();
  // Eyes.
  ctx.fillStyle = '#ffd97a';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(side * r * 0.3, -r * 0.12, r * 0.11, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#ffe9b0';
  ctx.beginPath();
  ctx.arc(0, r * 0.3, r * 0.16, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawOrbitOrbs(ctx, game) {
  for (const orb of game.weapons.orbitOrbs) {
    ctx.save();
    ctx.translate(orb.x, orb.y);
    ctx.rotate(game.time * 6);
    ctx.shadowColor = COLORS.spark;
    ctx.shadowBlur = 12;
    ctx.fillStyle = COLORS.spark;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6.5, 0);
    ctx.lineTo(0, 9);
    ctx.lineTo(-6.5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // A faint guide circle so players can read the blades' reach.
  if (game.weapons.orbitOrbs.length > 0) {
    ctx.strokeStyle = 'rgba(155, 231, 255, 0.13)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(game.player.x, game.player.y, Math.hypot(game.weapons.orbitOrbs[0].x - game.player.x, game.weapons.orbitOrbs[0].y - game.player.y), 0, TAU);
    ctx.stroke();
  }
}

function drawBolts(ctx, game) {
  for (const bolt of game.bolts) {
    ctx.save();
    ctx.translate(bolt.x, bolt.y);
    ctx.shadowColor = bolt.color ?? COLORS.bolt;
    ctx.shadowBlur = 9;
    ctx.fillStyle = bolt.color ?? COLORS.bolt;
    ctx.beginPath();
    ctx.arc(0, 0, bolt.radius, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(0, 0, bolt.radius * 0.45, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

function drawPlayer(ctx, game) {
  const player = game.player;
  // Blink while invulnerable after a hit.
  if (player.iframes > 0 && game.state === 'playing' && Math.floor(game.time * 14) % 2 === 0) {
    ctx.globalAlpha = 0.35;
  }
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.shadowColor = COLORS.player;
  ctx.shadowBlur = 22;
  ctx.fillStyle = COLORS.player;
  ctx.beginPath();
  ctx.arc(0, 0, player.radius, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;
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
    ctx.strokeStyle = 'rgba(255, 217, 122, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius + 5 + Math.sin(game.time * 4) * 1.2, 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawParticles(ctx, game) {
  for (const p of game.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (p.life / p.maxLife) + 0.4, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawFloatTexts(ctx, game) {
  ctx.textAlign = 'center';
  for (const t of game.texts) {
    ctx.globalAlpha = Math.max(0, t.life / t.maxLife);
    ctx.font = `600 ${t.size}px system-ui, sans-serif`;
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}
