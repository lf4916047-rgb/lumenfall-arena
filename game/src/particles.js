// Lumenfall Arena — particles and transient effects: pooled spark particles, the player's
// light trail, floating damage numbers, expanding nova rings, chain-lightning polylines and
// screen shake. This module owns the data and its update; render.js does the drawing.

const MAX_PARTICLES = 560;
const particlePool = [];

function takeParticle() {
  return particlePool.pop() ?? { x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, color: '#fff', drag: 1, gravity: 0, add: false, glow: false };
}

export function initEffects(game) {
  game.particles = [];
  game.texts = [];
  game.rings = [];
  game.zaps = [];
  game.shake = 0;
}

export function spawnBurst(game, x, y, color, count, speed) {
  for (let i = 0; i < count; i++) {
    if (game.particles.length >= MAX_PARTICLES) return;
    const p = takeParticle();
    const angle = Math.random() * Math.PI * 2;
    const v = speed * (0.3 + Math.random() * 0.7);
    p.x = x; p.y = y;
    p.vx = Math.cos(angle) * v;
    p.vy = Math.sin(angle) * v;
    p.maxLife = p.life = 0.3 + Math.random() * 0.4;
    p.size = 1.6 + Math.random() * 2.6;
    p.color = color;
    p.drag = 3.2;
    p.gravity = 0;
    // Bursts burn: most sparks render additively, and the larger ones carry a soft glow
    // halo (drawn from a cached sprite in render.js, so this stays cheap).
    p.add = true;
    p.glow = p.size > 3.1;
    p.flash = false;
    game.particles.push(p);
  }
}

// A single bright flash of light — muzzle flashes, nova ignitions, the King's death.
// Rendered as one additive glow sprite that swells and dies almost at once.
export function spawnFlash(game, x, y, color, size = 30, life = 0.14) {
  if (game.particles.length >= MAX_PARTICLES) return;
  const p = takeParticle();
  p.x = x; p.y = y;
  p.vx = 0; p.vy = 0;
  p.maxLife = p.life = life;
  p.size = size;
  p.color = color;
  p.drag = 0;
  p.gravity = 0;
  p.add = true;
  p.glow = true;
  p.flash = true;
  game.particles.push(p);
}

export function spawnTrailPuff(game, x, y, color) {
  if (game.particles.length >= MAX_PARTICLES) return;
  const p = takeParticle();
  p.x = x + (Math.random() - 0.5) * 10;
  p.y = y + (Math.random() - 0.5) * 10;
  p.vx = (Math.random() - 0.5) * 24;
  p.vy = (Math.random() - 0.5) * 24;
  p.maxLife = p.life = 0.34;
  p.size = 3.4;
  p.color = color;
  p.drag = 1.5;
  p.gravity = 0;
  p.add = false;
  p.glow = false;
  p.flash = false;
  game.particles.push(p);
}

// Ambient motes: embers and dust drifting up through the arena on the night air.
// Long-lived, slow and tiny — a dozen alive at once is ambience, not weather. They
// ride the same pool as every other particle and cost a plain circle apiece.
export function spawnMote(game, x, y) {
  if (game.particles.length >= MAX_PARTICLES) return;
  const p = takeParticle();
  p.x = x; p.y = y;
  p.vx = (Math.random() - 0.5) * 7;
  p.vy = -(7 + Math.random() * 11);
  p.maxLife = p.life = 4.5 + Math.random() * 3;
  p.size = 1 + Math.random() * 1.4;
  p.color = Math.random() < 0.55 ? 'rgba(255, 196, 120, 0.55)' : 'rgba(165, 178, 255, 0.5)';
  p.drag = 0;
  p.gravity = 0;
  p.add = false;
  p.glow = false;
  p.flash = false;
  game.particles.push(p);
}

export function spawnFloatText(game, x, y, text, color, size = 13) {
  if (game.texts.length > 40) game.texts.shift();
  game.texts.push({ x, y, text, color, size, life: 0.75, maxLife: 0.75, vy: -46 });
}

export function spawnRing(game, x, y, color, maxRadius, width = 3) {
  game.rings.push({ x, y, color, maxRadius, width, life: 0.32, maxLife: 0.32 });
}

export function spawnZap(game, points, color) {
  game.zaps.push({ points, color, life: 0.14, maxLife: 0.14 });
}

export function addShake(game, amount) {
  game.shake = Math.min(16, Math.max(game.shake, amount));
}

export function updateEffects(game, dt) {
  const particles = game.particles;
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      particles.splice(i, 1);
      particlePool.push(p);
      continue;
    }
    const dragK = Math.max(0, 1 - p.drag * dt);
    p.vx *= dragK;
    p.vy = p.vy * dragK + p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }

  for (let i = game.texts.length - 1; i >= 0; i--) {
    const t = game.texts[i];
    t.life -= dt;
    t.y += t.vy * dt;
    t.vy *= 0.94;
    if (t.life <= 0) game.texts.splice(i, 1);
  }

  for (let i = game.rings.length - 1; i >= 0; i--) {
    game.rings[i].life -= dt;
    if (game.rings[i].life <= 0) game.rings.splice(i, 1);
  }

  for (let i = game.zaps.length - 1; i >= 0; i--) {
    game.zaps[i].life -= dt;
    if (game.zaps[i].life <= 0) game.zaps.splice(i, 1);
  }

  game.shake = Math.max(0, game.shake - dt * 34);
}
