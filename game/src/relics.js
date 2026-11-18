// Lumenfall Arena — relics: the Hollow King's court treasures, drafted one of three
// whenever an elite falls. Ten of them, each a real mechanic — some apply their
// effect the moment they are taken (passives they bend stay bent), the rest are
// flags the combat code reads every frame: burning brands, a frost aura, thorns,
// a dash that erupts, a shield that eats one blow, a lens that finds the crit.
// A relic is taken once; the draft pool only ever offers what the warden lacks.

export const RELICS = [
  {
    key: 'emberbrand', icon: '☄️', name: 'Ember Brand',
    desc: 'Your hits brand foes, burning them for damage over time.',
    apply: () => {},
  },
  {
    key: 'lodestoneheart', icon: '💠', name: 'Lodestone Heart',
    desc: '+50% shard magnet radius, and shards grant +25% XP.',
    apply: (g) => { g.passives.magnetMul *= 1.5; g.relics.xpMul = 1.25; },
  },
  {
    key: 'frostaura', icon: '❄️', name: 'Frost Aura',
    desc: 'Foes close to you are chilled, moving 38% slower.',
    apply: () => {},
  },
  {
    key: 'bloodchalice', icon: '🩸', name: 'Blood Chalice',
    desc: 'Every 10 kills, the chalice restores 2 health.',
    apply: () => {},
  },
  {
    key: 'stormconductor', icon: '🌩️', name: 'Storm Conductor',
    desc: 'Chain Spark leaps to one additional foe.',
    apply: () => {},
  },
  {
    key: 'aegisshard', icon: '🛡️', name: 'Aegis Shard',
    desc: 'A ward negates one hit against you every 12 seconds.',
    apply: () => {},
  },
  {
    key: 'dashnova', icon: '💫', name: 'Dash Nova',
    desc: 'Dashing erupts a nova that blasts nearby foes.',
    apply: () => {},
  },
  {
    key: 'thornmantle', icon: '🌵', name: 'Thorn Mantle',
    desc: 'Foes that touch you impale themselves for 10 damage.',
    apply: () => {},
  },
  {
    key: 'swiftwind', icon: '🌀', name: 'Swiftwind Charm',
    desc: 'Dash recharges 25% faster; you move 8% faster.',
    apply: (g) => { g.passives.dashCdMul *= 0.75; g.passives.speedMul *= 1.08; },
  },
  {
    key: 'executioner', icon: '🎯', name: "Executioner's Lens",
    desc: 'Your hits have a 15% chance to crit for double damage.',
    apply: () => {},
  },
];

export const RELIC_BY_KEY = Object.fromEntries(RELICS.map((r) => [r.key, r]));

export function makeRelicState() {
  return {
    owned: [],       // relic keys, in the order they were taken
    aegisCd: 0,      // seconds until the Aegis Shard's ward is ready again
    killTrack: 0,    // kills counted toward the Blood Chalice's next draught
    xpMul: 1,        // the Lodestone Heart raises this to 1.25
  };
}

export function hasRelic(game, key) {
  return !!game.relics && game.relics.owned.includes(key);
}

// Per-frame relic housekeeping: the Aegis ward re-forms over time.
export function updateRelics(game, dt) {
  if (game.relics.aegisCd > 0) game.relics.aegisCd = Math.max(0, game.relics.aegisCd - dt);
}

// Up to three relics the warden does not yet own, shuffled. An empty result means
// the court's whole hoard is already carried — the draft simply does not open.
export function buildRelicChoices(game) {
  const pool = RELICS.filter((r) => !game.relics.owned.includes(r.key));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3).map((relic) => ({
    kind: 'relic',
    key: relic.key,
    icon: relic.icon,
    title: relic.name,
    tag: 'RELIC',
    desc: relic.desc,
    apply: (g) => {
      g.relics.owned.push(relic.key);
      relic.apply(g);
    },
  }));
}
