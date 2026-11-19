// buildings.js — instanced city buildings, Vela Spire tower, neon signs and the Boardwalk Wheel ferris wheel.
import * as THREE from '../../vendor/three/three.module.min.js';
import { LANDMARKS } from '../config.js';

// Merge a list of boxes ({w,h,d, x,y,z, ry, rz, color}) into one BufferGeometry
// with vertex colours, so a whole multi-part object costs a single draw call.
function mergeBoxes(parts) {
  const pos = [];
  const norm = [];
  const col = [];
  const c = new THREE.Color();
  for (const p of parts) {
    const g = new THREE.BoxGeometry(p.w, p.h, p.d).toNonIndexed();
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(p.x, p.y, p.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.ry || 0, p.rz || 0)),
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
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}

// District palettes, lightened ~15% vs a dark default so the city reads
// sun-soaked at golden hour instead of muddy.
const DISTRICT_COLORS = {
  'Coral Heights': 0xe8b48f,
  'Neon Row': 0xb78fd6,
  'The Strip': 0xe8d27a,
  'Dockside': 0x8fb8c9,
  'Old Marina': 0xf0e6d2,
};

// buildBuildings(scene, city) — adds all buildings as one InstancedMesh per
// district palette, the Vela Spire tower (18x18 footprint at 225,225, h=90,
// emissive beacon), neon signs in Neon Row, and the ferris wheel at (200,425)
// with support legs reaching the ground. Returns { meshes, dispose() }.
export function buildBuildings(scene, city) {
  const meshes = [];
  const disposables = new Set();
  const track = (mesh) => {
    meshes.push(mesh);
    if (mesh.geometry) disposables.add(mesh.geometry);
    if (mesh.material) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => disposables.add(m));
    }
    return mesh;
  };

  // Instanced buildings: one InstancedMesh per district. The Spire and the
  // wheel base get their own meshes below, so they are skipped here.
  const byDistrict = new Map();
  for (const b of city.buildings) {
    if (b.name === 'Vela Spire' || b.name === 'Boardwalk Wheel base') continue;
    if (!byDistrict.has(b.district)) byDistrict.set(b.district, []);
    byDistrict.get(b.district).push(b);
  }
  const dummy = new THREE.Object3D();
  for (const [district, list] of byDistrict) {
    const mat = new THREE.MeshStandardMaterial({
      color: DISTRICT_COLORS[district] ?? 0xcfc8b8,
      roughness: 0.9,
      metalness: 0.05,
      // Facade emissive stays LOW at 0.18 — windows glow via the render.js
      // instanced panes, not through bright facades.
      emissive: 0x332211,
      emissiveIntensity: 0.18,
    });
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, list.length);
    list.forEach((b, i) => {
      dummy.position.set(b.x, b.h / 2, b.z);
      dummy.scale.set(b.w, b.h, b.d);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(track(mesh));
  }

  // Vela Spire: solid 18x18 m footprint at (225,225), h=90, glassy blue-grey.
  const spire = new THREE.Mesh(
    new THREE.BoxGeometry(18, 90, 18),
    new THREE.MeshStandardMaterial({
      color: 0x9fc4e0, roughness: 0.25, metalness: 0.6,
      emissive: 0x1a2a44, emissiveIntensity: 0.18,
    }),
  );
  spire.position.set(LANDMARKS.spire.x, 45, LANDMARKS.spire.z);
  spire.castShadow = true;
  spire.receiveShadow = true;
  scene.add(track(spire));

  // Spire beacon: red emissive tip + thin antenna, visible from anywhere.
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(1.1, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
  );
  beacon.position.set(LANDMARKS.spire.x, 91.5, LANDMARKS.spire.z);
  scene.add(track(beacon));
  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.25, 6, 6),
    new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.6 }),
  );
  antenna.position.set(LANDMARKS.spire.x, 93, LANDMARKS.spire.z);
  scene.add(track(antenna));

  // Boardwalk Wheel (ferris wheel) at (200,425): rim, hub, spokes and cabins
  // in one merged vertex-colour mesh, plus two support legs reaching the
  // ground (boxes ~1.2 x 24 m, tilted in to meet the hub at 24 m up).
  const wheel = { x: LANDMARKS.wheel.x, z: LANDMARKS.wheel.z };
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(13, 0.5, 8, 40),
    new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.5, metalness: 0.3 }),
  );
  rim.position.set(wheel.x, 24, wheel.z);
  rim.castShadow = true;
  scene.add(track(rim));
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.2, 2.5, 12),
    new THREE.MeshStandardMaterial({ color: 0xdd3355, roughness: 0.5 }),
  );
  hub.rotation.x = Math.PI / 2;
  hub.position.set(wheel.x, 24, wheel.z);
  scene.add(track(hub));
  // Spokes: 4 crossed bars through the hub, merged into one mesh.
  const spokeParts = [];
  for (let k = 0; k < 4; k++) {
    spokeParts.push({
      w: 0.35, h: 26, d: 0.35, x: wheel.x, y: 24, z: wheel.z,
      rz: (k * Math.PI) / 4, color: 0xd8d4ca,
    });
  }
  const spokes = new THREE.Mesh(
    mergeBoxes(spokeParts),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }),
  );
  spokes.castShadow = true;
  scene.add(track(spokes));
  // Support legs: 1.2 x 24 m boxes, tilted in so their tops meet the hub.
  const legParts = [
    { w: 1.2, h: 24, d: 1.2, x: wheel.x - 5.5, y: 12, z: wheel.z, rz: 0.24, color: 0x5a5f66 },
    { w: 1.2, h: 24, d: 1.2, x: wheel.x + 5.5, y: 12, z: wheel.z, rz: -0.24, color: 0x5a5f66 },
  ];
  const legs = new THREE.Mesh(
    mergeBoxes(legParts),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
  );
  legs.castShadow = true;
  scene.add(track(legs));
  // Cabins: 8 colourful gondolas around the rim, one InstancedMesh.
  const cabinColors = [0xff5a5a, 0xffd21f, 0x2fd8ff, 0x39ff88, 0xff9a3c, 0xc95aff, 0xff5a9a, 0x7affd9];
  const cabins = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1.6, 1.6, 1.6),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }),
    8,
  );
  const col = new THREE.Color();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    dummy.position.set(wheel.x + Math.sin(a) * 13, 24 + Math.cos(a) * 13, wheel.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    cabins.setMatrixAt(i, dummy.matrix);
    cabins.setColorAt(i, col.set(cabinColors[i]));
  }
  cabins.instanceMatrix.needsUpdate = true;
  if (cabins.instanceColor) cabins.instanceColor.needsUpdate = true;
  cabins.castShadow = true;
  scene.add(track(cabins));

  // Neon signs (Neon Row): bright emissive boxes on building faces, merged
  // into a single vertex-colour mesh (one draw call for all signs).
  const neonPalette = [0xff2fb3, 0x2fd8ff, 0xffe14d, 0x39ff88];
  const signParts = [];
  const neonRow = (byDistrict.get('Neon Row') || []).slice(0, 4);
  neonRow.forEach((b, i) => {
    signParts.push({
      w: 5, h: 1.1, d: 0.35,
      x: b.x, y: Math.min(b.h - 1.5, 9), z: b.maxZ + 0.25,
      color: neonPalette[i % neonPalette.length],
    });
  });
  if (signParts.length) {
    const signs = new THREE.Mesh(
      mergeBoxes(signParts),
      new THREE.MeshBasicMaterial({ vertexColors: true }),
    );
    scene.add(track(signs));
  }

  // Marco's garage forecourt + sign: the garage is a gameplay place (G
  // opens here, M2 delivers here, F sells here), but the base city gave it
  // no visual identity — the garage shot read as "a car on a road". A dark
  // forecourt pad marks the parking bay at (150,125), and a yellow sign
  // board on the sidewalk corner (154.5,128.5) names the place. The sign
  // stands clear of the road and of the garage-shot sight line, so it
  // never occludes the parked car.
  const forecourt = new THREE.Mesh(
    new THREE.PlaneGeometry(13, 11),
    new THREE.MeshStandardMaterial({ color: 0x33363c, roughness: 0.95 }),
  );
  forecourt.rotation.x = -Math.PI / 2;
  forecourt.position.set(LANDMARKS.garage.x, 0.02, LANDMARKS.garage.z);
  forecourt.receiveShadow = true;
  scene.add(track(forecourt));
  const garageSign = new THREE.Mesh(
    mergeBoxes([
      { w: 0.18, h: 2.6, d: 0.18, x: 154.5, y: 1.3, z: 128.5, color: 0x2f3338 }, // post
      { w: 2.6, h: 1.1, d: 0.14, x: 154.5, y: 2.9, z: 128.5, color: 0xffd21f }, // yellow board
      { w: 2.6, h: 0.22, d: 0.16, x: 154.5, y: 2.45, z: 128.5, color: 0x1a1a1a }, // dark stripe
    ]),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
  );
  garageSign.castShadow = true;
  scene.add(track(garageSign));

  // dispose() — removes every mesh from the scene and frees its geometry
  // and materials (shared geometries are disposed once via the Set).
  function dispose() {
    for (const mesh of meshes) scene.remove(mesh);
    for (const d of disposables) d.dispose();
    meshes.length = 0;
    disposables.clear();
  }

  return { meshes, dispose };
}
