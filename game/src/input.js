// Lumenfall Arena — input: keyboard state (held + pressed-this-frame), mouse position,
// and, on touch devices, a dynamic-origin virtual joystick plus a dash button.
// The game polls this module each frame instead of juggling events inside the loop, which
// keeps main.js readable. Movement keys are read by code ('KeyW', 'ArrowUp', ...); the
// joystick feeds the very same moveVector() the keyboard uses, and the dash button holds
// the very same 'Space' the keyboard sets, so game logic never learns which drove it.

const held = new Set();
const pressed = new Set();
const mouse = { x: 0, y: 0, down: false, clicked: false };

let firstGestureHook = null;
let canvasRef = null;

// --- Touch controls ------------------------------------------------------------
// Geometry of the on-screen controls, in canvas pixels. The stick appears wherever the
// left thumb lands on the arena's left half; the dash button is anchored bottom-right,
// clear of the DOM mute button that occupies the very corner below it.
const STICK_RADIUS = 52;   // drag distance at which the stick reads full tilt
const STICK_DEAD = 9;      // wobble room around the origin before the warden stirs
const STICK_KNOB = 23;
const DASH_RADIUS = 37;
const DASH_IN_X = 66;      // dash button centre, this far in from the right edge
const DASH_UP_Y = 118;     // ... and this far up from the bottom edge

const stick = { id: null, baseX: 0, baseY: 0, x: 0, y: 0 };
let dashTouchId = null;

let touchDeviceCache = null;
// Touch UI exists only where a finger is the pointer: a touch-capable screen or a
// coarse primary pointer. Cached — the answer cannot change mid-session.
export function isTouchDevice() {
  if (touchDeviceCache === null) {
    touchDeviceCache = 'ontouchstart' in window
      || (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches);
  }
  return touchDeviceCache;
}

function dashButton() {
  return {
    x: canvasRef.width - DASH_IN_X,
    y: canvasRef.height - DASH_UP_Y,
    r: DASH_RADIUS,
  };
}

// Register a callback fired on the first real key press or click (used to unlock WebAudio).
export function onFirstGesture(fn) {
  firstGestureHook = fn;
}

function gesture() {
  if (firstGestureHook) {
    const fn = firstGestureHook;
    firstGestureHook = null;
    fn();
  }
}

export function initInput(canvas) {
  canvasRef = canvas;
  window.addEventListener('keydown', (event) => {
    // Keep the page still: arrows and space would otherwise scroll it.
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
    if (!event.repeat) pressed.add(event.code);
    held.add(event.code);
    gesture();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', () => {
    held.clear();
    mouse.down = false;
    stick.id = null;
    dashTouchId = null;
  });
  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
  });
  canvas.addEventListener('mousedown', () => {
    mouse.down = true;
    mouse.clicked = true;
    gesture();
  });
  window.addEventListener('mouseup', () => {
    mouse.down = false;
  });

  // Touch handlers live on the canvas alone. The DOM menus layer above it, so a tap
  // on a button never reaches here, and a thumb on the arena never taps a button.
  // preventDefault (with passive: false) keeps a drag from scrolling, zooming, or
  // synthesising a mouse click on top of the touch.
  const toLocal = (touch) => {
    const rect = canvas.getBoundingClientRect();
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  };
  canvas.addEventListener('touchstart', (event) => {
    if (!isTouchDevice()) return;
    event.preventDefault();
    gesture();
    const dash = dashButton();
    for (const touch of event.changedTouches) {
      const p = toLocal(touch);
      const onDash = Math.hypot(p.x - dash.x, p.y - dash.y) <= dash.r + 14;
      if (onDash && dashTouchId === null) {
        dashTouchId = touch.identifier;
        held.add('Space');
      } else if (p.x < canvas.width / 2 && stick.id === null) {
        stick.id = touch.identifier;
        stick.baseX = stick.x = p.x;
        stick.baseY = stick.y = p.y;
      }
    }
  }, { passive: false });
  canvas.addEventListener('touchmove', (event) => {
    if (!isTouchDevice()) return;
    event.preventDefault();
    for (const touch of event.changedTouches) {
      if (touch.identifier === stick.id) {
        const p = toLocal(touch);
        stick.x = p.x;
        stick.y = p.y;
      }
    }
  }, { passive: false });
  const endTouch = (event) => {
    for (const touch of event.changedTouches) {
      if (touch.identifier === stick.id) stick.id = null;
      if (touch.identifier === dashTouchId) {
        dashTouchId = null;
        held.delete('Space');
      }
    }
  };
  canvas.addEventListener('touchend', endTouch);
  canvas.addEventListener('touchcancel', endTouch);
}

export function isDown(code) {
  return held.has(code);
}

// The movement vector from WASD or the arrow keys, normalized (not unit length when
// idle). While a thumb holds the stick it speaks instead: an analogue vector, silent
// inside the dead zone, reaching full tilt at the stick's rim.
export function moveVector() {
  if (stick.id !== null) {
    const dx = stick.x - stick.baseX;
    const dy = stick.y - stick.baseY;
    const mag = Math.hypot(dx, dy);
    if (mag <= STICK_DEAD) return { x: 0, y: 0 };
    const tilt = Math.min(1, (mag - STICK_DEAD) / (STICK_RADIUS - STICK_DEAD));
    return { x: (dx / mag) * tilt, y: (dy / mag) * tilt };
  }
  let x = 0;
  let y = 0;
  if (isDown('KeyA') || isDown('ArrowLeft')) x -= 1;
  if (isDown('KeyD') || isDown('ArrowRight')) x += 1;
  if (isDown('KeyW') || isDown('ArrowUp')) y -= 1;
  if (isDown('KeyS') || isDown('ArrowDown')) y += 1;
  if (x !== 0 && y !== 0) {
    const inv = Math.SQRT1_2;
    x *= inv;
    y *= inv;
  }
  return { x, y };
}

// What render.js needs to draw the touch controls, or null where fingers are not the
// pointer (desktop draws and plays exactly as before). The knob sits at the drag
// point clamped to the stick's rim.
export function getTouchUI() {
  if (!isTouchDevice() || !canvasRef) return null;
  const dash = dashButton();
  let stickView = null;
  if (stick.id !== null) {
    const dx = stick.x - stick.baseX;
    const dy = stick.y - stick.baseY;
    const mag = Math.hypot(dx, dy);
    const k = mag > 0 ? Math.min(mag, STICK_RADIUS) / mag : 0;
    stickView = {
      baseX: stick.baseX, baseY: stick.baseY, baseR: STICK_RADIUS,
      knobX: stick.baseX + dx * k, knobY: stick.baseY + dy * k, knobR: STICK_KNOB,
    };
  }
  return { dash: { ...dash, active: dashTouchId !== null }, stick: stickView };
}

export function wasPressed(code) {
  return pressed.has(code);
}

export function anyPressed(codes) {
  return codes.some((code) => pressed.has(code));
}

export function getMouse() {
  return mouse;
}

// Called at the very end of each frame: per-frame signals reset here.
export function endFrame() {
  pressed.clear();
  mouse.clicked = false;
}
