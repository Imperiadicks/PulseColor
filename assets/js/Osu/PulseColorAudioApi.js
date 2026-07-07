(() => {
  "use strict";

  if (window.PulseColorAudio?.__v1) return;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const listeners = new Set();
  const state = {
    active: false,
    mode: "raw",
    energy: 0,
    motion: 0,
    kick: 0,
    bass: 0,
    voice: 0,
    rise: 0,
    heavy: 0,
    flux: 0,
    bpm: null,
    phase: 0,
    confidence: 0,
    beat: false,
    time: performance.now()
  };

  let lastKickAt = 0;
  let lastBeatAt = 0;
  let beatFlash = 0;
  let lastPublishAt = 0;

  const windowEventsEnabled = () => window.__PULSECOLOR_AUDIO_EVENTS__ === true;

  const getMode = () => {
    const apiMode = window.PulseColorWaveMode?.getEffectiveMode?.();
    if (apiMode === "bpm" || apiMode === "raw") return apiMode;
    const cfgMode = String(window.BeatDriverConfig?.WAVE_DRIVE_MODE || "").trim().toLowerCase();
    return cfgMode === "bpm" ? "bpm" : "raw";
  };

  const audioActive = () => {
    try {
      if (typeof window.__audioOn === "function") return !!window.__audioOn();
    } catch {}
    return (window.__OSU__?.rms || 0) > 0.00001;
  };

  function snapshot() {
    const osu = window.__OSU__ || {};
    const now = performance.now();
    const bpm = window.OsuBeat?.bpm?.() || null;
    const confidence = clamp(+(window.OsuBeat?.confidence?.() ?? 0), 0, 1);
    const kickRaw = clamp(Math.max(+(osu.kickLevel || 0), +(osu.kickEnv || 0)) * 2.8, 0, 1);
    const voiceRaw = clamp(Math.max(+(osu.voiceLevel || 0), +(osu.voiceEnv || 0)) * 2.1, 0, 1);
    const energyRaw = clamp(+(osu.energySmooth ?? osu.energyRaw ?? 0) || (+(osu.rms || 0) * 3.0), 0, 1);
    const heavyRaw = clamp(+(osu.energyHeavy || 0), 0, 1);
    const riseRaw = clamp(+(osu.energyRise || 0), 0, 1);
    const fluxRaw = clamp(+(osu.fluxLevel || 0), 0, 1);
    const motionRaw = clamp(+(osu.energyMotion ?? energyRaw), 0, 1);
    const kickAlpha = kickRaw > state.kick ? 0.34 : 0.12;
    const energyAlpha = energyRaw > state.energy ? 0.20 : 0.075;

    state.active = audioActive();
    state.mode = getMode();
    state.energy += ((state.active ? energyRaw : 0) - state.energy) * energyAlpha;
    state.motion += ((state.active ? motionRaw : 0) - state.motion) * 0.16;
    state.kick += ((state.active ? kickRaw : 0) - state.kick) * kickAlpha;
    state.bass = state.kick;
    state.voice += ((state.active ? voiceRaw : 0) - state.voice) * 0.14;
    state.rise += ((state.active ? riseRaw : 0) - state.rise) * 0.20;
    state.heavy += ((state.active ? heavyRaw : 0) - state.heavy) * 0.18;
    state.flux += ((state.active ? fluxRaw : 0) - state.flux) * 0.18;
    state.bpm = bpm;
    state.phase = clamp(+(window.OsuBeat?.phase?.() ?? 0), 0, 1);
    state.confidence = confidence;
    state.beat = now - lastBeatAt < 160 || beatFlash > 0.02;
    state.time = now;
    beatFlash *= 0.82;

    if (windowEventsEnabled() && state.active && state.kick > 0.34 && now - lastKickAt > 110) {
      lastKickAt = now;
      window.dispatchEvent(new CustomEvent("pulsecolor:kick", { detail: { ...state } }));
    }

    return { ...state };
  }

  const api = {
    __v1: true,
    version: "1.0.0",
    getState: () => snapshot(),
    subscribe(fn) {
      if (typeof fn !== "function") return () => {};
      listeners.add(fn);
      try { fn(snapshot()); } catch {}
      return () => listeners.delete(fn);
    }
  };

  window.PulseColorAudio = Object.assign(window.PulseColorAudio || {}, api);
  window.__PULSECOLOR_AUDIO_STATE__ = state;

  window.addEventListener("osu-beat", () => {
    lastBeatAt = performance.now();
    beatFlash = 1;
    if (windowEventsEnabled()) {
      window.dispatchEvent(new CustomEvent("pulsecolor:beat", { detail: { ...state } }));
    }
  });

  function frame() {
    if (!listeners.size && !windowEventsEnabled()) {
      setTimeout(frame, 250);
      return;
    }

    const next = snapshot();
    const now = performance.now();

    if (now - lastPublishAt >= 100) {
      lastPublishAt = now;
      if (windowEventsEnabled()) {
        window.dispatchEvent(new CustomEvent("pulsecolor:audio", { detail: next }));
      }
      for (const fn of listeners) {
        try { fn(next); } catch {}
      }
    }

    setTimeout(frame, 100);
  }

  setTimeout(frame, 100);
})();
