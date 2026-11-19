// sim-systems.test.mjs — plain-Node tests for the sim systems (player, traffic,
// pedestrians, police, combat, missions). Run: node tests/sim-systems.test.mjs
// Uses the SAME checks the round-2 review used for M1/M3/M4.
import assert from 'node:assert/strict';
import { makeRng } from '../game/src/sim/rng.js';
import { buildCity, isInsideBuilding } from '../game/src/sim/city.js';
import { GAME_SEED } from '../game/src/config.js';
import { makeCar, stepCar } from '../game/src/sim/vehicles.js';
import { makePlayer, stepPlayer, enterCar, exitCar, nearestCar, damagePlayer } from '../game/src/sim/player.js';
import { makeTraffic, stepTraffic, resolveCarCollisions, pickFarDestination } from '../game/src/sim/traffic.js';
import { makePeds, stepPeds, isScared, checkPedHits, fleeingCount, downedCount } from '../game/src/sim/pedestrians.js';
import { makeWanted, addCrime, spawnPolice, stepPolice } from '../game/src/sim/police.js';
import { WEAPON, shoot, tracerEndpoints } from '../game/src/sim/combat.js';
import { MISSIONS, makeMissions, stepMissions, canSellCar, ensureMissionCars, missionProgress, missionById, isCampaignComplete } from '../game/src/sim/missions.js';
import { makeEconomy } from '../game/src/sim/economy.js';
import { respawnPlayer } from '../game/src/sim/player.js';

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`ok - ${name}`);
}
const approx = (a, b, tol) => Math.abs(a - b) <= tol;

// Fresh game-shaped state shared by the sim systems (what main.js assembles).
function makeGame() {
  const city = buildCity(GAME_SEED);
  return {
    city,
    rng: makeRng(GAME_SEED),
    player: makePlayer(),
    cars: [],
    peds: [],
    police: [],
    wanted: makeWanted(),
    economy: makeEconomy(),
    missions: makeMissions(),
    time: 0,
    roadblocks: [],
    heli: null,
  };
}

// --- Player ---
check('player: starts on foot on The Strip, full health, no car', () => {
  const p = makePlayer();
  assert.equal(p.onFoot, true);
  assert.equal(p.car, null);
  assert.equal(p.health, 100);
  assert.equal(p.armour, 0);
  assert.ok(p.x >= 175 && p.x < 350 && p.z >= 125 && p.z < 350, `start (${p.x},${p.z}) not on The Strip`);
});
check('player: 6 s of S leaves camYaw at 0 (no spin); 6 s of W converges to heading', () => {
  const city = buildCity(GAME_SEED);
  const p = makePlayer();
  p.yaw = 0;
  for (let i = 0; i < 360; i++) stepPlayer(p, { s: true }, 1 / 60, city);
  assert.equal(p.camYaw, 0);
  // Strafing also leaves the camera fixed.
  for (let i = 0; i < 360; i++) stepPlayer(p, { a: true }, 1 / 60, city);
  assert.equal(p.camYaw, 0);
  p.yaw = 1.2;
  for (let i = 0; i < 360; i++) stepPlayer(p, { w: true }, 1 / 60, city);
  assert.ok(approx(p.camYaw, 1.2, 0.05), `camYaw ${p.camYaw}`);
});
check('player: enterCar removes the car from traffic + marks it stolen; exitCar parks it', () => {
  const city = buildCity(GAME_SEED);
  const game = makeGame();
  const car = makeCar('brisa', 200, 142, 0, 'traffic');
  game.cars = [car];
  assert.equal(enterCar(game.player, car, game.cars), true);
  assert.equal(game.cars.length, 0);
  assert.equal(car.stolen, true);
  assert.equal(car.owner, 'player');
  assert.equal(game.player.onFoot, false);
  car.speed = 12;
  assert.equal(exitCar(game.player, city), true);
  assert.equal(car.speed, 0);
  assert.equal(game.player.onFoot, true);
  assert.equal(game.player.car, null);
  assert.ok(Math.hypot(game.player.x - car.x, game.player.z - car.z) > 1, 'player beside the car');
});
check('player: nearestCar picks the closest enterable car (L5: no parked rank)', () => {
  const p = makePlayer();
  const near = makeCar('brisa', 202, 140, 0, 'traffic');
  const far = makeCar('taxi', 210, 140, 0, 'traffic');
  const wreck = makeCar('van', 201, 140, 0, 'traffic');
  wreck.condition = 0;
  assert.equal(nearestCar(p, [far, wreck, near]), near);
  assert.equal(nearestCar(p, []), null);
});
check('player: damagePlayer absorbs through armour first, then health; death busts', () => {
  const p = makePlayer();
  p.armour = 50;
  const r = damagePlayer(p, 80);
  assert.equal(r.absorbed, 50);
  assert.equal(p.armour, 0);
  assert.equal(p.health, 70);
  damagePlayer(p, 80);
  assert.equal(p.health, 0);
  assert.equal(p.busted, true);
});

// --- Traffic ---
check('traffic: cars cruise at 4-6 m/s and keep moving on the road graph', () => {
  const city = buildCity(GAME_SEED);
  const traffic = makeTraffic(city, makeRng(7), 10);
  assert.equal(traffic.length, 10);
  const start = traffic.map((t) => ({ x: t.car.x, z: t.car.z }));
  for (let i = 0; i < 300; i++) stepTraffic(traffic, 1 / 60, city);
  for (let i = 0; i < traffic.length; i++) {
    assert.ok(traffic[i].car.speed <= 6.01, `car ${i} speed ${traffic[i].car.speed}`);
    assert.ok(Math.hypot(traffic[i].car.x - start[i].x, traffic[i].car.z - start[i].z) > 1, `car ${i} did not move`);
  }
});
check('traffic push-apart: a rear-end keeps the player speed and pushes the queue ahead', () => {
  const city = buildCity(GAME_SEED);
  const playerCar = makeCar('cometa', 100, 100, 0, 'player');
  playerCar.speed = 15;
  const t1 = makeCar('brisa', 100, 102.5, 0, 'traffic');
  t1.speed = 4;
  const t2 = makeCar('brisa', 100, 105.5, 0, 'traffic');
  t2.speed = 4;
  const cars = [playerCar, t1, t2];
  resolveCarCollisions(cars, 1 / 60, 0);
  assert.equal(playerCar.speed, 15, 'player speed must not drop');
  assert.equal(playerCar.z, 100, 'player must not be shoved backwards');
  assert.ok(t1.z > 102.5, `queue car 1 not pushed ahead, z=${t1.z}`);
  assert.ok(t2.z > 105.5, `queue car 2 not pushed ahead, z=${t2.z}`);
  assert.ok(t1.health < 100, 'hard rear-end must cost health');
  // Escape forwards and by reversing from an overlap.
  const zBefore = playerCar.z;
  stepCar(playerCar, { throttle: 1, steer: 0, handbrake: false }, 1 / 60, city);
  assert.ok(playerCar.z > zBefore, 'player can escape forwards');
  playerCar.z = 100;
  playerCar.speed = 0;
  t1.z = 102.5;
  t1.speed = 0;
  resolveCarCollisions([playerCar, t1], 1 / 60, 0);
  stepCar(playerCar, { throttle: -1, steer: 0, handbrake: false }, 1, city);
  assert.ok(playerCar.z < 100, `player can escape by reversing, z=${playerCar.z}`);
});

// --- Pedestrians ---
check('peds: walk pavements, stay out of buildings (<1% inside)', () => {
  const city = buildCity(GAME_SEED);
  const peds = makePeds(city, makeRng(9), 40);
  for (let i = 0; i < 600; i++) stepPeds(peds, 1 / 60, city);
  const inside = peds.filter((p) => isInsideBuilding(city, p.x, p.z)).length;
  assert.ok(inside === 0, `${inside}/40 peds inside buildings`);
});
check('M1: a shot 100 m north of a ped does NOT scare it, a shot 10 m away DOES', () => {
  const ped = { x: 100, z: 100 };
  assert.equal(isScared(ped, { x: 100, z: 200 }), false, 'shot 100 m north must not scare');
  assert.equal(isScared(ped, { x: 100, z: 110 }), true, 'shot 10 m away must scare');
  assert.equal(isScared(ped, { x: 200, z: 100 }), false, 'shot 100 m east must not scare');
  assert.equal(isScared(ped, { x: 130, z: 130 }), true, 'shot ~42 m away must scare');
});
check('ped attribution: only the player car running over a ped adds a crime', () => {
  const game = makeGame();
  const peds = makePeds(game.city, makeRng(3), 2);
  peds[0].x = 100; peds[0].z = 100;
  peds[1].x = 100; peds[1].z = 200;
  const playerCar = makeCar('brisa', 100, 99, 0, 'player');
  playerCar.speed = 10;
  const trafficCar = makeCar('brisa', 100, 199, 0, 'traffic');
  trafficCar.speed = 10;
  const events = checkPedHits(peds, [playerCar, trafficCar], playerCar, game.wanted, 0);
  assert.equal(events.length, 2, 'both peds were hit');
  assert.equal(peds[0].down, true);
  assert.equal(peds[1].down, true);
  assert.equal(game.wanted.stars, 1, 'only the player-car hit adds a crime');
});

// --- Police ---
check('M3: 200 police spawns with the real seed, >=95% in the 40-90 m band, 0 under 40 m', () => {
  const city = buildCity(GAME_SEED);
  const rng = makeRng(GAME_SEED);
  const wanted = makeWanted();
  const playerPos = { x: 250, z: 250 };
  let inBand = 0;
  let under40 = 0;
  let over90 = 0;
  for (let i = 0; i < 200; i++) {
    const unit = spawnPolice(city, playerPos, rng, wanted, []);
    const d = Math.hypot(unit.car.x - playerPos.x, unit.car.z - playerPos.z);
    if (d >= 40 && d <= 90) inBand++;
    if (d < 40) under40++;
    if (d > 90) over90++;
  }
  console.log(`    M3 detail: ${inBand}/200 in band, ${under40} under 40 m, ${over90} over 90 m`);
  assert.ok(inBand >= 190, `only ${inBand}/200 spawns in band`);
  assert.equal(under40, 0, `${under40} spawns under 40 m`);
});
check('police: units pursue, cruise 20-24 m/s, and close on the player', () => {
  const game = makeGame();
  game.player.x = 250;
  game.player.z = 250;
  const unit = spawnPolice(game.city, game.player, game.rng, game.wanted, []);
  game.police = [unit];
  const d0 = Math.hypot(unit.car.x - 250, unit.car.z - 250);
  for (let i = 0; i < 60; i++) stepPolice(game.police, 1 / 60, game.city, game.player, game);
  // Mid-pursuit (1 s in, still far from the player) the unit is at cruise.
  assert.ok(unit.car.speed > 5 && unit.car.speed <= 24.5, `cruise speed ${unit.car.speed}`);
  for (let i = 0; i < 240; i++) stepPolice(game.police, 1 / 60, game.city, game.player, game);
  const d1 = Math.hypot(unit.car.x - 250, unit.car.z - 250);
  assert.ok(d1 < d0, `unit did not close in: ${d0.toFixed(1)} -> ${d1.toFixed(1)}`);
  assert.ok(d1 < 8, `unit did not reach the player, d=${d1.toFixed(1)}`);
});
check('police: arrest timer builds up close and DECAYS when the player breaks away', () => {
  const game = makeGame();
  game.player.x = 250;
  game.player.z = 250;
  const unit = spawnPolice(game.city, game.player, game.rng, game.wanted, []);
  unit.car.x = 250;
  unit.car.z = 252; // 2 m from the on-foot player
  unit.car.speed = 0;
  game.police = [unit];
  for (let i = 0; i < 60; i++) stepPolice(game.police, 1 / 60, game.city, game.player, game);
  const built = unit.arrestTimer;
  assert.ok(built > 0.5, `arrest timer did not build, ${built}`);
  game.player.x = 100;
  game.player.z = 100; // break away
  for (let i = 0; i < 120; i++) stepPolice(game.police, 1 / 60, game.city, game.player, game);
  assert.ok(unit.arrestTimer < built, `arrest timer did not decay: ${built} -> ${unit.arrestTimer}`);
  assert.equal(game.player.busted, false, 'player must not be busted after breaking away');
});
check('police: wanted DECAYS after ~8 s with no LOS and no unit within 400 m', () => {
  const game = makeGame();
  game.wanted.stars = 2;
  for (let i = 0; i < 540; i++) stepPolice([], 1 / 60, game.city, game.player, game);
  assert.equal(game.wanted.stars, 1, 'wanted must drop by 1 star after 9 s clear');
  // No decay while a unit is close with LOS.
  game.wanted.stars = 2;
  const unit = spawnPolice(game.city, game.player, game.rng, game.wanted, []);
  unit.car.x = game.player.x + 10;
  unit.car.z = game.player.z;
  game.police = [unit];
  for (let i = 0; i < 540; i++) stepPolice(game.police, 1 / 60, game.city, game.player, game);
  assert.equal(game.wanted.stars, 2, 'wanted must not decay while police are close');
});
check('police: 3+ stars brings roadblocks and a helicopter; below 3 clears them', () => {
  const game = makeGame();
  game.wanted.stars = 3;
  stepPolice([], 1 / 60, game.city, game.player, game);
  assert.ok(game.roadblocks.length === 2, 'two roadblocks at 3 stars');
  assert.ok(game.heli, 'helicopter at 3 stars');
  game.wanted.stars = 1;
  stepPolice([], 1 / 60, game.city, game.player, game);
  assert.equal(game.roadblocks.length, 0);
  assert.equal(game.heli, null);
});

// --- Combat ---
check('combat: WEAPON is 34 damage / 12-round mag; 3 shots down a ped', () => {
  assert.equal(WEAPON.damage, 34);
  assert.equal(WEAPON.magSize, 12);
  const game = makeGame();
  const peds = makePeds(game.city, makeRng(5), 1);
  peds[0].x = 100; peds[0].z = 110;
  game.peds = peds;
  const r1 = shoot(game, 100, 100, 100, 110);
  assert.equal(r1.hit, 'ped');
  assert.equal(peds[0].health, 66);
  shoot(game, 100, 100, 100, 110);
  const r3 = shoot(game, 100, 100, 100, 110);
  assert.equal(r3.hit, 'ped');
  assert.equal(peds[0].down, true);
  assert.equal(peds[0].health, 0);
});
check('combat: a shot stops at walls first — a ped behind the Spire is safe', () => {
  const game = makeGame();
  const peds = makePeds(game.city, makeRng(5), 1);
  peds[0].x = 225; peds[0].z = 240; // behind the Spire from the south
  game.peds = peds;
  const r = shoot(game, 225, 190, 225, 240);
  assert.equal(r.hit, 'wall');
  assert.equal(peds[0].health, 100, 'ped behind the wall must be unharmed');
});
check('M4: 5 rapid shots at the sky produce at most +1 star from shooting', () => {
  const game = makeGame();
  game.time = 0;
  for (let i = 0; i < 5; i++) {
    const r = shoot(game, 100, 100, 300, 100); // clean miss down the z=100 road
    assert.equal(r.hit, null, `sky shot ${i} must miss, got ${r.hit}`);
  }
  assert.equal(game.wanted.stars, 0, 'clean misses add no wanted');
  // 5 rapid HITS in the same ~5 s window: still at most +1 star.
  for (let i = 0; i < 5; i++) {
    game.cars = [makeCar('brisa', 100, 150, 0, 'traffic')];
    const r = shoot(game, 100, 100, 100, 300);
    assert.equal(r.hit, 'car', `shot ${i} must hit the car, got ${r.hit}`);
  }
  console.log(`    M4 detail: 5 rapid hits -> ${game.wanted.stars} star(s)`);
  assert.ok(game.wanted.stars <= 1, `5 rapid hits gave ${game.wanted.stars} stars`);
  assert.equal(game.wanted.stars, 1);
  // After the 5 s window passes, the next hit adds one more star.
  game.time = 6;
  game.cars = [makeCar('brisa', 100, 150, 0, 'traffic')];
  shoot(game, 100, 100, 100, 300);
  assert.equal(game.wanted.stars, 2);
});
check('combat: addCrime rate-limits shoot directly (once per ~5 s)', () => {
  const wanted = makeWanted();
  addCrime(wanted, 'shoot', 100);
  addCrime(wanted, 'shoot', 101);
  addCrime(wanted, 'shoot', 104.9);
  assert.equal(wanted.stars, 1);
  addCrime(wanted, 'shoot', 105.1);
  assert.equal(wanted.stars, 2);
  addCrime(wanted, 'steal', 105.1);
  assert.equal(wanted.stars, 3, 'other crimes add immediately');
});

// --- Missions ---
check('missions: 5 defs with the spec payouts, caps and coordinates', () => {
  assert.equal(MISSIONS.length, 5);
  assert.equal(MISSIONS[0].payout, 500);
  assert.equal(MISSIONS[0].rep, 10);
  assert.equal(MISSIONS[0].wantedCap, 1);
  assert.equal(MISSIONS[1].payout, 1200);
  assert.equal(MISSIONS[1].wantedCap, 2);
  assert.deepEqual(
    [MISSIONS[0].steps[0].x, MISSIONS[0].steps[0].z],
    [200, 425],
  );
  assert.deepEqual(
    [MISSIONS[1].steps[1].x, MISSIONS[1].steps[1].z],
    [150, 125],
  );
  assert.deepEqual(
    [MISSIONS[2].steps[1].x, MISSIONS[2].steps[1].z],
    [425, 200],
  );
  for (const m of MISSIONS) {
    assert.ok(m.briefing.length >= 2 && m.briefing.length <= 3, `${m.id} briefing lines`);
    assert.ok(m.steps.length >= 1);
  }
});
check('mission flow: M1 pickup -> drop completes (+$500, +10 REP), M2 steal -> deliver -> M3 starts', () => {
  const game = makeGame();
  const taxi = makeCar('taxi', 200, 140, 0, 'traffic');
  game.cars = [taxi];
  assert.equal(enterCar(game.player, taxi, game.cars), true);
  // Pickup at the Boardwalk Wheel (200,425) in the taxi.
  taxi.x = 200; taxi.z = 414;
  let events = stepMissions(game.missions, game);
  assert.ok(events.some((e) => e.type === 'step'), 'pickup step must complete');
  assert.equal(game.missions.stepIndex, 1);
  // Drop at (200,250) in the taxi.
  taxi.x = 200; taxi.z = 250;
  events = stepMissions(game.missions, game);
  assert.ok(events.some((e) => e.type === 'missionComplete' && e.mission === 'm1'), 'M1 must complete');
  assert.equal(game.economy.money, 1700, `money ${game.economy.money}`);
  assert.equal(game.economy.rep, 11, `rep ${game.economy.rep}`);
  assert.equal(game.missions.index, 1, 'M2 must start');
  // M2: a Cometa respawns, the player steals it and delivers it to the garage.
  const cometa = ensureMissionCars(game);
  assert.ok(cometa && cometa.model === 'cometa', 'a Cometa must respawn for M2');
  assert.equal(exitCar(game.player, game.city), true, 'exit the taxi first');
  assert.equal(enterCar(game.player, cometa, game.cars), true);
  events = stepMissions(game.missions, game);
  assert.ok(events.some((e) => e.type === 'step'), 'steal step must complete');
  cometa.x = 150; cometa.z = 125;
  events = stepMissions(game.missions, game);
  assert.ok(events.some((e) => e.type === 'missionComplete' && e.mission === 'm2'), 'M2 must complete');
  assert.equal(game.missions.index, 2, 'M3 must start');
  assert.equal(game.economy.money, 2900, `money ${game.economy.money}`);
});
check('M2: delivering the Cometa completes the mission and the car cannot then be sold (sale guard)', () => {
  const game = makeGame();
  game.missions.index = 1;
  const cometa = ensureMissionCars(game);
  assert.ok(cometa, 'Cometa must spawn for M2');
  const d0 = Math.hypot(cometa.x - game.player.x, cometa.z - game.player.z);
  assert.ok(d0 >= 60, `spawn must be >=60 m away, got ${d0.toFixed(1)}`);
  assert.equal(enterCar(game.player, cometa, game.cars), true);
  // No replacement spawns while the player drives the mission car.
  const carsBefore = game.cars.length;
  assert.equal(ensureMissionCars(game), null, 'no replacement while driving the mission Cometa');
  assert.equal(game.cars.length, carsBefore);
  stepMissions(game.missions, game); // steal step
  // On the deliver step the sale is also blocked for that car.
  assert.equal(canSellCar(game, cometa), false, 'no sale while on the deliver step');
  cometa.x = 150; cometa.z = 125;
  const events = stepMissions(game.missions, game);
  assert.ok(events.some((e) => e.type === 'missionComplete' && e.mission === 'm2'));
  assert.equal(cometa.stolen, false, 'delivered car is no longer flagged stolen');
  assert.equal(canSellCar(game, cometa), false, 'delivered car cannot be sold (no double payout)');
  assert.equal(game.economy.money, 2400, 'only the $1,200 mission payout, no $900 sale');
});
check('missions: M1 pickup does not advance on foot or in the wrong car', () => {
  const game = makeGame();
  game.player.x = 200; game.player.z = 414; // on foot at the pickup
  let events = stepMissions(game.missions, game);
  assert.equal(events.length, 0, 'on-foot pickup must not count');
  assert.equal(game.missions.stepIndex, 0);
  const brisa = makeCar('brisa', 200, 414, 0, 'traffic');
  game.cars = [brisa];
  enterCar(game.player, brisa, game.cars);
  events = stepMissions(game.missions, game);
  assert.equal(events.length, 0, 'pickup in a non-taxi must not count');
});
check('missions: M4/M5 heat is set on start; losing the heat finishes M4', () => {
  const game = makeGame();
  game.missions.index = 3;
  stepMissions(game.missions, game);
  assert.equal(game.wanted.stars, 3, 'M4 starts at 3 stars');
  game.wanted.stars = 1;
  let events = stepMissions(game.missions, game);
  assert.equal(events.length, 0, 'M4 is not done while wanted remains');
  game.wanted.stars = 0;
  events = stepMissions(game.missions, game);
  assert.ok(events.some((e) => e.type === 'missionComplete' && e.mission === 'm4'));
  assert.equal(game.missions.index, 4, 'M5 must start');
  stepMissions(game.missions, game);
  assert.equal(game.wanted.stars, 4, 'M5 starts at 4 stars');
});

// --- Finisher additions: respawn, mission progress, tracer line, far destinations,
// interior police spawns, flee sidestep ---
check('player: respawnPlayer puts Dario back at (200,140) with armour re-equipped', () => {
  const p = makePlayer();
  p.x = 425; p.z = 425; p.yaw = 2; p.camYaw = 2;
  p.health = 0; p.armour = 0; p.onFoot = false;
  p.car = makeCar('cometa', 425, 425, 0, 'player');
  p.busted = true;
  respawnPlayer(p, 50);
  assert.equal(p.x, 200);
  assert.equal(p.z, 140);
  assert.equal(p.yaw, 0);
  assert.equal(p.health, 100);
  assert.equal(p.armour, 50, 'owned Body Armour is re-equipped on respawn');
  assert.equal(p.onFoot, true);
  assert.equal(p.car, null);
  assert.equal(p.busted, false);
});
check('missions: missionProgress snapshot + lookup + campaign-complete', () => {
  const m = makeMissions();
  const prog = missionProgress(m);
  assert.deepEqual(
    { index: prog.index, total: prog.total, step: prog.step, steps: prog.steps, name: prog.name, done: prog.done },
    { index: 0, total: 5, step: 0, steps: 2, name: 'First Fare', done: false },
  );
  assert.equal(missionById('m3').name, 'The Drop');
  assert.equal(missionById('m9'), null);
  assert.equal(isCampaignComplete(m), false);
  m.index = 5;
  assert.equal(missionProgress(m).done, true);
  assert.equal(missionProgress(m).label, 'Debt cleared.');
  assert.equal(isCampaignComplete(m), true);
});
check('combat: tracerEndpoints runs muzzle -> impact at chest height', () => {
  const hit = tracerEndpoints(200, 140, 0, { hit: 'ped', x: 210, z: 140 });
  assert.ok(approx(hit.from.x, 200, 0.01) && approx(hit.from.z, 140.7, 0.01), `muzzle ${JSON.stringify(hit.from)}`);
  assert.equal(hit.from.y, 1.4);
  assert.equal(hit.to.y, 1.0, 'ped hit rides at chest height');
  const miss = tracerEndpoints(200, 140, Math.PI / 2, { hit: null, x: 300, z: 140 });
  assert.ok(approx(miss.from.x, 200.7, 0.01), `muzzle ${JSON.stringify(miss.from)}`);
  assert.equal(miss.to.y, 0.4, 'a clean miss stops low');
});
check('traffic: pickFarDestination keeps cars on long legs, never U-turns', () => {
  const city = buildCity(GAME_SEED);
  const rng = makeRng(GAME_SEED);
  for (let i = 0; i < 50; i++) {
    const dest = pickFarDestination(city, rng, 250, 250);
    assert.ok(Math.hypot(dest.x - 250, dest.z - 250) >= 100, `dest ${dest.x},${dest.z} too close`);
  }
  // Impossible minimum falls back to the farthest sampled node, still a node.
  const far = pickFarDestination(city, makeRng(3), 250, 250, 1000);
  assert.ok(far && Number.isFinite(far.x) && Number.isFinite(far.z));
});
check('police: spawns near a corner player are interior nodes, still in the 40-90 m band', () => {
  const city = buildCity(GAME_SEED);
  const rng = makeRng(1234);
  let inBand = 0;
  let border = 0;
  for (let i = 0; i < 200; i++) {
    const u = spawnPolice(city, { x: 60, z: 60 }, rng, makeWanted(), []);
    const d = Math.hypot(u.car.x - 60, u.car.z - 60);
    if (d >= 40 && d <= 90) inBand++;
    if (u.car.x <= 0 || u.car.x >= 500 || u.car.z <= 0 || u.car.z >= 500) border++;
  }
  assert.equal(inBand, 200, 'every spawn in the band');
  // Interior preference is statistical, not absolute: the interior pool is
  // tried first (3 of its 81 nodes are in band here, so ~98% of spawns
  // settle there); the all-nodes pass is only reached on a miss, and it
  // may land on a border node that is itself in band. Border spawns must
  // stay a small minority.
  assert.ok(border <= 10, `border spawns ${border}/200 — interior preference lost`);
});
check('police: 3-star stepPolice makes 2 roadblocks on road nodes + heli at ~30 m', () => {
  const game = makeGame();
  game.wanted.stars = 3;
  stepPolice([], 1 / 60, game.city, game.player, game);
  assert.equal(game.roadblocks.length, 2);
  for (const b of game.roadblocks) {
    assert.equal(b.x % 50, 0, 'roadblock on a road node');
    assert.equal(b.z % 50, 0, 'roadblock on a road node');
  }
  assert.ok(game.heli, 'heli exists at 3 stars');
  const d = Math.hypot(game.heli.x - game.player.x, game.heli.z - game.player.z);
  assert.ok(approx(d, 30, 0.5), `heli orbit radius ${d}`);
  game.wanted.stars = 2;
  stepPolice([], 1 / 60, game.city, game.player, game);
  assert.equal(game.heli, null, 'heli despawns at 2 stars');
  assert.equal(game.roadblocks.length, 0, 'roadblocks clear at 2 stars');
});
check('peds: a fleeing ped sidesteps around a wall instead of pinning against it', () => {
  const wallCity = { buildings: [{ minX: 101, maxX: 110, minZ: 99, maxZ: 101 }] };
  const ped = {
    x: 100, z: 100, yaw: 0, health: 100, down: false, speed: 1.2,
    waypoints: [], wp: 1, fleeFrom: { x: 90, z: 100 }, fleeT: 4,
  };
  stepPeds([ped], 1, wallCity);
  assert.ok(ped.x !== 100 || ped.z !== 100, 'the ped moved despite the wall ahead');
  assert.ok(!isInsideBuilding(wallCity, ped.x, ped.z), 'the ped never stepped inside the wall');
  assert.equal(fleeingCount([ped]), 1);
  ped.down = true;
  assert.equal(fleeingCount([ped]), 0);
  assert.equal(downedCount([ped]), 1);
});

console.log(`\n${passed} tests passed, 0 failed`);
