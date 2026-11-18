// Lumenfall Arena — main: boot, the run state machine and the game loop.
//
// States: title → playing ⇄ levelup, playing ⇄ paused, playing → victory | gameover.
// The loop always renders the world (so menus sit over a living arena); only the playing
// state advances the simulation. `window.__lumenfall` exposes the game object, which the
// maker's own playtest script drives to verify a run end to end.

import { RUN_DURATION, PLAYER, WEAPON_MAX_LEVEL, xpForLevel, CHAPTERS, chapterAt } from './config.js';
import * as audio from './audio.js';
import { initInput, wasPressed, anyPressed, endFrame, onFirstGesture, isTouchDevice } from './input.js';
import { makePlayer, updatePlayer, updateEnemies, updateProjectiles, updateShards, spawnEnemy, damageEnemy } from './entities.js';
import { makeLoadout, updateWeapons, buildChoices } from './weapons.js';
import { makeDirector, updateDirector } from './director.js';
import { initEffects, updateEffects, spawnTrailPuff, spawnMote, spawnRing, spawnFlash, addShake } from './particles.js';
import { initBackground, renderGame } from './render.js';
import { onArtReady } from './sprites.js';
import { makeScore, updateScore, settleScore } from './score.js';
import { makeRelicState, buildRelicChoices, updateRelics, hasRelic, RELICS } from './relics.js';
import * as meta from './meta.js';
import { COLORS } from './config.js';
import {
  buildUI, showScreen, updateHUD, showLevelUp, pickLevelUpChoice,
  showEnd, showBanner, hideBanner, setMutedIcon, updateTitleMeta, renderWorkshop,
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
  midboss: null,
  midbossSpawned: false,
  midbossDefeated: false,
  midbossWarning: 0,
  midbossBannerShown: false,
  richDraft: false,
  hitStop: 0,
  damageDealt: 0,
  chapter: 0,
  chapterFrom: 0,
  chapterTrans: 1,
  score: null,
  relics: null,
  save: null,
  crit: { chance: 0.05, mul: 2 },
  elitesKilled: 0,
  lastRewards: null,
  reviveAvailable: false,
  reviveUsed: false,
  chainsparkUnlocked: false,
  prismUnlocked: false,
  extraRelicChoice: false,
  meteorSuppressed: false,
  pendingRelicDrafts: 0,
  phaseIdx: 0,
  phaseBannerT: 0,
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
game.buildRelicChoices = buildRelicChoices;
game.meta = meta;

const ui = buildUI({
  onStart: () => startRun(),
  onRestart: () => startRun(),
  onResume: () => resumeGame(),
  onPause: () => pauseGame(),
  onMuteToggle: () => toggleMute(),
  onWorkshop: () => openWorkshop(),
  onWorkshopBack: () => closeWorkshop(),
  onBuyNode: (key) => buyWorkshopNode(key),
  onResetSave: (button) => resetSaveFlow(button),
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
  game.elitesKilled = 0;
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
  game.midboss = null;
  game.midbossSpawned = false;
  game.midbossDefeated = false;
  game.midbossWarning = 0;
  game.midbossBannerShown = false;
  game.richDraft = false;
  game.hitStop = 0;
  game.damageDealt = 0;
  game.chapter = 0;
  game.chapterFrom = 0;
  game.chapterTrans = 1;
  game.score = makeScore();
  game.relics = makeRelicState();
  game.pendingRelicDrafts = 0;
  game.phaseIdx = 0;
  game.phaseBannerT = 0;
  applyMeta();
  initEffects(game);
}

// The warden's permanent growth, folded into the fresh run: workshop bonuses and
// account-level bumps ride the same stat pipeline the blessings use, so nothing
// downstream needs to know they came from between runs.
function applyMeta() {
  if (!game.save) game.save = meta.loadSave();
  const bonuses = meta.computeMetaBonuses(game.save);
  game.metaBonuses = bonuses;
  const p = game.passives;
  p.damageMul *= bonuses.damageMul;
  p.speedMul *= bonuses.speedMul;
  p.magnetMul *= bonuses.magnetMul;
  p.dashCdMul *= bonuses.dashCdMul;
  p.xpMul *= bonuses.xpGainMul;
  p.armor = bonuses.armor;
  game.player.maxHp = PLAYER.baseHp + bonuses.maxHpBonus;
  game.player.hp = game.player.maxHp;
  game.crit = { chance: 0.05 + bonuses.critChance, mul: 2 };
  game.weapons.weapons.starbolts.level = Math.min(WEAPON_MAX_LEVEL, 1 + bonuses.startWeaponBonus);
  game.chainsparkUnlocked = bonuses.chainsparkUnlocked;
  game.prismUnlocked = bonuses.prismUnlocked;
  game.extraRelicChoice = bonuses.extraChoice;
  game.reviveAvailable = bonuses.revive;
  game.reviveUsed = false;
  // The Heirloom: a random silver or gold relic rides into the run from the start.
  if (bonuses.startRelic) {
    const heirloomPool = RELICS.filter((r) => r.tier !== 'prismatic');
    const relic = heirloomPool[Math.floor(Math.random() * heirloomPool.length)];
    game.relics.owned.push(relic.key);
    relic.apply(game);
  }
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
  game.midbossWarning = 0;
  game.midbossBannerShown = false;
  hideBanner(ui);
  settleScore(game);
  // Every run pays: Stardust and account XP bank into the save before the end
  // screen reads them back as the run's wages.
  const rewards = meta.computeRunRewards(game, game.metaBonuses);
  const outcome = meta.applyRunRewards(game.save, rewards, { kills: game.kills, victory });
  game.lastRewards = { ...rewards, levelsGained: outcome.levelsGained };
  updateTitleMeta(ui, game.save);
  if (victory) audio.sfxVictory();
  else audio.sfxDefeat();
  showEnd(ui, victory, game);
  showScreen(ui, 'end');
}

// --- The workshop -------------------------------------------------------------

function openWorkshop() {
  if (game.state !== 'title') return;
  audio.ensureAudio();
  audio.sfxUiClick();
  game.state = 'workshop';
  renderWorkshop(ui, game.save, (key) => buyWorkshopNode(key));
  showScreen(ui, 'workshop');
}

function closeWorkshop() {
  if (game.state !== 'workshop') return;
  audio.sfxUiClick();
  game.state = 'title';
  updateTitleMeta(ui, game.save);
  showScreen(ui, 'title');
}

function buyWorkshopNode(key) {
  const result = meta.buyNode(game.save, key);
  if (result === 'ok') {
    audio.sfxLevelUp();
    renderWorkshop(ui, game.save, (k) => buyWorkshopNode(k));
    updateTitleMeta(ui, game.save);
  } else {
    audio.sfxUiClick();
  }
}

// Resetting the save is forever, so the button arms first and only fires on a
// second tap within three seconds.
let resetArmTimer = 0;
function resetSaveFlow(button) {
  if (!button.dataset.armed) {
    button.dataset.armed = '1';
    button.textContent = 'Tap again to erase everything';
    window.clearTimeout(resetArmTimer);
    resetArmTimer = window.setTimeout(() => {
      delete button.dataset.armed;
      button.textContent = 'Reset save';
    }, 3000);
    return;
  }
  delete button.dataset.armed;
  button.textContent = 'Reset save';
  game.save = meta.resetSave();
  audio.sfxUiClick();
  renderWorkshop(ui, game.save, (key) => buyWorkshopNode(key));
  updateTitleMeta(ui, game.save);
}

// XP in, levels out: crossing a threshold pauses the run for an upgrade choice.
function gainXp(amount) {
  const xpMul = (game.passives ? game.passives.xpMul : 1) * (game.relics ? game.relics.xpMul : 1);
  game.xp += amount * xpMul;
  let gained = 0;
  while (game.xp >= game.xpNext) {
    game.xp -= game.xpNext;
    game.level++;
    game.xpNext = xpForLevel(game.level);
    game.pendingLevels++;
    gained++;
  }
  // The Dawn Nova turns every level into a detonation around the warden.
  if (gained > 0 && hasRelic(game, 'dawnnova')) {
    const p = game.player;
    spawnRing(game, p.x, p.y, COLORS.nova, 230, 6);
    spawnFlash(game, p.x, p.y, COLORS.nova, 130, 0.3);
    addShake(game, 9);
    audio.sfxNova();
    for (const enemy of [...game.enemies]) {
      if (enemy.dead) continue;
      const dx = enemy.x - p.x;
      const dy = enemy.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 230 + enemy.radius) {
        damageEnemy(game, enemy, 120 * game.passives.damageMul, (dx / (d || 1)) * 300, (dy / (d || 1)) * 300);
      }
    }
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

// An elite's fall opens the court's hoard: the run pauses into a draft of three
// relics, on the same card machinery as the level-up blessings.
function openRelicDraft() {
  const choices = buildRelicChoices(game);
  if (choices.length === 0) {
    // The whole hoard is already carried; the draft simply never opens.
    game.pendingRelicDrafts = 0;
    if (game.state === 'relicdraft') {
      game.state = 'playing';
      showScreen(ui, 'none');
    }
    return;
  }
  game.state = 'relicdraft';
  audio.sfxLevelUp();
  showLevelUp(ui, choices, (choice) => {
    choice.apply(game);
    audio.sfxUiClick();
    game.pendingRelicDrafts--;
    if (game.pendingRelicDrafts > 0) {
      openRelicDraft();
    } else {
      game.state = 'playing';
      showScreen(ui, 'none');
    }
  }, { heading: '👑 A RELIC OF THE COURT 👑', sub: 'An elite has fallen — claim one treasure' });
  showScreen(ui, 'levelup');
}

function handleKeys() {
  if (wasPressed('KeyM')) toggleMute();

  if (game.state === 'title' && anyPressed(['Enter', 'Space'])) startRun();
  else if (game.state === 'workshop' && anyPressed(['Escape', 'Enter'])) closeWorkshop();
  else if ((game.state === 'victory' || game.state === 'gameover') && anyPressed(['Enter', 'KeyR'])) startRun();
  else if (game.state === 'playing' && anyPressed(['KeyP', 'Escape'])) pauseGame();
  else if (game.state === 'paused' && anyPressed(['KeyP', 'Escape', 'Enter'])) resumeGame();
  else if (game.state === 'levelup' || game.state === 'relicdraft') {
    if (wasPressed('Digit1')) pickLevelUpChoice(ui, 0);
    else if (wasPressed('Digit2')) pickLevelUpChoice(ui, 1);
    else if (wasPressed('Digit3')) pickLevelUpChoice(ui, 2);
    else if (wasPressed('Digit4')) pickLevelUpChoice(ui, 3);
  }
}

// The run's named movements, announced as the dark gathers. The chapter
// crossings have their own heraldry (below); the last phase clears the stage
// six seconds before the King's own warning sting.
const PHASES = [
  { at: 45, title: 'THE SWARM STIRS', sub: 'They have scented the last light.' },
  { at: 165, title: 'THE COURT AWAKENS', sub: 'The Hollow King\'s servants take the field.' },
  { at: 225, title: 'THE KING\'S HERALD', sub: 'A crown of embers on the horizon. He is coming.' },
];

function updatePlaying(dt) {
  game.elapsed += dt;
  // The journey's crossings: when the clock carries the run into a new
  // chapter, the arena's light changes (render.js cross-fades the wash) and
  // the chapter announces itself, banner permitting.
  const chapterNow = chapterAt(game.elapsed);
  if (chapterNow !== game.chapter) {
    game.chapterFrom = game.chapter;
    game.chapter = chapterNow;
    game.chapterTrans = 0;
    const ch = CHAPTERS[chapterNow];
    if (game.bossWarning <= 0 && game.midbossWarning <= 0 && game.phaseBannerT <= 0 && game.state === 'playing') {
      showBanner(ui, `${ch.name} · ${ch.sub}`, chapterNow === 1 ? 'The court\'s furnaces wake below.' : 'Cold takes the high court. He is near.');
      game.phaseBannerT = 2.6;
    }
  }
  if (game.chapterTrans < 1) game.chapterTrans = Math.min(1, game.chapterTrans + dt / 1.6);
  // Ambient embers and dust rise through the arena while the fight runs —
  // thicker in the Ember Deep, and turned to frost in the last chapter.
  const a = game.arena;
  const frost = game.chapter === 2;
  const emberRate = game.chapter === 1 ? 5.2 : 3.2;
  if (Math.random() < dt * emberRate) spawnMote(game, a.x + Math.random() * a.w, a.y + a.h - Math.random() * 30, frost ? 'frost' : null);
  if (Math.random() < dt * 0.9) spawnMote(game, a.x + Math.random() * a.w, a.y + Math.random() * a.h, frost ? 'frost' : null);
  updatePlayer(game, dt);
  updateWeapons(game, dt);
  updateDirector(game, dt);
  updateEnemies(game, dt);
  updateProjectiles(game, dt);
  const gained = updateShards(game, dt);
  if (gained > 0) gainXp(gained);
  updateEffects(game, dt);
  updateScore(game, dt);
  updateRelics(game, dt);

  // Phase banners, on the same heraldry as the boss warnings but never over them.
  while (game.phaseIdx < PHASES.length && game.elapsed >= PHASES[game.phaseIdx].at) {
    const phase = PHASES[game.phaseIdx++];
    if (game.bossWarning <= 0 && game.midbossWarning <= 0 && game.phaseBannerT <= 0 && game.state === 'playing') {
      showBanner(ui, phase.title, phase.sub);
      game.phaseBannerT = 2.6;
    }
  }
  if (game.phaseBannerT > 0) {
    game.phaseBannerT -= dt;
    if (game.phaseBannerT <= 0 && game.bossWarning <= 0 && game.midbossWarning <= 0) hideBanner(ui);
  }

  // The lieutenant's warning banner, on the same drumbeat as his King's.
  if (game.midbossWarning > 0) {
    if (!game.midbossBannerShown) {
      game.midbossBannerShown = true;
      showBanner(ui, '🔥 THE ASHEN HERALD COMES 🔥', 'The King\'s lieutenant holds the road — break him.');
    }
    game.midbossWarning -= dt;
    if (game.midbossWarning <= 0) hideBanner(ui);
  }

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

  // An elite fell this frame and the run still stands: open the relic draft.
  // (A pending level-up wins the pause; the draft follows it next frame.)
  if (game.state === 'playing' && game.pendingRelicDrafts > 0 && game.pendingLevels === 0) {
    openRelicDraft();
  }
}

function updateTitle(dt) {
  // A living backdrop behind the title: drifting motes of light.
  updateEffects(game, dt);
  if (Math.random() < dt * 6) {
    const a = game.arena;
    spawnTrailPuff(game, a.x + Math.random() * a.w, a.y + Math.random() * a.h, 'rgba(120, 132, 255, 0.5)');
  }
  if (Math.random() < dt * 2) {
    const a = game.arena;
    spawnMote(game, a.x + Math.random() * a.w, a.y + Math.random() * a.h);
  }
}

let lastTs = 0;
function loop(ts) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.033, lastTs ? (ts - lastTs) / 1000 : 0.016);
  lastTs = ts;
  game.time += dt;

  handleKeys();
  // Hit-stop: a champion's death freezes the world for a heartbeat. The clock
  // (game.time) keeps turning, so glows and rings still breathe over the still.
  if (game.state === 'playing' && game.hitStop > 0) {
    game.hitStop -= dt;
  } else if (game.state === 'playing') updatePlaying(dt);
  else if (game.state === 'title' || game.state === 'workshop') updateTitle(dt);

  renderGame(ctx, game, canvas.width, canvas.height);
  if (game.state !== 'title') updateHUD(ui, game);
  endFrame();
}

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  // Short viewports (a phone held sideways) get a tighter frame so the arena
  // keeps the height the HUD would otherwise eat.
  const compact = canvas.height < 520;
  game.arena = {
    x: 24,
    y: compact ? 64 : 82,
    w: canvas.width - 48,
    h: canvas.height - (compact ? 86 : 106),
  };
  initBackground(canvas.width, canvas.height, game.arena);
  if (game.player) {
    game.player.x = Math.min(game.arena.x + game.arena.w - 20, Math.max(game.arena.x + 20, game.player.x));
    game.player.y = Math.min(game.arena.y + game.arena.h - 20, Math.max(game.arena.y + 20, game.player.y));
  }
  // Landscape-first on touch devices: held upright mid-run, the game pauses
  // itself under the rotate hint rather than playing on in a letterbox.
  const portrait = isTouchDevice() && window.innerHeight > window.innerWidth;
  document.body.classList.toggle('portrait', portrait);
  if (portrait && game.state === 'playing') pauseGame();
}

// Boot: a fresh world behind the title screen, then the loop.
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
initInput(canvas);
onFirstGesture(() => audio.ensureAudio());
game.save = meta.loadSave();
resize();
// When the tileset art lands, rebake the world once so the arena floor is
// laid from the pack's real stone tiles (the first bake used the fallback).
onArtReady(() => resize());
resetGame();
showScreen(ui, 'title');
updateTitleMeta(ui, game.save);
setMutedIcon(ui, audio.isMuted());
requestAnimationFrame(loop);
