// player.js — on-foot movement, enter/exit/steal car, health and armour (pure logic, no three.js).
import { CITY_SIZE, RESPAWN_POINT } from '../config.js';
import { isInsideBuilding } from './city.js';

// Walk speed on foot (m/s).
export const WALK_SPEED = 4.5;

// Enter-car reach: the caller checks this distance before calling enterCar.
export const ENTER_CAR_RANGE = 4;

// makePlayer() — fresh player: on foot on The Strip (x=200 road, z=140),
// next to a parked car (the app spawns one beside this spot), full health.
export function makePlayer() {
  return {
    x: 200, z: 140, yaw: 0, camYaw: 0,
    health: 100, armour: 0,
    car: null, onFoot: true, busted: false,
  };
}

// Wrap an angle to [-PI, PI].
function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// stepPlayer(player, input, dt, city) — WASD/arrows walk on foot.
// input = { w, a, s, d } booleans (W = forward, S = back, A/D = strafe).
// Does nothing while the player is in a car. followYaw: the camera yaw
// follows the heading ONLY while walking straight forward with W and no
// strafe — strafing or backing up leaves camYaw fixed (round-1 fix).
export function stepPlayer(player, input, dt, city) {
  if (!player.onFoot) return player;
  const fwd = (input.w ? 1 : 0) - (input.s ? 1 : 0);
  const strafe = (input.d ? 1 : 0) - (input.a ? 1 : 0);
  const len = Math.hypot(fwd, strafe);
  if (len > 0) {
    const fx = Math.sin(player.yaw);
    const fz = Math.cos(player.yaw);
    // Right vector for yaw 0 facing +z is +x.
    const rx = Math.cos(player.yaw);
    const rz = -Math.sin(player.yaw);
    const mx = (fx * fwd + rx * strafe) / len;
    const mz = (fz * fwd + rz * strafe) / len;
    const nx = player.x + mx * WALK_SPEED * dt;
    const nz = player.z + mz * WALK_SPEED * dt;
    // Building collision: circle (r=0.5 m) vs AABB — stay put if blocked.
    const blocked = city && isInsideBuilding(city, nx, nz);
    if (!blocked) {
      player.x = Math.max(1, Math.min(CITY_SIZE - 1, nx));
      player.z = Math.max(1, Math.min(CITY_SIZE - 1, nz));
    }
  }
  // Camera follows the heading only on a straight W walk (no strafe, no S).
  if (input.w && !input.a && !input.d && !input.s) {
    player.camYaw += wrapAngle(player.yaw - player.camYaw) * Math.min(1, dt * 5);
  }
  return player;
}

// enterCar(player, car, cars?) — get into a car. Sets player.car, marks a
// traffic car stolen, and (when a cars array is given) removes the car from
// the traffic list so the traffic AI stops driving it. Returns true/false.
export function enterCar(player, car, cars) {
  if (!car || player.car) return false;
  if (car.owner === 'traffic') car.stolen = true;
  car.owner = 'player';
  player.car = car;
  player.onFoot = false;
  player.x = car.x;
  player.z = car.z;
  if (Array.isArray(cars)) {
    const i = cars.indexOf(car);
    if (i !== -1) cars.splice(i, 1);
  }
  return true;
}

// exitCar(player, city?) — leave the car parked where it stops (speed forced
// to 0) and place the player beside it (never inside a building when a city
// is given). Returns true/false.
export function exitCar(player, city) {
  if (!player.car) return false;
  const car = player.car;
  car.speed = 0;
  // Try the right side first, then the left, then the car's own spot.
  const rx = Math.cos(car.yaw);
  const rz = -Math.sin(car.yaw);
  const spots = [
    { x: car.x + rx * 2.5, z: car.z + rz * 2.5 },
    { x: car.x - rx * 2.5, z: car.z - rz * 2.5 },
    { x: car.x, z: car.z },
  ];
  let spot = spots[2];
  for (const s of spots) {
    if (!city || !isInsideBuilding(city, s.x, s.z)) { spot = s; break; }
  }
  player.x = spot.x;
  player.z = spot.z;
  player.yaw = car.yaw;
  player.car = null;
  player.onFoot = true;
  return true;
}

// nearestCar(player, cars) — nearest enterable car (condition > 0).
// L5 fix: no dead 'parked' owner rank — makeCar only ever uses
// 'player' / 'traffic' / 'police', so ranking is by distance alone.
export function nearestCar(player, cars) {
  let best = null;
  let bestD = Infinity;
  for (const car of cars || []) {
    if (!car || car.condition <= 0) continue;
    const d = Math.hypot(car.x - player.x, car.z - player.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

// respawnPlayer(player, bodyArmour = 0) — put the player back on foot at
// the respawn point (200,140 on The Strip) with full health, re-equipping
// any owned Body Armour. One helper for the busted / wasted flow so the
// respawn coordinates live in exactly one place (config.RESPAWN_POINT)
// instead of being re-typed at every call site.
export function respawnPlayer(player, bodyArmour = 0) {
  player.x = RESPAWN_POINT.x;
  player.z = RESPAWN_POINT.z;
  player.yaw = 0;
  player.camYaw = 0;
  player.health = 100;
  player.armour = bodyArmour;
  player.car = null;
  player.onFoot = true;
  player.busted = false;
  return player;
}

// damagePlayer(player, amount) — damage absorbs through player.armour FIRST,
// then health. Death sets the busted flag. Returns { absorbed, healthDamage }.
export function damagePlayer(player, amount) {
  if (!(amount > 0) || player.health <= 0) return { absorbed: 0, healthDamage: 0 };
  const absorbed = Math.min(player.armour, amount);
  player.armour -= absorbed;
  const healthDamage = amount - absorbed;
  player.health = Math.max(0, player.health - healthDamage);
  if (player.health <= 0) player.busted = true;
  return { absorbed, healthDamage };
}
