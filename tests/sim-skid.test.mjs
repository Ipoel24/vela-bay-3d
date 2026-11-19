// sim-skid.test.mjs — Node tests for handbrake skid marks (view/skidmarks.js).
// Run: node tests/sim-skid.test.mjs
import * as THREE from '../game/vendor/three/three.module.min.js';
import {
  makeSkidPool, shouldSkid, addSkidMark, addSkidPair, stepSkids,
  skidAlive, skidFade, makeSkidView, syncSkidView,
  SKID_POOL_CAP, SKID_FADE_SECONDS, SKID_MIN_SPEED,
} from '../game/src/view/skidmarks.js';

let passed = 0;
let failed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`ok - ${name}`); }
  else { failed++; console.log(`FAIL - ${name}${extra ? ' — ' + extra : ''}`); }
}

function stepPool(pool, seconds) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) stepSkids(pool, 1 / 60);
}

// 1. A fresh pool is empty and capped at ~48.
{
  const pool = makeSkidPool();
  check('fresh skid pool is empty', skidAlive(pool) === 0);
  check('skid pool cap is 48', pool.cap === SKID_POOL_CAP);
}
// 2. Marks lay down with handbrake + speed.
{
  check('handbrake at 15 m/s lays marks', shouldSkid(15, true) === true);
  check('handbrake at 40 m/s lays marks', shouldSkid(40, true) === true);
}
// 3. No marks at low speed, even with the handbrake held.
{
  check('no marks at 10 m/s (at the threshold)', shouldSkid(10, true) === false);
  check('no marks at 5 m/s', shouldSkid(5, true) === false);
  check('no marks standing still', shouldSkid(0, true) === false);
}
// 4. No marks without the handbrake, however fast.
{
  check('no marks coasting at 40 m/s', shouldSkid(40, false) === false);
  check('no marks braking without handbrake', shouldSkid(25, false) === false);
}
// 5. Reversing with the handbrake still lays marks (|speed| counts).
{
  check('handbrake in reverse at -15 m/s lays marks', shouldSkid(-15, true) === true);
}
// 6. One mark added lands at the given spot with the car heading.
{
  const pool = makeSkidPool();
  addSkidMark(pool, 200, 140, 1.2);
  check('one mark added', skidAlive(pool) === 1);
  check('mark keeps its position + heading', pool.marks[0].x === 200 && pool.marks[0].z === 140 && pool.marks[0].yaw === 1.2);
}
// 7. A rear-wheel pair adds two marks behind the car centre.
{
  const pool = makeSkidPool();
  const car = { x: 200, z: 200, yaw: 0 }; // facing +z: rear is -z
  addSkidPair(pool, car);
  check('a pair adds two marks', skidAlive(pool) === 2);
  check('pair sits behind the car centre', pool.marks.every((m) => Math.abs(m.z - 198.55) < 1e-9));
  check('pair straddles the centreline (one per wheel)', Math.abs(pool.marks[0].x - 200.85) < 1e-9 && Math.abs(pool.marks[1].x - 199.15) < 1e-9);
}
// 8. Pool cap respected: 60 marks collapse to 48.
{
  const pool = makeSkidPool();
  for (let i = 0; i < 60; i++) addSkidMark(pool, 100 + i, 100, 0);
  check('pool cap respected at 48', skidAlive(pool) === SKID_POOL_CAP, `got ${skidAlive(pool)}`);
}
// 9. Overflow drops the OLDEST marks first.
{
  const pool = makeSkidPool();
  for (let i = 0; i < 60; i++) addSkidMark(pool, 100 + i, 100, 0);
  check('oldest marks drop first', pool.marks[0].x === 112, `oldest x=${pool.marks[0].x}`);
  check('newest marks survive', pool.marks[pool.marks.length - 1].x === 159);
}
// 10. Marks fade: gone after ~9 s.
{
  const pool = makeSkidPool();
  addSkidMark(pool, 200, 140, 0);
  stepPool(pool, 9.5);
  check('marks fade out after ~9 s', skidAlive(pool) === 0, `got ${skidAlive(pool)}`);
}
// 11. Marks persist mid-fade.
{
  const pool = makeSkidPool();
  addSkidMark(pool, 200, 140, 0);
  stepPool(pool, 5);
  check('marks still there at 5 s', skidAlive(pool) === 1);
}
// 12. Fade factor runs 0 (fresh) to 1 (gone).
{
  const pool = makeSkidPool();
  addSkidMark(pool, 200, 140, 0);
  check('fresh mark fade is 0', skidFade(pool.marks[0]) === 0);
  stepPool(pool, 4.5);
  check('half-faded at 4.5 s', Math.abs(skidFade(pool.marks[0]) - 0.5) < 0.02, `got ${skidFade(pool.marks[0]).toFixed(2)}`);
}
// 13. Fade time constant is 9 s.
{
  check('skid fade time is 9 s', SKID_FADE_SECONDS === 9);
  check('skid min speed is 10 m/s', SKID_MIN_SPEED === 10);
}
// 14. View: InstancedMesh count follows the live pool.
{
  const pool = makeSkidPool();
  const view = makeSkidView(pool);
  check('skid view is an InstancedMesh', view instanceof THREE.InstancedMesh);
  check('skid view starts empty', view.count === 0);
  addSkidPair(pool, { x: 200, z: 200, yaw: 0 });
  addSkidMark(pool, 210, 210, 0.5);
  syncSkidView(view, pool);
  check('skid view count follows the pool', view.count === 3, `got ${view.count}`);
  stepPool(pool, 10);
  syncSkidView(view, pool);
  check('skid view empties when marks fade', view.count === 0);
}

console.log(failed === 0 ? `\n${passed} skid tests passed, 0 failed` : `\n${failed} SKID TEST(S) FAILED (${passed} passed)`);
process.exit(failed === 0 ? 0 : 1);
