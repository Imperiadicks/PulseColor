/* ========================== PulseColor wave visual variants ========================== */
(() => {
  "use strict";

  const variant1 = Object.freeze({
    id: "variant1",
    label: "1 вариант",

    internalTuning: Object.freeze({
      KICK_IMPULSE_BASE: 0.074,
      OUTER_MIN_SCALE: 1.00,
      OUTER_MAX_SCALE: 1.24,
      INNER_MIN_SCALE: 1.01,
      INNER_MAX_SCALE: 1.34
    }),

    scale: Object.freeze({
      useConfig: false,
      outerMin: Object.freeze({ fallback: 1.00, min: 0.96, max: 1.06 }),
      outerMax: Object.freeze({ fallback: 1.24, minGap: 0.075, max: 1.30 }),
      innerMin: Object.freeze({ fallback: 1.01, min: 0.98, max: 1.10 }),
      innerMax: Object.freeze({ fallback: 1.34, minGap: 0.095, max: 1.42 })
    }),

    pulse: Object.freeze({
      outerKickBase: 1.34,
      outerHeavyGain: 0.54,
      outerRiseGain: 0.46,
      outerSoftness: 0.96,
      outerMicroGain: 1.48,
      outerEnergyPulseGain: 2.05,

      innerVoiceGain: 1.08,
      innerVoiceEnvGain: 1.02,
      innerEnergyGain: 0.058,
      innerSoftness: 0.90,
      innerMicroGain: 0.78,
      innerRiseGain: 0.040
    }),

    motion: Object.freeze({
      strength: 15,
      speed: 0.36,
      minMotion: 0,
      threshold: 0.035,
      energyGain: 1.95,
      heavyGain: 0.36,
      riseGain: 0.72,
      smoothTau: 0.30,
      radiusMin: 0.035,
      radiusMax: 1.22,
      speedMin: 0.18,
      speedMax: 1.05,
      aimTauSlow: 1.72,
      aimTauFast: 0.74,
      springMin: 0.72,
      springMax: 2.15,
      dampingCalm: 2.00,
      dampingActive: 1.44,
      velocityTauSlow: 0.86,
      velocityTauFast: 0.44,
      breathMin: 0.010,
      breathMax: 0.120,
      voiceKickGain: 1.10,
      voiceKickLerp: 0.28,
      strongBeatGain: 1.10,
      strongBeatLerp: 0.30
    }),

    outerLayer: Object.freeze({
      opacity: 0.88,
      blurPx: 14,
      darkBackground: `
        radial-gradient(circle at 50% 55%,
          color-mix(in hsl, var(--ym-background-color-secondary-enabled-blur, rgba(255,255,255,.10)) 8%, transparent) 0%,
          color-mix(in hsl, var(--ym-background-color-secondary-enabled-blur, rgba(255,255,255,.10)) 7%, transparent) 16%,
          color-mix(in hsl, var(--ym-background-color-secondary-enabled-blur, rgba(255,255,255,.16)) 18%, transparent) 27%,
          color-mix(in hsl, var(--ym-background-color-secondary-enabled-blur, rgba(255,255,255,.18)) 44%, transparent) 39%,
          color-mix(in hsl, var(--ym-background-color-secondary-enabled-blur, rgba(255,255,255,.14)) 20%, transparent) 50%,
          transparent 66%,
          transparent 100%)`,
      lightBackground: `
        radial-gradient(circle at 50% 55%,
          color-mix(in hsl, var(--ym-background-color-secondary-enabled-blur, rgba(0,0,0,.060)) 7%, transparent) 0%,
          color-mix(in hsl, var(--ym-background-color-secondary-enabled-blur, rgba(0,0,0,.060)) 6%, transparent) 16%,
          color-mix(in hsl, var(--ym-background-color-secondary-enabled-blur, rgba(0,0,0,.070)) 16%, transparent) 27%,
          color-mix(in hsl, var(--ym-background-color-secondary-enabled-blur, rgba(0,0,0,.070)) 38%, transparent) 39%,
          color-mix(in hsl, var(--ym-background-color-secondary-enabled-blur, rgba(0,0,0,.055)) 18%, transparent) 50%,
          transparent 66%,
          transparent 100%)`
    }),

    centerRing: Object.freeze({
      minIntervalFloor: 620,
      normalInterval: 980,
      strongInterval: 720,
      spawn: Object.freeze({
        rawSlow: 2200,
        rawFast: 520,
        riseGateRaw: 0.145,
        stepRaw: 0.135,
        holdRaw: 0.36
      }),
      startScale: Object.freeze({ base: 0.56, strength: 0.036, min: 0.56, max: 0.70 }),
      midScale: Object.freeze({ base: 0.98, strength: 0.105, heavy: 0.050, min: 0.96, max: 1.20 }),
      endScale: Object.freeze({ base: 1.32, strength: 0.180, heavy: 0.080, min: 1.28, max: 1.58 }),
      peakAlpha: Object.freeze({ base: 0.20, strength: 0.16, heavy: 0.070, strong: 0.040, min: 0.18, max: 0.46 }),
      blur: Object.freeze({ start: 16, mid: 22, end: 36 }),
      background: `
        radial-gradient(circle at 50% 55%,
          color-mix(in hsl, var(--ym-background-color-secondary-enabled-blur, rgba(255,255,255,.12)) 10%, transparent) 0%,
          color-mix(in hsl, var(--ym-background-color-secondary-enabled-blur, rgba(255,255,255,.12)) 9%, transparent) 18%,
          color-mix(in hsl, var(--ym-background-color-secondary-enabled-blur, rgba(255,255,255,.18)) 20%, transparent) 28%,
          color-mix(in hsl, var(--ym-background-color-secondary-enabled-blur, rgba(255,255,255,.18)) 48%, transparent) 38%,
          color-mix(in hsl, var(--ym-background-color-secondary-enabled-blur, rgba(255,255,255,.14)) 22%, transparent) 48%,
          transparent 62%,
          transparent 100%)`
    }),

    render: Object.freeze({
      brightBase: 1.06,
      brightScaleLift: 0.30,
      brightEnergy: 0.045,
      brightBass: 0.080,
      inactiveBright: 1.02,
      brightnessMultiplier: 1.04,
      brightnessMultiplierMax: 1.22,
      brightMax: 1.48,

      alphaBase: 0.105,
      alphaRange: 0.105,
      alphaMin: 0.095,
      alphaMax: 0.220,
      inactiveAlpha: 0.070,

      energyLift: 0.058,
      bassLift: 0.090
    })
  });

  const variant2 = Object.freeze({
    id: "variant2",
    label: "2 \u0432\u0430\u0440\u0438\u0430\u043d\u0442",

    internalTuning: Object.freeze({
      KICK_IMPULSE_BASE: 0.014,
      OUTER_MIN_SCALE: 0.94,
      OUTER_MAX_SCALE: 1.54,
      INNER_MIN_SCALE: 0.95,
      INNER_MAX_SCALE: 1.34
    }),

    rootLayer: Object.freeze({
      left: "0",
      top: "0",
      width: "100vw",
      height: "100vh",
      transform: "none",
      overflow: "hidden"
    }),

    layerBounds: Object.freeze({
      inset: "0",
      left: "0",
      right: "0",
      top: "0",
      bottom: "0",
      width: "100%",
      height: "100%"
    }),

    scale: Object.freeze({
      mode: "rawClamp",
      useConfig: false,
      outerMin: Object.freeze({ fallback: 0.94, min: 0.86, max: 1.10 }),
      outerMax: Object.freeze({ fallback: 1.54, minGap: 0.08, max: 1.54 }),
      innerMin: Object.freeze({ fallback: 0.95, min: 0.86, max: 1.10 }),
      innerMax: Object.freeze({ fallback: 1.34, minGap: 0.08, max: 1.34 })
    }),

    pulse: Object.freeze({
      breathAmplitude: 0.004,
      rmsMultiplier: 2.15,
      rmsOffset: 0.030,
      microRms: 0.0024,
      microEnergy: 0.0018,
      microBase: 0.50,
      microMotion: 0.26,
      energyPulseEnergy: 0.0085,
      energyPulseHeavy: 0.0160,
      energyPulseRise: 0.042,

      unifiedKickGain: 0.60,
      unifiedVoiceGain: 0.60,

      outerKickBase: 0.90,
      outerHeavyGain: 0.34,
      outerRiseGain: 0.28,
      outerSoftness: 0.78,
      outerMicroGain: 1.08,
      outerEnergyPulseGain: 1.14,

      innerVoiceGain: 0.70,
      innerVoiceEnvGain: 0.72,
      innerEnergyGain: 0.022,
      innerSoftness: 0.76,
      innerMicroGain: 0.36,
      innerRiseGain: 0.014
    }),

    motion: Object.freeze({
      strength: 5.8,
      speed: 0.15,
      minMotion: 0,
      threshold: 0.075,
      energyGain: 1.08,
      heavyGain: 0.18,
      riseGain: 0.16,
      smoothTau: 0.92,
      radiusMin: 0.018,
      radiusMax: 0.36,
      speedMin: 0.08,
      speedMax: 0.34,
      aimTauSlow: 5.20,
      aimTauFast: 2.90,
      springMin: 0.20,
      springMax: 0.52,
      dampingCalm: 3.35,
      dampingActive: 2.82,
      velocityTauSlow: 2.10,
      velocityTauFast: 1.42,
      breathMin: 0.006,
      breathMax: 0.030,
      voiceKickGain: 0.12,
      voiceKickLerp: 0.08,
      strongBeatGain: 0.18,
      strongBeatLerp: 0.08
    }),

    outerLayer: Object.freeze({
      opacity: 0.98,
      blurPx: 0,
      darkBackground: `
        radial-gradient(circle at 50% 50%,
          color-mix(in hsl, var(--ym-background-color-secondary-enabled-blur, rgba(255,255,255,.14)) 42%, transparent) 0%,
          color-mix(in hsl, var(--ym-background-color-secondary-enabled-blur, rgba(255,255,255,.11)) 22%, transparent) 31%,
          transparent 64%)`,
      lightBackground: `
        radial-gradient(circle at 50% 50%,
          color-mix(in hsl, var(--ym-background-color-secondary-enabled-blur, rgba(0,0,0,.055)) 22%, transparent) 0%,
          color-mix(in hsl, var(--ym-background-color-secondary-enabled-blur, rgba(0,0,0,.045)) 9%, transparent) 31%,
          transparent 64%)`
    }),

    centerRing: Object.freeze({
      duration: Object.freeze({ from: 1840, to: 700, min: 680, max: 2000 }),
      attack: Object.freeze({ from: 0.44, to: 0.18 }),
      followMotion: false,
      minIntervalFloor: 980,
      normalInterval: 1650,
      strongInterval: 1250,
      spawn: Object.freeze({
        rawSlow: 2600,
        rawFast: 900,
        riseGateRaw: 0.205,
        stepRaw: 0.155,
        holdRaw: 0.40
      }),
      inset: "22%",
      borderRadius: "50%",
      startScale: Object.freeze({ base: 0.040, strength: 0.040, min: 0.040, max: 0.13 }),
      midScale: Object.freeze({ base: 0.21, strength: 0.16, heavy: 0.070, min: 0.19, max: 0.50 }),
      endScale: Object.freeze({ base: 0.80, strength: 0.28, heavy: 0.09, min: 0.72, max: 1.22 }),
      peakAlpha: Object.freeze({ base: 0.050, strength: 0.090, heavy: 0.038, strong: 0.020, min: 0.044, max: 0.198 }),
      blur: Object.freeze({ start: 24, mid: 12, midStrong: 9, end: 18, endStrong: 15 }),
      background: `
        radial-gradient(circle at 50% 50%,
          color-mix(in hsl, var(--ym-background-color-secondary-enabled-blur, rgba(255,255,255,.20)) 50%, transparent) 0%,
          color-mix(in hsl, var(--ym-background-color-secondary-enabled-blur, rgba(255,255,255,.17)) 24%, transparent) 24%,
          color-mix(in hsl, var(--ym-background-color-secondary-enabled-blur, rgba(255,255,255,.13)) 12%, transparent) 48%,
          transparent 76%)`
    }),

    render: Object.freeze({
      brightBase: 1.04,
      brightScaleLift: 0.56,
      brightEnergy: 0.060,
      brightBass: 0.175,
      inactiveBright: 1.04,
      brightnessMultiplier: 1.06,
      brightnessMultiplierMax: 1.34,
      brightMax: 1.82,

      alphaBase: 0.058,
      alphaRange: 0.120,
      alphaMin: 0.056,
      alphaMax: 0.184,
      inactiveAlpha: 0.050,

      energyLift: 0.018,
      bassLift: 0.032
    })
  });

  const variant3 = Object.freeze({
    id: "variant3",
    label: "3 \u0432\u0430\u0440\u0438\u0430\u043d\u0442",
    renderer: "webgl",

    internalTuning: Object.freeze({
      KICK_IMPULSE_BASE: 0.030,
      OUTER_MIN_SCALE: 1.00,
      OUTER_MAX_SCALE: 1.22,
      INNER_MIN_SCALE: 1.00,
      INNER_MAX_SCALE: 1.18
    }),

    rootLayer: Object.freeze({
      left: "0",
      top: "0",
      width: "100vw",
      height: "100vh",
      transform: "none",
      overflow: "hidden"
    }),

    layerBounds: Object.freeze({
      inset: "0",
      left: "0",
      right: "0",
      top: "0",
      bottom: "0",
      width: "100%",
      height: "100%"
    }),

    scale: Object.freeze({
      outerMin: Object.freeze({ fallback: 1.00, min: 0.96, max: 1.06 }),
      outerMax: Object.freeze({ fallback: 1.22, minGap: 0.055, max: 1.28 }),
      innerMin: Object.freeze({ fallback: 1.00, min: 0.96, max: 1.06 }),
      innerMax: Object.freeze({ fallback: 1.18, minGap: 0.055, max: 1.24 })
    }),

    pulse: Object.freeze({
      breathAmplitude: 0.006,
      rmsMultiplier: 2.05,
      rmsOffset: 0.026,
      microRms: 0.0036,
      microEnergy: 0.0028,
      microBase: 0.54,
      microMotion: 0.30,
      energyPulseEnergy: 0.010,
      energyPulseHeavy: 0.018,
      energyPulseRise: 0.044,

      outerKickBase: 0.98,
      outerHeavyGain: 0.36,
      outerRiseGain: 0.30,
      outerSoftness: 0.92,
      outerMicroGain: 1.18,
      outerEnergyPulseGain: 1.42,

      innerVoiceGain: 0.68,
      innerVoiceEnvGain: 0.70,
      innerEnergyGain: 0.032,
      innerSoftness: 0.86,
      innerMicroGain: 0.46,
      innerRiseGain: 0.018
    }),

    motion: Object.freeze({
      strength: 11,
      speed: 0.34,
      minMotion: 0.085
    }),

    outerLayer: Object.freeze({
      opacity: 0.76,
      blurPx: 22,
      darkBackground: `
        radial-gradient(circle at 50% 55%,
          color-mix(in hsl, var(--ym-background-color-secondary-enabled-blur, rgba(255,255,255,.14)) 24%, transparent) 0%,
          color-mix(in hsl, var(--ym-background-color-secondary-enabled-blur, rgba(255,255,255,.12)) 18%, transparent) 27%,
          color-mix(in hsl, var(--ym-background-color-secondary-enabled-blur, rgba(255,255,255,.10)) 10%, transparent) 47%,
          transparent 70%)`,
      lightBackground: `
        radial-gradient(circle at 50% 55%,
          color-mix(in hsl, var(--ym-background-color-secondary-enabled-blur, rgba(0,0,0,.075)) 18%, transparent) 0%,
          color-mix(in hsl, var(--ym-background-color-secondary-enabled-blur, rgba(0,0,0,.060)) 12%, transparent) 34%,
          transparent 72%)`
    }),

    centerRing: Object.freeze({
      enabled: false
    }),

    render: Object.freeze({
      brightBase: 1.16,
      brightScaleLift: 0.24,
      brightEnergy: 0.065,
      brightBass: 0.120,
      inactiveBright: 1.06,
      brightnessMultiplier: 1.12,
      brightnessMultiplierMax: 1.34,
      brightMax: 1.64,

      alphaBase: 0.120,
      alphaRange: 0.160,
      alphaMin: 0.095,
      alphaMax: 0.300,
      inactiveAlpha: 0.055,

      energyLift: 0.028,
      bassLift: 0.045
    }),

    shader: Object.freeze({
      opacity: 1.00,
      radius: 0.315,
      radiusLift: 0.070,
      ringWidth: 0.150,
      innerFill: 0.34,
      waveStrength: 0.54,
      rippleStrength: 0.22,
      noiseStrength: 0.055,
      edgeSoftness: 1.08,
      speed: 0.62,
      motionWarp: 0.34
    })
  });

  const variants = Object.freeze({
    variant1,
    variant2,
    variant3
  });

  const api = {
    defaultId: "variant1",
    list: () => Object.values(variants),
    get(id) {
      const key = String(id || "").trim();
      return variants[key] || variants.variant1;
    }
  };

  window.PulseColorWaveVariants = Object.assign(window.PulseColorWaveVariants || {}, api, { variants });
})();
