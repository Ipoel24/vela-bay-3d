// characters3d.js — low-poly blocky ped and player meshes (one merged mesh per character).
import * as THREE from '../../vendor/three/three.module.min.js';

// Merge a list of boxes ({w,h,d, x,y,z, color}) into one vertex-colour
// BufferGeometry, so each character costs a single draw call.
function mergeBoxes(parts) {
  const pos = [];
  const norm = [];
  const col = [];
  const c = new THREE.Color();
  for (const p of parts) {
    const g = new THREE.BoxGeometry(p.w, p.h, p.d).toNonIndexed();
    const m = new THREE.Matrix4().makeTranslation(p.x, p.y, p.z);
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
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}

const SKIN_TONES = [0xd9a066, 0xc98a5a, 0x8a5a3a, 0xe8b88a];
const SHIRT_COLORS = [0x4a7ac9, 0x7ac94a, 0xe8e4da, 0xc94a7a, 0x8a6ac9, 0xe8a34a, 0x3a9a8a];

// makePedMesh() — a blocky pedestrian: legs, torso (random shirt), head,
// arms at the sides. One merged mesh; the character faces +z at yaw 0.
export function makePedMesh() {
  const skin = SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)];
  const shirt = SHIRT_COLORS[Math.floor(Math.random() * SHIRT_COLORS.length)];
  const mesh = new THREE.Mesh(
    mergeBoxes([
      { w: 0.45, h: 0.55, d: 0.28, x: 0, y: 0.28, z: 0, color: 0x2a2f38 }, // legs
      { w: 0.52, h: 0.6, d: 0.3, x: 0, y: 0.85, z: 0, color: shirt }, // torso
      { w: 0.32, h: 0.32, d: 0.32, x: 0, y: 1.32, z: 0, color: skin }, // head
      { w: 0.12, h: 0.5, d: 0.14, x: -0.32, y: 0.85, z: 0, color: shirt }, // left arm
      { w: 0.12, h: 0.5, d: 0.14, x: 0.32, y: 0.85, z: 0, color: shirt }, // right arm
    ]),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
  );
  mesh.castShadow = true;
  return mesh;
}

// makePlayerMesh() — Dario "Dash" Vega: red jacket (distinct from peds),
// dark navy trousers, cap. One merged mesh, faces +z at yaw 0.
export function makePlayerMesh() {
  const mesh = new THREE.Mesh(
    mergeBoxes([
      { w: 0.45, h: 0.55, d: 0.28, x: 0, y: 0.28, z: 0, color: 0x1a2030 }, // trousers
      { w: 0.54, h: 0.62, d: 0.32, x: 0, y: 0.86, z: 0, color: 0xc22020 }, // red jacket
      { w: 0.32, h: 0.32, d: 0.32, x: 0, y: 1.34, z: 0, color: 0xd9a066 }, // head
      { w: 0.38, h: 0.1, d: 0.38, x: 0, y: 1.53, z: 0, color: 0x14161a }, // cap
      { w: 0.13, h: 0.52, d: 0.15, x: -0.34, y: 0.86, z: 0, color: 0xc22020 }, // left arm
      { w: 0.13, h: 0.52, d: 0.15, x: 0.34, y: 0.86, z: 0, color: 0xc22020 }, // right arm
    ]),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
  );
  mesh.castShadow = true;
  return mesh;
}

// syncDownedMesh(mesh, down) — a downed ped lies flat on the ground (rolled
// onto its back, lifted slightly so the body never z-fights the road);
// an upright ped stands normally. Call AFTER syncCharacterMesh, which
// resets the position and yaw every frame.
export function syncDownedMesh(mesh, down) {
  if (down) {
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = 0.25;
  } else {
    mesh.rotation.x = 0;
    mesh.position.y = 0;
  }
}

// syncCharacterMesh(mesh, x, z, yaw) — places a ped/player mesh on the ground
// at (x, z) facing yaw (0 faces +z, matching the sim).
export function syncCharacterMesh(mesh, x, z, yaw) {
  mesh.position.set(x, 0, z);
  mesh.rotation.y = yaw;
}
