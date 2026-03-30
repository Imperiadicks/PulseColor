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

/* ========================== VISUAL (segment spectrum wave) ========================== */
(() => {
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;

  const BAR_COUNT = 28;
  const SEGMENT_COUNT = 14;
  const LOW_BIN = 2;
  const BAND_CURVE = 1.85;

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

  [outer, inner, ringHost, glow].forEach((el) => {
    el.replaceChildren();
    el.removeAttribute('style');
    el.className = '';
  });

  outer.classList.add('osu-bars', 'osu-bars--top');
  inner.classList.add('osu-bars', 'osu-bars--reflection');
  ringHost.classList.add('osu-bars-floor');
  glow.classList.add('osu-bars-mist');

  const topBars = [];
  const reflectionBars = [];
  const levels = new Array(BAR_COUNT).fill(0);
  const peaks = new Array(BAR_COUNT).fill(0);
  const peakHold = new Array(BAR_COUNT).fill(0);
  const activeCache = new Array(BAR_COUNT).fill(-1);
  const peakCache = new Array(BAR_COUNT).fill(-1);

  function barHue(index) {
    return (280 + (index / Math.max(1, BAR_COUNT - 1)) * 320) % 360;
  }

  function buildBars(layer, store) {
    for (let i = 0; i < BAR_COUNT; i++) {
      const bar = document.createElement('div');
      bar.className = 'osu-bar';
      bar.style.setProperty('--osu-bar-color', `hsl(${barHue(i)}deg 100% 56%)`);
      bar.style.setProperty('--osu-bar-index', String(i));

      const segments = [];
      for (let j = 0; j < SEGMENT_COUNT; j++) {
        const seg = document.createElement('span');
        seg.className = 'osu-bar__segment';
        bar.appendChild(seg);
        segments.push(seg);
      }

      layer.appendChild(bar);
      store.push({ bar, segments, active: 0, peak: 0 });
    }
  }

  buildBars(outer, topBars);
  buildBars(inner, reflectionBars);

  function setBarState(item, activeCount, peakIndex) {
    if (item.active === activeCount && item.peak === peakIndex) return;
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

    const out = new Array(BAR_COUNT).fill(0);
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
      const shaped = Math.pow(energy, 0.78);
      const tilt = 1.08 - (i / Math.max(1, BAR_COUNT - 1)) * 0.14;
      out[i] = clamp(shaped * 1.38 * tilt, 0, 1);
    }
    return out;
  }

  let lastTs = performance.now();
  (function frame() {
    const nowTs = performance.now();
    const dt = Math.min(0.060, (nowTs - lastTs) / 1000);
    lastTs = nowTs;

    const cfg = window.BeatDriverConfig || {};
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
    const scales = window.BeatDriver?.scales?.(dt * 1000) || { outer: 1, inner: 1, active: false };

    const pulse = clamp((Math.max(scales.outer || 1, scales.inner || 1) - 1) * 1.85, 0, 0.55);
    const rms = clamp((window.__OSU__?.rms || 0) * 3.2, 0, 1);
    const voiceEnv = clamp(window.__OSU__?.voiceEnv || 0, 0, 1);
    const bands = readBands();

    for (let i = 0; i < BAR_COUNT; i++) {
      let target = 0;
      if (bands) {
        target = bands[i];
        if (bpmDrive) target = target * 0.92 + pulse * 0.48;
        else target = target + pulse * 0.18;

        const edgeBias = 1 - Math.abs((i / Math.max(1, BAR_COUNT - 1)) * 2 - 1);
        target += voiceEnv * (0.04 + edgeBias * 0.03);
      } else {
        target = pulse * 0.65 + rms * 0.15;
      }
      target = clamp(target, 0, 1);

      const attack = 1 - Math.exp(-dt / 0.045);
      const release = 1 - Math.exp(-dt / 0.18);
      const smoothing = target > levels[i] ? attack : release;
      levels[i] = lerp(levels[i], target, smoothing);

      const fall = 1 - Math.exp(-dt / 0.24);
      peaks[i] = Math.max(levels[i], lerp(peaks[i], levels[i], fall));
      if (levels[i] >= peaks[i] - 0.015) peakHold[i] = 0.10;
      else peakHold[i] = Math.max(0, peakHold[i] - dt);
      if (peakHold[i] <= 0) peaks[i] = Math.max(levels[i], peaks[i] - dt * 0.75);

      const activeCount = clamp(Math.round(levels[i] * SEGMENT_COUNT), 0, SEGMENT_COUNT);
      const peakIndex = peaks[i] > 0.06
        ? clamp(Math.round(peaks[i] * SEGMENT_COUNT) - 1, 0, SEGMENT_COUNT - 1)
        : -1;

      if (activeCache[i] !== activeCount || peakCache[i] !== peakIndex) {
        activeCache[i] = activeCount;
        peakCache[i] = peakIndex;
        setBarState(topBars[i], activeCount, peakIndex);
        setBarState(reflectionBars[i], activeCount, peakIndex);
      }
    }

    const visible = mediaPlaying || audioOn || pulse > 0.02 || levels.some(v => v > 0.025);
    const avgLevel = levels.reduce((acc, v) => acc + v, 0) / Math.max(1, BAR_COUNT);
    const offsetVW = Number(cfg.OFFSET_X_VW || 1);
    const alpha = visible ? clamp(0.11 + avgLevel * 0.9 + pulse * 0.25, 0.12, 0.98) : 0.06;
    const bright = clamp((cfg.BRIGHTNESS_BASE || 1) * (1 + avgLevel * 0.9 + pulse * 0.55), 1, 4.5);
    const beatLift = clamp(pulse * 22, 0, 18);

    root.style.setProperty('--osu-alpha', alpha.toFixed(3));
    root.style.setProperty('--osu-bright', bright.toFixed(3));
    root.style.setProperty('--osu-offset-xvw', `${offsetVW}vw`);
    root.style.setProperty('--osu-beat-lift', `${beatLift.toFixed(2)}px`);
    root.style.setProperty('--osu-floor-alpha', clamp(0.08 + avgLevel * 0.30 + pulse * 0.18, 0.08, 0.38).toFixed(3));
    root.classList.toggle('is-active', visible);
    outer.classList.toggle('pulse', pulse > 0.16);

    requestAnimationFrame(frame);
  })();
})();
