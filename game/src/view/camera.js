// camera.js — third-person chase cam, on-foot cam and title-screen orbit.
import * as THREE from '../../vendor/three/three.module.min.js';
import { LANDMARKS } from '../config.js';

// Title orbit: slow cinematic circle around the Boardwalk Wheel — radius 60 m,
// height 32 m, 0.03 rad/s (one orbit ~3.5 min), starting south of the wheel
// over the beach (angle 0 puts the camera at z = wheel.z + 60).
export const TITLE_ORBIT = {
  radius: 60,
  height: 32,
  speed: 0.03, // rad/s
  wheel: { x: LANDMARKS.wheel.x, z: LANDMARKS.wheel.z },
};

// titleOrbitAngle(angle, dt) — advances the stored title-orbit angle by the
// orbit speed; main.js keeps the angle so HOW TO PLAY can preserve it.
export function titleOrbitAngle(angle, dt) {
  return (angle + TITLE_ORBIT.speed * dt) % (Math.PI * 2);
}

// setTitleOrbit(camera, angle) — places the camera on the title orbit at the
// given angle, looking north at the wheel + skyline.
export function setTitleOrbit(camera, angle) {
  const w = TITLE_ORBIT.wheel;
  camera.position.set(
    w.x + Math.sin(angle) * TITLE_ORBIT.radius,
    TITLE_ORBIT.height,
    w.z + Math.cos(angle) * TITLE_ORBIT.radius,
  );
  camera.lookAt(w.x, 14, w.z);
}

// setFixedCamera(camera, position, lookAt) — place the camera at an exact
// staged pose (photo mode): position {x,y,z}, lookAt {x,y,z}. Also snaps
// the smoothed chase position (userData.pos) to the pose, so the next
// updateCamera call does not drag the camera back across the map.
export function setFixedCamera(camera, position, lookAt) {
  camera.position.set(position.x, position.y, position.z);
  camera.userData.pos.set(position.x, position.y, position.z);
  camera.lookAt(lookAt.x, lookAt.y, lookAt.z);
}

// snapChaseCamera(camera, target) — snap the smoothed chase camera to its
// ideal pose behind `target` right now (no lerp): used after a world reset
// (new game / continue / quit to title) so the camera does not sweep
// across the whole city from wherever the old world left it.
export function snapChaseCamera(camera, target) {
  const fwd = { x: Math.sin(target.yaw), z: Math.cos(target.yaw) };
  camera.userData.pos.set(
    target.x - fwd.x * 8.5,
    3.4,
    target.z - fwd.z * 8.5,
  );
  camera.position.copy(camera.userData.pos);
  camera.lookAt(target.x + fwd.x * 5, 1.2, target.z + fwd.z * 5);
  camera.userData.camYaw = target.yaw;
}

// makeCamera() — perspective camera used for chase, on-foot and title views.
export function makeCamera() {
  const camera = new THREE.PerspectiveCamera(62, 1280 / 720, 0.1, 2000);
  camera.userData.camYaw = 0; // on-foot follow yaw (see updateCamera)
  camera.userData.pos = new THREE.Vector3(200, 32, 485);
  return camera;
}

// updateCamera(camera, target, dt, mode) — smooth third-person camera.
// target: { x, z, yaw, movingForward } — x/z/yaw of the car (chase) or the
// player (foot); movingForward is true only while walking straight forward
// (W, no strafe), reusing the sim's rule: the camera yaw follows the heading
// only while walking straight forward, and stays fixed while strafing or
// backing up. mode: 'chase' | 'foot'.
export function updateCamera(camera, target, dt, mode) {
  const pos = camera.userData.pos;
  const a = 1 - Math.exp(-5 * Math.max(0, dt)); // smoothing factor
  const fwd = { x: Math.sin(target.yaw), z: Math.cos(target.yaw) };

  if (mode === 'foot') {
    // On-foot: closer over-shoulder cam. Follow the heading only while the
    // player walks straight forward; strafing/backing up leaves camYaw fixed.
    if (target.movingForward) {
      const b = 1 - Math.exp(-3 * Math.max(0, dt));
      let d = target.yaw - camera.userData.camYaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      camera.userData.camYaw += d * b;
    }
    const cy = camera.userData.camYaw;
    const cx = Math.sin(cy);
    const cz = Math.cos(cy);
    const wantX = target.x - cx * 3.6;
    const wantY = 1.9;
    const wantZ = target.z - cz * 3.6;
    pos.x += (wantX - pos.x) * a;
    pos.y += (wantY - pos.y) * a;
    pos.z += (wantZ - pos.z) * a;
    camera.position.copy(pos);
    camera.lookAt(target.x + cx * 4, 1.3, target.z + cz * 4);
    return;
  }

  // Chase: behind the car, car big in frame (8.5 m back, 3.4 m up).
  const wantX = target.x - fwd.x * 8.5;
  const wantY = 3.4;
  const wantZ = target.z - fwd.z * 8.5;
  pos.x += (wantX - pos.x) * a;
  pos.y += (wantY - pos.y) * a;
  pos.z += (wantZ - pos.z) * a;
  camera.position.copy(pos);
  camera.lookAt(target.x + fwd.x * 5, 1.2, target.z + fwd.z * 5);
  camera.userData.camYaw = target.yaw;
}
