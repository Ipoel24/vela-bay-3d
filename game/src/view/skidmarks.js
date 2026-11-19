// skidmarks.js — skid marks left on the road while handbraking at speed.
// Pure pool logic (Node-testable, no three.js) plus an InstancedMesh view.
// Marks are dark, laid at the rear wheels, bounded to ~48 live marks, and
// fade over ~9 s (their colour lightens toward the asphalt as they age).
import * as THREE from '../../vendor/three/three.module.min.js';

// Live-mark cap: the pool never holds more than this many marks.
export const SKID_POOL_CAP = 48;
// A mark fades out over this many seconds, then is dropped.
export const SKID_FADE_SECONDS = 9;
// Marks only lay down while handbraking faster than this (m/s).
export const SKID_MIN_SPEED = 10;
// How far behind the car centre the rear axle sits (m).
export const SKID_REAR_OFFSET = 1.45;
// Half the track width: one mark per rear wheel (m).
export const SKID_HALF_TRACK = 0.85;

// makeSkidPool(cap) — fresh bounded pool: { marks, cap }.
export function makeSkidPool(cap = SKID_POOL_CAP) {
  return { marks: [], cap };
}

// shouldSkid(speed, handbrake) — the lay-down rule: handbrake held and
// moving faster than 10 m/s. Coasting, braking without the handbrake, or
// crawling never leaves a mark.
export function shouldSkid(speed, handbrake) {
  return !!handbrake && Math.abs(speed) > SKID_MIN_SPEED;
}

// addSkidMark(pool, x, z, yaw) — lay one mark at (x, z) with heading `yaw`.
// When the pool is full the oldest mark is dropped, so the count never
// exceeds the cap. Returns the live mark count.
export function addSkidMark(pool, x, z, yaw) {
  pool.marks.push({ x, z, yaw, age: 0 });
  while (pool.marks.length > pool.cap) pool.marks.shift();
  return pool.marks.length;
}

// addSkidPair(pool, car) — lay the rear-wheel pair for a car: two marks,
// one per rear wheel, behind the car centre along its heading.
export function addSkidPair(pool, car) {
  const fx = Math.sin(car.yaw);
  const fz = Math.cos(car.yaw);
  const rx = Math.cos(car.yaw);
  const rz = -Math.sin(car.yaw);
  const cx = car.x - fx * SKID_REAR_OFFSET;
  const cz = car.z - fz * SKID_REAR_OFFSET;
  addSkidMark(pool, cx + rx * SKID_HALF_TRACK, cz + rz * SKID_HALF_TRACK, car.yaw);
  addSkidMark(pool, cx - rx * SKID_HALF_TRACK, cz - rz * SKID_HALF_TRACK, car.yaw);
  return pool.marks.length;
}

// stepSkids(pool, dt) — age every mark; marks older than the fade time are
// dropped. Returns the live mark count.
export function stepSkids(pool, dt) {
  for (let i = pool.marks.length - 1; i >= 0; i--) {
    pool.marks[i].age += dt;
    if (pool.marks[i].age > SKID_FADE_SECONDS) pool.marks.splice(i, 1);
  }
  return pool.marks.length;
}

// skidAlive(pool) — live mark count.
export function skidAlive(pool) {
  return pool.marks.length;
}

// skidFade(mark) — 0 when fresh, 1 when fully faded out.
export function skidFade(mark) {
  return Math.max(0, Math.min(1, mark.age / SKID_FADE_SECONDS));
}

// makeSkidView(pool) — one InstancedMesh of dark strips (0.35 x 1.6 m),
// one instance per live mark, laid flat just above the road so z-fighting
// never shows. Colour is set per instance in syncSkidView.
export function makeSkidView(pool) {
  const geo = new THREE.PlaneGeometry(0.35, 1.6);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
  const mesh = new THREE.InstancedMesh(geo, mat, pool.cap);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.userData.pool = pool;
  return mesh;
}

// syncSkidView(view, pool) — copy the live marks into the instanced mesh:
// position + heading per mark, colour fading from near-black toward the
// asphalt tone as the mark ages, so old marks wash out instead of popping.
export function syncSkidView(view, pool) {
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const fresh = new THREE.Color(0x141414);
  const asphalt = new THREE.Color(0x43474d);
  const marks = pool.marks;
  for (let i = 0; i < marks.length; i++) {
    const m = marks[i];
    dummy.position.set(m.x, 0.05, m.z);
    dummy.rotation.set(0, m.yaw, 0);
    dummy.updateMatrix();
    view.setMatrixAt(i, dummy.matrix);
    col.copy(fresh).lerp(asphalt, skidFade(m));
    view.setColorAt(i, col);
  }
  view.count = marks.length;
  view.instanceMatrix.needsUpdate = true;
  if (view.instanceColor) view.instanceColor.needsUpdate = true;
}
