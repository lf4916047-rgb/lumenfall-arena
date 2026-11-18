// Lumenfall Arena — sprites: every creature in the game, drawn once at load into
// offscreen canvases and blitted per frame. The old look drew circles and hexagons
// live each frame; these are real characters — a hooded warden with a lantern-staff,
// a fuzzy void moth, a bat-winged gloomwing, a horned hexshell beetle, a floating
// eyeball horror, and a tall robed skeleton king — each with a few animation frames
// (wing positions, scuttling legs, waving tentacles, a swaying robe) and a white
// silhouette twin used for the hit flash. Baking them keeps the frame loop at a
// drawImage per creature, so the bestiary costs no more than the blobs did.

import { COLORS } from './config.js';

const TAU = Math.PI * 2;
// Pixels per radius-unit in the baked art. Creatures are drawn in "radius units"
// (body radius = 1), so a sprite baked at N px/unit and blitted at radius r covers
// the same shape at any size — elites simply scale up. The bake resolution is a
// frame-rate decision, not a quality one: a software rasteriser pays dearly to
// downscale a big canvas ninety times a frame, so the small fry bake at 36 px/unit
// (still ~2x their drawn size) and only the King, who fills real screen, gets 64.
const UNIT = 36;
const BOSS_UNIT = 64;

function bake(wU, hU, drawFn, unit = UNIT) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(wU * unit);
  canvas.height = Math.ceil(hU * unit);
  const c = canvas.getContext('2d');
  c.translate(canvas.width / 2, canvas.height / 2);
  c.scale(unit, unit);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  drawFn(c);
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

// A sprite set: baked frames plus their white silhouettes, sized in radius units.
function makeSet(wU, hU, drawFns, unit = UNIT) {
  const frames = drawFns.map((fn) => bake(wU, hU, fn, unit));
  return { wU, hU, frames, flash: frames.map(silhouetteOf) };
}

// Blit one frame centred on the current origin, scaled so 1 unit = `radius` px.
export function blit(ctx, set, frame, radius) {
  const img = set.frames[frame % set.frames.length];
  ctx.drawImage(img, -set.wU * radius / 2, -set.hU * radius / 2, set.wU * radius, set.hU * radius);
}

export function blitFlash(ctx, set, frame, radius, alpha) {
  const img = set.flash[frame % set.flash.length];
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, -set.wU * radius / 2, -set.hU * radius / 2, set.wU * radius, set.hU * radius);
  ctx.globalAlpha = 1;
}

// --- Shared bits ---------------------------------------------------------------

// A small royal circlet, drawn around a head in top-down view: gold band, five
// spikes, gem tips. Elites wear their rank.
function drawCirclet(c, x, y, r) {
  c.strokeStyle = COLORS.bossCrown;
  c.lineWidth = 0.07;
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.stroke();
  const gems = ['#ff5d8f', '#2ee6c8', '#ff5d8f', '#9be7ff', '#ff5d8f'];
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i / 5) * TAU;
    const gx = x + Math.cos(a) * r;
    const gy = y + Math.sin(a) * r;
    c.fillStyle = COLORS.bossCrown;
    c.beginPath();
    c.moveTo(gx + Math.cos(a) * 0.16, gy + Math.sin(a) * 0.16);
    c.lineTo(gx + Math.cos(a + 0.5) * 0.09, gy + Math.sin(a + 0.5) * 0.09);
    c.lineTo(gx + Math.cos(a - 0.5) * 0.09, gy + Math.sin(a - 0.5) * 0.09);
    c.closePath();
    c.fill();
    c.fillStyle = gems[i];
    c.beginPath();
    c.arc(gx + Math.cos(a) * 0.17, gy + Math.sin(a) * 0.17, 0.045, 0, TAU);
    c.fill();
  }
}

function glowDot(c, x, y, r, color) {
  const g = c.createRadialGradient(x, y, 0, x, y, r * 2.6);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.globalAlpha = 0.55;
  c.fillStyle = g;
  c.fillRect(x - r * 2.6, y - r * 2.6, r * 5.2, r * 5.2);
  c.globalAlpha = 1;
  c.fillStyle = color;
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
}

// --- The Star-warden -----------------------------------------------------------
// A small hooded figure facing +x: teal cloak trailing behind, shadowed face with
// two amber eyes under the hood, and a lantern-staff held out to the side whose
// light is the warmest thing in the arena. Two frames sway the cloak's tail.

function drawWarden(sway) {
  return (c) => {
    // The cloak: a teardrop from the trailing tail to the shoulders.
    const cloak = c.createLinearGradient(-1.2, 0, 0.8, 0);
    cloak.addColorStop(0, '#0a2e3c');
    cloak.addColorStop(0.55, '#14586b');
    cloak.addColorStop(1, '#1d7a80');
    c.fillStyle = cloak;
    c.beginPath();
    c.moveTo(-1.18, sway);
    c.bezierCurveTo(-0.72, -0.74 + sway * 0.4, 0.02, -0.88, 0.5, -0.62);
    c.bezierCurveTo(0.8, -0.44, 0.8, 0.44, 0.5, 0.62);
    c.bezierCurveTo(0.02, 0.88, -0.72, 0.74 + sway * 0.4, -1.18, sway);
    c.closePath();
    c.fill();
    // Cloak shading and an amber sash across the back.
    c.fillStyle = 'rgba(4, 18, 26, 0.35)';
    c.beginPath();
    c.ellipse(-0.45, 0.28, 0.55, 0.3, 0.3, 0, TAU);
    c.fill();
    c.strokeStyle = 'rgba(255, 179, 64, 0.75)';
    c.lineWidth = 0.07;
    c.beginPath();
    c.moveTo(-0.62, -0.5);
    c.quadraticCurveTo(-0.1, 0, -0.55, 0.55);
    c.stroke();
    // The warden's star, worn on the back of the cloak.
    c.fillStyle = 'rgba(255, 217, 122, 0.85)';
    c.save();
    c.translate(-0.32, -0.05);
    c.beginPath();
    c.moveTo(0, -0.17);
    c.quadraticCurveTo(0, 0, 0.17, 0);
    c.quadraticCurveTo(0, 0, 0, 0.17);
    c.quadraticCurveTo(0, 0, -0.17, 0);
    c.quadraticCurveTo(0, 0, 0, -0.17);
    c.fill();
    c.restore();
    // The hood: a deep teal cowl with a worn amber rim.
    const hood = c.createRadialGradient(0.34, -0.14, 0.1, 0.48, -0.02, 0.62);
    hood.addColorStop(0, '#2a9d8f');
    hood.addColorStop(0.6, '#17616e');
    hood.addColorStop(1, '#0a2e3c');
    c.fillStyle = hood;
    c.beginPath();
    c.arc(0.48, -0.02, 0.56, 0, TAU);
    c.fill();
    c.strokeStyle = 'rgba(255, 179, 64, 0.65)';
    c.lineWidth = 0.055;
    c.beginPath();
    c.arc(0.48, -0.02, 0.5, -0.7, 1.5);
    c.stroke();
    // The shadowed face, and the two eyes that burn inside it.
    c.fillStyle = '#05070f';
    c.beginPath();
    c.ellipse(0.62, -0.02, 0.3, 0.35, 0, 0, TAU);
    c.fill();
    glowDot(c, 0.7, -0.13, 0.055, '#ffd97a');
    glowDot(c, 0.7, 0.11, 0.055, '#ffd97a');
    // The lantern-staff, held out to the lower side.
    c.strokeStyle = '#7a5230';
    c.lineWidth = 0.09;
    c.beginPath();
    c.moveTo(0.55, 0.45);
    c.lineTo(1.24, 0.82);
    c.stroke();
    glowDot(c, 1.36, 0.92, 0.3, 'rgba(255, 179, 64, 0.55)');
    c.fillStyle = '#ffe9b0';
    c.beginPath();
    c.arc(1.36, 0.92, 0.11, 0, TAU);
    c.fill();
    c.strokeStyle = '#3a2a18';
    c.lineWidth = 0.05;
    c.beginPath();
    c.arc(1.36, 0.92, 0.17, 0, TAU);
    c.stroke();
    c.beginPath();
    c.moveTo(1.36, 0.72);
    c.lineTo(1.36, 0.78);
    c.stroke();
  };
}

// --- Void Moth -----------------------------------------------------------------
// Fuzzy segmented body, feathery antennae, and two pairs of wings with pale
// eye-spots. Three frames carry the wingbeat. Facing +x.

function drawMoth(flap, elite) {
  return (c) => {
    for (const side of [-1, 1]) {
      // Hindwing first, then the great forewing, both swept back from the thorax.
      const wingGrad = c.createRadialGradient(0, 0, 0.1, -0.4, side * 0.8, 1.5);
      wingGrad.addColorStop(0, '#ff8fab');
      wingGrad.addColorStop(0.5, COLORS.enemyMoth);
      wingGrad.addColorStop(1, '#8f1030');
      c.fillStyle = wingGrad;
      c.save();
      c.translate(0, side * 0.1);
      c.rotate(side * flap * 0.35);
      c.beginPath();
      c.ellipse(-0.62, side * 0.62, 0.6, 0.34, side * 0.5, 0, TAU);
      c.fill();
      c.beginPath();
      c.ellipse(-0.38, side * 0.92, 1.02, 0.52, side * 0.62, 0, TAU);
      c.fill();
      // Wing veins, fanning from the shoulder.
      c.strokeStyle = 'rgba(120, 8, 40, 0.45)';
      c.lineWidth = 0.04;
      for (const t of [-0.25, 0.1, 0.45]) {
        c.beginPath();
        c.moveTo(0, side * 0.1);
        c.quadraticCurveTo(-0.5, side * (0.7 + t * 0.3), -0.95, side * (1.05 + t * 0.55));
        c.stroke();
      }
      // The eye-spot: cream ring, dark pupil, one glint — a warning to birds.
      c.fillStyle = '#ffe3ec';
      c.beginPath();
      c.arc(-0.82, side * 1.08, 0.17, 0, TAU);
      c.fill();
      c.fillStyle = '#4a0218';
      c.beginPath();
      c.arc(-0.82, side * 1.08, 0.1, 0, TAU);
      c.fill();
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.arc(-0.86, side * 1.04, 0.035, 0, TAU);
      c.fill();
      if (elite) {
        c.strokeStyle = 'rgba(255, 217, 122, 0.8)';
        c.lineWidth = 0.05;
        c.beginPath();
        c.ellipse(-0.38, side * 0.92, 1.02, 0.52, side * 0.62, 0, TAU);
        c.stroke();
      }
      c.restore();
    }
    // The abdomen: five shrinking, furred segments trailing behind the thorax.
    for (let i = 4; i >= 0; i--) {
      const x = -0.12 - i * 0.16;
      const r = 0.3 - i * 0.028;
      c.fillStyle = i % 2 ? '#c21847' : '#d6336c';
      c.beginPath();
      c.ellipse(x, 0, r * 1.15, r, 0, 0, TAU);
      c.fill();
      c.strokeStyle = 'rgba(255, 143, 171, 0.4)';
      c.lineWidth = 0.03;
      for (let j = 0; j < 5; j++) {
        const a = (j / 5) * TAU + i;
        c.beginPath();
        c.moveTo(x + Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9);
        c.lineTo(x + Math.cos(a) * r * 1.25, Math.sin(a) * r * 1.25);
        c.stroke();
      }
    }
    // Thorax and head.
    c.fillStyle = '#e0457b';
    c.beginPath();
    c.arc(0.26, 0, 0.31, 0, TAU);
    c.fill();
    c.fillStyle = '#8f1030';
    c.beginPath();
    c.arc(0.56, 0, 0.24, 0, TAU);
    c.fill();
    // Feathery antennae sweeping ahead of the head.
    c.strokeStyle = '#ff8fab';
    c.lineWidth = 0.04;
    for (const side of [-1, 1]) {
      c.beginPath();
      c.moveTo(0.62, side * 0.08);
      c.quadraticCurveTo(0.95, side * 0.3, 1.22, side * 0.52);
      c.stroke();
      for (let j = 1; j <= 5; j++) {
        const t = j / 6;
        const bx = 0.62 + (1.22 - 0.62) * t;
        const by = side * (0.08 + 0.44 * t * t + 0.1 * t);
        c.beginPath();
        c.moveTo(bx, by);
        c.lineTo(bx + 0.05, by + side * 0.09);
        c.stroke();
      }
    }
    // Compound eyes.
    for (const side of [-1, 1]) {
      c.fillStyle = '#2b0212';
      c.beginPath();
      c.arc(0.64, side * 0.11, 0.085, 0, TAU);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.75)';
      c.beginPath();
      c.arc(0.67, side * 0.11 - 0.03, 0.03, 0, TAU);
      c.fill();
    }
    if (elite) drawCirclet(c, 0.56, 0, 0.34);
  };
}

// --- Gloomwing (darter) ----------------------------------------------------------
// A sleek bat-wasp: swept membranous wings with scalloped trailing edges and bone
// struts, a tapered body, pointed ears, and a barbed tail stinger. Facing +x.

function drawDarter(flap, elite) {
  return (c) => {
    for (const side of [-1, 1]) {
      const tipY = side * (1.32 - flap * 0.5);
      const tipX = -0.45 - flap * 0.25;
      const membrane = c.createLinearGradient(0.3, 0, -1, tipY);
      membrane.addColorStop(0, 'rgba(255, 150, 100, 0.95)');
      membrane.addColorStop(1, 'rgba(161, 46, 8, 0.85)');
      c.fillStyle = membrane;
      c.beginPath();
      c.moveTo(0.3, side * 0.14);
      c.lineTo(tipX, tipY);
      c.quadraticCurveTo(-0.72, side * (0.95 - flap * 0.3), -0.88, side * 0.68);
      c.quadraticCurveTo(-0.98, side * 0.5, -0.9, side * 0.34);
      c.quadraticCurveTo(-0.8, side * 0.26, -0.55, side * 0.16);
      c.closePath();
      c.fill();
      // Bone struts through the membrane.
      c.strokeStyle = elite ? 'rgba(255, 217, 122, 0.85)' : 'rgba(122, 36, 5, 0.8)';
      c.lineWidth = 0.05;
      c.beginPath();
      c.moveTo(0.3, side * 0.14);
      c.lineTo(tipX, tipY);
      c.moveTo(0.28, side * 0.13);
      c.lineTo(-0.88, side * 0.68);
      c.moveTo(0.26, side * 0.12);
      c.lineTo(-0.9, side * 0.34);
      c.stroke();
    }
    // The body: a tapered dart from stinger to snout.
    const body = c.createLinearGradient(-1.05, 0, 0.9, 0);
    body.addColorStop(0, '#a12e08');
    body.addColorStop(0.55, COLORS.enemyDarter);
    body.addColorStop(1, '#ffc9a3');
    c.fillStyle = body;
    c.beginPath();
    c.moveTo(-1.02, 0);
    c.bezierCurveTo(-0.5, -0.3, 0.3, -0.34, 0.82, -0.1);
    c.lineTo(0.95, 0);
    c.lineTo(0.82, 0.1);
    c.bezierCurveTo(0.3, 0.34, -0.5, 0.3, -1.02, 0);
    c.closePath();
    c.fill();
    // Segment seams down the body.
    c.strokeStyle = 'rgba(122, 36, 5, 0.5)';
    c.lineWidth = 0.04;
    for (const x of [-0.55, -0.2, 0.15]) {
      c.beginPath();
      c.moveTo(x, -0.24);
      c.lineTo(x + 0.05, 0.24);
      c.stroke();
    }
    // The stinger: a dark barb at the tail.
    c.fillStyle = '#5e1a04';
    c.beginPath();
    c.moveTo(-1.0, -0.09);
    c.lineTo(-1.34, 0);
    c.lineTo(-1.0, 0.09);
    c.closePath();
    c.fill();
    // Pointed ears and one hot eye.
    c.fillStyle = '#c75116';
    for (const side of [-1, 1]) {
      c.beginPath();
      c.moveTo(0.6, side * 0.16);
      c.lineTo(0.82, side * 0.42);
      c.lineTo(0.86, side * 0.12);
      c.closePath();
      c.fill();
    }
    glowDot(c, 0.74, 0, 0.07, '#fff1e6');
    if (elite) drawCirclet(c, 0.62, 0, 0.3);
  };
}

// --- Hexshell Hulk (brute) -------------------------------------------------------
// A hulking beetle: six scuttling legs (two frames trade their stride), layered
// armour plates with glowing cracks, a horned head, and a burning core under the
// shell split. Facing +x.

function drawBrute(phase, elite) {
  return (c) => {
    // Six legs, three a side, bent at the knee; the phase flips the stride.
    c.strokeStyle = '#3d1166';
    c.lineWidth = 0.13;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const hipX = 0.42 - i * 0.42;
        const stride = (i % 2 === 0 ? phase : -phase) * 0.14;
        const kneeX = hipX + stride;
        const kneeY = side * 1.08;
        const footX = hipX + stride * 1.6;
        const footY = side * 1.3;
        c.beginPath();
        c.moveTo(hipX, side * 0.7);
        c.lineTo(kneeX, kneeY);
        c.lineTo(footX, footY);
        c.stroke();
        c.fillStyle = '#5e2490';
        c.beginPath();
        c.arc(kneeX, kneeY, 0.08, 0, TAU);
        c.fill();
      }
    }
    // The shell: a violet dome with a hot heart showing through the front.
    const shell = c.createRadialGradient(0.25, -0.3, 0.15, -0.05, 0, 1.1);
    shell.addColorStop(0, '#e0aaff');
    shell.addColorStop(0.5, COLORS.enemyBrute);
    shell.addColorStop(1, '#4a0e75');
    c.fillStyle = shell;
    c.beginPath();
    c.ellipse(-0.05, 0, 1.0, 0.94, 0, 0, TAU);
    c.fill();
    if (elite) {
      c.strokeStyle = 'rgba(255, 217, 122, 0.75)';
      c.lineWidth = 0.06;
      c.beginPath();
      c.ellipse(-0.05, 0, 1.0, 0.94, 0, 0, TAU);
      c.stroke();
    }
    // Plate seams: concentric arcs and radial splits, carved dark.
    c.strokeStyle = 'rgba(42, 10, 61, 0.5)';
    c.lineWidth = 0.06;
    for (const r of [0.36, 0.6, 0.83]) {
      c.beginPath();
      c.arc(-0.05, 0, r, -1.25, 1.25);
      c.stroke();
      c.beginPath();
      c.arc(-0.05, 0, r, Math.PI - 1.25, Math.PI + 1.25);
      c.stroke();
    }
    for (const a of [-0.7, 0, 0.7]) {
      c.beginPath();
      c.moveTo(-0.05 + Math.cos(a) * 0.36, Math.sin(a) * 0.36);
      c.lineTo(-0.05 + Math.cos(a) * 0.92, Math.sin(a) * 0.88);
      c.stroke();
    }
    // Glowing cracks: a wide violet under-stroke, then the white-hot core line.
    const cracks = [
      [[0.45, -0.5], [0.28, -0.2], [0.4, 0.05], [0.22, 0.3]],
      [[-0.35, -0.62], [-0.22, -0.34], [-0.38, -0.08]],
      [[-0.55, 0.35], [-0.34, 0.44], [-0.2, 0.62]],
    ];
    for (const pass of [0, 1]) {
      c.strokeStyle = pass ? '#fbeeff' : 'rgba(224, 170, 255, 0.55)';
      c.lineWidth = pass ? 0.04 : 0.11;
      for (const crack of cracks) {
        c.beginPath();
        crack.forEach(([x, y], i) => (i === 0 ? c.moveTo(x, y) : c.lineTo(x, y)));
        c.stroke();
      }
    }
    // The core, burning in the shell's split — brighter on the pulse frame.
    glowDot(c, -0.05, 0, 0.3, 'rgba(255, 120, 246, 0.6)');
    c.fillStyle = '#2a0a3d';
    c.beginPath();
    c.arc(-0.05, 0, 0.27, 0, TAU);
    c.fill();
    c.fillStyle = phase > 0 ? '#ffe9fb' : '#f3a6ff';
    c.beginPath();
    c.arc(-0.05, 0, 0.16, 0, TAU);
    c.fill();
    // The horned head, thrusting out from under the shell's rim.
    c.fillStyle = '#2a0a3d';
    c.beginPath();
    c.arc(0.82, 0, 0.33, 0, TAU);
    c.fill();
    c.strokeStyle = '#d9b8ff';
    c.lineWidth = 0.1;
    for (const side of [-1, 1]) {
      c.beginPath();
      c.moveTo(0.88, side * 0.18);
      c.quadraticCurveTo(1.2, side * 0.3, 1.34, side * 0.52);
      c.stroke();
    }
    glowDot(c, 0.9, -0.12, 0.05, '#ff5d8f');
    glowDot(c, 0.9, 0.12, 0.05, '#ff5d8f');
    if (elite) drawCirclet(c, 0.82, 0, 0.42);
  };
}

// --- The Watcher (spitter) -------------------------------------------------------
// A floating eyeball horror: one huge veined eye (the pupil is drawn live so it
// can track the warden), nerve-tentacles trailing behind, and three small
// satellite eyes riding stalks around it. Two frames wave the tails.

function drawWatcher(frame, elite) {
  return (c) => {
    // Nerve-tentacles trailing off the back and underside.
    const wave = frame === 0 ? 1 : -1;
    for (let i = 0; i < 5; i++) {
      const spread = (i - 2) * 0.34;
      const sx = -0.55 - Math.abs(spread) * 0.2;
      const sy = spread * 1.4;
      c.strokeStyle = i % 2 ? '#a1127c' : '#c22a96';
      c.lineWidth = 0.13;
      c.beginPath();
      c.moveTo(sx, sy);
      c.quadraticCurveTo(-1.05, sy + wave * 0.22, -1.42, sy * 1.5 + wave * 0.3);
      c.stroke();
      c.fillStyle = '#ff8ae2';
      c.beginPath();
      c.arc(-1.42, sy * 1.5 + wave * 0.3, 0.055, 0, TAU);
      c.fill();
    }
    // Satellite eyes on stalks, at frame-shifted points of their orbit.
    const baseA = frame === 0 ? 0.5 : 1.05;
    for (let i = 0; i < 3; i++) {
      const a = baseA + (i / 3) * TAU;
      const ex = Math.cos(a) * 1.22;
      const ey = Math.sin(a) * 1.22;
      c.strokeStyle = '#a1127c';
      c.lineWidth = 0.06;
      c.beginPath();
      c.moveTo(Math.cos(a) * 0.85, Math.sin(a) * 0.85);
      c.lineTo(ex, ey);
      c.stroke();
      c.fillStyle = '#ffd7f4';
      c.beginPath();
      c.arc(ex, ey, 0.16, 0, TAU);
      c.fill();
      c.fillStyle = '#2b021e';
      c.beginPath();
      c.arc(ex + Math.cos(a) * 0.05, ey + Math.sin(a) * 0.05, 0.075, 0, TAU);
      c.fill();
    }
    // The great eye itself: veined sclera rolling into a magenta iris.
    const sclera = c.createRadialGradient(0, 0, 0.3, 0, 0, 0.95);
    sclera.addColorStop(0, '#ffd7f4');
    sclera.addColorStop(0.55, '#ff8ae2');
    sclera.addColorStop(1, '#8f116e');
    c.fillStyle = sclera;
    c.beginPath();
    c.arc(0, 0, 0.92, 0, TAU);
    c.fill();
    c.strokeStyle = 'rgba(140, 8, 74, 0.55)';
    c.lineWidth = 0.035;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.4;
      c.beginPath();
      c.moveTo(Math.cos(a) * 0.88, Math.sin(a) * 0.88);
      c.quadraticCurveTo(
        Math.cos(a + 0.2) * 0.66, Math.sin(a + 0.2) * 0.66,
        Math.cos(a - 0.12) * 0.45, Math.sin(a - 0.12) * 0.45,
      );
      c.stroke();
    }
    const iris = c.createRadialGradient(0, 0, 0.05, 0, 0, 0.42);
    iris.addColorStop(0, '#ff8ae2');
    iris.addColorStop(0.7, COLORS.enemySpitter);
    iris.addColorStop(1, '#7c0d5c');
    c.fillStyle = iris;
    c.beginPath();
    c.arc(0, 0, 0.42, 0, TAU);
    c.fill();
    c.strokeStyle = '#4a0636';
    c.lineWidth = 0.05;
    c.beginPath();
    c.arc(0, 0, 0.42, 0, TAU);
    c.stroke();
    if (elite) {
      c.strokeStyle = 'rgba(255, 217, 122, 0.85)';
      c.lineWidth = 0.08;
      c.beginPath();
      c.arc(0, 0, 0.97, 0, TAU);
      c.stroke();
    }
  };
}

// --- The Hollow King (boss) ------------------------------------------------------
// A tall robed skeleton king, drawn facing the viewer: gem-tipped crown, bone
// skull, pauldrons, long skeletal arms — one holding a sceptered orb — an exposed
// ribcage around a dark burning heart, and a tattered robe. Two frames sway the
// robe's hem. The heart sits at HOLLOW_HEART in unit space; render.js turns live
// swirl arcs over it.

// Where the King's heart burns, in sprite units — render.js animates over it.
export const HOLLOW_HEART = { x: 0, y: -0.12 };

function drawKing(sway) {
  return (c) => {
    // The robe: shoulders flaring to a torn hem.
    const robe = c.createLinearGradient(0, -1, 0, 2.1);
    robe.addColorStop(0, '#5c1440');
    robe.addColorStop(0.5, '#38081f');
    robe.addColorStop(1, '#18040f');
    c.fillStyle = robe;
    c.beginPath();
    c.moveTo(-0.8, -0.92);
    c.quadraticCurveTo(0, -1.12, 0.8, -0.92);
    c.lineTo(1.08 + sway * 0.4, 1.55);
    // The torn hem: alternating points and notches on the way back.
    const hem = [2.08, 1.78, 2.14, 1.84, 2.1, 1.8, 2.12];
    for (let i = 0; i < hem.length; i++) {
      const x = 1.08 - (i / (hem.length - 1)) * 2.16 + sway * (0.4 - i * 0.12);
      c.lineTo(x, hem[i]);
    }
    c.lineTo(-1.08 + sway * 0.4, 1.55);
    c.closePath();
    c.fill();
    // Robe shading at the edges, and the gold trim down its front.
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath();
    c.moveTo(-0.8, -0.92);
    c.lineTo(-1.08 + sway * 0.4, 1.55);
    c.lineTo(-0.78 + sway * 0.4, 1.6);
    c.lineTo(-0.52, -0.8);
    c.closePath();
    c.fill();
    c.strokeStyle = 'rgba(255, 217, 122, 0.5)';
    c.lineWidth = 0.045;
    for (const side of [-1, 1]) {
      c.beginPath();
      c.moveTo(side * 0.2, -0.72);
      c.quadraticCurveTo(side * 0.3, 0.4, side * (0.42 - sway * 0.2), 1.85);
      c.stroke();
    }
    // Skeletal arms: bone segments with round joints, clawed hands.
    const bone = '#ddd3b8';
    for (const side of [-1, 1]) {
      const elbow = { x: side * 1.14, y: 0.02 };
      const hand = { x: side * 1.04, y: 0.88 };
      c.strokeStyle = bone;
      c.lineWidth = 0.12;
      c.beginPath();
      c.moveTo(side * 0.78, -0.78);
      c.lineTo(elbow.x, elbow.y);
      c.lineTo(hand.x, hand.y);
      c.stroke();
      c.fillStyle = bone;
      for (const j of [{ x: side * 0.78, y: -0.78 }, elbow, hand]) {
        c.beginPath();
        c.arc(j.x, j.y, 0.085, 0, TAU);
        c.fill();
      }
      // Claws.
      c.lineWidth = 0.05;
      for (let f = -1; f <= 1; f++) {
        c.beginPath();
        c.moveTo(hand.x, hand.y + 0.05);
        c.lineTo(hand.x + f * 0.13, hand.y + 0.32);
        c.stroke();
      }
    }
    // The sceptre in his right hand: dark gold shaft, a caged rose gem.
    c.strokeStyle = '#8a6a26';
    c.lineWidth = 0.07;
    c.beginPath();
    c.moveTo(1.04, -0.55);
    c.lineTo(1.04, 1.55);
    c.stroke();
    glowDot(c, 1.04, -0.68, 0.15, 'rgba(255, 93, 143, 0.65)');
    c.fillStyle = '#ff5d8f';
    c.beginPath();
    c.arc(1.04, -0.68, 0.14, 0, TAU);
    c.fill();
    c.strokeStyle = COLORS.bossCrown;
    c.lineWidth = 0.04;
    c.beginPath();
    c.arc(1.04, -0.68, 0.19, 0, TAU);
    c.stroke();
    c.beginPath();
    c.moveTo(1.04, -0.95);
    c.lineTo(1.04, -0.87);
    c.stroke();
    // Pauldrons: dark shells with gold rims on each shoulder.
    for (const side of [-1, 1]) {
      c.fillStyle = '#2a0a20';
      c.beginPath();
      c.arc(side * 0.8, -0.86, 0.26, Math.PI, 0);
      c.closePath();
      c.fill();
      c.strokeStyle = 'rgba(255, 217, 122, 0.6)';
      c.lineWidth = 0.04;
      c.beginPath();
      c.arc(side * 0.8, -0.86, 0.26, Math.PI, 0);
      c.stroke();
    }
    // The ribcage: pale arcs curving out from the spine, rib by rib.
    c.strokeStyle = '#e6dcc0';
    c.lineWidth = 0.075;
    for (let i = 0; i < 4; i++) {
      const ry = -0.52 + i * 0.23;
      const reach = 0.54 - i * 0.05;
      for (const side of [-1, 1]) {
        c.beginPath();
        c.moveTo(0, ry);
        c.quadraticCurveTo(side * reach, ry + 0.02, side * reach * 0.92, ry + 0.19);
        c.stroke();
      }
    }
    // Vertebrae down the spine.
    c.fillStyle = '#cbbd97';
    for (let i = 0; i < 5; i++) {
      c.beginPath();
      c.arc(0, -0.62 + i * 0.21, 0.055, 0, TAU);
      c.fill();
    }
    // The heart void: a dark mouth in the chest with a magenta coal inside.
    glowDot(c, HOLLOW_HEART.x, HOLLOW_HEART.y, 0.3, 'rgba(227, 61, 110, 0.6)');
    c.fillStyle = '#12020a';
    c.beginPath();
    c.arc(HOLLOW_HEART.x, HOLLOW_HEART.y, 0.27, 0, TAU);
    c.fill();
    c.fillStyle = '#ff5d8f';
    c.beginPath();
    c.arc(HOLLOW_HEART.x, HOLLOW_HEART.y, 0.11, 0, TAU);
    c.fill();
    // The skull: a bone cranium, a squared jaw, teeth, and burning sockets.
    const skull = c.createLinearGradient(0, -1.85, 0, -0.7);
    skull.addColorStop(0, '#f4eedd');
    skull.addColorStop(1, '#c9b98f');
    c.fillStyle = skull;
    c.beginPath();
    c.ellipse(0, -1.3, 0.42, 0.47, 0, 0, TAU);
    c.fill();
    c.fillRect(-0.26, -1.12, 0.52, 0.34);
    c.strokeStyle = 'rgba(90, 74, 40, 0.6)';
    c.lineWidth = 0.035;
    for (let i = -1; i <= 1; i++) {
      c.beginPath();
      c.moveTo(i * 0.13, -1.1);
      c.lineTo(i * 0.13, -0.8);
      c.stroke();
    }
    c.beginPath();
    c.moveTo(-0.26, -0.95);
    c.lineTo(0.26, -0.95);
    c.stroke();
    // Nasal cavity and eye sockets.
    c.fillStyle = '#16030c';
    c.beginPath();
    c.moveTo(0, -1.22);
    c.lineTo(0.07, -1.05);
    c.lineTo(-0.07, -1.05);
    c.closePath();
    c.fill();
    for (const side of [-1, 1]) {
      c.beginPath();
      c.ellipse(side * 0.17, -1.34, 0.105, 0.135, 0, 0, TAU);
      c.fill();
      glowDot(c, side * 0.17, -1.34, 0.045, '#ff5d8f');
    }
    // The crown: a gold band and five gem-tipped spikes, the centre tallest.
    const crownGrad = c.createLinearGradient(0, -2.25, 0, -1.6);
    crownGrad.addColorStop(0, '#fff3c4');
    crownGrad.addColorStop(0.55, COLORS.bossCrown);
    crownGrad.addColorStop(1, '#c78d1d');
    c.fillStyle = crownGrad;
    c.beginPath();
    const spikeBase = -1.72;
    const spikes = [[-0.44, 0.28], [-0.22, 0.4], [0, 0.52], [0.22, 0.4], [0.44, 0.28]];
    c.moveTo(-0.48, spikeBase + 0.14);
    for (const [sx, h] of spikes) {
      c.lineTo(sx - 0.07, spikeBase + 0.12);
      c.lineTo(sx, spikeBase - h);
      c.lineTo(sx + 0.07, spikeBase + 0.12);
    }
    c.lineTo(0.48, spikeBase + 0.14);
    c.lineTo(0.48, spikeBase + 0.3);
    c.lineTo(-0.48, spikeBase + 0.3);
    c.closePath();
    c.fill();
    const tipGems = ['#2ee6c8', '#ff5d8f', '#9be7ff', '#ff5d8f', '#2ee6c8'];
    spikes.forEach(([sx, h], i) => {
      c.fillStyle = tipGems[i];
      c.beginPath();
      c.arc(sx, spikeBase - h, 0.05, 0, TAU);
      c.fill();
    });
    glowDot(c, 0, spikeBase + 0.21, 0.07, '#ff5d8f');
  };
}

// --- The baked sets --------------------------------------------------------------

let sets = null;

export function initSprites() {
  if (sets) return sets;
  sets = {
    player: makeSet(3.8, 3.4, [drawWarden(0.07), drawWarden(-0.07)]),
    moth: {
      normal: makeSet(3.1, 3.2, [drawMoth(-0.55, false), drawMoth(0, false), drawMoth(0.55, false)]),
      elite: makeSet(3.1, 3.2, [drawMoth(-0.55, true), drawMoth(0, true), drawMoth(0.55, true)]),
    },
    darter: {
      normal: makeSet(2.9, 3.0, [drawDarter(0, false), drawDarter(1, false)]),
      elite: makeSet(2.9, 3.0, [drawDarter(0, true), drawDarter(1, true)]),
    },
    brute: {
      normal: makeSet(3.0, 2.9, [drawBrute(1, false), drawBrute(-1, false)]),
      elite: makeSet(3.0, 2.9, [drawBrute(1, true), drawBrute(-1, true)]),
    },
    spitter: {
      normal: makeSet(3.1, 3.1, [drawWatcher(0, false), drawWatcher(1, false)]),
      elite: makeSet(3.1, 3.1, [drawWatcher(0, true), drawWatcher(1, true)]),
    },
    boss: makeSet(3.6, 4.9, [drawKing(0.05), drawKing(-0.05)], BOSS_UNIT),
  };
  return sets;
}

export function getSprites() {
  return sets ?? initSprites();
}

// --- Lumen shards ---------------------------------------------------------------
// One baked shard — glow, gradient diamond and white core — blitted at either
// size. It replaces a per-shard gradient and glow pass in the frame loop, which
// mattered once a boss fight had a hundred shards on the floor.

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
