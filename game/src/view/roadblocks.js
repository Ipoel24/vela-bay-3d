// roadblocks.js — VBPD roadblocks at 3+ stars: striped barriers on the road
// ahead plus the "ROADBLOCK AHEAD" banner rule. The sim side (two blocks
// ~80 m and ~130 m ahead, made by makeRoadblocks in sim/police.js) only
// produces { x, z, yaw } positions; this file renders them and answers how
// close the nearest one is, so the HUD can warn the driver in time.
import * as THREE from '../../vendor/three/three.module.min.js';

// Banner rule: warn when the nearest roadblock is closer than this (m).
export const ROADBLOCK_BANNER_DIST = 80;
// How many barrier groups the view pools (the sim never makes more than 2).
export const ROADBLOCK_POOL = 2;

// nearestRoadblockDistance(px, pz, roadblocks) — distance (m) to the
// closest roadblock, or Infinity when there are none. Pure, Node-testable.
export function nearestRoadblockDistance(px, pz, roadblocks) {
  let best = Infinity;
  for (const b of roadblocks || []) {
    const d = Math.hypot(b.x - px, b.z - pz);
    if (d < best) best = d;
  }
  return best;
}

// roadblockAhead(px, pz, roadblocks) — true when a block is close enough
// that the driver needs the banner (inside ROADBLOCK_BANNER_DIST).
export function roadblockAhead(px, pz, roadblocks) {
  return nearestRoadblockDistance(px, pz, roadblocks) < ROADBLOCK_BANNER_DIST;
}

// Striped barrier texture: diagonal orange/white hazard stripes, painted
// once on a canvas and shared by every barrier plank.
function makeStripeTexture() {
  const S = 128;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = 32;
  const g = canvas.getContext('2d');
  g.fillStyle = '#f2f2f2';
  g.fillRect(0, 0, S, 32);
  g.fillStyle = '#ff6a00';
  for (let x = -32; x < S + 32; x += 32) {
    g.beginPath();
    g.moveTo(x, 32);
    g.lineTo(x + 16, 0);
    g.lineTo(x + 32, 0);
    g.lineTo(x + 16, 32);
    g.closePath();
    g.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// makeBarrier() — one striped barrier: a hazard-striped plank on two dark
// legs, with an amber beacon on top that pulses in syncRoadblockView.
// 4 meshes per barrier, 8 draw calls for the whole pool.
function makeBarrier(stripeTex) {
  const group = new THREE.Group();
  const plank = new THREE.Mesh(
    new THREE.BoxGeometry(4.4, 0.5, 0.15),
    new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.6 }),
  );
  plank.position.set(0, 0.85, 0);
  plank.castShadow = true;
  group.add(plank);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x2a2d30, roughness: 0.8 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.85, 0.5), legMat);
  legL.position.set(-1.9, 0.42, 0);
  group.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.85, 0.5), legMat);
  legR.position.set(1.9, 0.42, 0);
  group.add(legR);
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.9 });
  const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.3), beaconMat);
  beacon.position.set(0, 1.25, 0);
  group.add(beacon);
  group.userData.beaconMat = beaconMat;
  group.visible = false;
  return group;
}

// makeRoadblockView() — a Group pooling ROADBLOCK_POOL barriers, hidden
// until the sim reports blocks. Returned group carries userData.barriers.
export function makeRoadblockView() {
  const group = new THREE.Group();
  group.userData.kind = 'roadblocks';
  const stripeTex = makeStripeTexture();
  group.userData.barriers = [];
  for (let i = 0; i < ROADBLOCK_POOL; i++) {
    const barrier = makeBarrier(stripeTex);
    group.add(barrier);
    group.userData.barriers.push(barrier);
  }
  return group;
}

// syncRoadblockView(view, roadblocks, time) — place one pooled barrier on
// each live block (position + yaw from the sim), hide the spares, and pulse
// every visible beacon so the block reads from down the road.
export function syncRoadblockView(view, roadblocks, time = 0) {
  const barriers = view.userData.barriers;
  const blocks = roadblocks || [];
  const pulse = 0.55 + 0.45 * Math.sin(time * 6);
  for (let i = 0; i < barriers.length; i++) {
    const barrier = barriers[i];
    const block = blocks[i];
    if (!block) {
      barrier.visible = false;
      continue;
    }
    barrier.visible = true;
    barrier.position.set(block.x, 0, block.z);
    barrier.rotation.y = block.yaw || 0;
    barrier.userData.beaconMat.opacity = pulse;
  }
}
