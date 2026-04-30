/* ========================== PulseColor fixed smooth energy tuning ========================== */
(() => {
  const FIXED = Object.freeze({
    DECAY_MS: 220,
    DECAY_MS_VOICE: 260,
    KICK_COOLDOWN_MS: 70,
    VOICE_COOLDOWN_MS: 85,
    VOICE_IMPULSE_GAIN: 1.65,
    VOICE_ENVELOPE_GAIN: 1.90
  });

  function applyFixedTuning() {
    const cfg = (window.BeatDriverConfig && typeof window.BeatDriverConfig === 'object')
      ? window.BeatDriverConfig
      : (window.BeatDriverConfig = {});

    for (const k in FIXED) cfg[k] = FIXED[k];
    window.PulseColorFixedSmoothEnergyTuning = FIXED;
    return cfg;
  }

  applyFixedTuning();
  window.addEventListener('pulsecolor:beatDriverConfigChanged', applyFixedTuning);
})();

/* ========================== Вспомогательно: true, если реально есть звук ========================== */
function __audioOn() {
  const nowTs = performance.now();
  const cfg = window.BeatDriverConfig || {};
  const rms = +(window.__OSU__?.rms || 0);
  const kickEnv = +(window.__OSU__?.kickEnv || 0);
  const voiceEnv = +(window.__OSU__?.voiceEnv || 0);
  const thr = Math.max(1e-7, +(cfg.TH_RMS || 0.000001));
  const holdMs = Math.max(60, +(cfg.AUDIO_HOLD_MS || 180));

  const audible = (
    rms > thr * 1.35 ||
    kickEnv > 0.082 ||
    voiceEnv > 0.050
  );

  if (audible) {
    __audioOn.__lastOnTs = nowTs;
    return true;
  }

  return (nowTs - (__audioOn.__lastOnTs || 0)) < holdMs;
}


function __pcwIsUsableAudio(audio) {
  try {
    if (!audio || !audio.isConnected) return false;
    if (String(audio.tagName || '').toLowerCase() !== 'audio') return false;
    if (audio.muted || Number(audio.volume || 0) <= 0) return false;
    if (audio.ended || audio.paused) return false;
    if ((audio.playbackRate || 1) === 0) return false;
    if (audio.readyState < 2 && Number(audio.currentTime || 0) <= 0) return false;
    return true;
  } catch {
    return false;
  }
}

function __pcwGetActiveAudio() {
  try {
    const tapAudio = window.PulseColorAudioTap?.getActiveMedia?.();
    if (__pcwIsUsableAudio(tapAudio)) return tapAudio;
  } catch { }

  try {
    const cached = __mediaPlaying?.__audio || null;
    if (__pcwIsUsableAudio(cached)) return cached;
  } catch { }

  try {
    const audios = Array.from(document.querySelectorAll('audio'));
    return audios.find(__pcwIsUsableAudio) || audios.find(a => a && a.isConnected && !a.ended && Number(a.currentTime || 0) > 0) || null;
  } catch {
    return null;
  }
}


function __mediaPlaying() {
  const nowTs = performance.now();
  const cached = __mediaPlaying.__cache;

  if (cached && (nowTs - cached.ts) < 350) return cached.value;

  let audioPlaying = false;
  let audio = null;

  try {
    audio = __pcwGetActiveAudio();
    __mediaPlaying.__audio = audio || null;
    audioPlaying = __pcwIsUsableAudio(audio);
  } catch { }

  const mediaSessionPlaying = (() => {
    try {
      return navigator?.mediaSession?.playbackState === 'playing';
    } catch {
      return false;
    }
  })();

  const rmsPlaying = (() => {
    try {
      return (window.__OSU__?.rms || 0) > ((window.BeatDriverConfig?.TH_RMS || 0.000001) * 1.1);
    } catch {
      return false;
    }
  })();

  const playing = audioPlaying || mediaSessionPlaying || rmsPlaying;

  if (playing) {
    __mediaPlaying.__lastOnTs = nowTs;
    __mediaPlaying.__cache = { ts: nowTs, value: true };
    return true;
  }

  const value = (nowTs - (__mediaPlaying.__lastOnTs || 0)) < 420;
  __mediaPlaying.__cache = { ts: nowTs, value };
  return value;
}




function __pcwSettingsOpen() {
  try {
    return !!window.__PCW_SETTINGS_OPEN__ || !!document.getElementById('pulsecolor-wave-settings-portal');
  } catch {
    return false;
  }
}

/* ========================== PulseColor performance guard ========================== */
(() => {
  const state = (window.__PulseColorPerf = window.__PulseColorPerf || {
    interactingUntil: 0,
    reducedMotion: false
  });

  const normalizeMode = (value) => {
    const mode = String(value || '').trim().toLowerCase();
    return mode === 'max' || mode === 'maximum' ? 'max' : 'efficient';
  };

  const getMode = () => normalizeMode(window.BeatDriverConfig?.WAVE_PERFORMANCE_MODE || 'efficient');
  const isGuardEnabled = () => getMode() !== 'max';

  const clearReducedMotion = () => {
    clearTimeout(state.timer);
    state.timer = 0;
    state.interactingUntil = 0;
    state.reducedMotion = false;
    document.documentElement.classList.remove('pcw-interacting');
  };

  const clearReducedMotionWhenReady = () => {
    clearTimeout(state.timer);

    const delay = Math.max(80, (state.interactingUntil || 0) - performance.now() + 80);

    state.timer = setTimeout(() => {
      if (!isGuardEnabled()) {
        clearReducedMotion();
        return;
      }

      if (performance.now() < (state.interactingUntil || 0)) {
        clearReducedMotionWhenReady();
        return;
      }

      clearReducedMotion();
    }, delay);
  };

  const markInteraction = (holdMs = 650) => {
    if (!isGuardEnabled()) {
      clearReducedMotion();
      return;
    }

    const nowTs = performance.now();
    state.interactingUntil = Math.max(state.interactingUntil || 0, nowTs + holdMs);

    if (!state.reducedMotion) {
      state.reducedMotion = true;
      document.documentElement.classList.add('pcw-interacting');
    }

    if ((nowTs - (state.lastMarkTs || 0)) < 120) {
      if (!state.timer) clearReducedMotionWhenReady();
      return;
    }

    state.lastMarkTs = nowTs;
    clearReducedMotionWhenReady();
  };

  const api = (window.PulseColorPerformance = window.PulseColorPerformance || {});
  api.markInteraction = markInteraction;
  api.clearInteraction = clearReducedMotion;
  api.getMode = getMode;
  api.isGuardEnabled = isGuardEnabled;
  api.isInteracting = () => isGuardEnabled() && performance.now() < (state.interactingUntil || 0);

  window.addEventListener('wheel', () => markInteraction(760), {
    capture: true,
    passive: true
  });

  window.addEventListener('scroll', () => markInteraction(760), {
    capture: true,
    passive: true
  });

  window.addEventListener('touchmove', () => markInteraction(760), {
    capture: true,
    passive: true
  });

  window.addEventListener('keydown', () => markInteraction(420), {
    capture: true,
    passive: true
  });

  window.addEventListener('pointermove', (event) => {
    if (!event || event.buttons === 0) return;
    markInteraction(420);
  }, {
    capture: true,
    passive: true
  });

  window.addEventListener('pulsecolor:beatDriverConfigChanged', () => {
    if (!isGuardEnabled()) clearReducedMotion();
  });
})();

/* ========================== AUDIOTAP v3: только активный audio ========================== */
(() => {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;

  const OSU = (window.__OSU__ = window.__OSU__ || {});

  const LOOP_HIDDEN_MS = 250;
  const ZERO_DECAY = 0.78;

  let ctxMain = null;
  let __loopRunning = false;
  let __loopHandle = 0;
  let __loopType = '';
  let __lastTick = performance.now();
  let ema = 0;

  const bundles = new Set();
  const perCtx = new WeakMap();
  const perMedia = new WeakMap();
  const tappedAudio = new WeakSet();
  const teedNodes = new WeakSet();
  const mediaLifecycleBound = new WeakSet();

  function __cancelScheduled() {
    try {
      if (__loopType === 'raf' && __loopHandle) cancelAnimationFrame(__loopHandle);
      if (__loopType === 'to' && __loopHandle) clearTimeout(__loopHandle);
    } catch { }

    __loopHandle = 0;
    __loopType = '';
    OSU.__tapRaf = 0;
  }

  function __scheduleNext() {
    __cancelScheduled();
    if (!__loopRunning) return 0;

    if (document.hidden) {
      __loopType = 'to';
      __loopHandle = setTimeout(loop, LOOP_HIDDEN_MS);
      OSU.__tapRaf = __loopHandle;
      return __loopHandle;
    }

    __loopType = 'raf';
    __loopHandle = requestAnimationFrame(loop);
    OSU.__tapRaf = __loopHandle;
    return __loopHandle;
  }

  function __resumeCtxIfNeeded() {
    try {
      const ctx = ctxMain || OSU?.ctx;
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => { });
    } catch { }
  }

  function startLoop() {
    if (__loopRunning) {
      __scheduleNext();
      return;
    }

    __loopRunning = true;
    __lastTick = performance.now();
    __scheduleNext();
  }

  function __ensureLoopAlive() {
    const now = performance.now();

    __resumeCtxIfNeeded();

    if (!__loopRunning) {
      startLoop();
      return;
    }

    if ((now - __lastTick) > 1200 || !OSU.__tapRaf) {
      __scheduleNext();
    }
  }

  function isMediaActive(el) {
    try {
      if (typeof __pcwIsUsableAudio === 'function') return __pcwIsUsableAudio(el);
      return !!(
        el &&
        el.isConnected &&
        String(el.tagName || '').toLowerCase() === 'audio' &&
        !el.paused &&
        !el.ended &&
        !el.muted &&
        Number(el.volume || 0) > 0 &&
        (el.playbackRate || 1) !== 0 &&
        (el.readyState >= 2 || Number(el.currentTime || 0) > 0)
      );
    } catch {
      return false;
    }
  }

  function getKnownAudios() {
    const out = [];

    try {
      document.querySelectorAll('audio').forEach((audio) => {
        if (audio && audio.isConnected) out.push(audio);
      });
    } catch { }

    return out;
  }

  function getActiveMedia() {
    try {
      const cached = getActiveMedia.__last;
      if (isMediaActive(cached)) return cached;
    } catch { }

    const audios = getKnownAudios();

    const active = audios.find(isMediaActive) || audios.find((audio) => {
      try {
        return audio && audio.isConnected && !audio.ended && Number(audio.currentTime || 0) > 0 && !audio.muted && Number(audio.volume || 0) > 0;
      } catch {
        return false;
      }
    }) || null;

    getActiveMedia.__last = active;
    return active;
  }

  function setMainBundle(b) {
    if (!b || !b.analyser) return;

    OSU.ctx = b.ctx;
    ctxMain = b.ctx;
    OSU.analyser = b.analyser;
    OSU.fftBins = b.analyser.frequencyBinCount;
    OSU.spec = b.spec;
    OSU.timeBuf = new Uint8Array(b.analyser.fftSize);

    try {
      if (b.ctx && !b.ctx.__osuStateBound && typeof b.ctx.addEventListener === 'function') {
        b.ctx.addEventListener('statechange', __ensureLoopAlive);
        b.ctx.__osuStateBound = true;
      }
    } catch { }
  }

  function makeBundle(ctx, media = null) {
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0.55;

    const b = {
      ctx,
      media,
      analyser,
      time: new Float32Array(analyser.fftSize),
      spec: new Uint8Array(analyser.frequencyBinCount)
    };

    bundles.add(b);
    if (!OSU.analyser || media) setMainBundle(b);
    return b;
  }

  function ensureBundleForCtx(ctx) {
    if (!ctx) return null;

    let b = perCtx.get(ctx);
    if (!b) {
      b = makeBundle(ctx, null);
      perCtx.set(ctx, b);
      window.showLog?.('[Tap] bound WebAudio fallback analyser');
    }

    return b;
  }

  function ensureMediaBundle(ctx, media) {
    if (!ctx || !media) return null;

    let b = perMedia.get(media);
    if (!b) {
      b = makeBundle(ctx, media);
      perMedia.set(media, b);
      window.showLog?.('[Tap] bound active media analyser');
    }

    return b;
  }

  function resetAudioState() {
    ema *= ZERO_DECAY;
    if (ema < 0.00001) ema = 0;

    OSU.rms = ema;
    OSU.kickEnv = (OSU.kickEnv || 0) * 0.76;
    OSU.voiceEnv = (OSU.voiceEnv || 0) * 0.76;
    OSU.kickLevel = 0;
    OSU.voiceLevel = 0;
    OSU.energyRaw = (OSU.energyRaw || 0) * 0.72;
    OSU.energyFast = (OSU.energyFast || 0) * 0.72;
    OSU.energySlow = (OSU.energySlow || 0) * 0.82;
    OSU.energySmooth = (OSU.energySmooth || 0) * 0.76;
    OSU.energyRise = 0;
    OSU.energyMotion = (OSU.energyMotion || 0) * 0.72;
    OSU.energyHeavy = (OSU.energyHeavy || 0) * 0.72;
    OSU.fluxLevel = 0;
  }

  function attachAudioLifecycle(el) {
    if (!el || mediaLifecycleBound.has(el)) return;
    mediaLifecycleBound.add(el);

    const ping = () => {
      __resumeCtxIfNeeded();
      tapMediaElement(el);
      const b = perMedia.get(el);
      if (b) setMainBundle(b);
      __ensureLoopAlive();
    };

    [
      'play',
      'playing',
      'canplay',
      'canplaythrough',
      'loadeddata',
      'loadedmetadata',
      'durationchange',
      'seeked',
      'ratechange',
      'timeupdate'
    ].forEach(evt => el.addEventListener(evt, ping, { passive: true }));

    ['pause', 'ended', 'emptied', 'stalled', 'suspend'].forEach(evt => el.addEventListener(evt, () => {
      if (getActiveMedia() === el && !isMediaActive(el)) {
        resetAudioState();
        try { window.OsuBeat?.resync?.('audio-inactive'); } catch { }
      }
    }, { passive: true }));
  }

  function tapMediaElement(el) {
    if (!el) return;

    const ctx = ctxMain || new AC();
    ctxMain = ctx;

    if (tappedAudio.has(el)) {
      const b = perMedia.get(el);
      if (isMediaActive(el) && b) setMainBundle(b);
      return;
    }

    tappedAudio.add(el);

    const b = ensureMediaBundle(ctx, el);
    if (!b) return;

    const stream = el.captureStream?.();
    if (stream) {
      try {
        const src = ctx.createMediaStreamSource(stream);
        src.connect(b.analyser);
        startLoop();
        window.showLog?.('[Tap] captureStream attached to active media');
        return;
      } catch (error) {
        window.showLog?.('[Tap] captureStream failed: ' + (error?.name || error));
      }
    }

    try {
      const src = ctx.createMediaElementSource(el);
      src.connect(b.analyser);
      startLoop();
      window.showLog?.('[Tap] mediaElementSource attached to active media');
    } catch (error) {
      window.showLog?.('[Tap] mediaElementSource failed: ' + (error?.name || error));
    }
  }

  if (!AudioNode.prototype.__osuTapPatched) {
    const origConnect = AudioNode.prototype.connect;

    AudioNode.prototype.connect = function (dest, ...rest) {
      const out = origConnect.call(this, dest, ...rest);

      try {
        const ctx = this.context || dest?.context;
        if (dest && ctx && /Destination/i.test(dest.constructor?.name || '') && !teedNodes.has(this)) {
          const b = ensureBundleForCtx(ctx);
          if (b) {
            try { origConnect.call(this, b.analyser); } catch { }
            teedNodes.add(this);
            startLoop();
            window.showLog?.('[Tap] tee @dest fallback from ' + (this.constructor?.name || 'AudioNode'));
          }
        }
      } catch { }

      return out;
    };

    AudioNode.prototype.__osuTapPatched = true;
  }

  function scanAudioNodes() {
    getKnownAudios().forEach((el) => {
      attachAudioLifecycle(el);
      tapMediaElement(el);
    });
  }

  new MutationObserver(muts => {
    let found = false;

    for (const m of muts) {
      for (const n of m.addedNodes || []) {
        if (!n || n.nodeType !== 1) continue;

        if (String(n.tagName || '').toLowerCase() === 'audio') {
          attachAudioLifecycle(n);
          tapMediaElement(n);
          found = true;
        }

        try {
          n.querySelectorAll?.('audio').forEach((el) => {
            attachAudioLifecycle(el);
            tapMediaElement(el);
            found = true;
          });
        } catch { }
      }
    }

    if (found) __ensureLoopAlive();
  }).observe(document.documentElement, { childList: true, subtree: true });

  function loop() {
    const tickTs = performance.now();
    __lastTick = tickTs;

    const interactionThrottleMs = window.PulseColorPerformance?.isInteracting?.() ? 48 : 0;
    if (interactionThrottleMs && (tickTs - (loop.__lastAnalysisTs || 0)) < interactionThrottleMs) {
      __scheduleNext();
      return;
    }
    loop.__lastAnalysisTs = tickTs;

    const activeMedia = getActiveMedia();
    const activeBundle = activeMedia ? perMedia.get(activeMedia) : null;
    const hasMediaBundles = getKnownAudios().some((audio) => perMedia.has(audio));

    let readableBundles = [];

    if (activeBundle && isMediaActive(activeMedia)) {
      setMainBundle(activeBundle);
      readableBundles = [activeBundle];
    } else if (!hasMediaBundles) {
      readableBundles = Array.from(bundles).filter(b => !b.media);
      if (readableBundles[0]) setMainBundle(readableBundles[0]);
    }

    if (!readableBundles.length) {
      resetAudioState();
      __scheduleNext();
      return;
    }

    let maxRms = 0;

    for (const b of readableBundles) {
      try {
        b.analyser.getFloatTimeDomainData(b.time);

        let s = 0;
        const t = b.time;

        for (let i = 0; i < t.length; i++) {
          const v = t[i];
          s += v * v;
        }

        const rms = Math.sqrt(s / t.length);
        if (rms > maxRms) {
          maxRms = rms;
          setMainBundle(b);
        }

        b.analyser.getByteFrequencyData(b.spec);
        if (b.analyser === OSU.analyser) OSU.spec = b.spec;
      } catch { }
    }

    ema = ema * 0.85 + maxRms * 0.15;
    OSU.rms = ema;

    __scheduleNext();
  }

  const api = (window.PulseColorAudioTap = window.PulseColorAudioTap || {});
  api.getActiveMedia = getActiveMedia;
  api.rescan = scanAudioNodes;
  api.resync = (reason = 'manual') => {
    try {
      scanAudioNodes();
      __resumeCtxIfNeeded();

      const active = getActiveMedia();
      const b = active ? perMedia.get(active) : null;
      if (b) setMainBundle(b);

      __ensureLoopAlive();
      window.showLog?.('[Tap] resync: ' + reason);
    } catch { }
  };

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) api.resync('visibility');
  });

  window.addEventListener('focus', () => api.resync('focus'));
  window.addEventListener('pageshow', () => api.resync('pageshow'));
  window.addEventListener('pulsecolor:trackchange', () => {
    resetAudioState();
    setTimeout(() => api.resync('trackchange'), 80);
  });

  scanAudioNodes();
  startLoop();
})();

/* ========================== OsuBeatClassic  ========================== */
(() => {
  const OSU = (window.__OSU__ = window.__OSU__ || {});
  if (!('requestAnimationFrame' in window)) return;

  const CFG = {
    bpmMin: 50, bpmMax: 210,
    gateHoldMs: 55,                 // защита от слишком частых онсетов
    fluxWin: 48,                    // окно локальной статистики
    fluxK: 1.45,                    // множитель сигмы
    retempoEveryMs: 800,            // как часто пересчитывать темп
    lockNeedIOIs: 6,                // сколько межударных интервалов нужно
  };

  let analyser = null, spec = null, lastSpec = null;
  let fluxBuf = [], timeBuf = [];
  let lastOnsetT = 0, lastBeatT = 0;
  let ibIs = [];
  let bpm = 0, periodMs = 0;
  let locked = false, conf = 0;
  let nextBeat = 0, beatIndex = 0;
  let bpmClockRunning = false;
  let lastRetempo = 0;
  let bpmSource = 'none';

  const isExternalSource = () => bpmSource === 'getsongbpm' || bpmSource === 'cache' || bpmSource === 'external';

  const now = () => performance.now();
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

  function snapStaleBeatClock(t, reason = 'stale-clock') {
    if (!(locked && periodMs > 0)) return false;

    const maxLag = Math.max(1200, periodMs * 2.5);
    const maxLead = Math.max(2400, periodMs * 6);

    if (!nextBeat || (t - nextBeat) > maxLag || (nextBeat - t) > maxLead) {
      nextBeat = t + Math.min(periodMs, 140);
      lastBeatT = t;
      bpmClockRunning = false;

      try {
        window.showLog?.(`[OsuBeat] resync ${reason}`);
      } catch { }

      return true;
    }

    return false;
  }

  function emitScheduledBeat(at, strong = false, resynced = false) {
    const payload = {
      time: at,
      bpm,
      beatIndex: ++beatIndex,
      downbeat: (beatIndex % 4) === 1,
      confidence: conf,
      strong,
      resynced
    };

    dispatch('osu-beat', payload);
    dispatch('osu-beat-visual', payload);
  }


  const getWaveDriveMode = () => {
    const apiMode = window.PulseColorWaveMode?.getEffectiveMode?.();
    if (apiMode === 'bpm' || apiMode === 'raw') return apiMode;
    const cfgMode = String(window.BeatDriverConfig?.WAVE_DRIVE_MODE || '').trim().toLowerCase();
    return cfgMode === 'bpm' ? 'bpm' : 'raw';
  };
  const isBpmWaveDrive = () => getWaveDriveMode() === 'bpm';
  const canUseLocalBpm = () => {
    const api = window.PulseColorWaveMode;
    if (api?.canUseLocalBpm) return api.canUseLocalBpm() !== false;
    return !window.BeatDriverConfig?.WAVE_DRIVE_MODE;
  };

  function bindAnalyser() {
    if (OSU.analyser && OSU.analyser !== analyser) {
      analyser = OSU.analyser;
      spec = OSU.spec = new Uint8Array(analyser.frequencyBinCount);
      lastSpec = new Uint8Array(analyser.frequencyBinCount);
      analyser.smoothingTimeConstant = 0.55;
    }
  }

  function spectralFlux() {
    analyser.getByteFrequencyData(spec);

    // --- БАС / ГОЛОС + события ---
    let low = 0, mid = 0, nL = 0, nM = 0;
    for (let i = 0; i < spec.length; i++) {
      const v = spec[i] / 255;
      if (i < spec.length * 0.18) { low += v * v; nL++; }
      if (i > spec.length * 0.25 && i < spec.length * 0.65) { mid += v * v; nM++; }
    }
    const kickStr = Math.sqrt(low / (nL || 1));
    const voiceStr = Math.sqrt(mid / (nM || 1));

    // непрерывные огибающие
    OSU.kickEnv = (OSU.kickEnv ?? 0) * 0.90 + kickStr * 0.10;
    OSU.kickLevel = kickStr;
    OSU.voiceEnv = (OSU.voiceEnv ?? 0) * 0.92 + voiceStr * 0.08;
    OSU.voiceLevel = voiceStr;

    const nowMs = performance.now();
    const V_THR = (window.BeatDriverConfig?.VOICE_EVENT_THR ?? 0.10);
    const V_CD = (window.BeatDriverConfig?.VOICE_COOLDOWN_MS ?? 60);
    const K_CD = (window.BeatDriverConfig?.KICK_COOLDOWN_MS ?? 45);

    if (kickStr > 0.13 && (!OsuBeat.__lastKickAt || nowMs - OsuBeat.__lastKickAt > K_CD)) {
      OsuBeat.__lastKickAt = nowMs;
      window.dispatchEvent(new CustomEvent('osu-kick', { detail: { strength: kickStr } }));
    }
    if (voiceStr > V_THR && (!OsuBeat.__lastVoiceAt || nowMs - OsuBeat.__lastVoiceAt > V_CD)) {
      OsuBeat.__lastVoiceAt = nowMs;
      window.dispatchEvent(new CustomEvent('osu-voice', { detail: { strength: voiceStr } }));
    }

    let f = 0, N = spec.length;
    for (let i = 0; i < N; i++) {
      const w = (i < N * 0.20) ? 1.8 : (i < N * 0.55 ? 1.0 : 0.7);
      const d = (spec[i] - lastSpec[i]);
      if (d > 0) f += (d / 255) * w;
      lastSpec[i] = spec[i];
    }

    // Музыкальная энергетика: не просто громкость, а смесь RMS, баса, flux и перехода calm → heavy.
    const rmsNorm = clamp((OSU.rms || 0) * 3.2, 0, 1);
    const kickNorm = clamp(kickStr * 4.4, 0, 1);
    const voiceNorm = clamp(voiceStr * 2.4, 0, 1);

    OSU.fluxEnv = (OSU.fluxEnv ?? f) * 0.94 + f * 0.06;
    const fluxNorm = clamp(f / Math.max(0.045, (OSU.fluxEnv || 0) * 2.8), 0, 1);

    const energyRaw = clamp(
      rmsNorm * 0.28 +
      kickNorm * 0.42 +
      fluxNorm * 0.22 +
      voiceNorm * 0.08,
      0,
      1
    );

    const energyAuto = window.__PCW_ENERGY_AUTO_TUNING__ || {
      FAST_ALPHA: 0.18,
      SLOW_ALPHA: 0.026,
      SMOOTH_ALPHA: 0.095,
      RISE_GAIN: 3.35,
      RISE_THRESHOLD: 0.165,
      RISE_COOLDOWN_MS: 340
    };

    const fastA = energyAuto.FAST_ALPHA;
    const slowA = energyAuto.SLOW_ALPHA;
    const smoothA = energyAuto.SMOOTH_ALPHA;

    OSU.energyRaw = energyRaw;
    OSU.energyFast = (OSU.energyFast ?? energyRaw) * (1 - fastA) + energyRaw * fastA;
    OSU.energySlow = (OSU.energySlow ?? energyRaw) * (1 - slowA) + energyRaw * slowA;
    OSU.energySmooth = (OSU.energySmooth ?? energyRaw) * (1 - smoothA) + energyRaw * smoothA;
    OSU.energyRise = clamp((OSU.energyFast - OSU.energySlow) * energyAuto.RISE_GAIN, 0, 1);
    OSU.energyHeavy = clamp(kickNorm * 0.68 + fluxNorm * 0.32, 0, 1);
    OSU.energyMotion = clamp(OSU.energySmooth * 0.72 + OSU.energyRise * 0.50 + OSU.energyHeavy * 0.18, 0, 1);
    OSU.fluxLevel = fluxNorm;

    const riseThr = energyAuto.RISE_THRESHOLD;
    const riseCd = energyAuto.RISE_COOLDOWN_MS;
    if (OSU.energyRise > riseThr && (!OsuBeat.__lastEnergyRiseAt || nowMs - OsuBeat.__lastEnergyRiseAt > riseCd)) {
      OsuBeat.__lastEnergyRiseAt = nowMs;
      window.dispatchEvent(new CustomEvent('osu-energy-rise', {
        detail: {
          energy: OSU.energySmooth,
          rise: OSU.energyRise,
          heavy: OSU.energyHeavy,
          strength: Math.max(kickStr, OSU.energyRise),
          flux: f
        }
      }));
    }

    return { flux: f, kickStr, voiceStr, energy: OSU.energySmooth, energyRise: OSU.energyRise, energyHeavy: OSU.energyHeavy };
  }

  function localFluxThresh() {
    const n = fluxBuf.length;
    const w = Math.min(CFG.fluxWin, n);
    if (!w) return Infinity;
    let m = 0; for (let i = n - w; i < n; i++) m += fluxBuf[i]; m /= w;
    let s = 0; for (let i = n - w; i < n; i++) { const d = fluxBuf[i] - m; s += d * d; }
    const stdev = Math.sqrt(s / Math.max(1, w));
    return m + CFG.fluxK * stdev;
  }
  function pushFlux(t, f) {
    fluxBuf.push(f); timeBuf.push(t);
    if (fluxBuf.length > 800) { fluxBuf.shift(); timeBuf.shift(); }
  }

  function estimateTempoByIOI() {
    if (ibIs.length < CFG.lockNeedIOIs) return 0;
    const xs = ibIs.slice(-14);
    const norm = xs.map(v => {
      let p = v;
      while (p < 60000 / CFG.bpmMax) p *= 2;
      while (p > 60000 / CFG.bpmMin) p /= 2;
      return clamp(p, 60000 / CFG.bpmMax, 60000 / CFG.bpmMin);
    });
    const bin = 10, minP = 60000 / CFG.bpmMax, maxP = 60000 / CFG.bpmMin;
    const bins = new Array(Math.floor((maxP - minP) / bin) + 1).fill(0);
    for (const v of norm) {
      const idx = Math.round((v - minP) / bin);
      if (bins[idx] != null) bins[idx] += 1;
    }
    let bestI = 0, bestV = -1;
    for (let i = 0; i < bins.length; i++) if (bins[i] > bestV) { bestV = bins[i]; bestI = i; }
    const per = minP + bestI * bin;
    return clamp(Math.round(60000 / per), CFG.bpmMin, CFG.bpmMax);
  }

  function dispatch(name, detail) { window.dispatchEvent(new CustomEvent(name, { detail })); }

  let lastStrongBeatT = 0;

  function getStrongBeatMinGap() {
    const cfg = window.BeatDriverConfig || {};
    const base = Math.max(120, +(cfg.BPM_STRONG_BEAT_MIN_MS || 240));
    if (!(locked && periodMs > 0)) return base;
    return Math.max(base, Math.min(periodMs * 0.52, 320));
  }

  function isStrongBeatCandidate({ t, isPeak, flux, thr, kickStr, audible }) {
    if (!isPeak || !audible) return false;

    const cfg = window.BeatDriverConfig || {};
    const strongThr = +(cfg.BPM_STRONG_BEAT_THR ?? 0.145);
    const strongRatio = +(cfg.BPM_STRONG_BEAT_RATIO ?? 1.22);
    const kickEnv = +(OSU.kickEnv || 0);
    const fluxFloor = Math.max((Number.isFinite(thr) ? thr : 0) * 0.82, 0.03);

    if ((t - lastStrongBeatT) < getStrongBeatMinGap()) return false;

    return kickStr >= Math.max(strongThr, kickEnv * strongRatio) && flux >= fluxFloor;
  }

  function resyncClockFromStrongBeat(detail) {
    if (!detail || !(locked && periodMs > 0)) return false;

    const cfg = window.BeatDriverConfig || {};
    const t = +detail.time || now();
    const snapWindow = Math.max(50, +(cfg.BPM_RESYNC_WINDOW_MS || 180));

    if (nextBeat && bpmClockRunning) {
      const prevGrid = nextBeat - periodMs;
      const nearest = Math.abs(t - prevGrid) <= Math.abs(nextBeat - t) ? prevGrid : nextBeat;
      const delta = t - nearest;
      if (Math.abs(delta) > Math.max(snapWindow, periodMs * 0.45)) return false;
    }

    bpmClockRunning = true;
    lastBeatT = t;
    nextBeat = t + periodMs;

    const payload = {
      ...detail,
      bpm,
      beatIndex: ++beatIndex,
      downbeat: (beatIndex % 4) === 1,
      confidence: conf,
      strong: true,
      resynced: true
    };
    dispatch('osu-beat', payload);
    dispatch('osu-beat-visual', payload);
    return true;
  }

  function loop() {
    bindAnalyser();
    const t = now();
    if (!analyser) { requestAnimationFrame(loop); return; }

    const interactionThrottleMs = window.PulseColorPerformance?.isInteracting?.() ? 50 : 0;
    if (interactionThrottleMs && (t - (loop.__lastAnalysisTs || 0)) < interactionThrottleMs) {
      requestAnimationFrame(loop);
      return;
    }
    loop.__lastAnalysisTs = t;

    const analysis = spectralFlux();
    const f = analysis?.flux || 0;
    pushFlux(t, f);
    const thr = localFluxThresh();
    const prevFlux = fluxBuf.length > 1 ? fluxBuf[fluxBuf.length - 2] : 0;
    const isPeak = f > thr && (f - prevFlux) > 0;
    const audible = (__audioOn?.() ?? true);
    let strongBeatDetail = null;

    if (isStrongBeatCandidate({
      t,
      isPeak,
      flux: f,
      thr,
      kickStr: analysis?.kickStr || 0,
      audible
    })) {
      lastStrongBeatT = t;
      strongBeatDetail = {
        time: t,
        bpm: bpm || null,
        confidence: conf,
        strength: +(analysis?.kickStr || 0),
        flux: f,
        strong: true
      };
      dispatch('osu-strong-beat', strongBeatDetail);
    }

    if (isPeak && (t - lastOnsetT) >= CFG.gateHoldMs) {
      lastOnsetT = t;

      const bpmDrive = isBpmWaveDrive();
      if (!bpmDrive && lastBeatT > 0) {
        const ibi = t - lastBeatT;
        if (ibi >= 180 && ibi <= 1200) { ibIs.push(ibi); if (ibIs.length > 32) ibIs.shift(); }
      }
      if (!bpmDrive && canUseLocalBpm() && !isExternalSource() && t - lastRetempo >= CFG.retempoEveryMs) {
        lastRetempo = t;
        const est = estimateTempoByIOI();
        if (est) {
          const targetPeriod = 60000 / est;
          if (!locked) { bpm = est; periodMs = targetPeriod; locked = true; conf = Math.max(conf, 0.30); bpmSource = 'local'; }
          else { bpm = Math.round(bpm * 0.6 + est * 0.4); periodMs = periodMs * 0.6 + targetPeriod * 0.4; conf = Math.min(1, conf + 0.05); bpmSource = 'local'; }
        } else {
          conf = Math.max(0, conf - 0.02);
          if (conf < 0.12) { locked = false; bpmSource = 'none'; }
        }
      }

      if (!bpmDrive) {
        lastBeatT = t;
        if (locked && !isExternalSource()) { nextBeat = t + periodMs; }
        const payload = {
          time: t,
          bpm: bpm || null,
          beatIndex: ++beatIndex,
          downbeat: (beatIndex % 4) === 1,
          confidence: conf,
          strong: !!strongBeatDetail,
          strength: +(analysis?.kickStr || 0),
          flux: f
        };
        dispatch('osu-beat', payload);
        dispatch('osu-beat-visual', payload);
      }
    }

    const bpmDrive = isBpmWaveDrive();
    const audioAudible = audible;

    if (locked && periodMs > 0) {
      if (bpmDrive) {
        if (audioAudible) {
          if (strongBeatDetail) resyncClockFromStrongBeat(strongBeatDetail);
          if (!bpmClockRunning || !nextBeat) nextBeat = t + Math.min(periodMs, 120);
          snapStaleBeatClock(t, 'bpm-drive-focus');
          bpmClockRunning = true;

          let emitted = 0;
          while (t >= nextBeat && emitted < 4) {
            emitScheduledBeat(nextBeat, false, false);
            nextBeat += periodMs;
            emitted += 1;
          }

          if (t >= nextBeat) {
            nextBeat = t + Math.min(periodMs, 140);
          }
        } else {
          bpmClockRunning = false;
        }
      } else if (isExternalSource() || audioAudible) {
        snapStaleBeatClock(t, 'scheduled-drive-focus');

        let emitted = 0;
        while (t >= nextBeat && emitted < 4) {
          emitScheduledBeat(nextBeat, false, false);
          nextBeat += periodMs;
          emitted += 1;
        }

        if (t >= nextBeat) {
          nextBeat = t + Math.min(periodMs, 140);
        }
      } else {
        nextBeat = t + periodMs;
      }
    } else if (locked) {
      nextBeat = t + periodMs;
      bpmClockRunning = false;
    }

    let phase = 0;
    if (locked && periodMs > 0) {
      const prev = nextBeat - periodMs;
      phase = Math.min(1, Math.max(0, (t - prev) / periodMs));
    }

    // HUD
    const hud = document.getElementById('osu-hud-maxfft');
    if (hud) { hud.textContent = bpm ? `${bpm} BPM  • conf ${conf.toFixed(2)}${locked ? ' ✓' : ''}` : '…'; }

    // экспорт API
    OsuBeat.bpm = () => (bpm || null);
    OsuBeat.confidence = () => conf;
    OsuBeat.phase = () => phase;
    OsuBeat.isLocked = () => !!locked;
    OsuBeat.source = () => bpmSource;
    OsuBeat.isExternalLocked = () => !!locked && isExternalSource();

    requestAnimationFrame(loop);
  }

  // API
  const OsuBeat = (window.OsuBeat = window.OsuBeat || {});
  OsuBeat.bpm = () => null;
  OsuBeat.confidence = () => 0;
  OsuBeat.phase = () => 0;
  OsuBeat.isLocked = () => false;
  OsuBeat.source = () => 'none';
  OsuBeat.isExternalLocked = () => false;
  OsuBeat.onBeat = (fn) => { window.addEventListener('osu-beat', e => fn?.(e.detail)); };
  OsuBeat.retune = ({ presetBpm, source = 'external' } = {}) => {
    if (!presetBpm) return;
    const b = clamp(Math.round(presetBpm), CFG.bpmMin, CFG.bpmMax);
    bpm = b; periodMs = 60000 / b; locked = true; conf = Math.max(conf, 0.50); nextBeat = now() + periodMs; bpmClockRunning = false; bpmSource = source || 'external'; lastStrongBeatT = 0;
  };

  OsuBeat.preset = (presetBpm, options = {}) => {
    if (!presetBpm) return;
    const b = clamp(Math.round(presetBpm), CFG.bpmMin, CFG.bpmMax);
    const opts = (options && typeof options === 'object') ? options : {};
    const source = opts.source || 'external';
    const lock = opts.lock !== false;
    bpm = b; periodMs = 60000 / b; locked = !!lock; conf = Math.max(conf, lock ? 0.50 : 0.20);
    nextBeat = now() + periodMs; beatIndex = 0; bpmClockRunning = false; bpmSource = source; lastStrongBeatT = 0;
  };
  OsuBeat.reset = () => {
    fluxBuf = []; timeBuf = [];
    lastOnsetT = 0; lastBeatT = 0;
    ibIs = [];
    bpm = 0; periodMs = 0;
    locked = false; conf = 0;
    nextBeat = 0; beatIndex = 0;
    bpmClockRunning = false;
    lastRetempo = 0; bpmSource = 'none'; lastStrongBeatT = 0;
  };

  OsuBeat.resync = (reason = 'manual') => {
    const t = now();

    fluxBuf = [];
    timeBuf = [];
    ibIs = [];
    lastOnsetT = 0;
    lastBeatT = t;
    lastStrongBeatT = 0;
    bpmClockRunning = false;

    if (locked && periodMs > 0) {
      nextBeat = t + Math.min(periodMs, 140);
    } else {
      nextBeat = 0;
    }

    try {
      window.PulseColorAudioTap?.resync?.(reason);
    } catch { }

    try {
      window.showLog?.(`[OsuBeat] resync: ${reason}`);
    } catch { }
  };

  window.addEventListener('pulsecolor:trackchange', () => {
    OsuBeat.resync?.('trackchange');
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) setTimeout(() => OsuBeat.resync?.('visibility'), 80);
  });

  window.addEventListener('focus', () => {
    setTimeout(() => OsuBeat.resync?.('focus'), 80);
  });

  window.addEventListener('pageshow', () => {
    setTimeout(() => OsuBeat.resync?.('pageshow'), 80);
  });

  requestAnimationFrame(loop);
})();

/* ========================== BeatDriver (импульсы + шкала) ========================== */
(() => {
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  let impKick = 0, impVoice = 0;

  const getEnergyState = () => {
    const o = window.__OSU__ || {};
    return {
      energy: clamp(+(o.energySmooth ?? o.energyRaw ?? 0), 0, 1),
      rise: clamp(+(o.energyRise || 0), 0, 1),
      heavy: clamp(+(o.energyHeavy || 0), 0, 1),
      motion: clamp(+(o.energyMotion ?? o.energySmooth ?? 0), 0, 1),
      flux: clamp(+(o.fluxLevel || 0), 0, 1)
    };
  };

  const getConf = () => (window.OsuBeat?.confidence?.() ?? 0);
  const audioActive = () => (__audioOn?.() ?? true);
  const getWaveDriveModeForVisuals = () => {
    const apiMode = window.PulseColorWaveMode?.getEffectiveMode?.();
    if (apiMode === 'bpm' || apiMode === 'raw') return apiMode;
    const cfgMode = String(window.BeatDriverConfig?.WAVE_DRIVE_MODE || '').trim().toLowerCase();
    return cfgMode === 'bpm' ? 'bpm' : 'raw';
  };
  const isBpmWaveDriveForVisuals = () => getWaveDriveModeForVisuals() === 'bpm';
  const beatVisualActive = () => {
    if (!isBpmWaveDriveForVisuals()) return false;
    const bpm = +(window.OsuBeat?.bpm?.() || 0);
    const minConf = +(window.BeatDriverConfig?.MIN_CONF ?? 0.35);
    return audioActive() && !!bpm && getConf() >= minConf;
  };

  const onBeat = (e) => {
    if (!beatVisualActive()) return;
    const c = getConf();
    const weight = 0.6 + 0.4 * clamp(c, 0, 1);
    const down = !!e.detail?.downbeat;
    const strong = !!e.detail?.strong || !!e.detail?.resynced;
    const cfg = window.BeatDriverConfig || {};
    const base = down ? (cfg.BEAT_IMPULSE_DOWN || 0) : (cfg.BEAT_IMPULSE || 0);
    const strongMul = strong ? (1.20 + Math.min(0.55, (+e.detail?.strength || 0) * 1.35)) : 1;
    impKick += base * weight * (cfg.OUTER_GAIN || 1) * strongMul;

    try {
      if (window.PulseColorPerformance?.isInteracting?.()) return;
      const outer = document.getElementById('osu-pulse-outer');
      if (outer) {
        outer.classList.remove('pulse');
        requestAnimationFrame(() => {
          if (!outer.isConnected) return;
          outer.classList.add('pulse');
          setTimeout(() => outer && outer.classList.remove('pulse'), 480);
        });
      }
    } catch { }
  };
  window.addEventListener('osu-beat-visual', onBeat);

  window.addEventListener('osu-kick', (e) => {
    if (isBpmWaveDriveForVisuals()) return;
    if (!audioActive()) return;
    const s = +e.detail?.strength || 0;
    const cfg = window.BeatDriverConfig || {};
    const energyState = getEnergyState();
    if (s < 0.008 && energyState.motion < 0.16) return;
    const energyMul = 0.64 + energyState.motion * 0.50 + energyState.rise * 0.36;
    impKick += Math.min(0.185, (cfg.KICK_IMPULSE_BASE || 0) + s * (0.46 + energyState.heavy * 0.34)) * (cfg.OUTER_GAIN || 1) * energyMul;
  });

  window.addEventListener('osu-voice', (e) => {
    if (isBpmWaveDriveForVisuals()) return;
    if (!audioActive()) return;
    const s = +e.detail?.strength || 0;
    const cfg = window.BeatDriverConfig || {};
    const energyState = getEnergyState();
    if (s < 0.016 && energyState.motion < 0.15) return;
    const gainImp = (cfg.VOICE_IMPULSE_GAIN ?? 1.20); // усилитель события голоса
    const calmMul = 0.60 + energyState.motion * 0.34;
    const add = Math.min(0.140, (0.038 + s * (0.50 + energyState.rise * 0.22))) * (cfg.INNER_GAIN || 1) * gainImp * calmMul;
    impVoice += add;
  });

  window.BeatDriver = {
    scales(dtMs) {
      const cfg = window.BeatDriverConfig || {};
      const bpmDrive = isBpmWaveDriveForVisuals();
      const active = bpmDrive ? beatVisualActive() : audioActive();

      const e = getEnergyState();
      const response = 1;
      const calmSlowdown = 1 + (1 - e.motion) * 0.78;
      const heavySpeedup = 1 - e.rise * 0.26 - e.heavy * 0.12;
      const kickDecayMs = (cfg.DECAY_MS || 150) * clamp(calmSlowdown * heavySpeedup, 0.76, 1.95);
      const voiceDecayMs = (cfg.DECAY_MS_VOICE || 190) * clamp((1 + (1 - e.energy) * 0.58) * (1 - e.rise * 0.16), 0.82, 1.88);

      const dKick = Math.exp(-dtMs / kickDecayMs);
      const dVoice = Math.exp(-dtMs / voiceDecayMs);
      impKick *= dKick;
      impVoice *= dVoice;

      if (!active) return { outer: 1, inner: 1, active: false, energy: 0, rise: 0 };

      const soft = (x, k = 0.9) => Math.tanh(x * k);

      const ph = window.OsuBeat?.phase?.() ?? 0;
      const breath = bpmDrive ? Math.sin(ph * 2 * Math.PI) * 0.004 : 0;
      const rms = bpmDrive ? 0 : Math.min(1, Math.max(0, ((window.__OSU__?.rms || 0) * 2.15) - 0.030));
      const micro = (rms * 0.0024 + e.energy * 0.0018) * (0.50 + e.motion * 0.26);

      const voiceEnv = bpmDrive ? 0 : Math.max(0, Math.min(1, (window.__OSU__?.voiceEnv || 0)));
      const envGain = (cfg.VOICE_ENVELOPE_GAIN ?? 1.40);
      const energyPulse = bpmDrive ? 0 : (e.energy * 0.0060 + e.heavy * 0.0120 + e.rise * 0.030) * response;

      if (cfg.UNIFIED_MODE) {
        const uni = soft(impKick * .6 + (impVoice + voiceEnv * envGain) * .6) + breath + micro + energyPulse;
        const minS = Math.min(cfg.OUTER_MIN_SCALE || 0.94, cfg.INNER_MIN_SCALE || 0.95);
        const maxS = Math.max(cfg.OUTER_MAX_SCALE || 1.6, cfg.INNER_MAX_SCALE || 1.4);
        const s = Math.min(maxS, Math.max(minS, 1 + uni));
        return { outer: s, inner: s, active: true, energy: e.energy, rise: e.rise };
      }

      const outerRaw = 1 + breath + soft(impKick * (0.78 + e.heavy * 0.27 + e.rise * 0.18), 0.86) + micro + energyPulse;
      const innerRaw = 1 + breath + soft(impVoice * 0.62 + voiceEnv * envGain * 0.66 + e.energy * 0.014, 0.82) + micro * 0.30 + e.rise * 0.007;

      const outer = Math.min(cfg.OUTER_MAX_SCALE || 1.6, Math.max(cfg.OUTER_MIN_SCALE || 0.94, outerRaw));
      const inner = Math.min(cfg.INNER_MAX_SCALE || 1.4, Math.max(cfg.INNER_MIN_SCALE || 0.95, innerRaw));

      return { outer, inner, active: true, energy: e.energy, rise: e.rise };
    },
    isActive() { return beatVisualActive(); }
  };
})();


/* ========================== PulseColor Wave Energy (музыкальная энергетика) ========================== */
(() => {
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

  // Внутренняя автонастройка энергетики. Не выносится в UI:
  // волна сама отличает спокойную часть от тяжёлого/ускоренного перехода.
  const ENERGY_AUTO = window.__PCW_ENERGY_AUTO_TUNING__ || (window.__PCW_ENERGY_AUTO_TUNING__ = Object.freeze({
    RESPONSE: 1.00,

    // Внутренний профиль сделан спокойнее: мелкий шум и тихий вокал не должны трясти волну.
    // Быстрые кольца появляются только на реальном росте энергии/баса.
    FAST_ALPHA: 0.145,
    SLOW_ALPHA: 0.020,
    SMOOTH_ALPHA: 0.065,
    RISE_GAIN: 2.55,
    RISE_THRESHOLD: 0.205,
    RISE_COOLDOWN_MS: 500
  }));

  const OSU = (window.__OSU__ = window.__OSU__ || {});
  const state = (window.__PCW_WAVE_ENERGY__ = window.__PCW_WAVE_ENERGY__ || {
    energy: 0,
    flow: 0,
    heavy: 0,
    motion: 0,
    rise: 0,
    ring: 0,
    kickBoost: 0,
    voiceBoost: 0,
    beatBoost: 0,
    lastRmsN: 0,
    lastKickN: 0,
    lastVoiceN: 0,
    lastTs: performance.now()
  });

  const getWaveMode = () => {
    const apiMode = window.PulseColorWaveMode?.getEffectiveMode?.();
    if (apiMode === 'bpm' || apiMode === 'raw') return apiMode;
    const cfgMode = String(window.BeatDriverConfig?.WAVE_DRIVE_MODE || '').trim().toLowerCase();
    return cfgMode === 'bpm' ? 'bpm' : 'raw';
  };

  const smoothTo = (current, target, dtSec, riseSec, fallSec) => {
    const tau = target >= current ? riseSec : fallSec;
    const a = 1 - Math.exp(-dtSec / Math.max(0.001, tau));
    return current + (target - current) * a;
  };

  const api = (window.PulseColorWaveEnergy = window.PulseColorWaveEnergy || {});

  api.reset = () => {
    state.energy = 0;
    state.flow = 0;
    state.heavy = 0;
    state.motion = 0;
    state.rise = 0;
    state.ring = 0;
    state.kickBoost = 0;
    state.voiceBoost = 0;
    state.beatBoost = 0;
    state.lastRmsN = 0;
    state.lastKickN = 0;
    state.lastVoiceN = 0;
    state.lastTs = performance.now();
  };

  api.getState = () => ({ ...state });

  api.update = (dtMs, context = {}) => {
    const cfg = window.BeatDriverConfig || {};
    const dtSec = Math.min(0.12, Math.max(0.001, (Number.isFinite(+dtMs) ? +dtMs : (performance.now() - (state.lastTs || performance.now()))) / 1000));
    state.lastTs = performance.now();

    const waveMode = context.waveMode || getWaveMode();
    const bpmDrive = waveMode === 'bpm';
    const conf = clamp(Number.isFinite(+context.conf) ? +context.conf : +(window.OsuBeat?.confidence?.() ?? 0), 0, 1);
    const waveActive = context.waveActive !== false;

    const softGate = (value, floor, gain = 1) => clamp((value - floor) * gain, 0, 1);

    const rmsN = softGate((OSU.rms || 0) * 3.35, 0.032, 1.26);
    const kickN = softGate((OSU.kickEnv || 0) * 3.18, 0.045, 1.40);
    const voiceN = softGate((OSU.voiceEnv || 0) * 2.38, 0.042, 1.20);

    const rmsRise = clamp((rmsN - state.lastRmsN - 0.018) * 5.15, 0, 1);
    const kickRise = clamp((kickN - state.lastKickN - 0.022) * 6.35, 0, 1);
    const voiceRise = clamp((voiceN - state.lastVoiceN - 0.020) * 4.70, 0, 1);

    state.lastRmsN = rmsN;
    state.lastKickN = kickN;
    state.lastVoiceN = voiceN;

    state.kickBoost *= Math.exp(-dtSec / 0.31);
    state.voiceBoost *= Math.exp(-dtSec / 0.42);
    state.beatBoost *= Math.exp(-dtSec / 0.40);

    const transient = clamp(rmsRise * 0.32 + kickRise * 0.88 + voiceRise * 0.28 + state.beatBoost * 0.28, 0, 1);
    const baseEnergy = clamp(rmsN * 0.42 + kickN * 0.82 + voiceN * 0.26, 0, 1);
    const flowTarget = clamp(voiceN * 0.62 + rmsN * 0.26 + voiceRise * 0.10 + state.voiceBoost * 0.11, 0, 1);
    const heavyTarget = clamp(kickN * 0.92 + transient * 0.58 + rmsN * 0.12 + state.kickBoost * 0.17, 0, 1);

    let energyTarget = clamp(baseEnergy * 0.86 + transient * 0.20 + state.kickBoost * 0.070 + state.voiceBoost * 0.042, 0, 1);

    if (bpmDrive) {
      const bpmLive = +(window.OsuBeat?.bpm?.() || 0);
      const bpmFloor = bpmLive ? clamp(0.12 + conf * 0.32, 0, 0.55) : 0;
      energyTarget = Math.max(energyTarget, bpmFloor);
    }

    if (!waveActive) {
      energyTarget = 0;
    }

    state.energy = smoothTo(state.energy, energyTarget, dtSec, 0.18, 0.68);
    state.flow = smoothTo(state.flow, waveActive ? flowTarget : 0, dtSec, 0.26, 0.72);
    state.heavy = smoothTo(state.heavy, waveActive ? heavyTarget : 0, dtSec, 0.17, 0.56);
    state.rise = smoothTo(state.rise, waveActive ? transient : 0, dtSec, 0.12, 0.36);

    const motionGate = clamp((state.energy - 0.130) * 1.82 + state.heavy * 0.24, 0, 1);
    const motionBase = clamp((state.energy * 0.58 + state.heavy * 0.36 + state.flow * 0.07) * motionGate, 0, 1);
    const calmRing = clamp((state.energy - 0.155) * 0.82, 0, 0.30);
    const ringBase = clamp(state.rise * 0.82 + state.heavy * 0.22 + calmRing, 0, 1);

    state.motion = smoothTo(state.motion, waveActive ? motionBase : 0, dtSec, 0.18, 0.62);
    state.ring = smoothTo(state.ring, waveActive ? ringBase : 0, dtSec, 0.16, 0.42);

    return { ...state };
  };

  window.addEventListener('osu-kick', (e) => {
    const raw = +e.detail?.strength || 0;
    if (raw < 0.008) return;
    const s = clamp(raw * 2.65, 0, 1);
    state.kickBoost = Math.max(state.kickBoost, s);
  });

  window.addEventListener('osu-voice', (e) => {
    const raw = +e.detail?.strength || 0;
    if (raw < 0.016) return;
    const s = clamp(raw * 2.00, 0, 0.78);
    state.voiceBoost = Math.max(state.voiceBoost, s);
  });

  window.addEventListener('osu-strong-beat', (e) => {
    const raw = +e.detail?.strength || 0;
    if (raw < 0.055) return;
    const s = clamp(raw * 2.15, 0.16, 1);
    state.beatBoost = Math.max(state.beatBoost, s);
  });

  window.addEventListener('pulsecolor:trackchange', () => api.reset());
})();

/* ========================== VISUAL (сверхплавное движение, кольца, свечение) ========================== */
(() => {
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const now = () => performance.now();

  // ── DOM ──────────────────────────────────────────────────────────────
  let root = document.getElementById('osu-pulse');
  if (!root) { root = document.createElement('div'); root.id = 'osu-pulse'; document.body.appendChild(root); }
  root.style.removeProperty('transform');

  const applyViewportWaveLayerBounds = (node) => {
    if (!node?.style) return;
    node.style.position = 'absolute';
    node.style.inset = 'auto';
    node.style.left = '25vw';
    node.style.right = '25vw';
    node.style.top = '25vh';
    node.style.bottom = '25vh';
    node.style.pointerEvents = 'none';
    node.style.transformOrigin = '50% 50%';
  };

  let outer = document.getElementById('osu-pulse-outer');
  if (!outer) { outer = document.createElement('div'); outer.id = 'osu-pulse-outer'; root.appendChild(outer); }
  applyViewportWaveLayerBounds(outer);

  const legacyInner = document.getElementById('osu-pulse-inner');
  if (legacyInner) legacyInner.remove();
  let inner = null;

  let ringHost = document.getElementById('osu-pulse-rings');
  if (!ringHost) {
    ringHost = document.createElement('div');
    ringHost.id = 'osu-pulse-rings';
    root.appendChild(ringHost);
  }
  applyViewportWaveLayerBounds(ringHost);
  ringHost.style.willChange = 'transform';

  let centerRingHost = document.getElementById('osu-pulse-center-rings');
  if (!centerRingHost) {
    centerRingHost = document.createElement('div');
    centerRingHost.id = 'osu-pulse-center-rings';
    root.appendChild(centerRingHost);
  }
  applyViewportWaveLayerBounds(centerRingHost);
  centerRingHost.style.willChange = 'transform, opacity';

  let glow = document.getElementById('osu-pulse-glow');
  if (!glow) {
    glow = document.createElement('div');
    glow.id = 'osu-pulse-glow';
    glow.style.cssText = `
      position:absolute; pointer-events:none; mix-blend-mode:screen;
      opacity:0; filter:blur(0px);
      background:
        radial-gradient(circle at 50% 55%,
          rgba(255,255,255,.55) 0%,
          rgba(255,255,255,.18) 28%,
          transparent 70%);
      will-change: opacity, filter;`;
    root.appendChild(glow);
  }
  applyViewportWaveLayerBounds(glow);

  if (!window.__pmState)
    window.__pmState = {
      dx: 0,
      dy: 0,
      vx: 0,
      vy: 0,
      tx: 0,
      ty: 0,
      last: now(),
      lastBeatIdx: -1,
      breath: 0,
      vxLP: 0,
      vyLP: 0,
      __ts: performance.now(),
      __lastCenterRingTs: 0,
      __lastEnergyRingEnergy: 0,
      __flip: 1,
      __lastStrongAngle: 0
    };
  const S = window.__pmState;

  const rings = [];
  const centerRings = [];
  const MAX_RINGS = 4;
  const MAX_CENTER_RINGS = 5;
  const easeOutCubic = x => 1 - Math.pow(1 - x, 3);
  const easeOutQuad = x => 1 - (1 - x) * (1 - x);

  function spawnRing(detail) {
    const bpm = window.OsuBeat?.bpm?.();
    if (!bpm) return;
    if (window.PulseColorPerformance?.isInteracting?.()) return;

    while (rings.length >= MAX_RINGS) { const r = rings.shift(); r?.el?.remove(); }
    const conf = +(window.OsuBeat?.confidence?.() ?? 0);
    const period = clamp(60000 / Math.max(50, Math.min(210, bpm)), 285, 900);
    const dur = clamp(period * (0.95 + (1 - conf) * 0.25), 260, 1000);

    const down = !!detail?.downbeat;
    const energyState = window.PulseColorWaveEnergy?.getState?.() || {};
    const energy = clamp(energyState.energy || 0, 0, 1);
    const heavy = clamp(energyState.heavy || 0, 0, 1);
    const baseScale = down ? 1.035 : 1.015;
    const endScale = down ? 1.26 : 1.18;
    const startAlpha = clamp(0.052 + conf * 0.060 + heavy * 0.045 + energy * 0.026, 0.045, 0.185);

    const el = document.createElement('div');
    el.className = 'osu-ring';
    el.style.cssText = `
      position:absolute;inset:0;pointer-events:none;mix-blend-mode:screen;border-radius:50%;
      transform:scale(${baseScale});opacity:${startAlpha};transition:none;filter:blur(${down ? 0.6 : 0.4}px);
      background:
        radial-gradient(circle at 50% 55%,
          color-mix(in hsl, var(--ym-background-color-secondary-enabled-blur, rgba(255,255,255,.20)) 38%, transparent) 0%,
          color-mix(in hsl, var(--ym-background-color-secondary-enabled-blur, rgba(255,255,255,.16)) 18%, transparent) 30%,
          transparent 68%);
      will-change:transform,opacity,filter;`;
    ringHost.appendChild(el);
    rings.push({ el, t0: now(), dur, start: { s: baseScale, a: startAlpha }, end: { s: endScale, a: 0 } });
  }

  function spawnCenterRing(options = {}) {
    if (window.PulseColorPerformance?.isInteracting?.()) return;

    const t0 = now();
    const strength = clamp(Number.isFinite(+options.strength) ? +options.strength : 0.30, 0.06, 1.10);
    const energy = clamp(Number.isFinite(+options.energy) ? +options.energy : strength, 0, 1);
    const heavy = clamp(Number.isFinite(+options.heavy) ? +options.heavy : 0, 0, 1);
    const strong = !!options.strong;
    const energetic = clamp(strength * 0.56 + energy * 0.24 + heavy * 0.20 + (strong ? 0.16 : 0), 0, 1);
    const dur = clamp(options.dur || lerp(1840, 700, energetic), 680, 2000);
    const attack = lerp(0.44, 0.18, energetic);

    while (centerRings.length >= MAX_CENTER_RINGS) { const r = centerRings.shift(); r?.el?.remove(); }

    const startScale = clamp(0.045 + strength * 0.045, 0.045, 0.15);
    const midScale = clamp(0.24 + strength * 0.18 + heavy * 0.08, 0.22, 0.58);
    const endScale = clamp(0.84 + strength * 0.30 + heavy * 0.10, 0.76, 1.30);
    const peakAlpha = clamp(0.046 + strength * 0.086 + heavy * 0.036 + (strong ? 0.018 : 0), 0.040, 0.185);

    const el = document.createElement('div');
    el.className = 'osu-ring osu-center-ring';
    el.style.cssText = `
      position:absolute; inset:22%; pointer-events:none; mix-blend-mode:screen; border-radius:50%;
      transform:scale(${startScale}); opacity:0; filter:blur(24px);
      background:
        radial-gradient(circle at 50% 50%,
          color-mix(in hsl, var(--ym-background-color-secondary-enabled-blur, rgba(255,255,255,.20)) 50%, transparent) 0%,
          color-mix(in hsl, var(--ym-background-color-secondary-enabled-blur, rgba(255,255,255,.17)) 24%, transparent) 24%,
          color-mix(in hsl, var(--ym-background-color-secondary-enabled-blur, rgba(255,255,255,.13)) 12%, transparent) 48%,
          transparent 76%);
      will-change:transform,opacity,filter;`;

    centerRingHost.appendChild(el);
    centerRings.push({
      el,
      t0,
      dur,
      attack,
      start: { s: startScale, b: 24 },
      mid: { s: midScale, a: peakAlpha, b: strong ? 9 : 12 },
      end: { s: endScale, a: 0, b: strong ? 15 : 18 }
    });
    S.__lastCenterRingTs = t0;
  }

  function maybeSpawnEnergyCenterRing(energyState, waveActive, bpmDrive) {
    if (!waveActive) return;
    if (window.PulseColorPerformance?.isInteracting?.()) return;

    const t0 = now();
    const energy = clamp(energyState?.energy || 0, 0, 1);
    const rise = clamp(energyState?.ring || energyState?.rise || 0, 0, 1);
    const heavy = clamp(energyState?.heavy || 0, 0, 1);
    const motion = clamp(energyState?.motion || energy, 0, 1);
    const since = t0 - (S.__lastCenterRingTs || 0);
    const energyMix = clamp(energy * 0.44 + heavy * 0.42 + motion * 0.14, 0, 1);
    const minGap = bpmDrive
      ? lerp(1020, 330, Math.pow(clamp(heavy * 0.72 + motion * 0.28, 0, 1), 1.10))
      : lerp(2200, 360, Math.pow(energyMix, 1.12));

    const energyDelta = Math.max(0, energy - (S.__lastEnergyRingEnergy || 0));
    const riseGate = bpmDrive ? 0.44 : 0.215;
    const shouldSpawnByRise = rise >= riseGate && since >= minGap * 0.72;
    const shouldSpawnByStep = energyDelta >= (bpmDrive ? 0.18 : 0.135) && since >= minGap * 0.82;
    const shouldSpawnByHold = energy >= (bpmDrive ? 0.58 : 0.30) && since >= minGap;

    if (shouldSpawnByRise || shouldSpawnByStep || shouldSpawnByHold) {
      const strength = clamp(energy * 0.60 + heavy * 0.30 + rise * 0.28, 0.12, 0.98);
      spawnCenterRing({ strength, energy, heavy, strong: heavy > 0.70 && rise > 0.34 });
    }

    S.__lastEnergyRingEnergy = lerp(S.__lastEnergyRingEnergy || 0, energy, 0.16);
  }

  window.addEventListener('osu-beat-visual', e => {
    spawnRing(e.detail);
    const energy = window.PulseColorWaveEnergy?.getState?.() || {};
    const heavy = clamp(energy.heavy || 0, 0, 1);
    const beatStrength = clamp(
      (energy.energy || 0) * 0.42 + heavy * 0.24 + (+e.detail?.strength || 0) * 0.58 + (e.detail?.downbeat ? 0.08 : 0),
      0.10,
      0.92
    );
    const strongBeat = !!e.detail?.strong || !!e.detail?.resynced || !!e.detail?.downbeat;
    if (strongBeat || beatStrength > 0.42) {
      spawnCenterRing({ strength: beatStrength, energy: energy.energy || 0, heavy, strong: strongBeat && heavy > 0.36 });
    }
  });

  window.addEventListener('osu-voice', (e) => {
    if (!window.BeatDriverConfig?.MOTION_ENABLED) return;
    if ((window.PulseColorWaveMode?.getEffectiveMode?.() || String(window.BeatDriverConfig?.WAVE_DRIVE_MODE || '').trim().toLowerCase()) === 'bpm') return;

    const s = +e.detail?.strength || 0;
    if (s < 0.055) return;

    const energy = window.PulseColorWaveEnergy?.getState?.() || {};
    const motion = clamp(energy.motion || 0, 0, 1);
    if (motion < 0.18) return;

    const kick = (window.BeatDriverConfig?.MOTION_STRENGTH || 100) * 0.045 * Math.min(1, Math.max(0, s * 52)) * motion;
    const ang = Math.random() * Math.PI * 2;
    S.tx += Math.cos(ang) * kick;
    S.ty += Math.sin(ang) * kick;
  });

  window.addEventListener('osu-strong-beat', (e) => {
    if (!window.BeatDriverConfig?.MOTION_ENABLED) return;
    const waveMode = window.PulseColorWaveMode?.getEffectiveMode?.() || String(window.BeatDriverConfig?.WAVE_DRIVE_MODE || '').trim().toLowerCase();
    if (waveMode !== 'bpm') return;
    if (!(typeof __audioOn === 'function' ? __audioOn() : true)) return;

    const cfg = window.BeatDriverConfig || {};
    const energy = window.PulseColorWaveEnergy?.getState?.() || {};
    const strongMix = clamp((energy.energy || 0) * 0.36 + (energy.heavy || 0) * 0.54 + (energy.rise || 0) * 0.10, 0, 1);
    const radius = +(cfg.MOTION_STRENGTH || 8);
    const gain = +(cfg.BPM_MOTION_RESET_GAIN || 0.72);
    const strength = Math.min(1.08, Math.max(0.14, (+e.detail?.strength || 0) * 1.75));
    const amp = radius * gain * strength * lerp(0.20, 0.92, strongMix);
    const sign = (S.__flip = (S.__flip || 1) * -1);
    const angle = ((S.__lastStrongAngle || 0) + (Math.PI * (0.68 + Math.random() * 0.16)) * sign);
    S.__lastStrongAngle = angle;

    S.tx = Math.cos(angle) * amp;
    S.ty = Math.sin(angle) * amp * 0.82;
    S.dx = lerp(S.dx, S.tx * 0.28, 0.42);
    S.dy = lerp(S.dy, S.ty * 0.28, 0.42);
    S.vx *= 0.36;
    S.vy *= 0.36;
    S.vxLP *= 0.36;
    S.vyLP *= 0.36;
    S.breath *= 0.35;

    if (strongMix > 0.28) {
      spawnCenterRing({
        strength: clamp((+e.detail?.strength || 0) * 0.70 + strongMix * 0.34, 0.18, 0.96),
        energy: energy.energy || 0,
        heavy: energy.heavy || 0,
        strong: strongMix > 0.55,
        dur: lerp(1320, 820, strongMix)
      });
    }
  });

  const SEED_X = 11.37, SEED_Y = 29.51;
  const fract = x => x - Math.floor(x);
  const hash = n => fract(Math.sin(n * 12.9898 + 78.233) * 43758.5453);
  const vnoise = (tt, seed) => {
    const i = Math.floor(tt);
    const f = tt - i;
    const a = hash(i + seed);
    const b = hash(i + 1 + seed);
    const u = f * f * (3 - 2 * f);
    return (a * (1 - u) + b * u) * 2 - 1;
  };

  const styleCache = new WeakMap();
  let lastVisualFrameTs = 0;

  function setStyleCached(node, prop, value) {
    if (!node || !node.style) return;
    let cache = styleCache.get(node);
    if (!cache) {
      cache = Object.create(null);
      styleCache.set(node, cache);
    }
    if (cache[prop] === value) return;
    cache[prop] = value;
    node.style[prop] = value;
  }

  (function frame() {
    const tNow = performance.now();
    const interactionActive = !!window.PulseColorPerformance?.isInteracting?.();
    const targetFrameMs = interactionActive ? 66 : 16;

    if ((tNow - lastVisualFrameTs) < targetFrameMs) {
      requestAnimationFrame(frame);
      return;
    }

    lastVisualFrameTs = tNow;
    const dtSec = Math.min(0.080, (tNow - (S.__ts || tNow)) / 1000);
    S.__ts = tNow;

    const cfg = window.BeatDriverConfig || {};
    const bpm = window.OsuBeat?.bpm?.();
    const conf = +(window.OsuBeat?.confidence?.() ?? 0);
    const waveMode = (() => {
      const apiMode = window.PulseColorWaveMode?.getEffectiveMode?.();
      if (apiMode === 'bpm' || apiMode === 'raw') return apiMode;
      const cfgMode = String(cfg.WAVE_DRIVE_MODE || '').trim().toLowerCase();
      return cfgMode === 'bpm' ? 'bpm' : 'raw';
    })();
    const bpmDrive = waveMode === 'bpm';
    const audioOn = (typeof __audioOn === 'function')
      ? __audioOn()
      : ((window.__OSU__?.rms || 0) > (cfg.TH_RMS || 1e-6));
    const waveActive = bpmDrive
      ? (audioOn && !!bpm && conf >= (cfg.MIN_CONF ?? 0.35))
      : audioOn;
    const moving = !!cfg.MOTION_ENABLED && waveActive;

    const scales = window.BeatDriver?.scales?.(dtSec * 1000) || { outer: 1, inner: 1, active: false };
    const energyState = window.PulseColorWaveEnergy?.update?.(dtSec * 1000, { waveMode, waveActive, bpmDrive, conf }) || {
      energy: 0,
      flow: 0,
      heavy: 0,
      motion: 0,
      ring: 0
    };

    const energyMotion = clamp(energyState.motion ?? energyState.energy ?? 0, 0, 1);
    const flowMotion = clamp(energyState.flow ?? energyMotion, 0, 1);
    const heavyMotion = clamp(energyState.heavy ?? energyMotion, 0, 1);
    maybeSpawnEnergyCenterRing(energyState, waveActive, bpmDrive);

    const scaleLift = Math.max(scales.outer, scales.inner) - 1;
    const bassFlash = clamp((heavyMotion - 0.48) * 1.75 + (energyState.rise || 0) * 0.28, 0, 1);
    const baseBright = waveActive
      ? (1 + scaleLift * 0.56 + energyMotion * 0.050 + bassFlash * 0.155)
      : 1;
    const brightRaw = baseBright * Math.min(cfg.BRIGHTNESS_BASE || 1, 1.26);
    const bright = Math.min(brightRaw, 1.74);
    const rmsUi = bpmDrive
      ? clamp(scaleLift * 2.25 + conf * 0.08 + energyMotion * 0.16 + bassFlash * 0.18, 0, 1)
      : clamp((window.__OSU__?.rms || 0) * 1.70 + energyMotion * 0.14 + bassFlash * 0.22, 0, 1);
    const alpha = waveActive ? clamp(0.046 + 0.104 * clamp(rmsUi * 0.58 + energyMotion * 0.24 + bassFlash * 0.22, 0, 1), 0.046, 0.158) : 0.040;
    const renderBright = interactionActive ? 1 : bright;
    const renderAlpha = alpha;

    setStyleCached(root, 'filter', renderBright === 1 ? 'none' : `brightness(${renderBright.toFixed(3)})`);
    setStyleCached(root, 'opacity', renderAlpha.toFixed(3));

    if (interactionActive) {
      setStyleCached(glow, 'opacity', '0');
      setStyleCached(glow, 'filter', 'none');
    } else {
      const glowAlpha = clamp(0.018 + bassFlash * 0.180 + heavyMotion * 0.040, 0.018, 0.255);
      const glowBlur = 18 + bassFlash * 42 + heavyMotion * 12;
      setStyleCached(glow, 'opacity', glowAlpha.toFixed(3));
      setStyleCached(glow, 'filter', `blur(${glowBlur.toFixed(1)}px)`);
    }

    const motionMix = clamp((energyMotion - 0.14) * 1.42 + heavyMotion * 0.24, 0, 1);
    const motionAllowed = moving && (motionMix > 0.085 || heavyMotion > 0.18 || (bpmDrive && energyMotion > 0.13));
    const baseRadius = +(cfg.MOTION_STRENGTH || 8);
    const adaptiveRadius = baseRadius * lerp(0.12, 1.16, motionMix);
    const baseSpeed = clamp(cfg.MOTION_SPEED ?? 0.30, 0.05, 1);
    const adaptiveSpeed = clamp(baseSpeed * lerp(0.38, 1.42, motionMix), 0.035, 1.55);

    if (!motionAllowed) {
      const settle = 1 - Math.exp(-dtSec / 0.34);
      S.vx *= 0.64;
      S.vy *= 0.64;
      S.vxLP *= 0.72;
      S.vyLP *= 0.72;
      S.tx += (0 - S.tx) * settle;
      S.ty += (0 - S.ty) * settle;
      S.dx += (0 - S.dx) * settle;
      S.dy += (0 - S.dy) * settle;
      S.breath += (-S.breath) * (1 - Math.exp(-dtSec / 0.38));
    } else {
      const t = tNow * 0.001;
      const F = 0.014 * (0.55 + adaptiveSpeed) * (1 + flowMotion * 0.12 + heavyMotion * 0.28);
      const aimRadius = adaptiveRadius * (0.86 + flowMotion * 0.06 + heavyMotion * 0.08);
      const aimX = vnoise(t * F, SEED_X) * aimRadius * (0.58 + heavyMotion * 0.18);
      const aimY = vnoise(t * F * 1.123, SEED_Y) * aimRadius * (0.60 + flowMotion * 0.10 + heavyMotion * 0.10);

      const aimL = 1 - Math.exp(-dtSec / lerp(1.40, 0.42, clamp(energyMotion * 0.60 + flowMotion * 0.16 + heavyMotion * 0.24, 0, 1)));
      S.tx += (aimX - S.tx) * aimL;
      S.ty += (aimY - S.ty) * aimL;

      const rT = Math.hypot(S.tx, S.ty);
      if (rT > aimRadius) {
        const s = aimRadius / rT;
        S.tx *= s;
        S.ty *= s;
      }

      const wn = lerp(0.72, 3.55, clamp(adaptiveSpeed * 0.48 + heavyMotion * 0.32 + energyMotion * 0.20, 0, 1));
      const zeta = lerp(1.58, 1.12, clamp(energyMotion * 0.54 + heavyMotion * 0.46, 0, 1));
      const k = wn * wn;
      const c = 2 * zeta * wn;

      const ax = k * (S.tx - S.dx) - c * S.vx;
      const ay = k * (S.ty - S.dy) - c * S.vy;

      const vL = 1 - Math.exp(-dtSec / lerp(0.58, 0.26, clamp(energyMotion * 0.46 + heavyMotion * 0.54, 0, 1)));
      S.vx += ax * dtSec;
      S.vy += ay * dtSec;
      S.vx = S.vxLP + (S.vx - S.vxLP) * vL; S.vxLP = S.vx;
      S.vy = S.vyLP + (S.vy - S.vyLP) * vL; S.vyLP = S.vy;

      S.dx += S.vx * dtSec;
      S.dy += S.vy * dtSec;

      const rO = Math.hypot(S.dx, S.dy);
      if (rO > aimRadius) {
        const s = aimRadius / rO;
        S.dx *= s;
        S.dy *= s;
      }

      const breathMix = clamp(energyMotion * 0.55 + flowMotion * 0.20 + heavyMotion * 0.25, 0, 1);
      const breathAmp = adaptiveRadius * lerp(0.018, 0.145, breathMix);

      if (bpmDrive && bpm) {
        const omega = (Math.PI * 2) * (bpm / 60) * (0.18 + 0.34 * adaptiveSpeed);
        const aimB = Math.sin(t * omega) * breathAmp;
        const bL = 1 - Math.exp(-dtSec / 0.48);
        S.breath += (aimB - S.breath) * bL;
      } else {
        const flowOmega = 0.75 + adaptiveSpeed * 1.15 + flowMotion * 0.35;
        const aimB = Math.sin(t * flowOmega) * breathAmp * (0.18 + flowMotion * 0.24) * (0.35 + energyMotion * 0.65);
        const bL = 1 - Math.exp(-dtSec / 0.40);
        S.breath += (aimB - S.breath) * bL;
      }
    }

    const moveX = motionAllowed ? S.dx : 0;
    const moveY = motionAllowed ? (S.dy + (S.breath || 0)) : 0;
    const moveTransform = `translate3d(${moveX.toFixed(2)}px, ${moveY.toFixed(2)}px, 0)`;
    const visibleScaleBase = Math.max(scales.outer || 1, scales.inner || 1);
    const energyLift = motionAllowed ? (1 + energyMotion * 0.018 + bassFlash * 0.032) : 1;
    const visibleScale = visibleScaleBase * energyLift;

    setStyleCached(outer, 'transform', `${moveTransform} scale(${visibleScale.toFixed(4)})`);
    setStyleCached(ringHost, 'transform', moveTransform);
    setStyleCached(centerRingHost, 'transform', moveTransform);
    setStyleCached(glow, 'transform', moveTransform);

    if (inner) {
      setStyleCached(inner, 'display', 'none');
    }

    if (rings.length) {
      const tt = now();
      const toRemove = [];
      for (let i = 0; i < rings.length; i++) {
        const r = rings[i];
        const p = clamp((tt - r.t0) / r.dur, 0, 1);
        const k = easeOutCubic(p);
        setStyleCached(r.el, 'transform', `scale(${(r.start.s + (r.end.s - r.start.s) * k).toFixed(4)})`);
        setStyleCached(r.el, 'opacity', (r.start.a + (r.end.a - r.start.a) * k).toFixed(3));
        if (p >= 1) toRemove.push(i);
      }
      for (let i = toRemove.length - 1; i >= 0; i--) { const r = rings.splice(toRemove[i], 1)[0]; r?.el?.remove(); }
    }

    if (centerRings.length) {
      const tt = now();
      const toRemove = [];
      for (let i = 0; i < centerRings.length; i++) {
        const r = centerRings[i];
        const p = clamp((tt - r.t0) / r.dur, 0, 1);
        let scale = r.end.s;
        let alphaRing = r.end.a;
        let blur = r.end.b;

        const attack = clamp(r.attack || 0.34, 0.18, 0.48);

        if (p < attack) {
          const q = easeOutQuad(p / attack);
          scale = lerp(r.start.s, r.mid.s, q);
          alphaRing = lerp(0, r.mid.a, q);
          blur = lerp(r.start.b, r.mid.b, q);
        } else {
          const q = easeOutCubic((p - attack) / Math.max(0.001, 1 - attack));
          scale = lerp(r.mid.s, r.end.s, q);
          alphaRing = lerp(r.mid.a, r.end.a, q);
          blur = lerp(r.mid.b, r.end.b, q);
        }

        setStyleCached(r.el, 'transform', `scale(${scale.toFixed(4)})`);
        setStyleCached(r.el, 'opacity', alphaRing.toFixed(3));
        setStyleCached(r.el, 'filter', `blur(${blur.toFixed(1)}px)`);

        if (p >= 1) toRemove.push(i);
      }
      for (let i = toRemove.length - 1; i >= 0; i--) { const r = centerRings.splice(toRemove[i], 1)[0]; r?.el?.remove(); }
    }

    requestAnimationFrame(frame);
  })();
})();
