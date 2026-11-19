// sim-economy-save.test.mjs — plain Node tests (no framework) for economy.js + save.js.
// Run: node tests/sim-economy-save.test.mjs

import {
  makeEconomy, addMoney, spendMoney, buyUpgrade, buyCar, sellPriceFor,
  topSpeedFactor, armourDamageFactor, carHealthBonus, GARAGE,
  canBuyUpgrade, applyPayout,
} from '../game/src/sim/economy.js';
import {
  SAVE_KEY, SAVE_VERSION, saveGame, loadGame, applySave, wipeSave, freshSave,
} from '../game/src/sim/save.js';

// --- localStorage stub (Node has none): simple in-memory object ---
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(String(k), String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

// Fake missions array (5 missions, M1 has 3 steps) for the L3 clamp tests.
const MISSIONS = [
  { steps: [{}, {}, {}] },
  { steps: [{}, {}] },
  { steps: [{}, {}, {}, {}] },
  { steps: [{}, {}] },
  { steps: [{}, {}, {}] },
];

let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) {
    passed++;
    console.log(`PASS ${name}`);
  } else {
    failed++;
    console.log(`FAIL ${name}`);
  }
}
function approx(a, b) { return Math.abs(a - b) < 1e-9; }

// --- economy: fresh state ---
{
  const eco = makeEconomy();
  check('fresh economy: $1200, REP 1, $15000 debt, taxi owned, no upgrades', (
    eco.money === 1200 && eco.rep === 1 && eco.debt === 15000 &&
    eco.ownedCars.length === 1 && eco.ownedCars[0] === 'taxi' &&
    eco.upgrades.engine === 0 && eco.upgrades.armour === 0 && eco.bodyArmour === 0
  ));
}

// --- engine: +18% top speed per level, charged once per level, re-buy at max is free ---
{
  const eco = makeEconomy();
  addMoney(eco, 10000);
  const before = eco.money;
  check('buy engine level 1 succeeds', buyUpgrade(eco, 'engine') === true);
  check('engine level 1: top speed factor 1.18', approx(topSpeedFactor(eco), 1.18));
  check('engine level 1 charged $900 once', eco.money === before - 900);
  buyUpgrade(eco, 'engine');
  buyUpgrade(eco, 'engine');
  check('engine level 3: top speed factor 1.54', approx(topSpeedFactor(eco), 1.54));
  check('engine level 3: charged $2700 total', eco.money === before - 2700);
  const atMax = eco.money;
  check('engine re-buy at max succeeds', buyUpgrade(eco, 'engine') === true);
  check('engine re-buy at max charges nothing', eco.money === atMax);
  check('engine re-buy at max keeps factor 1.54', approx(topSpeedFactor(eco), 1.54));
  check('catalogue engine price is $900/level', GARAGE.upgrades.engine.price === 900);
}

// --- armour: damage scales 1/(1+0.5*armour), +50 car health per level ---
{
  const eco = makeEconomy();
  addMoney(eco, 10000);
  check('armour level 0: damage factor 1', approx(armourDamageFactor(eco), 1));
  buyUpgrade(eco, 'armour');
  check('armour level 1: damage factor 1/1.5', approx(armourDamageFactor(eco), 1 / 1.5));
  check('armour level 1: +50 car health', carHealthBonus(eco) === 50);
  buyUpgrade(eco, 'armour');
  check('armour level 2: damage factor 0.5', approx(armourDamageFactor(eco), 0.5));
  buyUpgrade(eco, 'armour');
  check('armour level 3: damage factor 0.4 (-60%)', approx(armourDamageFactor(eco), 0.4));
  check('armour level 3: +150 car health', carHealthBonus(eco) === 150);
  check('catalogue armour price is $700/level', GARAGE.upgrades.armour.price === 700);
}

// --- body armour (L2 fix): $500, sets player armour to 50, charged once ---
{
  const eco = makeEconomy();
  check('buy body armour succeeds', buyUpgrade(eco, 'bodyArmour') === true);
  check('body armour purchase sets player armour to 50', eco.bodyArmour === 50);
  check('body armour charged $500 once', eco.money === 1200 - 500);
  const after = eco.money;
  check('body armour re-buy succeeds', buyUpgrade(eco, 'bodyArmour') === true);
  check('body armour re-buy charges nothing', eco.money === after);
  check('body armour re-buy keeps armour at 50', eco.bodyArmour === 50);
  check('catalogue body armour price is $500', GARAGE.upgrades.bodyArmour.price === 500);
}

// --- buyCar: Cometa $3,500, re-buy free, unknown model rejected ---
{
  const eco = makeEconomy();
  check('buy Cometa without cash fails', buyCar(eco, 'cometa') === false);
  check('failed Cometa buy charges nothing', eco.money === 1200);
  addMoney(eco, 5000);
  check('buy Cometa succeeds', buyCar(eco, 'cometa') === true);
  check('Cometa charged $3500', eco.money === 1200 + 5000 - 3500);
  check('Cometa is owned', eco.ownedCars.includes('cometa'));
  const after = eco.money;
  check('Cometa re-buy succeeds', buyCar(eco, 'cometa') === true);
  check('Cometa re-buy charges nothing', eco.money === after);
  check('unknown car model rejected', buyCar(eco, 'notacar') === false);
  check('Cometa sell price is $900', sellPriceFor('cometa') === 900);
}

// --- spendMoney refuses when insufficient ---
{
  const eco = makeEconomy();
  check('spend more than balance returns false', spendMoney(eco, 99999) === false);
  check('refused spend leaves money unchanged', eco.money === 1200);
  check('spend of zero/negative returns false', spendMoney(eco, 0) === false && spendMoney(eco, -5) === false);
  check('spend within balance succeeds', spendMoney(eco, 200) === true && eco.money === 1000);
  check('addMoney adds cash', addMoney(eco, 500) === 1500);
}

// --- save/load round-trip: money + REP + upgrades + clock ---
{
  store.clear();
  const eco = makeEconomy();
  addMoney(eco, 10000);
  buyUpgrade(eco, 'engine');
  buyUpgrade(eco, 'armour');
  buyUpgrade(eco, 'bodyArmour');
  const state = {
    ...eco, rep: 7,
    clockMinutes: 1110, day: 3, // 18:30 day 3
    positions: { player: { x: 200, z: 425 }, car: { x: 201, z: 426 } },
    missionIndex: 1, missionStep: 1,
    bestScore: 4200, bestTimes: { 0: 95 },
  };
  check('saveGame writes immediately', saveGame(state, MISSIONS) === true);
  check('saveGame wrote to localStorage at once', store.get(SAVE_KEY) != null);
  const loaded = loadGame(MISSIONS);
  check('loadGame round-trips money', loaded && loaded.money === state.money);
  check('loadGame round-trips REP', loaded && loaded.rep === 7);
  check('loadGame round-trips upgrades', loaded && loaded.upgrades.engine === 1 && loaded.upgrades.armour === 1);
  check('loadGame round-trips body armour', loaded && loaded.bodyArmour === 50);
  check('loadGame round-trips clock minutes + day', loaded && loaded.clockMinutes === 1110 && loaded.day === 3);
  check('loadGame round-trips positions', loaded && loaded.positions.player.x === 200 && loaded.positions.player.z === 425);
  check('loadGame round-trips mission index + step', loaded && loaded.missionIndex === 1 && loaded.missionStep === 1);
  check('loadGame round-trips owned cars + best score/times', loaded && loaded.bestScore === 4200 && loaded.bestTimes[0] === 95);
  check('loadGame with no save returns null', (() => { store.clear(); return loadGame(MISSIONS) === null; })());
}

// --- corrupt / wrong-version saves return null ---
{
  store.clear();
  store.set(SAVE_KEY, 'this is not json{');
  check('corrupt save returns null', loadGame(MISSIONS) === null);
  store.set(SAVE_KEY, JSON.stringify({ ...freshSave(), version: 99 }));
  check('wrong-version save returns null', loadGame(MISSIONS) === null);
  store.set(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION, money: 'lots' }));
  check('non-numeric money returns null', loadGame(MISSIONS) === null);
}

// --- L3: missionStep 99 is clamped to the last step (no soft-lock) ---
{
  const save = { ...freshSave(), missionIndex: 0, missionStep: 99 };
  const clamped = applySave(save, MISSIONS);
  check('missionStep 99 clamped to last step (2) of a 3-step mission', clamped && clamped.missionStep === 2);
  const save2 = { ...freshSave(), missionIndex: 2, missionStep: 99 };
  check('missionStep 99 clamped to last step (3) of a 4-step mission', applySave(save2, MISSIONS)?.missionStep === 3);
  const save3 = { ...freshSave(), missionIndex: 99, missionStep: 0 };
  const clamped3 = applySave(save3, MISSIONS);
  check('missionIndex 99 clamped into range', clamped3 && clamped3.missionIndex === 4);
  // Same through the real loadGame path (raw JSON in storage).
  store.clear();
  store.set(SAVE_KEY, JSON.stringify({ ...freshSave(), missionIndex: 0, missionStep: 99 }));
  check('loadGame clamps missionStep 99 via storage', loadGame(MISSIONS)?.missionStep === 2);
}

// --- validation clamps with safe fallbacks ---
{
  const bad = {
    ...freshSave(),
    money: -500, upgrades: { engine: 9, armour: -2 },
    clockMinutes: 9999, day: 0,
    positions: { player: { x: 99999, z: -99999 }, car: null },
  };
  const out = applySave(bad, MISSIONS);
  check('negative money clamps to 0', out && out.money === 0);
  check('upgrades clamp to 0..3', out && out.upgrades.engine === 3 && out.upgrades.armour === 0);
  check('clock minutes clamp to 0..1439', out && out.clockMinutes === 1439);
  check('day clamps to >= 1', out && out.day === 1);
  check('positions clamp into city bounds', out && out.positions.player.x === 600 && out.positions.player.z === -100);
}

// --- wipeSave writes fresh defaults at once ---
{
  store.clear();
  store.set(SAVE_KEY, JSON.stringify({ ...freshSave(), money: 99999, rep: 42, missionIndex: 4 }));
  const fresh = wipeSave();
  check('wipeSave returns fresh defaults', (
    fresh.money === 1200 && fresh.rep === 1 && fresh.missionIndex === 0 &&
    fresh.missionStep === 0 && fresh.ownedCars.length === 1 && fresh.ownedCars[0] === 'taxi' &&
    fresh.upgrades.engine === 0 && fresh.upgrades.armour === 0 && fresh.bodyArmour === 0 &&
    fresh.bestScore === 0 && fresh.debt === 15000
  ));
  const stored = JSON.parse(store.get(SAVE_KEY));
  check('wipeSave persisted fresh defaults at once', stored && stored.money === 1200 && stored.rep === 1);
  const reloaded = loadGame(MISSIONS);
  check('reload after wipeSave shows fresh values', reloaded && reloaded.money === 1200 && reloaded.missionIndex === 0);
}

// --- Finisher additions: canBuyUpgrade + applyPayout ---
{
  const eco = makeEconomy();
  check('canBuyUpgrade: engine affordable at start, not when broke', canBuyUpgrade(eco, 'engine') === true);
  eco.money = 100;
  check('canBuyUpgrade: engine unaffordable with $100', canBuyUpgrade(eco, 'engine') === false);
  eco.money = 1200;
  eco.upgrades.engine = 3;
  check('canBuyUpgrade: maxed engine still counts as buyable (free re-buy)', canBuyUpgrade(eco, 'engine') === true);
  check('canBuyUpgrade: unknown kind is never buyable', canBuyUpgrade(eco, 'nitro') === false);
  check('canBuyUpgrade: body armour unaffordable with $100', canBuyUpgrade({ ...eco, money: 100, bodyArmour: 0 }, 'bodyArmour') === false);
  check('canBuyUpgrade: owned body armour is buyable (free re-equip)', canBuyUpgrade({ ...eco, bodyArmour: 50 }, 'bodyArmour') === true);
}
{
  const eco = makeEconomy();
  applyPayout(eco, 500, 10);
  check('applyPayout: M1 payout credits $500 + 10 REP together', eco.money === 1700 && eco.rep === 11);
  applyPayout(eco, 1200, 15);
  check('applyPayout: M2 payout stacks on top', eco.money === 2900 && eco.rep === 26);
  const before = eco.money;
  applyPayout(eco, NaN, NaN);
  applyPayout(eco, -500, -10);
  check('applyPayout: NaN / negative payouts never move the balance', eco.money === before && eco.rep === 26);
  check('applyPayout: returns the new cash balance', applyPayout(eco, 100, 0) === 3000);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
