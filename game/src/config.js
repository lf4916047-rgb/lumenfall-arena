// Lumenfall Arena — configuration: the neon palette and every balance constant in one place.
// The look is one coherent scheme: a dark indigo arena, a warm amber player, teal lumen shards,
// and rose/magenta enemies, so a screenshot reads at a glance.

export const COLORS = {
  bgDeep: '#070822',
  bgGlow: '#141a4d',
  arenaLine: '#39408f',
  arenaFill: '#0b0e2a',
  gridLine: 'rgba(88, 98, 214, 0.10)',
  player: '#ffb340',
  playerCore: '#ffe9b0',
  playerTrail: 'rgba(255, 179, 64, 0.35)',
  shard: '#2ee6c8',
  shardLarge: '#8ffbe9',
  bolt: '#ffd97a',
  spark: '#9be7ff',
  nova: '#ffb340',
  enemyMoth: '#ff4d7e',
  enemyDarter: '#ff7a4d',
  enemyBrute: '#c44dff',
  enemySpitter: '#ff4dd2',
  enemyBolt: '#ff5d8f',
  boss: '#e33d6e',
  bossCrown: '#ffd97a',
  hp: '#ff5d7a',
  hpBack: 'rgba(255, 93, 122, 0.22)',
  xp: '#2ee6c8',
  xpBack: 'rgba(46, 230, 200, 0.18)',
  text: '#e8eaff',
  textDim: '#9aa3e8',
  white: '#ffffff',
};

// The run: five minutes until dawn; the Hollow King arrives at four.
export const RUN_DURATION = 300;
export const BOSS_TIME = 240;
export const BOSS_WARN_TIME = 234;

export const PLAYER = {
  radius: 14,
  baseHp: 100,
  baseSpeed: 238,
  dashSpeed: 760,
  dashTime: 0.16,
  dashCooldown: 2.5,
  hurtIframes: 0.7,
  baseMagnet: 96,
  collectRadius: 26,
};

// XP needed to go from `level` to `level + 1`. Level 2 comes after a handful of shards so the
// first upgrade choice lands inside the opening minute; the curve steepens from there.
export function xpForLevel(level) {
  return 5 + (level - 1) * 4 + Math.floor(Math.pow(level - 1, 1.7));
}

// Enemy blueprints. `unlock` is the run second the director may start spawning the kind,
// `score` is flavour for the bestiary feel, contact damage is dealt at most twice a second.
export const ENEMIES = {
  moth:   { hp: 12,  speed: 74,  radius: 13, damage: 8,  xp: 1, unlock: 0,   color: 'enemyMoth' },
  darter: { hp: 8,   speed: 172, radius: 10, damage: 7,  xp: 1, unlock: 30,  color: 'enemyDarter' },
  spitter:{ hp: 20,  speed: 58,  radius: 14, damage: 8,  xp: 2, unlock: 75,  color: 'enemySpitter', range: 268, fireEvery: 2.3, boltSpeed: 196 },
  brute:  { hp: 84,  speed: 40,  radius: 26, damage: 16, xp: 3, unlock: 105, color: 'enemyBrute' },
  boss:   { hp: 1500, speed: 33, radius: 46, damage: 20, xp: 25, unlock: BOSS_TIME, color: 'boss' },
};

// Enemy health grows as the run deepens — but on a gentler curve than the warden's
// own growth, so a build that keeps pace starts clearing screens by the third
// minute and melts the King, while the opening minute stays honest.
export function enemyHpScale(elapsed) {
  const m = elapsed / 60;
  return 1 + m * 0.38 + m * m * 0.02;
}

// Director pacing: the spawn interval shrinks and the alive cap grows across the run.
export function spawnInterval(elapsed) {
  return Math.max(0.34, 1.5 - elapsed * 0.0042);
}
export function aliveCap(elapsed) {
  return Math.min(110, 26 + Math.floor(elapsed * 0.30));
}
export const ELITE_EVERY = 25;
export const ELITE_FIRST = 50;
export const ELITE_HP_MUL = 3.4;
export const ELITE_SIZE_MUL = 1.55;

// Weapon tuning per level (index 0 = level 1). Passives live in weapons.js beside their defs.
export const WEAPONS = {
  starbolts: {
    name: 'Star Bolts',
    desc: 'Seeking bolts of starlight that hunt the nearest foe.',
    interval: [0.40, 0.36, 0.32, 0.28, 0.24],
    count:    [1, 2, 2, 3, 4],
    damage:   [10, 15, 22, 32, 46],
    speed: 540,
    steer: 7.5,
  },
  orbitblades: {
    name: 'Orbit Blades',
    desc: 'Blades of hard light circle you, shredding what they touch.',
    count:    [2, 3, 4, 5, 6],
    damage:   [10, 15, 22, 32, 46],
    radius:   [66, 72, 78, 86, 96],
    spin: 2.6,
    hitEvery: 0.32,
  },
  novapulse: {
    name: 'Nova Pulse',
    desc: 'A periodic nova bursts outward, blasting everything close.',
    interval: [3.2, 2.9, 2.6, 2.3, 2.0],
    damage:   [22, 34, 50, 72, 105],
    radius:   [120, 136, 154, 172, 196],
  },
  chainspark: {
    name: 'Chain Spark',
    desc: 'Lightning leaps from foe to foe in a crackling chain.',
    interval: [1.4, 1.25, 1.1, 0.95, 0.8],
    damage:   [16, 24, 35, 50, 72],
    chains:   [3, 4, 5, 6, 7],
    range: 300,
    linkRange: 150,
  },
};
export const WEAPON_MAX_LEVEL = 5;
