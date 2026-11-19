// combat.js — shooting, real line of sight, damage (pure logic, no three.js).
import { segmentHitsBuilding } from './city.js';
import { damageCar, isWrecked } from './vehicles.js';
import { isScared, scarePed } from './pedestrians.js';
import { addCrime } from './police.js';

// Pistol: 34 damage (3 shots down a 100 HP ped; ~34 off a ~140 HP police
// unit), 12-round magazine. Shooting is on-foot only (caller enforces it).
export const WEAPON = { damage: 34, magSize: 12 };

// Max bullet travel (m).
const MAX_RANGE = 150;

// shoot(game, fromX, fromZ, aimX, aimZ) — fire one pistol shot in a straight
// line toward the aim point. LOS is real: the shot stops at walls FIRST
// (binary search for the wall face, using city.segmentHitsBuilding) before
// peds/cars are tested. A hit has a visible effect (health change, fleeing,
// a downed ped, a damaged car). Returns { hit: 'ped'|'car'|'wall'|null,
// x, z, distance, target?, killed? }. Ammo is managed by the caller; the
// 'shoot' crime is added only when a ped/car is actually hit, and is
// rate-limited inside addCrime (M4 fix: a clean miss adds nothing).
// tracerEndpoints(fromX, fromZ, yaw, result) — the bullet-tracer line for
// a shot: from the muzzle (0.7 m ahead of the shooter at chest height
// 1.4 m) to the shot's impact point. The impact rides at 1.0 m for a
// ped/car hit (chest height) and 0.4 m for a wall or clean miss (where the
// round actually stops). One helper so the sim and the view agree on the
// line the player sees.
export function tracerEndpoints(fromX, fromZ, yaw, result) {
  const from = {
    x: fromX + Math.sin(yaw) * 0.7,
    y: 1.4,
    z: fromZ + Math.cos(yaw) * 0.7,
  };
  const to = {
    x: result.x,
    y: result.hit === 'ped' || result.hit === 'car' ? 1.0 : 0.4,
    z: result.z,
  };
  return { from, to };
}

export function shoot(game, fromX, fromZ, aimX, aimZ) {
  const city = game.city;
  const peds = game.peds || [];
  const cars = game.cars || [];
  const dx = aimX - fromX;
  const dz = aimZ - fromZ;
  const aimDist = Math.hypot(dx, dz);
  if (aimDist < 1e-6) return { hit: null, x: fromX, z: fromZ, distance: 0 };
  const ux = dx / aimDist;
  const uz = dz / aimDist;
  const maxDist = Math.min(aimDist, MAX_RANGE);
  const now = Number.isFinite(game.time) ? game.time : Date.now() / 1000;

  // 1. Wall face first: binary search the smallest t whose segment from the
  // muzzle hits a building (monotonic, so the search is valid).
  let wallDist = Infinity;
  if (segmentHitsBuilding(city, fromX, fromZ, fromX + ux * maxDist, fromZ + uz * maxDist)) {
    let lo = 0;
    let hi = maxDist;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (segmentHitsBuilding(city, fromX, fromZ, fromX + ux * mid, fromZ + uz * mid)) hi = mid;
      else lo = mid;
    }
    wallDist = hi;
  }
  const limit = Math.min(maxDist, wallDist);

  // 2. Closest ped/car whose centre passes within its radius of the ray,
  // and strictly before the wall.
  let best = null;
  let bestKind = null;
  let bestDist = Infinity;
  for (const ped of peds) {
    if (ped.down) continue;
    const t = (ped.x - fromX) * ux + (ped.z - fromZ) * uz;
    if (t < 0 || t > limit) continue;
    const perp = Math.abs((ped.x - fromX) * uz - (ped.z - fromZ) * ux);
    if (perp < 0.7 && t < bestDist) { best = ped; bestKind = 'ped'; bestDist = t; }
  }
  for (const car of cars) {
    if (isWrecked(car)) continue;
    const t = (car.x - fromX) * ux + (car.z - fromZ) * uz;
    if (t < 0 || t > limit) continue;
    const perp = Math.abs((car.x - fromX) * uz - (car.z - fromZ) * ux);
    if (perp < 1.7 && t < bestDist) { best = car; bestKind = 'car'; bestDist = t; }
  }

  const impactX = fromX + ux * Math.min(limit, bestDist === Infinity ? maxDist : bestDist);
  const impactZ = fromZ + uz * Math.min(limit, bestDist === Infinity ? maxDist : bestDist);

  // Gunfire scares nearby peds (they flee from the impact point).
  for (const ped of peds) {
    if (!ped.down && isScared(ped, { x: impactX, z: impactZ })) {
      scarePed(ped, impactX, impactZ, 4);
    }
  }

  if (bestKind === 'ped') {
    best.health -= WEAPON.damage;
    let killed = false;
    if (best.health <= 0) { best.health = 0; best.down = true; killed = true; }
    if (game.wanted) addCrime(game.wanted, 'shoot', now);
    return { hit: 'ped', x: best.x, z: best.z, distance: bestDist, target: best, killed };
  }
  if (bestKind === 'car') {
    damageCar(best, WEAPON.damage);
    let killed = false;
    if (best.health <= 0) killed = true;
    // A wrecked police car disables its unit.
    if (game.police) {
      for (const unit of game.police) {
        if (unit.car === best && best.health <= 0) unit.disabled = true;
      }
    }
    if (game.wanted) addCrime(game.wanted, 'shoot', now);
    return { hit: 'car', x: best.x, z: best.z, distance: bestDist, target: best, killed };
  }
  if (wallDist !== Infinity) {
    return { hit: 'wall', x: fromX + ux * wallDist, z: fromZ + uz * wallDist, distance: wallDist };
  }
  return { hit: null, x: fromX + ux * maxDist, z: fromZ + uz * maxDist, distance: maxDist };
}
