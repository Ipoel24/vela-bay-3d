// heli.js — VBPD helicopter view: box-built airframe, spinning main rotor,
// and the spotlight cone that is the visible part of the chase at night.
// The sim side (spawn at 3+ stars, despawn at 2 or less, 30 m orbit around
// the player) lives in sim/police.js; this file only renders game.heli.
// The body sits ~26 m up, above the chase camera, so it may sit out of
// frame — the cone shining down toward the player is what the player sees.
import * as THREE from '../../vendor/three/three.module.min.js';

// Orbit radius (m) the sim holds the heli at — kept here so the view and
// the sim agree on the geometry the spotlight has to cover.
export const HELI_ORBIT_RADIUS = 30;
// Height (m) of the airframe above the ground.
export const HELI_HEIGHT = 26;
// Spotlight cone: base radius on the ground, additive, faint — the spec
// value is ~0.16 opacity at full night.
export const SPOT_OPACITY = 0.16;
export const SPOT_BASE_RADIUS = 9;

// makeHeliMesh() — a Group with userData refs for syncHeliMesh: the main
// rotor (spins), the spotlight pivot (aimed at the player every frame),
// the cone material (opacity follows the night factor) and the ground pool.
export function makeHeliMesh() {
  const group = new THREE.Group();
  group.userData.kind = 'heli';

  const dark = new THREE.MeshStandardMaterial({ color: 0x1c2733, roughness: 0.5, metalness: 0.4 });
  const pale = new THREE.MeshStandardMaterial({ color: 0xd8dee6, roughness: 0.5, metalness: 0.2 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0e1a24, roughness: 0.15, metalness: 0.6 });

  // Airframe: dark belly + pale cabin + glass nose, built facing +z.
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 3.6), dark);
  body.position.set(0, 0, 0);
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.8, 1.6), pale);
  cabin.position.set(0, 0.35, 0.6);
  group.add(cabin);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 0.7), glass);
  nose.position.set(0, 0.1, 1.9);
  group.add(nose);
  // Tail boom + fin + tail rotor.
  const boom = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 3.4), dark);
  boom.position.set(0, 0.25, -3.2);
  group.add(boom);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.9), pale);
  fin.position.set(0, 0.7, -4.8);
  group.add(fin);
  const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.4, 0.14), pale);
  tailRotor.position.set(0.35, 0.3, -4.8);
  group.add(tailRotor);
  // Skids.
  const skidGeo = new THREE.BoxGeometry(0.12, 0.12, 3.0);
  const skidL = new THREE.Mesh(skidGeo, dark);
  skidL.position.set(-0.9, -0.85, 0);
  group.add(skidL);
  const skidR = new THREE.Mesh(skidGeo, dark);
  skidR.position.set(0.9, -0.85, 0);
  group.add(skidR);
  // Main rotor: one long thin blade pair on a mast, spun by syncHeliMesh.
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.7, 6), dark);
  mast.position.set(0, 0.85, 0);
  group.add(mast);
  const rotor = new THREE.Group();
  rotor.position.set(0, 1.2, 0);
  const bladeGeo = new THREE.BoxGeometry(7.6, 0.06, 0.34);
  const blade = new THREE.Mesh(bladeGeo, pale);
  rotor.add(blade);
  const blade2 = new THREE.Mesh(bladeGeo, pale);
  blade2.rotation.y = Math.PI / 2;
  rotor.add(blade2);
  group.add(rotor);

  // Spotlight: a pivot at the belly, aimed at the player each frame. The
  // cone is open-ended (no cap), additive, warm white; its apex sits at
  // the belly and its base opens onto the ground ~26 m below. A soft disc
  // rides at the base so the pool of light reads on the road at night.
  const pivot = new THREE.Group();
  pivot.position.set(0, -0.6, 0.8);
  const coneGeo = new THREE.ConeGeometry(SPOT_BASE_RADIUS, HELI_HEIGHT, 24, 1, true);
  const coneMat = new THREE.MeshBasicMaterial({
    color: 0xfff2c0,
    transparent: true,
    opacity: SPOT_OPACITY,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.position.set(0, -HELI_HEIGHT / 2, 0);
  pivot.add(cone);
  const poolGeo = new THREE.CircleGeometry(SPOT_BASE_RADIUS, 24);
  poolGeo.rotateX(-Math.PI / 2);
  const poolMat = new THREE.MeshBasicMaterial({
    color: 0xffe9a8,
    transparent: true,
    opacity: SPOT_OPACITY * 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const pool = new THREE.Mesh(poolGeo, poolMat);
  pool.position.set(0, -HELI_HEIGHT + 0.1, 0);
  pivot.add(pool);
  group.add(pivot);

  group.userData.rotor = rotor;
  group.userData.tailRotor = tailRotor;
  group.userData.spotPivot = pivot;
  group.userData.coneMat = coneMat;
  group.userData.poolMat = poolMat;
  group.userData.spin = 0;
  return group;
}

// syncHeliMesh(mesh, heli, playerPos, dt, night = 0) — place the airframe at
// the sim heli position, spin the rotors, and aim the spotlight cone at the
// player. `heli` is { x, z } from stepPolice; `playerPos` is { x, z }.
// The cone opacity is the spec ~0.16 at full night and fades to a faint
// 0.06 by day, so the beam is always there but only reads after dark.
export function syncHeliMesh(mesh, heli, playerPos, dt, night = 0) {
  const u = mesh.userData;
  mesh.position.set(heli.x, HELI_HEIGHT, heli.z);
  mesh.visible = true;
  const safeDt = dt > 0 ? dt : 1e-3;
  u.spin += safeDt * 22;
  u.rotor.rotation.y = u.spin;
  u.tailRotor.rotation.z = u.spin * 2.4;
  // Aim: rotate the pivot so its local -y (the cone axis) points from the
  // belly at the player on the ground.
  const dx = playerPos.x - heli.x;
  const dz = playerPos.z - heli.z;
  const dir = new THREE.Vector3(dx, -HELI_HEIGHT, dz).normalize();
  u.spotPivot.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
  const glow = 0.4 + 0.6 * Math.max(0, Math.min(1, night));
  u.coneMat.opacity = SPOT_OPACITY * glow;
  u.poolMat.opacity = SPOT_OPACITY * 0.6 * glow;
}
