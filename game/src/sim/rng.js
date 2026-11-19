// rng.js — seeded RNG (mulberry32) for deterministic world generation and sim.
export function makeRng(seed) {
  let a = seed >>> 0;
  return {
    // next float in [0, 1)
    next() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    // random integer in [min, max] inclusive
    int(min, max) {
      return min + Math.floor(this.next() * (max - min + 1));
    },
    // random element of a non-empty array
    pick(arr) {
      return arr[Math.floor(this.next() * arr.length)];
    },
    // random float in [min, max)
    range(min, max) {
      return min + this.next() * (max - min);
    },
    // random element of `arr` that satisfies `pred`, bounded to `maxTries`
    // draws; returns null when no draw matched (the caller picks the
    // fallback). Keeps "keep sampling, fall back to the best seen" rules
    // (police spawns, mission-car spawns) from re-implementing the loop.
    pickFiltered(arr, pred, maxTries = 100) {
      if (!Array.isArray(arr) || arr.length === 0) return null;
      const tries = Math.max(1, Math.floor(maxTries) || 1);
      for (let i = 0; i < tries; i++) {
        const item = arr[Math.floor(this.next() * arr.length)];
        if (pred(item)) return item;
      }
      return null;
    },
    // Fisher-Yates shuffle: a NEW array with the same elements in a
    // seeded-random order (the input array is never mutated).
    shuffle(arr) {
      const out = Array.isArray(arr) ? arr.slice() : [];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(this.next() * (i + 1));
        const t = out[i];
        out[i] = out[j];
        out[j] = t;
      }
      return out;
    },
  };
}
