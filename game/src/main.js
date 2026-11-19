// main.js — VELA BAY 3D game loop and top-level state (title / playing / paused / garage / board / howto / mission-failed / won).
// Wires sim + view + audio + input + HUD + save together. The H1 wrecked-car
// fix lives here (coast the player's car to a stop, then force exitCar):
// it is deliberately NOT inside stepCar(), which traffic/police already
// drive with handbrake input when wrecked.
import { GAME_SEED, LANDMARKS, GARAGE_OPEN_RANGE, GARAGE_SELL_RANGE, POLICE_MAX_UNITS, TAXI_PARKED } from './config.js';
import { makeRng } from './sim/rng.js';
import { buildCity, isInsideBuilding } from './sim/city.js';
import { makeClock, tickClock, phaseOf, nightFactor } from './sim/clock.js';
import { CAR_DEFS, makeCar, stepCar, effectiveTop, isWrecked } from './sim/vehicles.js';
import { makePlayer, stepPlayer, enterCar, exitCar, nearestCar, damagePlayer, respawnPlayer, ENTER_CAR_RANGE } from './sim/player.js';
import { makeTraffic, stepTraffic, resolveCarCollisions } from './sim/traffic.js';
import { makePeds, stepPeds, checkPedHits } from './sim/pedestrians.js';
import { makeWanted, addCrime, spawnPolice, stepPolice } from './sim/police.js';
import { WEAPON, shoot, tracerEndpoints } from './sim/combat.js';
import { MISSIONS, makeMissions, stepMissions, currentMission, currentStep, missionProgress, canSellCar, ensureMissionCars } from './sim/missions.js';
import { makeEconomy, addMoney, spendMoney, buyUpgrade, buyCar, sellPriceFor, topSpeedFactor, carHealthBonus, canBuyUpgrade, GARAGE, BODY_ARMOUR_PRICE, BODY_ARMOUR_VALUE } from './sim/economy.js';
import { saveGame, loadGame, wipeSave } from './sim/save.js';
import { makeRenderer, makeScene, updateDayNight } from './view/render.js';
import { buildBuildings } from './view/buildings.js';
import { makeCarMesh, syncCarMesh } from './view/vehicles3d.js';
import { makePedMesh, makePlayerMesh, syncCharacterMesh, syncDownedMesh } from './view/characters3d.js';
import { makeCamera, updateCamera, setTitleOrbit, titleOrbitAngle, setFixedCamera, snapChaseCamera } from './view/camera.js';
import { buildHud } from './view/hud.js';
import { makeHeliMesh, syncHeliMesh } from './view/heli.js';
import { makeBurstPool, spawnBurst, stepBursts, makeBurstView, syncBurstView } from './view/particles.js';
import { makeTracerState, fireTracer, stepTracer, makeTracerView, syncTracerView } from './view/tracer.js';
import { makeSkidPool, shouldSkid, addSkidPair, stepSkids, makeSkidView, syncSkidView } from './view/skidmarks.js';
import { makeRoadblockView, syncRoadblockView, roadblockAhead } from './view/roadblocks.js';
import { makeInput } from './input.js';
import { makeAudio } from './audio.js';
import { applyShot, SHOT_SCENES } from './shots.js';

const STEP = 1 / 60; // fixed sim step
const TRAFFIC_COUNT = 14;
const PED_COUNT = 24;
const RADIO_STATIONS = ['VELA FM', 'NEON 101'];

// --- Top-level state ---
let screen = 'title'; // title | playing | paused | garage | board | howto | mission-failed | won
let returnTo = 'playing'; // which screen an overlay (garage/board/howto) returns to
let photoMode = false;
let shotHud = null; // { camera, dialogue, vehicleName } from applyShot, photo mode only
let titleAngle = 0; // title-orbit angle, preserved across HOW TO PLAY
let ammo = WEAPON.magSize;
let bestScore = 0;
let bestTimes = {};
let lastMissionIndex = 0;
let missionStartTime = 0;
let radioStation = RADIO_STATIONS[0];
let shakeAmp = 0;
let playerHitCooldown = 0;
// Polish FX state (pools are pure logic in the view files; the views below
// draw them). Created once, cleared on every world reset.
let burstPool = makeBurstPool();
let tracerState = makeTracerState();
let skidPool = makeSkidPool();
let skidTick = 0;
let burstView = null;
let tracerView = null;
let skidView = null;
let roadblockView = null;
let heliMesh = null;

// resetFxState() — clear every polish effect (bursts, tracer, skid marks)
// so a fresh world never inherits the last run's smoke and tyre marks.
function resetFxState() {
  burstPool = makeBurstPool();
  tracerState = makeTracerState();
  skidPool = makeSkidPool();
  skidTick = 0;
  if (burstView) burstView.userData.pool = burstPool;
  if (skidView) skidView.userData.pool = skidPool;
  if (heliMesh) heliMesh.visible = false;
}
let dialogueText = '';
let dialogueUntil = 0;
let toastText = '';
let toastKey = 0;
let playStartedAt = 0;
let lastT = typeof performance !== 'undefined' ? performance.now() : 0;
let acc = 0;

// --- DOM handles ---
const canvas = document.getElementById('game-canvas');
const menuEl = document.getElementById('menu');
const hudRoot = document.getElementById('hud-root');

// --- World ---
// createWorld(saved) — fresh game-shaped state { city, rng, player, cars,
// peds, police, wanted, economy, missions, time, roadblocks, heli } plus
// clock + traffic. `saved` is a validated save (or null for fresh defaults).
// The player's own taxi is parked beside the start point, owned not stolen.
function createWorld(saved) {
  const city = buildCity(GAME_SEED);
  const rng = makeRng(GAME_SEED);
  const g = {
    city, rng,
    player: makePlayer(),
    cars: [],
    peds: [],
    police: [],
    wanted: makeWanted(),
    economy: makeEconomy(),
    missions: makeMissions(),
    time: 0,
    roadblocks: [],
    heli: null,
  };
  g.clock = makeClock();
  g.traffic = makeTraffic(city, rng, TRAFFIC_COUNT);
  for (const t of g.traffic) g.cars.push(t.car);
  g.peds = makePeds(city, rng, PED_COUNT);
  const taxi = makeCar('taxi', TAXI_PARKED.x, TAXI_PARKED.z, 0, 'player');
  g.cars.push(taxi);
  if (saved) applySaveToWorld(g, saved, taxi);
  return g;
}

// applySaveToWorld(g, s, taxi) — apply a validated save onto a fresh world.
// Continue clears wanted/police (fresh makeWanted) and exits the car: the
// player always resumes on foot at the saved position.
function applySaveToWorld(g, s, taxi) {
  g.economy.money = s.money;
  g.economy.rep = s.rep;
  g.economy.debt = s.debt;
  g.economy.ownedCars = [...s.ownedCars];
  g.economy.upgrades = { ...s.upgrades };
  g.economy.bodyArmour = s.bodyArmour;
  g.clock.minutes = s.clockMinutes;
  g.clock.day = s.day;
  g.missions.index = s.missionIndex;
  g.missions.stepIndex = s.missionStep;
  g.missions.started = false;
  g.player.x = s.positions.player.x;
  g.player.z = s.positions.player.z;
  g.player.armour = s.bodyArmour;
  if (s.positions.car) {
    taxi.x = s.positions.car.x;
    taxi.z = s.positions.car.z;
  }
  bestScore = s.bestScore;
  bestTimes = { ...s.bestTimes };
}

let game = createWorld(null);

// --- View ---
const renderer = makeRenderer(canvas);
const camera = makeCamera();
const scene = makeScene(game.city);
buildBuildings(scene, game.city);
const hud = buildHud(hudRoot);
const input = makeInput();
const audio = makeAudio();

// Mesh registries: sim object -> three.js mesh.
const carMeshes = new Map();
const pedMeshes = new Map();
let playerMesh = makePlayerMesh();
scene.add(playerMesh);

// Polish FX views: one Points cloud for crash bursts, one Line for the
// bullet tracer, one InstancedMesh for skid marks — 3 draw calls total,
// added once and fed from the pools every frame.
burstView = makeBurstView(burstPool);
scene.add(burstView);
tracerView = makeTracerView();
scene.add(tracerView);
skidView = makeSkidView(skidPool);
scene.add(skidView);
// Roadblock barriers: two pooled striped barriers, placed on the sim's
// roadblock positions whenever 3-star heat puts them on the road.
roadblockView = makeRoadblockView();
scene.add(roadblockView);

// disposeMesh(mesh) — free a mesh's geometries/materials (shared textures
// are not disposed: only the material is).
function disposeMesh(mesh) {
  mesh.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) m.dispose();
    }
  });
}

// rebuildAllMeshes() — drop every dynamic mesh and recreate the player mesh
// (used after a world reset: new game, continue, photo-mode staging).
function rebuildAllMeshes() {
  for (const [, mesh] of carMeshes) { scene.remove(mesh); disposeMesh(mesh); }
  carMeshes.clear();
  for (const [, mesh] of pedMeshes) { scene.remove(mesh); disposeMesh(mesh); }
  pedMeshes.clear();
  if (playerMesh) { scene.remove(playerMesh); disposeMesh(playerMesh); }
  playerMesh = makePlayerMesh();
  scene.add(playerMesh);
  resetFxState(); // a fresh world starts with no bursts, tracer or skid marks
}

// allCarsList() — every sim car in the world: world cars + the player's car
// (enterCar removes the player's car from game.cars, so it is added back).
function allCarsList() {
  const list = game.cars.slice();
  if (game.player.car) list.push(game.player.car);
  return list;
}

// syncAllMeshes(dt) — create/sync/remove car + ped + player meshes from sim.
function syncAllMeshes(dt) {
  const night = nightFactor(game.clock);
  const alive = new Set(allCarsList());
  for (const car of alive) {
    let mesh = carMeshes.get(car);
    if (!mesh) { mesh = makeCarMesh(car.model); scene.add(mesh); carMeshes.set(car, mesh); }
    syncCarMesh(mesh, car, dt, night);
  }
  for (const [car, mesh] of [...carMeshes]) {
    if (!alive.has(car)) { scene.remove(mesh); disposeMesh(mesh); carMeshes.delete(car); }
  }
  for (const ped of game.peds) {
    let mesh = pedMeshes.get(ped);
    if (!mesh) { mesh = makePedMesh(); scene.add(mesh); pedMeshes.set(ped, mesh); }
    syncCharacterMesh(mesh, ped.x, ped.z, ped.yaw);
    syncDownedMesh(mesh, ped.down); // downed peds lie flat
  }
  if (game.player.onFoot) {
    playerMesh.visible = true;
    syncCharacterMesh(playerMesh, game.player.x, game.player.z, game.player.yaw);
  } else {
    playerMesh.visible = false;
  }

  // Polish FX: age the pools, then draw them. The heli mesh is created
  // lazily the first time 3-star heat brings the helicopter in, and hidden
  // again whenever the heat drops and the sim clears game.heli.
  stepBursts(burstPool, dt);
  stepTracer(tracerState, dt);
  stepSkids(skidPool, dt);
  syncBurstView(burstView, burstPool);
  syncTracerView(tracerView, tracerState);
  syncSkidView(skidView, skidPool);
  syncRoadblockView(roadblockView, game.roadblocks, game.time);
  if (game.heli) {
    if (!heliMesh) { heliMesh = makeHeliMesh(); scene.add(heliMesh); }
    const px = game.player.car ? game.player.car.x : game.player.x;
    const pz = game.player.car ? game.player.car.z : game.player.z;
    syncHeliMesh(heliMesh, game.heli, { x: px, z: pz }, dt, night);
  } else if (heliMesh) {
    heliMesh.visible = false;
  }
}

// --- Save ---
// snapshotSave() — flat save state for saveGame (matches the test shape:
// economy fields spread flat + clockMinutes/day + positions + mission +
// best score/times).
function snapshotSave() {
  return {
    ...game.economy,
    clockMinutes: Math.floor(game.clock.minutes),
    day: game.clock.day,
    positions: {
      player: { x: Math.round(game.player.x), z: Math.round(game.player.z) },
      car: game.player.car
        ? { x: Math.round(game.player.car.x), z: Math.round(game.player.car.z) }
        : null,
    },
    missionIndex: game.missions.index,
    missionStep: game.missions.stepIndex,
    bestScore,
    bestTimes: { ...bestTimes },
  };
}

// persist() — write the save immediately (after every mission and on every
// side earning, so a reload always shows the new cash and counters).
function persist() {
  saveGame(snapshotSave(), MISSIONS);
}

// --- Dialogue + toast ---
// showDialogue(text, seconds) — story line on the HUD dialogue line.
function showDialogue(text, seconds) {
  dialogueText = text;
  dialogueUntil = performance.now() + seconds * 1000;
}

// showToast(text) — floating earnings text (HUD toast, ~2.5 s).
function showToast(text) {
  toastText = text;
  toastKey++;
}

// --- Small DOM helpers for the menus ---
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function btn(label, onClick) {
  const b = el('button', 'menu-btn', label);
  b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  return b;
}

const panels = {}; // name -> panel element
const soundButtons = []; // every SOUND toggle, so labels stay in sync

// refreshSoundButtons() — rewrite every SOUND toggle label from audio state.
function refreshSoundButtons() {
  for (const b of soundButtons) b.textContent = `SOUND: ${audio.isMuted() ? 'OFF' : 'ON'}`;
}

// soundButton() — a SOUND toggle button (visible mute toggle, next to M key).
function soundButton() {
  const b = btn('', () => { toggleMute(); });
  soundButtons.push(b);
  refreshSoundButtons();
  return b;
}

// toggleMute() — M key + visible toggle: mute/unmute everything.
function toggleMute() {
  audio.unlock();
  audio.toggleMute();
  refreshSoundButtons();
}

// showPanel(name) — show one menu panel (or hide the whole menu when null).
function showPanel(name) {
  for (const [key, p] of Object.entries(panels)) p.style.display = key === name ? '' : 'none';
  menuEl.style.display = name ? '' : 'none';
}

// nextStation() — alternate the radio station each time the player gets in.
function nextStation() {
  radioStation = radioStation === RADIO_STATIONS[0] ? RADIO_STATIONS[1] : RADIO_STATIONS[0];
  return radioStation;
}

// applyUpgradesToCar(car) — apply the garage upgrades to a car: engine
// raises top speed, armour adds health and scales damage.
function applyUpgradesToCar(car) {
  car.topSpeed = CAR_DEFS[car.model].top * topSpeedFactor(game.economy);
  car.maxHealth = 100 + carHealthBonus(game.economy);
  car.health = car.maxHealth;
  car.condition = 100;
  car.armour = game.economy.upgrades.armour;
}

// removeTrafficWrapper(car) — stop the traffic AI driving a stolen car.
function removeTrafficWrapper(car) {
  const i = game.traffic.findIndex((t) => t.car === car);
  if (i >= 0) game.traffic.splice(i, 1);
}

// removeCarFromWorld(car) — take a car out of the world entirely (sold /
// impounded): out of game.cars, out of traffic, mesh disposed.
function removeCarFromWorld(car) {
  const i = game.cars.indexOf(car);
  if (i >= 0) game.cars.splice(i, 1);
  removeTrafficWrapper(car);
  const mesh = carMeshes.get(car);
  if (mesh) { scene.remove(mesh); disposeMesh(mesh); carMeshes.delete(car); }
}

// returnCarToWorld(car) — put an exited player car back in game.cars.
function returnCarToWorld(car) {
  if (!game.cars.includes(car)) game.cars.push(car);
}

// despawnPolice() — clear every police unit (continue / busted / heat gone).
function despawnPolice() {
  for (const u of game.police) {
    const i = game.cars.indexOf(u.car);
    if (i >= 0) game.cars.splice(i, 1);
  }
  game.police = [];
}

// --- Menus ---
// buildMenus() — build every menu panel once into #menu.
function buildMenus() {
  const mkPanel = (name, cls) => {
    const p = el('div', `menu-panel ${cls || ''}`);
    p.style.display = 'none';
    menuEl.appendChild(p);
    panels[name] = p;
    return p;
  };
  mkPanel('title', 'title-panel');
  mkPanel('pause');
  mkPanel('garage');
  mkPanel('board');
  mkPanel('howto', 'howto-panel');
  mkPanel('results');
  mkPanel('win');

  // HOW TO PLAY: static content, scrollable, fixed CLOSE footer (reachable
  // at 720p). Game stays on the title screen while it is open.
  const howto = panels.howto;
  const howtoBody = el('div', 'howto-body');
  howtoBody.appendChild(el('h2', '', 'HOW TO PLAY'));
  const sections = [
    ['CONTROLS', 'WASD / arrows — drive + walk · SPACE — handbrake · E — enter / exit / steal a car · Mouse — aim on foot, click to shoot · R — reload · G — garage · F — sell a stolen car at the garage · B — mission board · P / Esc — pause · M — mute · Q — quit to title'],
    ['GOAL', 'You are Dario "Dash" Vega, getaway driver. You owe Madame Inez $15,000. Clear the debt across 5 missions — then YOU WIN.'],
    ['WANTED', 'Stars 0–5. Stealing a car, hitting a pedestrian, shooting, or killing a VBPD unit raises heat. Break line of sight and stay clear for ~8 s and a star drops. At 3+ stars expect roadblocks and a helicopter. Busted costs 10% bail, wasted costs 15% hospital bill.'],
    ['MONEY', 'Mission payouts, vigilante kills ($200), and selling stolen cars at Marco\'s garage (Cometa GT: $900). Garage: Engine +18% top speed per level ($900), Armour +50 car health per level ($700), Body Armour +50 player armour ($500), Cometa GT $3,500.'],
    ['DAY & NIGHT', 'A full day is 10 real minutes. Nights are dark: lamps and windows light up and headlights come on. The clock is top-right.'],
  ];
  for (const [h, body] of sections) {
    howtoBody.appendChild(el('h3', '', h));
    howtoBody.appendChild(el('p', '', body));
  }
  howto.appendChild(howtoBody);
  const howtoFoot = el('div', 'howto-foot');
  howtoFoot.appendChild(btn('CLOSE', () => closeOverlay()));
  howto.appendChild(howtoFoot);

  // Pause menu buttons.
  const pause = panels.pause;
  pause.appendChild(el('h2', '', 'PAUSED'));
  pause.appendChild(btn('RESUME', () => resumeGame()));
  pause.appendChild(btn('MISSIONS', () => openBoard()));
  pause.appendChild(btn('HOW TO PLAY', () => openHowto('paused')));
  pause.appendChild(soundButton());
  pause.appendChild(btn('QUIT TO TITLE', () => quitToTitle()));

  // The click that starts the game from the title must be CONSUMED on the
  // title screen: a background click starts play, button clicks do their own
  // thing (they stopPropagation), and startGame() calls input.consumeClick().
  menuEl.addEventListener('click', (e) => {
    if (screen !== 'title') return;
    if (e.target.closest('button')) return;
    startGame();
  });
}

// rebuildTitlePanel() — title menu with CONTINUE (save summary) when a save
// exists, NEW GAME, HOW TO PLAY, sound toggle.
function rebuildTitlePanel() {
  const panel = panels.title;
  panel.innerHTML = '';
  panel.appendChild(el('div', 'eyebrow', 'AN OPEN-WORLD CRIME GAME'));
  panel.appendChild(el('h1', 'logo', 'VELA BAY'));
  panel.appendChild(el('div', 'tagline', 'Steal cars. Outrun the VBPD. Pay off the debt.'));
  const saved = loadGame(MISSIONS);
  if (saved) {
    const hh = String(Math.floor(saved.clockMinutes / 60)).padStart(2, '0');
    const mm = String(saved.clockMinutes % 60).padStart(2, '0');
    panel.appendChild(btn(
      `CONTINUE — Day ${saved.day} · ${hh}:${mm} · $${saved.money.toLocaleString('en-US')} · Mission ${Math.min(saved.missionIndex + 1, 5)}/5`,
      () => {
        game = createWorld(saved);
        rebuildAllMeshes();
        lastMissionIndex = game.missions.index;
        missionStartTime = game.time;
        startGame(false); // CONTINUE keeps the saved clock, it does not reset it
      },
    ));
  }
  panel.appendChild(btn('NEW GAME', () => {
    wipeSave(); // New Game wipes to fresh defaults and persists at once.
    game = createWorld(null);
    rebuildAllMeshes();
    lastMissionIndex = 0;
    missionStartTime = 0;
    startGame();
  }));
  panel.appendChild(btn('HOW TO PLAY', () => openHowto('title')));
  panel.appendChild(soundButton());
}

// showTitle() — back to the title screen (orbit keeps its angle).
function showTitle() {
  screen = 'title';
  rebuildTitlePanel();
  showPanel('title');
  hud.setVisible(false);
}

// startGame(resetClock = true) — from the title into play. The starting
// click is consumed so it can never fire the pistol on frame one.
// Title-click / Space / Enter start resets the clock to 08:00 day 1: the
// title loop pins the clock to 18:30 sunset, and only NEW GAME used to
// reset it — a title-click start used to begin at 18:30. CONTINUE passes
// false so the saved clock survives.
function startGame(resetClock = true) {
  audio.unlock();
  input.consumeClick();
  if (resetClock) {
    game.clock.minutes = 8 * 60; // 08:00
    game.clock.day = 1;
  }
  screen = 'playing';
  playStartedAt = performance.now();
  showPanel(null);
  hud.setVisible(true);
  // Snap the camera behind the player: the title orbit leaves it 300+ m
  // away, and without this the chase cam sweeps across the city on frame one.
  const sx = game.player.car ? game.player.car.x : game.player.x;
  const sz = game.player.car ? game.player.car.z : game.player.z;
  snapChaseCamera(camera, { x: sx, z: sz, yaw: game.player.yaw });
  audio.startMusic();
}

// showPause() — pause menu. L4 FIX (exact): silence the siren + engine hum
// so neither drones through the pause menu.
function showPause() {
  screen = 'paused';
  audio.silence(); // siren off + engine to zero + music/radio stopped (L4)
  showPanel('pause');
}

// resumeGame() — back to play from pause.
function resumeGame() {
  screen = 'playing';
  playStartedAt = performance.now();
  showPanel(null);
  audio.startMusic();
  if (game.player.car) audio.startRadio(radioStation);
}

// quitToTitle() — quit to the title screen (Q key or menu button). The
// save is written first, then the live world is FULLY reset — fresh cars,
// peds, police, wanted, hero car back at the start — so quitting never
// leaves a wrecked car, a 5-star chase or a dead ped behind for the next
// run. CONTINUE reloads the saved world from disk either way.
function quitToTitle() {
  persist();
  game = createWorld(null);
  rebuildAllMeshes();
  ammo = WEAPON.magSize;
  lastMissionIndex = 0;
  missionStartTime = 0;
  shakeAmp = 0;
  dialogueText = '';
  toastText = '';
  screen = 'title';
  audio.setSiren(false);
  audio.setEngine(0, 40);
  audio.stopRadio();
  audio.stopMusic();
  showTitle();
}

// openHowto(from) — HOW TO PLAY panel; returns to `from` on CLOSE.
function openHowto(from) {
  returnTo = from;
  screen = 'howto';
  audio.setSiren(false);
  audio.setEngine(0, 40);
  showPanel('howto');
}

// closeOverlay() — close garage / board / howto back to where it came from.
function closeOverlay() {
  screen = returnTo;
  if (returnTo === 'playing') {
    showPanel(null);
    audio.startMusic();
    if (game.player.car) audio.startRadio(radioStation);
  } else if (returnTo === 'paused') {
    showPanel('pause');
  } else {
    showTitle();
  }
}

// openGarage() — Marco's garage: owned cars, upgrades, prices, all read from
// the real saved state (never display-only).
function openGarage() {
  returnTo = screen === 'paused' ? 'paused' : 'playing';
  screen = 'garage';
  audio.setSiren(false);
  audio.setEngine(0, 40);
  rebuildGaragePanel();
  showPanel('garage');
}

// rebuildGaragePanel() — garage content from the live economy state.
function rebuildGaragePanel() {
  const panel = panels.garage;
  panel.innerHTML = '';
  const eco = game.economy;
  panel.appendChild(el('h2', '', "MARCO'S GARAGE"));
  panel.appendChild(el('p', 'garage-money', `Cash: $${eco.money.toLocaleString('en-US')}`));

  panel.appendChild(el('h3', '', 'OWNED CARS'));
  for (const model of eco.ownedCars) {
    const row = el('div', 'garage-row');
    row.appendChild(el('span', '', CAR_DEFS[model].name));
    row.appendChild(btn('DELIVER', () => deliverCar(model)));
    panel.appendChild(row);
  }
  if (!eco.ownedCars.includes('cometa')) {
    const row = el('div', 'garage-row');
    row.appendChild(el('span', '', `Cometa GT — $3,500 (fastest car you can own)`));
    const b = btn(eco.money >= 3500 ? 'BUY' : 'BUY ($3,500)', () => {
      if (buyCar(eco, 'cometa')) { persist(); rebuildGaragePanel(); }
      else showDialogue('Not enough cash for the Cometa.', 2);
    });
    if (eco.money < 3500) b.disabled = true;
    row.appendChild(b);
    panel.appendChild(row);
  }

  panel.appendChild(el('h3', '', 'UPGRADES'));
  const upgradeRows = [
    ['engine', `Engine — level ${eco.upgrades.engine}/3 · +18% top speed per level · $900`],
    ['armour', `Armour — level ${eco.upgrades.armour}/3 · +50 car health per level · $700`],
  ];
  for (const [kind, label] of upgradeRows) {
    const row = el('div', 'garage-row');
    row.appendChild(el('span', '', label));
    const maxed = eco.upgrades[kind] >= GARAGE.upgrades[kind].maxLevel;
    const b = btn(maxed ? 'MAXED' : 'BUY', () => {
      if (buyUpgrade(eco, kind)) {
        if (game.player.car) applyUpgradesToCar(game.player.car);
        persist();
        rebuildGaragePanel();
      } else showDialogue('Not enough cash.', 2);
    });
    if (maxed || !canBuyUpgrade(eco, kind)) b.disabled = true;
    row.appendChild(b);
    panel.appendChild(row);
  }
  // L2 fix: Body Armour is a real purchase — +50 player armour.
  const bodyRow = el('div', 'garage-row');
  bodyRow.appendChild(el('span', '', `Body Armour — +50 player armour · $500${eco.bodyArmour ? ' (owned)' : ''}`));
  if (!eco.bodyArmour) {
    const b = btn('BUY', () => {
      if (buyUpgrade(eco, 'bodyArmour')) {
        game.player.armour = BODY_ARMOUR_VALUE;
        persist();
        rebuildGaragePanel();
      } else showDialogue('Not enough cash.', 2);
    });
    if (!canBuyUpgrade(eco, 'bodyArmour')) b.disabled = true;
    bodyRow.appendChild(b);
  } else if (game.player.armour < BODY_ARMOUR_VALUE) {
    // Re-equipping Body Armour you already own is FREE: buyUpgrade returns
    // true without charging when bodyArmour is already owned. The old code
    // charged $500 again through spendMoney — that was the L2 re-equip bug.
    bodyRow.appendChild(btn('RE-EQUIP (FREE)', () => {
      if (buyUpgrade(eco, 'bodyArmour')) {
        game.player.armour = BODY_ARMOUR_VALUE;
        persist();
        rebuildGaragePanel();
      }
    }));
  } else {
    bodyRow.appendChild(el('span', '', 'WORN'));
  }
  panel.appendChild(bodyRow);

  panel.appendChild(btn('CLOSE', () => closeOverlay()));
}

// deliverCar(model) — place an owned garage car near the player with its
// upgrades applied (never inside a building).
function deliverCar(model) {
  const px = game.player.car ? game.player.car.x : game.player.x;
  const pz = game.player.car ? game.player.car.z : game.player.z;
  const yaw = game.player.car ? game.player.car.yaw : game.player.yaw;
  const spots = [
    { x: px + 5, z: pz + 5 }, { x: px - 5, z: pz + 5 },
    { x: px + 5, z: pz - 5 }, { x: px - 5, z: pz - 5 }, { x: px, z: pz + 7 },
  ];
  let spot = spots[0];
  for (const s of spots) {
    if (!isInsideBuilding(game.city, s.x, s.z)) { spot = s; break; }
  }
  const car = makeCar(model, spot.x, spot.z, yaw, 'player');
  applyUpgradesToCar(car);
  game.cars.push(car);
  showDialogue(`${CAR_DEFS[model].name} delivered — press E to get in.`, 4);
  closeOverlay();
}

// openBoard() — mission board: all 5 missions with lock state, best times,
// payouts and briefings.
function openBoard() {
  returnTo = screen === 'paused' ? 'paused' : 'playing';
  screen = 'board';
  audio.setSiren(false);
  audio.setEngine(0, 40);
  rebuildBoardPanel();
  showPanel('board');
}

// rebuildBoardPanel() — mission board content from live mission state.
function rebuildBoardPanel() {
  const panel = panels.board;
  panel.innerHTML = '';
  panel.appendChild(el('h2', '', 'MISSION BOARD'));
  panel.appendChild(el('p', '', `Debt: $${game.economy.debt.toLocaleString('en-US')} — clear it to win.`));
  MISSIONS.forEach((m, i) => {
    const status = i < game.missions.index ? 'COMPLETED' : i === game.missions.index ? 'CURRENT' : 'LOCKED';
    const box = el('div', 'mission-box');
    box.appendChild(el('h3', '', `${i + 1}. ${m.name} — ${status}`));
    box.appendChild(el('p', '', `Payout $${m.payout.toLocaleString('en-US')} · +${m.rep} REP · Best: ${bestTimes[i] != null ? `${bestTimes[i]}s` : '—'}`));
    for (const line of m.briefing) box.appendChild(el('p', 'briefing', line));
    panel.appendChild(box);
  });
  panel.appendChild(btn('CLOSE', () => closeOverlay()));
}

// showResults(wasted, penalty, impounded) — busted / wasted results screen.
// The penalty text names the impounded car ONLY when the player held one.
function showResults(wasted, penalty, impounded) {
  const panel = panels.results;
  panel.innerHTML = '';
  panel.appendChild(el('h2', '', wasted ? 'WASTED' : 'BUSTED'));
  const mission = currentMission(game.missions);
  panel.appendChild(el('p', '', wasted
    ? `Hospital bill: $${penalty.toLocaleString('en-US')} (15% of your cash).`
    : `Bail: $${penalty.toLocaleString('en-US')} (10% of your cash).`));
  if (impounded) panel.appendChild(el('p', '', 'Your car was impounded.'));
  panel.appendChild(el('p', '', mission
    ? `Mission "${mission.name}" restarts from the beginning.`
    : 'The debt is still waiting.'));
  panel.appendChild(btn('RETRY', () => retryFromResults()));
  panel.appendChild(btn('QUIT TO TITLE', () => quitToTitle()));
  screen = 'mission-failed';
  audio.setSiren(false);
  audio.setEngine(0, 40);
  audio.stopRadio();
  audio.stopMusic();
  showPanel('results');
}

// retryFromResults() — back to play after busted/wasted (respawned at the
// live NEW GAME spawn, (200,140) on The Strip).
function retryFromResults() {
  screen = 'playing';
  playStartedAt = performance.now();
  showPanel(null);
  hud.setVisible(true);
  audio.startMusic();
}

// showWin() — YOU WIN screen after M5 pays off the debt.
function showWin() {
  const panel = panels.win;
  panel.innerHTML = '';
  panel.appendChild(el('h2', '', 'YOU WIN'));
  panel.appendChild(el('p', '', 'The $15,000 debt is paid. Madame Inez is off your back — Vela Bay is yours, Dash.'));
  panel.appendChild(el('p', '', `Cash: $${game.economy.money.toLocaleString('en-US')} · REP ${game.economy.rep} · Best score $${bestScore.toLocaleString('en-US')}`));
  panel.appendChild(btn('KEEP DRIVING', () => {
    screen = 'playing';
    playStartedAt = performance.now();
    showPanel(null);
    hud.setVisible(true);
    audio.startMusic();
  }));
  panel.appendChild(btn('QUIT TO TITLE', () => quitToTitle()));
  screen = 'won';
  audio.setSiren(false);
  audio.setEngine(0, 40);
  audio.stopRadio();
  audio.stopMusic();
  showPanel('win');
}

// --- Game actions ---
// onEnterExit() — E key: get out of the car, or get into the nearest car
// (stealing a traffic car is a crime: +1 star).
function onEnterExit() {
  const player = game.player;
  if (player.car) {
    const car = player.car;
    if (exitCar(player, game.city)) {
      returnCarToWorld(car);
      audio.stopRadio();
      audio.startMusic();
    }
    return;
  }
  const car = nearestCar(player, game.cars);
  if (!car) return;
  if (Math.hypot(car.x - player.x, car.z - player.z) > ENTER_CAR_RANGE) return;
  if (car.owner === 'police') {
    showDialogue("That's a VBPD unit — too hot to steal.", 3);
    return;
  }
  const wasTraffic = car.owner === 'traffic';
  removeTrafficWrapper(car);
  if (enterCar(player, car, game.cars)) {
    if (wasTraffic) {
      addCrime(game.wanted, 'steal', game.time);
      showDialogue(`Stole a ${CAR_DEFS[car.model].name}!`, 3);
    }
    audio.stopMusic();
    audio.startRadio(nextStation());
  }
}

// onSellCar() — F key: sell a stolen car at Marco's garage. Only when slow,
// only near the garage, never the M1 taxi or a car on its deliver step
// (M2 fix: canSellCar enforces that; the delivered car also loses its stolen
// flag when the mission completes, so it can never pay twice).
function onSellCar() {
  const player = game.player;
  if (!player.car) return;
  const car = player.car;
  if (Math.abs(car.speed) >= 3) { showDialogue('Slow down to sell the car.', 2); return; }
  const dGarage = Math.hypot(car.x - LANDMARKS.garage.x, car.z - LANDMARKS.garage.z);
  if (dGarage > GARAGE_SELL_RANGE) { showDialogue("Get to Marco's garage to sell.", 2); return; }
  if (!canSellCar(game, car)) { showDialogue('This car is part of a job — no sale.', 3); return; }
  const price = sellPriceFor(car.model);
  if (price <= 0) { showDialogue("Marco doesn't want this one.", 2); return; }
  addMoney(game.economy, price);
  showToast(`+$${price} sold ${CAR_DEFS[car.model].name}`);
  audio.cash();
  player.car = null;
  player.onFoot = true;
  player.x = car.x;
  player.z = car.z;
  player.yaw = car.yaw;
  removeCarFromWorld(car);
  persist(); // side earnings persist immediately
}

// aimPointFromMouse() — ray from the camera through the mouse cursor onto
// the ground plane (y=0), computed from the camera world matrix with plain
// math (main.js does not import three.js). A sky aim returns a far point.
function aimPointFromMouse() {
  const w = window.innerWidth || 1280;
  const h = window.innerHeight || 720;
  const ndcX = (input.mouse.x / w) * 2 - 1;
  const ndcY = -(input.mouse.y / h) * 2 + 1;
  const tanHalf = Math.tan((camera.fov * Math.PI / 180) / 2);
  const aspect = camera.aspect || w / h;
  const e = camera.matrixWorld.elements; // column-major: right, up, backward
  let dx = e[0] * ndcX * tanHalf * aspect + e[4] * ndcY * tanHalf - e[8];
  let dy = e[1] * ndcX * tanHalf * aspect + e[5] * ndcY * tanHalf - e[9];
  let dz = e[2] * ndcX * tanHalf * aspect + e[6] * ndcY * tanHalf - e[10];
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len; dy /= len; dz /= len;
  const px = camera.position.x;
  const py = camera.position.y;
  const pz = camera.position.z;
  if (dy >= -0.001) return { x: px + dx * 150, z: pz + dz * 150 }; // sky aim
  const t = -py / dy;
  return { x: px + dx * t, z: pz + dz * t };
}

// onShoot() — mouse click on foot: one pistol shot at the mouse aim point.
// shoot() fires the rate-limited 'shoot' crime itself on a ped/car hit
// (M4 fix) — main.js must NOT add a second addCrime for shooting. A kill
// pays $200 (vigilante) and draws one 'kill' star, and saves immediately.
function onShoot() {
  const player = game.player;
  if (!player.onFoot || screen !== 'playing') return;
  if (ammo <= 0) { showDialogue('Out of ammo — press R to reload.', 2); return; }
  ammo--;
  const aim = aimPointFromMouse();
  const result = shoot(game, player.x, player.z, aim.x, aim.z);
  audio.gunshot();
  showHitMarker(input.mouse.x, input.mouse.y, result.hit);
  // Tracer: a bright yellow line from the muzzle to the shot's impact
  // point, live for ~2 frames. A burst marks any real hit — ped, car or
  // wall — so the shot reads on screen.
  const { from: muzzle, to: impact } = tracerEndpoints(player.x, player.z, player.yaw, result);
  fireTracer(tracerState, muzzle, impact);
  const impactY = impact.y;
  if (result.hit) spawnBurst(burstPool, result.x, impactY, result.z, { count: 10, speed: 4 });
  if (result.killed) {
    addCrime(game.wanted, 'kill', game.time);
    addMoney(game.economy, 200);
    showToast('+$200 vigilante kill');
    audio.cash();
    persist(); // side earnings persist immediately
  }
}

// showHitMarker(x, y, hit) — small DOM hit marker at the cursor.
let hitMarkerEl = null;
function showHitMarker(x, y, hit) {
  if (!hitMarkerEl) {
    hitMarkerEl = document.createElement('div');
    hitMarkerEl.style.cssText = 'position:fixed;pointer-events:none;z-index:30;font-size:22px;font-weight:bold;text-shadow:0 0 4px #000;transition:opacity .3s;';
    document.body.appendChild(hitMarkerEl);
  }
  hitMarkerEl.textContent = hit ? '✕' : '·';
  hitMarkerEl.style.color = hit ? '#ff4040' : 'rgba(255,255,255,.7)';
  hitMarkerEl.style.left = `${x - 11}px`;
  hitMarkerEl.style.top = `${y - 14}px`;
  hitMarkerEl.style.opacity = '1';
  clearTimeout(hitMarkerEl._t);
  hitMarkerEl._t = setTimeout(() => { hitMarkerEl.style.opacity = '0'; }, 250);
}

// maintainPolice() — keep the live unit count at min(wanted stars, 3);
// no heat means no units.
function maintainPolice() {
  const px = game.player.car ? game.player.car.x : game.player.x;
  const pz = game.player.car ? game.player.car.z : game.player.z;
  const desired = game.wanted.stars > 0 ? Math.min(game.wanted.stars, POLICE_MAX_UNITS) : 0;
  while (game.police.length < desired) {
    const unit = spawnPolice(game.city, { x: px, z: pz }, game.rng, game.wanted, game.police);
    game.police.push(unit);
    game.cars.push(unit.car);
  }
  while (game.police.length > desired) {
    const unit = game.police.pop();
    const i = game.cars.indexOf(unit.car);
    if (i >= 0) game.cars.splice(i, 1);
  }
}

// hurtPlayerByTraffic(dt) — a fast car within 1.8 m of the on-foot player
// hurts (damagePlayer absorbs through armour first; death = busted).
function hurtPlayerByTraffic(dt) {
  playerHitCooldown = Math.max(0, playerHitCooldown - dt);
  if (playerHitCooldown > 0 || !game.player.onFoot) return;
  for (const car of allCarsList()) {
    if (Math.abs(car.speed) <= 5) continue;
    if (Math.hypot(car.x - game.player.x, car.z - game.player.z) >= 1.8) continue;
    damagePlayer(game.player, 25);
    playerHitCooldown = 1;
    shakeAmp = Math.max(shakeAmp, 0.5);
    audio.crash(0.5);
    break;
  }
}

// handleMissionEvents(events) — mission 'step' / 'missionComplete' / 'win':
// dialogue + toast + chime + immediate save; best times recorded.
function handleMissionEvents(events) {
  for (const ev of events) {
    if (ev.type === 'step') {
      const m = MISSIONS[game.missions.index];
      const next = m ? m.steps[ev.step + 1] : null;
      if (next) showDialogue(next.label, 4);
    } else if (ev.type === 'missionComplete') {
      const m = MISSIONS.find((mm) => mm.id === ev.mission);
      showToast(`+$${ev.payout} · +${ev.rep} REP — ${m ? m.name : ev.mission} complete`);
      audio.cash();
      const completed = game.missions.index - 1;
      const elapsed = Math.round(game.time - missionStartTime);
      if (completed >= 0 && (bestTimes[completed] == null || elapsed < bestTimes[completed])) {
        bestTimes[completed] = elapsed;
      }
      persist(); // save after every mission
      const next = currentMission(game.missions);
      showDialogue(next ? next.briefing[0] : 'Debt cleared.', 5);
    } else if (ev.type === 'win') {
      persist();
      showWin();
    }
  }
}

// handleBusted() — busted (arrested) or wasted (health 0): 10% bail / 15%
// hospital bill capped at cash on hand, mission restarts from step 0 (the
// start hook re-applies the mission's wanted level), wanted + police
// cleared, car impounded ONLY if the player held one, respawn at (200,140).
function handleBusted() {
  const wasted = game.player.health <= 0;
  const wasInCar = !!game.player.car;
  const rate = wasted ? 0.15 : 0.10;
  const penalty = Math.min(Math.floor(game.economy.money * rate), game.economy.money);
  game.economy.money -= penalty;
  game.missions.stepIndex = 0;
  game.missions.started = false;
  game.wanted.stars = 0;
  game.wanted.noLosTime = 0;
  despawnPolice();
  let impounded = false;
  if (wasInCar) {
    removeCarFromWorld(game.player.car);
    game.player.car = null;
    impounded = true;
  }
  respawnPlayer(game.player, game.economy.bodyArmour); // back on foot at (200,140), armour re-equipped
  persist();
  showResults(wasted, penalty, impounded);
}

// stepSim(dt) — one fixed 1/60 s sim step: player/car, traffic, collisions,
// peds, police, missions, busted/wasted.
function stepSim(dt) {
  game.time += dt;
  const k = input.keys;
  const player = game.player;

  // 1. Player: H1 FIX (exact) — BEFORE stepping the player's car, a wrecked
  // (0% condition) car coasts to a stop (handbrake, no throttle) and the
  // player is forced out once it stops, with a message. The check lives
  // here in main.js, NOT inside stepCar().
  if (player.car) {
    const car = player.car;
    if (isWrecked(car)) {
      stepCar(car, { throttle: 0, steer: 0, handbrake: true }, dt, game.city);
      if (Math.abs(car.speed) < 0.5) {
        exitCar(player, game.city);
        returnCarToWorld(car);
        showDialogue('Your car is wrecked!', 4);
        // Boxed in: a police unit right beside the wreck arrests Dario.
        const nearPolice = game.police.some(
          (u) => Math.hypot(u.car.x - player.x, u.car.z - player.z) < 10,
        );
        if (nearPolice && game.wanted.stars > 0) player.busted = true;
      }
    } else {
      const beforeHealth = car.health;
      stepCar(car, {
        throttle: ((k.KeyW || k.ArrowUp) ? 1 : 0) - ((k.KeyS || k.ArrowDown) ? 1 : 0),
        steer: ((k.KeyD || k.ArrowRight) ? 1 : 0) - ((k.KeyA || k.ArrowLeft) ? 1 : 0),
        handbrake: !!k.Space,
      }, dt, game.city);
      if (beforeHealth - car.health > 3) {
        shakeAmp = Math.max(shakeAmp, 0.6);
        audio.crash(0.6);
        // Hard crash: an orange burst at the impact, visible for ~1-2 s.
        spawnBurst(burstPool, car.x, 0.8, car.z);
      }
      // Skid marks: handbraking at speed lays a rear-wheel pair every
      // other step, so the trail reads without flooding the 48-mark pool.
      if (shouldSkid(car.speed, !!k.Space)) {
        skidTick++;
        if (skidTick % 2 === 0) addSkidPair(skidPool, car);
      }
    }
  } else {
    stepPlayer(player, {
      w: !!(k.KeyW || k.ArrowUp),
      a: !!(k.KeyA || k.ArrowLeft),
      s: !!(k.KeyS || k.ArrowDown),
      d: !!(k.KeyD || k.ArrowRight),
    }, dt, game.city);
    hurtPlayerByTraffic(dt);
  }

  // 2. Traffic + car-vs-car push-apart.
  stepTraffic(game.traffic, dt, game.city);
  const allCars = allCarsList();
  resolveCarCollisions(allCars, dt, game.time);

  // 3. Peds + ped hits (only the player's car is ever blamed). A ped
  // going down in the hit throws a burst at the spot.
  stepPeds(game.peds, dt, game.city);
  const pedHits = checkPedHits(game.peds, allCars, player.car, game.wanted, game.time);
  for (const hit of pedHits) {
    if (hit.down) spawnBurst(burstPool, hit.ped.x, 0.8, hit.ped.z, { count: 14, speed: 5 });
  }

  // 4. Police: maintain count, then pursue / arrest / decay / roadblocks.
  maintainPolice();
  stepPolice(game.police, dt, game.city, player, game);

  // 5. Missions: keep mission cars alive (M2 call site), then advance.
  ensureMissionCars(game);
  handleMissionEvents(stepMissions(game.missions, game));

  // Mission start tracking (best times).
  if (game.missions.index !== lastMissionIndex) {
    lastMissionIndex = game.missions.index;
    missionStartTime = game.time;
  }

  // 6. Busted / wasted.
  if (player.busted) handleBusted();

  // 7. Best score = highest cash ever held.
  if (game.economy.money > bestScore) bestScore = game.economy.money;
}

// stepAmbient(dt) — title-screen life: traffic + peds only, no crimes,
// no missions, no police.
function stepAmbient(dt) {
  const d = Math.min(dt, 0.05);
  stepTraffic(game.traffic, d, game.city);
  stepPeds(game.peds, d, game.city);
}

// --- HUD ---
// updateHud() — one state snapshot per frame into the HUD (mission line +
// distance, wanted, police panel, roadblocks, clock, money/REP/debt,
// health/armour, ammo, speed, vehicle, dialogue, radio, minimap).
function updateHud() {
  const player = game.player;
  const px = player.car ? player.car.x : player.x;
  const pz = player.car ? player.car.z : player.z;
  const progress = missionProgress(game.missions);
  const step = currentStep(game.missions);
  let missionText = 'Free roam — press B for missions';
  let missionDistance = null;
  let marker = null;
  if (!progress.done && step) {
    missionText = `${progress.name} — ${progress.label}`;
    if (step.x != null) {
      marker = { x: step.x, z: step.z };
      missionDistance = Math.hypot(px - step.x, pz - step.z);
    }
  }
  const policeState = game.police.map((u) => ({
    name: u.name,
    distance: Math.hypot(u.car.x - px, u.car.z - pz),
    state: u.state,
    x: u.car.x,
    z: u.car.z,
    visible: u.hasLOS,
    lastX: u.lastKnown.x,
    lastZ: u.lastKnown.z,
  }));
  if (game.heli) {
    policeState.push({
      name: 'HELI-1',
      distance: Math.hypot(game.heli.x - px, game.heli.z - pz),
      state: 'airborne',
      x: game.heli.x,
      z: game.heli.z,
      visible: true,
    });
  }
  const nearest = player.onFoot ? nearestCar(player, game.cars) : null;
  const now = performance.now();
  let dialogue = now < dialogueUntil ? dialogueText : '';
  let vehicleName = player.car
    ? CAR_DEFS[player.car.model].name + (player.car.stolen ? ' · STOLEN' : '')
    : 'ON FOOT';
  if (shotHud) {
    dialogue = shotHud.dialogue || '';
    vehicleName = shotHud.vehicleName || vehicleName;
  }
  hud.update({
    missionText,
    missionDistance,
    missionMarker: marker,
    wanted: game.wanted.stars,
    police: policeState,
    roadblocks: game.roadblocks,
    roadblockAhead: roadblockAhead(px, pz, game.roadblocks),
    clock: { minutes: game.clock.minutes, day: game.clock.day, phase: phaseOf(game.clock) },
    money: game.economy.money,
    rep: game.economy.rep,
    debt: game.economy.debt,
    health: player.health,
    armour: player.armour,
    ammo,
    maxAmmo: WEAPON.magSize,
    speed: player.car ? Math.abs(player.car.speed) : 0,
    vehicleName,
    inCar: !!player.car,
    dialogue,
    radio: player.car ? audio.currentRadio() : '',
    toast: toastText,
    toastKey,
    player: { x: px, z: pz, yaw: player.car ? player.car.yaw : player.yaw },
    traffic: game.traffic.map((t) => ({ x: t.car.x, z: t.car.z })),
    enterCar: nearest ? { x: nearest.x, z: nearest.z } : null,
  });
  // Controls hint: the ONE place controls live — first 15 s of play only,
  // never in photo mode.
  const hintEl = hud.elements.hint;
  if (hintEl) {
    hintEl.style.display = (!photoMode && screen === 'playing' && now - playStartedAt < 15000) ? '' : 'none';
  }
}

// --- Per-frame view (camera, meshes, HUD, audio) ---
function updateView(rawDt) {
  const night = nightFactor(game.clock);
  updateDayNight(scene, game.clock);
  if (game.player.car) {
    updateCamera(camera, { x: game.player.car.x, z: game.player.car.z, yaw: game.player.car.yaw }, rawDt, 'chase');
  } else {
    const k = input.keys;
    const movingForward = !!(k.KeyW || k.ArrowUp)
      && !(k.KeyA || k.ArrowLeft) && !(k.KeyD || k.ArrowRight) && !(k.KeyS || k.ArrowDown);
    updateCamera(camera, { x: game.player.x, z: game.player.z, yaw: game.player.yaw, movingForward }, rawDt, 'foot');
  }
  if (shakeAmp > 0.001) {
    camera.position.x += (Math.random() - 0.5) * shakeAmp;
    camera.position.y += (Math.random() - 0.5) * shakeAmp * 0.5;
    shakeAmp = Math.max(0, shakeAmp - rawDt * 1.5);
  }
  syncAllMeshes(rawDt);
  updateHud();
  if (game.player.car) {
    audio.setEngine(Math.abs(game.player.car.speed), effectiveTop(game.player.car));
  } else {
    audio.setEngine(0, 40);
  }
  let nearestPolice = Infinity;
  for (const u of game.police) {
    const d = Math.hypot(u.car.x - pxOf(), u.car.z - pzOf());
    if (d < nearestPolice) nearestPolice = d;
  }
  audio.setSiren(game.police.length > 0 && game.wanted.stars > 0, nearestPolice);
  if (game.player.car && input.keys.Space && Math.abs(game.player.car.speed) > 10) audio.skid();

  function pxOf() { return game.player.car ? game.player.car.x : game.player.x; }
  function pzOf() { return game.player.car ? game.player.car.z : game.player.z; }
}

// --- Input handling per screen ---
// handleTitleKeys() — Space / Enter starts play (like a title click); M mutes.
function handleTitleKeys() {
  for (const code of input.takePressed()) {
    if (code === 'Space' || code === 'Enter') startGame();
    else if (code === 'KeyM') toggleMute();
  }
}

// handlePlayingKeys() — action keys + mouse aim + shooting while playing.
function handlePlayingKeys() {
  for (const code of input.takePressed()) {
    if (code === 'KeyE') onEnterExit();
    else if (code === 'KeyR') { if (game.player.onFoot) ammo = WEAPON.magSize; }
    else if (code === 'KeyG') {
      // Garage gate: Marco's garage opens only within 25 m of (150,125).
      // Opening it anywhere used to let the player shop from across town.
      const gx = game.player.car ? game.player.car.x : game.player.x;
      const gz = game.player.car ? game.player.car.z : game.player.z;
      if (Math.hypot(gx - LANDMARKS.garage.x, gz - LANDMARKS.garage.z) > GARAGE_OPEN_RANGE) {
        showDialogue("Get to Marco's garage to open it.", 2);
      } else {
        openGarage();
      }
    }
    else if (code === 'KeyF') onSellCar();
    else if (code === 'KeyB') openBoard();
    else if (code === 'KeyP' || code === 'Escape') showPause();
    else if (code === 'KeyM') toggleMute();
    else if (code === 'KeyQ') quitToTitle();
  }
  // Mouse aim on foot: Dario faces the cursor (W walks toward it).
  if (game.player.onFoot) {
    const aim = aimPointFromMouse();
    game.player.yaw = Math.atan2(aim.x - game.player.x, aim.z - game.player.z);
  }
  if (input.mouse.clicked) {
    input.clearClick();
    onShoot();
  }
}

// handleMenuKeys() — keys on the frozen screens (pause / overlays / results).
function handleMenuKeys() {
  for (const code of input.takePressed()) {
    if (screen === 'paused') {
      if (code === 'KeyP' || code === 'Escape') resumeGame();
      else if (code === 'KeyM') toggleMute();
      else if (code === 'KeyQ') quitToTitle();
    } else if (screen === 'garage' || screen === 'board' || screen === 'howto') {
      if (code === 'Escape' || code === 'KeyP' || code === 'KeyG' || code === 'KeyB') closeOverlay();
      else if (code === 'KeyM') toggleMute();
    } else if (screen === 'mission-failed') {
      if (code === 'Enter') retryFromResults();
    } else if (screen === 'won') {
      if (code === 'Enter') {
        screen = 'playing';
        playStartedAt = performance.now();
        showPanel(null);
        hud.setVisible(true);
        audio.startMusic();
      }
    }
  }
}

// --- Frame loop ---
// frame(now) — input -> sim steps (fixed 1/60 s, accumulate real elapsed
// time, several steps in a slow frame, none in a fast one, stalls over
// 0.25 s dropped) -> view render. The clock ticks on wall time (rawDt).
function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = Math.min(Math.max((now - lastT) / 1000, 0), 0.25);
  lastT = now;

  if (photoMode) {
    // Frozen staged frame: render only, never step the sim.
    renderer.render(scene, camera);
    return;
  }

  if (screen === 'title') {
    titleAngle = titleOrbitAngle(titleAngle, rawDt);
    setTitleOrbit(camera, titleAngle);
    game.clock.minutes = 18.5 * 60; // clock pinned to 18:30 sunset on title
    updateDayNight(scene, game.clock);
    stepAmbient(rawDt);
    syncAllMeshes(rawDt);
    renderer.render(scene, camera);
    handleTitleKeys();
    return;
  }

  if (screen === 'playing') {
    handlePlayingKeys();
    if (screen !== 'playing') { renderer.render(scene, camera); return; }
    tickClock(game.clock, rawDt); // wall time, capped 0.5 s/frame inside
    acc += rawDt;
    let n = 0;
    while (acc >= STEP && n < 5) {
      stepSim(STEP);
      acc -= STEP;
      n++;
      if (screen !== 'playing') break; // busted / won mid-frame
    }
    if (n === 5) acc = 0; // drop backlog after a long stall
    updateView(rawDt);
    renderer.render(scene, camera);
    return;
  }

  // paused / garage / board / howto / mission-failed / won: frozen sim,
  // live backdrop.
  handleMenuKeys();
  renderer.render(scene, camera);
}

// --- Photo mode ---
// stagePhotoMode(sceneName, seed) — stage a deterministic screenshot scene:
// reset the world via applyShot, rebuild meshes, snap the camera, update the
// HUD, render twice, and set window.__velaShotReady. The sim stays frozen
// afterwards (the frame loop renders only).
function stagePhotoMode(sceneName, seed) {
  const info = applyShot(game, sceneName, seed);
  shotHud = info;
  rebuildAllMeshes();
  if (info.camera.mode === 'fixed') {
    setFixedCamera(camera, info.camera.position, info.camera.lookAt);
  } else if (info.camera.mode === 'chase') {
    updateCamera(camera, { x: game.player.car.x, z: game.player.car.z, yaw: game.player.car.yaw }, 5, 'chase');
  } else {
    updateCamera(camera, { x: game.player.x, z: game.player.z, yaw: game.player.yaw, movingForward: false }, 5, 'foot');
  }
  updateDayNight(scene, game.clock);
  syncAllMeshes(0);
  updateHud();
  hud.setVisible(true);
  showPanel(null);
  renderer.render(scene, camera);
  renderer.render(scene, camera);
  window.__velaShotReady = true;
}

// sample() — framebuffer luminance bands for tests: render, read the centre
// 64x36 of the drawing buffer, return 9 horizontal band means + overall mean.
function sample() {
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  const w = 64;
  const h = 36;
  const bw = renderer.domElement.width || w;
  const bh = renderer.domElement.height || h;
  const x = Math.max(0, Math.floor((bw - w) / 2));
  const y = Math.max(0, Math.floor((bh - h) / 2));
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const bands = [];
  const rowsPerBand = Math.floor(h / 9);
  let total = 0;
  for (let b = 0; b < 9; b++) {
    let sum = 0;
    let n = 0;
    for (let r = b * rowsPerBand; r < (b + 1) * rowsPerBand; r++) {
      for (let c = 0; c < w; c++) {
        const i = (r * w + c) * 4;
        sum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
        n++;
      }
    }
    const v = n ? sum / n / 255 : 0;
    bands.push(+v.toFixed(3));
    total += v;
  }
  return { bands, mean: +(total / 9).toFixed(3) };
}

// --- Test hooks ---
window.__vela = {
  get game() { return game; },
  // fx — live polish-effect counts for verification: burst sparks alive,
  // whether the tracer is lit, skid marks on the road, heli mesh visible.
  get fx() {
    return {
      bursts: burstPool.sparks.length,
      tracer: tracerState.active,
      skids: skidPool.marks.length,
      heliVisible: !!(heliMesh && heliMesh.visible),
      roadblocks: game.roadblocks.length,
    };
  },
  // setTime(hours) — set the clock (tests + photo mode).
  setTime(hours) {
    game.clock.minutes = (((hours % 24) + 24) % 24) * 60;
    updateDayNight(scene, game.clock);
  },
  sample,
  // stageShot(sceneName, seed) — stage a photo-mode scene on demand.
  stageShot(sceneName, seed) {
    photoMode = true;
    stagePhotoMode(sceneName, seed);
  },
};
window.__velaShotReady = false;

// --- Boot ---
buildMenus();
if (hud.elements.hint) hud.elements.hint.style.bottom = '64px'; // hint sits above the dialogue line

function onResize() {
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);
onResize();

// Photo mode reads the scene + seed from the page address (?shot=<scene>&seed=<n>).
const params = new URLSearchParams(window.location.search);
const shotScene = params.get('shot') || params.get('scene');
const shotSeed = Number.parseInt(params.get('seed') || '7', 10);
if (shotScene && SHOT_SCENES[shotScene]) {
  photoMode = true;
  stagePhotoMode(shotScene, Number.isFinite(shotSeed) ? shotSeed : 7);
} else {
  showTitle();
}
requestAnimationFrame(frame);
