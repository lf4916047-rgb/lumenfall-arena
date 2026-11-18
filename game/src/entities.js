// Lumenfall Arena — entities: factories and per-frame updates for the player, the enemy
// kinds, projectiles and lumen shards. Objects are pooled where they churn (bolts), and
// everything moves in plain game coordinates (CSS pixels inside the arena rectangle).

import { COLORS, ENEMIES, PLAYER, enemyHpScale } from './config.js';
import { moveVector, isDown } from './input.js';
import { spawnBurst, spawnTrailPuff, spawnFloatText, spawnFlash, spawnRing, addShake } from './particles.js';
import { sfxDash, sfxHurt, sfxPickup } from './audio.js';
import { hasRelic, queueMeteor } from './relics.js';
import { registerKill } from './score.js';

const TAU = Math.PI * 2;

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function dist2(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

// --- Factories ---------------------------------------------------------------

export function makePlayer(x, y) {
  return {
    x, y, vx: 0, vy: 0,
    radius: PLAYER.radius,
    hp: PLAYER.baseHp, maxHp: PLAYER.baseHp,
    faceX: 1, faceY: 0, faceAngle: 0,
    dashT: 0, dashCd: 0, dashDirX: 1, dashDirY: 0,
    iframes: 0,
    alive: true,
    trail: [],
  };
}

export function spawnEnemy(game, kind, x, y, { elite = false } = {}) {
  const base = ENEMIES[kind];
  const hpMul = enemyHpScale(game.elapsed) * (elite ? 3.4 : 1);
  const sizeMul = elite ? 1.55 : 1;
  const enemy = {
    kind, x, y, vx: 0, vy: 0, kx: 0, ky: 0,
    radius: base.radius * sizeMul,
    hp: base.hp * hpMul, maxHp: base.hp * hpMul,
    speed: base.speed * rand(0.9, 1.1),
    damage: base.damage,
    xpValue: base.xp,
    elite,
    flash: 0, touchCd: 0, orbitHitAt: -9,
    fireCd: rand(0.6, base.fireEvery ?? 2),
    burstT: 2.2, summonT: 5,
    wobble: Math.random() * TAU,
    burnT: 0, burnAcc: 0, burnTick: 0,
    framePhase: Math.random() * 10,
    dead: false,
  };
  game.enemies.push(enemy);
  return enemy;
}

export function spawnShard(game, x, y, value) {
  const angle = Math.random() * TAU;
  const speed = rand(30, 130);
  game.shards.push({
    x, y,
    vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    value, large: value >= 5,
    t: Math.random() * TAU,
    magnetized: false,
  });
}

// Player and enemy bolts share one pooled shape; `friendly` picks the target side.
const boltPool = [];
export function fireBolt(game, { x, y, vx, vy, damage, friendly, target = null, radius = 5, life = 1.6, color = null }) {
  const bolt = boltPool.pop() ?? {};
  bolt.x = x; bolt.y = y; bolt.vx = vx; bolt.vy = vy;
  bolt.damage = damage; bolt.friendly = friendly; bolt.target = target;
  bolt.radius = radius; bolt.life = life; bolt.color = color;
  bolt.dead = false;
  game.bolts.push(bolt);
  return bolt;
}

function releaseBolt(bolt) {
  bolt.dead = true;
  boltPool.push(bolt);
}

// --- Damage ------------------------------------------------------------------

export function damageEnemy(game, enemy, amount, knockX = 0, knockY = 0, critBonus = 0) {
  if (enemy.dead) return false;
  // Critical hits are a run-wide system now: the warden's base chance (workshop
  // Deadeye, the Killer Instinct blessing) plus any bonus the striking weapon
  // carries — and the Executioner's Lens stacks its own chance on top and
  // deepens every crit to 2.5×. A crit under the Skyfall Brand calls a meteor.
  let crit = false;
  const lens = hasRelic(game, 'executioner');
  const critChance = (game.crit ? game.crit.chance : 0) + critBonus + (lens ? 0.15 : 0);
  if (Math.random() < critChance) {
    amount *= lens ? 2.5 : (game.crit ? game.crit.mul : 2);
    crit = true;
  }
  enemy.hp -= amount;
  enemy.flash = 0.09;
  enemy.kx += knockX;
  enemy.ky += knockY;
  if (crit && hasRelic(game, 'skyfall') && !game.meteorSuppressed) {
    queueMeteor(game, enemy.x, enemy.y);
  }
  // The Ember Brand sets what it touches alight: three seconds of burning, fed by
  // the strength of the hit that lit it.
  if (hasRelic(game, 'emberbrand')) {
    enemy.burnT = 3;
    enemy.burnAcc = Math.min(30, 9 + amount * 0.5);
  }
  // Heavy hits shout: bigger, gilded numbers for the blows that matter — and a
  // crit shouts loudest of all, in gold a full size above a merely heavy blow.
  const big = crit || amount >= 40;
  const mid = amount >= 22;
  spawnFloatText(
    game, enemy.x + rand(-6, 6), enemy.y - enemy.radius - 4,
    crit ? `${Math.round(amount)}!` : String(Math.round(amount)),
    big ? COLORS.bossCrown : COLORS.text,
    crit ? 24 : big ? 18 : mid ? 15 : 13,
  );
  if (enemy.hp > 0) return false;
  return killEnemy(game, enemy);
}

// Death itself, split from the blow that caused it so the Ember Brand's burn can
// finish a foe without pretending a weapon struck it.
export function killEnemy(game, enemy) {
  if (enemy.dead) return false;
  enemy.dead = true;
  game.kills++;
  registerKill(game, enemy);
  // An elite's death opens the court's hoard: main.js drafts a relic from it.
  // Elites are also tallied for the run's Stardust wages in meta.js.
  if (enemy.elite) {
    game.pendingRelicDrafts = (game.pendingRelicDrafts ?? 0) + 1;
    game.elitesKilled = (game.elitesKilled ?? 0) + 1;
  }
  const burstColor = enemy.elite ? COLORS.shardLarge : COLORS[ENEMIES[enemy.kind].color];
  spawnBurst(game, enemy.x, enemy.y, burstColor, enemy.elite ? 26 : 12, enemy.elite ? 260 : 180);
  // Shards: the enemy's XP value, split so big kills scatter a satisfying little pile.
  let remaining = enemy.xpValue * (enemy.elite ? 3 : 1);
  while (remaining >= 5) { spawnShard(game, enemy.x, enemy.y, 5); remaining -= 5; }
  while (remaining > 0) { spawnShard(game, enemy.x, enemy.y, 1); remaining -= 1; }
  if (enemy.kind === 'boss') {
    game.bossDefeated = true;
    addShake(game, 14);
    spawnBurst(game, enemy.x, enemy.y, COLORS.bossCrown, 60, 340);
    spawnBurst(game, enemy.x, enemy.y, COLORS.boss, 40, 260);
    spawnFlash(game, enemy.x, enemy.y, COLORS.bossCrown, 120, 0.4);
    spawnRing(game, enemy.x, enemy.y, COLORS.bossCrown, 260, 6);
  }
  return true;
}

export function hurtPlayer(game, amount) {
  const player = game.player;
  if (!player.alive || player.iframes > 0 || player.dashT > 0) return false;
  // The Aegis Shard eats one blow whole, then needs nine seconds to re-form.
  // It only spends itself on a hit that would truly have landed.
  if (hasRelic(game, 'aegisshard') && game.relics.aegisCd <= 0) {
    game.relics.aegisCd = 9;
    player.iframes = 0.35;
    spawnRing(game, player.x, player.y, COLORS.spark, 54, 3);
    spawnFlash(game, player.x, player.y, COLORS.spark, 40, 0.18);
    spawnFloatText(game, player.x, player.y - player.radius - 12, 'Warded!', COLORS.spark, 14);
    return false;
  }
  // Workshop armour shaves every blow that lands, though never below a scratch.
  amount = Math.max(1, amount - (game.passives ? game.passives.armor ?? 0 : 0));
  player.hp -= amount;
  player.iframes = PLAYER.hurtIframes;
  addShake(game, 7);
  sfxHurt();
  spawnBurst(game, player.x, player.y, COLORS.hp, 10, 200);
  spawnFlash(game, player.x, player.y, COLORS.hp, 34, 0.16);
  if (player.hp <= 0) {
    // The Second Dawn (a workshop promise): once per run, death itself is refused.
    if (game.reviveAvailable && !game.reviveUsed) {
      game.reviveUsed = true;
      player.hp = Math.ceil(player.maxHp * 0.5);
      player.iframes = 2;
      addShake(game, 10);
      spawnRing(game, player.x, player.y, COLORS.bossCrown, 190, 6);
      spawnFlash(game, player.x, player.y, COLORS.bossCrown, 110, 0.4);
      spawnBurst(game, player.x, player.y, COLORS.bossCrown, 30, 280);
      spawnFloatText(game, player.x, player.y - player.radius - 16, '✦ SECOND DAWN ✦', COLORS.bossCrown, 19);
      return true;
    }
    player.hp = 0;
    player.alive = false;
  }
  return true;
}

// --- Player update -----------------------------------------------------------

export function updatePlayer(game, dt) {
  const player = game.player;
  const move = moveVector();
  if (move.x !== 0 || move.y !== 0) {
    player.faceX = move.x;
    player.faceY = move.y;
    // The warden turns toward his stride, easing around rather than snapping.
    const want = Math.atan2(move.y, move.x);
    let diff = want - player.faceAngle;
    while (diff > Math.PI) diff -= TAU;
    while (diff < -Math.PI) diff += TAU;
    player.faceAngle += diff * Math.min(1, dt * 14);
  }

  player.dashCd = Math.max(0, player.dashCd - dt);
  player.iframes = Math.max(0, player.iframes - dt);

  const dashReady = player.dashCd <= 0;
  if (dashReady && (isDown('Space') || isDown('ShiftLeft') || isDown('ShiftRight')) && player.dashT <= 0) {
    const dirX = move.x !== 0 || move.y !== 0 ? move.x : player.faceX;
    const dirY = move.x !== 0 || move.y !== 0 ? move.y : player.faceY;
    const len = Math.hypot(dirX, dirY) || 1;
    player.dashDirX = dirX / len;
    player.dashDirY = dirY / len;
    player.dashT = PLAYER.dashTime;
    player.dashCd = PLAYER.dashCooldown * game.passives.dashCdMul;
    sfxDash();
    spawnBurst(game, player.x, player.y, COLORS.player, 8, 120);
    // The Dash Nova turns the escape into a weapon: a ring of light at the
    // dash's origin that throws back everything standing in it.
    if (hasRelic(game, 'dashnova')) {
      spawnRing(game, player.x, player.y, COLORS.nova, 110, 4);
      spawnFlash(game, player.x, player.y, COLORS.nova, 60, 0.2);
      for (const enemy of [...game.enemies]) {
        if (enemy.dead) continue;
        const dx = enemy.x - player.x;
        const dy = enemy.y - player.y;
        const d = Math.hypot(dx, dy);
        if (d < 110 + enemy.radius) {
          damageEnemy(game, enemy, 45 * game.passives.damageMul, (dx / (d || 1)) * 240, (dy / (d || 1)) * 240);
        }
      }
    }
  }

  const speed = PLAYER.baseSpeed * game.passives.speedMul;
  if (player.dashT > 0) {
    player.dashT -= dt;
    player.vx = player.dashDirX * PLAYER.dashSpeed;
    player.vy = player.dashDirY * PLAYER.dashSpeed;
  } else {
    player.vx = move.x * speed;
    player.vy = move.y * speed;
  }
  player.x += player.vx * dt;
  player.y += player.vy * dt;
  clampToArena(game, player);

  // Afterimages: render.js fades these ghosts by age, hottest while dashing.
  if (move.x !== 0 || move.y !== 0 || player.dashT > 0) {
    player.trail.unshift({ x: player.x, y: player.y, t: game.time, dash: player.dashT > 0 });
    if (player.trail.length > 18) player.trail.length = 18;
  } else if (player.trail.length > 0) {
    player.trail = player.trail.filter((ghost) => game.time - ghost.t < 0.3);
  }

  // The warden leaves a soft trail of light while moving.
  if ((move.x !== 0 || move.y !== 0 || player.dashT > 0) && Math.random() < 0.6) {
    spawnTrailPuff(game, player.x, player.y, player.dashT > 0 ? COLORS.player : COLORS.playerTrail);
  }
}

function clampToArena(game, entity) {
  const a = game.arena;
  entity.x = Math.min(a.x + a.w - entity.radius, Math.max(a.x + entity.radius, entity.x));
  entity.y = Math.min(a.y + a.h - entity.radius, Math.max(a.y + entity.radius, entity.y));
}

// --- Shards ------------------------------------------------------------------

export function updateShards(game, dt) {
  const player = game.player;
  const magnetR = PLAYER.baseMagnet * game.passives.magnetMul;
  let gained = 0;
  game.pickupComboT = Math.max(0, game.pickupComboT - dt);
  if (game.pickupComboT <= 0) game.pickupCombo = 0;

  for (let i = game.shards.length - 1; i >= 0; i--) {
    const shard = game.shards[i];
    shard.t += dt * 3;
    const d2 = dist2(shard.x, shard.y, player.x, player.y);
    if (d2 < magnetR * magnetR) shard.magnetized = true;
    if (shard.magnetized && player.alive) {
      const d = Math.sqrt(d2) || 1;
      const pull = 620;
      shard.vx += ((player.x - shard.x) / d) * pull * dt * 4;
      shard.vy += ((player.y - shard.y) / d) * pull * dt * 4;
    } else {
      shard.vx *= 0.88;
      shard.vy *= 0.88;
    }
    shard.x += shard.vx * dt;
    shard.y += shard.vy * dt;
    if (player.alive && d2 < PLAYER.collectRadius * PLAYER.collectRadius) {
      gained += shard.value;
      game.pickupCombo++;
      game.pickupComboT = 0.9;
      sfxPickup(game.pickupCombo);
      spawnBurst(game, shard.x, shard.y, COLORS.shard, 3, 90);
      game.shards.splice(i, 1);
    }
  }
  return gained;
}

// --- Enemies -----------------------------------------------------------------

export function updateEnemies(game, dt) {
  const player = game.player;
  const enemies = game.enemies;

  const frostAura = hasRelic(game, 'frostaura');
  const thornMantle = hasRelic(game, 'thornmantle');

  for (const enemy of enemies) {
    if (enemy.dead) continue;
    enemy.flash = Math.max(0, enemy.flash - dt);
    enemy.touchCd = Math.max(0, enemy.touchCd - dt);
    enemy.wobble += dt * 3;

    // The Ember Brand's burn ticks quietly — no float text, just embers and a
    // shrinking foe. It can finish a kill, and the kill counts like any other.
    if (enemy.burnT > 0) {
      enemy.burnT -= dt;
      enemy.burnTick += enemy.burnAcc * dt;
      if (Math.random() < dt * 7) {
        spawnBurst(game, enemy.x + rand(-6, 6), enemy.y + rand(-6, 6), '#ff7a4d', 1, 40);
      }
      const whole = Math.floor(enemy.burnTick);
      if (whole >= 1) {
        enemy.burnTick -= whole;
        enemy.hp -= whole;
        enemy.flash = Math.max(enemy.flash, 0.05);
        if (enemy.hp <= 0) {
          killEnemy(game, enemy);
          continue;
        }
      }
    }

    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d;
    const uy = dy / d;

    switch (enemy.kind) {
      case 'moth':
      case 'darter': {
        // Darters lunge in pulses; moths drift straight at the warden with a wobble.
        const pulse = enemy.kind === 'darter' ? (Math.sin(enemy.wobble * 1.7) > 0.2 ? 1.5 : 0.55) : 1;
        enemy.vx = ux * enemy.speed * pulse + Math.cos(enemy.wobble) * 12;
        enemy.vy = uy * enemy.speed * pulse + Math.sin(enemy.wobble) * 12;
        break;
      }
      case 'brute': {
        enemy.vx = ux * enemy.speed;
        enemy.vy = uy * enemy.speed;
        break;
      }
      case 'spitter': {
        const range = ENEMIES.spitter.range;
        const drift = d > range + 24 ? 1 : d < range - 60 ? -0.7 : 0;
        enemy.vx = ux * enemy.speed * drift + -uy * 22;
        enemy.vy = uy * enemy.speed * drift + ux * 22;
        enemy.fireCd -= dt;
        if (enemy.fireCd <= 0 && d < range + 130 && player.alive) {
          enemy.fireCd = ENEMIES.spitter.fireEvery;
          fireBolt(game, {
            x: enemy.x, y: enemy.y,
            vx: ux * ENEMIES.spitter.boltSpeed, vy: uy * ENEMIES.spitter.boltSpeed,
            damage: 10, friendly: false, radius: 6, life: 3.2, color: COLORS.enemyBolt,
          });
        }
        break;
      }
      case 'boss': {
        updateBoss(game, enemy, dt, ux, uy, d);
        break;
      }
    }

    // The Frost Aura drags hard at anything that closes on the warden.
    const slowMul = frostAura && d < 170 ? 0.55 : 1;
    enemy.x += (enemy.vx * slowMul + enemy.kx) * dt;
    enemy.y += (enemy.vy * slowMul + enemy.ky) * dt;
    enemy.kx *= Math.pow(0.0015, dt);
    enemy.ky *= Math.pow(0.0015, dt);
    clampToArena(game, enemy);

    // Contact damage, rate-limited per enemy so standing in a swarm hurts steadily,
    // not all at once. The Thorn Mantle answers every touch, warded or not — a foe
    // that lays a claw on the warden bleeds for it on the same drumbeat.
    if (player.alive && enemy.touchCd <= 0 && d < enemy.radius + player.radius + 2) {
      hurtPlayer(game, enemy.damage);
      enemy.touchCd = 0.55;
      if (thornMantle && !enemy.dead) damageEnemy(game, enemy, 25);
    }
  }

  separateEnemies(enemies);
  game.enemies = enemies.filter((enemy) => !enemy.dead);
}

function updateBoss(game, enemy, dt, ux, uy, d) {
  const player = game.player;
  enemy.vx = ux * enemy.speed;
  enemy.vy = uy * enemy.speed;
  const enraged = enemy.hp < enemy.maxHp * 0.3;

  enemy.burstT -= dt;
  if (enemy.burstT <= 0 && player.alive) {
    enemy.burstT = enraged ? 2.0 : 3.1;
    const count = enraged ? 18 : 14;
    const offset = Math.random() * TAU;
    for (let i = 0; i < count; i++) {
      const angle = offset + (i / count) * TAU;
      fireBolt(game, {
        x: enemy.x, y: enemy.y,
        vx: Math.cos(angle) * 168, vy: Math.sin(angle) * 168,
        damage: 12, friendly: false, radius: 6, life: 4.2, color: COLORS.enemyBolt,
      });
    }
    spawnBurst(game, enemy.x, enemy.y, COLORS.boss, 14, 200);
  }

  enemy.summonT -= dt;
  if (enemy.summonT <= 0) {
    enemy.summonT = 6.5;
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * TAU + Math.random();
      spawnEnemy(game, 'moth', enemy.x + Math.cos(angle) * 60, enemy.y + Math.sin(angle) * 60);
    }
  }
}

// Cheap pairwise separation so swarms read as bodies, not one stacked blob.
function separateEnemies(enemies) {
  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i];
    if (a.dead) continue;
    for (let j = i + 1; j < enemies.length; j++) {
      const b = enemies[j];
      if (b.dead) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const min = (a.radius + b.radius) * 0.82;
      const d2 = dx * dx + dy * dy;
      if (d2 > 0.01 && d2 < min * min) {
        const d = Math.sqrt(d2);
        const push = ((min - d) / d) * 0.5;
        a.x -= dx * push * 0.5;
        a.y -= dy * push * 0.5;
        b.x += dx * push * 0.5;
        b.y += dy * push * 0.5;
      }
    }
  }
}

// --- Projectiles ---------------------------------------------------------------

export function updateProjectiles(game, dt) {
  const player = game.player;

  for (let i = game.bolts.length - 1; i >= 0; i--) {
    const bolt = game.bolts[i];
    bolt.life -= dt;
    if (bolt.life <= 0) {
      game.bolts.splice(i, 1);
      releaseBolt(bolt);
      continue;
    }

    if (bolt.friendly) {
      // Star bolts steer gently toward their target while it lives.
      if (bolt.target && !bolt.target.dead) {
        const want = Math.atan2(bolt.target.y - bolt.y, bolt.target.x - bolt.x);
        const cur = Math.atan2(bolt.vy, bolt.vx);
        let diff = want - cur;
        while (diff > Math.PI) diff -= TAU;
        while (diff < -Math.PI) diff += TAU;
        const turn = Math.max(-bolt.steer * dt, Math.min(bolt.steer * dt, diff));
        const speed = Math.hypot(bolt.vx, bolt.vy);
        const angle = cur + turn;
        bolt.vx = Math.cos(angle) * speed;
        bolt.vy = Math.sin(angle) * speed;
      }
      bolt.x += bolt.vx * dt;
      bolt.y += bolt.vy * dt;
      let consumed = false;
      for (const enemy of game.enemies) {
        if (enemy.dead) continue;
        if (dist2(bolt.x, bolt.y, enemy.x, enemy.y) < (enemy.radius + bolt.radius) ** 2) {
          const kb = 130;
          const d = Math.hypot(enemy.x - bolt.x, enemy.y - bolt.y) || 1;
          damageEnemy(game, enemy, bolt.damage, ((enemy.x - bolt.x) / d) * kb, ((enemy.y - bolt.y) / d) * kb);
          consumed = true;
          break;
        }
      }
      if (consumed || !insideArena(game, bolt)) {
        game.bolts.splice(i, 1);
        releaseBolt(bolt);
      }
    } else {
      bolt.x += bolt.vx * dt;
      bolt.y += bolt.vy * dt;
      let consumed = false;
      if (player.alive && dist2(bolt.x, bolt.y, player.x, player.y) < (player.radius + bolt.radius) ** 2) {
        hurtPlayer(game, bolt.damage);
        consumed = true;
      }
      if (consumed || !insideArena(game, bolt)) {
        game.bolts.splice(i, 1);
        releaseBolt(bolt);
      }
    }
  }
}

function insideArena(game, point) {
  const a = game.arena;
  return point.x >= a.x - 30 && point.x <= a.x + a.w + 30 && point.y >= a.y - 30 && point.y <= a.y + a.h + 30;
}

export function nearestEnemy(game, x, y, maxDist = Infinity) {
  let best = null;
  let bestD2 = maxDist * maxDist;
  for (const enemy of game.enemies) {
    if (enemy.dead) continue;
    const d2 = dist2(x, y, enemy.x, enemy.y);
    if (d2 < bestD2) {
      bestD2 = d2;
      best = enemy;
    }
  }
  return best;
}
