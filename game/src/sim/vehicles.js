// vehicles.js — car definitions, arcade physics, damage/condition (pure logic, no three.js).
import { CITY_SIZE } from '../config.js';

// Per-model arcade defs. drag = accel / (top * 0.35) per the spec; the drag
// force applies that coefficient times 0.35, so terminal speed = accel /
// (drag * 0.35) = top speed exactly (a fixed drag would cap every car alike).
export const CAR_DEFS = {
  cometa: { name: 'Cometa GT', kind: 'sports', top: 52, accel: 20, brake: 30, handbrakeDecel: 22, steer: 1.9 },
  brisa: { name: 'Brisa', kind: 'sedan', top: 38, accel: 14, brake: 28, handbrakeDecel: 20, steer: 1.7 },
  tiburon: { name: 'Tiburon', kind: 'muscle', top: 46, accel: 17, brake: 28, handbrakeDecel: 20, steer: 1.6 },
  taxi: { name: 'Vela Taxi', kind: 'taxi', top: 36, accel: 13, brake: 28, handbrakeDecel: 20, steer: 1.7 },
  police: { name: 'VBPD Patrol', kind: 'police', top: 44, accel: 18, brake: 30, handbrakeDecel: 22, steer: 1.8 },
  van: { name: 'Lumen Van', kind: 'van', top: 32, accel: 11, brake: 26, handbrakeDecel: 18, steer: 1.4 },
};

// isWrecked(car) — true when a car is at 0% condition. One predicate for
// every "is this car drivable" check (player H1 coast, traffic/police
// wreck handling, shooting, ped hits) so the threshold lives in one place.
export function isWrecked(car) {
  return !car || car.condition <= 0;
}

// Effective top speed of a car (garage engine upgrades raise car.topSpeed).
export function effectiveTop(car) {
  return car.topSpeed || CAR_DEFS[car.model].top;
}

// Create a car. owner: 'player' | 'traffic' | 'police'. yaw 0 faces +z (north).
export function makeCar(model, x, z, yaw, owner) {
  const def = CAR_DEFS[model];
  return {
    model, def, x, z, yaw, speed: 0, owner,
    condition: 100, health: 100, maxHealth: 100, armour: 0,
    stolen: false, topSpeed: def.top, accel: def.accel,
  };
}

// Damage a car; armour scales damage by 1 / (1 + 0.5 * armour) (lv3 = -60%).
// condition mirrors health as a percentage of maxHealth.
export function damageCar(car, amount) {
  const scaled = amount / (1 + 0.5 * (car.armour || 0));
  car.health = Math.max(0, car.health - scaled);
  car.condition = Math.max(0, Math.min(100, (car.health / car.maxHealth) * 100));
  return scaled;
}

// Step one car for dt seconds. input = { throttle: -1..1, steer: -1..1, handbrake: bool }.
// Handles building collision (push out, damage on a hard hit). Does NOT check
// car.condition — the wrecked-car coast/stop (H1 fix) lives in main.js; traffic
// and police already handle wrecked cars by passing handbrake input.
// Traffic car-vs-car collision is push-apart and lives in traffic.js, not here.
export function stepCar(car, input, dt, city) {
  const def = CAR_DEFS[car.model];
  const top = effectiveTop(car);
  const drag = def.accel / (top * 0.35);

  let dv = 0;
  const throttle = input.throttle || 0;
  if (throttle > 0) {
    dv += throttle * car.accel;
  } else if (throttle < 0) {
    // Braking while moving forward, reversing once slow.
    if (car.speed > 0.5) dv -= def.brake;
    else dv += throttle * car.accel * 0.6;
  }
  // Drag: terminal speed equals top speed.
  dv -= drag * 0.35 * car.speed;
  if (input.handbrake) {
    dv -= Math.sign(car.speed) * def.handbrakeDecel;
  }
  const prevSpeed = car.speed;
  car.speed += dv * dt;
  // Handbrake / drag must not flip the car into reverse on their own.
  if (throttle >= 0 && !input.handbrake && car.speed < 0 && prevSpeed >= 0) car.speed = 0;
  if (input.handbrake && Math.sign(car.speed) !== Math.sign(prevSpeed) && prevSpeed !== 0) car.speed = 0;
  // Reverse clamps at -0.4 * top; forward clamps at top.
  car.speed = Math.max(-0.4 * top, Math.min(top, car.speed));

  // Steering scales with speed (no turn while stationary); handbrake drifts wider.
  const steer = input.steer || 0;
  const speedFactor = Math.max(-1, Math.min(1, car.speed / 10));
  car.yaw += steer * def.steer * speedFactor * (input.handbrake ? 1.6 : 1) * dt;

  car.x += Math.sin(car.yaw) * car.speed * dt;
  car.z += Math.cos(car.yaw) * car.speed * dt;

  // Keep inside the city.
  car.x = Math.max(2, Math.min(CITY_SIZE - 2, car.x));
  car.z = Math.max(2, Math.min(CITY_SIZE - 2, car.z));

  // Building collision: circle (r=1.4 m) vs AABB, push out along the smallest
  // penetration axis; a hard hit damages the car and scrubs speed.
  if (city) {
    const r = 1.4;
    for (const b of city.buildings) {
      if (car.x + r <= b.minX || car.x - r >= b.maxX || car.z + r <= b.minZ || car.z - r >= b.maxZ) continue;
      const overlapX = Math.min(car.x + r - b.minX, b.maxX - (car.x - r));
      const overlapZ = Math.min(car.z + r - b.minZ, b.maxZ - (car.z - r));
      const impactSpeed = Math.abs(prevSpeed);
      if (overlapX < overlapZ) {
        car.x = (car.x < (b.minX + b.maxX) / 2) ? b.minX - r : b.maxX + r;
      } else {
        car.z = (car.z < (b.minZ + b.maxZ) / 2) ? b.minZ - r : b.maxZ + r;
      }
      if (impactSpeed > 10) damageCar(car, (impactSpeed - 10) * 1.2);
      car.speed *= 0.3;
    }
  }
  return car;
}
