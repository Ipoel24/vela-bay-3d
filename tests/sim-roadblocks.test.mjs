// sim-roadblocks.test.mjs — Node tests for VBPD roadblocks: the banner
// distance rule and the barrier view (view/roadblocks.js).
// Run: node tests/sim-roadblocks.test.mjs
import * as THREE from '../game/vendor/three/three.module.min.js';

// Minimal DOM stub: the stripe texture paints on a canvas. (Same shape as
// the view-smoke stub: every context call absorbs, every set succeeds.)
function makeCtx() {
  return new Proxy({}, {
    get(t, k) {
      if (k === 'createRadialGradient' || k === 'createLinearGradient') {
        return () => ({ addColorStop() {} });
      }
      return () => ({});
    },
    set() { return true; },
  });
}
function makeEl(tag) {
  return {
    tagName: (tag || 'div').toUpperCase(),
    style: {},
    children: [],
    className: '',
    textContent: '',
    width: 0,
    height: 0,
    appendChild(c) { this.children.push(c); return c; },
    getContext() { return makeCtx(); },
    setAttribute() {},
  };
}
globalThis.document = { createElement: (t) => makeEl(t) };

import {
  nearestRoadblockDistance, roadblockAhead,
  makeRoadblockView, syncRoadblockView,
  ROADBLOCK_BANNER_DIST, ROADBLOCK_POOL,
} from '../game/src/view/roadblocks.js';

let passed = 0;
let failed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`ok - ${name}`); }
  else { failed++; console.log(`FAIL - ${name}${extra ? ' — ' + extra : ''}`); }
}

// 1. No roadblocks: distance is Infinity, no banner.
{
  check('no blocks -> distance Infinity', nearestRoadblockDistance(200, 140, []) === Infinity);
  check('no blocks -> no banner', roadblockAhead(200, 140, []) === false);
  check('null blocks -> no banner', roadblockAhead(200, 140, null) === false);
}
// 2. Distance is the true straight-line distance (3-4-5 triangle).
{
  const blocks = [{ x: 203, z: 144, yaw: 0 }];
  check('nearest distance is exact (3-4-5)', nearestRoadblockDistance(200, 140, blocks) === 5);
}
// 3. Nearest of several blocks wins.
{
  const blocks = [
    { x: 300, z: 140, yaw: 0 },
    { x: 230, z: 140, yaw: 0 },
    { x: 260, z: 140, yaw: 0 },
  ];
  check('nearest of three blocks is 30 m', nearestRoadblockDistance(200, 140, blocks) === 30);
}
// 4. Banner shows inside 80 m.
{
  const blocks = [{ x: 250, z: 140, yaw: 0 }];
  check('banner shows at 50 m', roadblockAhead(200, 140, blocks) === true);
}
// 5. Banner hides beyond 80 m.
{
  const blocks = [{ x: 300, z: 140, yaw: 0 }];
  check('banner hides at 100 m', roadblockAhead(200, 140, blocks) === false);
}
// 6. Boundary: 79 m warns, 80 m does not.
{
  check('banner shows at 79 m', roadblockAhead(200, 140, [{ x: 279, z: 140, yaw: 0 }]) === true);
  check('banner hides at exactly 80 m', roadblockAhead(200, 140, [{ x: 280, z: 140, yaw: 0 }]) === false);
}
// 7. Banner distance constant is 80 m.
{
  check('banner distance is 80 m', ROADBLOCK_BANNER_DIST === 80);
}
// 8. View pools two barriers, both hidden until blocks exist.
{
  const view = makeRoadblockView();
  check('roadblock view is a Group', view instanceof THREE.Group);
  check('view pools 2 barriers', view.userData.barriers.length === ROADBLOCK_POOL);
  check('barriers start hidden', view.userData.barriers.every((b) => b.visible === false));
}
// 9. Sync with no blocks keeps everything hidden.
{
  const view = makeRoadblockView();
  syncRoadblockView(view, [], 0);
  check('sync with no blocks hides all', view.userData.barriers.every((b) => b.visible === false));
}
// 10. Sync with one block places one barrier on it.
{
  const view = makeRoadblockView();
  syncRoadblockView(view, [{ x: 250, z: 140, yaw: 1.2 }], 0);
  const shown = view.userData.barriers.filter((b) => b.visible);
  check('one block shows one barrier', shown.length === 1);
  check('barrier sits on the block', shown[0].position.x === 250 && shown[0].position.z === 140);
  check('barrier takes the block yaw', Math.abs(shown[0].rotation.y - 1.2) < 1e-9);
  check('second barrier stays hidden', view.userData.barriers.filter((b) => !b.visible).length === 1);
}
// 11. Sync with two blocks shows both.
{
  const view = makeRoadblockView();
  syncRoadblockView(view, [{ x: 250, z: 140, yaw: 0 }, { x: 300, z: 140, yaw: 0.5 }], 0);
  check('two blocks show two barriers', view.userData.barriers.every((b) => b.visible === true));
}
// 12. Clearing the blocks hides the barriers again.
{
  const view = makeRoadblockView();
  syncRoadblockView(view, [{ x: 250, z: 140, yaw: 0 }], 0);
  syncRoadblockView(view, [], 1);
  check('barriers hide when blocks clear', view.userData.barriers.every((b) => b.visible === false));
}
// 13. The beacon pulses with time.
{
  const view = makeRoadblockView();
  syncRoadblockView(view, [{ x: 250, z: 140, yaw: 0 }], 0);
  const o0 = view.userData.barriers[0].userData.beaconMat.opacity;
  syncRoadblockView(view, [{ x: 250, z: 140, yaw: 0 }], 0.3);
  const o1 = view.userData.barriers[0].userData.beaconMat.opacity;
  check('beacon opacity pulses over time', o0 !== o1, `opacity ${o0.toFixed(2)} -> ${o1.toFixed(2)}`);
}
// 14. The plank wears the hazard-stripe texture.
{
  const view = makeRoadblockView();
  const plank = view.userData.barriers[0].children[0];
  check('barrier plank has a stripe texture', !!(plank.material.map && plank.material.map.isTexture));
}

console.log(failed === 0 ? `\n${passed} roadblock tests passed, 0 failed` : `\n${failed} ROADBLOCK TEST(S) FAILED (${passed} passed)`);
process.exit(failed === 0 ? 0 : 1);
