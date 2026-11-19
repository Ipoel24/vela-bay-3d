// clock.js — game clock, day phases, night factor, sun/moon directions.
import { DAY_LENGTH_SECONDS } from '../config.js';

export { DAY_LENGTH_SECONDS };

// A fresh clock starts 08:00 on day 1. minutes counts minutes since midnight.
export function makeClock() {
  return { minutes: 8 * 60, day: 1 };
}

// Advance the clock on wall time (rawDt), capped at 0.5 s per frame.
export function tickClock(clock, rawDt) {
  const dt = Math.min(rawDt, 0.5);
  clock.minutes += dt * (1440 / DAY_LENGTH_SECONDS);
  while (clock.minutes >= 1440) {
    clock.minutes -= 1440;
    clock.day += 1;
  }
  return clock;
}

function hoursOf(clock) {
  return (clock.minutes / 60) % 24;
}

// hoursMinutes(clock) — { h, m } of the game clock (h 0-23, m 0-59), with
// the minutes clamped into the day so a hand-edited clock cannot produce
// "25:73" on the HUD.
export function hoursMinutes(clock) {
  const mins = Math.max(0, Math.min(1439, Math.floor(clock.minutes || 0)));
  return { h: Math.floor(mins / 60), m: mins % 60 };
}

// clockLabel(clock) — the HUD clock line: "DAY 1 · 08:30 · MORNING". The
// phase is derived here from the clock itself, so the HUD never has to be
// handed a pre-computed phase string that can disagree with the time.
export function clockLabel(clock) {
  if (!clock) return '';
  const { h, m } = hoursMinutes(clock);
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return `DAY ${clock.day || 1} · ${hh}:${mm} · ${phaseOf(clock).toUpperCase()}`;
}

// isNight(clock) — true once the night factor is past halfway (the point
// where lamp heads flip warm and headlights come on).
export function isNight(clock) {
  return nightFactor(clock) >= 0.5;
}

// Phase of day: dawn 5-7, morning 7-11, noon 11-15, afternoon 15-17.5,
// sunset 17.5-19.5, evening 19.5-22, night otherwise.
export function phaseOf(clock) {
  const h = hoursOf(clock);
  if (h >= 5 && h < 7) return 'dawn';
  if (h >= 7 && h < 11) return 'morning';
  if (h >= 11 && h < 15) return 'noon';
  if (h >= 15 && h < 17.5) return 'afternoon';
  if (h >= 17.5 && h < 19.5) return 'sunset';
  if (h >= 19.5 && h < 22) return 'evening';
  return 'night';
}

// 0 by day (07:00-17:30), 1 at night (19:30-05:30), smooth linear ramps;
// continuous at the 5.5 / 7 / 17.5 / 19.5 boundaries.
export function nightFactor(clock) {
  const h = hoursOf(clock);
  if (h >= 7 && h < 17.5) return 0;
  if (h >= 19.5 || h < 5.5) return 1;
  if (h >= 17.5) return (h - 17.5) / 2;
  return 1 - (h - 5.5) / 1.5;
}

// Unit vector pointing from the scene toward the sun. Rises east (+x ~06:00),
// highest due south (+z) at noon, sets west (-x ~19:00); below the horizon at night.
export function sunDir(clock) {
  const h = hoursOf(clock);
  const dayFrac = ((h - 6 + 24) % 24) / 13; // 0 at 06:00, 1 at 19:00, >1 at night
  const a = dayFrac * Math.PI; // 0..PI by day, PI..~2PI at night
  const x = Math.cos(a);
  const y = Math.sin(a);
  const z = Math.sin(a);
  const len = Math.hypot(x, y, z) || 1;
  return { x: x / len, y: y / len, z: z / len };
}

// Unit vector pointing from the scene toward the moon: 35-55 deg up at night,
// continuous across midnight (azimuth sweeps east -> south -> west overnight).
export function moonDir(clock) {
  const h = hoursOf(clock);
  const nightHours = (h - 19.5 + 24) % 24; // 0 at 19:30, 10 at 05:30
  const theta = (nightHours / 10) * Math.PI; // 0..PI across the night
  const elevDeg = 35 + 20 * Math.sin(theta); // 35..55 deg while up
  const elev = (elevDeg * Math.PI) / 180;
  const x = Math.cos(theta) * Math.cos(elev);
  const y = Math.sin(theta) * Math.sin(elev); // sin(theta) < 0 by day, so the moon sits below the horizon
  const z = Math.sin(theta) * Math.cos(elev);
  // During the day theta > PI, sin(theta) < 0, so y goes below the horizon.
  const len = Math.hypot(x, y, z) || 1;
  return { x: x / len, y: y / len, z: z / len };
}
