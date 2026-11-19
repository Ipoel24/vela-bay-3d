// shots.js — photo mode for VELA BAY 3D: deterministic staged scenes for the 4 screenshots.

// applyShot(game, sceneName, seed) — resets the world to a staged state for
// one of the 4 scenes, advances the sim a fixed number of steps with a seeded
// autopilot that genuinely drives (real steering, acceleration, obstacle
// avoidance, chasing a target), and returns the camera + HUD staging for
// main.js to apply. Deterministic: the same scene + seed always gives the
// same frame. Photo mode FREEZES the sim for mission / wanted / police-count
// / delivery: applyShot never calls stepMissions or stepPolice, never sells a
// car, and never changes the wanted level after staging it.
// Scenes: 'chase' (sunset 18.5, hero Cometa + police + 2 stars),
// 'night' (21.5, player on foot + peds + police in the distance),
// 'garage' (morning 8.5, stolen Cometa at the garage + Inez dialogue),
// 'boardwalk' (noon 12.0, taxi + wheel + Spire).
// Returns { camera, dialogue, vehicleName } — camera is { mode: 'chase' |
// 'foot' } (main.js drives it with updateCamera) or { mode: 'fixed',
// position: {x,y,z}, lookAt: {x,y,z} } for a staged camera.
import { makeRng } from './sim/rng.js';
import { buildCity, routeBetween, isInsideBuilding } from './sim/city.js';
import { makeClock } from './sim/clock.js';
import { makeCar, stepCar, effectiveTop } from './sim/vehicles.js';
import { makePlayer, stepPlayer } from './sim/player.js';
import { makeTraffic, stepTraffic } from './sim/traffic.js';
import { makePeds, stepPeds } from './sim/pedestrians.js';
import { makeWanted } from './sim/police.js';
import { makeEconomy } from './sim/economy.js';
import { makeMissions } from './sim/missions.js';
import { GAME_SEED } from './config.js';

// SHOT_SCENES — the 4 scenes, keyed by the name shots.json + ?shot= use.
export const SHOT_SCENES = {
  chase: { hours: 18.5, label: 'Sunset chase' },
  night: { hours: 21.5, label: 'Night on foot' },
  garage: { hours: 8.5, label: 'Morning at the garage' },
  boardwalk: { hours: 12.0, label: 'Noon boardwalk' },
};

const STEP = 1 / 60;

// Wrap an angle to [-PI, PI].
function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// driveToward(car, tx, tz, dt, city, cruise) — genuinely drive a car toward
// a target: steer toward it, throttle up to cruise, brake into sharp turns,
// and steer around a building straight ahead (sample the point 10 m ahead;
// when blocked, pick the clearer of the two lateral sidesteps).
function driveToward(car, tx, tz, dt, city, cruise) {
  const dx = tx - car.x;
  const dz = tz - car.z;
  const dist = Math.hypot(dx, dz);
  let steerTarget = Math.atan2(dx, dz);
  // Obstacle avoidance: is the road ahead blocked? Sidestep to the clearer side.
  const aheadX = car.x + Math.sin(car.yaw) * 10;
  const aheadZ = car.z + Math.cos(car.yaw) * 10;
  if (city && isInsideBuilding(city, aheadX, aheadZ)) {
    const rx = Math.cos(car.yaw);
    const rz = -Math.sin(car.yaw);
    const leftClear = !isInsideBuilding(city, car.x + rx * 8, car.z + rz * 8);
    const rightClear = !isInsideBuilding(city, car.x - rx * 8, car.z - rz * 8);
    if (leftClear && !rightClear) steerTarget = car.yaw - 1.1;
    else if (rightClear && !leftClear) steerTarget = car.yaw + 1.1;
    else steerTarget = car.yaw + (leftClear ? -1.1 : 1.1);
  }
  const turn = wrapAngle(steerTarget - car.yaw);
  const steer = Math.max(-1, Math.min(1, turn * 2.2));
  let targetSpeed = cruise;
  if (Math.abs(turn) > 0.7) targetSpeed = Math.min(targetSpeed, 8);
  if (dist < 15) targetSpeed = Math.min(targetSpeed, 6);
  let throttle = 0;
  if (car.speed < targetSpeed) throttle = 1;
  else if (car.speed > targetSpeed + 1) throttle = -1;
  stepCar(car, { throttle, steer, handbrake: false }, dt, city);
  return dist;
}

// followRoute(car, route, wp, dt, city, cruise) — drive along a road-graph
// route (routeBetween waypoints), advancing the waypoint index when close.
// Returns the new waypoint index.
function followRoute(car, route, wp, dt, city, cruise) {
  const target = route[Math.min(wp, route.length - 1)];
  driveToward(car, target.x, target.z, dt, city, cruise);
  if (Math.hypot(target.x - car.x, target.z - car.z) < 5) return Math.min(wp + 1, route.length - 1);
  return wp;
}

// resetWorld(game, seed, hours) — fresh deterministic world for a shot:
// city, rng, player, traffic, peds, wanted, economy, missions, clock.
function resetWorld(game, seed, hours) {
  const rng = makeRng(seed);
  game.city = buildCity(GAME_SEED);
  game.rng = rng;
  game.player = makePlayer();
  game.cars = [];
  game.peds = [];
  game.police = [];
  game.wanted = makeWanted();
  game.economy = makeEconomy();
  game.missions = makeMissions();
  game.time = 0;
  game.roadblocks = [];
  game.heli = null;
  game.clock = makeClock();
  game.clock.minutes = hours * 60;
  game.clock.day = 1;
  game.traffic = makeTraffic(game.city, rng, 10);
  for (const t of game.traffic) game.cars.push(t.car);
  game.peds = makePeds(game.city, rng, 18);
  return rng;
}

// makePoliceUnit(name, x, z, yaw) — a staged police unit (built directly,
// never via spawnPolice: no Date.now() ids, no rng draws, fully deterministic).
function makePoliceUnit(name, x, z, yaw) {
  return {
    id: `police-shot-${name}`,
    name,
    car: makeCar('police', x, z, yaw, 'police'),
    state: 'pursue',
    arrestTimer: 0,
    cruise: 22,
    route: null,
    wp: 1,
    lastKnown: { x, z },
    hasLOS: true,
    disabled: false,
  };
}

// stepWorld(game, steps) — advance traffic + peds only (never missions,
// police AI, wanted or sales: the shot must not advance the job).
function stepWorld(game, steps) {
  for (let i = 0; i < steps; i++) {
    game.time += STEP;
    stepTraffic(game.traffic, STEP, game.city);
    stepPeds(game.peds, STEP, game.city);
  }
}

export function applyShot(game, sceneName, seed) {
  const scene = SHOT_SCENES[sceneName];
  if (!scene) throw new Error(`unknown shot scene: ${sceneName}`);
  const rng = resetWorld(game, seed, scene.hours);

  if (sceneName === 'chase') {
    // Sunset chase: hero Cometa driving east along the z=200 road, two VBPD
    // units ahead in the same direction so they read in the chase cam. The
    // hero starts slower and outruns them — a real chase, not a head-on.
    // Staging: the hero starts at x=105 so the 3 s drive ends mid-block
    // (x≈185, between the 150 and 200 intersections), clear of every lamp
    // pole — the old staging ended at x≈205 with the chase camera metres
    // from the (200,200) pole, which split the cover shot in half.
    const hero = makeCar('cometa', 105, 200, Math.PI / 2, 'player');
    hero.speed = 12;
    game.player.car = hero;
    game.player.onFoot = false;
    game.player.x = hero.x;
    game.player.z = hero.z;
    game.cars.push(hero);
    const u1 = makePoliceUnit('PELICAN-11', 160, 200, Math.PI / 2);
    const u2 = makePoliceUnit('RAY-22', 175, 205, Math.PI / 2);
    game.police = [u1, u2];
    game.cars.push(u1.car, u2.car);
    game.wanted.stars = 2;
    game.missions.index = 0; // M1 active: the mission line + marker show
    game.missions.stepIndex = 0;
    game.missions.started = true;
    const heroRoute = routeBetween(game.city, hero.x, hero.z, 400, 200);
    const p1Route = routeBetween(game.city, u1.car.x, u1.car.z, 420, 200);
    const p2Route = routeBetween(game.city, u2.car.x, u2.car.z, 420, 208);
    let wp = 1;
    let wp1 = 1;
    let wp2 = 1;
    // 3 s of genuine driving: the hero chases the marker down the road at
    // full throttle while the police run ahead of him. The hero must be
    // moving at speed at the end (he outruns them).
    for (let i = 0; i < 180; i++) {
      game.time += STEP;
      wp = followRoute(hero, heroRoute, wp, STEP, game.city, effectiveTop(hero));
      wp1 = followRoute(u1.car, p1Route, wp1, STEP, game.city, 30);
      wp2 = followRoute(u2.car, p2Route, wp2, STEP, game.city, 30);
      stepTraffic(game.traffic, STEP, game.city);
      stepPeds(game.peds, STEP, game.city);
    }
    return {
      camera: { mode: 'chase' },
      dialogue: 'Lena: Lose them, Dash — the Wheel job pays double if we stay clean!',
      vehicleName: 'Cometa GT',
    };
  }

  if (sceneName === 'night') {
    // Night on foot: Dario (red jacket) walking north on The Strip, peds
    // around him, two police units in the distance, 1 star of heat.
    game.player.x = 200;
    game.player.z = 310;
    game.player.yaw = 0;
    game.player.onFoot = true;
    game.player.car = null;
    // Stage a few peds close by so the frame reads busy.
    for (let i = 0; i < 6; i++) {
      const p = game.peds[i];
      p.x = 196 + rng.next() * 10;
      p.z = 306 + rng.next() * 18;
      p.yaw = rng.next() * Math.PI * 2;
    }
    const u1 = makePoliceUnit('COBIA-07', 200, 380, Math.PI);
    const u2 = makePoliceUnit('EGRET-31', 230, 350, Math.PI);
    game.police = [u1, u2];
    game.cars.push(u1.car, u2.car);
    game.wanted.stars = 1;
    game.missions.index = 0;
    game.missions.stepIndex = 0;
    game.missions.started = true;
    // 2 s of genuine walking: Dario walks straight forward (W).
    for (let i = 0; i < 120; i++) {
      game.time += STEP;
      stepPlayer(game.player, { w: true }, STEP, game.city);
      stepTraffic(game.traffic, STEP, game.city);
      stepPeds(game.peds, STEP, game.city);
    }
    return {
      camera: { mode: 'foot' },
      dialogue: 'Dash: Quiet night. Too quiet — the VBPD never stays quiet long.',
      vehicleName: 'ON FOOT',
    };
  }

  if (sceneName === 'garage') {
    // Morning at the garage: the stolen Cometa parked at Marco's, M2 on its
    // deliver step, Madame Inez on the line. The car stays put (parked).
    const cometa = makeCar('cometa', 150, 125, Math.PI / 2, 'player');
    cometa.stolen = true;
    game.player.car = cometa;
    game.player.onFoot = false;
    game.player.x = cometa.x;
    game.player.z = cometa.z;
    game.cars.push(cometa);
    game.wanted.stars = 1;
    game.missions.index = 1; // M2 active, deliver step
    game.missions.stepIndex = 1;
    game.missions.started = true;
    stepWorld(game, 60); // 1 s of ambient traffic/peds; the car never moves
    return {
      camera: {
        mode: 'fixed',
        // Framing fix: the old camera at (158,4,136) sat wedged between
        // two buildings — a Neon Row wall filled the left third of the
        // frame and the garage read as "a car in an alley". Shoot down
        // the x=150 road axis instead: camera on the road 15 m south of
        // the car, looking north. The Cometa sits centred on the
        // forecourt pad, the yellow sign reads just beyond it to the
        // right, and the street walls stay at the frame edges. The
        // (153,103) lamp pole is 37 m past the car, small on the axis,
        // not a frame-splitter.
        position: { x: 150, y: 4, z: 140 },
        lookAt: { x: 150, y: 1.2, z: 125 },
      },
      dialogue: "Inez: That Cometa had better be worth what you owe me, Dash.",
      vehicleName: 'Cometa GT · STOLEN',
    };
  }

  // boardwalk — Noon boardwalk: the Vela Taxi parked by the Boardwalk Wheel
  // with the Vela Spire behind it. The taxi stays put (parked).
  const taxi = makeCar('taxi', 193, 412, Math.PI, 'player');
  game.player.car = taxi;
  game.player.onFoot = false;
  game.player.x = taxi.x;
  game.player.z = taxi.z;
  game.cars.push(taxi);
  game.wanted.stars = 0;
  game.missions.index = 0; // M1 active: pickup marker sits on the wheel
  game.missions.stepIndex = 0;
  game.missions.started = true;
  stepWorld(game, 60); // 1 s of ambient traffic/peds; the taxi never moves
  return {
    camera: {
      mode: 'fixed',
      position: { x: 186, y: 9, z: 452 },
      lookAt: { x: 205, y: 8, z: 420 },
    },
    dialogue: '',
    vehicleName: 'Vela Taxi',
  };
}
