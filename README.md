# VELA BAY 3D

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/Ipoel24/makefun-getting-started/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard)
[![reward](https://make.fun/badge/gta6-01/Ipoel24/makefun-getting-started/reward.svg)](https://make.fun/bounty/gta6-01)

**Steal cars. Outrun the VBPD. Pay off the debt.**

A GTA-style 3D open-world crime game in the browser, built for the make.fun
competition **gta6-01** ("Make GTA 6"). You are Dario "Dash" Vega, a getaway
driver who owes Madame Inez **$15,000**. Clear the debt across 5 story
missions — then YOU WIN. All original: city, characters, vehicles, story,
art and sound. No network requests at runtime; all audio is synthesised
with WebAudio; three.js r187 is vendored under `game/vendor/`.

## How to play

Open `game/index.html` through a local server (file:// cannot load ES
modules):

```sh
node serve.ts        # serves the game at http://127.0.0.1:8080/
```

Or open the built output with any static server. Click, or press
Space / Enter, on the title screen to start. Progress saves to
localStorage after every mission and immediately on every side earning.

### Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Drive + walk (mouse aims on foot) |
| Mouse click | Shoot the pistol (on foot only) |
| Space | Handbrake |
| E | Enter / exit / steal a car |
| R | Reload (12-round pistol) |
| G | Garage (Marco's) |
| F | Sell a stolen car at the garage (slow, near the garage) |
| B | Mission board |
| P / Esc | Pause |
| M | Mute |
| Q | Quit to title |

### Missions (clear the $15,000 debt)

1. **First Fare** — pick up a fare at the Boardwalk Wheel, drop them on The Strip. +$500, +10 REP.
2. **Hot Wheels** — steal a Cometa GT and deliver it to Marco's garage. +$1,200, +15 REP.
3. **The Drop** — run a package to Dockside with police heat. +$2,000, +20 REP.
4. **Roadblock Run** — lose a 3-star wanted level under the helicopter. +$2,500, +25 REP.
5. **The Last Debt** — the finale across every district. +$5,000, +50 REP. **YOU WIN.**

### Garage & money

Marco's garage (G) sells upgrades and cars, all with real effects:
Engine +18% top speed per level ($900), Armour +50 car health per level
($700), Body Armour +50 player armour ($500), and the Cometa GT sports car
($3,500, the fastest car you can own). Earn cash from mission payouts,
vigilante kills ($200), and selling stolen cars at the garage (Cometa GT:
$900) — never the mission taxi, and never a car that is part of a delivery
job.

### Wanted

Stars 0–5. Stealing a car, hitting a pedestrian, shooting, or killing a
VBPD unit raises heat. Break line of sight and stay clear for ~8 s and a
star drops. At 3+ stars expect roadblocks and a helicopter. Busted costs
10% bail, wasted costs 15% hospital bill — and your car is impounded only
if you were holding one.

### Polish layer

The chase reads because the small things are wired, not just listed:

- **Helicopter** — at 3+ stars a VBPD heli orbits you at ~30 m with a
  warm spotlight cone shining down; it leaves when the heat drops to 2.
- **Crash particles** — hard impacts throw an orange burst that hangs
  for ~1–2 s. Bullet hits and downed peds burst too.
- **Bullet tracer** — every shot on foot draws a brief bright-yellow
  line from the muzzle to the impact point (~2 frames).
- **Skid marks** — handbraking above 10 m/s lays dark rear-wheel marks
  that fade over ~9 s (48-mark pool).
- **Roadblocks** — at 3+ stars two striped barriers block the roads
  ahead of you (~80 m and ~130 m) with a "ROADBLOCK AHEAD" banner
  inside 80 m, and they show on the minimap.
- **Body Armour** — the garage sells it for $500: +50 player armour,
  shown in the garage and in the HUD vitals; re-equipping armour you
  already own is free.
- **Marco's garage** — a signed forecourt at (150,125) so the place
  reads on screen, not just on the minimap.

### Day & night

A full day is 10 real minutes. Nights are dark: street lamps and windows
light up and headlights come on. The clock (day / time / phase) is
top-right; the minimap (bottom-right) shows you, police, the mission
marker, roadblocks and traffic.

## Screenshots (photo mode)

Four deterministic staged renders, listed in `shots.json`:

1. `1-chase.png` — sunset chase, hero Cometa + police + 2 stars.
2. `2-night.png` — night on foot, peds + police in the distance.
3. `3-garage.png` — morning at the garage, stolen Cometa + Inez.
4. `4-boardwalk.png` — noon boardwalk, taxi + wheel + Spire.

Each scene is staged from the page address (`?shot=<scene>&seed=<n>`) with
a seeded autopilot that genuinely drives, then rendered twice; the same
seed always gives the same frame.

## Build

```sh
node main.ts                    # writes output/dossier.json
OUTPUT_DIR=output2 node main.ts # second run: byte-identical output
```

`main.ts` (Node 22, stdlib only) copies `game/` + `screenshots/` into the
output directory and builds the dossier with the kit caps. The game itself
needs no build step.

## Verifying

```sh
node --test "tests/*.test.mjs"   # Node sim + view smoke tests (all must pass)
node main.ts                     # twice, into two output dirs: byte-identical
node <kit>/cli/makefun.mjs check --repo .   # kit check (0 failed locally)
```

Live playtests run in a headless browser against the local server
(`node serve.ts`, 127.0.0.1 only): M1 pays +$500 / +10 REP, M2 +$1,200 /
+15 REP, M3 +$2,000 / +20 REP, with zero console, page or request errors.
Screenshots are retaken via photo mode (`?shot=<scene>&seed=<n>`, scenes
and seeds in `shots.json`) and read back visually before every build.

## Layout

```
game/            playable game (static files, three.js vendored)
  index.html     entry page + importmap
  src/           sim (pure logic, Node-testable) + view (three.js) + main/input/audio/shots
  vendor/three/  three.js r187
screenshots/     4 PNGs (1280x720, ≤256 KiB each)
main.ts          build program (writes output/dossier.json)
serve.ts         local dev server (default :8080)
shots.json       screenshot name → {scene, seed}
tests/           Node sim tests + Playwright verification
```

## License

MIT — see [LICENSE](LICENSE).
