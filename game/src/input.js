// Lumenfall Arena — input: keyboard state (held + pressed-this-frame) and mouse position.
// The game polls this module each frame instead of juggling events inside the loop, which
// keeps main.js readable. Movement keys are read by code ('KeyW', 'ArrowUp', ...).

const held = new Set();
const pressed = new Set();
const mouse = { x: 0, y: 0, down: false, clicked: false };

let firstGestureHook = null;

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
}

export function isDown(code) {
  return held.has(code);
}

// The movement vector from WASD or the arrow keys, normalized (not unit length when idle).
export function moveVector() {
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
