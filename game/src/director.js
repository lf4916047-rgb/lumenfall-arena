// Lumenfall Arena — the director: decides what spawns, where, and when. The spawn interval
// shrinks and the mix hardens as the Dawn Timer runs down; elites arrive on a drumbeat and
// the Hollow King makes his entrance at four minutes, heralded six seconds ahead.

import { ENEMIES, BOSS_TIME, BOSS_WARN_TIME, ELITE_EVERY, ELITE_FIRST, spawnInterval, aliveCap } from './config.js';
import { spawnEnemy } from './entities.js';
import { sfxBossWarn } from './audio.js';

export function makeDirector() {
  return {
    spawnT: 1.1,
    nextEliteAt: ELITE_FIRST,
    bossWarned: false,
    bossSpawned: false,
  };
}

// A point on the arena's edge, biased away from the player so nothing spawns on top of them.
function edgeSpawnPoint(game) {
  const a = game.arena;
  const player = game.player;
  for (let tries = 0; tries < 8; tries++) {
    const side = Math.floor(Math.random() * 4);
    let x;
    let y;
    if (side === 0) { x = a.x + Math.random() * a.w; y = a.y + 6; }
    else if (side === 1) { x = a.x + Math.random() * a.w; y = a.y + a.h - 6; }
    else if (side === 2) { x = a.x + 6; y = a.y + Math.random() * a.h; }
    else { x = a.x + a.w - 6; y = a.y + Math.random() * a.h; }
    const dx = x - player.x;
    const dy = y - player.y;
    if (dx * dx + dy * dy > 240 * 240 || tries === 7) return { x, y };
  }
  return { x: a.x + a.w / 2, y: a.y + 6 };
}

// The mix: moths always; the rest join at their unlock seconds and grow likelier over time.
function pickKind(elapsed) {
  const roll = Math.random();
  const darterW = elapsed >= ENEMIES.darter.unlock ? 0.24 : 0;
  const spitterW = elapsed >= ENEMIES.spitter.unlock ? 0.15 : 0;
  const bruteW = elapsed >= ENEMIES.brute.unlock ? 0.13 : 0;
  if (roll < bruteW) return 'brute';
  if (roll < bruteW + spitterW) return 'spitter';
  if (roll < bruteW + spitterW + darterW) return 'darter';
  return 'moth';
}

export function updateDirector(game, dt) {
  const director = game.director;
  const elapsed = game.elapsed;

  // The herald: a warning sting and banner just before the King arrives.
  if (!director.bossWarned && elapsed >= BOSS_WARN_TIME) {
    director.bossWarned = true;
    game.bossWarning = 3.2;
    sfxBossWarn();
  }
  if (!director.bossSpawned && elapsed >= BOSS_TIME) {
    director.bossSpawned = true;
    const a = game.arena;
    game.boss = spawnEnemy(game, 'boss', a.x + a.w / 2, a.y + 84);
    game.bossSpawned = true;
  }

  // Elites: bigger, tougher, and they burst into large shards when they fall.
  if (elapsed >= director.nextEliteAt) {
    director.nextEliteAt += ELITE_EVERY;
    if (game.enemies.length < aliveCap(elapsed)) {
      const point = edgeSpawnPoint(game);
      const kinds = ['moth', 'darter', 'spitter', 'brute'].filter((k) => elapsed >= ENEMIES[k].unlock);
      const kind = kinds[Math.floor(Math.random() * kinds.length)];
      spawnEnemy(game, kind, point.x, point.y, { elite: true });
    }
  }

  director.spawnT -= dt;
  if (director.spawnT <= 0) {
    director.spawnT = spawnInterval(elapsed) * (0.75 + Math.random() * 0.5);
    if (game.enemies.length < aliveCap(elapsed)) {
      const point = edgeSpawnPoint(game);
      spawnEnemy(game, pickKind(elapsed), point.x, point.y);
      // Late in the run, spawns sometimes arrive as a small knot.
      if (elapsed > 150 && Math.random() < 0.35) {
        const extra = edgeSpawnPoint(game);
        spawnEnemy(game, pickKind(elapsed), extra.x, extra.y);
      }
    }
  }
}
