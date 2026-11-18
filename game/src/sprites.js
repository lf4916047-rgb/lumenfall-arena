// Lumenfall Arena — sprites: the cast, drawn from one real pixel-art tileset
// (0x72's Dungeon Tileset II, CC0 — see assets/CREDITS.md) so every creature
// shares a single hand-made style: a robed wizzard for the Star-warden, the
// winged wogol as the Void Moth, the chort imp as the Gloomwing, the ogre as
// the Hexshell Hulk, the hooded necromancer as the Watcher, and the big demon
// as the Hollow King. Frames load from assets/frames/, are copied onto
// canvases once (with a white silhouette twin for the hit flash, and a
// gold-washed twin set for elites), and the frame loop just blits them —
// a drawImage per creature, like the baked vector sprites before them.
// Until the art lands (a blink, on local files) placeholder sets draw nothing.

const FRAME_DIR = './assets/frames/';

function frameNames(base, count) {
  return Array.from({ length: count }, (_, i) => `${base}_f${i}.png`);
}

// The pack's animation sets, per creature. `idle` is the cycle a creature
// breathes/hover-flaps through; `run` is its moving cycle where the pack has
// one (the necromancer only ever had the one set — it drifts, it does not run).
const ART = {
  player: { idle: frameNames('wizzard_m_idle_anim', 4), run: frameNames('wizzard_m_run_anim', 4) },
  moth: { idle: frameNames('wogol_idle_anim', 4) },
  darter: { idle: frameNames('chort_idle_anim', 4), run: frameNames('chort_run_anim', 4) },
  brute: { idle: frameNames('ogre_idle_anim', 4), run: frameNames('ogre_run_anim', 4) },
  spitter: { idle: frameNames('necromancer_anim', 4) },
  boss: { idle: frameNames('big_demon_idle_anim', 4), run: frameNames('big_demon_run_anim', 4) },
};

const FLOOR_FILES = Array.from({ length: 8 }, (_, i) => `floor_${i + 1}.png`);
const COLUMN_FILE = 'column.png';

// Sprite geometry in "radius units", the same convention the vector sprites
// used: a set blitted at radius r spans wU*r wide and hU*r tall, with the
// origin shifted yOffU*r so a standing creature's feet rest just below its
// collision centre instead of the sprite floating centred on it. The flyer
// hovers, so it stays near-centred.
const GEOMETRY = {
  player: { wU: 1.89, hU: 3.3, yOffU: -1.15 },
  moth: { wU: 1.88, hU: 2.7, yOffU: -0.25 },
  darter: { wU: 2.02, hU: 2.9, yOffU: -0.95 },
  brute: { wU: 2.53, hU: 2.85, yOffU: -0.93 },
  spitter: { wU: 2.05, hU: 2.95, yOffU: -0.98 },
  boss: { wU: 3.87, hU: 4.35, yOffU: -1.68 },
};

// Where the King's heart burns, in sprite units — render.js turns live swirl
// arcs over it. On the big demon that is the centre of the maw and chest.
export const HOLLOW_HEART = { x: 0, y: 0.12 };

// --- Loading -------------------------------------------------------------------

const imageCache = new Map();
function loadImage(name) {
  if (!imageCache.has(name)) {
    imageCache.set(name, new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`sprite failed to load: ${name}`));
      img.src = FRAME_DIR + name;
    }));
  }
  return imageCache.get(name);
}

let sets = null;
let floorArt = null;
let artReady = false;
const readyCallbacks = [];

// Fires once the tileset art has landed and the real sets exist. The boot
// uses it to rebake the arena floor from the pack's tiles.
export function onArtReady(cb) {
  if (artReady) cb();
  else readyCallbacks.push(cb);
}

// The floor tiles and pillar for render.js's background bake, or null until
// the art lands (the bake then falls back to its flat stone wash).
export function getFloorArt() {
  return floorArt;
}

// --- Set building ----------------------------------------------------------------

function canvasOf(img) {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext('2d').drawImage(img, 0, 0);
  return canvas;
}

function silhouetteOf(canvas) {
  const ghost = document.createElement('canvas');
  ghost.width = canvas.width;
  ghost.height = canvas.height;
  const c = ghost.getContext('2d');
  c.drawImage(canvas, 0, 0);
  c.globalCompositeOperation = 'source-in';
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, ghost.width, ghost.height);
  return ghost;
}

// Elites wear their rank in gold: the same frames washed warm at load. (The
// live gold ring render.js draws around elites does the rest.)
function goldTintOf(canvas) {
  const gilt = document.createElement('canvas');
  gilt.width = canvas.width;
  gilt.height = canvas.height;
  const c = gilt.getContext('2d');
  c.drawImage(canvas, 0, 0);
  c.globalCompositeOperation = 'source-atop';
  c.fillStyle = 'rgba(255, 176, 66, 0.34)';
  c.fillRect(0, 0, gilt.width, gilt.height);
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 0.45;
  c.drawImage(canvas, 0, 0);
  c.globalAlpha = 1;
  return gilt;
}

function makeCycle(images, elite) {
  const frames = images.map((img) => {
    const base = canvasOf(img);
    return elite ? goldTintOf(base) : base;
  });
  return { frames, flash: frames.map(silhouetteOf) };
}

function makeSet(geo, cycles) {
  return { ...geo, idle: cycles.idle, run: cycles.run ?? null };
}

async function loadAll() {
  const loaded = {};
  await Promise.all(Object.entries(ART).map(async ([kind, cycles]) => {
    loaded[kind] = {};
    for (const [cycleName, names] of Object.entries(cycles)) {
      loaded[kind][cycleName] = await Promise.all(names.map(loadImage));
    }
  }));
  const [tiles, column] = await Promise.all([
    Promise.all(FLOOR_FILES.map(loadImage)),
    loadImage(COLUMN_FILE),
  ]);
  floorArt = { tiles, column };

  const built = {};
  for (const [kind, cycles] of Object.entries(loaded)) {
    const geo = GEOMETRY[kind];
    const normalCycles = { idle: makeCycle(cycles.idle, false) };
    if (cycles.run) normalCycles.run = makeCycle(cycles.run, false);
    if (kind === 'player' || kind === 'boss') {
      built[kind] = makeSet(geo, normalCycles);
    } else {
      const eliteCycles = { idle: makeCycle(cycles.idle, true) };
      if (cycles.run) eliteCycles.run = makeCycle(cycles.run, true);
      built[kind] = { normal: makeSet(geo, normalCycles), elite: makeSet(geo, eliteCycles) };
    }
  }
  sets = built;
  artReady = true;
  window.__lumenfallSpritesReady = true;
  for (const cb of readyCallbacks.splice(0)) cb();
}
loadAll().catch((err) => console.error(err));

// --- Placeholders (until the art lands) -------------------------------------------

let placeholder = null;
function placeholderSets() {
  if (placeholder) return placeholder;
  const blank = document.createElement('canvas');
  blank.width = 1;
  blank.height = 1;
  const cyc = () => ({ frames: [blank], flash: [blank] });
  const set = (geo) => ({ ...geo, idle: cyc(), run: null });
  placeholder = {
    player: set(GEOMETRY.player),
    boss: set(GEOMETRY.boss),
    moth: { normal: set(GEOMETRY.moth), elite: set(GEOMETRY.moth) },
    darter: { normal: set(GEOMETRY.darter), elite: set(GEOMETRY.darter) },
    brute: { normal: set(GEOMETRY.brute), elite: set(GEOMETRY.brute) },
    spitter: { normal: set(GEOMETRY.spitter), elite: set(GEOMETRY.spitter) },
  };
  return placeholder;
}

export function initSprites() {
  return getSprites();
}

export function getSprites() {
  return sets ?? placeholderSets();
}

// --- Blitting ----------------------------------------------------------------------
// One frame centred on the current origin, scaled so 1 unit = `radius` px and
// lifted by the set's yOffU. `cycle` is 'idle' or 'run' (run falls back to
// idle for creatures the pack only ever drew one way). The caller flips the
// context horizontally for leftward movers — the pack's cast all face front,
// Vampire-Survivors style, so facing is a flip, never a rotation.

export function blit(ctx, set, cycle, frame, radius) {
  const cyc = cycle === 'run' && set.run ? set.run : set.idle;
  const img = cyc.frames[frame % cyc.frames.length];
  ctx.drawImage(img, -set.wU * radius / 2, -set.hU * radius / 2 + set.yOffU * radius, set.wU * radius, set.hU * radius);
}

export function blitFlash(ctx, set, cycle, frame, radius, alpha) {
  const cyc = cycle === 'run' && set.run ? set.run : set.idle;
  const img = cyc.flash[frame % cyc.flash.length];
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, -set.wU * radius / 2, -set.hU * radius / 2 + set.yOffU * radius, set.wU * radius, set.hU * radius);
  ctx.globalAlpha = 1;
}

// --- Lumen shards ---------------------------------------------------------------
// One baked shard — glow, gradient diamond and white core — blitted at either
// size. It replaces a per-shard gradient and glow pass in the frame loop, which
// mattered once a boss fight had a hundred shards on the floor. (Code-drawn:
// the pack has no shard of its own, and the gem already matches the palette.)

let shardSprite = null;

export function getShardSprite() {
  if (shardSprite) return shardSprite;
  const S = 72;
  shardSprite = document.createElement('canvas');
  shardSprite.width = S;
  shardSprite.height = S;
  const c = shardSprite.getContext('2d');
  const glow = c.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
  glow.addColorStop(0, 'rgba(46, 230, 200, 0.5)');
  glow.addColorStop(0.5, 'rgba(46, 230, 200, 0.16)');
  glow.addColorStop(1, 'rgba(46, 230, 200, 0)');
  c.fillStyle = glow;
  c.fillRect(0, 0, S, S);
  c.save();
  c.translate(S / 2, S / 2);
  c.rotate(Math.PI / 4);
  const gem = c.createLinearGradient(0, -11, 0, 11);
  gem.addColorStop(0, '#8ffbe9');
  gem.addColorStop(0.5, '#2ee6c8');
  gem.addColorStop(1, '#0f9d84');
  c.fillStyle = gem;
  c.fillRect(-11, -11, 22, 22);
  c.fillStyle = 'rgba(255, 255, 255, 0.8)';
  c.fillRect(-4, -4, 8, 8);
  c.restore();
  return shardSprite;
}
