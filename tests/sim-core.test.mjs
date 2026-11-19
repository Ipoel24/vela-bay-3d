// sim-core.test.mjs — plain-Node tests for the sim foundation (rng, city, vehicles, clock).
// Run: node tests/sim-core.test.mjs
import assert from 'node:assert/strict';
import { makeRng } from '../game/src/sim/rng.js';
import { buildCity, routeBetween, isInsideBuilding, segmentHitsBuilding, districtAt, interiorNodes, nearestNode, isBorderNode } from '../game/src/sim/city.js';
import { CAR_DEFS, makeCar, stepCar, damageCar, isWrecked } from '../game/src/sim/vehicles.js';
import { makeClock, tickClock, phaseOf, nightFactor, sunDir, moonDir, DAY_LENGTH_SECONDS, clockLabel, isNight, hoursMinutes } from '../game/src/sim/clock.js';
import { GAME_SEED, LANDMARKS } from '../game/src/config.js';

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`ok - ${name}`);
}
const approx = (a, b, tol) => Math.abs(a - b) <= tol;

// --- RNG determinism ---
check('rng: same seed gives the same sequence', () => {
  const a = makeRng(42);
  const b = makeRng(42);
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
  assert.equal(makeRng(7).int(1, 10), makeRng(7).int(1, 10));
  assert.equal(makeRng(7).pick(['a', 'b', 'c']), makeRng(7).pick(['a', 'b', 'c']));
});

// --- City determinism + districts ---
check('city: same seed builds the same city', () => {
  const a = buildCity(GAME_SEED);
  const b = buildCity(GAME_SEED);
  assert.equal(JSON.stringify(a.buildings), JSON.stringify(b.buildings));
  assert.equal(a.nodes.length, 121); // 11x11 intersections
  assert.equal(districtAt(225, 225), 'The Strip');
  assert.equal(districtAt(425, 200), 'Dockside');
  assert.equal(districtAt(100, 450), 'Old Marina');
});

// --- Routing ---
check('routeBetween (0,0)->(100,50) is x-first then z', () => {
  assert.deepEqual(routeBetween(null, 0, 0, 100, 50), [
    { x: 0, z: 0 }, { x: 100, z: 0 }, { x: 100, z: 50 },
  ]);
});
check('routeBetween same point is a single waypoint', () => {
  assert.deepEqual(routeBetween(null, 30, 40, 30, 40), [{ x: 30, z: 40 }]);
});
check('routeBetween straight along x has no z leg', () => {
  assert.deepEqual(routeBetween(null, 0, 50, 100, 50), [{ x: 0, z: 50 }, { x: 100, z: 50 }]);
});

// --- Mission points outside buildings; wheel AABB + reachable pickup ring ---
check('mission points are outside all buildings (M1 pickup centre excepted: it is the wheel itself)', () => {
  const city = buildCity(GAME_SEED);
  for (const [name, p] of Object.entries({
    'M3 drop (425,200)': LANDMARKS.m3Drop,
    'office (200,175)': LANDMARKS.office,
    'garage (150,125)': LANDMARKS.garage,
    'M1 drop (200,250)': LANDMARKS.m1Drop,
  })) {
    assert.equal(isInsideBuilding(city, p.x, p.z), false, name);
  }
  // M1 pickup (200,425) is the wheel centre: it sits inside the M5 wheel-base
  // collider by design, and is reached via its 12 m radius ring (see next test).
  const covering = city.buildings.filter(
    (b) => LANDMARKS.wheel.x >= b.minX && LANDMARKS.wheel.x <= b.maxX
      && LANDMARKS.wheel.z >= b.minZ && LANDMARKS.wheel.z <= b.maxZ,
  );
  assert.equal(covering.length, 1);
  assert.equal(covering[0].name, 'Boardwalk Wheel base');
});
check('wheel AABB exists and the M1 pickup ring (r=12) is reachable', () => {
  const city = buildCity(GAME_SEED);
  const wheel = city.buildings.find((b) => b.name === 'Boardwalk Wheel base');
  assert.ok(wheel, 'wheel base collider present');
  assert.ok(Math.abs(wheel.maxX - wheel.minX) <= 17, 'wheel half-width ~8 m');
  // Ring points at radius 12 around (200,425) must have reachable spots outside buildings.
  let reachable = 0;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const x = 200 + 12 * Math.cos(a);
    const z = 425 + 12 * Math.sin(a);
    if (!isInsideBuilding(city, x, z)) reachable++;
  }
  assert.ok(reachable >= 8, `only ${reachable}/16 ring points reachable`);
  assert.equal(isInsideBuilding(city, 200, 425), true, 'wheel centre itself is blocked');
});

// --- Line of sight (slab test) ---
check('segmentHitsBuilding: through the Spire hits, clear line misses', () => {
  const city = buildCity(GAME_SEED);
  assert.equal(segmentHitsBuilding(city, 225, 200, 225, 250), true); // through Spire 18x18
  assert.equal(segmentHitsBuilding(city, 0, 0, 0, 100), false); // along the west road
  assert.equal(segmentHitsBuilding(city, 100, 100, 100, 100), false); // zero-length, no building
});

// --- Car physics ---
function drive(model, seconds, input, dt = 1 / 60) {
  const city = buildCity(GAME_SEED);
  const car = makeCar(model, 100, 100, 0, 'player');
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) stepCar(car, input, dt, city);
  return car;
}
check('Cometa reaches ~50.9 m/s after 10 s full throttle', () => {
  const car = drive('cometa', 10, { throttle: 1, steer: 0, handbrake: false });
  assert.ok(approx(car.speed, 50.9, 0.6), `speed ${car.speed}`);
});
check('Cometa asymptotes to its 52 m/s top speed', () => {
  const car = drive('cometa', 30, { throttle: 1, steer: 0, handbrake: false });
  assert.ok(car.speed <= 52.01 && car.speed > 51.5, `speed ${car.speed}`);
});
check('reverse clamps at -20.8 m/s (-0.4 * top)', () => {
  const car = drive('cometa', 10, { throttle: -1, steer: 0, handbrake: false });
  assert.ok(approx(car.speed, -20.8, 0.6), `speed ${car.speed}`);
});
check('per-model drag: Brisa top is 38, not 52', () => {
  const car = drive('brisa', 30, { throttle: 1, steer: 0, handbrake: false });
  assert.ok(car.speed <= 38.01 && car.speed > 37.5, `speed ${car.speed}`);
});
check('deterministic step: same seed + inputs give the same state', () => {
  const a = drive('cometa', 5, { throttle: 1, steer: 0.3, handbrake: false });
  const b = drive('cometa', 5, { throttle: 1, steer: 0.3, handbrake: false });
  assert.deepEqual(
    { x: a.x, z: a.z, yaw: a.yaw, speed: a.speed },
    { x: b.x, z: b.z, yaw: b.yaw, speed: b.speed },
  );
});
check('building collision pushes the car out and damages on a hard hit', () => {
  const city = buildCity(GAME_SEED);
  const car = makeCar('cometa', 225, 200, 0, 'player'); // facing +z, straight at the Spire
  for (let i = 0; i < 600; i++) stepCar(car, { throttle: 1, steer: 0, handbrake: false }, 1 / 60, city);
  assert.ok(car.z < 216, `car stopped before Spire face, z=${car.z}`);
  assert.ok(car.condition < 100, `hard hit damaged car, condition=${car.condition}`);
});
check('damageCar armour scaling: lv3 armour cuts damage by 60%', () => {
  const plain = makeCar('cometa', 0, 0, 0, 'player');
  const armoured = makeCar('cometa', 0, 0, 0, 'player');
  armoured.armour = 3;
  damageCar(plain, 50);
  damageCar(armoured, 50);
  assert.equal(plain.health, 50);
  assert.ok(approx(armoured.health, 80, 0.01), `armoured health ${armoured.health}`);
  assert.equal(CAR_DEFS.cometa.top, 52);
});

// --- Clock ---
check('clock starts 08:00 day 1, phase morning; DAY_LENGTH_SECONDS is 600', () => {
  const clock = makeClock();
  assert.equal(DAY_LENGTH_SECONDS, 600);
  assert.equal(clock.minutes, 480);
  assert.equal(clock.day, 1);
  assert.equal(phaseOf(clock), 'morning');
});
check('tickClock advances on wall time and rolls the day over', () => {
  const clock = makeClock();
  for (let i = 0; i < 600; i++) tickClock(clock, 0.5); // 300 s wall = 12 game-hours -> 20:00
  assert.ok(approx(clock.minutes, 1200, 0.01), `minutes ${clock.minutes}`);
  assert.equal(phaseOf(clock), 'evening');
  const before = clock.minutes;
  tickClock(clock, 5); // 5 s raw -> capped to 0.5 s -> +1.2 min only
  assert.ok(approx(clock.minutes, before + 1.2, 0.01), `minutes ${clock.minutes}`);
  const c2 = { minutes: 1439, day: 3 };
  tickClock(c2, 0.5); // +1.2 min -> next day
  assert.equal(c2.day, 4);
});
check('nightFactor is continuous at the 5.5/7/17.5/19.5 boundaries', () => {
  for (const [h, expected] of [[5.5, 1], [7, 0], [17.5, 0], [19.5, 1]]) {
    const mk = (hh) => ({ minutes: hh * 60, day: 1 });
    assert.ok(approx(nightFactor(mk(h - 0.001)), expected, 0.01), `h=${h - 0.001}`);
    assert.ok(approx(nightFactor(mk(h + 0.001)), expected, 0.01), `h=${h + 0.001}`);
    assert.equal(nightFactor(mk(h)), expected);
  }
  assert.equal(nightFactor({ minutes: 12 * 60, day: 1 }), 0);
  assert.equal(nightFactor({ minutes: 0, day: 1 }), 1);
});
check('phases cover dawn/noon/sunset/night', () => {
  const mk = (h) => ({ minutes: h * 60, day: 1 });
  assert.equal(phaseOf(mk(6)), 'dawn');
  assert.equal(phaseOf(mk(12)), 'noon');
  assert.equal(phaseOf(mk(16)), 'afternoon');
  assert.equal(phaseOf(mk(18)), 'sunset');
  assert.equal(phaseOf(mk(23)), 'night');
  assert.equal(phaseOf(mk(3)), 'night');
});
check('sun rises east, peaks south at noon, sets west; moon is up at night', () => {
  const mk = (h) => ({ minutes: h * 60, day: 1 });
  const rise = sunDir(mk(6));
  const noon = sunDir(mk(12));
  const set = sunDir(mk(19));
  assert.ok(rise.x > 0.9, `sunrise x=${rise.x}`);
  assert.ok(noon.z > 0.5 && noon.y > 0.5, `noon z=${noon.z} y=${noon.y}`);
  assert.ok(set.x < -0.9, `sunset x=${set.x}`);
  const moon = moonDir(mk(0));
  assert.ok(moon.y > 0.5, `moon elevation at midnight, y=${moon.y}`);
  // Moon continuous across midnight: 23:59 vs 00:01 barely move.
  const a = moonDir(mk(23.983));
  const b = moonDir(mk(0.017));
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 0.05);
});

// --- Finisher additions: rng helpers, interior nodes, clock label, wrecked ---
check('rng: pickFiltered returns a matching element, null when nothing matches', () => {
  const rng = makeRng(99);
  const got = rng.pickFiltered([1, 2, 3, 4, 5], (n) => n > 3);
  assert.ok(got > 3, `got ${got}`);
  assert.equal(rng.pickFiltered([1, 2, 3], (n) => n > 10), null);
  assert.equal(rng.pickFiltered([], () => true), null);
});
check('rng: shuffle keeps every element, is deterministic per seed, never mutates', () => {
  const src = [1, 2, 3, 4, 5, 6, 7, 8];
  const a = makeRng(7).shuffle(src);
  const b = makeRng(7).shuffle(src);
  assert.deepEqual(a, b);
  assert.deepEqual([...a].sort((x, y) => x - y), src);
  assert.deepEqual(src, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.notDeepEqual(a, src, 'a shuffle that returns the input order is suspicious');
});
check('city: interior nodes are the 9x9 inner grid; border nodes are the rim', () => {
  const city = buildCity(GAME_SEED);
  assert.equal(city.nodes.length, 121);
  assert.equal(interiorNodes(city).length, 81, '9x9 interior intersections');
  assert.equal(isBorderNode({ x: 0, z: 250 }), true);
  assert.equal(isBorderNode({ x: 500, z: 500 }), true);
  assert.equal(isBorderNode({ x: 250, z: 250 }), false);
  assert.ok(interiorNodes(city).every((n) => !isBorderNode(n)));
});
check('city: nearestNode finds the closest intersection', () => {
  const city = buildCity(GAME_SEED);
  assert.deepEqual(nearestNode(city, 202, 198), { x: 200, z: 200 });
  assert.deepEqual(nearestNode(city, 149, 126), { x: 150, z: 150 });
  assert.equal(nearestNode({ nodes: [] }, 0, 0), null);
});
check('clock: clockLabel formats DAY/time/PHASE; isNight flips past halfway', () => {
  assert.equal(clockLabel({ minutes: 8 * 60 + 30, day: 1 }), 'DAY 1 · 08:30 · MORNING');
  assert.equal(clockLabel({ minutes: 18 * 60 + 30, day: 1 }), 'DAY 1 · 18:30 · SUNSET');
  assert.equal(clockLabel({ minutes: 21 * 60 + 30, day: 2 }), 'DAY 2 · 21:30 · EVENING');
  assert.equal(clockLabel(null), '');
  assert.deepEqual(hoursMinutes({ minutes: 1439 }), { h: 23, m: 59 });
  assert.deepEqual(hoursMinutes({ minutes: 99999 }), { h: 23, m: 59 }, 'clamped into the day');
  assert.equal(isNight({ minutes: 12 * 60, day: 1 }), false);
  assert.equal(isNight({ minutes: 0, day: 1 }), true);
  assert.equal(isNight({ minutes: 18 * 60 + 45, day: 1 }), true, 'night factor past 0.5 at 18:45');
});
check('vehicles: isWrecked is true only at 0% condition', () => {
  const car = makeCar('cometa', 200, 200, 0, 'player');
  assert.equal(isWrecked(car), false);
  car.condition = 1;
  assert.equal(isWrecked(car), false);
  car.condition = 0;
  assert.equal(isWrecked(car), true);
  assert.equal(isWrecked(null), true);
});

console.log(`\n${passed} tests passed, 0 failed`);
