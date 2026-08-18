(() => {
  "use strict";

  const presets = Object.freeze({
    variant1: Object.freeze({
      id: "variant1",
      label: "1 вариант",
      renderStyle: "organic-field",
      radius: 0.265,
      ringWidth: 0.155,
      innerFill: 0.68,
      waveStrength: 0.120,
      rippleStrength: 0.045,
      noiseStrength: 0.026,
      motionStrength: 0.014,
      motion: Object.freeze({
        speed: 0.32,
        lobesA: 3,
        lobesB: 5,
        maxExpansion: 0.28,
        energyGain: 0.18,
        bassGain: 0.16,
        impactGain: 0.10,
        riseGain: 0.07,
        flowEnergy: 0.38,
        flowMotion: 0.34,
        flowMids: 0.22,
        flowHeavy: 0.16,
        attackMs: 132,
        releaseMs: 650,
        impactAttackMs: 72,
        impactReleaseMs: 470,
        flowAttackMs: 240,
        flowReleaseMs: 1050,
        ringTravel: 0.18,
        fillLift: 0.20
      }),
      response: 1.08,
      brightness: 0.90,
      alpha: 0.66,
      ringCount: 1
    }),
    variant2: Object.freeze({
      id: "variant2",
      label: "2 вариант",
      radius: 0.255,
      ringWidth: 0.175,
      innerFill: 0.58,
      waveStrength: 0.155,
      rippleStrength: 0.095,
      noiseStrength: 0.032,
      motionStrength: 0.018,
      motion: Object.freeze({
        speed: 0.34,
        lobesA: 5,
        lobesB: 9,
        maxExpansion: 0.27,
        energyGain: 0.13,
        bassGain: 0.10,
        impactGain: 0.08,
        riseGain: 0.06,
        flowEnergy: 0.38,
        flowMotion: 0.34,
        flowMids: 0.20,
        flowHeavy: 0.12,
        attackMs: 190,
        releaseMs: 880,
        impactAttackMs: 105,
        impactReleaseMs: 560,
        flowAttackMs: 300,
        flowReleaseMs: 1150,
        ringTravel: 0.22,
        fillLift: 0.16
      }),
      response: 1.18,
      brightness: 1.02,
      alpha: 0.78,
      ringCount: 3
    }),
    variant3: Object.freeze({
      id: "variant3",
      label: "3 вариант",
      radius: 0.315,
      ringWidth: 0.150,
      innerFill: 0.34,
      waveStrength: 0.54,
      rippleStrength: 0.22,
      noiseStrength: 0.055,
      motionStrength: 0.034,
      motion: Object.freeze({
        speed: 0.62,
        lobesA: 8,
        lobesB: 15,
        maxExpansion: 0.32,
        energyGain: 0.14,
        bassGain: 0.13,
        impactGain: 0.14,
        riseGain: 0.09,
        flowEnergy: 0.28,
        flowMotion: 0.38,
        flowMids: 0.22,
        flowHeavy: 0.24,
        attackMs: 96,
        releaseMs: 520,
        impactAttackMs: 42,
        impactReleaseMs: 310,
        flowAttackMs: 175,
        flowReleaseMs: 720,
        ringTravel: 0.40,
        fillLift: 0.28
      }),
      response: 1.10,
      brightness: 1.08,
      alpha: 0.86,
      ringCount: 2
    })
  });

  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
  const smooth = (current, target, dtMs, attackMs, releaseMs) => {
    const tau = target > current ? attackMs : releaseMs;
    const alpha = 1 - Math.exp(-clamp(dtMs, 0, 120) / Math.max(1, tau));
    return current + (target - current) * alpha;
  };

  const createMotionState = () => ({
    variantId: "",
    pulse: 0,
    impact: 0,
    flow: 0,
    activity: 0
  });

  const stepMotion = (state, frame, preset, dtMs) => {
    const target = state || createMotionState();
    const config = preset?.motion || presets.variant1.motion;
    const energy = clamp(frame?.energy, 0, 1.4);
    const bass = clamp(frame?.bass, 0, 1.4);
    const mids = clamp(frame?.mids, 0, 1.4);
    const transient = clamp(frame?.transient, 0, 1.4);
    const kick = clamp(frame?.kick, 0, 1.4);
    const rise = clamp(frame?.rise, 0, 1.4);
    const heavy = clamp(frame?.heavy, 0, 1.4);
    const motion = clamp(frame?.motion, 0, 1.4);
    const hasSignal = frame?.active === true || frame?.mode === "bpm" || Math.max(energy, bass, transient, kick) > 0.012;
    const activityTarget = hasSignal ? 1 : 0;
    const impactTarget = hasSignal ? clamp(Math.max(transient, kick * 0.92, rise * 0.76), 0, 1) : 0;
    const pulseDrive = hasSignal ?
      energy * config.energyGain +
      bass * config.bassGain +
      impactTarget * config.impactGain +
      rise * config.riseGain : 0;
    const pulseTarget = hasSignal ?
      config.maxExpansion * Math.tanh(pulseDrive / Math.max(0.01, config.maxExpansion)) : 0;
    const flowTarget = hasSignal ? clamp(
      energy * config.flowEnergy +
      motion * config.flowMotion +
      mids * config.flowMids +
      heavy * config.flowHeavy,
      0,
      1
    ) : 0;

    target.variantId = preset?.id || "variant1";
    target.activity = smooth(target.activity, activityTarget, dtMs, 110, 520);
    target.pulse = smooth(target.pulse, pulseTarget, dtMs, config.attackMs, config.releaseMs);
    target.impact = smooth(target.impact, impactTarget, dtMs, config.impactAttackMs, config.impactReleaseMs);
    target.flow = smooth(target.flow, flowTarget, dtMs, config.flowAttackMs, config.flowReleaseMs);
    return target;
  };

  const api = Object.freeze({
    version: 2,
    defaultId: "variant1",
    list: () => Object.values(presets),
    get(id) { return presets[String(id || "").trim()] || presets.variant1; },
    createMotionState,
    stepMotion,
    presets,
    variants: presets
  });

  window.PulseColorWaveVariants = api;
  if (window.PulseColor) window.PulseColor.presets = api;
})();
