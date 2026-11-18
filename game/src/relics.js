// Lumenfall Arena — relics: the Hollow King's court treasures, drafted whenever an
// elite falls. They come in three tiers, Hextech-style — Silver workhorses, Gold
// power pieces, and Prismatic game-changers that only enter the draft once the
// warden's account has earned them (level 5, or the Prism Key). The later the
// elite falls, the richer the draft rolls. Some relics bend a stat the moment they
// are taken; the rest are flags and timers the combat code reads every frame:
// burning brands, a frost aura, thorns, a dash that erupts, a ward that eats one
// blow, crits that call down meteors, a crown that storms the densest cluster.
// A relic is taken once; the draft pool only ever offers what the warden lacks.

import { COLORS } from './config.js';
import { spawnRing, spawnFlash, spawnBurst, spawnZap, addShake } from './particles.js';
import { sfxNova, sfxZap } from './audio.js';
import { damageEnemy } from './entities.js';

export const RELICS = [
  // --- Silver ---------------------------------------------------------------
  {
    key: 'emberbrand', tier: 'silver', icon: '☄️', name: 'Ember Brand',
    desc: 'Your hits brand foes, burning them hard for three seconds.',
    apply: () => {},
  },
  {
    key: 'lodestoneheart', tier: 'silver', icon: '💠', name: 'Lodestone Heart',
    desc: '+60% shard magnet radius, and shards grant +35% XP.',
    apply: (g) => { g.passives.magnetMul *= 1.6; g.relics.xpMul = 1.35; },
  },
  {
    key: 'frostaura', tier: 'silver', icon: '❄️', name: 'Frost Aura',
    desc: 'Foes near you are chilled deep, moving 45% slower.',
    apply: () => {},
  },
  {
    key: 'swiftwind', tier: 'silver', icon: '🌀', name: 'Swiftwind Charm',
    desc: 'Dash recharges 30% faster; you move 12% faster.',
    apply: (g) => { g.passives.dashCdMul *= 0.7; g.passives.speedMul *= 1.12; },
  },
  {
    key: 'thornmantle', tier: 'silver', icon: '🌵', name: 'Thorn Mantle',
    desc: 'Foes that touch you impale themselves for 25 damage.',
    apply: () => {},
  },
  // --- Gold -----------------------------------------------------------------
  {
    key: 'bloodchalice', tier: 'gold', icon: '🩸', name: 'Blood Chalice',
    desc: 'Every 8 kills, the chalice restores 4 health plus 2% of your max.',
    apply: () => {},
  },
  {
    key: 'stormconductor', tier: 'gold', icon: '🌩️', name: 'Storm Conductor',
    desc: 'Chain Spark leaps to two additional foes.',
    apply: () => {},
  },
  {
    key: 'aegisshard', tier: 'gold', icon: '🛡️', name: 'Aegis Shard',
    desc: 'A ward negates one hit against you every 9 seconds.',
    apply: () => {},
  },
  {
    key: 'dashnova', tier: 'gold', icon: '💫', name: 'Dash Nova',
    desc: 'Dashing erupts a wide nova that blasts nearby foes for heavy damage.',
    apply: () => {},
  },
  {
    key: 'executioner', tier: 'gold', icon: '🎯', name: "Executioner's Lens",
    desc: '+15% critical chance, and your crits strike for 2.5× damage.',
    apply: () => {},
  },
  // --- Prismatic --------------------------------------------------------------
  {
    key: 'skyfall', tier: 'prismatic', icon: '🌠', name: 'Skyfall Brand',
    desc: 'PRISMATIC — Every critical hit calls a meteor down on the foe: a burning blast of 90 damage.',
    apply: () => {},
  },
  {
    key: 'tempestcrown', tier: 'prismatic', icon: '⛈️', name: 'Tempest Crown',
    desc: 'PRISMATIC — Every 6 seconds a lightning storm tears into the densest cluster of foes.',
    apply: () => {},
  },
  {
    key: 'dawnnova', tier: 'prismatic', icon: '🌅', name: 'Dawn Nova',
    desc: 'PRISMATIC — Levelling up detonates a nova: 120 damage to everything near you.',
    apply: () => {},
  },
  {
    key: 'orbitcrown', tier: 'prismatic', icon: '👑', name: 'Crown of Blades',
    desc: 'PRISMATIC — Orbit Blades gains three more blades, and its blades crit far more often.',
    apply: () => {},
  },
];

export const RELIC_BY_KEY = Object.fromEntries(RELICS.map((r) => [r.key, r]));

export function makeRelicState() {
  return {
    owned: [],       // relic keys, in the order they were taken
    aegisCd: 0,      // seconds until the Aegis Shard's ward is ready again
    killTrack: 0,    // kills counted toward the Blood Chalice's next draught
    xpMul: 1,        // the Lodestone Heart raises this to 1.35
    stormT: 5,       // seconds until the Tempest Crown next calls the storm
    meteors: [],     // Skyfall strikes in flight: { x, y, t }
  };
}

export function hasRelic(game, key) {
  return !!game.relics && game.relics.owned.includes(key);
}

// The Skyfall Brand: a crit marks the ground, and a heartbeat later the sky
// answers. The telegraph is a lance of light and a ring on the target.
export function queueMeteor(game, x, y) {
  if (!game.relics || game.relics.meteors.length > 24) return;
  game.relics.meteors.push({ x, y, t: 0.38 });
  spawnZap(game, [
    { x: x - 150, y: y - 320 },
    { x: x - 70 + (Math.random() - 0.5) * 20, y: y - 160 },
    { x, y },
  ], '#ffb340');
  spawnFlash(game, x, y, '#ffb340', 26, 0.2);
}

function strikeMeteor(game, meteor) {
  const { x, y } = meteor;
  spawnRing(game, x, y, '#ff9a3d', 150, 6);
  spawnFlash(game, x, y, '#ffb340', 95, 0.3);
  spawnBurst(game, x, y, '#ff7a4d', 22, 300);
  spawnBurst(game, x, y, COLORS.bossCrown, 10, 200);
  addShake(game, 7);
  sfxNova();
  // Meteor fire does not call more meteors, however hot the crits land.
  game.meteorSuppressed = true;
  for (const enemy of [...game.enemies]) {
    if (enemy.dead) continue;
    const dx = enemy.x - x;
    const dy = enemy.y - y;
    const d = Math.hypot(dx, dy);
    if (d < 72 + enemy.radius) {
      damageEnemy(game, enemy, 90 * game.passives.damageMul, (dx / (d || 1)) * 220, (dy / (d || 1)) * 220);
    }
  }
  game.meteorSuppressed = false;
}

// The Tempest Crown finds the heart of the swarm — the foe with the most company
// — and unloads five bolts into the cluster around it.
function callStorm(game) {
  let heart = null;
  let heartCount = -1;
  for (const enemy of game.enemies) {
    if (enemy.dead) continue;
    let count = 0;
    for (const other of game.enemies) {
      if (other.dead || other === enemy) continue;
      const dx = other.x - enemy.x;
      const dy = other.y - enemy.y;
      if (dx * dx + dy * dy < 130 * 130) count++;
    }
    if (count > heartCount) { heartCount = count; heart = enemy; }
  }
  if (!heart) return;
  const targets = game.enemies
    .filter((e) => !e.dead)
    .map((e) => ({ e, d2: (e.x - heart.x) ** 2 + (e.y - heart.y) ** 2 }))
    .sort((a, b) => a.d2 - b.d2)
    .slice(0, 5)
    .map((t) => t.e);
  for (const target of targets) {
    spawnZap(game, [
      { x: target.x + (Math.random() - 0.5) * 60, y: target.y - 340 },
      { x: target.x + (Math.random() - 0.5) * 44, y: target.y - 170 },
      { x: target.x, y: target.y },
    ], '#cfe9ff');
    spawnFlash(game, target.x, target.y, '#cfe9ff', 34, 0.16);
    damageEnemy(game, target, 60 * game.passives.damageMul);
  }
  addShake(game, 5);
  sfxZap();
}

// Per-frame relic housekeeping: the Aegis ward re-forms, Skyfall meteors fall,
// and the Tempest Crown counts down to its next storm.
export function updateRelics(game, dt) {
  const relics = game.relics;
  if (relics.aegisCd > 0) relics.aegisCd = Math.max(0, relics.aegisCd - dt);

  if (relics.meteors.length > 0) {
    for (let i = relics.meteors.length - 1; i >= 0; i--) {
      const meteor = relics.meteors[i];
      meteor.t -= dt;
      if (meteor.t <= 0) {
        relics.meteors.splice(i, 1);
        strikeMeteor(game, meteor);
      }
    }
  }

  if (hasRelic(game, 'tempestcrown')) {
    relics.stormT -= dt;
    if (relics.stormT <= 0) {
      relics.stormT = 6;
      callStorm(game);
    }
  }
}

// Draft odds by the clock: the opening elites offer Silver and Gold; from 2:30
// the court's Prismatic vault cracks open (for wardens who have unlocked it),
// and by the King's hour nearly one slot in four rolls Prismatic.
function tierWeights(elapsed, prismUnlocked) {
  if (!prismUnlocked || elapsed < 150) return { silver: 0.62, gold: 0.38, prismatic: 0 };
  if (elapsed < 240) return { silver: 0.40, gold: 0.48, prismatic: 0.12 };
  return { silver: 0.30, gold: 0.48, prismatic: 0.22 };
}

// The draft: `count` relics the warden does not yet own (three, or four with the
// Court Favour), each slot rolling its tier by the run clock. An empty result
// means the court's whole hoard is already carried — the draft does not open.
export function buildRelicChoices(game) {
  const count = 3 + (game.extraRelicChoice ? 1 : 0);
  const weights = tierWeights(game.elapsed, !!game.prismUnlocked);
  const pool = RELICS.filter((r) => !game.relics.owned.includes(r.key));
  const picks = [];
  while (picks.length < count && pool.length > 0) {
    const roll = Math.random();
    let tier = 'silver';
    if (roll < weights.prismatic) tier = 'prismatic';
    else if (roll < weights.prismatic + weights.gold) tier = 'gold';
    let tierPool = pool.filter((r) => r.tier === tier);
    if (tierPool.length === 0) tierPool = pool;
    const relic = tierPool[Math.floor(Math.random() * tierPool.length)];
    pool.splice(pool.indexOf(relic), 1);
    picks.push(relic);
  }
  return picks.map((relic) => ({
    kind: 'relic',
    key: relic.key,
    icon: relic.icon,
    tier: relic.tier,
    title: relic.name,
    tag: relic.tier === 'prismatic' ? 'PRISMATIC RELIC' : relic.tier === 'gold' ? 'GOLD RELIC' : 'RELIC',
    desc: relic.desc,
    apply: (g) => {
      g.relics.owned.push(relic.key);
      relic.apply(g);
    },
  }));
}
