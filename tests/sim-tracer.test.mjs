// sim-tracer.test.mjs — Node tests for the bullet tracer (view/tracer.js).
// Run: node tests/sim-tracer.test.mjs
import * as THREE from '../game/vendor/three/three.module.min.js';
import {
  makeTracerState, fireTracer, stepTracer, tracerVisible,
  makeTracerView, syncTracerView, TRACER_LIFETIME, TRACER_COLOUR,
} from '../game/src/view/tracer.js';

let passed = 0;
let failed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`ok - ${name}`); }
  else { failed++; console.log(`FAIL - ${name}${extra ? ' — ' + extra : ''}`); }
}

const MUZZLE = { x: 200, y: 1.4, z: 140 };
const HIT = { x: 210, y: 1.0, z: 150 };

// 1. A fresh tracer is idle — nothing on screen before any shot.
{
  const t = makeTracerState();
  check('fresh tracer is inactive', t.active === false && tracerVisible(t) === false);
}
// 2. Firing a shot spawns a tracer with the right endpoints.
{
  const t = makeTracerState();
  fireTracer(t, MUZZLE, HIT);
  check('tracer spawns on shoot', t.active === true && tracerVisible(t) === true);
  check('tracer starts at the muzzle', t.from.x === 200 && t.from.y === 1.4 && t.from.z === 140);
  check('tracer ends at the hit point', t.to.x === 210 && t.to.y === 1.0 && t.to.z === 150);
}
// 3. The tracer is very brief: alive after 1 frame, gone after 2.
{
  const t = makeTracerState();
  fireTracer(t, MUZZLE, HIT);
  const afterOne = stepTracer(t, 1 / 60);
  check('tracer still visible after 1 frame', afterOne === true);
  const afterTwo = stepTracer(t, 1 / 60);
  check('tracer expires after ~2 frames', afterTwo === false && tracerVisible(t) === false);
}
// 4. No tracer when not shooting: stepping an idle tracer stays idle.
{
  const t = makeTracerState();
  check('no tracer without a shot', stepTracer(t, 1) === false && t.active === false);
}
// 5. A second shot overwrites the first tracer's endpoints.
{
  const t = makeTracerState();
  fireTracer(t, MUZZLE, HIT);
  fireTracer(t, { x: 201, y: 1.4, z: 141 }, { x: 190, y: 0.4, z: 130 });
  check('re-fire overwrites endpoints', t.to.x === 190 && t.to.z === 130 && t.life === TRACER_LIFETIME);
}
// 6. The tracer lifetime is ~2 frames at 60 fps.
{
  check('tracer lifetime is 2/60 s', Math.abs(TRACER_LIFETIME - 2 / 60) < 1e-9, `got ${TRACER_LIFETIME}`);
}
// 7. Tracer view: a bright yellow line, hidden until a shot fires it.
{
  const view = makeTracerView();
  check('tracer view is a THREE.Line', view instanceof THREE.Line);
  check('tracer colour is bright yellow 0xffe9a8', view.material.color.getHex() === TRACER_COLOUR);
  check('tracer view hidden before any shot', view.visible === false);
  const t = makeTracerState();
  fireTracer(t, MUZZLE, HIT);
  syncTracerView(view, t);
  check('tracer view shows on shoot', view.visible === true);
  const pos = view.geometry.attributes.position.array;
  check('tracer view endpoints match the shot', pos[0] === 200 && pos[3] === 210 && pos[5] === 150);
  stepTracer(t, 1 / 60);
  stepTracer(t, 1 / 60);
  syncTracerView(view, t);
  check('tracer view hides after expiry', view.visible === false);
}

console.log(failed === 0 ? `\n${passed} tracer tests passed, 0 failed` : `\n${failed} TRACER TEST(S) FAILED (${passed} passed)`);
process.exit(failed === 0 ? 0 : 1);
