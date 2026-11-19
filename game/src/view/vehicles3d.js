// vehicles3d.js — box-built car meshes with distinct silhouettes/colours per model, brake lights, reverse lights, headlights and damage smoke.
import * as THREE from '../../vendor/three/three.module.min.js';
import { CAR_DEFS } from '../sim/vehicles.js';

// Merge parts ({geo, x,y,z, rx,ry,rz, color}) into one vertex-colour
// BufferGeometry, so a whole multi-part body costs a single draw call.
function mergeParts(parts) {
  const pos = [];
  const norm = [];
  const col = [];
  const c = new THREE.Color();
  for (const p of parts) {
    const g = p.geo.toNonIndexed();
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(p.x, p.y, p.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(p.rx || 0, p.ry || 0, p.rz || 0)),
      new THREE.Vector3(1, 1, 1),
    );
    g.applyMatrix4(m);
    const pa = g.attributes.position.array;
    const na = g.attributes.normal.array;
    c.set(p.color);
    for (let i = 0; i < pa.length; i += 3) {
      pos.push(pa[i], pa[i + 1], pa[i + 2]);
      norm.push(na[i], na[i + 1], na[i + 2]);
      col.push(c.r, c.g, c.b);
    }
    g.dispose();
    p.geo.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

// One wheel-axle geometry: two cylinder wheels (axis along x) joined by an
// axle bar, centred on the axle so it can spin around its local x-axis.
function makeAxleGeometry() {
  const wheel = new THREE.CylinderGeometry(0.34, 0.34, 0.25, 12);
  return mergeParts([
    { geo: wheel, x: -0.85, y: 0, z: 0, rz: Math.PI / 2, color: 0x181818 },
    { geo: new THREE.CylinderGeometry(0.34, 0.34, 0.25, 12), x: 0.85, y: 0, z: 0, rz: Math.PI / 2, color: 0x181818 },
    { geo: box(1.7, 0.12, 0.12), x: 0, y: 0, z: 0, color: 0x2a2a2a },
  ]);
}

// Body silhouettes per model. Cars are built facing +z (front at +z), length
// along z, matching the sim (yaw 0 faces +z). Each body is one merged mesh.
function bodyPartsFor(model) {
  switch (model) {
    case 'cometa': // sports: low, long, spoiler
      return [
        { geo: box(1.9, 0.45, 4.5), x: 0, y: 0.45, z: 0, color: 0xd21f2b },
        { geo: box(1.6, 0.42, 1.9), x: 0, y: 0.88, z: -0.3, color: 0x1a1a1e },
        { geo: box(1.8, 0.06, 0.4), x: 0, y: 1.05, z: -2.15, color: 0x1a1a1e }, // spoiler
        { geo: box(0.08, 0.22, 0.08), x: -0.7, y: 0.92, z: -2.15, color: 0x1a1a1e },
        { geo: box(0.08, 0.22, 0.08), x: 0.7, y: 0.92, z: -2.15, color: 0x1a1a1e },
      ];
    case 'tiburon': // muscle: long hood, wide, cabin set back
      return [
        { geo: box(2.0, 0.6, 4.9), x: 0, y: 0.55, z: 0, color: 0x2a5a3a },
        { geo: box(1.7, 0.55, 1.9), x: 0, y: 1.1, z: -0.6, color: 0x14261a },
        { geo: box(2.02, 0.18, 0.5), x: 0, y: 0.62, z: 2.2, color: 0xc8c8c8 }, // chrome bumper
      ];
    case 'taxi': // Vela Taxi: yellow sedan + roof sign
      return [
        { geo: box(1.9, 0.55, 4.4), x: 0, y: 0.55, z: 0, color: 0xffd21f },
        { geo: box(1.7, 0.5, 2.2), x: 0, y: 1.05, z: -0.2, color: 0xffe9a8 },
        { geo: box(0.9, 0.28, 0.35), x: 0, y: 1.42, z: -0.2, color: 0xf2f2f2 }, // TAXI sign
        { geo: box(1.92, 0.12, 4.42), x: 0, y: 0.62, z: 0, color: 0x1a1a1a }, // checker band
      ];
    case 'police': // VBPD Patrol: black body, white cabin + doors, light bar
      return [
        { geo: box(1.9, 0.55, 4.4), x: 0, y: 0.55, z: 0, color: 0x14161a },
        { geo: box(1.7, 0.5, 2.2), x: 0, y: 1.05, z: -0.2, color: 0xf2f2f2 },
        { geo: box(1.92, 0.3, 2.4), x: 0, y: 0.55, z: -0.2, color: 0xf2f2f2 }, // white doors
      ];
    case 'van': // Lumen Van: tall boxy delivery van
      return [
        { geo: box(2.0, 1.6, 4.6), x: 0, y: 1.05, z: -0.2, color: 0xe8e8e8 },
        { geo: box(1.9, 0.5, 0.9), x: 0, y: 0.55, z: 2.0, color: 0x3a7ac9 }, // cab nose
        { geo: box(2.02, 0.25, 4.0), x: 0, y: 1.3, z: -0.2, color: 0x3a7ac9 }, // blue stripe
      ];
    case 'brisa': // sedan (default)
    default:
      return [
        { geo: box(1.9, 0.55, 4.4), x: 0, y: 0.55, z: 0, color: 0x4a6a8a },
        { geo: box(1.7, 0.5, 2.2), x: 0, y: 1.05, z: -0.2, color: 0x2a3a4a },
      ];
  }
}

// Soft round smoke texture for the damage-smoke sprite.
function makeSmokeTexture() {
  const S = 64;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(120, 120, 120, 0.9)');
  grad.addColorStop(1, 'rgba(120, 120, 120, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(canvas);
}
let smokeTexture = null;

// makeCarMesh(model) — box-built mesh for a sim car model. Returns a Group
// with userData holding wheel groups, brake-light material, headlight and
// smoke sprite for syncCarMesh(). 4 draw calls per car (body, 2 axles,
// brake lights) + a police light bar + a smoke sprite only while damaged.
export function makeCarMesh(model) {
  const def = CAR_DEFS[model] || CAR_DEFS.brisa;
  const group = new THREE.Group();
  group.userData.model = model;
  group.userData.def = def;

  const body = new THREE.Mesh(
    mergeParts(bodyPartsFor(model)),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.35 }),
  );
  body.castShadow = true;
  group.add(body);

  // Wheels: one merged axle mesh per axle, wrapped in a group so the front
  // axle can steer (group.rotation.y) while the mesh spins (rotation.x).
  const axleMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const frontAxle = new THREE.Group();
  frontAxle.position.set(0, 0.34, 1.45);
  const frontWheels = new THREE.Mesh(makeAxleGeometry(), axleMat);
  frontWheels.castShadow = true;
  frontAxle.add(frontWheels);
  group.add(frontAxle);
  const rearAxle = new THREE.Group();
  rearAxle.position.set(0, 0.34, -1.45);
  const rearWheels = new THREE.Mesh(makeAxleGeometry(), axleMat);
  rearWheels.castShadow = true;
  rearAxle.add(rearWheels);
  group.add(rearAxle);

  // Brake lights: two red boxes at the rear, emissive toggled by syncCarMesh.
  const brakeMat = new THREE.MeshStandardMaterial({
    color: 0x330000, emissive: 0xff1a1a, emissiveIntensity: 0.15,
  });
  const brakes = new THREE.Mesh(
    mergeParts([
      { geo: box(0.45, 0.14, 0.06), x: -0.65, y: 0.72, z: -2.21, color: 0xff1a1a },
      { geo: box(0.45, 0.14, 0.06), x: 0.65, y: 0.72, z: -2.21, color: 0xff1a1a },
    ]),
    brakeMat,
  );
  group.add(brakes);

  // Reverse lights: two small white boxes at the rear, lit only while the
  // car actually moves backwards (speed < -0.5 m/s) — parked and forward
  // cars stay dark, so reversing traffic reads at a glance.
  const reverseMat = new THREE.MeshStandardMaterial({
    color: 0x222222, emissive: 0xffffff, emissiveIntensity: 0.1,
  });
  const reverse = new THREE.Mesh(
    mergeParts([
      { geo: box(0.3, 0.12, 0.06), x: -0.3, y: 0.5, z: -2.21, color: 0xf2f2f2 },
      { geo: box(0.3, 0.12, 0.06), x: 0.3, y: 0.5, z: -2.21, color: 0xf2f2f2 },
    ]),
    reverseMat,
  );
  group.add(reverse);

  // Police light bar: red + blue boxes on the roof (police only).
  if (model === 'police') {
    const bar = new THREE.Mesh(
      mergeParts([
        { geo: box(0.5, 0.16, 0.3), x: -0.35, y: 1.38, z: -0.2, color: 0xff2020 },
        { geo: box(0.5, 0.16, 0.3), x: 0.35, y: 1.38, z: -0.2, color: 0x2040ff },
      ]),
      new THREE.MeshBasicMaterial({ vertexColors: true }),
    );
    group.add(bar);
  }

  // Headlight: one SpotLight aimed ahead, on only when driving at night.
  const headlight = new THREE.SpotLight(0xffe9b8, 0, 40, 0.5, 0.4, 1.2);
  headlight.position.set(0, 0.8, 2.2);
  const headTarget = new THREE.Object3D();
  headTarget.position.set(0, 0, 14);
  group.add(headTarget);
  headlight.target = headTarget;
  group.add(headlight);

  // Damage smoke: grey sprite above the car, visible only when hurt.
  if (!smokeTexture) smokeTexture = makeSmokeTexture();
  const smokeMat = new THREE.SpriteMaterial({
    map: smokeTexture, transparent: true, opacity: 0, depthWrite: false,
  });
  const smoke = new THREE.Sprite(smokeMat);
  smoke.position.set(0, 1.8, -0.5);
  smoke.scale.set(2, 2, 1);
  smoke.visible = false;
  group.add(smoke);

  group.userData.frontAxle = frontAxle;
  group.userData.frontWheels = frontWheels;
  group.userData.rearWheels = rearWheels;
  group.userData.brakeMat = brakeMat;
  group.userData.reverseMat = reverseMat;
  group.userData.headlight = headlight;
  group.userData.smoke = smoke;
  group.userData.prevYaw = 0;
  group.userData.prevSpeed = 0;
  group.userData.wheelSpin = 0;
  group.userData.steerAngle = 0;
  return group;
}

// syncCarMesh(mesh, car, dt, night = 0) — copies the sim car into its mesh:
// position/rotation from the sim car, wheels steer (inferred from yaw rate)
// and spin with speed, brake lights, headlights and damage smoke.
// L1 FIX (exact): the "decelerating hard" brake-light test compares
// PER-SECOND deceleration: (prevSpeed - car.speed) / dt > 2 — NOT a fixed
// per-frame 0.15 (which lit the lights while merely coasting above ~21 m/s).
export function syncCarMesh(mesh, car, dt, night = 0) {
  const u = mesh.userData;
  mesh.position.set(car.x, 0, car.z);
  mesh.rotation.y = car.yaw;

  const safeDt = dt > 0 ? dt : 1e-3;
  // Steering: infer from yaw rate, smoothed, clamped to a plausible angle.
  let dYaw = car.yaw - u.prevYaw;
  while (dYaw > Math.PI) dYaw -= Math.PI * 2;
  while (dYaw < -Math.PI) dYaw += Math.PI * 2;
  const targetSteer = Math.max(-0.5, Math.min(0.5, (dYaw / safeDt) * 0.08));
  u.steerAngle += (targetSteer - u.steerAngle) * Math.min(1, dt * 10);
  u.frontAxle.rotation.y = u.steerAngle;
  u.prevYaw = car.yaw;

  // Wheel spin from road speed (wheel radius 0.34 m).
  u.wheelSpin += (car.speed * safeDt) / 0.34;
  u.frontWheels.rotation.x = u.wheelSpin;
  u.rearWheels.rotation.x = u.wheelSpin;

  // Brake lights: per-second deceleration over 2 m/s^2.
  const decel = (u.prevSpeed - car.speed) / safeDt;
  const braking = decel > 2;
  u.brakeMat.emissiveIntensity = braking ? 2.5 : 0.15;
  u.prevSpeed = car.speed;

  // Reverse lights: lit only while actually moving backwards.
  u.reverseMat.emissiveIntensity = car.speed < -0.5 ? 2.0 : 0.1;

  // Headlights: on when driving at night.
  const driving = Math.abs(car.speed) > 0.5;
  u.headlight.intensity = night > 0.25 && driving ? 80 : 0;

  // Damage smoke when condition is low (condition < 50), thicker as it worsens.
  const cond = car.condition ?? 100;
  if (cond < 50) {
    u.smoke.visible = true;
    const hurt = 1 - cond / 50;
    u.smoke.material.opacity = hurt * 0.6;
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    const s = 1.6 + hurt * 1.6 + Math.sin(now * 0.004) * 0.2;
    u.smoke.scale.set(s, s, 1);
  } else {
    u.smoke.visible = false;
    u.smoke.material.opacity = 0;
  }
}
