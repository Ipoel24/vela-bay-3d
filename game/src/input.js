// input.js — keyboard + mouse handling for VELA BAY 3D (WASD/arrows, E/R/G/F/P/M/B/Q, mouse aim + shoot).

// makeInput() — returns the input state for the game loop:
//   keys: held-key map by e.code (e.g. keys.KeyW)
//   mouse: { x, y, down, clicked } — clicked is a one-frame edge flag, set on
//     mousedown and cleared by the caller (clearClick) or consumeClick()
//   takePressed(): edge-triggered key codes pressed since the last call
//   consumeClick(): swallow the click that started the game (title click must
//     never fire the pistol on frame one)
//   clearClick(): clear the pending mouse click edge
//   isDown(code): held-state helper
// Clicks on #menu are ignored entirely: menu clicks never leak into the game
// as shots. Keydown repeats do not re-queue an action key.
export function makeInput() {
  const keys = {};
  const pressedQueue = [];
  // Edge-key queue cap: keys pressed while a menu is up must not pile up
  // and then fire all at once when play resumes — keep only the newest 8.
  const PRESSED_QUEUE_CAP = 8;
  const mouse = { x: 0, y: 0, down: false, clicked: false };
  let suppressUntil = 0;

  // True when the event target sits inside the menu overlay (or is a button):
  // those clicks belong to the menus, never to the game.
  function isMenuEvent(e) {
    const t = e.target;
    return !!(t && t.closest && (t.closest('#menu') || t.closest('button')));
  }

  function onKeyDown(e) {
    keys[e.code] = true;
    // Space / arrows would scroll the page; the game owns them.
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (!e.repeat) {
      pressedQueue.push(e.code);
      while (pressedQueue.length > PRESSED_QUEUE_CAP) pressedQueue.shift();
    }
  }

  function onKeyUp(e) {
    keys[e.code] = false;
  }

  function onMouseDown(e) {
    if (isMenuEvent(e)) return; // menu clicks never reach the game
    if (typeof performance !== 'undefined' && performance.now() < suppressUntil) return;
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.down = true;
    mouse.clicked = true;
  }

  function onMouseUp(e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.down = false;
  }

  function onMouseMove(e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  }

  function onBlur() {
    for (const k of Object.keys(keys)) keys[k] = false;
    mouse.down = false;
    mouse.clicked = false;
    // A stuck edge key (pressed, then alt-tab) must not fire when the
    // window regains focus.
    pressedQueue.length = 0;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('blur', onBlur);

  // takePressed() — drain the edge-triggered key queue (codes in press order).
  function takePressed() {
    if (pressedQueue.length === 0) return [];
    const out = pressedQueue.slice();
    pressedQueue.length = 0;
    return out;
  }

  // consumeClick() — swallow the click that started the game from the title
  // screen, and ignore any mouse-down for a short window after it, so the
  // starting click can never fire the pistol on frame one.
  function consumeClick() {
    mouse.clicked = false;
    mouse.down = false;
    if (typeof performance !== 'undefined') suppressUntil = performance.now() + 500;
  }

  // clearClick() — clear the pending click edge after the game loop read it.
  function clearClick() {
    mouse.clicked = false;
  }

  // isDown(code) — true while the key with this e.code is held.
  function isDown(code) {
    return !!keys[code];
  }

  return { keys, mouse, takePressed, consumeClick, clearClick, isDown };
}
