// Lumenfall Arena — UI: the DOM layer over the canvas. HUD bars (health, experience,
// the Dawn Timer, kills, dash readiness), the boss health bar, the boss warning banner,
// and the overlay screens (title, level-up choices, pause, victory / game over). Canvas
// draws the world; this module draws everything a player reads.

import { RUN_DURATION, PLAYER, WEAPONS, CHAPTERS, chapterAt } from './config.js';
import { isTouchDevice } from './input.js';
import { PASSIVE_DEFS } from './weapons.js';
import { RELIC_BY_KEY } from './relics.js';
import { rankForScore } from './score.js';
import { NODES, nodeRank, accountXpForLevel, liveStardust } from './meta.js';

function el(id) {
  return document.getElementById(id);
}

export function buildUI(handlers) {
  const ui = {
    hud: el('hud'),
    hpFill: el('hp-fill'),
    hpText: el('hp-text'),
    xpFill: el('xp-fill'),
    levelText: el('level-text'),
    timerText: el('timer-text'),
    killsText: el('kills-text'),
    scoreText: el('score-text'),
    bestText: el('best-text'),
    dustText: el('dust-text'),
    comboText: el('combo-text'),
    chapterText: el('chapter-text'),
    incomingText: el('incoming-text'),
    roadmap: el('roadmap'),
    roadmapSig: '',
    bossNameText: el('boss-name-text'),
    bossPct: el('boss-pct'),
    endMedallion: el('end-medallion'),
    endMedallionRank: el('end-medallion-rank'),
    endRewards: el('end-rewards'),
    loadout: el('loadout'),
    loadoutBody: el('loadout-body'),
    loadoutSig: '',
    dashFill: el('dash-fill'),
    dashText: el('dash-text'),
    bossbar: el('bossbar'),
    bossFill: el('boss-fill'),
    banner: el('banner'),
    muteBtn: el('mute-btn'),
    pauseBtn: el('pause-btn'),
    screens: {
      title: el('screen-title'),
      levelup: el('screen-levelup'),
      pause: el('screen-pause'),
      end: el('screen-end'),
      workshop: el('screen-workshop'),
    },
    levelupCards: el('levelup-cards'),
    endTitle: el('end-title'),
    endStats: el('end-stats'),
    endSub: el('end-sub'),
    titleMeta: el('title-meta'),
    workshopMeta: el('workshop-meta'),
    workshopGrid: el('workshop-grid'),
    loadoutBtn: el('loadout-btn'),
    currentChoices: [],
    onPickLevelUp: null,
  };

  // The road map: six nodes across the top of the HUD — the journey written
  // small. Built once; updateHUD only flips classes as nodes fall.
  if (ui.roadmap) {
    ui.roadmap.innerHTML = ROAD_NODES.map((node, i) => `
      ${i > 0 ? '<span class="road-link"></span>' : ''}
      <span class="road-node" data-node="${i}"><span class="road-dot">${node.icon}</span><span class="road-label">${node.label}</span></span>`).join('');
    ui.roadNodes = [...ui.roadmap.querySelectorAll('.road-node')];
  }

  el('start-btn').addEventListener('click', () => handlers.onStart());
  el('restart-btn').addEventListener('click', () => handlers.onRestart());
  el('resume-btn').addEventListener('click', () => handlers.onResume());
  ui.muteBtn.addEventListener('click', () => handlers.onMuteToggle());
  if (ui.pauseBtn) ui.pauseBtn.addEventListener('click', () => handlers.onPause());
  el('workshop-btn').addEventListener('click', () => handlers.onWorkshop());
  el('workshop-back-btn').addEventListener('click', () => handlers.onWorkshopBack());
  el('save-reset-btn').addEventListener('click', (event) => handlers.onResetSave(event.currentTarget));
  if (ui.loadoutBtn) {
    ui.loadoutBtn.addEventListener('click', () => ui.loadout.classList.toggle('open'));
  }

  // On touch devices the prompts speak of taps, not keys, and the pause button
  // (touch-only in the stylesheet) joins the page. Desktop text is untouched.
  if (isTouchDevice()) {
    document.body.classList.add('touch');
    ui.screens.title.querySelector('.howto').innerHTML =
      '<strong>Left thumb</strong> — drag anywhere for the stick &nbsp;·&nbsp; <strong>DASH</strong> button to dash &nbsp;·&nbsp; <strong>II</strong> pauses<br>'
      + 'Your weapons fire on their own. Gather the teal lumen shards, level up, and build your arsenal.';
    ui.screens.title.querySelector('.hint').textContent = 'Tap START THE VIGIL to play';
    ui.screens.pause.querySelector('.hint').textContent = 'Tap RESUME to continue';
    ui.screens.end.querySelector('.hint').textContent = 'Tap PLAY AGAIN to restart';
  }
  return ui;
}

export function showScreen(ui, name) {
  for (const [key, node] of Object.entries(ui.screens)) {
    node.classList.toggle('visible', key === name);
  }
  const inRun = name === 'none' || name === 'levelup' || name === 'pause';
  ui.hud.classList.toggle('visible', inRun);
  if (ui.loadout) ui.loadout.classList.toggle('visible', inRun);
  if (ui.loadoutBtn) ui.loadoutBtn.classList.toggle('visible', inRun);
  if (!inRun && ui.loadout) ui.loadout.classList.remove('open');
}

export function setMutedIcon(ui, muted) {
  ui.muteBtn.textContent = muted ? '🔇' : '🔊';
  ui.muteBtn.title = muted ? 'Unmute (M)' : 'Mute (M)';
}

function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// The road, node by node: the court's journey from the Twilight Court to the
// Hollow King. A node is done when the run has passed its trial; the first
// undone node is where the warden stands.
const ROAD_NODES = [
  { icon: '🏯', label: '庭院' },
  { icon: '⚔', label: '精英' },
  { icon: '🔥', label: '地穴' },
  { icon: '🔥', label: '使者' },
  { icon: '❄', label: '王座' },
  { icon: '👑', label: '空心王' },
];

function roadNodeDone(game, i) {
  const ch = chapterAt(game.elapsed);
  switch (i) {
    case 0: return ch >= 1;
    case 1: return (game.elitesKilled ?? 0) >= 1 || ch >= 1;
    case 2: return ch >= 2;
    case 3: return !!game.midbossDefeated;
    case 4: return !!game.bossSpawned;
    case 5: return !!game.bossDefeated;
    default: return false;
  }
}

const KNOT_ICONS = { moth: '🦋', darter: '💨', spitter: '🔮', brute: '👹' };

function updateRoadmap(ui, game) {
  if (!ui.roadNodes) return;
  let sig = '';
  let current = -1;
  const states = ROAD_NODES.map((_, i) => {
    const done = roadNodeDone(game, i);
    if (!done && current < 0) current = i;
    return done;
  });
  sig = states.map((d, i) => (d ? '✓' : i === current ? '●' : '○')).join('');
  if (sig === ui.roadmapSig) return;
  ui.roadmapSig = sig;
  ui.roadNodes.forEach((node, i) => {
    node.classList.toggle('done', states[i]);
    node.classList.toggle('current', i === current);
    node.querySelector('.road-dot').textContent = states[i] ? '✓' : ROAD_NODES[i].icon;
  });
}

export function updateHUD(ui, game) {
  const player = game.player;
  const hpK = Math.max(0, player.hp / player.maxHp);
  ui.hpFill.style.width = `${hpK * 100}%`;
  ui.hpText.textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
  ui.xpFill.style.width = `${Math.min(100, (game.xp / game.xpNext) * 100)}%`;
  ui.levelText.textContent = `LV ${game.level}`;

  if (game.bossSpawned && !game.bossDefeated) {
    ui.timerText.textContent = game.elapsed >= RUN_DURATION ? 'SLAY THE KING' : formatTime(RUN_DURATION - game.elapsed);
  } else {
    ui.timerText.textContent = formatTime(RUN_DURATION - game.elapsed);
  }
  ui.killsText.textContent = `☠ ${game.kills}`;
  if (ui.scoreText && game.score) {
    ui.scoreText.textContent = `SCORE ${game.score.score.toLocaleString('en-US')}`;
    if (ui.bestText) ui.bestText.textContent = `BEST ${Math.max(game.score.best, game.score.score).toLocaleString('en-US')}`;
    if (ui.dustText) ui.dustText.textContent = `★ ${liveStardust(game, game.metaBonuses).toLocaleString('en-US')}`;
    const s = game.score;
    if (s.chain >= 2) {
      ui.comboText.textContent = `COMBO ×${s.mult} · ${s.chain}`;
      ui.comboText.classList.toggle('hot', s.mult >= 3);
      ui.comboText.style.opacity = '1';
    } else {
      ui.comboText.style.opacity = '0';
    }
  }
  // The journey's letterhead: which chapter the run stands in, and what the
  // next knot brings — kind, headcount and the seconds until it lands.
  const chapter = chapterAt(game.elapsed);
  if (ui.chapterText) {
    const line = `CH.${chapter + 1} · ${CHAPTERS[chapter].name} ${CHAPTERS[chapter].sub}`;
    if (ui.chapterText.textContent !== line) ui.chapterText.textContent = line;
  }
  if (ui.incomingText && game.director && game.director.nextKnot) {
    const knot = game.director.nextKnot;
    const line = `INCOMING ${KNOT_ICONS[knot.kind] ?? '✦'}×${knot.count} · ${formatTime(knot.at - game.elapsed)}`;
    if (ui.incomingText.textContent !== line) ui.incomingText.textContent = line;
  }
  updateRoadmap(ui, game);
  updateLoadout(ui, game);

  const dashK = 1 - Math.max(0, player.dashCd) / (PLAYER.dashCooldown * game.passives.dashCdMul);
  ui.dashFill.style.width = `${dashK * 100}%`;
  ui.dashText.textContent = dashK >= 1 ? 'DASH READY' : 'DASH';
  ui.dashText.classList.toggle('ready', dashK >= 1);

  // One boss bar, two champions: the King outranks his Herald while both stand.
  const king = game.boss && !game.boss.dead && game.bossSpawned && !game.bossDefeated ? game.boss : null;
  const herald = !king && game.midboss && !game.midboss.dead && game.midbossSpawned && !game.midbossDefeated ? game.midboss : null;
  const shown = king ?? herald;
  ui.bossbar.classList.toggle('visible', !!shown);
  ui.bossbar.classList.toggle('herald', !!herald);
  if (shown) {
    const pct = Math.max(0, Math.ceil((shown.hp / shown.maxHp) * 100));
    ui.bossFill.style.width = `${Math.max(0, (shown.hp / shown.maxHp) * 100)}%`;
    if (ui.bossNameText) ui.bossNameText.textContent = king ? '👑 THE HOLLOW KING' : '🔥 THE ASHEN HERALD';
    if (ui.bossPct) ui.bossPct.textContent = `${pct}%`;
  }
}

// The loadout panel: the build, written out — weapons with their levels, the
// blessings taken, the relics carried. It rebuilds only when the build actually
// changes (a signature of levels, counts and relic keys), so calling it every
// frame costs a string compare. The stylesheet hides it on narrow screens.
export function updateLoadout(ui, game) {
  if (!ui.loadoutBody || !game.weapons) return;
  const loadout = game.weapons;
  const sig = Object.entries(loadout.weapons).map(([k, w]) => `${k}${w.level}`).join(',')
    + '|' + Object.entries(loadout.passiveCounts).map(([k, n]) => `${k}${n}`).join(',')
    + '|' + (game.relics ? game.relics.owned.join(',') : '');
  if (sig === ui.loadoutSig) return;
  ui.loadoutSig = sig;

  // Two labelled lists, the way a court's ledger reads: everything the run
  // itself has gathered (weapons with their pips, blessings with their
  // stacks) under RUN UPGRADES, and the court's treasures under RELICS.
  let html = '<div class="loadout-head">⚔ LOADOUT</div>';
  let upgradeRows = '';
  let upgradeCount = 0;
  for (const [key, cfg] of Object.entries(WEAPONS)) {
    const level = loadout.weapons[key].level;
    if (level <= 0) continue;
    upgradeCount++;
    const pips = '●'.repeat(level) + '○'.repeat(5 - level);
    upgradeRows += `<div class="loadout-row"><span class="loadout-icon">${CHOICE_ICONS[key] ?? '✦'}</span><span class="loadout-name">${cfg.name}</span><span class="loadout-pips">${pips}</span></div>`;
  }
  for (const p of PASSIVE_DEFS) {
    const n = loadout.passiveCounts[p.key] ?? 0;
    if (n <= 0) continue;
    upgradeCount++;
    upgradeRows += `<div class="loadout-row"><span class="loadout-icon">${CHOICE_ICONS[p.key] ?? '✦'}</span><span class="loadout-name">${p.name}</span><span class="loadout-count">×${n}</span></div>`;
  }
  const upgradeTotal = Object.keys(WEAPONS).length + PASSIVE_DEFS.length;
  html += `<div class="loadout-section">RUN UPGRADES ${upgradeCount}/${upgradeTotal}</div>` + upgradeRows;
  if (game.relics && game.relics.owned.length > 0) {
    html += `<div class="loadout-section relic-head">RELICS ${game.relics.owned.length}/${Object.keys(RELIC_BY_KEY).length}</div>`;
    for (const key of game.relics.owned) {
      const relic = RELIC_BY_KEY[key];
      if (!relic) continue;
      html += `<div class="loadout-row relic-row"><span class="loadout-icon">${relic.icon}</span><span class="loadout-name">${relic.name}</span><span class="tier-dot tier-${relic.tier}"></span></div>`;
    }
  }
  ui.loadoutBody.innerHTML = html;
}

export function showBanner(ui, title, sub) {
  ui.banner.querySelector('.banner-title').textContent = title;
  ui.banner.querySelector('.banner-sub').textContent = sub;
  ui.banner.classList.add('visible');
}

export function hideBanner(ui) {
  ui.banner.classList.remove('visible');
}

// One emblem per blessing, so a choice reads before its words do.
const CHOICE_ICONS = {
  starbolts: '🌠',
  orbitblades: '🗡️',
  novapulse: '💥',
  chainspark: '⚡',
  swift: '💨',
  vitality: '❤️',
  lodestone: '🧲',
  power: '🔥',
  dashflow: '🌪️',
  crit: '🎯',
  scholar: '📚',
};

// Build the three choice cards — level-up blessings by default, the relic draft
// when main.js passes its heading. Picking is by click here, or by the 1/2/3 keys
// through pickLevelUpChoice, which main.js calls; both paths run the same callback.
const DEFAULT_DRAFT_HEADING = '✦ THE LIGHT GROWS ✦';
const DEFAULT_DRAFT_SUB = 'Choose one blessing';

export function showLevelUp(ui, choices, onPick, opts = {}) {
  ui.currentChoices = choices;
  ui.onPickLevelUp = onPick;
  const screen = ui.screens.levelup;
  screen.querySelector('.screen-heading').textContent = opts.heading ?? DEFAULT_DRAFT_HEADING;
  screen.querySelector('.screen-sub').textContent = opts.sub ?? DEFAULT_DRAFT_SUB;
  ui.levelupCards.innerHTML = '';
  choices.forEach((choice, i) => {
    const card = document.createElement('button');
    card.className = `card ${choice.kind}${choice.tier ? ` tier-${choice.tier}` : ''}`;
    card.innerHTML = `
      <span class="card-icon">${choice.icon ?? CHOICE_ICONS[choice.key] ?? '✦'}</span>
      <span class="card-tag">${choice.tag}</span>
      <span class="card-title">${choice.title}</span>
      <span class="card-desc">${choice.desc}</span>
      <span class="card-key">${isTouchDevice() ? 'Tap to choose' : `Press ${i + 1}`}</span>`;
    card.addEventListener('click', () => pickLevelUpChoice(ui, i));
    ui.levelupCards.appendChild(card);
  });
}

export function pickLevelUpChoice(ui, index) {
  const choice = ui.currentChoices[index];
  if (!choice || !ui.onPickLevelUp) return;
  const cb = ui.onPickLevelUp;
  ui.onPickLevelUp = null;
  ui.currentChoices = [];
  cb(choice);
}

export function showEnd(ui, victory, game) {
  ui.endTitle.textContent = victory ? '☀ DAWN BREAKS' : '☠ THE LIGHT FALLS';
  ui.endTitle.className = victory ? 'victory' : 'defeat';
  ui.endSub.textContent = victory
    ? 'The Hollow King is unmade and the arena greets the dawn. The wardens sing your name.'
    : 'The swarm closes over the last light — but every dawn is another chance.';
  const mins = Math.floor(game.elapsed / 60);
  const secs = Math.floor(game.elapsed % 60).toString().padStart(2, '0');
  const score = game.score ? game.score.score : 0;
  const rank = rankForScore(score);
  const bestLine = game.score && game.score.isBest ? '★ New best!' : `Best ${game.score ? game.score.best.toLocaleString('en-US') : 0}`;
  const bossesDown = (game.midbossDefeated ? 1 : 0) + (game.bossDefeated ? 1 : 0);

  // The rank, struck as a medallion — the ceremony the run is graded with.
  if (ui.endMedallion) {
    ui.endMedallionRank.textContent = rank;
    ui.endMedallion.className = `rank-${rank}${victory ? '' : ' fallen'}`;
    ui.endMedallion.id = 'end-medallion';
  }
  ui.endStats.innerHTML = `
    <div class="stat-score"><span>Final score</span><strong>${score.toLocaleString('en-US')}</strong></div>
    <div><span>Time survived</span><strong>${mins}:${secs}</strong></div>
    <div><span>Foes unmade</span><strong>${game.kills}</strong></div>
    <div><span>Elites felled</span><strong>${game.elitesKilled ?? 0}</strong></div>
    <div><span>Bosses</span><strong>${bossesDown} / 2</strong></div>
    <div><span>Max combo</span><strong>×${game.score ? game.score.maxMult : 1} · ${game.score ? game.score.maxChain : 0} chain</strong></div>
    <div><span>Damage dealt</span><strong>${Math.floor(game.damageDealt ?? 0).toLocaleString('en-US')}</strong></div>
    <div><span>Level reached</span><strong>${game.level}</strong></div>
    <div><span>Best score</span><strong class="best-line">${bestLine}</strong></div>`;

  // The wages, itemised: every line that paid, the Bloom if it fattened them,
  // the totals, and the warden's standing after the bank took them in. A
  // defeat keeps its earnings — the lines show on both end screens.
  const rewards = game.lastRewards;
  const save = game.save;
  if (ui.endRewards) {
    if (rewards && save && rewards.breakdown) {
      const b = rewards.breakdown;
      const line = (label, value) => value > 0
        ? `<div class="reward-line"><span>${label}</span><strong>+${value.toLocaleString('en-US')} ★</strong></div>` : '';
      const xpNeed = accountXpForLevel(save.accountLevel);
      const xpPct = Math.min(100, Math.round((save.accountXp / xpNeed) * 100));
      ui.endRewards.innerHTML = `
        <div class="rewards-head">✦ THE RUN'S WAGES ✦</div>
        ${line('Kills', b.kills)}
        ${line('Elites', b.elites)}
        ${line('The Ashen Herald', b.herald)}
        ${line('The Hollow King', b.king)}
        ${line('Score bonus', b.score)}
        ${line('Time kept', b.time)}
        ${rewards.stardustMul > 1 ? `<div class="reward-line bloom"><span>Stardust Bloom</span><strong>×${rewards.stardustMul.toFixed(2)}</strong></div>` : ''}
        <div class="reward-line total"><span>Stardust earned</span><strong>+${rewards.stardust.toLocaleString('en-US')} ★</strong></div>
        <div class="reward-line"><span>Account XP</span><strong>+${rewards.accountXp}</strong></div>
        <div class="reward-line"><span>Warden level</span><strong>LV ${save.accountLevel}${rewards.levelsGained > 0 ? ' ★ LEVEL UP!' : ''}</strong></div>
        <div class="xp-progress"><div class="xp-progress-fill" style="width: ${xpPct}%"></div><span>${save.accountXp} / ${xpNeed} XP to LV ${save.accountLevel + 1}</span></div>
        <div class="reward-line total"><span>Stardust bank</span><strong>${save.stardust.toLocaleString('en-US')} ★</strong></div>`;
    } else {
      ui.endRewards.innerHTML = '';
    }
  }
}

// --- Meta progression: the title banner line and the workshop -----------------

// The title screen carries the warden's standing: account level and the bank.
export function updateTitleMeta(ui, save) {
  if (!ui.titleMeta || !save) return;
  ui.titleMeta.textContent = `WARDEN LV ${save.accountLevel} · ★ ${save.stardust.toLocaleString('en-US')} STARDUST · ${save.runs} VIGILS KEPT`;
}

// The workshop grid: one tappable card per node — icon, name, rank pips, the
// effect in plain words, and a price that greys out when the bank cannot pay
// (or reads MAXED when the node is fully grown). Buying re-renders the grid.
export function renderWorkshop(ui, save, onBuy) {
  if (!ui.workshopGrid || !save) return;
  const xpNeed = accountXpForLevel(save.accountLevel);
  ui.workshopMeta.textContent =
    `WARDEN LV ${save.accountLevel} — ${save.accountXp} / ${xpNeed} XP to next · ★ ${save.stardust.toLocaleString('en-US')} STARDUST banked`;
  ui.workshopGrid.innerHTML = '';
  for (const node of NODES) {
    const rank = nodeRank(save, node.key);
    const maxed = rank >= node.costs.length;
    const cost = maxed ? null : node.costs[rank];
    const afford = !maxed && save.stardust >= cost;
    const card = document.createElement('button');
    card.className = `node${maxed ? ' maxed' : ''}${!maxed && !afford ? ' poor' : ''}`;
    card.dataset.node = node.key;
    const pips = '●'.repeat(rank) + '○'.repeat(node.costs.length - rank);
    card.innerHTML = `
      <span class="node-icon">${node.icon}</span>
      <span class="node-main">
        <span class="node-name">${node.name} <span class="node-pips">${pips}</span></span>
        <span class="node-desc">${node.desc}</span>
      </span>
      <span class="node-cost">${maxed ? 'MAXED' : `${cost} ★`}</span>`;
    card.disabled = maxed || !afford;
    if (!card.disabled) card.addEventListener('click', () => onBuy(node.key));
    ui.workshopGrid.appendChild(card);
  }
}
