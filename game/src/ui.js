// Lumenfall Arena — UI: the DOM layer over the canvas. HUD bars (health, experience,
// the Dawn Timer, kills, dash readiness), the boss health bar, the boss warning banner,
// and the overlay screens (title, level-up choices, pause, victory / game over). Canvas
// draws the world; this module draws everything a player reads.

import { RUN_DURATION, PLAYER, WEAPONS } from './config.js';
import { isTouchDevice } from './input.js';
import { PASSIVE_DEFS } from './weapons.js';
import { RELIC_BY_KEY } from './relics.js';
import { rankForScore } from './score.js';

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
    comboText: el('combo-text'),
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
    },
    levelupCards: el('levelup-cards'),
    endTitle: el('end-title'),
    endStats: el('end-stats'),
    endSub: el('end-sub'),
    currentChoices: [],
    onPickLevelUp: null,
  };

  el('start-btn').addEventListener('click', () => handlers.onStart());
  el('restart-btn').addEventListener('click', () => handlers.onRestart());
  el('resume-btn').addEventListener('click', () => handlers.onResume());
  ui.muteBtn.addEventListener('click', () => handlers.onMuteToggle());
  if (ui.pauseBtn) ui.pauseBtn.addEventListener('click', () => handlers.onPause());

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
}

export function setMutedIcon(ui, muted) {
  ui.muteBtn.textContent = muted ? '🔇' : '🔊';
  ui.muteBtn.title = muted ? 'Unmute (M)' : 'Mute (M)';
}

function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
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
    const s = game.score;
    if (s.chain >= 2) {
      ui.comboText.textContent = `COMBO ×${s.mult} · ${s.chain}`;
      ui.comboText.classList.toggle('hot', s.mult >= 3);
      ui.comboText.style.opacity = '1';
    } else {
      ui.comboText.style.opacity = '0';
    }
  }
  updateLoadout(ui, game);

  const dashK = 1 - Math.max(0, player.dashCd) / (PLAYER.dashCooldown * game.passives.dashCdMul);
  ui.dashFill.style.width = `${dashK * 100}%`;
  ui.dashText.textContent = dashK >= 1 ? 'DASH READY' : 'DASH';
  ui.dashText.classList.toggle('ready', dashK >= 1);

  const boss = game.boss;
  const bossVisible = boss && !boss.dead && game.bossSpawned && !game.bossDefeated;
  ui.bossbar.classList.toggle('visible', !!bossVisible);
  if (bossVisible) {
    ui.bossFill.style.width = `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%`;
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

  let html = '<div class="loadout-head">⚔ LOADOUT</div>';
  html += '<div class="loadout-section">WEAPONS</div>';
  for (const [key, cfg] of Object.entries(WEAPONS)) {
    const level = loadout.weapons[key].level;
    if (level <= 0) continue;
    const pips = '●'.repeat(level) + '○'.repeat(5 - level);
    html += `<div class="loadout-row"><span class="loadout-icon">${CHOICE_ICONS[key] ?? '✦'}</span><span class="loadout-name">${cfg.name}</span><span class="loadout-pips">${pips}</span></div>`;
  }
  const passiveRows = PASSIVE_DEFS.filter((p) => (loadout.passiveCounts[p.key] ?? 0) > 0);
  if (passiveRows.length > 0) {
    html += '<div class="loadout-section">BLESSINGS</div>';
    for (const p of passiveRows) {
      html += `<div class="loadout-row"><span class="loadout-icon">${CHOICE_ICONS[p.key] ?? '✦'}</span><span class="loadout-name">${p.name}</span><span class="loadout-count">×${loadout.passiveCounts[p.key]}</span></div>`;
    }
  }
  if (game.relics && game.relics.owned.length > 0) {
    html += '<div class="loadout-section relic-head">RELICS</div>';
    for (const key of game.relics.owned) {
      const relic = RELIC_BY_KEY[key];
      if (!relic) continue;
      html += `<div class="loadout-row relic-row"><span class="loadout-icon">${relic.icon}</span><span class="loadout-name">${relic.name}</span></div>`;
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
    card.className = `card ${choice.kind}`;
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
  ui.endStats.innerHTML = `
    <div class="stat-score"><span>Final score</span><strong>${score.toLocaleString('en-US')}</strong></div>
    <div class="stat-rank"><span>Rank</span><strong class="rank rank-${rank}">${rank}</strong></div>
    <div><span>Time survived</span><strong>${mins}:${secs}</strong></div>
    <div><span>Foes unmade</span><strong>${game.kills}</strong></div>
    <div><span>Level reached</span><strong>${game.level}</strong></div>
    <div><span>Hollow King</span><strong>${game.bossDefeated ? 'Defeated' : 'Unbowed'}</strong></div>
    <div><span>Best score</span><strong class="best-line">${bestLine}</strong></div>`;
}
