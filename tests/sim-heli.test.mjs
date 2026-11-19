// sim-heli.test.mjs — Node tests for the VBPD helicopter (sim side in
// sim/police.js, view in view/heli.js). Run: node tests/sim-heli.test.mjs
import * as THREE from '../game/vendor/three/three.module.min.js';
import { makeRng } from '../game/src/sim/rng.js';
import { buildCity } from '../game/src/sim/city.js';
import { GAME_SEED } from '../game/src/config.js';
import { makePlayer } from '../game/src/sim/player.js';
import { makeWanted, stepPolice } from '../game/src/sim/police.js';
import { makeHeliMesh, syncHeliMesh, HELI_HEIGHT, SPOT_OPACITY } from '../game/src/view/heli.js';

let passed = 0;
let failed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`ok - ${name}`); }
  else { failed++; console.log(`FAIL - ${name}${extra ? ' — ' + extra : ''}`); }
}
const approx = (a, b, tol) => Math.abs(a - b) <= tol;

// Fresh game-shaped state (what main.js assembles).
function makeGame(stars) {
  const city = buildCity(GAME_SEED);
  const wanted = makeWanted();
  wanted.stars = stars;
  return {
    city,
    rng: makeRng(GAME_SEED),
    player: makePlayer(),
    police: [],
    wanted,
    roadblocks: [],
    heli: null,
    time: 0,
  };
}
function stepHeli(game, seconds) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) {
    stepPolice(game.police, 1 / 60, game.city, game.player, game);
    game.time += 1 / 60;
  }
}
function heliDist(game) {
  return Math.hypot(game.heli.x - game.player.x, game.heli.z - game.player.z);
}

// 1. No heli at wanted 0.
{
  const g = makeGame(0);
  stepHeli(g, 2);
  check('no heli at wanted 0', g.heli === null);
}
// 2. No heli at wanted 2.
{
  const g = makeGame(2);
  stepHeli(g, 2);
  check('no heli at wanted 2', g.heli === null);
}
// 3. Heli spawns at wanted 3.
{
  const g = makeGame(3);
  stepHeli(g, 1 / 60);
  check('heli spawns at wanted 3', g.heli !== null);
}
// 4. Heli despawns when wanted drops to 2.
{
  const g = makeGame(3);
  stepHeli(g, 1);
  check('heli present at wanted 3 before drop', g.heli !== null);
  g.wanted.stars = 2;
  stepHeli(g, 1 / 60);
  check('heli despawns at wanted 2', g.heli === null);
}
// 5. Heli despawns at wanted 0 too.
{
  const g = makeGame(4);
  stepHeli(g, 1);
  g.wanted.stars = 0;
  stepHeli(g, 1 / 60);
  check('heli despawns at wanted 0', g.heli === null);
}
// 6. Orbit radius is ~30 m.
{
  const g = makeGame(3);
  stepHeli(g, 5);
  check('heli orbits at ~30 m', approx(heliDist(g), 30, 1.5), `dist=${heliDist(g).toFixed(1)} m`);
}
// 7. Orbit radius holds over a longer chase.
{
  const g = makeGame(5);
  stepHeli(g, 20);
  check('heli still orbits at ~30 m after 20 s', approx(heliDist(g), 30, 1.5), `dist=${heliDist(g).toFixed(1)} m`);
}
// 8. Heli follows the player when the player moves.
{
  const g = makeGame(3);
  stepHeli(g, 2);
  g.player.x = 350;
  g.player.z = 300;
  const dTeleported = heliDist(g);
  stepHeli(g, 2);
  const dAfter = heliDist(g);
  check('heli follows the player (re-centres on the new spot)', dTeleported > 100 && approx(dAfter, 30, 1.5), `teleported=${dTeleported.toFixed(0)} m after=${dAfter.toFixed(1)} m`);
}
// 9. Roadblocks also appear at 3+ stars (same heat gate as the heli).
{
  const g = makeGame(3);
  stepHeli(g, 1 / 60);
  check('roadblocks appear at 3+ stars', g.roadblocks.length === 2, `got ${g.roadblocks.length}`);
}
// 10. Heli view: mesh is a Group with a rotor and a spotlight cone.
{
  const mesh = makeHeliMesh();
  check('heli mesh is a Group', mesh instanceof THREE.Group);
  check('heli mesh has a spinning rotor', !!mesh.userData.rotor);
  check('heli mesh has a spotlight pivot + cone material', !!(mesh.userData.spotPivot && mesh.userData.coneMat));
  const coneMat = mesh.userData.coneMat;
  check('spotlight cone is additive', coneMat.blending === THREE.AdditiveBlending);
  check('spotlight cone opacity is ~0.16', approx(coneMat.opacity, SPOT_OPACITY, 1e-9), `opacity=${coneMat.opacity}`);
}
// 11. Heli view: sync places the airframe 26 m up and aims the cone.
{
  const mesh = makeHeliMesh();
  syncHeliMesh(mesh, { x: 230, z: 140 }, { x: 200, z: 140 }, 1 / 60, 1);
  check('heli mesh sits at HELI_HEIGHT', mesh.position.y === HELI_HEIGHT && mesh.position.x === 230 && mesh.position.z === 140);
  check('heli mesh visible after sync', mesh.visible === true);
  check('spotlight brighter at night than by day', (() => {
    syncHeliMesh(mesh, { x: 230, z: 140 }, { x: 200, z: 140 }, 1 / 60, 1);
    const nightOp = mesh.userData.coneMat.opacity;
    syncHeliMesh(mesh, { x: 230, z: 140 }, { x: 200, z: 140 }, 1 / 60, 0);
    return nightOp > mesh.userData.coneMat.opacity;
  })());
}

console.log(failed === 0 ? `\n${passed} heli tests passed, 0 failed` : `\n${failed} HELI TEST(S) FAILED (${passed} passed)`);
process.exit(failed === 0 ? 0 : 1);
