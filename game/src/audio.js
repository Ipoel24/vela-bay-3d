// audio.js — WebAudio synth for VELA BAY 3D: engine hum, skid, crash, siren, gunshot, cash chime, chiptune + two radio stations. No audio files.

// makeAudio() — returns the audio controls:
//   unlock(): create/resume the AudioContext (call from a user gesture)
//   isUnlocked(): true once a gesture has enabled sound
//   silence(): siren off + engine to zero + music/radio stopped (pause/title)
//   setEngine(speed, topSpeed): engine hum pitched to speed (0 = silent)
//   setSiren(on, distance): two-tone siren, quieter with distance
//   skid(): short tyre-skid noise (internally throttled)
//   crash(intensity): low thud, scaled 0..1
//   gunshot(): pistol crack
//   cash(): cash-register chime on money earned
//   startMusic()/stopMusic(): short original chiptune loop (background)
//   startRadio(station)/stopRadio(): two original radio stations ('VELA FM', 'NEON 101')
//   toggleMute()/setMuted(m)/isMuted(): mute control (M key + visible toggle)
// Every method is a no-op until unlock() runs and whenever the context is
// unavailable, so the game never crashes on a silent machine.
export function makeAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = null;
  let sirenHigh = false;
  let musicTimer = null;
  let musicStep = 0;
  let radioTimer = null;
  let radioStep = 0;
  let radioStation = null;
  let lastSkid = 0;
  let muted = false;
  // unlocked — true only after unlock() runs from a user gesture. Every
  // sound method is a no-op until then: creating an AudioContext before
  // any gesture trips autoplay policy and can leave a suspended context
  // buzzing on machines with no sound device.
  let unlocked = false;

  // ensure() — lazily build the context + master + engine/siren chains.
  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.9;
      master.connect(ctx.destination);

      // Engine: sawtooth through a lowpass, gain driven by setEngine().
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();

      // Siren: square wave alternating 700/950 Hz (two-tone), gain by distance.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'square';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
    } catch {
      ctx = null;
    }
    return ctx;
  }

  // unlock() — create/resume the context from a user gesture.
  function unlock() {
    const c = ensure();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
    unlocked = !!c;
    return unlocked;
  }

  // isUnlocked() — true once a user gesture has enabled sound.
  function isUnlocked() {
    return unlocked;
  }

  // silence() — stop everything audible at once: siren off, engine hum to
  // zero, music + radio loops stopped. One call for pause / title / quit
  // instead of three separate calls that can drift apart.
  function silence() {
    setSiren(false);
    setEngine(0, 40);
    stopLoops();
  }

  // setEngine(speed, topSpeed) — hum pitched to speed; silent at speed 0
  // (call setEngine(0, 40) when on foot or paused — L4 fix: the hum must
  // never drone through the pause menu).
  function setEngine(speed, topSpeed) {
    if (!unlocked) return;
    if (!ensure()) return;
    const frac = topSpeed > 0 ? Math.max(0, Math.min(1, speed / topSpeed)) : 0;
    const t = ctx.currentTime;
    engineOsc.frequency.setTargetAtTime(50 + frac * 170, t, 0.08);
    engineGain.gain.setTargetAtTime(speed > 0.2 ? 0.035 + frac * 0.05 : 0, t, 0.1);
  }

  // setSiren(on, distance) — two-tone siren; gain falls off with distance
  // (quiet by ~120 m). Call setSiren(false) on pause/title (L4 fix).
  function setSiren(on, distance = 40) {
    if (!unlocked) return;
    if (!ensure()) return;
    if (!on) {
      if (sirenTimer) { clearInterval(sirenTimer); sirenTimer = null; }
      sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      return;
    }
    const d = Number.isFinite(distance) ? Math.max(0, distance) : 40;
    const g = Math.max(0, 0.11 * (1 - d / 130));
    sirenGain.gain.setTargetAtTime(g, ctx.currentTime, 0.2);
    if (!sirenTimer) {
      sirenTimer = setInterval(() => {
        if (!sirenOsc) return;
        sirenHigh = !sirenHigh;
        sirenOsc.frequency.value = sirenHigh ? 950 : 700;
      }, 420);
    }
  }

  // noiseBurst(dur, filterType, freq, gain) — one-shot filtered noise helper.
  function noiseBurst(dur, filterType, freq, gain) {
    if (!unlocked) return;
    if (!ensure()) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start();
  }

  // tone(freq, dur, type, gain, when) — one-shot oscillator note helper.
  function tone(freq, dur, type, gain, when = 0) {
    if (!unlocked) return;
    if (!ensure()) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  // skid() — short band-passed tyre squeal (at most once per 180 ms).
  function skid() {
    if (!unlocked) return;
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    if (now - lastSkid < 180) return;
    lastSkid = now;
    noiseBurst(0.28, 'bandpass', 900, 0.16);
  }

  // crash(intensity) — low thud: noise burst + a sine drop, scaled 0..1.
  function crash(intensity = 0.5) {
    if (!unlocked) return;
    if (!ensure()) return;
    const k = Math.max(0, Math.min(1, intensity));
    noiseBurst(0.25, 'lowpass', 300, 0.25 + 0.45 * k);
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(130, t0);
    osc.frequency.exponentialRampToValueAtTime(38, t0 + 0.22);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3 + 0.4 * k, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.25);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + 0.3);
  }

  // gunshot() — pistol crack: sharp noise burst + a square blip.
  function gunshot() {
    noiseBurst(0.12, 'highpass', 1200, 0.5);
    tone(180, 0.08, 'square', 0.22);
  }

  // cash() — cash-register chime: two bright sine notes, E6 then B6.
  function cash() {
    tone(1318.5, 0.12, 'sine', 0.22);
    tone(1975.5, 0.22, 'sine', 0.22, 0.09);
  }

  // Melody loops: original step sequences [midi, steps] on a square wave.
  // The chiptune is a bright 16-step loop; the two radio stations are
  // longer, slower original melodies (VELA FM upbeat, NEON 101 minor).
  const CHIPTUNE = [
    [76, 1], [79, 1], [81, 1], [79, 1], [76, 1], [72, 1], [74, 1], [76, 1],
    [77, 1], [81, 1], [79, 1], [77, 1], [76, 2], [74, 1], [72, 1], [0, 0],
  ];
  const CHIP_BASS = [48, 0, 55, 0, 48, 0, 53, 0, 45, 0, 52, 0, 48, 0, 55, 0];
  const RADIO = {
    'VELA FM': {
      stepMs: 170,
      seq: [69, 72, 76, 79, 76, 72, 69, 67, 69, 72, 76, 81, 79, 76, 74, 72, 69, 0, 72, 0, 76, 0, 74, 72],
    },
    'NEON 101': {
      stepMs: 230,
      seq: [69, 0, 72, 0, 75, 0, 72, 0, 70, 0, 74, 0, 77, 0, 75, 0, 74, 0, 72, 0, 70, 0, 67, 0],
    },
  };

  function midiToFreq(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
  }

  // startLoop(kind) — shared step sequencer for music/radio.
  function startLoop(kind) {
    stopLoops();
    if (!unlocked) return;
    if (!ensure()) return;
    if (kind === 'music') {
      musicStep = 0;
      musicTimer = setInterval(() => {
        const [note, len] = CHIPTUNE[musicStep % CHIPTUNE.length];
        const bass = CHIP_BASS[musicStep % CHIP_BASS.length];
        if (note) tone(midiToFreq(note), 0.11 * (len || 1), 'square', 0.055);
        if (bass) tone(midiToFreq(bass), 0.12, 'triangle', 0.07);
        musicStep++;
      }, 135);
    } else {
      const station = RADIO[kind];
      if (!station) return;
      radioStation = kind;
      radioStep = 0;
      radioTimer = setInterval(() => {
        const note = station.seq[radioStep % station.seq.length];
        if (note) tone(midiToFreq(note), 0.22, 'triangle', 0.09);
        if (radioStep % 4 === 0) tone(midiToFreq(note ? note - 12 : 57), 0.3, 'sine', 0.05);
        radioStep++;
      }, station.stepMs);
    }
  }

  function stopLoops() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    if (radioTimer) { clearInterval(radioTimer); radioTimer = null; }
    radioStation = null;
  }

  // startMusic() — background chiptune loop (stops any radio first).
  function startMusic() {
    startLoop('music');
  }

  // stopMusic() — stop the background chiptune loop.
  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  // startRadio(station) — start a radio station ('VELA FM' | 'NEON 101');
  // the radio replaces the chiptune while driving.
  function startRadio(station) {
    const name = RADIO[station] ? station : 'VELA FM';
    stopMusic();
    startLoop(name);
  }

  // stopRadio() — stop the radio (called on the title screen, on exit and
  // on pause); the caller restarts the chiptune when play resumes.
  function stopRadio() {
    if (radioTimer) { clearInterval(radioTimer); radioTimer = null; }
    radioStation = null;
  }

  // setMuted(m)/toggleMute()/isMuted() — mute control (M key + visible toggle).
  function setMuted(m) {
    muted = !!m;
    if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.05);
    return muted;
  }
  function toggleMute() {
    return setMuted(!muted);
  }
  function isMuted() {
    return muted;
  }

  // currentRadio() — name of the playing station, or null.
  function currentRadio() {
    return radioStation;
  }

  return {
    unlock, isUnlocked, silence, setEngine, setSiren, skid, crash, gunshot, cash,
    startMusic, stopMusic, startRadio, stopRadio, currentRadio,
    setMuted, toggleMute, isMuted,
  };
}
