// sim-save-clamps.test.mjs — Node tests for the defensive save clamps in
// sim/save.js: every numeric field gets a sane clamp, unknown owned cars
// are dropped, and junk best-times entries never reach the mission board.
// Run: node tests/sim-save-clamps.test.mjs
import { freshSave, applySave } from '../game/src/sim/save.js';
import { MISSIONS } from '../game/src/sim/missions.js';

let passed = 0;
let failed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`ok - ${name}`); }
  else { failed++; console.log(`FAIL - ${name}${extra ? ' — ' + extra : ''}`); }
}
function clamped(patch) {
  return applySave({ ...freshSave(), ...patch }, MISSIONS);
}

// 1. Money clamps: negative to 0, huge to the cap.
{
  check('negative money clamps to 0', clamped({ money: -500 }).money === 0);
  check('huge money caps at 999,999,999', clamped({ money: 5000000000 }).money === 999999999);
  check('normal money passes through', clamped({ money: 1700 }).money === 1700);
}
// 2. REP clamps to 1..999.
{
  check('REP 0 clamps to 1', clamped({ rep: 0 }).rep === 1);
  check('REP 1000 clamps to 999', clamped({ rep: 1000 }).rep === 999);
  check('REP 42 passes through', clamped({ rep: 42 }).rep === 42);
}
// 3. Debt: negative to 0, missing to the $15,000 default.
{
  check('negative debt clamps to 0', clamped({ debt: -100 }).debt === 0);
  check('missing debt falls back to 15000', clamped({ debt: undefined }).debt === 15000);
}
// 4. Owned cars: unknown models are dropped, never trusted.
{
  const out = clamped({ ownedCars: ['taxi', 'hovercraft', 'cometa'] });
  check('unknown owned car dropped', out.ownedCars.length === 2 && out.ownedCars.includes('taxi') && out.ownedCars.includes('cometa'));
  check('all-unknown owned cars fall back to taxi', clamped({ ownedCars: ['hovercraft'] }).ownedCars.join() === 'taxi');
  check('known cars pass through', clamped({ ownedCars: ['taxi', 'brisa'] }).ownedCars.length === 2);
}
// 5. Upgrades clamp to 0..3.
{
  check('engine 5 clamps to 3', clamped({ upgrades: { engine: 5, armour: 0 } }).upgrades.engine === 3);
  check('armour -1 clamps to 0', clamped({ upgrades: { engine: 0, armour: -1 } }).upgrades.armour === 0);
}
// 6. Clock clamps to 0..1439, day to >= 1.
{
  check('clock 2000 clamps to 1439', clamped({ clockMinutes: 2000 }).clockMinutes === 1439);
  check('clock -5 clamps to 0', clamped({ clockMinutes: -5 }).clockMinutes === 0);
  check('day 0 clamps to 1', clamped({ day: 0 }).day === 1);
  check('clock 480 (08:00) passes through', clamped({ clockMinutes: 480 }).clockMinutes === 480);
}
// 7. Fresh-save spawn is the live NEW GAME spawn (200,140).
{
  const fresh = freshSave();
  check('fresh save spawns at (200,140)', fresh.positions.player.x === 200 && fresh.positions.player.z === 140);
  const missing = clamped({ positions: undefined });
  check('missing positions fall back to (200,140)', missing.positions.player.x === 200 && missing.positions.player.z === 140);
}
// 8. Positions clamp into city bounds.
{
  const out = clamped({ positions: { player: { x: 99999, z: -99999 }, car: null } });
  check('player position clamps into bounds', out.positions.player.x === 600 && out.positions.player.z === -100);
  const car = clamped({ positions: { player: { x: 200, z: 140 }, car: { x: -500, z: 700 } } });
  check('car position clamps into bounds', car.positions.car.x === -100 && car.positions.car.z === 600);
}
// 9. Best times: junk entries dropped, good ones kept and floored.
{
  const out = clamped({ bestTimes: { 0: 30, 1: 'fast', 2: -5, 3: 45.7 } });
  check('valid best time kept', out.bestTimes['0'] === 30);
  check('string best time dropped', !('1' in out.bestTimes));
  check('negative best time dropped', !('2' in out.bestTimes));
  check('fractional best time floored', out.bestTimes['3'] === 45);
  check('array bestTimes becomes empty', Object.keys(clamped({ bestTimes: [1, 2] }).bestTimes).length === 0);
}
// 10. Best score clamps to >= 0 with a cap.
{
  check('negative best score clamps to 0', clamped({ bestScore: -10 }).bestScore === 0);
  check('huge best score caps', clamped({ bestScore: 5000000000 }).bestScore === 999999999);
}
// 11. Mission step clamps to the last step (L3: no soft-lock).
{
  check('missionStep 99 clamps to last step of M1', clamped({ missionIndex: 0, missionStep: 99 }).missionStep === 1);
  check('missionIndex 99 clamps to M5', clamped({ missionIndex: 99, missionStep: 0 }).missionIndex === 4);
}
// 12. Wrong version / non-object saves are rejected outright.
{
  check('wrong version returns null', applySave({ ...freshSave(), version: 99 }, MISSIONS) === null);
  check('null save returns null', applySave(null, MISSIONS) === null);
  check('non-numeric money returns null', applySave({ ...freshSave(), money: 'rich' }, MISSIONS) === null);
}

console.log(failed === 0 ? `\n${passed} save-clamp tests passed, 0 failed` : `\n${failed} SAVE-CLAMP TEST(S) FAILED (${passed} passed)`);
process.exit(failed === 0 ? 0 : 1);
