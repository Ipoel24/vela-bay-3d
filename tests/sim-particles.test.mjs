// sim-particles.test.mjs — Node tests for crash / bullet-hit / ped-down
// particle bursts (view/particles.js). Run: node tests/sim-particles.test.mjs
import * as THREE from '../game/vendor/three/three.module.min.js';
import {
  makeBurstPool, spawnBurst, stepBursts, burstAlive,
  makeBurstView, syncBurstView,
  BURST_LIFETIME, BURST_COUNT, BURST_POOL_CAP,
} from '../game/src/view/particles.js';

let passed = 0;
let failed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`ok - ${name}`); }
  else { failed++; console.log(`FAIL - ${name}${extra ? ' — ' + extra : ''}`); }
}

function stepPool(pool, seconds) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) stepBursts(pool, 1 / 60);
}

// 1. A fresh pool is empty and capped at 96.
{
  const pool = makeBurstPool();
  check('fresh burst pool is empty', burstAlive(pool) === 0);
  check('burst pool cap is 96', pool.cap === BURST_POOL_CAP);
}
// 2. A crash burst spawns sparks.
{
  const pool = makeBurstPool();
  const added = spawnBurst(pool, 200, 0.8, 140);
  check('crash burst spawns 24 sparks', added === BURST_COUNT && burstAlive(pool) === BURST_COUNT);
}
// 3. Burst sparks start at the impact point.
{
  const pool = makeBurstPool();
  spawnBurst(pool, 200, 0.8, 140);
  const s = pool.sparks[0];
  check('sparks start at the impact point', s.x === 200 && Math.abs(s.z - 140) < 1e-9 && s.y >= 0.8);
}
// 4. Pool is bounded: 5 bursts of 24 never exceed the cap.
{
  const pool = makeBurstPool();
  for (let i = 0; i < 5; i++) spawnBurst(pool, 100 + i, 1, 100);
  check('pool stays bounded at the cap after 5 bursts', burstAlive(pool) === BURST_POOL_CAP, `got ${burstAlive(pool)}`);
}
// 5. A small custom cap is respected too.
{
  const pool = makeBurstPool(10);
  spawnBurst(pool, 100, 1, 100);
  check('custom cap of 10 respected', burstAlive(pool) === 10, `got ${burstAlive(pool)}`);
}
// 6. Sparks expire: nothing alive after 2 s (lifetime ~1.5 s).
{
  const pool = makeBurstPool();
  spawnBurst(pool, 200, 0.8, 140);
  stepPool(pool, 2);
  check('sparks expire within ~2 s', burstAlive(pool) === 0, `got ${burstAlive(pool)}`);
}
// 7. Sparks are still visible half a second in.
{
  const pool = makeBurstPool();
  spawnBurst(pool, 200, 0.8, 140);
  stepPool(pool, 0.5);
  check('sparks still alive at 0.5 s', burstAlive(pool) > 0, `got ${burstAlive(pool)}`);
}
// 8. No burst without an impact: an untouched pool stays empty.
{
  const pool = makeBurstPool();
  stepPool(pool, 3);
  check('no burst without an impact', burstAlive(pool) === 0);
}
// 9. Sparks fall under gravity (vertical speed drops over time).
{
  const pool = makeBurstPool();
  spawnBurst(pool, 200, 5, 140, { count: 1, speed: 0.1, up: 0 });
  const before = pool.sparks[0].vy;
  stepPool(pool, 0.5);
  const after = pool.sparks.length ? pool.sparks[0].vy : -99;
  check('sparks fall (vy decreases)', after < before, `vy ${before.toFixed(2)} -> ${after.toFixed(2)}`);
}
// 10. Sparks never sink below the ground.
{
  const pool = makeBurstPool();
  spawnBurst(pool, 200, 0.1, 140, { count: 4, speed: 1, up: 0 });
  stepPool(pool, 1);
  check('sparks stay above ground', pool.sparks.every((s) => s.y >= 0.05));
}
// 11. Custom burst count is honoured.
{
  const pool = makeBurstPool();
  const added = spawnBurst(pool, 200, 1, 140, { count: 10, speed: 4 });
  check('small hit burst spawns exactly 10 sparks', added === 10 && burstAlive(pool) === 10);
}
// 12. Burst view: Points cloud draws the live pool.
{
  const pool = makeBurstPool();
  spawnBurst(pool, 200, 0.8, 140, { count: 3, speed: 0.1, up: 0 });
  const view = makeBurstView(pool);
  check('burst view is a THREE.Points', view instanceof THREE.Points);
  syncBurstView(view, pool);
  const pos = view.geometry.attributes.position.array;
  check('burst view positions follow the pool', pos[0] === 200 && Math.abs(pos[2] - 140) < 1e-9);
  stepPool(pool, 2);
  syncBurstView(view, pool);
  check('burst view hides dead sparks underground', view.geometry.attributes.position.array[1] === -100);
}

console.log(failed === 0 ? `\n${passed} particle tests passed, 0 failed` : `\n${failed} PARTICLE TEST(S) FAILED (${passed} passed)`);
process.exit(failed === 0 ? 0 : 1);
