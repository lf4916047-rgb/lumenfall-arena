// Lumenfall Arena — main: boot, the run state machine and the game loop.
//
// States: title → playing ⇄ levelup, playing ⇄ paused, playing → victory | gameover.
// The loop always renders the world (so menus sit over a living arena); only the playing
// state advances the simulation. `window.__lumenfall` exposes the game object, which the
// maker's own playtest script drives to verify a run end to end.

import { RUN_DURATION, xpForLevel } from './config.js';
import * as audio from './audio.js';
import { initInput, wasPressed, anyPressed, endFrame, onFirstGesture } from './input.js';
import { makePlayer, updatePlayer, updateEnemies, updateProjectiles, updateShards, spawnEnemy, damageEnemy } from './entities.js';
import { makeLoadout, updateWeapons, buildChoices } from './weapons.js';
import { makeDirector, updateDirector } from './director.js';
import { initEffects, updateEffects, spawnTrailPuff } from './particles.js';
import { initBackground, renderGame } from './render.js';
import {
  buildUI, showScreen, updateHUD, showLevelUp, pickLevelUpChoice,
  showEnd, showBanner, hideBanner, setMutedIcon,
} from './ui.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const game = {
  state: 'title',
  time: 0,
  elapsed: 0,
  arena: { x: 24, y: 78, w: 800, h: 500 },
  player: null,
  enemies: [],
  bolts: [],
  shards: [],
  weapons: null,
  passives: null,
  director: null,
  kills: 0,
  level: 1,
  xp: 0,
  xpNext: xpForLevel(1),
  pendingLevels: 0,
  pickupCombo: 0,
  pickupComboT: 0,
  boss: null,
  bossSpawned: false,
  bossDefeated: false,
  bossWarning: 0,
  bannerShown: false,
  shake: 0,
  particles: [],
  texts: [],
  rings: [],
  zaps: [],
};
window.__lumenfall = game;
// Playtest hooks: the maker's own verification script stages late-run scenes (the King's
// arrival, the dawn victory) by spawning and striking foes through these two handles.
game.spawnEnemy = spawnEnemy;
game.damageEnemy = damageEnemy;

const ui = buildUI({
  onStart: () => startRun(),
  onRestart: () => startRun(),
  onResume: () => resumeGame(),
  onMuteToggle: () => toggleMute(),
});

function resetGame() {
  const cx = game.arena.x + game.arena.w / 2;
  const cy = game.arena.y + game.arena.h / 2;
  game.elapsed = 0;
  game.player = makePlayer(cx, cy);
  game.enemies = [];
  game.bolts = [];
  game.shards = [];
  const loadout = makeLoadout();
  game.weapons = loadout;
  game.passives = loadout.passives;
  game.director = makeDirector();
  game.kills = 0;
  game.level = 1;
  game.xp = 0;
  game.xpNext = xpForLevel(1);
  game.pendingLevels = 0;
  game.pickupCombo = 0;
  game.pickupComboT = 0;
  game.boss = null;
  game.bossSpawned = false;
  game.bossDefeated = false;
  game.bossWarning = 0;
  game.bannerShown = false;
  initEffects(game);
}

function startRun() {
  audio.ensureAudio();
  audio.sfxUiClick();
  resetGame();
  game.state = 'playing';
  hideBanner(ui);
  showScreen(ui, 'none');
}

function resumeGame() {
  if (game.state !== 'paused') return;
  audio.sfxUiClick();
  game.state = 'playing';
  showScreen(ui, 'none');
}

function pauseGame() {
  if (game.state !== 'playing') return;
  game.state = 'paused';
  showScreen(ui, 'pause');
}

function toggleMute() {
  audio.ensureAudio();
  setMutedIcon(ui, audio.toggleMuted());
}

function endRun(victory) {
  game.state = victory ? 'victory' : 'gameover';
  // The King's herald must not outlive the run: a warden who falls inside the warning
  // window would otherwise leave the banner hanging over the end screen.
  game.bossWarning = 0;
  game.bannerShown = false;
  hideBanner(ui);
  if (victory) audio.sfxVictory();
  else audio.sfxDefeat();
  showEnd(ui, victory, game);
  showScreen(ui, 'end');
}

// XP in, levels out: crossing a threshold pauses the run for an upgrade choice.
function gainXp(amount) {
  game.xp += amount;
  while (game.xp >= game.xpNext) {
    game.xp -= game.xpNext;
    game.level++;
    game.xpNext = xpForLevel(game.level);
    game.pendingLevels++;
  }
  if (game.pendingLevels > 0 && game.state === 'playing') openLevelUp();
}

function openLevelUp() {
  game.state = 'levelup';
  audio.sfxLevelUp();
  showLevelUp(ui, buildChoices(game), (choice) => {
    choice.apply(game);
    audio.sfxUiClick();
    game.pendingLevels--;
    if (game.pendingLevels > 0) {
      openLevelUp();
    } else {
      game.state = 'playing';
      showScreen(ui, 'none');
    }
  });
  showScreen(ui, 'levelup');
}

function handleKeys() {
  if (wasPressed('KeyM')) toggleMute();

  if (game.state === 'title' && anyPressed(['Enter', 'Space'])) startRun();
  else if ((game.state === 'victory' || game.state === 'gameover') && anyPressed(['Enter', 'KeyR'])) startRun();
  else if (game.state === 'playing' && anyPressed(['KeyP', 'Escape'])) pauseGame();
  else if (game.state === 'paused' && anyPressed(['KeyP', 'Escape', 'Enter'])) resumeGame();
  else if (game.state === 'levelup') {
    if (wasPressed('Digit1')) pickLevelUpChoice(ui, 0);
    else if (wasPressed('Digit2')) pickLevelUpChoice(ui, 1);
    else if (wasPressed('Digit3')) pickLevelUpChoice(ui, 2);
  }
}

function updatePlaying(dt) {
  game.elapsed += dt;
  updatePlayer(game, dt);
  updateWeapons(game, dt);
  updateDirector(game, dt);
  updateEnemies(game, dt);
  updateProjectiles(game, dt);
  const gained = updateShards(game, dt);
  if (gained > 0) gainXp(gained);
  updateEffects(game, dt);

  // The boss herald banner lives for the warning's duration.
  if (game.bossWarning > 0) {
    if (!game.bannerShown) {
      game.bannerShown = true;
      showBanner(ui, '⚠ THE HOLLOW KING STIRS ⚠', 'He comes for the last light — be ready.');
    }
    game.bossWarning -= dt;
    if (game.bossWarning <= 0) hideBanner(ui);
  }

  if (!game.player.alive) endRun(false);
  else if (game.bossDefeated && game.elapsed >= RUN_DURATION) endRun(true);
}

function updateTitle(dt) {
  // A living backdrop behind the title: drifting motes of light.
  updateEffects(game, dt);
  if (Math.random() < dt * 6) {
    const a = game.arena;
    spawnTrailPuff(game, a.x + Math.random() * a.w, a.y + Math.random() * a.h, 'rgba(120, 132, 255, 0.5)');
  }
}

let lastTs = 0;
function loop(ts) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.033, lastTs ? (ts - lastTs) / 1000 : 0.016);
  lastTs = ts;
  game.time += dt;

  handleKeys();
  if (game.state === 'playing') updatePlaying(dt);
  else if (game.state === 'title') updateTitle(dt);

  renderGame(ctx, game, canvas.width, canvas.height);
  if (game.state !== 'title') updateHUD(ui, game);
  endFrame();
}

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  game.arena = {
    x: 24,
    y: 82,
    w: canvas.width - 48,
    h: canvas.height - 106,
  };
  initBackground(canvas.width, canvas.height);
  if (game.player) {
    game.player.x = Math.min(game.arena.x + game.arena.w - 20, Math.max(game.arena.x + 20, game.player.x));
    game.player.y = Math.min(game.arena.y + game.arena.h - 20, Math.max(game.arena.y + 20, game.player.y));
  }
}

// Boot: a fresh world behind the title screen, then the loop.
window.addEventListener('resize', resize);
initInput(canvas);
onFirstGesture(() => audio.ensureAudio());
resize();
resetGame();
showScreen(ui, 'title');
setMutedIcon(ui, audio.isMuted());
requestAnimationFrame(loop);
