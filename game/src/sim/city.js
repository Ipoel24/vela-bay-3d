// city.js — Vela Bay districts, road graph, blocks/buildings, landmarks and spawn points.
import { makeRng } from './rng.js';
import { CITY_SIZE, ROAD_SPACING, LANDMARKS } from '../config.js';

// Five districts as non-overlapping rectangles covering the whole city.
export const DISTRICTS = [
  { name: 'Coral Heights', minX: 0, maxX: 350, minZ: 0, maxZ: 125 },
  { name: 'Neon Row', minX: 0, maxX: 175, minZ: 125, maxZ: 350 },
  { name: 'The Strip', minX: 175, maxX: 350, minZ: 125, maxZ: 350 },
  { name: 'Dockside', minX: 350, maxX: 500, minZ: 0, maxZ: 350 },
  { name: 'Old Marina', minX: 0, maxX: 500, minZ: 350, maxZ: 500 },
];

// District containing a point (x, z); falls back to 'Old Marina' at the south edge.
export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    if (x >= d.minX && x < d.maxX && z >= d.minZ && z < d.maxZ) return d.name;
  }
  return 'Old Marina';
}

// Points that must never be covered by a generated building footprint.
const PROTECTED_POINTS = [
  LANDMARKS.garage,
  LANDMARKS.office,
  LANDMARKS.m1Drop,
  LANDMARKS.wheel,
  LANDMARKS.m3Drop,
  LANDMARKS.spire,
];

// Build the whole city deterministically from a seed.
export function buildCity(seed) {
  const rng = makeRng(seed);
  const buildings = [];

  // Vela Spire: solid 18x18 m AABB (h=90), collides and blocks line of sight.
  buildings.push({
    name: 'Vela Spire', x: LANDMARKS.spire.x, z: LANDMARKS.spire.z,
    w: 18, d: 18, h: 90,
    minX: LANDMARKS.spire.x - 9, maxX: LANDMARKS.spire.x + 9,
    minZ: LANDMARKS.spire.z - 9, maxZ: LANDMARKS.spire.z + 9,
    district: districtAt(LANDMARKS.spire.x, LANDMARKS.spire.z),
  });

  // M5 fix: Boardwalk Wheel base collider. Half-width ~8 m, so the M1 pickup
  // at (200,425) radius 12 m stays reachable via the ring around the base.
  buildings.push({
    name: 'Boardwalk Wheel base', x: LANDMARKS.wheel.x, z: LANDMARKS.wheel.z,
    w: 16, d: 16, h: 30,
    minX: LANDMARKS.wheel.x - 8, maxX: LANDMARKS.wheel.x + 8,
    minZ: LANDMARKS.wheel.z - 8, maxZ: LANDMARKS.wheel.z + 8,
    district: districtAt(LANDMARKS.wheel.x, LANDMARKS.wheel.z),
  });

  // One generated building per road block, kept off the roads and off every
  // protected point. The Spire block (200-250, 200-250) is left empty.
  const blocksPerSide = CITY_SIZE / ROAD_SPACING;
  for (let bx = 0; bx < blocksPerSide; bx++) {
    for (let bz = 0; bz < blocksPerSide; bz++) {
      const blockMinX = bx * ROAD_SPACING;
      const blockMinZ = bz * ROAD_SPACING;
      if (blockMinX === 200 && blockMinZ === 200) continue; // Spire block
      const w = 14 + rng.next() * 10;
      const d = 14 + rng.next() * 10;
      const cx = blockMinX + ROAD_SPACING / 2 + (rng.next() - 0.5) * 12;
      const cz = blockMinZ + ROAD_SPACING / 2 + (rng.next() - 0.5) * 12;
      const b = {
        name: 'Block building', x: cx, z: cz, w, d,
        h: 10 + rng.next() * 28,
        minX: cx - w / 2, maxX: cx + w / 2,
        minZ: cz - d / 2, maxZ: cz + d / 2,
        district: districtAt(cx, cz),
      };
      // Reject if it would cover a mission/landmark point (with 3 m margin)
      // or overlap the Spire / wheel-base colliders.
      const blocked = PROTECTED_POINTS.some(
        (p) => p.x > b.minX - 3 && p.x < b.maxX + 3 && p.z > b.minZ - 3 && p.z < b.maxZ + 3,
      ) || buildings.some(
        (o) => b.minX < o.maxX && b.maxX > o.minX && b.minZ < o.maxZ && b.maxZ > o.minZ,
      );
      if (!blocked) buildings.push(b);
    }
  }

  // Road graph: grid lines every ROAD_SPACING metres, nodes at intersections.
  const lines = [];
  for (let v = 0; v <= CITY_SIZE; v += ROAD_SPACING) lines.push(v);
  const nodes = [];
  for (const x of lines) {
    for (const z of lines) nodes.push({ x, z });
  }

  return {
    seed,
    size: CITY_SIZE,
    roadSpacing: ROAD_SPACING,
    districts: DISTRICTS,
    buildings,
    landmarks: {
      garage: { ...LANDMARKS.garage, name: "Marco's garage" },
      spire: { ...LANDMARKS.spire, name: 'Vela Spire' },
      office: { ...LANDMARKS.office, name: "Inez's office" },
      m1Drop: { ...LANDMARKS.m1Drop, name: 'M1 drop' },
      wheel: { ...LANDMARKS.wheel, name: 'Boardwalk Wheel' },
      m3Drop: { ...LANDMARKS.m3Drop, name: 'M3 drop' },
    },
    nodes,
    lines,
    spawnPoints: {
      playerStart: { x: 150, z: 140 },
      garage: { ...LANDMARKS.garage },
      taxiStand: { ...LANDMARKS.wheel },
      office: { ...LANDMARKS.office },
    },
  };
}

// True when a road node sits on the city's outer border (x or z at 0 or
// CITY_SIZE). Border nodes make poor police/mission spawns: a unit there
// has road on only one side and the player can only approach from inside.
export function isBorderNode(node) {
  return node.x <= 0 || node.x >= CITY_SIZE || node.z <= 0 || node.z >= CITY_SIZE;
}

// interiorNodes(city) — every road node that is NOT on the outer border.
// All city nodes are intersections (the graph is a 50 m grid); the interior
// ones are the preferred spawn pool — a police unit there can approach the
// player down two axes instead of one.
export function interiorNodes(city) {
  return city.nodes.filter((n) => !isBorderNode(n));
}

// nearestNode(city, x, z) — the road-graph node closest to (x, z), or null
// for an empty graph. Roadblocks, mission cars and spawn fallbacks all need
// "the nearest node to a point"; one helper keeps the search identical.
export function nearestNode(city, x, z) {
  let best = null;
  let bestD = Infinity;
  for (const n of city.nodes || []) {
    const d = Math.hypot(n.x - x, n.z - z);
    if (d < bestD) { bestD = d; best = n; }
  }
  return best;
}

// Route from (ax, az) to (bx, bz): x-first then z waypoints. Same point = one waypoint.
export function routeBetween(city, ax, az, bx, bz) {
  const waypoints = [{ x: ax, z: az }];
  if (ax !== bx) waypoints.push({ x: bx, z: az });
  if (az !== bz) waypoints.push({ x: bx, z: bz });
  return waypoints;
}

// True when the point (x, z) lies inside any building footprint.
export function isInsideBuilding(city, x, z) {
  return city.buildings.some(
    (b) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ,
  );
}

// Correct segment-vs-AABB slab test: true when segment (x1,z1)-(x2,z2) hits any building.
export function segmentHitsBuilding(city, x1, z1, x2, z2) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  for (const b of city.buildings) {
    let tMin = 0;
    let tMax = 1;
    let hit = true;
    for (const [p, d, lo, hi] of [[x1, dx, b.minX, b.maxX], [z1, dz, b.minZ, b.maxZ]]) {
      if (Math.abs(d) < 1e-9) {
        if (p < lo || p > hi) { hit = false; break; }
      } else {
        let t0 = (lo - p) / d;
        let t1 = (hi - p) / d;
        if (t0 > t1) { const t = t0; t0 = t1; t1 = t; }
        tMin = Math.max(tMin, t0);
        tMax = Math.min(tMax, t1);
        if (tMin > tMax) { hit = false; break; }
      }
    }
    if (hit) return true;
  }
  return false;
}
