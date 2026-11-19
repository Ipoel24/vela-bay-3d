// sim-l2.test.mjs — Node tests for L2 Body Armour: the $500 garage purchase
// that makes player.armour real, and the FREE re-equip of armour already
// owned (economy.js + player.js damagePlayer). Run: node tests/sim-l2.test.mjs
import {
  makeEconomy, buyUpgrade, spendMoney, addMoney, canAfford,
  BODY_ARMOUR_PRICE, BODY_ARMOUR_VALUE, GARAGE,
} from '../game/src/sim/economy.js';
import { makePlayer, damagePlayer } from '../game/src/sim/player.js';
import { freshSave, applySave } from '../game/src/sim/save.js';
import { MISSIONS } from '../game/src/sim/missions.js';

let passed = 0;
let failed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`ok - ${name}`); }
  else { failed++; console.log(`FAIL - ${name}${extra ? ' — ' + extra : ''}`); }
}

// 1. Fresh economy: no body armour, $1,200 cash.
{
  const eco = makeEconomy();
  check('fresh economy has no body armour', eco.bodyArmour === 0);
  check('fresh economy starts at $1,200', eco.money === 1200);
}
// 2. Catalogue prices are the spec values.
{
  check('Body Armour costs $500', BODY_ARMOUR_PRICE === 500 && GARAGE.upgrades.bodyArmour.price === 500);
  check('Body Armour is worth +50 armour', BODY_ARMOUR_VALUE === 50);
}
// 3. First buy charges $500 and sets armour 50.
{
  const eco = makeEconomy();
  const ok = buyUpgrade(eco, 'bodyArmour');
  check('first Body Armour buy succeeds', ok === true);
  check('first buy charges $500 ($1,200 -> $700)', eco.money === 700, `money=$${eco.money}`);
  check('first buy sets bodyArmour 50', eco.bodyArmour === 50);
}
// 4. Re-equip is FREE: buying again charges nothing.
{
  const eco = makeEconomy();
  buyUpgrade(eco, 'bodyArmour');
  const before = eco.money;
  const ok = buyUpgrade(eco, 'bodyArmour');
  check('re-equip succeeds', ok === true);
  check('re-equip is free (money unchanged)', eco.money === before, `money=$${eco.money}`);
  check('re-equip keeps armour 50', eco.bodyArmour === 50);
}
// 5. Re-equip stays free on repeat.
{
  const eco = makeEconomy();
  buyUpgrade(eco, 'bodyArmour');
  buyUpgrade(eco, 'bodyArmour');
  buyUpgrade(eco, 'bodyArmour');
  check('three re-equips still cost nothing extra', eco.money === 700, `money=$${eco.money}`);
}
// 6. Cannot buy without cash.
{
  const eco = makeEconomy();
  eco.money = 400;
  const ok = buyUpgrade(eco, 'bodyArmour');
  check('cannot buy with $400', ok === false);
  check('failed buy charges nothing', eco.money === 400);
  check('failed buy grants no armour', eco.bodyArmour === 0);
}
// 7. Exactly $499 is not enough; exactly $500 is.
{
  const poor = makeEconomy();
  poor.money = 499;
  check('cannot buy with $499', buyUpgrade(poor, 'bodyArmour') === false);
  const exact = makeEconomy();
  exact.money = 500;
  check('can buy with exactly $500', buyUpgrade(exact, 'bodyArmour') === true && exact.money === 0);
}
// 8. Armour absorbs damage first (damagePlayer path).
{
  const p = makePlayer();
  p.armour = BODY_ARMOUR_VALUE;
  const r = damagePlayer(p, 25);
  check('armour absorbs a 25 hit whole', r.absorbed === 25 && r.healthDamage === 0);
  check('health untouched at 100 after absorbed hit', p.health === 100);
  check('armour drops to 25 after absorbing 25', p.armour === 25);
}
// 9. A hit bigger than the armour spills into health.
{
  const p = makePlayer();
  p.armour = BODY_ARMOUR_VALUE;
  const r = damagePlayer(p, 80);
  check('armour absorbs 50 of an 80 hit', r.absorbed === 50 && r.healthDamage === 30);
  check('health 70 after an 80 hit through 50 armour', p.health === 70);
  check('armour spent to 0', p.armour === 0);
}
// 10. Armour 50 + 50 damage = no health lost.
{
  const p = makePlayer();
  p.armour = BODY_ARMOUR_VALUE;
  damagePlayer(p, 50);
  check('50 damage through 50 armour leaves health 100', p.health === 100 && p.armour === 0);
}
// 11. Armour 50 + 100 damage = alive at 50 HP, not busted.
{
  const p = makePlayer();
  p.armour = BODY_ARMOUR_VALUE;
  damagePlayer(p, 100);
  check('100 damage through 50 armour leaves 50 HP', p.health === 50);
  check('not busted while HP remains', p.busted === false);
}
// 12. Without armour, 100 damage busts the player.
{
  const p = makePlayer();
  damagePlayer(p, 100);
  check('100 damage with no armour busts the player', p.health === 0 && p.busted === true);
}
// 13. Zero / negative damage is a no-op.
{
  const p = makePlayer();
  p.armour = 50;
  const r = damagePlayer(p, 0);
  check('zero damage changes nothing', r.absorbed === 0 && p.health === 100 && p.armour === 50);
  damagePlayer(p, -10);
  check('negative damage changes nothing', p.health === 100 && p.armour === 50);
}
// 14. Unknown upgrade kinds fail without charging.
{
  const eco = makeEconomy();
  check('unknown upgrade kind fails', buyUpgrade(eco, 'nitro') === false);
  check('unknown kind charges nothing', eco.money === 1200);
}
// 15. Other upgrades are untouched by the Body Armour change.
{
  const eco = makeEconomy();
  check('engine upgrade still charges $900', buyUpgrade(eco, 'engine') === true && eco.money === 300);
  check('engine level is 1 after one buy', eco.upgrades.engine === 1);
  const eco2 = makeEconomy();
  eco2.upgrades.armour = 3;
  check('maxed car armour rebuy is free', buyUpgrade(eco2, 'armour') === true && eco2.money === 1200);
}
// 16. Body Armour never stacks past 50 on rebuy.
{
  const eco = makeEconomy();
  buyUpgrade(eco, 'bodyArmour');
  buyUpgrade(eco, 'bodyArmour');
  check('armour never exceeds 50', eco.bodyArmour === 50);
}
// 17. canAfford / spendMoney agree with the buy path.
{
  const eco = makeEconomy();
  check('can afford $500 at $1,200', canAfford(eco, 500) === true);
  check('cannot afford $500 at $400', canAfford({ ...eco, money: 400 }, 500) === false);
  check('spendMoney deducts exactly $500', spendMoney(eco, 500) === true && eco.money === 700);
}
// 18. A bought vest survives a save round-trip (clamped 0..50).
{
  const saved = applySave({ ...freshSave(), bodyArmour: 50, money: 700 }, MISSIONS);
  check('save keeps bodyArmour 50', saved && saved.bodyArmour === 50 && saved.money === 700);
  const hacked = applySave({ ...freshSave(), bodyArmour: 99 }, MISSIONS);
  check('hacked bodyArmour 99 clamps to 50', hacked && hacked.bodyArmour === 50);
}
// 19. Fresh save starts with no body armour.
{
  check('fresh save has bodyArmour 0', freshSave().bodyArmour === 0);
}
// 20. addMoney still works alongside the purchase.
{
  const eco = makeEconomy();
  buyUpgrade(eco, 'bodyArmour');
  addMoney(eco, 500);
  check('cash tops back up to $1,200 after a $500 earning', eco.money === 1200);
}

console.log(failed === 0 ? `\n${passed} L2 tests passed, 0 failed` : `\n${failed} L2 TEST(S) FAILED (${passed} passed)`);
process.exit(failed === 0 ? 0 : 1);
