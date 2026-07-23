(() => {
  "use strict";

  const PC = window.PulseColor;
  if (!PC?.runtime || !PC.audio || !PC.engine) throw new Error("PulseColor runtime modules are not initialized");
  if (window.__PULSECOLOR_MAIN_V2__) return;
  window.__PULSECOLOR_MAIN_V2__ = true;

  const legacyAudioState = window.__OSU__ = window.__OSU__ || {};
  const legacyFields = {
    rms: "rms",
    energyRaw: "energy",
    energySmooth: "energy",
    energyMotion: "motion",
    energyHeavy: "heavy",
    energyRise: "rise",
    fluxLevel: "flux",
    kickLevel: "kick",
    kickEnv: "kick",
    voiceLevel: "voice",
    voiceEnv: "voice"
  };
  for (const [legacyKey, frameKey] of Object.entries(legacyFields)) {
    Object.defineProperty(legacyAudioState, legacyKey, {
      configurable: true,
      enumerable: true,
      get: () => PC.audio.getFrame()[frameKey]
    });
  }
  window.PulseColorWaveEnergy = Object.assign(window.PulseColorWaveEnergy || {}, {
    getState: () => {
      const frame = PC.audio.getFrame();
      return {
        energy: frame.energy,
        motion: frame.motion,
        flow: frame.mids,
        heavy: frame.heavy,
        rise: frame.rise,
        ring: frame.transient
      };
    },
    update: () => window.PulseColorWaveEnergy.getState()
  });

  window.BeatDriver = Object.assign(window.BeatDriver || {}, {
    scales: () => {
      const frame = PC.audio.getFrame();
      const preset = window.PulseColorWaveVariants.get(PC.settings.getWave().WAVE_VARIANT);
      const pulse = frame.energy * 0.10 + frame.bass * 0.14 + frame.transient * 0.05;
      return {
        outer: 1 + pulse * preset.response,
        inner: 1 + pulse * 0.78 * preset.response,
        active: frame.active
      };
    }
  });

  window.showLog = window.showLog || ((message) => PC.logger.info("ui", { message }));

  let serviceRunning = false;
  const handleBeforeUnload = () => PC.runtime.stop();
  const startService = () => {
    if (serviceRunning) return;
    serviceRunning = true;
    window.addEventListener("beforeunload", handleBeforeUnload, { once: true });
  };
  const stopService = () => {
    if (!serviceRunning) return;
    serviceRunning = false;
    window.removeEventListener("beforeunload", handleBeforeUnload);
  };
  if (typeof PC.runtime.registerService === "function") {
    PC.runtime.registerService("main-bootstrap", { start: startService, stop: stopService });
  } else {
    startService();
  }

  PC.logger.info("main-ready", {
    preset: PC.settings.getWave().WAVE_VARIANT,
    mode: PC.settings.getWave().WAVE_DRIVE_MODE,
    audioApi: window.PulseColorAudioAPI?.version || 0
  });
})();
