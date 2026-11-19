// config.js — shared tuning constants, seed, city size and landmark coordinates for VELA BAY 3D.
export const GAME_SEED = 20261118;
export const CITY_SIZE = 500; // city spans 0..500 m on both axes
export const ROAD_SPACING = 50; // grid roads every 50 m (8x8 blocks of roads at 0..500)
export const DAY_LENGTH_SECONDS = 600; // one full 24 game-hours per 10 real minutes

// Corrected landmark / mission coordinates (study notes §4). Do not change.
export const LANDMARKS = {
  garage: { x: 150, z: 125 }, // Marco's garage
  spire: { x: 225, z: 225 }, // Vela Spire, solid 18x18 AABB, h=90
  office: { x: 200, z: 175 }, // Inez's office
  m1Drop: { x: 200, z: 250 }, // M1 drop point
  wheel: { x: 200, z: 425 }, // Boardwalk Wheel; M1 pickup is exactly here, radius 12 m
  m3Drop: { x: 425, z: 200 }, // M3 drop point
};

export const MISSION_POINTS = {
  m1Pickup: { x: 200, z: 425, radius: 12 },
  m1Drop: { x: 200, z: 250, radius: 14 },
  m2Garage: { x: 150, z: 125, radius: 14 },
  m3Drop: { x: 425, z: 200, radius: 14 },
  office: { x: 200, z: 175, radius: 10 },
};

export const START_CASH = 1200;
export const START_REP = 1;
export const DEBT_TOTAL = 15000;

// Shared spawn / reset points (single source of truth — the sim, the save
// defaults and the busted respawn must all agree on these coordinates).
export const PLAYER_START = { x: 200, z: 140 }; // live NEW GAME spawn, The Strip
export const RESPAWN_POINT = { x: 200, z: 140 }; // busted / wasted respawn
export const TAXI_PARKED = { x: 202, z: 142 }; // the player's own taxi, parked beside the start

// Garage interaction ranges (m): open the garage menu / sell a stolen car.
export const GARAGE_OPEN_RANGE = 25;
export const GARAGE_SELL_RANGE = 25;

// Police: at most this many units live at once, however hot the player is.
export const POLICE_MAX_UNITS = 3;

// Helicopter (sim side lives in sim/police.js, view in view/heli.js): the
// heli appears at this many stars and orbits the player at this radius.
export const HELI_MIN_STARS = 3;
export const HELI_ORBIT_RADIUS = 30;
