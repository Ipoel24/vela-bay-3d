// save.js — localStorage save/load for VELA BAY 3D, with validation and the L3 mission-step clamp. Pure logic, no three.js, runs in Node.

// localStorage key for the save slot.
export const SAVE_KEY = 'vela-bay-save-v1';

// Save format version. A save whose version differs is rejected (returns null).
export const SAVE_VERSION = 1;

// City bounds used to clamp saved positions (Vela Bay is an 8x8-block city;
// landmarks run to ~425 m, so 600 m is a generous safe edge).
export const POSITION_MIN = -100;
export const POSITION_MAX = 600;

// freshSave() — fresh defaults: $1,200 cash, REP 1, $15,000 debt, first
// mission unlocked, taxi owned, no upgrades, no body armour, best score 0,
// clock 08:00 day 1, player at the live NEW GAME spawn (200,140) on The
// Strip, next to the parked taxi — the same spot a fresh game starts.
export function freshSave() {
  return {
    version: SAVE_VERSION,
    money: 1200,
    rep: 1,
    debt: 15000,
    ownedCars: ['taxi'],
    upgrades: { engine: 0, armour: 0 },
    bodyArmour: 0,
    clockMinutes: 480, // 08:00
    day: 1,
    positions: { player: { x: 200, z: 140 }, car: null },
    missionIndex: 0,
    missionStep: 0,
    bestScore: 0,
    bestTimes: {},
  };
}

// saveGame(state, missions) — write the save immediately. Reads money, REP,
// debt, upgrades, bodyArmour, clock minutes/day, positions, mission index +
// step, owned cars, best score/times from `state` (flat fields, or
// state.clock = { minutes, day }). The game calls this after every mission
// and on every side earning. Returns true when the write succeeded.
export function saveGame(state, missions) {
  const storage = globalThis.localStorage;
  if (!storage) return false;
  const save = buildSave(state, missions);
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

// loadGame(missions) — read and validate the save, or null when there is no
// save, it is corrupt, or its version is wrong. `missions` is the missions
// array (each entry has a `steps` array); when given, missionIndex and
// missionStep are clamped to it (L3 fix: a corrupt/hand-edited save with
// missionStep 99 is clamped to the last step and cannot soft-lock).
export function loadGame(missions) {
  const storage = globalThis.localStorage;
  if (!storage) return null;
  let raw;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
  if (raw == null) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null; // corrupt save
  }
  return applySave(parsed, missions);
}

// applySave(save, missions) — validate + clamp a parsed save object and
// return a normalised save, or null when it is not a usable save (wrong
// version, not an object, or a non-numeric money field). Out-of-range values
// are clamped with safe fallbacks instead of rejecting the save.
export function applySave(save, missions) {
  if (!save || typeof save !== 'object' || Array.isArray(save)) return null;
  if (save.version !== SAVE_VERSION) return null; // wrong version
  if (!Number.isFinite(save.money)) return null;

  const out = freshSave();
  out.money = Math.max(0, Math.min(999999999, Math.floor(save.money)));
  out.rep = clampInt(save.rep, 1, 999, 1);
  out.debt = Math.max(0, Number.isFinite(save.debt) ? Math.floor(save.debt) : 15000);
  // Owned cars must be real catalogue models: drop anything else a
  // hand-edited save smuggled in, and never end up with an empty garage.
  const KNOWN_CARS = ['taxi', 'cometa', 'brisa', 'tiburon', 'van'];
  out.ownedCars = Array.isArray(save.ownedCars) && save.ownedCars.length > 0
    ? save.ownedCars.filter((c) => typeof c === 'string' && KNOWN_CARS.includes(c))
    : ['taxi'];
  if (out.ownedCars.length === 0) out.ownedCars = ['taxi'];
  out.upgrades = {
    engine: clampInt(save.upgrades?.engine, 0, 3, 0),
    armour: clampInt(save.upgrades?.armour, 0, 3, 0),
  };
  out.bodyArmour = clampInt(save.bodyArmour, 0, 50, 0);
  out.clockMinutes = clampInt(save.clockMinutes, 0, 1439, 480);
  out.day = clampInt(save.day, 1, 9999, 1);
  out.positions = {
    player: clampPosition(save.positions?.player, { x: 200, z: 140 }),
    car: save.positions?.car ? clampPosition(save.positions.car, null) : null,
  };
  out.bestScore = Math.max(0, Math.min(999999999, Number.isFinite(save.bestScore) ? Math.floor(save.bestScore) : 0));
  // Best times must be a plain map of finite non-negative seconds; any
  // junk entry is dropped rather than trusted into the mission board.
  out.bestTimes = {};
  if (save.bestTimes && typeof save.bestTimes === 'object' && !Array.isArray(save.bestTimes)) {
    for (const [k, v] of Object.entries(save.bestTimes)) {
      if (Number.isFinite(v) && v >= 0) out.bestTimes[k] = Math.floor(v);
    }
  }

  // Mission index/step, clamped to the missions array when it is given
  // (L3 fix). Without the array, only the >= 0 clamp applies.
  const missionCount = Array.isArray(missions) ? missions.length : 0;
  let missionIndex = clampInt(save.missionIndex, 0, missionCount > 0 ? missionCount - 1 : 4, 0);
  out.missionIndex = missionIndex;
  let stepMax = 0;
  if (Array.isArray(missions) && missions[missionIndex] && Array.isArray(missions[missionIndex].steps)) {
    stepMax = Math.max(0, missions[missionIndex].steps.length - 1);
  }
  // Out-of-range step is clamped to the last step (mission effectively
  // complete-able, never soft-locked).
  out.missionStep = clampInt(save.missionStep, 0, stepMax, 0);
  return out;
}

// wipeSave() — reset to fresh defaults AND persist the fresh save at once,
// so a reload after starting a new game still shows the fresh values.
// Returns the fresh save object.
export function wipeSave() {
  const fresh = freshSave();
  const storage = globalThis.localStorage;
  if (storage) {
    try {
      storage.setItem(SAVE_KEY, JSON.stringify(fresh));
    } catch {
      // Storage unavailable: the caller still gets the fresh defaults.
    }
  }
  return fresh;
}

// buildSave(state, missions) — normalise a live game state into save shape
// (shared by saveGame; clamping runs through applySave so a save written
// out is always one loadGame can read back).
function buildSave(state, missions) {
  const s = state && typeof state === 'object' ? state : {};
  const clockMinutes = Number.isFinite(s.clockMinutes)
    ? s.clockMinutes
    : Number.isFinite(s.clock?.minutes) ? s.clock.minutes : 480;
  const day = Number.isFinite(s.day)
    ? s.day
    : Number.isFinite(s.clock?.day) ? s.clock.day : 1;
  const candidate = {
    version: SAVE_VERSION,
    money: s.money,
    rep: s.rep,
    debt: s.debt,
    ownedCars: s.ownedCars,
    upgrades: s.upgrades,
    bodyArmour: s.bodyArmour,
    clockMinutes,
    day,
    positions: s.positions ?? (s.playerPos ? { player: s.playerPos, car: s.carPos ?? null } : undefined),
    missionIndex: s.missionIndex,
    missionStep: s.missionStep,
    bestScore: s.bestScore,
    bestTimes: s.bestTimes,
  };
  return applySave(candidate, missions) ?? freshSave();
}

// clampInt(value, min, max, fallback) — integer clamp with a safe fallback
// for missing/non-finite values.
function clampInt(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

// clampPosition(pos, fallback) — clamp an {x, z} position into the city
// bounds; returns the fallback when the position is missing/invalid.
function clampPosition(pos, fallback) {
  if (!pos || typeof pos !== 'object') return fallback;
  const x = Number.isFinite(pos.x) ? pos.x : null;
  const z = Number.isFinite(pos.z) ? pos.z : null;
  if (x == null || z == null) return fallback;
  return {
    x: Math.max(POSITION_MIN, Math.min(POSITION_MAX, x)),
    z: Math.max(POSITION_MIN, Math.min(POSITION_MAX, z)),
  };
}
