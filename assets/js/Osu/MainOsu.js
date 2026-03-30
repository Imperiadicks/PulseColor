/* ========================== Вспомогательно: true, если реально есть звук ========================== */
function __audioOn() {
  const rms = (window.__OSU__?.rms || 0);
  const thr = (window.BeatDriverConfig?.TH_RMS || 0.000001) * 1.2;
  return rms > thr;
}

function __mediaPlaying() {
  const nowTs = performance.now();

  const audios = Array.from(document.querySelectorAll('audio'));
  const audioPlaying = audios.some((el) => {
    if (!el || !el.isConnected) return false;
    if (el.paused || el.ended) return false;
    if ((el.playbackRate || 1) === 0) return false;
    return (el.readyState >= 2) || (Number(el.currentTime || 0) > 0);
  });

  const mediaSessionPlaying = (() => {
    try {
      return navigator?.mediaSession?.playbackState === 'playing';
    } catch {
      return false;
    }
  })();

  const uiPlaying = (() => {
    try {
      const pauseBtn = document.querySelector(
        '[data-test-id="player-controls-pause"], [data-test-id="PLAYER_CONTROLS_PAUSE"], button[aria-label*="Пауза"], button[title*="Пауза"]'
      );
      if (pauseBtn) return true;

      const playBtn = document.querySelector(
        '[data-test-id="player-controls-play"], [data-test-id="PLAYER_CONTROLS_PLAY"], button[aria-label*="Слушать"], button[aria-label*="Играть"], button[title*="Слушать"], button[title*="Играть"]'
      );
      if (playBtn) return false;
    } catch { }
    return null;
  })();

  const rmsPlaying = (() => {
    try {
      return (window.__OSU__?.rms || 0) > ((window.BeatDriverConfig?.TH_RMS || 0.000001) * 1.1);
    } catch {
      return false;
    }
  })();

  const playing = audioPlaying || mediaSessionPlaying || uiPlaying === true || rmsPlaying;

  if (playing) {
    __mediaPlaying.__lastOnTs = nowTs;
    return true;
  }

  if (uiPlaying === false) return false;

  return (nowTs - (__mediaPlaying.__lastOnTs || 0)) < 420;
}

/* ========================== AUDIOTAP v2 ========================== */
(() => {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;

  const OSU = (window.__OSU__ = window.__OSU__ || {});

  const LOOP_HIDDEN_MS = 250;
  let __loopRunning = false;
  let __loopHandle = 0;
  let __loopType = '';
  let __lastTick = performance.now();

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
      const ctx = OSU?.ctx;
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => { });
    } catch { }
  }

  function startLoop() {
    if (__loopRunning) return;
    __loopRunning = true;
    __lastTick = performance.now();
    __scheduleNext();
  }

  function __ensureLoopAlive() {
    const now = performance.now();
    if (!__loopRunning) {
      startLoop();
      return;
    }
    if ((now - __lastTick) > 2000) {
      OSU.__tapRaf = 0;
      __scheduleNext();
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      __resumeCtxIfNeeded();
      __ensureLoopAlive();
    }
  });

  window.addEventListener('focus', () => {
    __resumeCtxIfNeeded();
    __ensureLoopAlive();
  });

  window.addEventListener('pageshow', () => {
    __resumeCtxIfNeeded();
    __ensureLoopAlive();
  });

  const mediaLifecycleBound = new WeakSet();
  function attachAudioLifecycle(el) {
    if (!el || mediaLifecycleBound.has(el)) return;
    mediaLifecycleBound.add(el);

    const ping = () => {
      __resumeCtxIfNeeded();
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
  }

  // already patched?
  // Раньше тут было: if (!OSU.__tapRaf) OSU.__tapRaf = requestAnimationFrame(loop);
  // Это ломается после фона (OSU.__tapRaf "залипает"). Теперь просто стартуем планировщик.
  if (AudioNode.prototype.__osuTapPatched) { try { startLoop(); } catch { } return; }

  let ctxMain = null;
  const bundles = new Set();
  const perCtx = new WeakMap();
  const tappedAudio = new WeakSet();
  const teedNodes = new WeakSet();

  function ensureBundleForCtx(ctx) {
    if (!ctx) return null;
    let b = perCtx.get(ctx);
    if (!b) {
      const a = ctx.createAnalyser();
      a.fftSize = 4096;
      a.smoothingTimeConstant = 0.55;
      b = { ctx, analyser: a, time: new Float32Array(a.fftSize), spec: new Uint8Array(a.frequencyBinCount) };
      perCtx.set(ctx, b); bundles.add(b);
      if (!OSU.analyser) {
        OSU.ctx = ctx; ctxMain = ctx;
        OSU.analyser = a;
        OSU.fftBins = a.frequencyBinCount;
        OSU.spec = b.spec;
        OSU.timeBuf = new Uint8Array(a.fftSize);
        try {
          if (!ctx.__osuStateBound && typeof ctx.addEventListener === 'function') {
            ctx.addEventListener('statechange', __ensureLoopAlive);
            ctx.__osuStateBound = true;
          }
        } catch { }
        window.showLog?.('[Tap] bound main analyser');
      }
    }
    return b;
  }

  const origConnect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dest, ...rest) {
    const out = origConnect.call(this, dest, ...rest);
    try {
      const ctx = this.context || dest?.context;
      if (dest && ctx && /Destination/i.test(dest.constructor?.name || '')) {
        const b = ensureBundleForCtx(ctx);
        if (b && !teedNodes.has(this)) {
          try { origConnect.call(this, b.analyser); } catch { }
          teedNodes.add(this);
          startLoop();
          window.showLog?.('[Tap] tee @dest from ' + (this.constructor?.name || 'AudioNode'));
        }
      }
    } catch { }
    return out;
  };
  AudioNode.prototype.__osuTapPatched = true;

  // прямой захват <audio>
  function tapMediaElement(el) {
    if (!el || tappedAudio.has(el)) return;
    tappedAudio.add(el);

    const ctx = ctxMain || new AC();
    ctxMain = ctx;

    const stream = el.captureStream?.();
    if (stream) {
      const src = ctx.createMediaStreamSource(stream);
      const b = ensureBundleForCtx(ctx);
      try { src.connect(b.analyser); } catch { }
      startLoop();
      window.showLog?.('[Tap] captureStream attached');
      return;
    }
    try {
      const src = ctx.createMediaElementSource(el);
      const b = ensureBundleForCtx(ctx);
      src.connect(b.analyser);
      startLoop();
      window.showLog?.('[Tap] mediaElementSource attached');
    } catch (e) {
      window.showLog?.('[Tap] mediaElementSource failed: ' + e?.name);
    }
  }
  document.querySelectorAll('audio').forEach(el => { tapMediaElement(el); attachAudioLifecycle(el); });
  new MutationObserver(muts => {
    for (const m of muts) {
      m.addedNodes && m.addedNodes.forEach(n => {
        if (n && n.nodeType === 1) {
          if (n.tagName === 'AUDIO') {
            tapMediaElement(n);
            attachAudioLifecycle(n);
          }
          n.querySelectorAll && n.querySelectorAll('audio').forEach(el => {
            tapMediaElement(el);
            attachAudioLifecycle(el);
          });
        }
      });
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
  if (OSU.ctx) ensureBundleForCtx(OSU.ctx);

  // цикл анализа
  let ema = 0;
  function loop() {
    __lastTick = performance.now();

    let maxRms = 0;
    for (const b of bundles) {
      try {
        b.analyser.getFloatTimeDomainData(b.time);
        let s = 0; const t = b.time;
        for (let i = 0; i < t.length; i++) { const v = t[i]; s += v * v; }
        const rms = Math.sqrt(s / t.length);
        if (rms > maxRms) maxRms = rms;
        b.analyser.getByteFrequencyData(b.spec);
        if (b.analyser === OSU.analyser) OSU.spec = b.spec;
      } catch { }
    }
    ema = ema * 0.85 + maxRms * 0.15;
    OSU.rms = ema;

    __scheduleNext();
  }
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

  const isExternalSource = () => bpmSource === 'ai' || bpmSource === 'cache' || bpmSource === 'external';

  const now = () => performance.now();
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));


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

    // непрерывная огибающая голоса (EMA)
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
    return f;
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

  function loop() {
    bindAnalyser();
    const t = now();
    if (!analyser) { requestAnimationFrame(loop); return; }

    const f = spectralFlux(); pushFlux(t, f);
    const thr = localFluxThresh();
    const isPeak = f > thr && (f - (fluxBuf.at(-2) || 0)) > 0;

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
        const payload = { time: t, bpm: bpm || null, beatIndex: ++beatIndex, downbeat: (beatIndex % 4) === 1, confidence: conf };
        dispatch('osu-beat', payload);
        dispatch('osu-beat-visual', payload);
      }
    }

    const bpmDrive = isBpmWaveDrive();
    const mediaPlaying = (typeof __mediaPlaying === 'function')
      ? __mediaPlaying()
      : (__audioOn?.() ?? true);

    if (locked && periodMs > 0) {
      if (bpmDrive) {
        if (mediaPlaying) {
          if (!bpmClockRunning || !nextBeat) nextBeat = t + Math.min(periodMs, 120);
          bpmClockRunning = true;
          while (t >= nextBeat) {
            const payload = { time: nextBeat, bpm, beatIndex: ++beatIndex, downbeat: (beatIndex % 4) === 1, confidence: conf };
            dispatch('osu-beat', payload);
            dispatch('osu-beat-visual', payload);
            nextBeat += periodMs;
          }
        } else {
          bpmClockRunning = false;
        }
      } else if (isExternalSource() || (__audioOn?.() ?? true)) {
        while (t >= nextBeat) {
          const payload = { time: nextBeat, bpm, beatIndex: ++beatIndex, downbeat: (beatIndex % 4) === 1, confidence: conf };
          dispatch('osu-beat', payload);
          dispatch('osu-beat-visual', payload);
          nextBeat += periodMs;
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
    bpm = b; periodMs = 60000 / b; locked = true; conf = Math.max(conf, 0.50); nextBeat = now() + periodMs; bpmClockRunning = false; bpmSource = source || 'external';
  };

  OsuBeat.preset = (presetBpm, options = {}) => {
    if (!presetBpm) return;
    const b = clamp(Math.round(presetBpm), CFG.bpmMin, CFG.bpmMax);
    const opts = (options && typeof options === 'object') ? options : {};
    const source = opts.source || 'external';
    const lock = opts.lock !== false;
    bpm = b; periodMs = 60000 / b; locked = !!lock; conf = Math.max(conf, lock ? 0.50 : 0.20);
    nextBeat = now() + periodMs; beatIndex = 0; bpmClockRunning = false; bpmSource = source;
  };
  OsuBeat.reset = () => {
    fluxBuf = []; timeBuf = [];
    lastOnsetT = 0; lastBeatT = 0;
    ibIs = [];
    bpm = 0; periodMs = 0;
    locked = false; conf = 0;
    nextBeat = 0; beatIndex = 0;
    bpmClockRunning = false;
    lastRetempo = 0; bpmSource = 'none';
  };

  requestAnimationFrame(loop);
})();

/* ========================== BeatDriver (импульсы + шкала) ========================== */
(() => {
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  let impKick = 0, impVoice = 0;

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
    if (!isBpmWaveDriveForVisuals()) return audioActive();
    const bpm = +(window.OsuBeat?.bpm?.() || 0);
    const minConf = +(window.BeatDriverConfig?.MIN_CONF ?? 0.35);
    const mediaPlaying = (typeof __mediaPlaying === 'function')
      ? __mediaPlaying()
      : audioActive();
    return mediaPlaying && !!bpm && getConf() >= minConf;
  };

  const onBeat = (e) => {
    if (!beatVisualActive()) return;
    const c = getConf();
    const weight = 0.6 + 0.4 * clamp(c, 0, 1);
    const down = !!e.detail?.downbeat;
    const cfg = window.BeatDriverConfig || {};
    const base = down ? (cfg.BEAT_IMPULSE_DOWN || 0) : (cfg.BEAT_IMPULSE || 0);
    impKick += base * weight * (cfg.OUTER_GAIN || 1);

    try {
      const outer = document.getElementById('osu-pulse-outer');
      if (outer) {
        outer.classList.remove('pulse'); void outer.offsetWidth;
        outer.classList.add('pulse');
        setTimeout(() => outer && outer.classList.remove('pulse'), 480);
      }
    } catch { }
  };
  window.addEventListener('osu-beat-visual', onBeat);
  window.addEventListener('osu-beat', onBeat);

  window.addEventListener('osu-kick', (e) => {
    if (isBpmWaveDriveForVisuals()) return;
    if (!audioActive()) return;
    const s = +e.detail?.strength || 0;
    if (s < 0.0045) return;
    const cfg = window.BeatDriverConfig || {};
    impKick += Math.min(0.16, (cfg.KICK_IMPULSE_BASE || 0) + s * 0.55) * (cfg.OUTER_GAIN || 1);
  });

  window.addEventListener('osu-voice', (e) => {
    if (isBpmWaveDriveForVisuals()) return;
    if (!audioActive()) return;
    const s = +e.detail?.strength || 0;
    const cfg = window.BeatDriverConfig || {};
    const gainImp = (cfg.VOICE_IMPULSE_GAIN ?? 1.20); // усилитель события голоса
    const add = Math.min(0.22, (0.075 + s * 0.90)) * (cfg.INNER_GAIN || 1) * gainImp;
    impVoice += add;
  });

  window.BeatDriver = {
    scales(dtMs) {
      const cfg = window.BeatDriverConfig || {};
      const bpmDrive = isBpmWaveDriveForVisuals();
      const active = bpmDrive ? beatVisualActive() : audioActive();

      const dKick = Math.exp(-dtMs / (cfg.DECAY_MS || 150));
      const dVoice = Math.exp(-dtMs / (cfg.DECAY_MS_VOICE || 190));
      impKick *= dKick;
      impVoice *= dVoice;

      if (!active) return { outer: 1, inner: 1, active: false };

      const soft = (x, k = 0.9) => Math.tanh(x * k);

      const ph = window.OsuBeat?.phase?.() ?? 0;
      const breath = Math.sin(ph * 2 * Math.PI) * 0.008;
      const rms = bpmDrive ? 0 : Math.min(1, Math.max(0, (window.__OSU__?.rms || 0) * 3.0));
      const micro = rms * 0.006;

      const voiceEnv = bpmDrive ? 0 : Math.max(0, Math.min(1, (window.__OSU__?.voiceEnv || 0)));
      const envGain = (cfg.VOICE_ENVELOPE_GAIN ?? 1.40);

      if (cfg.UNIFIED_MODE) {
        const uni = soft(impKick * .6 + (impVoice + voiceEnv * envGain) * .6) + breath + micro;
        const minS = Math.min(cfg.OUTER_MIN_SCALE || 0.94, cfg.INNER_MIN_SCALE || 0.95);
        const maxS = Math.max(cfg.OUTER_MAX_SCALE || 1.6, cfg.INNER_MAX_SCALE || 1.4);
        const s = Math.min(maxS, Math.max(minS, 1 + uni));
        return { outer: s, inner: s, active: true };
      }

      const outerRaw = 1 + breath + soft(impKick) + micro;
      const innerRaw = 1 + breath + soft(impVoice * 0.70 + voiceEnv * envGain) + micro * 0.40;

      const outer = Math.min(cfg.OUTER_MAX_SCALE || 1.6, Math.max(cfg.OUTER_MIN_SCALE || 0.94, outerRaw));
      const inner = Math.min(cfg.INNER_MAX_SCALE || 1.4, Math.max(cfg.INNER_MIN_SCALE || 0.95, innerRaw));

      return { outer, inner, active: true };
    },
    isActive() { return beatVisualActive(); }
  };
})();

/* ========================== VISUAL (classic + segmented spectrum) ========================== */
(() => {
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const now = () => performance.now();

  const BAR_COUNT = 34;
  const SEGMENT_COUNT = 18;
  const LOW_BIN = 2;
  const BAND_CURVE = 1.85;
  const MAX_VISUAL_HEIGHT = 0.58;
  const MAX_SEGMENT_USAGE = 0.54;

  const getRendererMode = () => {
    const raw = String(window.BeatDriverConfig?.WAVE_RENDER_STYLE || '').trim().toLowerCase();
    return raw === 'classic' ? 'classic' : 'blocks';
  };

  let root = document.getElementById('osu-pulse');
  if (!root) {
    root = document.createElement('div');
    root.id = 'osu-pulse';
    document.body.appendChild(root);
  }

  let outer = document.getElementById('osu-pulse-outer');
  if (!outer) {
    outer = document.createElement('div');
    outer.id = 'osu-pulse-outer';
    root.appendChild(outer);
  }

  let inner = document.getElementById('osu-pulse-inner');
  if (!inner) {
    inner = document.createElement('div');
    inner.id = 'osu-pulse-inner';
    root.appendChild(inner);
  }

  let ringHost = document.getElementById('osu-pulse-rings');
  if (!ringHost) {
    ringHost = document.createElement('div');
    ringHost.id = 'osu-pulse-rings';
    root.appendChild(ringHost);
  }

  let glow = document.getElementById('osu-pulse-glow');
  if (!glow) {
    glow = document.createElement('div');
    glow.id = 'osu-pulse-glow';
    root.appendChild(glow);
  }

  let currentMode = '';
  const barsState = {
    topBars: [],
    reflectionBars: [],
    levels: new Array(BAR_COUNT).fill(0),
    peaks: new Array(BAR_COUNT).fill(0),
    peakHold: new Array(BAR_COUNT).fill(0),
    activeCache: new Array(BAR_COUNT).fill(-1),
    peakCache: new Array(BAR_COUNT).fill(-1),
    loudnessRef: 0.22,
    beatLift: 0,
  };

  if (!window.__pmState) {
    window.__pmState = {
      dx: 0, dy: 0, vx: 0, vy: 0,
      tx: 0, ty: 0,
      lastBeatIdx: -1,
      breath: 0,
      vxLP: 0, vyLP: 0,
      __ts: performance.now(),
    };
  }
  const S = window.__pmState;
  const rings = [];
  const MAX_RINGS = 6;
  const easeOutCubic = x => 1 - Math.pow(1 - x, 3);
  const SEED_X = 11.37;
  const SEED_Y = 29.51;
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

  function barColor(index) {
    const t = index / Math.max(1, BAR_COUNT - 1);
    const hue = lerp(292, 198, t);
    const sat = lerp(44, 56, t);
    const light = lerp(66, 72, t);
    return `hsl(${hue.toFixed(1)}deg ${sat.toFixed(1)}% ${light.toFixed(1)}%)`;
  }

  function buildBars(layer, store) {
    store.length = 0;
    for (let i = 0; i < BAR_COUNT; i++) {
      const bar = document.createElement('div');
      bar.className = 'osu-bar';
      bar.style.setProperty('--osu-bar-color', barColor(i));
      bar.style.setProperty('--osu-bar-index', String(i));

      const segments = [];
      for (let j = 0; j < SEGMENT_COUNT; j++) {
        const seg = document.createElement('span');
        seg.className = 'osu-bar__segment';
        bar.appendChild(seg);
        segments.push(seg);
      }
      layer.appendChild(bar);
      store.push({ bar, segments, active: 0, peak: -1 });
    }
  }

  function clearRings() {
    while (rings.length) {
      const ring = rings.pop();
      ring?.el?.remove();
    }
    ringHost.replaceChildren();
  }

  function setBarState(item, activeCount, peakIndex) {
    if (!item || (item.active === activeCount && item.peak === peakIndex)) return;
    item.active = activeCount;
    item.peak = peakIndex;

    for (let i = 0; i < item.segments.length; i++) {
      const seg = item.segments[i];
      const on = i < activeCount;
      seg.classList.toggle('is-active', on);
      seg.classList.toggle('is-cap', on && i === Math.max(0, activeCount - 1));
      seg.classList.toggle('is-peak', peakIndex >= 0 && i === peakIndex);
    }
  }

  function bandRange(index, total, specLength) {
    const hi = Math.max(LOW_BIN + 2, specLength - 1);
    const a = Math.floor(LOW_BIN + Math.pow(index / total, BAND_CURVE) * (hi - LOW_BIN));
    const b = Math.floor(LOW_BIN + Math.pow((index + 1) / total, BAND_CURVE) * (hi - LOW_BIN));
    return [Math.max(LOW_BIN, a), Math.max(a + 1, b)];
  }

  function readBands() {
    const spec = window.__OSU__?.spec;
    if (!spec || !spec.length) return null;

    const raw = new Array(BAR_COUNT).fill(0);
    let master = 0;
    let hottest = 0;

    for (let i = 0; i < BAR_COUNT; i++) {
      const [start, end] = bandRange(i, BAR_COUNT, spec.length);
      let sum = 0;
      let weightSum = 0;
      for (let j = start; j < end; j++) {
        const n = spec[j] / 255;
        const ratio = j / Math.max(1, spec.length - 1);
        const weight = 1.35 - ratio * 0.55;
        sum += n * n * weight;
        weightSum += weight;
      }
      const energy = Math.sqrt(sum / Math.max(1e-6, weightSum));
      const tilt = 1.08 - (i / Math.max(1, BAR_COUNT - 1)) * 0.14;
      const value = energy * tilt;
      raw[i] = value;
      master += value;
      if (value > hottest) hottest = value;
    }

    const avg = master / Math.max(1, BAR_COUNT);
    const targetRef = Math.max(0.10, hottest * 0.92, avg * 1.95);
    const refAttack = 0.18;
    const refRelease = 0.045;
    const refLerp = targetRef > barsState.loudnessRef ? refAttack : refRelease;
    barsState.loudnessRef = lerp(barsState.loudnessRef, targetRef, refLerp);

    const out = new Array(BAR_COUNT).fill(0);
    const denom = Math.max(0.08, barsState.loudnessRef);
    for (let i = 0; i < BAR_COUNT; i++) {
      const normalized = clamp(raw[i] / denom, 0, 1.25);
      const shaped = Math.pow(normalized, 0.88);
      out[i] = clamp(shaped * MAX_VISUAL_HEIGHT, 0, MAX_VISUAL_HEIGHT);
    }
    return out;
  }

  function applyVisualMode(nextMode) {
    if (nextMode === currentMode) return;
    currentMode = nextMode;
    root.dataset.waveRenderer = nextMode;
    root.classList.remove('is-active');
    root.style.removeProperty('--osu-alpha');
    root.style.removeProperty('--osu-bright');
    root.style.removeProperty('--osu-offset-xvw');
    root.style.removeProperty('--osu-beat-lift');
    root.style.removeProperty('--osu-floor-alpha');
    root.style.removeProperty('filter');
    root.style.removeProperty('opacity');
    root.style.removeProperty('transform');

    [outer, inner, ringHost, glow].forEach((el) => {
      el.replaceChildren();
      el.removeAttribute('style');
      el.className = '';
    });

    if (nextMode === 'blocks') {
      outer.classList.add('osu-bars', 'osu-bars--top');
      inner.classList.add('osu-bars', 'osu-bars--reflection');
      ringHost.classList.add('osu-bars-floor');
      glow.classList.add('osu-bars-mist');

      barsState.levels.fill(0);
      barsState.peaks.fill(0);
      barsState.peakHold.fill(0);
      barsState.activeCache.fill(-1);
      barsState.peakCache.fill(-1);
      buildBars(outer, barsState.topBars);
      buildBars(inner, barsState.reflectionBars);
    } else {
      ringHost.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
      glow.style.cssText = `
        position:absolute; inset:0; pointer-events:none; mix-blend-mode:screen;
        opacity:0; filter:blur(0px);
        background:
          radial-gradient(circle at 50% 55%,
            rgba(255,255,255,.55) 0%,
            rgba(255,255,255,.18) 28%,
            transparent 70%);
        will-change: opacity, filter;`;
      clearRings();
    }
  }

  function spawnRing(detail) {
    if (currentMode !== 'classic') return;
    const bpm = window.OsuBeat?.bpm?.();
    if (!bpm) return;

    while (rings.length >= MAX_RINGS) {
      const r = rings.shift();
      r?.el?.remove();
    }
    const conf = +(window.OsuBeat?.confidence?.() ?? 0);
    const period = clamp(60000 / Math.max(50, Math.min(210, bpm)), 285, 900);
    const dur = clamp(period * (0.95 + (1 - conf) * 0.25), 260, 1000);

    const down = !!detail?.downbeat;
    const baseScale = down ? 1.05 : 1.02;
    const endScale = down ? 1.38 : 1.26;
    const startAlpha = 0.10 + conf * 0.10;

    const el = document.createElement('div');
    el.className = 'osu-ring';
    el.style.cssText = `
      position:absolute;inset:0;pointer-events:none;mix-blend-mode:screen;border-radius:50%;
      transform:scale(${baseScale});opacity:${startAlpha};transition:none;filter:blur(${down ? 0.6 : 0.4}px);
      background:
        radial-gradient(circle at 50% 55%,
          color-mix(in hsl, var(--ym-background-color-secondary-enabled-blur, rgba(255,255,255,.24)) 52%, transparent) 0%,
          color-mix(in hsl, var(--ym-background-color-secondary-enabled-blur, rgba(255,255,255,.24)) 26%, transparent) 28%,
          transparent 70%);
      will-change:transform,opacity,filter;`;
    ringHost.appendChild(el);
    rings.push({ el, t0: now(), dur, start: { s: baseScale, a: startAlpha }, end: { s: endScale, a: 0 } });
  }

  window.addEventListener('osu-beat', e => spawnRing(e.detail));
  window.addEventListener('osu-beat-visual', e => spawnRing(e.detail));

  window.addEventListener('osu-voice', (e) => {
    if (currentMode !== 'classic') return;
    const s = +e.detail?.strength || 0;
    const kick = (window.BeatDriverConfig?.MOTION_STRENGTH || 100) * 0.18 * Math.min(1, Math.max(0, s * 160));
    const ang = Math.random() * Math.PI * 2;
    S.tx += Math.cos(ang) * kick;
    S.ty += Math.sin(ang) * kick;
  });

  let lastTs = performance.now();
  (function frame() {
    const tNow = performance.now();
    const dtSec = Math.min(0.060, (tNow - lastTs) / 1000);
    lastTs = tNow;
    S.__ts = tNow;

    const cfg = window.BeatDriverConfig || {};
    const mode = getRendererMode();
    applyVisualMode(mode);

    if (mode === 'blocks') {
      const apiMode = window.PulseColorWaveMode?.getEffectiveMode?.();
      const waveMode = (apiMode === 'bpm' || apiMode === 'raw')
        ? apiMode
        : (String(cfg.WAVE_DRIVE_MODE || '').trim().toLowerCase() === 'bpm' ? 'bpm' : 'raw');
      const bpmDrive = waveMode === 'bpm';

      const audioOn = (typeof __audioOn === 'function')
        ? __audioOn()
        : ((window.__OSU__?.rms || 0) > (cfg.TH_RMS || 1e-6));
      const mediaPlaying = (typeof __mediaPlaying === 'function')
        ? __mediaPlaying()
        : audioOn;
      const scales = window.BeatDriver?.scales?.(dtSec * 1000) || { outer: 1, inner: 1, active: false };

      const pulse = clamp((Math.max(scales.outer || 1, scales.inner || 1) - 1) * 1.85, 0, 0.55);
      const bands = readBands();
      const beatPulseTarget = bpmDrive
        ? clamp(pulse * 0.08, 0, 0.035)
        : 0;
      const beatPulseLerp = beatPulseTarget > barsState.beatLift ? 0.20 : 0.08;
      barsState.beatLift = lerp(barsState.beatLift, beatPulseTarget, beatPulseLerp);

      for (let i = 0; i < BAR_COUNT; i++) {
        let target = 0;
        if (bands) {
          target = bands[i] + barsState.beatLift;
        } else {
          target = barsState.beatLift;
        }
        target = clamp(target, 0, MAX_VISUAL_HEIGHT);

        const attack = 1 - Math.exp(-dtSec / 0.045);
        const release = 1 - Math.exp(-dtSec / 0.18);
        const smoothing = target > barsState.levels[i] ? attack : release;
        barsState.levels[i] = lerp(barsState.levels[i], target, smoothing);

        const fall = 1 - Math.exp(-dtSec / 0.24);
        barsState.peaks[i] = Math.max(barsState.levels[i], lerp(barsState.peaks[i], barsState.levels[i], fall));
        if (barsState.levels[i] >= barsState.peaks[i] - 0.015) barsState.peakHold[i] = 0.10;
        else barsState.peakHold[i] = Math.max(0, barsState.peakHold[i] - dtSec);
        if (barsState.peakHold[i] <= 0) barsState.peaks[i] = Math.max(barsState.levels[i], barsState.peaks[i] - dtSec * 0.75);

        const visibleSegments = Math.max(2, Math.round((SEGMENT_COUNT - 2) * MAX_SEGMENT_USAGE));
        const activeCount = clamp(
          Math.round((barsState.levels[i] / Math.max(0.001, MAX_VISUAL_HEIGHT)) * visibleSegments),
          0,
          visibleSegments
        );
        const peakIndex = barsState.peaks[i] > 0.05
          ? clamp(
            Math.round((barsState.peaks[i] / Math.max(0.001, MAX_VISUAL_HEIGHT)) * visibleSegments) - 1,
            0,
            visibleSegments
          )
          : -1;

        if (barsState.activeCache[i] !== activeCount || barsState.peakCache[i] !== peakIndex) {
          barsState.activeCache[i] = activeCount;
          barsState.peakCache[i] = peakIndex;
          setBarState(barsState.topBars[i], activeCount, peakIndex);
          setBarState(barsState.reflectionBars[i], activeCount, peakIndex);
        }
      }

      const visible = mediaPlaying || audioOn || pulse > 0.02 || barsState.levels.some(v => v > 0.02);
      const avgLevel = barsState.levels.reduce((acc, v) => acc + v, 0) / Math.max(1, BAR_COUNT);
      const offsetVW = Number(cfg.OFFSET_X_VW || 0);
      const alpha = visible ? clamp(0.11 + (avgLevel / MAX_VISUAL_HEIGHT) * 0.56 + pulse * 0.18, 0.12, 0.92) : 0.06;
      const bright = clamp((cfg.BRIGHTNESS_BASE || 1) * (1 + (avgLevel / MAX_VISUAL_HEIGHT) * 0.76 + pulse * 0.38), 1, 4.2);
      const beatLift = clamp((barsState.beatLift / Math.max(0.001, MAX_VISUAL_HEIGHT)) * 12, 0, 10);

      root.style.setProperty('--osu-alpha', alpha.toFixed(3));
      root.style.setProperty('--osu-bright', bright.toFixed(3));
      root.style.setProperty('--osu-offset-xvw', `${offsetVW}vw`);
      root.style.setProperty('--osu-beat-lift', `${beatLift.toFixed(2)}px`);
      root.style.setProperty('--osu-floor-alpha', clamp(0.08 + (avgLevel / MAX_VISUAL_HEIGHT) * 0.20 + pulse * 0.12, 0.08, 0.32).toFixed(3));
      root.classList.toggle('is-active', visible);
      outer.classList.toggle('pulse', pulse > 0.16);
    } else {
      const bpm = window.OsuBeat?.bpm?.();
      const conf = +(window.OsuBeat?.confidence?.() ?? 0);
      const audioOn = (typeof __audioOn === 'function')
        ? __audioOn()
        : ((window.__OSU__?.rms || 0) > (cfg.TH_RMS || 1e-6));
      const moving = !!cfg.MOTION_ENABLED && (audioOn || (!!bpm && conf >= (cfg.MIN_CONF ?? 0.35)));
      const scales = window.BeatDriver?.scales?.(dtSec * 1000) || { outer: 1, inner: 1, active: false };

      const baseBright = moving ? (1 + (Math.max(scales.outer, scales.inner) - 1) * 0.9) : 1;
      const brightRaw = baseBright * (cfg.BRIGHTNESS_BASE || 1);
      const bright = Math.min(brightRaw, 8);
      const rmsUi = clamp((window.__OSU__?.rms || 0) * 3.0, 0, 1);
      const alpha = moving ? (0.05 + (0.18 - 0.05) * rmsUi) : 0.05;
      const offsetVW = (cfg.OFFSET_X_VW || 1);

      root.style.filter = `brightness(${bright.toFixed(3)})`;
      root.style.opacity = alpha.toFixed(3);
      root.style.transform = `translateX(${offsetVW}vw)`;

      const over = Math.max(0, bright - 2);
      const glowAlpha = Math.min(0.65, 0.18 + over * 0.12);
      const glowBlur = Math.min(90, 14 + over * 24);
      glow.style.opacity = glowAlpha.toFixed(3);
      glow.style.filter = `blur(${glowBlur.toFixed(1)}px)`;

      const R = (cfg.MOTION_STRENGTH || 100);
      const speed = Math.max(0.05, Math.min(1, cfg.MOTION_SPEED ?? 0.30));

      if (!moving) {
        S.vx *= 0.80; S.vy *= 0.80;
        S.tx *= 0.85; S.ty *= 0.85;
        S.breath += (-S.breath) * (1 - Math.exp(-dtSec / 0.45));
      } else {
        const t = tNow * 0.001;
        const F = 0.05 * (0.35 + speed);
        const aimX = vnoise(t * F, SEED_X) * R * 0.90;
        const aimY = vnoise(t * F * 1.123, SEED_Y) * R * 0.90;

        const aimL = 1 - Math.exp(-dtSec / 0.70);
        S.tx += (aimX - S.tx) * aimL;
        S.ty += (aimY - S.ty) * aimL;

        const rT = Math.hypot(S.tx, S.ty);
        if (rT > R) {
          const s = R / rT;
          S.tx *= s; S.ty *= s;
        }

        const wn = 3.2 * (0.35 + speed);
        const zeta = 1.15;
        const k = wn * wn;
        const c = 2 * zeta * wn;

        let ax = k * (S.tx - S.dx) - c * S.vx;
        let ay = k * (S.ty - S.dy) - c * S.vy;

        const vL = 1 - Math.exp(-dtSec / 0.25);
        S.vx += ax * dtSec; S.vy += ay * dtSec;
        S.vx = S.vxLP + (S.vx - S.vxLP) * vL; S.vxLP = S.vx;
        S.vy = S.vyLP + (S.vy - S.vyLP) * vL; S.vyLP = S.vy;

        S.dx += S.vx * dtSec;
        S.dy += S.vy * dtSec;

        const rO = Math.hypot(S.dx, S.dy);
        if (rO > R) {
          const s = R / rO;
          S.dx *= s; S.dy *= s;
        }

        if (bpm) {
          const omega = (Math.PI * 2) * (bpm / 60) * (0.22 + 0.4 * speed);
          const aimB = Math.sin(t * omega) * R * 0.22;
          const bL = 1 - Math.exp(-dtSec / 0.50);
          S.breath += (aimB - S.breath) * bL;
        }
      }

      outer.style.transform = `scale(${(scales.outer || 1).toFixed(4)})`;
      inner.style.transform = `translate(${S.dx.toFixed(2)}px, ${(S.dy + (S.breath || 0)).toFixed(2)}px) scale(${(scales.inner || 1).toFixed(4)})`;

      if (rings.length) {
        const tt = now();
        const toRemove = [];
        for (let i = 0; i < rings.length; i++) {
          const r = rings[i];
          const p = clamp((tt - r.t0) / r.dur, 0, 1);
          const k = easeOutCubic(p);
          r.el.style.transform = `scale(${(r.start.s + (r.end.s - r.start.s) * k).toFixed(4)})`;
          r.el.style.opacity = (r.start.a + (r.end.a - r.start.a) * k).toFixed(3);
          if (p >= 1) toRemove.push(i);
        }
        for (let i = toRemove.length - 1; i >= 0; i--) {
          const r = rings.splice(toRemove[i], 1)[0];
          r?.el?.remove();
        }
      }
    }

    requestAnimationFrame(frame);
  })();
})();
