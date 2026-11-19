// render.js — renderer, scene, golden-hour sun + fog + sky, day/night cycle, stars, street lights, light pools and lit windows.
import * as THREE from '../../vendor/three/three.module.min.js';
import { nightFactor, phaseOf, sunDir, moonDir } from '../sim/clock.js';
import { makeRng } from '../sim/rng.js';
import { GAME_SEED, LANDMARKS } from '../config.js';

// Phase palettes: sky top/bottom, fog, sun colour/intensity, hemisphere intensity.
// Noon is deliberately bright with a blue sky; sunset keeps the golden-hour look.
const PHASE_STYLE = {
  dawn:    { top: 0x7f89c9, bot: 0xf2a56b, fog: 0xd9a184, sun: 0xffb37a, sunI: 1.6, hemi: 0.45 },
  morning: { top: 0x6fb3e8, bot: 0xcfe8f7, fog: 0xcfe0ea, sun: 0xfff2d8, sunI: 2.2, hemi: 0.60 },
  noon:    { top: 0x2f7fe0, bot: 0xbfe3f7, fog: 0xcfe6f2, sun: 0xffffff, sunI: 3.0, hemi: 0.75 },
  afternoon:{ top: 0x5ea4dd, bot: 0xf6d9a8, fog: 0xe8d3ae, sun: 0xffe6b0, sunI: 2.4, hemi: 0.60 },
  sunset:  { top: 0x4a4a8f, bot: 0xff9a3c, fog: 0xe89a5a, sun: 0xff8f3c, sunI: 2.6, hemi: 0.50 },
  evening: { top: 0x2c2c5e, bot: 0xb06a7a, fog: 0x6a5a78, sun: 0xff9a66, sunI: 0.9, hemi: 0.30 },
  night:   { top: 0x060a1c, bot: 0x0d1526, fog: 0x0a0f1e, sun: 0xff9a66, sunI: 0.0, hemi: 0.15 },
};

const CITY_CENTRE = { x: 250, z: 250 };

// makeRenderer(canvas) — WebGL renderer with soft shadows, ACES tone mapping
// and exposure 1.35. Returns the renderer (caller sizes it and drives resize).
export function makeRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(canvas.clientWidth || 1280, canvas.clientHeight || 720, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  return renderer;
}

// Ground texture: canvas-painted city plan — concrete blocks, asphalt road grid
// every 50 m, boardwalk strip and sand beach along the south edge (z 425-500).
// Canvas top is north (z = 0); canvas bottom is south (z = 500).
function makeGroundTexture() {
  const S = 1024;
  const px = (m) => (m / 500) * S;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const g = canvas.getContext('2d');
  g.fillStyle = '#7a7d72'; // concrete blocks, lightened
  g.fillRect(0, 0, S, S);
  // Boardwalk strip (z 425-450) and sand beach (z 450-500).
  g.fillStyle = '#8a6b4a';
  g.fillRect(0, px(425), S, px(25));
  g.fillStyle = '#d8bf8a';
  g.fillRect(0, px(450), S, px(50));
  // Roads: darker asphalt strips along every grid line.
  g.fillStyle = '#43474d';
  for (let v = 0; v <= 500; v += 50) {
    g.fillRect(px(v) - px(3.5), 0, px(7), S);
    g.fillRect(0, px(v) - px(3.5), S, px(7));
  }
  // Road centre dashes, pale.
  g.fillStyle = '#c8cdd2';
  for (let v = 0; v <= 500; v += 50) {
    for (let m = 10; m < 500; m += 20) {
      g.fillRect(px(m), px(v) - 1, px(6), 2);
      g.fillRect(px(v) - 1, px(m), 2, px(6));
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Sky dome: big gradient sphere (BackSide shader), colours driven per phase.
function makeSkyDome() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x2f7fe0) },
      bottomColor: { value: new THREE.Color(0xbfe3f7) },
    },
    vertexShader: 'varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 topColor; uniform vec3 bottomColor; varying vec3 vPos; void main(){ float h = normalize(vPos).y * 0.5 + 0.5; gl_FragColor = vec4(mix(bottomColor, topColor, pow(h, 0.8)), 1.0); }',
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 16), mat);
  dome.renderOrder = -1;
  return dome;
}

// Street-lamp positions: every other intersection (100 m grid). Lamps stand
// on sidewalk corners, NOT on the road: each pole is pushed 3 m in +x and
// +3 m in +z off its intersection, so no pole ever sits on a road centreline
// (a pole at (200,200) used to split the cover shot down the middle) and no
// pole can block the chase camera. L6 FIX (exact): the exclusion that keeps
// lamps clear of "the tower, the wheel and the garage" is centred on
// (150,125) — the garage — NOT (150,150).
function lampPositions() {
  const keep = [];
  const clear = [
    { x: LANDMARKS.spire.x, z: LANDMARKS.spire.z }, // the tower
    { x: LANDMARKS.wheel.x, z: LANDMARKS.wheel.z }, // the wheel
    { x: LANDMARKS.garage.x, z: LANDMARKS.garage.z }, // the garage (150,125)
  ];
  for (let x = 0; x <= 500; x += 100) {
    for (let z = 0; z <= 500; z += 100) {
      if (clear.some((c) => Math.hypot(x - c.x, z - c.z) < 25)) continue;
      keep.push({ x: x + 3, z: z + 3 });
    }
  }
  return keep;
}

// Radial-gradient disc texture for the warm light pools under each lamp.
function makePoolTexture() {
  const S = 128;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255, 205, 130, 1)');
  grad.addColorStop(0.5, 'rgba(255, 180, 90, 0.45)');
  grad.addColorStop(1, 'rgba(255, 170, 80, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(canvas);
}

// ~350 stars on a dome of radius 850, seeded so the sky is stable per run.
function makeStars() {
  const rng = makeRng(GAME_SEED + 3);
  const N = 350;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const a = rng.next() * Math.PI * 2;
    const e = Math.asin(rng.next() * 0.95 + 0.05); // above the horizon
    pos[i * 3] = Math.cos(a) * Math.cos(e) * 850;
    pos[i * 3 + 1] = Math.sin(e) * 850;
    pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 850;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xffffff, size: 1.6, sizeAttenuation: false,
    transparent: true, opacity: 0, depthWrite: false, fog: false,
  });
  return new THREE.Points(geo, mat);
}

// Lit windows: one InstancedMesh of small panes on building faces, seeded,
// ~55% lit with warm/cool/amber variety; unlit panes are near-black glass.
// Whole-mesh opacity follows the night factor (0 by day).
function makeLitWindows(city) {
  const rng = makeRng(GAME_SEED + 7);
  const panes = [];
  const litCols = [0xffc06a, 0xffd9a0, 0xff9a4d, 0x9ec8ff, 0xffe9b8]; // warm/cool/amber
  for (const b of city.buildings) {
    if (b.name === 'Vela Spire' || b.name === 'Boardwalk Wheel base') continue;
    const count = Math.max(3, Math.min(30, Math.round(((b.w + b.d) * b.h) / 52)));
    const floors = Math.max(1, Math.floor(b.h / 3.2));
    for (let i = 0; i < count; i++) {
      const face = rng.int(0, 3); // 0:+x 1:-x 2:+z 3:-z
      const floor = rng.int(0, floors - 1);
      const along = (rng.next() - 0.5) * 0.8; // fraction across the face
      const y = 2 + floor * 3.2 + 0.6;
      let x = b.x;
      let z = b.z;
      let ry = 0;
      if (face === 0) { x = b.maxX + 0.06; z = b.z + along * b.d; ry = Math.PI / 2; }
      if (face === 1) { x = b.minX - 0.06; z = b.z + along * b.d; ry = -Math.PI / 2; }
      if (face === 2) { z = b.maxZ + 0.06; x = b.x + along * b.w; ry = 0; }
      if (face === 3) { z = b.minZ - 0.06; x = b.x + along * b.w; ry = Math.PI; }
      const lit = rng.next() < 0.55;
      panes.push({ x, y, z, ry, color: lit ? litCols[rng.int(0, litCols.length - 1)] : 0x0a0c10 });
    }
  }
  const geo = new THREE.PlaneGeometry(0.9, 1.2);
  const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, fog: false });
  const mesh = new THREE.InstancedMesh(geo, mat, panes.length);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  panes.forEach((p, i) => {
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(0, p.ry, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, col.set(p.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.userData.paneCount = panes.length;
  return mesh;
}

// makeScene(city) — builds the whole static scene from the sim city:
// ground, sky dome, sun + moon + hemisphere lights, stars, street lamps,
// light pools and lit windows. Internals live on scene.userData.vela for
// updateDayNight(). Returns the scene.
export function makeScene(city) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbfe3f7);
  scene.fog = new THREE.Fog(0xcfe6f2, 150, 900);

  const sky = makeSkyDome();
  scene.add(sky);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(500, 500),
    new THREE.MeshStandardMaterial({ map: makeGroundTexture(), roughness: 0.95, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(250, 0, 250);
  ground.receiveShadow = true;
  scene.add(ground);

  // Golden-hour sun: shadow-casting directional light aimed at the city centre.
  const sun = new THREE.DirectionalLight(0xffffff, 3.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -280;
  sun.shadow.camera.right = 280;
  sun.shadow.camera.top = 280;
  sun.shadow.camera.bottom = -280;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 1200;
  sun.shadow.bias = -0.0005;
  sun.target.position.set(CITY_CENTRE.x, 0, CITY_CENTRE.z);
  scene.add(sun);
  scene.add(sun.target);

  // Moon: dim cool directional light, only up at night.
  const moon = new THREE.DirectionalLight(0x8fa8ff, 0);
  moon.target.position.set(CITY_CENTRE.x, 0, CITY_CENTRE.z);
  scene.add(moon);
  scene.add(moon.target);

  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.75);
  scene.add(hemi);

  // Stars: 1 draw call, opacity = nightFactor.
  const stars = makeStars();
  scene.add(stars);

  // Street lamps: one InstancedMesh for poles, one for heads (2 draw calls).
  // Fake lighting only — NO real PointLight per lamp.
  const lamps = lampPositions();
  const dummy = new THREE.Object3D();
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.2, 6);
  poleGeo.translate(0, 2.6, 0);
  const poles = new THREE.InstancedMesh(
    poleGeo, new THREE.MeshStandardMaterial({ color: 0x2f3338, roughness: 0.8 }), lamps.length,
  );
  const headGeo = new THREE.BoxGeometry(0.55, 0.18, 0.3);
  headGeo.translate(0, 5.25, 0);
  const heads = new THREE.InstancedMesh(
    headGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), lamps.length,
  );
  const headCol = new THREE.Color();
  lamps.forEach((p, i) => {
    dummy.position.set(p.x, 0, p.z);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);
    heads.setMatrixAt(i, dummy.matrix);
    heads.setColorAt(i, headCol.set(0x2a2d30)); // dark grey by day
  });
  poles.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  if (heads.instanceColor) heads.instanceColor.needsUpdate = true;
  scene.add(poles);
  scene.add(heads);

  // Light pools: one InstancedMesh of warm radial-gradient discs on the
  // ground under each lamp, additive blending, opacity = night * 0.65.
  const poolGeo = new THREE.CircleGeometry(3.2, 20);
  poolGeo.rotateX(-Math.PI / 2);
  const pools = new THREE.InstancedMesh(
    poolGeo,
    new THREE.MeshBasicMaterial({
      map: makePoolTexture(), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
    lamps.length,
  );
  lamps.forEach((p, i) => {
    dummy.position.set(p.x, 0.06, p.z);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    pools.setMatrixAt(i, dummy.matrix);
  });
  pools.instanceMatrix.needsUpdate = true;
  scene.add(pools);

  // Lit windows: one InstancedMesh, opacity = nightFactor.
  const windows = makeLitWindows(city);
  scene.add(windows);

  // Night-only elements cost +2 draw calls total (stars + light pools); the
  // lit-windows mesh is drawn always but fully transparent by day.
  scene.userData.vela = {
    sky, sun, moon, hemi, stars, heads, pools, windows,
    lampCount: lamps.length, headsLit: false,
  };
  return scene;
}

// updateDayNight(scene, clock) — drives sun/moon position, light colour and
// intensity, sky + fog colours, and every night element from the game clock.
// Sun position/intensity/colour come from sunDir/moonDir; toneMappingExposure
// stays 1.35; noon is deliberately bright with a blue sky.
export function updateDayNight(scene, clock) {
  const v = scene.userData.vela;
  if (!v) return;
  const phase = phaseOf(clock);
  const night = nightFactor(clock);
  const style = PHASE_STYLE[phase] || PHASE_STYLE.noon;
  const sd = sunDir(clock);
  const md = moonDir(clock);

  // Sun: placed from sunDir, warm white, high intensity; fades out as it
  // drops below the horizon (sunDir.y < 0 at night).
  const sunUp = Math.max(0, Math.min(1, sd.y * 3));
  v.sun.position.set(
    CITY_CENTRE.x + sd.x * 450,
    Math.max(20, sd.y * 450),
    CITY_CENTRE.z + sd.z * 450,
  );
  v.sun.color.set(style.sun);
  v.sun.intensity = style.sunI * sunUp * (1 - night);

  // Moon: 35-55 deg up at night, dim cool light.
  v.moon.position.set(
    CITY_CENTRE.x + md.x * 450,
    Math.max(20, md.y * 450),
    CITY_CENTRE.z + md.z * 450,
  );
  v.moon.intensity = 0.35 * night;

  v.hemi.intensity = style.hemi * (1 - night * 0.6);

  // Sky dome + background + fog follow the phase palette.
  v.sky.material.uniforms.topColor.value.set(style.top);
  v.sky.material.uniforms.bottomColor.value.set(style.bot);
  scene.background.set(style.bot);
  scene.fog.color.set(style.fog);

  // Night elements.
  v.stars.material.opacity = night;
  v.pools.material.opacity = night * 0.65;
  v.windows.material.opacity = night;

  // Lamp heads switch dark grey -> warm 0xffd9a0 at night. Colours only
  // update when the lit state flips, not every frame.
  const lit = night > 0.5;
  if (lit !== v.headsLit) {
    v.headsLit = lit;
    const col = new THREE.Color();
    for (let i = 0; i < v.lampCount; i++) {
      v.heads.setColorAt(i, col.set(lit ? 0xffd9a0 : 0x2a2d30));
    }
    if (v.heads.instanceColor) v.heads.instanceColor.needsUpdate = true;
  }
}
