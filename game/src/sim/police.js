// police.js — wanted level, pursuit AI, roadblocks, helicopter, spawning, line of sight (pure logic, no three.js).
import { makeCar, stepCar, isWrecked } from './vehicles.js';
import { routeBetween, segmentHitsBuilding, interiorNodes, nearestNode } from './city.js';
import { HELI_MIN_STARS, HELI_ORBIT_RADIUS } from '../config.js';

// Police unit call-signs (with numbers, e.g. PELICAN-11).
export const UNIT_NAMES = ['PELICAN', 'RAY', 'COBIA', 'EGRET', 'OSPREY', 'HERON', 'TARPON'];
// Spawn band: police spawn 40-90 m from the player, never on top of them.
export const SPAWN_MIN_DIST = 40;
export const SPAWN_MAX_DIST = 90;
export const SPAWN_MAX_TRIES = 100;
// Wanted decay: no LOS and no unit within ~400 m for ~8 s drops 1 star.
export const DECAY_RANGE = 400;
export const DECAY_SECONDS = 8;
// Arrest: a unit within 3 m of an on-foot player builds the arrest timer.
export const ARREST_RADIUS = 3;
export const ARREST_SECONDS = 2;
// Police cruise speed range (m/s) — faster than traffic, below the player's top.
export const POLICE_CRUISE_MIN = 20;
export const POLICE_CRUISE_MAX = 24;

// makeWanted() — fresh wanted state: 0 stars, no recent shooting crime,
// no time spent out of sight.
export function makeWanted() {
  return {
    stars: 0,
    lastShootCrime: -Infinity, // M4: timestamp (s) of the last 'shoot' crime
    noLosTime: 0, // seconds with no LOS and no unit within DECAY_RANGE
  };
}

// Crime star values. 'shoot' is rate-limited (see below), not per bullet.
const CRIME_STARS = { steal: 1, runover: 1, kill: 1, crash: 1, shoot: 1 };

// addCrime(wanted, kind, now?) — raise the wanted level for a crime.
// M4 FIX (exact): the 'shoot' crime is rate-limited to at most once per
// ~5 s (tracked as lastShootCrime on the wanted object); other crimes
// (steal, runover, kill, crash) add immediately. Stars cap at 5.
// `now` is seconds (game time); defaults to Date.now()/1000. Returns stars.
export function addCrime(wanted, kind, now) {
  const t = Number.isFinite(now) ? now : Date.now() / 1000;
  if (kind === 'shoot') {
    if (t - wanted.lastShootCrime < 5) return wanted.stars;
    wanted.lastShootCrime = t;
  }
  wanted.stars = Math.min(5, wanted.stars + (CRIME_STARS[kind] || 0));
  return wanted.stars;
}

// hasLOS(city, ax, az, bx, bz) — true line of sight: the segment between the
// two points hits no building (correct segment-vs-AABB test).
export function hasLOS(city, ax, az, bx, bz) {
  return !segmentHitsBuilding(city, ax, az, bx, bz);
}

// spawnPolice(city, playerPos, rng, wanted, existing) — spawn ONE police unit.
// M3 FIX (exact): keep sampling road nodes until one lands in the 40-90 m
// band (bounded, 100 tries); if that still fails, fall back to the CLOSEST
// sampled node to the band, NOT a random one. Never spawns under 40 m when a
// band node exists (and with 100 tries one essentially always does).
// Interior nodes are preferred: a unit on the outer border can only approach
// down one axis, so the first pass samples interior intersections only and
// the border pool is used only when the interior pass finds nothing.
// `existing` is the current unit list (used to keep call-signs unique).
export function spawnPolice(city, playerPos, rng, wanted, existing) {
  const interior = interiorNodes(city);
  const pools = interior.length > 0 ? [interior, city.nodes] : [city.nodes];
  let best = null;
  let bestBandGap = Infinity;
  for (const pool of pools) {
    for (let i = 0; i < SPAWN_MAX_TRIES; i++) {
      const node = rng.pick(pool);
      const d = Math.hypot(node.x - playerPos.x, node.z - playerPos.z);
      if (d >= SPAWN_MIN_DIST && d <= SPAWN_MAX_DIST) {
        best = node;
        break;
      }
      const gap = d < SPAWN_MIN_DIST ? SPAWN_MIN_DIST - d : d - SPAWN_MAX_DIST;
      if (gap < bestBandGap) { bestBandGap = gap; best = node; }
    }
    if (best) {
      const bestD = Math.hypot(best.x - playerPos.x, best.z - playerPos.z);
      if (bestD >= SPAWN_MIN_DIST && bestD <= SPAWN_MAX_DIST) break;
    }
  }
  const used = new Set((existing || []).map((u) => u.name));
  let name = '';
  for (let i = 0; i < 20; i++) {
    name = `${rng.pick(UNIT_NAMES)}-${rng.int(10, 99)}`;
    if (!used.has(name)) break;
  }
  const yaw = Math.atan2(playerPos.x - best.x, playerPos.z - best.z);
  const unit = {
    id: `police-${Date.now()}-${Math.floor(rng.next() * 1e9)}`,
    name,
    car: makeCar('police', best.x, best.z, yaw, 'police'),
    state: 'pursue',
    arrestTimer: 0,
    cruise: POLICE_CRUISE_MIN + rng.next() * (POLICE_CRUISE_MAX - POLICE_CRUISE_MIN),
    route: null, wp: 1,
    lastKnown: { x: playerPos.x, z: playerPos.z },
    hasLOS: false,
    disabled: false,
  };
  return unit;
}

// Wrap an angle to [-PI, PI].
function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// stepPolice(police, dt, city, player, game) — advance every police unit:
// pursue via the road graph with no line of sight, directly when there is
// LOS; cruise 20-24 m/s; slow under 8 m; brake to a stop beside an on-foot
// player; arrest radius 3 m with a timer that DECAYS when the player breaks
// away. Also maintains game.roadblocks + game.heli at 3+ stars, and the
// wanted DECAY (no LOS and no unit within ~400 m for ~8 s drops 1 star).
// `game` carries at least { wanted }; roadblocks/heli are written onto it.
export function stepPolice(police, dt, city, player, game) {
  const wanted = game && game.wanted;
  const px = player.car ? player.car.x : player.x;
  const pz = player.car ? player.car.z : player.z;
  let anyLOS = false;
  let anyNear = false;

  for (const unit of police) {
    const car = unit.car;
    if (unit.disabled || isWrecked(car)) {
      // Wrecked/disabled units coast to a stop and stop pursuing.
      stepCar(car, { throttle: 0, steer: 0, handbrake: true }, dt, city);
      unit.state = 'disabled';
      continue;
    }
    const dx = px - car.x;
    const dz = pz - car.z;
    const dist = Math.hypot(dx, dz);
    unit.hasLOS = hasLOS(city, car.x, car.z, px, pz);
    if (unit.hasLOS) {
      anyLOS = true;
      unit.lastKnown = { x: px, z: pz };
    }
    if (dist < DECAY_RANGE) anyNear = true;

    // Target: the player directly with LOS, else the last known position
    // reached via the road graph.
    let tx;
    let tz;
    if (unit.hasLOS) {
      tx = px; tz = pz;
      unit.route = null;
    } else {
      if (!unit.route) {
        unit.route = routeBetween(city, car.x, car.z, unit.lastKnown.x, unit.lastKnown.z);
        unit.wp = 1;
      }
      const wp = unit.route[unit.wp];
      if (!wp) {
        tx = unit.lastKnown.x; tz = unit.lastKnown.z;
      } else {
        tx = wp.x; tz = wp.z;
        if (Math.hypot(tx - car.x, tz - car.z) < 5) unit.wp++;
      }
    }

    // Speed: cruise 20-24 m/s, slow under 8 m, brake to a stop beside an
    // on-foot player.
    let targetSpeed = unit.cruise;
    if (dist < 8) targetSpeed = Math.min(targetSpeed, dist * 1.2);
    if (player.onFoot && dist < 6) targetSpeed = 0;
    const desiredYaw = Math.atan2(tx - car.x, tz - car.z);
    const turn = wrapAngle(desiredYaw - car.yaw);
    const steer = Math.max(-1, Math.min(1, turn * 2));
    let input;
    if (targetSpeed <= 0) {
      input = { throttle: car.speed > 0.5 ? -1 : 0, steer, handbrake: car.speed < 2 };
    } else if (car.speed < targetSpeed) {
      input = { throttle: 1, steer, handbrake: false };
    } else if (car.speed > targetSpeed + 1) {
      input = { throttle: -1, steer, handbrake: false };
    } else {
      input = { throttle: 0, steer, handbrake: false };
    }
    stepCar(car, input, dt, city);

    // Arrest: within 3 m of an on-foot player the timer builds; breaking
    // away DECAYS it (no hard reset).
    if (player.onFoot && dist < ARREST_RADIUS) {
      unit.arrestTimer += dt;
      unit.state = 'arresting';
      if (unit.arrestTimer >= ARREST_SECONDS) player.busted = true;
    } else {
      unit.arrestTimer = Math.max(0, unit.arrestTimer - dt);
      if (unit.state === 'arresting') unit.state = 'pursue';
    }
  }

  // Wanted DECAY: no LOS anywhere and no unit within ~400 m for ~8 s.
  if (wanted && wanted.stars > 0) {
    if (!anyLOS && !anyNear) {
      wanted.noLosTime = (wanted.noLosTime || 0) + dt;
      if (wanted.noLosTime >= DECAY_SECONDS) {
        wanted.stars = Math.max(0, wanted.stars - 1);
        wanted.noLosTime = 0;
      }
    } else {
      wanted.noLosTime = 0;
    }
  }

  // Roadblocks + helicopter at HELI_MIN_STARS+ stars; cleared below.
  if (game) {
    if (wanted && wanted.stars >= HELI_MIN_STARS) {
      if (!game.roadblocks || game.roadblocks.length === 0) {
        game.roadblocks = makeRoadblocks(city, player, px, pz);
      }
      if (!game.heli) game.heli = { x: px, z: pz, angle: 0 };
      game.heli.angle += dt * 0.5;
      game.heli.x = px + Math.cos(game.heli.angle) * HELI_ORBIT_RADIUS;
      game.heli.z = pz + Math.sin(game.heli.angle) * HELI_ORBIT_RADIUS;
    } else {
      game.roadblocks = [];
      game.heli = null;
    }
  }
  return police;
}

// makeRoadblocks(city, player, px, pz) — two roadblocks on road nodes ahead
// of the player (one ~80 m ahead, one ~130 m), for 3+ star heat.
function makeRoadblocks(city, player, px, pz) {
  const fx = player.car ? Math.sin(player.car.yaw) : Math.sin(player.yaw);
  const fz = player.car ? Math.cos(player.car.yaw) : Math.cos(player.yaw);
  const blocks = [];
  for (const ahead of [80, 130]) {
    const node = nearestNode(city, px + fx * ahead, pz + fz * ahead);
    blocks.push({ x: node.x, z: node.z, yaw: Math.atan2(fx, fz) });
  }
  return blocks;
}
