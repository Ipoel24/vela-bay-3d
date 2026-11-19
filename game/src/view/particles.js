// particles.js — crash / bullet-hit / ped-down particle bursts.
// Pure pool logic (Node-testable, no three.js) plus a THREE.Points view
// that draws the live pool. Bursts are orange, clearly visible for ~1-2 s
// after a hard crash, and the pool is bounded so impacts can never allocate
// without limit — when the pool is full the oldest burst makes room.
import * as THREE from '../../vendor/three/three.module.min.js';

// One burst lives this long (s) — visible for ~1-2 s, then gone.
export const BURST_LIFETIME = 1.5;
// Sparks per burst.
export const BURST_COUNT = 24;
// Launch speed of a spark (m/s), randomised per spark.
export const BURST_SPEED = 7;
// Hard cap on live sparks across every burst in the pool.
export const BURST_POOL_CAP = 96;
// Sparks fall a little slower than free gravity so the burst hangs.
export const BURST_GRAVITY = 6;

// makeBurstPool(cap) — fresh bounded pool: { sparks, cap }.
export function makeBurstPool(cap = BURST_POOL_CAP) {
  return { sparks: [], cap };
}

// spawnBurst(pool, x, y, z, opts) — add one orange burst at (x, y, z).
// opts: { count, speed, up } — count sparks, launch speed, extra upward
// bias for ground impacts. When the pool is full the oldest sparks are
// dropped first, so the pool never grows past `cap`. Returns sparks added.
export function spawnBurst(pool, x, y, z, opts = {}) {
  const count = opts.count ?? BURST_COUNT;
  const speed = opts.speed ?? BURST_SPEED;
  const up = opts.up ?? 2.5;
  let added = 0;
  for (let i = 0; i < count; i++) {
    if (pool.sparks.length >= pool.cap) pool.sparks.splice(0, pool.sparks.length - pool.cap + 1);
    const a = Math.random() * Math.PI * 2;
    const e = (Math.random() - 0.25) * Math.PI;
    const v = speed * (0.4 + Math.random() * 0.8);
    pool.sparks.push({
      x, y: y + 0.4, z,
      vx: Math.cos(a) * Math.cos(e) * v,
      vy: Math.sin(e) * v + up,
      vz: Math.sin(a) * Math.cos(e) * v,
      life: BURST_LIFETIME * (0.7 + Math.random() * 0.5),
      maxLife: BURST_LIFETIME,
    });
    added++;
  }
  return added;
}

// stepBursts(pool, dt) — integrate every spark: drift, fall, age out.
// Dead sparks are removed in place. Returns sparks still alive.
export function stepBursts(pool, dt) {
  const sparks = pool.sparks;
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.vy -= BURST_GRAVITY * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.z += s.vz * dt;
    if (s.y < 0.05) { s.y = 0.05; s.vy = Math.abs(s.vy) * 0.3; s.vx *= 0.7; s.vz *= 0.7; }
    s.life -= dt;
    if (s.life <= 0) sparks.splice(i, 1);
  }
  return sparks.length;
}

// burstAlive(pool) — live spark count (0 when nothing is bursting).
export function burstAlive(pool) {
  return pool.sparks.length;
}

// makeBurstView(pool) — THREE.Points drawing the pool: one draw call,
// warm orange sparks that dim as they age (colour scaled by remaining
// life in syncBurstView). Dead slots sit far underground, out of sight.
export function makeBurstView(pool) {
  const max = pool.cap;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(max * 3);
  const colours = new Float32Array(max * 3);
  for (let i = 0; i < max; i++) positions[i * 3 + 1] = -100;
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.55,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.userData.pool = pool;
  return points;
}

// syncBurstView(view, pool) — copy the live pool into the Points buffers:
// position per spark, colour orange scaled by remaining life so sparks
// fade out instead of blinking off.
export function syncBurstView(view, pool) {
  const pos = view.geometry.attributes.position.array;
  const col = view.geometry.attributes.color.array;
  const sparks = pool.sparks;
  for (let i = 0; i < pool.cap; i++) {
    const s = sparks[i];
    if (!s) {
      pos[i * 3 + 1] = -100;
      col[i * 3] = 0; col[i * 3 + 1] = 0; col[i * 3 + 2] = 0;
      continue;
    }
    pos[i * 3] = s.x;
    pos[i * 3 + 1] = s.y;
    pos[i * 3 + 2] = s.z;
    const f = Math.max(0, s.life / s.maxLife);
    col[i * 3] = 1.0 * f; // orange: full red, half green, no blue
    col[i * 3 + 1] = 0.55 * f;
    col[i * 3 + 2] = 0.08 * f;
  }
  view.geometry.attributes.position.needsUpdate = true;
  view.geometry.attributes.color.needsUpdate = true;
}
