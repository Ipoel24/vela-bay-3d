// traffic.js — traffic cars driving the road graph, plus car-vs-car push-apart (pure logic, no three.js).
import { makeCar, stepCar, damageCar, isWrecked } from './vehicles.js';
import { routeBetween } from './city.js';

// Right-hand lane offset from the road centreline (m).
export const LANE_OFFSET = 2.5;
// Traffic cruise speed range (m/s).
export const TRAFFIC_CRUISE_MIN = 4;
export const TRAFFIC_CRUISE_MAX = 6;
// Car collision radius used by the push-apart (m).
export const CAR_RADIUS = 1.8;

// Traffic models (no police cars in traffic).
const TRAFFIC_MODELS = ['brisa', 'brisa', 'tiburon', 'taxi', 'van', 'cometa'];

// pickFarDestination(city, rng, fromX, fromZ, minDist = 100) — a road node
// at least `minDist` away from (fromX, fromZ), bounded to 100 draws; falls
// back to the farthest sampled node. Traffic that retargets to a node 10 m
// away U-turns constantly and jams the intersection it just left; a far
// destination keeps cars flowing down long road-graph legs instead.
export function pickFarDestination(city, rng, fromX, fromZ, minDist = 100) {
  let best = null;
  let bestD = -1;
  const pick = rng
    ? () => rng.pick(city.nodes)
    : () => city.nodes[Math.floor(Math.random() * city.nodes.length)];
  for (let i = 0; i < 100; i++) {
    const node = pick();
    const d = Math.hypot(node.x - fromX, node.z - fromZ);
    if (d >= minDist) return node;
    if (d > bestD) { bestD = d; best = node; }
  }
  return best;
}

// makeTraffic(city, rng, count) — spawn count traffic cars on road nodes,
// each with a route to a random destination and a 4-6 m/s cruise speed.
export function makeTraffic(city, rng, count) {
  const traffic = [];
  for (let i = 0; i < count; i++) {
    const node = rng.pick(city.nodes);
    const yaw = rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
    const car = makeCar(rng.pick(TRAFFIC_MODELS), node.x, node.z, yaw, 'traffic');
    const dest = pickFarDestination(city, rng, node.x, node.z);
    traffic.push({
      car,
      waypoints: routeBetween(city, node.x, node.z, dest.x, dest.z),
      wp: 1,
      cruise: TRAFFIC_CRUISE_MIN + rng.next() * (TRAFFIC_CRUISE_MAX - TRAFFIC_CRUISE_MIN),
    });
  }
  // Keep the seeded rng on the list so retargeting stays deterministic.
  traffic.rng = rng;
  return traffic;
}

// Wrap an angle to [-PI, PI].
function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// stepTraffic(traffic, dt, city) — each car follows its road-graph route with
// a right-hand lane offset, active braking into turns/intersections, and a
// 4-6 m/s cruise cap. Wrecked cars coast to a stop.
export function stepTraffic(traffic, dt, city) {
  for (const t of traffic) {
    const car = t.car;
    if (isWrecked(car)) {
      stepCar(car, { throttle: 0, steer: 0, handbrake: true }, dt, city);
      continue;
    }
    // Advance to the next waypoint when close; retarget when the route ends.
    let target = t.waypoints[t.wp];
    if (!target) {
      const dest = pickFarDestination(city, traffic.rng, car.x, car.z);
      t.waypoints = routeBetween(city, car.x, car.z, dest.x, dest.z);
      t.wp = 1;
      target = t.waypoints[1] || t.waypoints[0];
    }
    const dx = target.x - car.x;
    const dz = target.z - car.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 4) {
      t.wp++;
      continue;
    }
    // Right-hand lane offset: right of the travel direction is (dz, -dx)/len.
    const ux = dx / dist;
    const uz = dz / dist;
    const tx = target.x + uz * LANE_OFFSET;
    const tz = target.z - ux * LANE_OFFSET;
    const desiredYaw = Math.atan2(tx - car.x, tz - car.z);
    const turn = wrapAngle(desiredYaw - car.yaw);
    const steer = Math.max(-1, Math.min(1, turn * 2));
    // Active braking: slow for the waypoint itself and for sharp turns.
    let targetSpeed = t.cruise;
    if (dist < 12) targetSpeed = Math.min(targetSpeed, 3);
    if (Math.abs(turn) > 0.6) targetSpeed = Math.min(targetSpeed, 3.5);
    let throttle = 0;
    if (car.speed < targetSpeed) throttle = 1;
    else if (car.speed > targetSpeed + 0.5) throttle = -1;
    stepCar(car, { throttle, steer, handbrake: false }, dt, city);
    // Cruise cap (applied after the physics step).
    if (car.speed > t.cruise) car.speed = t.cruise;
  }
  return traffic;
}

// resolveCarCollisions(cars, dt = 0, now = 0) — push overlapping cars apart
// so they no longer overlap. Positional only: it NEVER touches any car's
// speed, so a car rear-ending slow traffic keeps its speed and pushes the
// queue ahead, and can escape forwards or by reversing. The player's car is
// never shoved: when the player is in a pair, the other car takes the full
// correction and the player does not move. A hard rear-end (closing speed
// > 8 m/s) costs health on a short contact window (1 s per-car cooldown).
export function resolveCarCollisions(cars, dt = 0, now = 0) {
  if (dt > 0) {
    for (const c of cars) {
      if (c.ramCooldown > 0) c.ramCooldown = Math.max(0, c.ramCooldown - dt);
    }
  }
  // Several passes so a pushed queue propagates ahead instead of jamming.
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i];
        const b = cars[j];
        let dx = b.x - a.x;
        let dz = b.z - a.z;
        let dist = Math.hypot(dx, dz);
        const overlap = CAR_RADIUS * 2 - dist;
        if (overlap <= 0) continue;
        moved = true;
        // Coincident centres: separate along a's heading.
        if (dist < 1e-6) { dx = Math.sin(a.yaw); dz = Math.cos(a.yaw); dist = 1; }
        const nx = dx / dist;
        const nz = dz / dist;
        const aPlayer = a.owner === 'player';
        const bPlayer = b.owner === 'player';
        if (aPlayer && !bPlayer) {
          b.x += nx * overlap;
          b.z += nz * overlap;
        } else if (bPlayer && !aPlayer) {
          a.x -= nx * overlap;
          a.z -= nz * overlap;
        } else {
          a.x -= nx * overlap * 0.5;
          a.z -= nz * overlap * 0.5;
          b.x += nx * overlap * 0.5;
          b.z += nz * overlap * 0.5;
        }
        // Ram damage on the first pass only, on a short contact window.
        if (pass === 0) applyRamDamage(a, b, nx, nz);
      }
    }
    if (!moved) break;
  }
  return cars;
}

// applyRamDamage(a, b, nx, nz) — when a closes on b faster than 8 m/s along
// their centre line, both take damage (the car in front takes more), at most
// once per second per car (ramCooldown).
function applyRamDamage(a, b, nx, nz) {
  const avx = Math.sin(a.yaw) * a.speed;
  const avz = Math.cos(a.yaw) * a.speed;
  const bvx = Math.sin(b.yaw) * b.speed;
  const bvz = Math.cos(b.yaw) * b.speed;
  const closing = (avx - bvx) * nx + (avz - bvz) * nz;
  if (closing <= 8) return;
  if ((a.ramCooldown || 0) > 0 || (b.ramCooldown || 0) > 0) return;
  const excess = closing - 8;
  damageCar(b, excess * 1.5);
  damageCar(a, excess * 0.75);
  a.ramCooldown = 1;
  b.ramCooldown = 1;
}
