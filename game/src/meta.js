// Lumenfall Arena — meta progression: the warden grows between runs, not just inside
// them. A localStorage save (key below, separate from the best-score key) banks
// Stardust earned in every run, tracks the account level, and holds the workshop
// nodes bought with that Stardust. Bonuses are computed from the save in one place
// (computeMetaBonuses) and folded into the run at reset time in main.js, so the
// combat code never reads the save directly. Storage can be denied (private mode,
// sandboxed frame): the save then lives in memory for the session.

const SAVE_KEY = 'lumenfall-arena-save-v1';

// Account gates: Chain Spark joins the level-up pool at account level 3, and
// Prismatic relics enter the elite draft at account level 5 (or earlier for the
// warden who buys the Prism Key in the workshop).
export const CHAINSPARK_ACCOUNT_LEVEL = 3;
export const PRISMATIC_ACCOUNT_LEVEL = 5;

// Account XP needed to go from `level` to `level + 1`.
export function accountXpForLevel(level) {
  return 100 + (level - 1) * 75;
}

// The workshop: fourteen permanent upgrades. `costs[i]` is the price of rank i+1;
// most nodes stack a plain per-rank effect that computeMetaBonuses reads by key.
export const NODES = [
  { key: 'might', icon: '🔥', name: 'Ember Might', desc: '+10% damage on every weapon, per rank.', costs: [60, 100, 160, 240, 360] },
  { key: 'vitality', icon: '❤️', name: 'Dawn Vitality', desc: '+20 max health, per rank.', costs: [50, 90, 150, 230, 340] },
  { key: 'swiftness', icon: '💨', name: 'Swift Boots', desc: '+4% movement speed, per rank.', costs: [50, 100, 180, 300] },
  { key: 'magnet', icon: '🧲', name: 'Lodestone Field', desc: '+20% shard magnet radius, per rank.', costs: [40, 80, 140, 240] },
  { key: 'wisdom', icon: '📚', name: 'Star Wisdom', desc: '+12% XP gained in runs, per rank.', costs: [60, 110, 190, 320] },
  { key: 'deadeye', icon: '🎯', name: 'Deadeye', desc: '+3% critical chance, per rank. Crits strike for double.', costs: [70, 120, 200, 300, 450] },
  { key: 'aegisplate', icon: '🛡️', name: 'Aegis Plate', desc: 'Armour: every hit you take is reduced by 1, per rank.', costs: [80, 150, 250, 400] },
  { key: 'phaseweave', icon: '🌪️', name: 'Phase Weave', desc: 'Dash recharges 7% faster, per rank.', costs: [60, 130, 260] },
  { key: 'stardust', icon: '🌟', name: 'Stardust Bloom', desc: '+15% Stardust earned from every run, per rank.', costs: [50, 100, 180, 300] },
  { key: 'arsenal', icon: '🌠', name: 'Arsenal', desc: 'Star Bolts begins each run one level higher, per rank.', costs: [150, 400] },
  { key: 'greed', icon: '👑', name: 'Court Favour', desc: 'Relic drafts offer four choices instead of three.', costs: [300] },
  { key: 'heirloom', icon: '💠', name: 'Heirloom Relic', desc: 'Begin every run carrying a random silver or gold relic.', costs: [500] },
  { key: 'secondawn', icon: '🌅', name: 'Second Dawn', desc: 'Once per run, a killing blow instead revives you at half health.', costs: [600] },
  { key: 'prismkey', icon: '🔮', name: 'Prism Key', desc: 'Prismatic relics may appear in drafts at any account level.', costs: [800] },
];

export const NODE_BY_KEY = Object.fromEntries(NODES.map((n) => [n.key, n]));

export function defaultSave() {
  return {
    version: 1,
    stardust: 0,
    totalStardust: 0,
    accountLevel: 1,
    accountXp: 0,
    nodes: {},
    runs: 0,
    totalKills: 0,
    victories: 0,
  };
}

let cachedSave = null;

export function loadSave() {
  if (cachedSave) return cachedSave;
  let save = defaultSave();
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        save = { ...defaultSave(), ...parsed, nodes: { ...(parsed.nodes ?? {}) } };
      }
    }
  } catch {
    // Storage denied or corrupt: the in-memory default stands.
  }
  cachedSave = save;
  return save;
}

export function persistSave(save) {
  cachedSave = save;
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Storage denied: the in-memory save carries the session.
  }
}

export function resetSave() {
  const save = defaultSave();
  persistSave(save);
  return save;
}

export function nodeRank(save, key) {
  return save.nodes[key] ?? 0;
}

// Every permanent bonus the save confers, in the shapes the run pipeline consumes.
// Account levels themselves grant a whisper of growth: +2% damage and +4 max
// health per level above the first, so simply playing makes the warden stronger.
export function computeMetaBonuses(save) {
  const r = (key) => nodeRank(save, key);
  const level = save.accountLevel;
  return {
    damageMul: (1 + 0.10 * r('might')) * (1 + 0.02 * (level - 1)),
    maxHpBonus: 20 * r('vitality') + 4 * (level - 1),
    speedMul: 1 + 0.04 * r('swiftness'),
    magnetMul: 1 + 0.20 * r('magnet'),
    xpGainMul: 1 + 0.12 * r('wisdom'),
    critChance: 0.03 * r('deadeye'),
    armor: r('aegisplate'),
    dashCdMul: Math.pow(0.93, r('phaseweave')),
    stardustMul: 1 + 0.15 * r('stardust'),
    startWeaponBonus: r('arsenal'),
    extraChoice: r('greed') > 0,
    startRelic: r('heirloom') > 0,
    revive: r('secondawn') > 0,
    prismUnlocked: level >= PRISMATIC_ACCOUNT_LEVEL || r('prismkey') > 0,
    chainsparkUnlocked: level >= CHAINSPARK_ACCOUNT_LEVEL,
  };
}

// Buy the next rank of a node. Returns 'ok', 'maxed' or 'poor'; on 'ok' the price
// is deducted and the save persisted.
export function buyNode(save, key) {
  const node = NODE_BY_KEY[key];
  if (!node) return 'maxed';
  const rank = nodeRank(save, key);
  if (rank >= node.costs.length) return 'maxed';
  const cost = node.costs[rank];
  if (save.stardust < cost) return 'poor';
  save.stardust -= cost;
  save.nodes[key] = rank + 1;
  persistSave(save);
  return 'ok';
}

// What a finished run pays. Kills are the wage, elites and score the bonus, the
// King a royal bounty; survival time trickles in so even a short vigil pays.
export function computeRunRewards(game, bonuses) {
  const elites = game.elitesKilled ?? 0;
  const rawStardust = game.kills
    + elites * 8
    + Math.floor((game.score ? game.score.score : 0) / 150)
    + Math.floor(game.elapsed / 6)
    + (game.bossDefeated ? 150 : 0);
  const accountXp = Math.floor(game.kills * 0.6)
    + Math.floor(game.elapsed / 2)
    + elites * 6
    + (game.bossDefeated ? 120 : 0);
  return {
    stardust: Math.floor(rawStardust * (bonuses ? bonuses.stardustMul : 1)),
    accountXp,
  };
}

// Bank a run's rewards: Stardust in, account XP in, level-ups out (each one
// permanent). Lifetime tallies ride along. Persists and reports the level-ups.
export function applyRunRewards(save, rewards, { kills = 0, victory = false } = {}) {
  save.stardust += rewards.stardust;
  save.totalStardust += rewards.stardust;
  save.runs += 1;
  save.totalKills += kills;
  if (victory) save.victories += 1;
  save.accountXp += rewards.accountXp;
  let levelsGained = 0;
  while (save.accountXp >= accountXpForLevel(save.accountLevel)) {
    save.accountXp -= accountXpForLevel(save.accountLevel);
    save.accountLevel += 1;
    levelsGained += 1;
  }
  persistSave(save);
  return { levelsGained, accountLevel: save.accountLevel };
}
