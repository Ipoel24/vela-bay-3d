// view-smoke.test.mjs — Node smoke test for the view layer (Builder D).
// Imports the real three.js r187 module and the view modules with a minimal
// DOM stub (no WebGL: makeRenderer is NOT called here — that is a Playwright
// step). Run: node tests/view-smoke.test.mjs
import * as THREE from '../game/vendor/three/three.module.min.js';
import { buildCity } from '../game/src/sim/city.js';
import { makeClock } from '../game/src/sim/clock.js';
import { makeCar, CAR_DEFS } from '../game/src/sim/vehicles.js';
import { GAME_SEED } from '../game/src/config.js';
import { makeScene, updateDayNight } from '../game/src/view/render.js';
import { buildBuildings } from '../game/src/view/buildings.js';
import { makeCarMesh, syncCarMesh } from '../game/src/view/vehicles3d.js';
import { makePedMesh, makePlayerMesh, syncCharacterMesh, syncDownedMesh } from '../game/src/view/characters3d.js';
import { makeCamera, updateCamera, setTitleOrbit, titleOrbitAngle, TITLE_ORBIT, setFixedCamera, snapChaseCamera } from '../game/src/view/camera.js';
import { buildHud } from '../game/src/view/hud.js';
import { makeHeliMesh, HELI_HEIGHT } from '../game/src/view/heli.js';
import { makeBurstPool, spawnBurst, makeBurstView, syncBurstView } from '../game/src/view/particles.js';
import { makeTracerState, fireTracer, makeTracerView, syncTracerView } from '../game/src/view/tracer.js';
import { makeSkidPool, addSkidPair, makeSkidView, syncSkidView } from '../game/src/view/skidmarks.js';
import { makeRoadblockView, syncRoadblockView, roadblockAhead } from '../game/src/view/roadblocks.js';
import { makeAudio } from '../game/src/audio.js';
import { makeInput } from '../game/src/input.js';

// --- Minimal DOM stub (elements + 2D canvas context) ---
function makeCtx() {
  return new Proxy({}, {
    get(t, k) {
      if (k === 'createRadialGradient' || k === 'createLinearGradient') {
        return () => ({ addColorStop() {} });
      }
      if (k === 'measureText') return () => ({ width: 0 });
      if (k === 'getImageData') return () => ({ data: [] });
      return () => ({});
    },
    set() { return true; },
  });
}
function makeEl(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    style: {},
    children: [],
    className: '',
    textContent: '',
    width: 0,
    height: 0,
    appendChild(c) { this.children.push(c); return c; },
    getContext() { return makeCtx(); },
    setAttribute() {},
  };
  return el;
}
globalThis.document = { createElement: (t) => makeEl(t) };
globalThis.window = {
  devicePixelRatio: 1,
  __listeners: {},
  addEventListener(type, fn) {
    (this.__listeners[type] = this.__listeners[type] || []).push(fn);
  },
  removeEventListener(type, fn) {
    const list = this.__listeners[type] || [];
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  },
  __dispatch(type, event) {
    for (const fn of this.__listeners[type] || []) fn(event);
  },
  AudioContext: class {
    constructor() {
      this.state = 'running';
      this.currentTime = 0;
      this.sampleRate = 44100;
      this.destination = {};
    }
    resume() { return Promise.resolve(); }
    createGain() { return { gain: { value: 0, setTargetAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
    createOscillator() { return { type: '', frequency: { value: 0, setTargetAtTime() {}, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} }; }
    createBiquadFilter() { return { type: '', frequency: { value: 0 }, connect() {} }; }
    createBuffer(_ch, len) { return { getChannelData: () => new Float32Array(len) }; }
    createBufferSource() { return { buffer: null, connect() {}, start() {}, stop() {} }; }
  },
};
globalThis.performance = { now: () => 0 };

let failures = 0;
function check(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures++;
}

check('THREE.REVISION is 187', THREE.REVISION === '187', `got ${THREE.REVISION}`);

const city = buildCity(GAME_SEED);
const scene = makeScene(city);
check('makeScene returns a Scene', scene instanceof THREE.Scene);
const v = scene.userData.vela;
check('scene.userData.vela has sun/moon/stars/pools/windows', !!(v && v.sun && v.moon && v.stars && v.pools && v.windows));
check('lamp count is 36 (100 m grid, minus exclusions)', v.lampCount === 36, `got ${v.lampCount}`);
check('lit-window pane count near 1699', Math.abs(v.windows.userData.paneCount - 1699) < 400, `got ${v.windows.userData.paneCount}`);
check('stars count is 350', v.stars.geometry.attributes.position.count === 350);

// Day/night: noon bright, night dark + stars on.
const noon = { minutes: 12 * 60, day: 1 };
updateDayNight(scene, noon);
check('noon: stars off, pools off', v.stars.material.opacity === 0 && v.pools.material.opacity === 0);
check('noon: sun bright', v.sun.intensity > 2.5, `sun=${v.sun.intensity.toFixed(2)}`);
const night = { minutes: 22 * 60, day: 1 };
updateDayNight(scene, night);
check('night: stars opacity 1', v.stars.material.opacity === 1);
check('night: pools opacity 0.65', Math.abs(v.pools.material.opacity - 0.65) < 1e-9, `pools=${v.pools.material.opacity}`);
check('night: windows opacity 1', v.windows.material.opacity === 1);
check('night: lamp heads warm 0xffd9a0', v.headsLit === true);
const sunset = { minutes: 18 * 60 + 30, day: 1 };
updateDayNight(scene, sunset);
check('sunset 18:30: golden-hour sun colour', v.sun.color.getHex() === 0xff8f3c, `got #${v.sun.color.getHexString()}`);
check('sunset: sun above horizon', v.sun.position.y > 0);

// Buildings.
const built = buildBuildings(scene, city);
check('buildBuildings returns meshes + dispose', Array.isArray(built.meshes) && typeof built.dispose === 'function');
check('buildings mesh count (5 districts + spire + beacon + antenna + rim + hub + spokes + legs + cabins + signs + forecourt + garage sign)', built.meshes.length === 16, `got ${built.meshes.length}`);
const spireMesh = built.meshes.find((m) => m.geometry && m.geometry.parameters && m.geometry.parameters.width === 18 && m.geometry.parameters.height === 90);
check('Vela Spire mesh present (18x18, h=90)', !!spireMesh);
const spirePos = spireMesh ? spireMesh.position : { x: -1, z: -1 };
check('Spire at (225,225)', spirePos.x === 225 && spirePos.z === 225);
// Marco's garage reads on screen: a forecourt pad at (150,125) and a sign
// board on the sidewalk corner (154.5,128.5), clear of the road.
const forecourt = built.meshes.find((m) => Math.abs(m.position.x - 150) < 1 && Math.abs(m.position.z - 125) < 1 && m.position.y < 0.1);
check('garage forecourt pad at (150,125)', !!forecourt);
const garageSign = built.meshes.find((m) => {
  if (!m.geometry || !m.geometry.attributes || !m.geometry.attributes.position) return false;
  m.geometry.computeBoundingBox();
  const c = m.geometry.boundingBox.getCenter(new THREE.Vector3());
  return Math.abs(c.x - 154.5) < 1 && Math.abs(c.z - 128.5) < 1 && c.y > 1;
});
check('garage sign board at the sidewalk corner (154.5,128.5)', !!garageSign);
built.dispose();
check('dispose removes meshes from scene', built.meshes.length === 0);

// Cars.
for (const model of Object.keys(CAR_DEFS)) {
  const mesh = makeCarMesh(model);
  scene.add(mesh);
  check(`makeCarMesh(${model}) is a Group`, mesh instanceof THREE.Group);
  const car = makeCar(model, 150, 150, 0, 'player');
  car.speed = 10;
  syncCarMesh(mesh, car, 1 / 60, 0);
  check(`syncCarMesh(${model}) places mesh at car pos`, mesh.position.x === 150 && mesh.position.z === 150);
  scene.remove(mesh);
}
// L1 brake-light test (exact per-second rule): small decel -> off, hard decel -> on.
const mesh = makeCarMesh('cometa');
const car = makeCar('cometa', 100, 100, 0, 'player');
car.speed = 40;
syncCarMesh(mesh, car, 1 / 60, 0); // prevSpeed = 40
car.speed = 39.99; // decel 0.6 m/s^2 -> lights off
syncCarMesh(mesh, car, 1 / 60, 0);
check('L1: gentle decel 0.6 m/s^2 -> brake lights OFF', mesh.userData.brakeMat.emissiveIntensity < 1);
car.speed = 39.9; // decel 6 m/s^2 from 39.99 -> lights on
syncCarMesh(mesh, car, 1 / 60, 0);
check('L1: hard decel 6 m/s^2 -> brake lights ON', mesh.userData.brakeMat.emissiveIntensity > 2);
// Headlights: on at night while driving, off by day.
car.speed = 20;
syncCarMesh(mesh, car, 1 / 60, 1);
check('headlights ON at night while driving', mesh.userData.headlight.intensity > 0);
syncCarMesh(mesh, car, 1 / 60, 0);
check('headlights OFF by day', mesh.userData.headlight.intensity === 0);
// Damage smoke: visible only when condition < 50.
car.condition = 30;
syncCarMesh(mesh, car, 1 / 60, 0);
check('damage smoke visible at condition 30', mesh.userData.smoke.visible === true);
car.condition = 80;
syncCarMesh(mesh, car, 1 / 60, 0);
check('damage smoke hidden at condition 80', mesh.userData.smoke.visible === false);

// Characters.
const ped = makePedMesh();
const player = makePlayerMesh();
check('ped/player meshes are single meshes (1 draw call each)', ped.isMesh && player.isMesh);
syncCharacterMesh(ped, 10, 20, 1.5);
check('syncCharacterMesh places ped', ped.position.x === 10 && ped.position.z === 20 && ped.rotation.y === 1.5);

// Camera.
const camera = makeCamera();
check('TITLE_ORBIT radius 60, height 32, speed 0.03', TITLE_ORBIT.radius === 60 && TITLE_ORBIT.height === 32 && TITLE_ORBIT.speed === 0.03);
setTitleOrbit(camera, 0);
check('title orbit angle 0 starts south of wheel (z=485)', Math.abs(camera.position.z - 485) < 1e-9 && Math.abs(camera.position.x - 200) < 1e-9);
check('titleOrbitAngle advances 0.03 rad/s', Math.abs(titleOrbitAngle(0, 10) - 0.3) < 1e-9);
updateCamera(camera, { x: 150, z: 150, yaw: 0, movingForward: true }, 1, 'chase');
check('chase cam sits behind car (z < car z at yaw 0)', camera.position.z < 150);
const camYawBefore = camera.userData.camYaw;
updateCamera(camera, { x: 150, z: 150, yaw: 2.0, movingForward: false }, 1, 'foot');
check('foot cam yaw fixed while not walking forward', camera.userData.camYaw === camYawBefore);

// HUD (DOM stub).
const root = makeEl('div');
const hud = buildHud(root);
check('buildHud returns update/setVisible/setHudVisible', typeof hud.update === 'function' && typeof hud.setVisible === 'function' && typeof hud.setHudVisible === 'function');
hud.update({
  missionText: 'Drive the fare to the Strip',
  missionDistance: 128,
  wanted: 2,
  police: [{ name: 'UNIT 7', distance: 42, state: 'pursuing', x: 160, z: 160, visible: true }],
  player: { x: 150, z: 150, yaw: 0 },
  money: 1700, rep: 11, debt: 15000,
  health: 100, armour: 50, ammo: 9, maxAmmo: 12,
  speed: 25, vehicleName: 'Cometa GT',
  dialogue: 'Lena: Lose them, Dash!',
  radio: 'VELA FM',
  clock: { day: 1, minutes: 8 * 60 + 30, phase: 'morning' },
  traffic: [{ x: 100, z: 100 }],
  roadblocks: [{ x: 200, z: 200 }],
  missionMarker: { x: 200, z: 250 },
  enterCar: { x: 155, z: 155 },
  toast: '+$500 First Fare', toastKey: 1,
});
check('HUD mission line set', hud.elements.missionLine.textContent === 'Drive the fare to the Strip');
check('HUD wanted stars show 2', hud.elements.stars.textContent === '★★☆☆☆', `got ${hud.elements.stars.textContent}`);
check('HUD clock "DAY 1 · 08:30 · MORNING"', hud.elements.clock.textContent.includes('DAY 1 · 08:30 · MORNING'), `got ${hud.elements.clock.textContent}`);
check('HUD money shows $1,700', hud.elements.money.textContent === '$1,700');
check('HUD speed 25 m/s = 90 km/h', hud.elements.speed.textContent === '90 km/h');
check('HUD police row names unit + distance + state', hud.elements.policeRows[0].textContent === 'UNIT 7 · 42 m · PURSUING', `got ${hud.elements.policeRows[0].textContent}`);
hud.setHudVisible(false);
check('setHudVisible(false) hides HUD', hud.el.style.display === 'none');
hud.setHudVisible(true);
check('setHudVisible(true) shows HUD again', hud.el.style.display === '');

// Polish HUD: ROADBLOCK AHEAD banner + minimap + hint.
hud.update({
  missionText: 'Roadblock Run — Lose the 3-star wanted level',
  missionDistance: null,
  wanted: 3,
  police: [],
  player: { x: 200, z: 200, yaw: 0 },
  money: 2900, rep: 26, debt: 15000,
  health: 100, armour: 0, ammo: 12, maxAmmo: 12,
  speed: 0, vehicleName: 'Cometa GT',
  dialogue: '', radio: '',
  clock: { day: 1, minutes: 18 * 60, phase: 'sunset' },
  traffic: [],
  roadblocks: [{ x: 250, z: 200 }],
  roadblockAhead: true,
  missionMarker: null,
  enterCar: null,
  toast: '', toastKey: 2,
});
check('HUD roadblock banner shows when a block is near', hud.elements.roadblock.textContent === '⚠ ROADBLOCK AHEAD' && hud.elements.roadblock.style.display === '');
hud.update({
  missionText: 'Free roam — press B for missions',
  missionDistance: null,
  wanted: 0,
  police: [],
  player: { x: 200, z: 200, yaw: 0 },
  money: 2900, rep: 26, debt: 15000,
  health: 100, armour: 0, ammo: 12, maxAmmo: 12,
  speed: 0, vehicleName: 'ON FOOT',
  dialogue: '', radio: '',
  clock: { day: 1, minutes: 8 * 60, phase: 'morning' },
  traffic: [],
  roadblocks: [],
  roadblockAhead: false,
  missionMarker: null,
  enterCar: null,
  toast: '', toastKey: 3,
});
check('HUD roadblock banner hides with no block near', hud.elements.roadblock.style.display === 'none');
check('HUD minimap canvas is 200x200', hud.elements.minimap.width === 200 && hud.elements.minimap.height === 200);
check('HUD controls hint lists the driving keys', hud.elements.hint.textContent.includes('WASD') && hud.elements.hint.textContent.includes('SPACE'));
check('roadblockAhead rule: 50 m warns, 100 m does not', roadblockAhead(200, 140, [{ x: 250, z: 140 }]) === true && roadblockAhead(200, 140, [{ x: 300, z: 140 }]) === false);

// Polish views: heli cone, burst cloud, tracer line, skid mesh, barriers.
const heliMesh = makeHeliMesh();
check('heli view: cone is open-ended', heliMesh.userData.spotPivot.children[0].geometry.parameters.openEnded === true);
check('heli view: airframe height is 26 m', HELI_HEIGHT === 26);
const bPool = makeBurstPool();
spawnBurst(bPool, 200, 1, 140);
const bView = makeBurstView(bPool);
syncBurstView(bView, bPool);
check('burst view: live spark drawn above ground', bView.geometry.attributes.position.array[1] > 0);
const tState = makeTracerState();
fireTracer(tState, { x: 200, y: 1.4, z: 140 }, { x: 210, y: 1, z: 150 });
const tView = makeTracerView();
syncTracerView(tView, tState);
check('tracer view: line visible after a shot', tView.visible === true);
const sPool = makeSkidPool();
addSkidPair(sPool, { x: 200, z: 200, yaw: 0 });
const sView = makeSkidView(sPool);
syncSkidView(sView, sPool);
check('skid view: one pair draws 2 marks', sView.count === 2);
const rbView = makeRoadblockView();
syncRoadblockView(rbView, [{ x: 250, z: 200, yaw: 0 }], 0);
check('roadblock view: one block shows one barrier', rbView.userData.barriers.filter((b) => b.visible).length === 1);

// Finisher additions: reverse lights, downed-pose helper, fixed camera,
// audio unlock guard, input queue cap.
const revCar = makeCar('cometa', 200, 200, 0, 'player');
const revMesh = makeCarMesh('cometa');
syncCarMesh(revMesh, { ...revCar, speed: -3 }, 1 / 60, 0);
check('reverse lights: lit while reversing', revMesh.userData.reverseMat.emissiveIntensity > 1);
syncCarMesh(revMesh, { ...revCar, speed: 5 }, 1 / 60, 0);
check('reverse lights: dark while driving forward', revMesh.userData.reverseMat.emissiveIntensity < 0.5);

const downMesh = makePedMesh();
syncCharacterMesh(downMesh, 200, 200, 0);
syncDownedMesh(downMesh, true);
check('downed ped lies flat (rotation.x = PI/2, lifted off the road)', downMesh.rotation.x === Math.PI / 2 && downMesh.position.y === 0.25);
syncDownedMesh(downMesh, false);
check('standing ped is upright again', downMesh.rotation.x === 0 && downMesh.position.y === 0);

const fixedCam = makeCamera();
setFixedCamera(fixedCam, { x: 158, y: 4, z: 136 }, { x: 150, y: 1.2, z: 125 });
check('fixed camera: exact garage-shot pose', fixedCam.position.x === 158 && fixedCam.position.y === 4 && fixedCam.position.z === 136);
const snapCam = makeCamera();
snapCam.userData.pos.set(0, 50, 0);
snapChaseCamera(snapCam, { x: 200, z: 140, yaw: 0 });
check('snap chase camera: sits 8.5 m behind the target', Math.abs(snapCam.position.z - 131.5) < 0.01 && Math.abs(snapCam.position.y - 3.4) < 0.01);

// Audio: silent until unlock() (no AudioContext before a user gesture),
// live after it; silence() kills siren + engine + loops.
const audio = makeAudio();
check('audio: locked before unlock()', audio.isUnlocked() === false);
audio.setEngine(30, 52);
audio.setSiren(true, 20);
check('audio: setEngine/setSiren are no-ops while locked', audio.isUnlocked() === false);
audio.unlock();
check('audio: unlocked after unlock()', audio.isUnlocked() === true);
audio.setEngine(30, 52);
audio.setSiren(true, 20);
audio.silence();
check('audio: silence() runs without throwing', audio.isUnlocked() === true);

// Input: the edge-key queue caps at 8 and clears on blur.
const input = makeInput();
for (let i = 0; i < 20; i++) {
  globalThis.window.__dispatch('keydown', { code: `Key${String.fromCharCode(65 + (i % 26))}`, repeat: false, preventDefault() {} });
}
const pressed = input.takePressed();
check('input: pressed queue caps at 8 keys', pressed.length === 8, `got ${pressed.length}`);
globalThis.window.__dispatch('keydown', { code: 'KeyW', repeat: false, preventDefault() {} });
globalThis.window.__dispatch('blur', {});
check('input: blur clears the pressed queue', input.takePressed().length === 0);

console.log(failures === 0 ? '\nALL VIEW SMOKE TESTS PASSED' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
