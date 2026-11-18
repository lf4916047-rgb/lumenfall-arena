// Lumenfall Arena — weapons and upgrades: the four auto-firing weapons, the five stacking
// passives, and the pool the level-up screen draws its three choices from. Weapons fire on
// their own; the player's skill is positioning, so each weapon rewards a different range.

import { COLORS, WEAPONS, WEAPON_MAX_LEVEL } from './config.js';
import { fireBolt, nearestEnemy, damageEnemy } from './entities.js';
import { spawnRing, spawnZap, spawnBurst, spawnFlash } from './particles.js';
import { sfxShoot, sfxNova, sfxZap } from './audio.js';

export function makeLoadout() {
  return {
    weapons: {
      starbolts: { level: 1, timer: 0.3 },
      orbitblades: { level: 0, angle: 0 },
      novapulse: { level: 0, timer: 1.6 },
      chainspark: { level: 0, timer: 0.8 },
    },
    passives: {
      speedMul: 1,
      damageMul: 1,
      magnetMul: 1,
      dashCdMul: 1,
    },
    orbitOrbs: [],
  };
}

function dmg(game, base) {
  return base * game.passives.damageMul;
}

export function updateWeapons(game, dt) {
  const player = game.player;
  const loadout = game.weapons;
  updateStarBolts(game, dt, loadout.weapons.starbolts, player);
  updateOrbitBlades(game, dt, loadout.weapons.orbitblades, player);
  updateNovaPulse(game, dt, loadout.weapons.novapulse, player);
  updateChainSpark(game, dt, loadout.weapons.chainspark, player);
}

function updateStarBolts(game, dt, weapon, player) {
  if (weapon.level <= 0) return;
  const cfg = WEAPONS.starbolts;
  const li = weapon.level - 1;
  weapon.timer -= dt;
  if (weapon.timer > 0) return;
  const target = nearestEnemy(game, player.x, player.y, 680);
  if (!target) {
    weapon.timer = 0.08;
    return;
  }
  weapon.timer = cfg.interval[li];
  const count = cfg.count[li];
  for (let i = 0; i < count; i++) {
    const spread = (i - (count - 1) / 2) * 0.16;
    const angle = Math.atan2(target.y - player.y, target.x - player.x) + spread;
    fireBolt(game, {
      x: player.x, y: player.y,
      vx: Math.cos(angle) * cfg.speed, vy: Math.sin(angle) * cfg.speed,
      damage: dmg(game, cfg.damage[li]), friendly: true, target,
      radius: 5, life: 1.5, color: COLORS.bolt,
    });
    // Star bolts steer; entities.js reads this off the bolt.
    game.bolts[game.bolts.length - 1].steer = cfg.steer;
  }
  spawnFlash(game, player.x, player.y, COLORS.bolt, 20, 0.1);
  sfxShoot();
}

function updateOrbitBlades(game, dt, weapon, player) {
  const loadout = game.weapons;
  if (weapon.level <= 0) {
    loadout.orbitOrbs = [];
    return;
  }
  const cfg = WEAPONS.orbitblades;
  const li = weapon.level - 1;
  weapon.angle += cfg.spin * dt;
  const count = cfg.count[li];
  const radius = cfg.radius[li];
  loadout.orbitOrbs = [];
  for (let i = 0; i < count; i++) {
    const angle = weapon.angle + (i / count) * Math.PI * 2;
    const orb = { x: player.x + Math.cos(angle) * radius, y: player.y + Math.sin(angle) * radius };
    loadout.orbitOrbs.push(orb);
    for (const enemy of game.enemies) {
      if (enemy.dead) continue;
      const dx = enemy.x - orb.x;
      const dy = enemy.y - orb.y;
      const rr = enemy.radius + 13;
      if (dx * dx + dy * dy < rr * rr && game.elapsed - enemy.orbitHitAt > cfg.hitEvery) {
        enemy.orbitHitAt = game.elapsed;
        const d = Math.hypot(dx, dy) || 1;
        damageEnemy(game, enemy, dmg(game, cfg.damage[li]), (dx / d) * 90, (dy / d) * 90);
      }
    }
  }
}

function updateNovaPulse(game, dt, weapon, player) {
  if (weapon.level <= 0) return;
  const cfg = WEAPONS.novapulse;
  const li = weapon.level - 1;
  weapon.timer -= dt;
  if (weapon.timer > 0) return;
  weapon.timer = cfg.interval[li];
  const radius = cfg.radius[li];
  spawnRing(game, player.x, player.y, COLORS.nova, radius, 4);
  spawnFlash(game, player.x, player.y, COLORS.nova, radius * 0.55, 0.22);
  sfxNova();
  for (const enemy of [...game.enemies]) {
    if (enemy.dead) continue;
    const dx = enemy.x - player.x;
    const dy = enemy.y - player.y;
    const d = Math.hypot(dx, dy);
    if (d < radius + enemy.radius) {
      const falloff = 1 - (d / (radius + enemy.radius)) * 0.4;
      damageEnemy(game, enemy, dmg(game, cfg.damage[li]) * falloff, (dx / (d || 1)) * 260, (dy / (d || 1)) * 260);
    }
  }
}

function updateChainSpark(game, dt, weapon, player) {
  if (weapon.level <= 0) return;
  const cfg = WEAPONS.chainspark;
  const li = weapon.level - 1;
  weapon.timer -= dt;
  if (weapon.timer > 0) return;
  let current = nearestEnemy(game, player.x, player.y, cfg.range);
  if (!current) {
    weapon.timer = 0.12;
    return;
  }
  weapon.timer = cfg.interval[li];
  const points = [{ x: player.x, y: player.y }];
  const visited = new Set();
  let falloff = 1;
  for (let hop = 0; hop < cfg.chains[li] && current; hop++) {
    visited.add(current);
    // A jagged midpoint makes the bolt read as lightning rather than a laser.
    points.push({
      x: (points[points.length - 1].x + current.x) / 2 + (Math.random() - 0.5) * 26,
      y: (points[points.length - 1].y + current.y) / 2 + (Math.random() - 0.5) * 26,
    });
    points.push({ x: current.x, y: current.y });
    damageEnemy(game, current, dmg(game, cfg.damage[li]) * falloff);
    spawnBurst(game, current.x, current.y, COLORS.spark, 4, 120);
    if (hop === 0) spawnFlash(game, current.x, current.y, COLORS.spark, 26, 0.12);
    falloff *= 0.78;
    let next = null;
    let bestD2 = cfg.linkRange * cfg.linkRange;
    for (const enemy of game.enemies) {
      if (enemy.dead || visited.has(enemy)) continue;
      const dx = enemy.x - current.x;
      const dy = enemy.y - current.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; next = enemy; }
    }
    current = next;
  }
  spawnZap(game, points, COLORS.spark);
  sfxZap();
}

// --- Level-up choices --------------------------------------------------------

const PASSIVES = [
  { key: 'swift', name: 'Swift Sigil', desc: '+8% movement speed. Outrun the swarm.', apply: (g) => { g.passives.speedMul *= 1.08; } },
  { key: 'vitality', name: 'Dawn Heart', desc: '+25 max health, and heal 25 now.', apply: (g) => { g.player.maxHp += 25; g.player.hp = Math.min(g.player.maxHp, g.player.hp + 25); } },
  { key: 'lodestone', name: 'Lodestone Charm', desc: '+35% shard magnet radius.', apply: (g) => { g.passives.magnetMul *= 1.35; } },
  { key: 'power', name: 'Ember Core', desc: '+12% damage on every weapon.', apply: (g) => { g.passives.damageMul *= 1.12; } },
  { key: 'dashflow', name: 'Phase Ribbon', desc: 'Dash recharges 15% faster.', apply: (g) => { g.passives.dashCdMul *= 0.85; } },
];

// Draw up to three distinct choices: unmaxed weapons first (new ones and upgrades),
// padded with passives, shuffled so position carries no meaning.
export function buildChoices(game) {
  const pool = [];
  for (const [key, cfg] of Object.entries(WEAPONS)) {
    const level = game.weapons.weapons[key].level;
    if (level < WEAPON_MAX_LEVEL) {
      pool.push({
        kind: 'weapon', key,
        title: cfg.name,
        tag: level === 0 ? 'NEW WEAPON' : `LEVEL ${level + 1}`,
        desc: cfg.desc,
        apply: (g) => { g.weapons.weapons[key].level++; },
      });
    }
  }
  for (const passive of PASSIVES) {
    pool.push({
      kind: 'passive', key: passive.key,
      title: passive.name, tag: 'PASSIVE', desc: passive.desc,
      apply: passive.apply,
    });
  }
  // Shuffle, then prefer a mix: guarantee at least one weapon when one is available.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const choices = pool.slice(0, 3);
  if (choices.length === 3 && !choices.some((c) => c.kind === 'weapon')) {
    const weaponChoice = pool.find((c) => c.kind === 'weapon');
    if (weaponChoice) choices[2] = weaponChoice;
  }
  return choices;
}
