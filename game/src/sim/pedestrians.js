// pedestrians.js — pedestrians walking pavements, fleeing, and ped-hit attribution (pure logic, no three.js).
import { routeBetween, isInsideBuilding } from './city.js';
import { isWrecked } from './vehicles.js';
import { addCrime } from './police.js';

// Sidewalk offset from the road centreline (m).
export const SIDEWALK_OFFSET = 3.5;
// Gunshot scare radius (m) — M1 fix: a real circle, not a vertical strip.
export const SCARE_RADIUS = 45;
// Pedestrian health; the pistol does 34 damage, so 3 shots down one.
export const PED_HEALTH = 100;

// makePeds(city, rng, count) — spawn count peds on sidewalks (3.5 m off the
// road centreline), each walking a road-graph route to a random destination.
export function makePeds(city, rng, count) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const node = rng.pick(city.nodes);
    const dest = rng.pick(city.nodes);
    const yaw = rng.next() * Math.PI * 2;
    peds.push({
      x: node.x + 3.5, z: node.z, yaw,
      health: PED_HEALTH, down: false,
      speed: 1 + rng.next() * 0.6,
      waypoints: routeBetween(city, node.x, node.z, dest.x, dest.z),
      wp: 1,
      fleeFrom: null, fleeT: 0,
    });
  }
  // Keep the seeded rng on the list so retargeting stays deterministic.
  peds.rng = rng;
  return peds;
}

// isScared(ped, shot) — M1 FIX (exact): true when the shot lands within a
// 45 m circle of the ped. The old code used ped.z - ped.z (= 0) for the
// second term, making an infinite vertical strip.
export function isScared(ped, shot) {
  return Math.hypot(shot.x - ped.x, shot.z - ped.z) < SCARE_RADIUS;
}

// scarePed(ped, fromX, fromZ, duration = 4) — make a ped flee away from a
// point (gunfire, a horn) for `duration` seconds.
export function scarePed(ped, fromX, fromZ, duration = 4) {
  ped.fleeFrom = { x: fromX, z: fromZ };
  ped.fleeT = duration;
}

// fleeingCount(peds) / downedCount(peds) — live tallies for the HUD and
// for tests: how many peds are currently running, and how many are down.
export function fleeingCount(peds) {
  return peds.filter((p) => !p.down && p.fleeT > 0).length;
}

export function downedCount(peds) {
  return peds.filter((p) => p.down).length;
}

// stepPeds(peds, dt, city) — walk the road graph with a 3.5 m sidewalk
// offset; fleeing peds run away from their flee point at 3 m/s instead.
// Fleeing/walking never steps inside a building.
export function stepPeds(peds, dt, city) {
  for (const ped of peds) {
    if (ped.down) continue;
    if (ped.fleeT > 0 && ped.fleeFrom) {
      ped.fleeT = Math.max(0, ped.fleeT - dt);
      const dx = ped.x - ped.fleeFrom.x;
      const dz = ped.z - ped.fleeFrom.z;
      const len = Math.hypot(dx, dz) || 1;
      const ux = dx / len;
      const uz = dz / len;
      // Run straight away — but a building in the way used to pin the ped
      // against the wall for the whole flee. Sidestep ±45° and take the
      // first clear diagonal instead of standing still.
      const tries = [
        [ux, uz],
        [(ux - uz) * 0.7071, (uz + ux) * 0.7071],
        [(ux + uz) * 0.7071, (uz - ux) * 0.7071],
      ];
      let moved = false;
      for (const [mx, mz] of tries) {
        const nx = ped.x + mx * 3 * dt;
        const nz = ped.z + mz * 3 * dt;
        if (!isInsideBuilding(city, nx, nz)) {
          ped.x = Math.max(1, Math.min(499, nx));
          ped.z = Math.max(1, Math.min(499, nz));
          ped.yaw = Math.atan2(mx, mz);
          moved = true;
          break;
        }
      }
      if (!moved) ped.yaw = Math.atan2(ux, uz);
      continue;
    }
    let target = ped.waypoints[ped.wp];
    if (!target) {
      const dest = peds.rng
        ? peds.rng.pick(city.nodes)
        : city.nodes[Math.floor(Math.random() * city.nodes.length)];
      ped.waypoints = routeBetween(city, ped.x, ped.z, dest.x, dest.z);
      ped.wp = 1;
      target = ped.waypoints[1] || ped.waypoints[0];
    }
    const dx = target.x - ped.x;
    const dz = target.z - ped.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 2) { ped.wp++; continue; }
    // Sidewalk offset: right of the travel direction is (dz, -dx)/len.
    const ux = dx / dist;
    const uz = dz / dist;
    const tx = target.x + uz * SIDEWALK_OFFSET;
    const tz = target.z - ux * SIDEWALK_OFFSET;
    const mx = tx - ped.x;
    const mz = tz - ped.z;
    const mlen = Math.hypot(mx, mz) || 1;
    const nx = ped.x + (mx / mlen) * ped.speed * dt;
    const nz = ped.z + (mz / mlen) * ped.speed * dt;
    if (!isInsideBuilding(city, nx, nz)) {
      ped.x = Math.max(1, Math.min(499, nx));
      ped.z = Math.max(1, Math.min(499, nz));
    }
    ped.yaw = Math.atan2(mx / mlen, mz / mlen);
  }
  return peds;
}

// checkPedHits(peds, cars, playerCar, wanted, now) — a car within 1.8 m of a
// ped at speed runs the ped over (fast = downed, slow = hurt). Ped-hit
// attribution: ONLY the player's car running over a ped adds a wanted crime
// — traffic running over peds never blames the player. Returns hit events.
export function checkPedHits(peds, cars, playerCar, wanted, now) {
  const events = [];
  for (const ped of peds) {
    if (ped.down) continue;
    for (const car of cars) {
      if (!car || isWrecked(car)) continue;
      const d = Math.hypot(car.x - ped.x, car.z - ped.z);
      if (d >= 1.8 || Math.abs(car.speed) <= 2) continue;
      const damage = Math.abs(car.speed) > 8 ? 100 : 50;
      ped.health -= damage;
      if (ped.health <= 0) { ped.health = 0; ped.down = true; }
      if (car === playerCar && wanted) addCrime(wanted, 'runover', now);
      events.push({ ped, car, down: ped.down });
      break; // one hit per ped per step
    }
  }
  return events;
}
