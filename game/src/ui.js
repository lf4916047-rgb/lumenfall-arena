// Lumenfall Arena — UI: the DOM layer over the canvas. HUD bars (health, experience,
// the Dawn Timer, kills, dash readiness), the boss health bar, the boss warning banner,
// and the overlay screens (title, level-up choices, pause, victory / game over). Canvas
// draws the world; this module draws everything a player reads.

import { RUN_DURATION, PLAYER } from './config.js';

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
    dashFill: el('dash-fill'),
    dashText: el('dash-text'),
    bossbar: el('bossbar'),
    bossFill: el('boss-fill'),
    banner: el('banner'),
    muteBtn: el('mute-btn'),
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
  return ui;
}

export function showScreen(ui, name) {
  for (const [key, node] of Object.entries(ui.screens)) {
    node.classList.toggle('visible', key === name);
  }
  ui.hud.classList.toggle('visible', name === 'none' || name === 'levelup' || name === 'pause');
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

export function showBanner(ui, title, sub) {
  ui.banner.querySelector('.banner-title').textContent = title;
  ui.banner.querySelector('.banner-sub').textContent = sub;
  ui.banner.classList.add('visible');
}

export function hideBanner(ui) {
  ui.banner.classList.remove('visible');
}

// Build the three upgrade cards. Picking is by click here, or by the 1/2/3 keys through
// pickLevelUpChoice, which main.js calls; both paths run the same callback.
export function showLevelUp(ui, choices, onPick) {
  ui.currentChoices = choices;
  ui.onPickLevelUp = onPick;
  ui.levelupCards.innerHTML = '';
  choices.forEach((choice, i) => {
    const card = document.createElement('button');
    card.className = 'card';
    card.innerHTML = `
      <span class="card-tag">${choice.tag}</span>
      <span class="card-title">${choice.title}</span>
      <span class="card-desc">${choice.desc}</span>
      <span class="card-key">Press ${i + 1}</span>`;
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
  ui.endTitle.textContent = victory ? '🌅 DAWN BREAKS' : '💀 THE LIGHT FALLS';
  ui.endTitle.className = victory ? 'victory' : 'defeat';
  ui.endSub.textContent = victory
    ? 'The Hollow King is unmade and the arena greets the dawn. The wardens sing your name.'
    : 'The swarm closes over the last light — but every dawn is another chance.';
  const mins = Math.floor(game.elapsed / 60);
  const secs = Math.floor(game.elapsed % 60).toString().padStart(2, '0');
  ui.endStats.innerHTML = `
    <div><span>Time survived</span><strong>${mins}:${secs}</strong></div>
    <div><span>Foes unmade</span><strong>${game.kills}</strong></div>
    <div><span>Level reached</span><strong>${game.level}</strong></div>
    <div><span>Hollow King</span><strong>${game.bossDefeated ? 'Defeated' : 'Unbowed'}</strong></div>`;
}
