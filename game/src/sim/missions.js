// missions.js — the 5-mission campaign to clear Dario's $15,000 debt (pure logic, no three.js).
import { makeCar } from './vehicles.js';
import { applyPayout } from './economy.js';

// MISSIONS — the 5-mission campaign (study notes §5.6). Each mission:
// { id, name, briefing (2-3 lines), steps, payout, rep, wantedCap }.
// A step advances ONLY when its real condition is met (reaching a marker,
// being in the right vehicle, delivering to the right place). Step kinds:
// 'pickup' (reach a marker, optionally in a given vehicle), 'drop' (same),
// 'steal' (driving a stolen car of a model), 'deliver' (driving a stolen
// car of a model into a marker), 'loseWanted' (wanted back to 0 stars).
export const MISSIONS = [
  {
    id: 'm1', name: 'First Fare',
    briefing: [
      'A fare is waiting at the Boardwalk Wheel. Pick them up in a taxi.',
      'Drop them off on The Strip and the meter pays out.',
      'Keep it clean — no more than 1 star of heat on this job.',
    ],
    steps: [
      { kind: 'pickup', x: 200, z: 425, radius: 12, vehicle: 'taxi', label: 'Pick up the fare at the Boardwalk Wheel' },
      { kind: 'drop', x: 200, z: 250, radius: 14, vehicle: 'taxi', label: 'Drop the fare off on The Strip' },
    ],
    payout: 500, rep: 10, wantedCap: 1,
  },
  {
    id: 'm2', name: 'Hot Wheels',
    briefing: [
      'Marco needs a Cometa GT, and he does not ask where it came from.',
      'Steal one off the street and bring it to the garage.',
      'The car is the payment — do not sell it out from under the job.',
    ],
    steps: [
      { kind: 'steal', model: 'cometa', label: 'Steal a Cometa GT' },
      { kind: 'deliver', model: 'cometa', x: 150, z: 125, radius: 14, label: "Deliver the Cometa to Marco's garage" },
    ],
    payout: 1200, rep: 15, wantedCap: 2,
  },
  {
    id: 'm3', name: 'The Drop',
    briefing: [
      'Inez has a package that needs to reach Dockside, no questions asked.',
      'Pick it up at her office, then run it across town.',
      'The VBPD will be watching the roads — expect a roadblock.',
    ],
    steps: [
      { kind: 'pickup', x: 200, z: 175, radius: 10, label: 'Pick up the package at Inez\'s office' },
      { kind: 'drop', x: 425, z: 200, radius: 14, label: 'Deliver the package to Dockside' },
    ],
    payout: 2000, rep: 20, wantedCap: null,
  },
  {
    id: 'm4', name: 'Roadblock Run',
    briefing: [
      'Three stars, a helicopter overhead, and the whole city looking.',
      'Break line of sight, stay clear, and let the heat die down.',
      'Do not get caught — losing the tail is the whole job.',
    ],
    steps: [
      { kind: 'loseWanted', label: 'Lose the 3-star wanted level' },
    ],
    payout: 2500, rep: 25, wantedCap: null,
  },
  {
    id: 'm5', name: 'The Last Debt',
    briefing: [
      'One last job across every district, then the debt is done.',
      'Collect the payoff at Dockside and bring it to Madame Inez.',
      'Lose the 4-star heat and walk away free. YOU WIN.',
    ],
    steps: [
      { kind: 'pickup', x: 425, z: 200, radius: 14, label: 'Collect the payoff at Dockside' },
      { kind: 'drop', x: 200, z: 175, radius: 10, label: 'Bring the payoff to Madame Inez' },
      { kind: 'loseWanted', label: 'Lose the 4-star heat' },
    ],
    payout: 5000, rep: 50, wantedCap: null,
  },
];

// makeMissions() — fresh campaign state: mission 0, step 0, not started.
export function makeMissions() {
  return { index: 0, stepIndex: 0, started: false };
}

// Current mission def (or null once all 5 are done).
export function currentMission(missions) {
  return MISSIONS[missions.index] || null;
}

// Current step def (or null when the mission is complete).
export function currentStep(missions) {
  const m = currentMission(missions);
  return m ? m.steps[missions.stepIndex] || null : null;
}

// missionById(id) — the mission def for an id like 'm3', or null.
export function missionById(id) {
  return MISSIONS.find((m) => m.id === id) || null;
}

// isCampaignComplete(missions) — true once all 5 missions are done.
export function isCampaignComplete(missions) {
  return missions.index >= MISSIONS.length;
}

// missionProgress(missions) — one snapshot for the HUD / mission board:
// { index, total, step, steps, name, label, done }. The board and the HUD
// line read this instead of each poking at missions.index/stepIndex and
// re-deriving the step label.
export function missionProgress(missions) {
  const total = MISSIONS.length;
  const mission = currentMission(missions);
  if (!mission) {
    return { index: total, total, step: 0, steps: 0, name: '', label: 'Debt cleared.', done: true };
  }
  const step = currentStep(missions);
  return {
    index: missions.index,
    total,
    step: missions.stepIndex,
    steps: mission.steps.length,
    name: mission.name,
    label: step ? step.label : '',
    done: false,
  };
}

// Distance from the player (in-car position when driving) to a point.
function playerDistTo(game, x, z) {
  const px = game.player.car ? game.player.car.x : game.player.x;
  const pz = game.player.car ? game.player.car.z : game.player.z;
  return Math.hypot(px - x, pz - z);
}

// stepMissions(missions, game) — advance the campaign one tick.
// `game` carries { player, wanted, economy }. Returns events:
// { type: 'step', mission, step } on a step advance,
// { type: 'missionComplete', mission, payout, rep } on a mission payout,
// { type: 'win' } when M5 completes. Mission start hooks set the opening
// heat (M3: 2 stars, M4: 3 stars + helicopter, M5: 4 stars); a mission's
// wantedCap clamps the wanted level while it is active.
export function stepMissions(missions, game) {
  const events = [];
  const mission = currentMission(missions);
  if (!mission) return events;
  const wanted = game.wanted;

  // Mission start hook (once per mission).
  if (!missions.started) {
    missions.started = true;
    if (wanted) {
      if (mission.id === 'm3') wanted.stars = Math.max(wanted.stars, 2);
      if (mission.id === 'm4') wanted.stars = 3;
      if (mission.id === 'm5') wanted.stars = 4;
    }
  }
  // Wanted cap while this mission is active (M1: 1, M2: 2).
  if (wanted && mission.wantedCap != null && wanted.stars > mission.wantedCap) {
    wanted.stars = mission.wantedCap;
  }

  const step = currentStep(missions);
  if (!step) return events;
  let done = false;
  if (step.kind === 'pickup' || step.kind === 'drop') {
    const inRightVehicle = !step.vehicle
      || (game.player.car && game.player.car.model === step.vehicle);
    done = inRightVehicle && playerDistTo(game, step.x, step.z) <= step.radius;
  } else if (step.kind === 'steal') {
    // Persistent car.stolen flag: re-entering the same Cometa still counts.
    done = !!game.player.car
      && game.player.car.model === step.model
      && game.player.car.stolen === true;
  } else if (step.kind === 'deliver') {
    done = !!game.player.car
      && game.player.car.model === step.model
      && game.player.car.stolen === true
      && playerDistTo(game, step.x, step.z) <= step.radius;
  } else if (step.kind === 'loseWanted') {
    done = !!wanted && wanted.stars <= 0;
  }

  if (!done) return events;
  const finishedStep = step;
  missions.stepIndex++;
  events.push({ type: 'step', mission: mission.id, step: missions.stepIndex - 1 });

  if (missions.stepIndex < mission.steps.length) return events;

  // Mission complete: pay out, then advance to the next mission.
  if (game.economy) {
    applyPayout(game.economy, mission.payout, mission.rep);
  }
  // M2 fix: a delivered car stops being sellable (stolen = false), so the
  // same car cannot pay the mission payout AND a garage sale.
  if (finishedStep.kind === 'deliver' && finishedStep.model && game.player.car) {
    game.player.car.stolen = false;
  }
  events.push({ type: 'missionComplete', mission: mission.id, payout: mission.payout, rep: mission.rep });
  missions.index++;
  missions.stepIndex = 0;
  missions.started = false;
  if (missions.index >= MISSIONS.length) events.push({ type: 'win' });
  return events;
}

// canSellCar(game, car) — garage sale guard (M2 fix): a stolen car may be
// sold UNLESS it is the mission taxi while M1 is active, or the mission is
// currently on a deliver-car step for that car's model, or the car already
// completed a deliver-car mission (its stolen flag was cleared, so it is no
// longer sellable). The caller still enforces speed < 3 m/s.
export function canSellCar(game, car) {
  if (!car || car.stolen !== true) return false;
  const missions = game.missions;
  if (!missions) return true;
  const mission = currentMission(missions);
  if (!mission) return true;
  if (mission.id === 'm1' && car.model === 'taxi') return false;
  const step = currentStep(missions);
  if (step && step.kind === 'deliver' && step.model === car.model) return false;
  return true;
}

// ensureMissionCars(game) — mission-car respawn: a taxi (M1) / non-player
// Cometa (M2) respawns at least 60 m from the player if none is alive, so
// M1/M2 cannot soft-lock. M2 FIX (exact): the player's stolen mission car
// counts as alive (model matches and condition > 0, WITHOUT the owner
// exclusion), so no replacement spawns while the player is driving it.
// Returns the spawned car, or null when no spawn was needed.
export function ensureMissionCars(game) {
  const missions = game.missions;
  if (!missions) return null;
  const need = missions.index === 0 ? 'taxi' : missions.index === 1 ? 'cometa' : null;
  if (!need) return null;
  const px = game.player.car ? game.player.car.x : game.player.x;
  const pz = game.player.car ? game.player.car.z : game.player.z;
  const allCars = [...(game.cars || [])];
  if (game.player.car) allCars.push(game.player.car);
  const alive = allCars.some((c) => c && c.model === need && c.condition > 0);
  if (alive) return null;

  // Sample road nodes until one is at least 60 m away (bounded); fall back
  // to the farthest sampled node.
  let best = null;
  let bestD = -1;
  for (let i = 0; i < 100; i++) {
    const node = game.rng
      ? game.rng.pick(game.city.nodes)
      : game.city.nodes[Math.floor(Math.random() * game.city.nodes.length)];
    const d = Math.hypot(node.x - px, node.z - pz);
    if (d >= 60) { best = node; break; }
    if (d > bestD) { bestD = d; best = node; }
  }
  const yaw = game.rng ? game.rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]) : 0;
  const car = makeCar(need, best.x, best.z, yaw, 'traffic');
  game.cars.push(car);
  return car;
}
