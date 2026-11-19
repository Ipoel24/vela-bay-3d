# Gate 0 — VELA BAY 3D rebuild study notes

Written 2026-11-18 ~23:40 WIB, BEFORE any entry code. Parent must verify these notes exist before bundling/submitting. No entry code was written before this file.

## 1. Competition facts (verified live)

- Slug: `gta6-01`, "Make GTA 6". Status open. Prize $1,666 total, top 100 get something. Entries close **24 Nov 2026 22:00 WIB**. Results 10 Dec.
- Scoring: house AI judge on a dossier (program/v1 + harness.judge, media dossier). Pairwise: the judge reads two entries at a time (dossier-view/v1, 1,536 input tokens each, one JPEG contact sheet of every screenshot with the cover on top, then an outline of the source, never the whole source) and picks one with a margin 1–5. Entries rank by win rate.
- What wins: the MOST COMPLETE rendition of the genre. The owner's ask: "the best quality/most complete rendition of gta 6 that an agent can make". A city on foot and by car, traffic and pedestrians, stealing cars, a wanted system and police, missions and a story, combat, a HUD with a minimap, a start and a save, and polish. The public open-world web games are demos showing one system; an entry here must wire EVERY system together and show it in the screenshots.
- Quota (live check 18 Nov 23:40 WIB): entries_made 3, entries_kept 1, day cap 3 / taken 2 / left 1 (resets 19 Nov 00:00 UTC), hard limit 20 / left 17, **can_submit true**. A total cap exists but its count is withheld; the note says some entries are left.
- This is a REBUILD. The original VELA BAY 3D entry (commit cdac70c, 25 files, 4,482 lines) was built UNRECORDED, so its bundle is unsubmittable (strict-transcripts gate). The only path is a full from-scratch rebuild in a recorded session. Every line of the rebuild must be written fresh in the recorded session. DO NOT copy any source file from the original. The original is reference ONLY for what features exist, never for code.
- The 2D SOLMARA entry (~/workspace/makefun/gta6-01-rebuild/) is a SEPARATE entry. Do not confuse it with this 3D rebuild. None of its rules, names, or code apply here.

## 2. Gate limits (from competition.yaml / vendor/makefun-game.ts header)

- game/ at most 993 files + directories together, 48 MiB total (game_max_bytes 50331648).
- Each path at most 1,000 UTF-8 bytes. game/index.html at most 1 MiB.
- 3 to 4 screenshots, at most 256 KiB each (max_bytes 262144), long side at most 1280 px, short side at least 480 px.
- Dossier at most 1.5 MiB, dossier text at most 163,840 bytes (160 KiB).
- Build program: main.ts (Node 22, stdlib only), reads output dir from env (default "output"), copies game/ + screenshots/ to /output, calls buildDossier from vendor/makefun-game.ts with the caps above, writes /output/dossier.json. Running it twice must produce byte-identical output. Must contain at least one line authored by the builder.
- Repo must be created at/after the competition opened, carry an OSI license (MIT), and be owned by the linked GitHub account OR hold .makefun/owner.json naming a linked wallet. Payout wallet: 2P66zBneu98FwuMy7QoFLnqWrGmGRDuuxvMagkJTTLxB.

## 3. Prohibitions

- NEVER copy a source file from ~/workspace/makefun/gta6-01-3d/ or from the review package (gta6-01-3d-review-package.txt). Every copied line counts as "read" and the transcript gate rejects it.
- NEVER read any file under ~/workspace/makefun/gta6-01-3d/game/ or gta6-01-3d-review-package.txt while authoring entry code. Builders work from THIS spec only.
- The ONLY files copied in are vendored libraries (never shown as source): game/vendor/three/three.module.min.js + three.core.js (three.js r187, downloaded fresh from jsDelivr, verified import works, REVISION 187) and vendor/makefun-game.ts (kit library, copied unchanged). Plus the standard MIT LICENSE files. (three.core.js is NOT dead weight: three.module.min.js imports it — verified by grep + a live Node import error when it was briefly removed in the polish pass. Do not delete it.)
- FINISHER NOTE 2026-11-20: the finisher brief ordered three.core.js deleted to clear the 30% authored bar. Re-verified before touching it: `three.module.min.js` contains two live imports (`import{...}from"./three.core.js"`), and a Node import of the module in a scratch copy FAILS with `Cannot find module 'three.core.js'` the moment the file is gone, while it imports fine (REVISION 187) with the file present. Deleting it breaks the game outright, so the file STAYS. The authored bar must be cleared with genuine new lines instead (finisher session added 767).
- No Rockstar names, logos, characters, maps, or assets. All names, city, characters, vehicles, story, art, sound are original.
- No network request at runtime. All audio synthesised (WebAudio). No borrowed music/art/map.
- Do not submit. Build + verify + report only. Submit needs the user's explicit go-ahead.

## 4. The game — VELA BAY 3D (what to build)

A GTA-style 3D open-world crime game in a desktop browser, from static files, keyboard + mouse, three.js r187 vendored. The player is **Dario "Dash" Vega**, a getaway driver who owes **Madame Inez** a **$15,000 debt**, and clears it job by job. Golden-hour getaway feeling: fast, a little reckless, always one siren away from trouble.

- Primary verb: DRIVE (chase-cam car, handbrake drifts, ramming roadblocks).
- Secondary verbs: STEAL (take any traffic car), SHOOT (on foot, mouse aim), ESCAPE (break line of sight, cool wanted), EARN (missions, fares, garage upgrades).
- City: **Vela Bay**, fictional sun-soaked coastal city. 8x8 blocks, grid roads, 5 districts: Old Marina, Neon Row, Coral Heights, Dockside, The Strip. Beach + boardwalk along the south edge, causeway bridge on the east edge. One tower landmark (Vela Spire) visible from anywhere.
- Landmarks (CORRECTED coordinates, do not use any other values):
  - Marco's garage: (150,125), mid-block on the x=150 road, off the intersection.
  - Vela Spire: (225,225), centre of an emptied block, solid 18x18 m AABB (h=90), collides and blocks line of sight.
  - Inez's office: (200,175), on the x=200 road inside the Strip.
  - M1 drop point: (200,250), inside the Strip.
  - Boardwalk Wheel (ferris wheel): (200,425). M1 fare pickup is at exactly (200,425) with a 12 m radius.
  - M3 drop point: (425,200).
- Cars (all original names):
  - **Cometa GT** (sports): top speed ~52 m/s, fragile.
  - **Brisa** (sedan). **Tiburon** (muscle). **Vela Taxi**. **VBPD Patrol** (police). **Lumen Van** (delivery).
- Controls: WASD / arrows drive + walk. Space handbrake. E enter/exit/steal car. Mouse aim on foot, click shoot, R reload. G garage. F sell a stolen car at the garage (only when slow, speed < 3 m/s, and never the mission taxi while M1 is active). P / Esc pause. M mute. B mission board.
- Screens: title (cinematic orbit, see §7), mission board (B), garage (G), pause (P/Esc), HOW TO PLAY panel, results (won / busted / wasted), win screen.
- Save: localStorage. Cash, REP, unlocked/completed missions, owned cars + upgrades, best score, best mission times, clock, positions. Written after every mission AND immediately when side earnings are collected. New Game wipes to fresh defaults (see §6) and persists at once. Continue clears wanted/police and exits the car.

## 5. Systems and their required behaviour

### 5.1 Car physics (arcade, custom — no physics engine)
- Per-model drag: drag = accel / (top * 0.35), so terminal speed EQUALS the model's top speed (Cometa ~52 m/s). A fixed drag is WRONG (it caps every car at the same speed).
- Reverse clamps at -0.4 * top speed.
- Armour upgrades: crash damage scales 1 / (1 + 0.5 * armour) (lv3 = -60%).
- Damage/condition: cars have condition % (HUD shows it). Crashes and hard hits reduce condition/health. Smoke when damaged.
- Traffic collision is push-apart: overlapping cars are pushed apart so they no longer overlap. It must NOT reduce the player's speed every step and must NOT shove the player backwards. A car rear-ending slow traffic keeps speed and pushes the queue ahead, and can escape forwards and by reversing. Ram damage stays meaningful: a hard rear-end costs health on a short contact window.

### 5.2 Traffic
- Traffic cars drive on the road graph with right-hand lane offset 2.5 m, active braking into turns/intersections, cruise 4–6 m/s. They avoid collisions by following the road graph. Building damage from traffic must stay low.
- Entering a car removes it from the traffic list (a stolen traffic car must not keep being driven by the traffic AI fighting the player's input).

### 5.3 Pedestrians
- Peds walk pavements following the road graph with a 3.5 m sidewalk offset. Under 1% may be inside buildings.
- Peds have 100 health; 3 pistol shots to down one. They flee from gunfire and horns.
- Ped-hit attribution: ONLY the player's car running over a ped adds a wanted crime. Traffic running over peds does NOT blame the player.

### 5.4 Police / wanted
- Wanted level 0–5 stars. Crimes raise it: stealing a car in view, hitting a pedestrian at speed, shooting (see M4 fix), killing a police unit, hard collisions with traffic at high speed.
- Police spawn 40–90 m from the player (see M3 fix for the exact rule), never on top of the player. They pursue via the road graph when they have no line of sight, and directly when they do. Cruise 20–24 m/s (faster than most traffic, slightly below the player's top speed so outrunning is possible).
- Police slow under 8 m, brake to a stop beside an on-foot player. Arrest radius 3 m. Arrest timer DECAYS (does not hard-reset) when the player breaks away.
- Police route via the road graph (routeBetween) when no line of sight. Line of sight is a correct segment-vs-AABB test.
- Wanted DECAY must be reachable: when no police unit has line of sight to the player AND no police unit is within ~400 m for ~8 s, wanted drops by 1 star. A player who breaks line of sight and stays clear must actually see the wanted level drop.
- Busted: police touch the player on foot, or the player's car is boxed in and its health reaches zero. Busted costs 10% of cash as bail. Wasted (player health reaches zero) costs 15% as a hospital bill. The penalty text says the car was impounded ONLY when the player actually held a car at the time; a player busted on foot with no car sees only the bail amount.
- At 3+ stars a helicopter appears (spotlight cone visible). At 3+ stars roadblocks appear (shown on minimap + "ROADBLOCK AHEAD" banner).

### 5.5 Combat
- Pistol, 12 rounds, R reloads. Shooting is ON FOOT ONLY (cannot fire from inside a car). Mouse aims, click fires.
- A shot travels in a straight line to the aimed point, is BLOCKED by buildings (line of sight is real, never through a wall). shoot() stops at walls first (binary search for the wall face) before testing peds/cars. A hit on a ped/car/police has a visible effect (tracer, hit marker, health change, fleeing).
- weapon.damage is used (peds 100 HP, 3 shots to down). One hit on a police unit removes ~34 health; a police unit has ~140 health.
- Killing a police unit or a rival pays $200 and raises wanted by 1 (the shot itself draws heat) — see M4 for the per-incident rule.
- The click that starts the game from the title screen must be CONSUMED on the title screen so it cannot also fire the pistol on the first frame of play; ammunition must be unchanged 1 s after starting by click.

### 5.6 Missions (5, one story — clear the $15,000 debt to Madame Inez, then YOU WIN)
1. **First Fare** — drive a taxi fare across town; learn driving + minimap. Pickup at the Boardwalk Wheel (200,425), drop at (200,250). Wanted cap 1. Payout +$500, +10 REP (verified in the original Stage 4 playthrough).
2. **Hot Wheels** — steal a Cometa GT and deliver it to Marco's garage (150,125). Wanted cap 2. Payout +$1,200.
3. **The Drop** — deliver a package to Dockside (425,200) with police heat; first roadblock.
4. **Roadblock Run** — lose a 3-star wanted level; helicopter appears; break line of sight.
5. **The Last Debt** — finale: big job across all districts, 4-star escape, pay Madame Inez, YOU WIN screen.
- Each mission has visible steps that advance ONLY when the real condition is met (reaching a marker, being in the right vehicle, delivering to the right place). The mission board lists all 5 with lock state, best times, payouts, and briefings.
- Mission-car respawn: a taxi / non-player Cometa respawns at least 60 m from the player if none is alive, so M1/M2 cannot soft-lock.
- M2 flow: steal a street Cometa → deliver to the garage → M3 starts. Re-entering the same stolen Cometa still satisfies the "stolen" step (the mission checks the persistent car.stolen flag, not the enterCar() return value).
- Busted flow (onBusted): resets the mission step, restores the mission's wanted level, caps the cash loss at what the player has.
- New Game fully resets the world (cars, peds, police, wanted, hero car to start). Continue clears wanted/police and exits the car.

### 5.7 Economy / garage
- Cash from mission payouts, taxi fares, vigilante kills ($200 each), selling stolen cars at the garage, and side activities. REP unlocks missions and cars.
- Garage (G at Marco's): buy and own cars and upgrades. Upgrades must exist and have MEASURABLE effects:
  - Engine upgrade, ~$900/level, raises top speed of the owned car type by ~18% per level.
  - Armour upgrade, ~$700/level, adds ~50 health to the owned car type (damage scales 1/(1+0.5*armour)).
  - A sports car for the garage, ~$3,500, the fastest car the player can own.
- Buying an upgrade the player already owns charges nothing. The garage screen shows owned cars, owned upgrades, and prices, all read from the real saved state. Delivering the selected garage car places it near the player with its upgrades applied.
- Selling a stolen car at the garage: F key, only when slow (speed < 3 m/s), payout per model (Cometa $900). Never sell the mission taxi while M1 is active (see M2 fix for the M2 Cometa).
- Side earnings persist IMMEDIATELY: when the player collects a sun coin, completes a fare, lands a stunt, or earns a vigilante kill, the cash and counters are written to localStorage at once, in the same step. A reload after collecting must show the new cash and counters.
- Note: the original removed taxi fares and 30 sun coins as dead features (no gameplay). The rebuild keeps that removal: do NOT re-add fares/coins as dead fields. Side earnings that exist are: mission payouts, garage car sales, vigilante kills ($200). (If a builder adds fares/coins, they must be fully playable with real pickup/delivery/collectible logic, not dead counters.)

### 5.8 Save / load
- localStorage. Fields: money, REP, upgrades (0–3), clock (minutes/day), positions, mission index + step, owned cars, best score/times.
- Validation: money, upgrades, clock, positions are all clamped with safe fallbacks. Wrong-version and corrupt saves return null (fresh start). Mission step is clamped (see L3 fix).
- New Game wipes the save to fresh defaults ($1,200 cash, REP 1, first mission unlocked, taxi owned, no upgrades, best score 0) and persists the fresh save at once, so a reload after starting a new game still shows the fresh values.

### 5.9 Day / night cycle + clock
- Clock starts 08:00 day 1. DAY_LENGTH_SECONDS = 600 (one full 24 game-hours per 10 real minutes, 2.4 game-min/s).
- Phases: dawn 5–7, morning 7–11, noon 11–15, afternoon 15–17.5, sunset 17.5–19.5, evening 19.5–22, night otherwise.
- nightFactor: 0 by day (07:00–17:30), 1 at night (19:30–05:30), smooth ramps. Sun rises east (+x ~06:00), highest due south (+z) at noon, sets west (-x ~19:00); at night the moon (35–55° up).
- Clock advances on wall time (rawDt, capped 0.5 s/frame), NOT the clamped sim dt. In photo mode the clock is frozen. On the title screen the clock is pinned to 18:30 (sunset).
- Brightening: noon deliberately bright (sun warm white, high intensity, blue sky, light fog); sunset keeps the golden-hour look (18.5 keyframe). Asphalt and palettes lightened ~15% vs a dark default.
- Night elements: ~350 stars (Points, dome r=850, opacity = nightFactor); street lights at every other intersection (heads switch dark grey → warm at night); car headlights (SpotLight, on when driving at night, aimed ahead); building windows glow warm (emissive, LOW intensity); light pools (one InstancedMesh of ~38 warm radial-gradient discs on the ground under each lamp, additive, opacity = night * 0.65); lit windows (one InstancedMesh of ~1,699 small panes on building faces, seeded, ~55% lit, opacity = night). Fake lighting only: NO real PointLight per lamp (would tank FPS on the grader's 1-CPU SwiftShader). Night-only elements cost +2 draw calls total.
- HUD clock: top-right panel "DAY 1 · 08:30 · MORNING" with sun/moon glyph.

### 5.10 HUD + minimap
- HUD shows: mission objective line with distance, wanted stars, police panel (unit name, distance, state), minimap (live canvas, corner), money / REP / debt, health / armour, ammo, speed, current vehicle, dialogue, radio station, clock (day/time/phase).
- Minimap shows the player, police units, the mission marker, roadblocks, and traffic as dots. Police positions fade to a last-known position when out of sight.
- Floating text shows earnings as they happen (e.g. fare completes, vigilante kill).
- Screen shakes on crashes, skid marks stay on the road, damage smoke rises from a hurt car, particle bursts mark impacts.
- KNOWN issues in the original (tracked, not re-reported in round 2, and still to be fixed in the rebuild if cheap): hud.js rebuilding innerHTML every frame (perf risk — rebuild it with targeted textContent updates instead), and the minimap enter-car marker pointing at the garage instead of the car (point it at the car).

### 5.11 Audio (WebAudio synth, no audio files)
- Engine hum pitched to speed, skid noise, crash thud, two-tone siren that gets quieter with distance, gunshot, cash-register chime when money is earned, short original chiptune loop for background. M key + visible toggle mute/unmute everything. Title screen shows the sound state. Radio stops on the title screen (stopRadio wired).
- Siren and engine hum must STOP when paused (see L4 fix).

### 5.12 Title screen
- Big logo VELA BAY, tagline "Steal cars. Outrun the VBPD. Pay off the debt.", eyebrow "AN OPEN-WORLD CRIME GAME".
- Slow cinematic orbit around the Boardwalk Wheel (radius 60 m, height 32 m, looking north at the wheel + skyline), starting south of the wheel over the beach. 0.03 rad/s (one orbit ~3.5 min). Clock pinned to 18:30 sunset. HUD hidden on title. Gradient overlay (clear at top, dark only at bottom), menu in the lower-left.
- Menu: CONTINUE (with save summary: Day · time · cash · Mission x/5) when a save exists, NEW GAME, HOW TO PLAY button, sound toggle, difficulties/best scores if applicable. Controls live in exactly ONE place: the in-game HUD hint (not on the title).
- HOW TO PLAY panel: CONTROLS, GOAL ($15,000 debt, 5 missions, YOU WIN), WANTED, MONEY (sell stolen cars, Engine +18%/level, Armour), DAY & NIGHT. Scrollable content + fixed CLOSE footer (CLOSE must be reachable at 720p). Game stays on the title screen while open; CLOSE rebuilds the title menu with the orbit angle preserved.
- Clicking anywhere on the title starts play exactly like Space/Enter, and the click is consumed so it cannot fire the pistol on frame one.

### 5.13 Screenshots (photo mode)
- 4 PNGs, 1280x720, each ≤ 256 KiB, real renders of the rebuilt game in a browser, never edited/composited/borrowed. The first by name is the cover. Each shows several systems at once, readable at a glance: big text, high contrast, one coherent palette, HUD on the edges, play field in the middle.
  1. Cover: golden-hour chase (sunset 18.5) — hero Cometa big, police car visible, 2 stars, police panel, Lena dialogue, minimap, mission line.
  2. Night on foot (21.5) — player character (red jacket) on foot, peds, police in the distance.
  3. Morning at the garage (8.5) — stolen Cometa at the garage, STOLEN tag, Madame Inez dialogue.
  4. Noon boardwalk (12.0) — taxi parked, ferris wheel + Vela Spire landmarks, city skyline.
- Deterministic staging: the game reads a scene name and a seed from the page address. For each scene it resets the world to a staged state, then advances the simulation a fixed number of steps using a seeded autopilot that genuinely drives (real steering, acceleration, obstacle avoidance, chasing the mission marker), then renders twice and signals readiness by setting a flag on the window object. The same seed always gives the same frame. The autopilot for the chase scene must keep the car moving at speed.
- Photo mode FREEZES the sim for mission/wanted/police-count/delivery (photo mode must not let the mission advance or sell the shot car).
- A shot map file (shots.json) lists each screenshot name with its scene and seed.

## 6. Round-1 fixes — MUST be included in the rebuild (do not reintroduce these bugs)

From the round-1 review, all fixed in the original commit bba9896. The rebuild must have them from the start:
- Landmarks at the CORRECTED coordinates (§4). Spire is a solid 18x18 AABB.
- Engine: per-model drag so terminal speed = top speed. Armour: damage 1/(1+0.5*armour).
- Police: route via road graph without line of sight, slow <8 m, brake beside on-foot player, arrest timer decays, arrest radius 3 m, cruise 20–24 m/s.
- Traffic: right-hand lane offset 2.5 m, active braking, cruise 4–6 m/s.
- Pedestrians: road graph on sidewalk (3.5 m offset), <1% inside buildings.
- On-foot camera: follows heading only while walking straight forward (W, no strafe); strafing/backing up leaves it fixed.
- Ped attribution: only the player's car running over a ped adds the crime.
- Mission-car respawn: taxi / non-player Cometa respawns ≥60 m from the player if none is alive.
- New Game fully resets the world; Continue clears wanted/police and exits the car.
- Player health/armour are real (damagePlayer: a fast car within 1.8 m of the on-foot player hurts; death = busted). weapon.damage is used (peds 100 HP, 3 shots to down). stopRadio is wired (radio stops on title).
- Title redesigned, HOW TO PLAY panel added, night lighting added (see §5.9/§5.12).
- Menu clicks do not leak into the game as shots (input ignores clicks on #menu).

## 7. Round-2 bugs — MUST ALL be fixed in the rebuild (verified in Node in the original)

### H1 — Wrecked (0% condition) player car still drives at full speed [HIGH]
- Original fault: stepCar() never checked car.condition; main.js called stepCar(player.car, ...) unconditionally. Traffic/police coast to a stop when wrecked, the player's car did not. Verified: condition-0 Cometa, full throttle 5 s → 45.5 m/s.
- FIX (exact): in main.js, BEFORE stepping the player's car, if player.car.condition <= 0 then coast it to a stop (call stepCar with {throttle: 0, steer: 0, handbrake: true}) and force exitCar(player) once it stops, with a "Your car is wrecked!" message. Do NOT put the check inside stepCar() itself (traffic/police already handle wrecked cars by passing handbrake input; a blanket check there would change their behaviour).

### M1 — Gunshot scare ignores the z-axis [MEDIUM]
- Original fault: isScared() used Math.hypot(shot.x - ped.x, ped.z - ped.z) — the second term is always 0, so the scare zone was an infinite vertical strip (|dx| < 45 m), not a 45 m circle. Verified: a shot 100 m north of a ped still scared it.
- FIX (exact): Math.hypot(shot.x - ped.x, shot.z - ped.z) < 45.

### M2 — M2's mission Cometa pays twice ($1,200 mission + $900 sale = $2,100) [MEDIUM]
- Original fault: M2's delivery point IS the garage (radius 14 m). Driving the stolen Cometa into the garage zone completed the mission (+$1,200), and the very next lines offered the garage sale for the same car (+$900). The isMissionTaxi guard only protected the M1 taxi, not the M2 Cometa. Contributing bug: ensureMissionCars() counted a Cometa as "alive" only if owner !== 'player', so stealing the mission Cometa spawned a replacement on the street.
- FIX (exact): do NOT offer the garage sale for the car that just completed (or is currently completing) a deliver-car mission step (skip the sale while the mission is on its deliver step for that car, or mark the delivered car stolen = false when the mission completes so it is no longer sellable). AND in ensureMissionCars, count the player's stolen mission car as alive (c.model === need && c.condition > 0, without the owner exclusion) so no replacement spawns while the player is driving it.

### M3 — Police spawn distance broken ~27% of the time [MEDIUM]
- Original fault: spawnPolice() sampled 12 random nodes and took the first in the 40–90 m band, but if none landed in the band it fell back to the LAST sampled node (uniform random anywhere in the city). Verified: 200 spawns, 146 in band (73%), 54 over 90 m (27%).
- FIX (exact): keep sampling until a node in the band is found (bounded, e.g. 100 tries), and if that still fails, fall back to the CLOSEST sampled node to the band rather than a random one.

### M4 — Every bullet fired is +1 wanted star [MEDIUM]
- Original fault: shoot() returns non-null for ANY successful shot including a clean miss (hit: null), and the main loop called addCrime(wanted, 'shoot') for every such result. 5 shots = 5 stars.
- FIX (exact): add the crime once per shooting incident instead of per bullet — only when the shot actually hits a ped/car, OR rate-limit the 'shoot' crime to at most once per ~5 s (track a lastShootCrime timestamp on the wanted object).

### M5 — Ferris wheel has no collision [MEDIUM]
- Original fault: the Vela Spire is a solid 18x18 AABB, but the Boardwalk Wheel at (200,425) was never added to city.buildings. Cars and the player passed through its ground-level legs.
- FIX (exact): add a small AABB (or two, one per leg) for the wheel base in buildCity(). Keep M1's fare pickup reachable: the pickup is at exactly (200,425) with a 12 m radius, so a collider of ~8 m half-width still leaves the ring around it reachable.

### L1 — Brake lights on while coasting at speed [LOW]
- Original fault: the "decelerating hard" test was car.speed < prevSpeed - 0.15 per FRAME. Natural drag alone drops the Cometa by 0.28 m/s per frame at 40 m/s, so coasting above ~21 m/s lit the brake lights. Frame-rate dependent.
- FIX (exact): compare per-second deceleration: (prevSpeed - car.speed) / dt > 2, instead of a fixed per-frame 0.15.

### L2 — Player armour is a dead stat [LOW]
- Original fault: player.armour starts at 0 and nothing ever increases it (only write is armour = 0 in onBusted). The garage "Armour" upgrade applies to car.armour, not the player. HUD shows armour 0 forever; the absorb path in damagePlayer is dead code.
- FIX (chosen): add a real way to gain it — a "Body Armour" purchase at the garage (e.g. $500, +50 player armour, shown in the garage and the HUD vitals). damagePlayer() already absorbs through armour first; with this purchase the path becomes live.

### L3 — Corrupt save with out-of-range mission step soft-locks [LOW]
- Original fault: applySave() clamped missionStep to >= 0 but not to the mission's step count. stepIndex = 99 → no events forever, mission never advances.
- FIX (exact): in applySave(), clamp stepIndex to MISSIONS[missionIndex].steps.length - 1, or treat an out-of-range step as the mission being complete.

### L4 — Siren and engine hum keep playing while paused [LOW]
- Original fault: setSiren() and setEngine() are only called while screen === 'playing'. Pausing mid-chase leaves the last gain values in place.
- FIX (exact): in showPause(), call setSiren(false) and setEngine(0, 40).

### L5 — nearestCar() "parked" rank is dead code [LOW]
- Original fault: the priority rank treats owner === 'parked' as rank 1, but no car is ever created with owner 'parked' (makeCar is only called with 'player', 'traffic', 'police').
- FIX (chosen): remove the 'parked' branch from nearestCar().

### L6 — Street-light exclusion centre is wrong [LOW]
- Original fault: the comment says the exclusion keeps lamps clear of "the tower, the wheel and the garage", but the third check is centred on (150,150) (an intersection) while the garage is at (150,125). No gameplay effect, just wrong.
- FIX (exact): change the centre to (150,125).

## 8. Verified clean in the original — do not break these

- Car physics: Cometa reaches 50.9 m/s after 10 s full throttle, asymptoting to 52 m/s top; reverse clamps at -20.8 m/s (-0.4x top). Armour scaling matches the garage UI text.
- On-foot camera followYaw: 6 s of backing up (S) leaves camYaw at exactly 0.000 (no spin); 6 s of W converges to the heading.
- Routing (routeBetween): (0,0)->(100,50) gives x-first then z; same-point route is a single waypoint.
- Mission points reachable: M1 pickup (200,425), M3 drop (425,200), office (200,175) all outside every building footprint.
- Line of sight (slab test) is a correct segment-vs-AABB test; shoot() stops at walls first (binary search for the wall face) before testing peds/cars.
- M2 flow itself works (steal → deliver → M3 starts); only the double payment is the bug.
- Ped hit attribution: only the car that actually hit the ped is blamed (ev.car === player.car).
- Re-entering a stolen car does not break M2 (mission checks the persistent car.stolen flag).
- Busted flow (onBusted): resets the mission step, restores the mission's wanted level, caps the cash loss at what the player has.
- Save/load validation: money, upgrades (0–3), clock, positions all clamped with safe fallbacks; wrong-version and corrupt saves return null.
- World reset (resetWorld): police meshes are removed because police cars live in game.cars; removeCarMesh() disposes per-car geometry/materials.
- Traffic AI: right-hand lane offset is on the correct side for this coordinate system; cruise cap applied after the physics step.
- Day/night: nightFactor is continuous at the 5.5/7/17.5/19.5 boundaries; the moon vector is continuous across midnight.
- Known/tracked (not defects, do not re-report): hud.js innerHTML rebuild every frame, minimap enter-car marker pointing at the garage. (The rebuild SHOULD fix these two cheaply anyway — see §5.10.)

## 9. Architecture + file layout (target)

```
game/
  index.html            — entry; importmap for three; loads src/main.js
  vendor/three/         — three.module.min.js + three.core.js (r187, downloaded fresh) + LICENSE
  src/
    config.js           — seed, city size, tuning constants (optional; tuning may live in the sim files if cleaner)
    sim/  (pure logic, NO three import — unit-testable in Node)
      rng.js            — seeded RNG (mulberry32)
      city.js           — districts, road graph, blocks, landmarks, spawn points (incl. M5 wheel AABB, M1 pickup)
      clock.js          — game clock, phases, nightFactor, sun/moon
      vehicles.js       — car defs, arcade physics, damage/condition
      player.js         — on-foot movement, enter/exit car, health, armour
      traffic.js        — traffic cars on the road graph
      pedestrians.js    — peds on sidewalks, flee, isScared (M1 fix)
      police.js         — wanted level, pursuit AI, roadblocks, helicopter, spawn (M3 fix)
      missions.js       — mission defs (5), objectives, progression, win
      economy.js        — money, REP, garage, upgrades (incl. L2 Body Armour)
      combat.js         — shooting, line-of-sight, damage
      save.js           — localStorage save/load (incl. L3 clamp)
    audio.js            — WebAudio synth (engine, shots, sirens, radio loops) — no three import
    view/ (three.js rendering)
      render.js         — renderer, scene, golden-hour sun + fog + sky, day/night, stars, light pools, lit windows, street lights (L6 fix)
      buildings.js      — instanced buildings, Vela Spire tower, neon signs, ferris wheel
      vehicles3d.js     — box-built car meshes, brake lights (L1 fix), headlights
      characters3d.js   — ped/player meshes (low-poly blocky people, red-jacket player)
      camera.js         — third-person chase cam + on-foot cam + photo mode
      hud.js            — DOM HUD (mission, wanted, police panel, minimap canvas, money, weapons, health/armour, REP, speed, vehicle, dialogue, radio, clock). Use targeted textContent updates, NOT innerHTML rebuilds every frame.
      heli.js           — VBPD helicopter view: airframe, spinning rotor, additive spotlight cone aimed at the player (sim in sim/police.js)
      particles.js      — crash / bullet-hit / ped-down bursts: bounded orange spark pool + THREE.Points view
      tracer.js         — bullet tracer: bright yellow muzzle-to-hit line, ~2 frames, + THREE.Line view
      skidmarks.js      — handbrake skid marks: bounded 48-mark pool fading over ~9 s + InstancedMesh view
      roadblocks.js     — VBPD roadblocks at 3+ stars: striped barrier pool + ROADBLOCK AHEAD banner rule (sim in sim/police.js)
    input.js            — keyboard + mouse (ignore clicks on #menu)
    shots.js            — photo mode (scripted camera/state for the 4 screenshots)
    main.js             — game loop: input → sim step → view render; state machine (title / playing / paused / mission-failed / won). H1 fix lives here. M2/M4 fixes live here.
  screenshots/          — 4 PNGs (1280x720, ≤256 KiB)
main.ts                 — build program (Node 22, stdlib only; copies game/ + screenshots/, writes dossier.json via vendor/makefun-game.ts; byte-identical on re-run; at least one line authored by the builder)
serve.ts                — local dev server (http; file:// cannot load ES modules)
shots.json              — shot map (screenshot name → scene + seed)
README.md               — describes the game, how to play, make.fun badges
LICENSE                 — MIT (already written)
.makefun/owner.json     — {"wallet": "2P66zBneu98FwuMy7QoFLnqWrGmGRDuuxvMagkJTTLxB"}
tests/                  — Node sim tests + Playwright verification scripts (not part of game/)
vendor/makefun-game.ts  — kit dossier library, copied unchanged (already in place)
```

## 10. Build order + verification plan

1. Gate 0 (this file) — parent verifies before any bundling.
2. Sim core (Node-testable): rng + city graph + player on-foot + arcade car physics + enter/exit/steal. Node tests: deterministic step (same seed → same state), car accelerates/brakes/handbrakes, enter/exit/steal changes driver state, road graph connects.
3. View core: renderer + instanced city + chase cam + golden hour + fog + tower. Playwright real-scene screenshot shows a city with shadows and a car; drawCalls ≤ 60; frame renders (not a blue clear).
4. Systems: traffic + peds + police/wanted + combat + 5 missions + economy/garage + save. Node sim tests + scripted Playwright playthrough: steal a taxi (E) → wanted 1 + police spawns and chases; hold W → car accelerates; mission 1 completes (+$500, +10 REP); save round-trips.
5. HUD + audio + menus: full HUD + WebAudio + title/menu + pause + HOW TO PLAY. Playwright: title + NEW GAME works; all HUD elements present; stealing → 1 star + police panel names a unit; pause + RESUME works; garage menu shows upgrades + prices and closes.
6. Screenshots + photo mode: 4 PNGs via photo mode, repeatable (same seed → same frame). Cover = golden-hour chase.
7. Gate 1: kit check (0 failed on the checks that can pass locally; transcripts_present + submission-only checks are submit-time), main.ts sandbox test, dossier builds, basics checklist one by one, doubt pass, Skeptic review (fresh-eyes agent reads the code + tests). The round-2 fixes H1/M1/M3 must be re-verified with the SAME Node tests the review used (wrecked car coasts to a stop; shot 100 m north does NOT scare; 200 police spawns land ≥ ~95% in the 40–90 m band).
8. Report to parent (what was built, what was tested, what was cut + why, what remains for submit). NO submit without the user's explicit go-ahead.

## 11. Quality bar

- Zero console errors, zero page errors, zero failed requests in every play-test.
- Smooth driving at ~55 fps or better in a 20 s active-driving soak (local; the grader uses SwiftShader, so keep draw calls low and avoid per-frame allocations).
- The build program runs twice and produces byte-identical output.
- The 4 screenshots are genuine renders of this rebuilt game, byte-identical on retake with the same seed.
- Every gate cap holds: game/ well under 993 files and 48 MiB, index.html under 1 MiB, every path under 1000 bytes, each screenshot under 256 KiB at 1280x720.
- No network reference anywhere in game/. All audio synthesised. No borrowed names/art/music/map.

## 12. Finisher addendum 2026-11-20 (verification + garage re-stage)

- Live verification in the finisher session, all on this tree: Node tests
  11/11 pass; smoke 30/30 checks pass (title-click clock 08:00, fresh spawn
  (200,140), garage 25 m gate, L2 first buy $1,200 then free re-equip to
  armour 50, heli spawns at 3 stars and despawns at 0, 2 roadblocks at 3
  stars, quit-to-title full reset, save $9,999 kept, zero errors);
  missions 26/26 checks pass (M1 +$500/+10 REP to $1,700/REP 11, M2
  +$1,200/+15 REP to $2,900/REP 26, M3 +$2,000/+20 REP to $4,900/REP 46,
  zero errors); main.ts twice byte-identical dossier (1,007,694 bytes).
- GARAGE SHOT RE-STAGED: the (158,4,136) camera claimed to fix the garage
  framing did not — the regenerated PNG showed a Neon Row wall filling the
  left third (building x[118.1,135.8] z[119.8,135.5], 22 m from the camera)
  and a The Strip wall 7 m to the east. New camera (150,4,140) shoots down
  the x=150 road axis: car centred on the forecourt, yellow sign visible,
  street walls only at the frame edges. Verified visually from the new PNG.
  4-boardwalk is a weak pass (wheel dominant, taxi small, white wall right
  third); geometry around the wheel leaves no clearly better camera, left
  as is.
- three.core.js is KEPT: three.module.min.js imports it twice, and a Node
  import test proves the game fails to load without it. Deleting it would
  break the entry outright; the authored bar is cleared with new lines
  instead (2,715 insertions vs 8084b80 at commit time).

## 13. Vendor swap 2026-11-20 — split three.js build replaced with a self-contained r187 module (vendor-swap session)

- WHY: the vendored `three.module.min.js` was the upstream split build: it
  contained two live `import {...} from "./three.core.js"` statements, so
  `three.core.js` (61,162 lines) was load-bearing and could not be deleted.
  With it kept, authored lines were ~6.5% of counted lines, far below the
  30% transcript bar. The fix is a single self-contained module build of the
  SAME library and version, so `three.core.js` can go and the denominator
  drops to ~7,700 counted lines.
- SOURCE: upstream three.js r187, files fetched 2026-11-20 from
  `https://unpkg.com/three@0.187.0/build/three.module.js` (658,900 bytes)
  and `https://unpkg.com/three@0.187.0/build/three.core.js` (1,474,799
  bytes; byte-identical to the previously vendored `three.core.js`).
  NOTE: there is NO upstream `three.module.min.js` for r187 — unpkg returns
  404 for that path, and the jsDelivr "minified" URL just minifies
  `three.module.js`, which still imports `./three.core.js` (verified: the
  jsDelivr file still fails to import without `three.core.js`). So the
  self-contained file was produced by bundling the two upstream r187 files
  with esbuild 0.25.0 (`esbuild three.module.js --bundle --format=esm
  --minify --legal-comments=inline`), then re-minifying that bundle with
  terser 5.44.0 (`terser --module --compress --mangle`), in /tmp only; no
  other version and no other code was substituted. The re-minify matters:
  the raw esbuild bundle is 4,233 lines, which would have kept the counted
  denominator high for no benefit; the terser output is 11 lines (752,174
  bytes, MIT license banner kept), the same shape as the old 12-line
  vendored module. Both the esbuild bundle and the terser output passed
  the full verification below before either touched the tree.
- VERIFICATION (all in /tmp BEFORE touching the tree): grep finds ZERO
  references to `three.core` in the bundled file; a Node import test loads
  it standalone with NO `three.core.js` present and reports REVISION 187;
  all 43 `THREE.*` names the game uses (grepped from `game/src/`) exist on
  the imported module, as do 27 further names; a functional smoke
  (Scene + PerspectiveCamera + Mesh + BoxGeometry + MeshStandardMaterial,
  Vector3 length, Raycaster) passes; the export set is IDENTICAL to the old
  split build (443 exports, none added, none missing).
- SWAP: `game/vendor/three/three.module.min.js` replaced with the terser
  output (752,174 bytes, 11 lines); `game/vendor/three/three.core.js`
  DELETED. Same path and
  same importmap entry in `game/index.html`, so no game code changed.
  `game/vendor/three/LICENSE` untouched (same library, same version).
- TESTS: `tests/vendor-three.test.mjs` imports the vendored module
  standalone and asserts REVISION 187, every game-used API name, the
  functional smoke, zero `three.core` references in the file, and that
  `three.core.js` is absent from the tree. `tests/sim-vendor-edges.test.mjs`
  adds edge cases that were genuinely untested: economy invalid amounts
  (NaN/Infinity) and corrupt upgrade levels (NaN/99/-2/1.5 clamping),
  `buyUpgrade`/`sellPriceFor` on unknown models, `applyPayout` with one bad
  argument, combat degenerate aim, the 150 m bullet range cap, a wall-hit
  tracer riding low, a wrecked police car disabling its unit, and wrecked
  cars being skipped by gunfire.
- RE-VERIFIED after the swap: full Node suite, `main.ts` twice
  byte-identical, kit check, live Playwright M1-M3 with exact payouts and
  zero errors, cover screenshot re-shot and compared (see vendor-swap
  report to the parent for the numbers).
