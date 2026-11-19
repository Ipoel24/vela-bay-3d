// economy.js — money, REP, garage catalogue, upgrades and car ownership for VELA BAY 3D. Pure logic, no three.js, runs in Node.

// --- Tuning (real numbers the game uses, from study-notes §5.7) ---
export const ENGINE_PRICE_PER_LEVEL = 900; // $ per engine level
export const ENGINE_TOP_SPEED_PER_LEVEL = 0.18; // +18% top speed per level
export const ENGINE_MAX_LEVEL = 3;
export const ARMOUR_PRICE_PER_LEVEL = 700; // $ per armour level
export const ARMOUR_CAR_HEALTH_PER_LEVEL = 50; // +50 car health per level
export const ARMOUR_MAX_LEVEL = 3;
export const BODY_ARMOUR_PRICE = 500; // $ for Body Armour (L2 fix: makes player.armour real)
export const BODY_ARMOUR_VALUE = 50; // +50 player armour, single purchase
export const STARTING_MONEY = 1200;
export const STARTING_REP = 1;
export const STARTING_DEBT = 15000; // what Dario owes Madame Inez

// Garage catalogue: every price/effect below is read by the garage screen and
// applied by the sim (not display-only).
export const GARAGE = {
  upgrades: {
    // Raises top speed of the owned car type by 18% per level, max 3.
    engine: { price: ENGINE_PRICE_PER_LEVEL, maxLevel: ENGINE_MAX_LEVEL, effect: 'Top speed +18% per level' },
    // Adds 50 car health per level; crash damage scales 1 / (1 + 0.5 * armour), max 3.
    armour: { price: ARMOUR_PRICE_PER_LEVEL, maxLevel: ARMOUR_MAX_LEVEL, effect: '+50 car health per level, damage x 1/(1+0.5*armour)' },
    // L2 fix: +50 PLAYER armour (damagePlayer absorbs through armour first). Single purchase.
    bodyArmour: { price: BODY_ARMOUR_PRICE, maxLevel: 1, effect: '+50 player armour' },
  },
  cars: {
    // The sports car: the fastest car the player can own (~52 m/s top speed).
    cometa: { model: 'Cometa GT', price: 3500, topSpeed: 52 },
    // The starting car, already owned; listed so the garage can show it.
    taxi: { model: 'Vela Taxi', price: 0, topSpeed: 38 },
  },
};

// Payout for selling a stolen car at the garage (F key, slow only, never the
// mission taxi while M1 is active — enforced by the caller/main loop).
export const SELL_PRICES = {
  cometa: 900,
  taxi: 0,
};

// Vigilante kill payout (§5.7).
export const VIGILANTE_PAYOUT = 200;

// makeEconomy() — fresh economy state: $1,200 cash, REP 1, $15,000 debt,
// taxi owned, no upgrades, no body armour.
export function makeEconomy() {
  return {
    money: STARTING_MONEY,
    rep: STARTING_REP,
    debt: STARTING_DEBT,
    ownedCars: ['taxi'],
    upgrades: { engine: 0, armour: 0 },
    bodyArmour: 0,
  };
}

// addMoney(eco, amount) — add cash (mission payouts, sales, vigilante kills).
// Amount must be a finite positive number; returns the new balance.
export function addMoney(eco, amount) {
  if (!Number.isFinite(amount) || amount <= 0) return eco.money;
  eco.money += amount;
  return eco.money;
}

// spendMoney(eco, amount) — deduct cash if affordable. Returns false (and
// deducts nothing) when the amount is invalid or exceeds the balance.
export function spendMoney(eco, amount) {
  if (!Number.isFinite(amount) || amount <= 0) return false;
  if (amount > eco.money) return false;
  eco.money -= amount;
  return true;
}

// canAfford(eco, amount) — true when the amount could be spent right now.
export function canAfford(eco, amount) {
  return Number.isFinite(amount) && amount > 0 && amount <= eco.money;
}

// topSpeedFactor(eco) — engine multiplier on a car's top speed:
// 1 + 0.18 * engine level (1.54 at level 3).
export function topSpeedFactor(eco) {
  return 1 + ENGINE_TOP_SPEED_PER_LEVEL * clampLevel(eco.upgrades.engine, ENGINE_MAX_LEVEL);
}

// armourDamageFactor(eco) — crash-damage multiplier from car armour:
// 1 / (1 + 0.5 * armour) (0.4 at level 3, i.e. -60% damage).
export function armourDamageFactor(eco) {
  return 1 / (1 + 0.5 * clampLevel(eco.upgrades.armour, ARMOUR_MAX_LEVEL));
}

// carHealthBonus(eco) — extra car health from armour upgrades: +50 per level.
export function carHealthBonus(eco) {
  return ARMOUR_CAR_HEALTH_PER_LEVEL * clampLevel(eco.upgrades.armour, ARMOUR_MAX_LEVEL);
}

// canBuyUpgrade(eco, kind) — true when buying `kind` is possible right
// now: already owned / at max level counts as buyable (it costs nothing),
// otherwise the player must be able to afford the catalogue price. The
// garage reads this to enable/disable BUY buttons instead of duplicating
// the price + ownership logic inline.
export function canBuyUpgrade(eco, kind) {
  if (kind === 'bodyArmour') {
    return eco.bodyArmour >= BODY_ARMOUR_VALUE || canAfford(eco, BODY_ARMOUR_PRICE);
  }
  const entry = GARAGE.upgrades[kind];
  if (!entry) return false;
  const level = clampLevel(eco.upgrades[kind], entry.maxLevel);
  if (level >= entry.maxLevel) return true; // maxed: re-buy is free
  return canAfford(eco, entry.price);
}

// applyPayout(eco, payout, rep) — credit a mission payout + REP in one
// step, ignoring non-finite or non-positive amounts (a corrupt mission def
// must never move the balance backwards). Returns the new cash balance.
// Mission completion is the only caller that moves money AND rep together.
export function applyPayout(eco, payout, rep) {
  if (Number.isFinite(payout) && payout > 0) eco.money += payout;
  if (Number.isFinite(rep) && rep > 0) eco.rep += rep;
  return eco.money;
}

// buyUpgrade(eco, kind) — buy one level of 'engine' | 'armour' | 'bodyArmour'.
// Charges the catalogue price; buying an upgrade already owned / at max level
// charges nothing and returns true. Returns false when cash is insufficient
// (or the kind is unknown) and charges nothing.
export function buyUpgrade(eco, kind) {
  if (kind === 'bodyArmour') {
    if (eco.bodyArmour >= BODY_ARMOUR_VALUE) return true; // already owned: free
    if (!spendMoney(eco, BODY_ARMOUR_PRICE)) return false;
    eco.bodyArmour = BODY_ARMOUR_VALUE;
    return true;
  }
  const entry = GARAGE.upgrades[kind];
  if (!entry || kind === 'bodyArmour') return false;
  const level = clampLevel(eco.upgrades[kind], entry.maxLevel);
  if (level >= entry.maxLevel) return true; // already maxed: free
  if (!spendMoney(eco, entry.price)) return false;
  eco.upgrades[kind] = level + 1;
  return true;
}

// buyCar(eco, model) — buy a garage car by catalogue key ('cometa', ...).
// Charges the catalogue price and adds the model to ownedCars; buying a car
// already owned charges nothing and returns true. Returns false for an
// unknown model or insufficient cash.
export function buyCar(eco, model) {
  const entry = GARAGE.cars[model];
  if (!entry) return false;
  if (eco.ownedCars.includes(model)) return true; // already owned: free
  if (!spendMoney(eco, entry.price)) return false;
  eco.ownedCars.push(model);
  return true;
}

// sellPriceFor(model) — garage payout for selling a stolen car of this model.
export function sellPriceFor(model) {
  return SELL_PRICES[model] ?? 0;
}

// clampLevel(level, max) — clamp an upgrade level into 0..max (safe fallback 0).
function clampLevel(level, max) {
  if (!Number.isFinite(level)) return 0;
  return Math.max(0, Math.min(max, Math.floor(level)));
}
