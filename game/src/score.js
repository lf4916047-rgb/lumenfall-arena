// Lumenfall Arena — score and combo: every kill pays out by kind, and kills chained
// inside a three-second window climb a multiplier (×2 at 8 chained, ×3 at 16, ×4 at
// 24, ×5 from 32, capped there) that lapses when the chain does. The end screen
// grades the run S/A/B/C and remembers the best score in localStorage where the
// browser allows it, falling back to memory where it does not.

import { COLORS } from './config.js';
import { spawnFloatText } from './particles.js';
import { hasRelic } from './relics.js';

export const SCORE_VALUES = {
  moth: 10,
  darter: 15,
  spitter: 25,
  brute: 40,
  elite: 250,
  midboss: 1500,
  boss: 5000,
};

const BEST_KEY = 'lumenfall-arena-best';

// Rank thresholds, tuned against a winning run: ~300 kills averaging ×2.5 plus the
// King's 5,000 lands near 20,000, so S asks for a near-flawless dawn and A for a
// strong one; a death at three minutes still earns its B.
export const RANKS = [
  { rank: 'S', min: 15000 },
  { rank: 'A', min: 10000 },
  { rank: 'B', min: 5500 },
  { rank: 'C', min: 0 },
];

export function rankForScore(score) {
  for (const entry of RANKS) {
    if (score >= entry.min) return entry.rank;
  }
  return 'C';
}

export function loadBest() {
  try {
    const value = Number(window.localStorage.getItem(BEST_KEY));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  } catch {
    return 0;
  }
}

export function saveBest(score) {
  try {
    window.localStorage.setItem(BEST_KEY, String(Math.floor(score)));
  } catch {
    // Storage denied (private mode, sandboxed frame): the in-memory best stands.
  }
}

export function makeScore() {
  return {
    score: 0,
    chain: 0,
    chainT: 0,
    mult: 1,
    maxMult: 1,
    maxChain: 0,
    best: loadBest(),
    isBest: false,
  };
}

function multForChain(chain) {
  return Math.min(5, 1 + Math.floor(chain / 8));
}

// A kill lands: pay its value at the current multiplier, feed the chain, and —
// if the warden carries the Blood Chalice — count toward its next draught.
export function registerKill(game, enemy) {
  const s = game.score;
  const value = enemy.kind === 'boss' ? SCORE_VALUES.boss
    : enemy.kind === 'midboss' ? SCORE_VALUES.midboss
    : enemy.elite ? SCORE_VALUES.elite
    : SCORE_VALUES[enemy.kind] ?? 10;
  s.chain++;
  s.chainT = 3;
  s.mult = multForChain(s.chain);
  if (s.mult > s.maxMult) s.maxMult = s.mult;
  if (s.chain > s.maxChain) s.maxChain = s.chain;
  const gained = value * s.mult;
  s.score += gained;
  // Every kill shows its price in amber — small for the swarm, grand for the
  // court's champions — the way the tally should read at a glance.
  const grand = enemy.kind === 'boss' || enemy.kind === 'midboss';
  spawnFloatText(
    game, enemy.x, enemy.y + enemy.radius * 0.4, `+${gained}`,
    COLORS.bossCrown, grand ? 22 : enemy.elite ? 16 : 11,
  );
  if (hasRelic(game, 'bloodchalice')) {
    const relics = game.relics;
    relics.killTrack++;
    if (relics.killTrack >= 8) {
      relics.killTrack -= 8;
      const player = game.player;
      if (player.alive && player.hp < player.maxHp) {
        const heal = 4 + Math.floor(player.maxHp * 0.02);
        player.hp = Math.min(player.maxHp, player.hp + heal);
        spawnFloatText(game, player.x, player.y - player.radius - 10, `+${heal} HP`, COLORS.shard, 13);
      }
    }
  }
}

// The chain is a fire that must be fed: three quiet seconds and it is out.
export function updateScore(game, dt) {
  const s = game.score;
  if (s.chainT > 0) {
    s.chainT -= dt;
    if (s.chainT <= 0) {
      s.chain = 0;
      s.mult = 1;
    }
  }
}

// Settle the run: fold the score into the best and persist it.
export function settleScore(game) {
  const s = game.score;
  if (s.score > s.best) {
    s.best = s.score;
    s.isBest = true;
    saveBest(s.score);
  }
  return rankForScore(s.score);
}
