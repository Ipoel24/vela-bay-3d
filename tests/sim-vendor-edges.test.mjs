// sim-vendor-edges.test.mjs — edge-case tests added by the vendor-swap
// session for behaviour the earlier suites never pinned down. Two groups:
// (1) economy inputs a hand-edited or corrupt save can actually produce —
// non-finite amounts and out-of-range upgrade levels, which must clamp or
// refuse instead of moving money or warping prices; (2) combat corners —
// a degenerate aim, the 150 m bullet range cap, a wall-hit tracer, a
// wrecked police car disabling its unit, and wrecked cars being skipped by
// gunfire. Run: node tests/sim-vendor-edges.test.mjs
import { makeRng } from '../game/src/sim/rng.js';
import { buildCity } from '../game/src/sim/city.js';
import { GAME_SEED } from '../game/src/config.js';
import {
  makeEconomy, addMoney, spendMoney, canAfford, topSpeedFactor,
  armourDamageFactor, carHealthBonus, applyPayout, buyUpgrade, buyCar,
  sellPriceFor,
} from '../game/src/sim/economy.js';
import { makePlayer } from '../game/src/sim/player.js';
import { makeWanted } from '../game/src/sim/police.js';
import { makeCar } from '../game/src/sim/vehicles.js';
import { makePeds } from '../game/src/sim/pedestrians.js';
import { shoot, tracerEndpoints, WEAPON } from '../game/src/sim/combat.js';

let passed = 0;
let failed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`ok - ${name}`); }
  else { failed++; console.log(`FAIL - ${name}${extra ? ' — ' + extra : ''}`); }
}
const approx = (a, b, tol) => Math.abs(a - b) <= tol;

// A minimal game shape for shoot(): real city, no peds/cars unless a case
// places them, wanted present so crime accounting runs for real.
function makeGame() {
  return {
    city: buildCity(GAME_SEED),
    rng: makeRng(GAME_SEED),
    player: makePlayer(),
    peds: [],
    cars: [],
    police: [],
    wanted: makeWanted(),
    time: 0,
  };
}

// --- 1. Economy: non-finite amounts must never move money. ---
{
  const eco = makeEconomy(); // $1,200
  check('addMoney(NaN) leaves the balance', addMoney(eco, NaN) === 1200 && eco.money === 1200);
  check('addMoney(Infinity) leaves the balance', addMoney(eco, Infinity) === 1200 && eco.money === 1200);
  check('addMoney(0) leaves the balance', addMoney(eco, 0) === 1200 && eco.money === 1200);
  check('addMoney(-50) leaves the balance', addMoney(eco, -50) === 1200 && eco.money === 1200);
  check('spendMoney(NaN) refuses and leaves the balance', spendMoney(eco, NaN) === false && eco.money === 1200);
  check('spendMoney(Infinity) refuses and leaves the balance', spendMoney(eco, Infinity) === false && eco.money === 1200);
  check('canAfford(NaN) is false', canAfford(eco, NaN) === false);
  check('canAfford(Infinity) is false', canAfford(eco, Infinity) === false);
  check('canAfford(0) is false', canAfford(eco, 0) === false);
  check('canAfford(exact balance) is true', canAfford(eco, 1200) === true);
  check('spendMoney(exact balance) succeeds and empties the wallet', spendMoney(eco, 1200) === true && eco.money === 0);
  check('addMoney(0.5) credits a fractional amount', addMoney(eco, 0.5) === 0.5 && eco.money === 0.5);
}

// --- 2. Economy: corrupt upgrade levels clamp instead of warping prices. ---
// (A hand-edited save can set upgrades.engine to 99 or NaN; clampLevel in
// economy.js must hold the line. Levels 0-3 are covered elsewhere.)
{
  const eco = makeEconomy();
  eco.upgrades.engine = 99;
  check('engine level 99 clamps to the level-3 factor 1.54', approx(topSpeedFactor(eco), 1.54, 1e-9), `got ${topSpeedFactor(eco)}`);
  eco.upgrades.engine = NaN;
  check('engine level NaN falls back to factor 1', topSpeedFactor(eco) === 1);
  eco.upgrades.engine = -2;
  check('engine level -2 clamps to factor 1', topSpeedFactor(eco) === 1);
  eco.upgrades.engine = 1.5;
  check('engine level 1.5 floors to the level-1 factor 1.18', approx(topSpeedFactor(eco), 1.18, 1e-9), `got ${topSpeedFactor(eco)}`);
  eco.upgrades.armour = 99;
  check('armour level 99 clamps to the level-3 factor 0.4', approx(armourDamageFactor(eco), 0.4, 1e-9), `got ${armourDamageFactor(eco)}`);
  check('armour level 99 clamps to +150 car health', carHealthBonus(eco) === 150);
  eco.upgrades.armour = NaN;
  check('armour level NaN falls back to factor 1', armourDamageFactor(eco) === 1);
  check('armour level NaN gives +0 car health', carHealthBonus(eco) === 0);
  eco.upgrades.armour = 1.5;
  check('armour level 1.5 floors to factor 1/1.5', approx(armourDamageFactor(eco), 1 / 1.5, 1e-9), `got ${armourDamageFactor(eco)}`);
}

// --- 3. Economy: unknown models/kinds refuse without charging. ---
{
  const eco = makeEconomy();
  check('sellPriceFor(unknown model) is $0', sellPriceFor('hovercraft') === 0);
  check('sellPriceFor(taxi) is $0', sellPriceFor('taxi') === 0);
  check('sellPriceFor(cometa) is $900', sellPriceFor('cometa') === 900);
  check('buyUpgrade(unknown kind) fails and charges nothing', buyUpgrade(eco, 'hovercraft') === false && eco.money === 1200);
  check('buyCar(unknown model) fails and charges nothing', buyCar(eco, 'hovercraft') === false && eco.money === 1200 && eco.ownedCars.join() === 'taxi');
  check('buyCar(taxi, already owned) succeeds free', buyCar(eco, 'taxi') === true && eco.money === 1200);
}

// --- 4. Economy: applyPayout judges each argument on its own. ---
// (One bad argument must not veto the good one, and must not move anything
// backwards: a corrupt mission def pays cash but no REP, or REP but no cash.)
{
  const eco = makeEconomy();
  check('applyPayout(500, NaN) pays cash but no REP', applyPayout(eco, 500, NaN) === 1700 && eco.money === 1700 && eco.rep === 1);
  check('applyPayout(NaN, 10) pays REP but no cash', applyPayout(eco, NaN, 10) === 1700 && eco.money === 1700 && eco.rep === 11);
  check('applyPayout(-500, -10) moves nothing', applyPayout(eco, -500, -10) === 1700 && eco.money === 1700 && eco.rep === 11);
  check('applyPayout(0, 0) moves nothing', applyPayout(eco, 0, 0) === 1700 && eco.money === 1700 && eco.rep === 11);
}

// --- 5. Combat: degenerate aim (aim point == shooter) is a clean no-op. ---
{
  const game = makeGame();
  const r = shoot(game, 200, 140, 200, 140);
  check('shooting at your own feet hits nothing', r.hit === null);
  check('degenerate shot travels 0 m', r.distance === 0);
  check('degenerate shot stays at the shooter', r.x === 200 && r.z === 140);
  check('degenerate shot adds no wanted', game.wanted.stars === 0);
}

// --- 6. Combat: bullets stop at the 150 m MAX_RANGE, even on a clear road. ---
{
  const game = makeGame();
  // Down the z=100 road, 200 m of aim: the earlier suites assert this shot
  // misses, but never pinned WHERE it stops.
  const r = shoot(game, 100, 100, 300, 100);
  check('a 200 m aim down a clear road still misses', r.hit === null);
  check('the bullet stops at exactly 150 m', r.distance === 150, `got ${r.distance}`);
  check('the impact point is 150 m along the aim', approx(r.x, 250, 1e-9) && approx(r.z, 100, 1e-9), `got (${r.x}, ${r.z})`);
}

// --- 7. Combat: a wall-hit tracer rides low, like a clean miss. ---
// (Ped hits ride at chest height 1.0 and clean misses at 0.4; both are
// covered elsewhere. A wall hit is the third case and must also ride low.)
{
  const wall = tracerEndpoints(225, 190, 0, { hit: 'wall', x: 225, z: 210 });
  check('wall-hit tracer ends at the wall face', wall.to.x === 225 && wall.to.z === 210);
  check('wall-hit tracer rides low at 0.4 m', wall.to.y === 0.4);
  check('wall-hit tracer still starts at the muzzle', wall.from.y === 1.4 && approx(wall.from.z, 190.7, 1e-9));
  const ped = tracerEndpoints(200, 140, 0, { hit: 'ped', x: 210, z: 140 });
  check('ped-hit tracer still rides at chest height 1.0', ped.to.y === 1.0);
}

// --- 8. Combat: shooting a police car dead disables its unit. ---
{
  const game = makeGame();
  const patrol = makeCar('police', 100, 150, 0, 'police');
  const unit = { car: patrol, disabled: false };
  game.cars = [patrol];
  game.police = [unit];
  const r1 = shoot(game, 100, 100, 100, 300);
  check('first shot hits the patrol car', r1.hit === 'car' && r1.killed === false, `got ${r1.hit}/${r1.killed}`);
  check(`one pistol shot takes ${WEAPON.damage} HP`, patrol.health === 100 - WEAPON.damage, `got ${patrol.health}`);
  check('a damaged patrol unit is not disabled yet', unit.disabled === false);
  shoot(game, 100, 100, 100, 300);
  const r3 = shoot(game, 100, 100, 100, 300);
  check('third shot wrecks the patrol car', r3.hit === 'car' && r3.killed === true && patrol.health === 0);
  check('a wrecked patrol car disables its unit', unit.disabled === true);
}

// --- 9. Combat: a wrecked car is skipped — gunfire passes through it. ---
{
  const game = makeGame();
  const wreck = makeCar('brisa', 100, 150, 0, 'traffic');
  wreck.health = 0;
  wreck.condition = 0;
  game.cars = [wreck];
  const r = shoot(game, 100, 100, 100, 300);
  check('a wrecked car is not a target', r.hit === null);
  check('the shot still travels the full 150 m past the wreck', r.distance === 150, `got ${r.distance}`);
  check('the wreck stays at 0 HP', wreck.health === 0);
}

// --- 10. Combat: a ped 3 shots down is down for good; a 4th shot misses it. ---
// (The earlier suite proves 3 shots down a ped. This pins what happens
// next: the downed ped is no longer a target, so follow-up fire goes long.)
{
  const game = makeGame();
  const peds = makePeds(game.city, makeRng(5), 1);
  peds[0].x = 100; peds[0].z = 110;
  game.peds = peds;
  shoot(game, 100, 100, 100, 110);
  shoot(game, 100, 100, 100, 110);
  const r3 = shoot(game, 100, 100, 100, 110);
  check('third shot downs the ped', r3.hit === 'ped' && r3.killed === true && peds[0].down === true);
  const r4 = shoot(game, 100, 100, 100, 300);
  check('a downed ped is no longer a target', r4.hit === null, `got ${r4.hit}`);
  check('the 4th shot travels the full 150 m', r4.distance === 150, `got ${r4.distance}`);
}

console.log(failed === 0 ? `\n${passed} vendor-edge tests passed, 0 failed` : `\n${failed} VENDOR-EDGE TEST(S) FAILED (${passed} passed)`);
process.exit(failed === 0 ? 0 : 1);
