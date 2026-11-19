// tracer.js — bullet tracer: the bright yellow line from the muzzle to the
// hit point when Dario shoots on foot. Pure state (Node-testable, no
// three.js) plus a THREE.Line view. A tracer is very brief — about two
// frames — so it reads as a flash, not a lingering beam.
import * as THREE from '../../vendor/three/three.module.min.js';

// A tracer lives ~2 frames at 60 fps.
export const TRACER_LIFETIME = 2 / 60;
// The tracer colour: bright warm yellow.
export const TRACER_COLOUR = 0xffe9a8;

// makeTracerState() — fresh tracer: idle, no endpoints, no life left.
export function makeTracerState() {
  return {
    active: false,
    from: { x: 0, y: 0, z: 0 },
    to: { x: 0, y: 0, z: 0 },
    life: 0,
  };
}

// fireTracer(state, from, to) — light a tracer from the muzzle `from` to
// the hit point `to` (both { x, y, z }). Overwrites any tracer still live:
// one shot, one line.
export function fireTracer(state, from, to) {
  state.active = true;
  state.from = { x: from.x, y: from.y, z: from.z };
  state.to = { x: to.x, y: to.y, z: to.z };
  state.life = TRACER_LIFETIME;
  return state;
}

// stepTracer(state, dt) — age the tracer; it goes idle once its ~2 frames
// are up. Returns true while the tracer is still visible.
export function stepTracer(state, dt) {
  if (!state.active) return false;
  state.life -= dt;
  if (state.life <= 0) {
    state.active = false;
    state.life = 0;
    return false;
  }
  return true;
}

// tracerVisible(state) — true only during the tracer's brief life.
export function tracerVisible(state) {
  return state.active && state.life > 0;
}

// makeTracerView() — a two-point THREE.Line in bright yellow, hidden until
// a shot fires it. One draw call, no texture, no per-frame allocation.
export function makeTracerView() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const mat = new THREE.LineBasicMaterial({
    color: TRACER_COLOUR,
    transparent: true,
    opacity: 0.95,
    fog: false,
  });
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false;
  line.visible = false;
  return line;
}

// syncTracerView(view, state) — copy the live tracer endpoints into the
// line, or hide the line when no tracer is live.
export function syncTracerView(view, state) {
  if (!tracerVisible(state)) {
    view.visible = false;
    return;
  }
  const pos = view.geometry.attributes.position.array;
  pos[0] = state.from.x; pos[1] = state.from.y; pos[2] = state.from.z;
  pos[3] = state.to.x; pos[4] = state.to.y; pos[5] = state.to.z;
  view.geometry.attributes.position.needsUpdate = true;
  view.material.opacity = 0.95 * Math.max(0, state.life / TRACER_LIFETIME);
  view.visible = true;
}
