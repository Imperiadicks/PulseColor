/* ========================== PulseColor: AI-only BPM gate + RAW fallback ========================== */
(() => {
  const AI_WAIT_MS = 5000;
  const MODE_POLL_MS = 250;
  const META_POLL_MS = 180;
  const RATE_LIMIT_COOLDOWN_MS = 180000;
  const DRIVE_MODE_RAW = 'raw';
  const DRIVE_MODE_BPM = 'bpm';

  const AI_ENDPOINT = 'https://api.onlysq.ru/ai/v2';
  const AI_MODEL = 'gemini-2.0-flash-lite';
  const AI_KEY = 'sq-L4uZha9NlowdITyEPc2pFtrpCqbOD52g';

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const normBpm = (b) => {
    b = Math.round(+b || 0);
    if (!b) return 0;
    while (b < 50) b *= 2;
    while (b > 210) b = Math.round(b / 2);
    return clamp(b, 50, 210);
  };
  const normalizeSig = (s) => (s || '').toString().trim().replace(/\s+/g, ' ').toLowerCase();
  const normalizeDriveMode = (value) => {
    const mode = String(value || '').trim().toLowerCase();
    return mode === DRIVE_MODE_BPM ? DRIVE_MODE_BPM : DRIVE_MODE_RAW;
  };
  const getConfiguredDriveMode = () => normalizeDriveMode(window.BeatDriverConfig?.WAVE_DRIVE_MODE);

  const requestCooldowns = new Map();
  let seq = 0;
  let curTrackKey = '';
  let curTrackSig = '';
  let waitTimer = 0;
  let metaPollTimer = 0;
  let modePollTimer = 0;
  let activeRequest = null;
  let nativeAudioPlay = null;

  const AI_LOG_LIMIT = 250;
  const AI_LOG_PREFIX = '[PulseColor AI]';
  const aiLogs = [];
  const safeJson = (value) => {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      try {
        return String(value);
      } catch {
        return null;
      }
    }
  };
  const pushAiLog = (event, payload = {}, level = 'info') => {
    const entry = {
      ts: new Date().toISOString(),
      time: Date.now(),
      level,
      event,
      payload: safeJson(payload)
    };
    aiLogs.push(entry);
    if (aiLogs.length > AI_LOG_LIMIT) aiLogs.splice(0, aiLogs.length - AI_LOG_LIMIT);
    try {
      window.__PulseColorAILogs = aiLogs;
      const api = (window.PulseColorAILogger = window.PulseColorAILogger || {});
      api.getLogs = () => aiLogs.slice();
      api.clear = () => { aiLogs.length = 0; };
      api.dump = () => aiLogs.slice();
      api.last = () => aiLogs[aiLogs.length - 1] || null;
      api.print = () => {
        try {
          console.table(aiLogs.map(({ ts, level, event, payload }) => ({ ts, level, event, payload: JSON.stringify(payload) })));
        } catch {}
        return aiLogs.slice();
      };
      window.dispatchEvent(new CustomEvent('pulsecolor:ai-log', { detail: entry }));
    } catch {}

    try {
      const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
      console[method](AI_LOG_PREFIX, event, entry.payload || {});
    } catch {}
    return entry;
  };

  const gate = {
    selectedMode: getConfiguredDriveMode(),
    effectiveMode: DRIVE_MODE_RAW,
    status: 'raw',
    trackKey: '',
    pendingResume: false,
    pendingResumeEl: null,
    pendingResumeAt: 0,
  };

  let lastNet = { status: 'idle', src: '', bpm: 0 };
  const publishNet = () => { try { window.__PulseColorNet = { ...lastNet }; } catch {} };
  const publishMode = () => {
    try {
      const snapshot = {
        selectedMode: gate.selectedMode,
        effectiveMode: gate.effectiveMode,
        status: gate.status,
        trackKey: gate.trackKey,
        blocked: gate.selectedMode === DRIVE_MODE_BPM && gate.status === 'waiting'
      };
      window.__PulseColorWaveDrive = snapshot;
      const api = (window.PulseColorWaveMode = window.PulseColorWaveMode || {});
      api.getSelectedMode = () => snapshot.selectedMode;
      api.getEffectiveMode = () => snapshot.effectiveMode;
      api.isPlaybackBlocked = () => snapshot.blocked;
      api.canUseAI = () => snapshot.selectedMode === DRIVE_MODE_BPM && snapshot.status === 'waiting';
      api.canUseTapTempo = () => false;
      api.canUseLocalBpm = () => false;
    } catch {}
  };
  const setGate = (patch = {}) => {
    const before = { ...gate };
    Object.assign(gate, patch);
    publishMode();
    const changed = ['selectedMode', 'effectiveMode', 'status', 'trackKey', 'pendingResume'].some((k) => before[k] !== gate[k]);
    if (changed) {
      pushAiLog('gate-state', {
        before: {
          selectedMode: before.selectedMode,
          effectiveMode: before.effectiveMode,
          status: before.status,
          trackKey: before.trackKey,
          pendingResume: before.pendingResume
        },
        after: {
          selectedMode: gate.selectedMode,
          effectiveMode: gate.effectiveMode,
          status: gate.status,
          trackKey: gate.trackKey,
          pendingResume: gate.pendingResume
        }
      });
    }
  };
  publishNet();
  publishMode();
  pushAiLog('init', {
    endpoint: AI_ENDPOINT,
    model: AI_MODEL,
    selectedMode: gate.selectedMode,
    effectiveMode: gate.effectiveMode,
    status: gate.status,
    waitMs: AI_WAIT_MS
  });

  const qText = (selectors, root = document) => {
    for (const selector of selectors) {
      const el = root.querySelector(selector);
      const txt = el?.textContent?.trim();
      if (txt) return txt;
    }
    return '';
  };

  const parseTitleLike = (raw) => {
    const txt = String(raw || '').replace(/\s*[-–—|•]\s*Яндекс\s*Музыка.*$/i, '').trim();
    if (!txt) return { title: '', artist: '' };
    const parts = txt.split(/\s+[—–-]\s+/).map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) return { artist: parts[0], title: parts.slice(1).join(' — ') };
    return { artist: '', title: txt };
  };

  const getCoverSig = () => {
    const img = document.querySelector('div[data-test-id="PLAYERBAR_DESKTOP_COVER_CONTAINER"] img')
      || document.querySelector('img[data-test-id="ENTITY_COVER_IMAGE"]')
      || document.querySelector('[class*="PlayerBar"] img[src], [class*="playerBar"] img[src]');
    const src = img?.src || '';
    return src.replace(/\/(?:100x100|200x200|400x400|1000x1000)(?=[/?]|$)/g, '');
  };

  const getTrackMeta = () => {
    const md = navigator.mediaSession?.metadata;
    let title = (md?.title || '').trim();
    let artist = (md?.artist || md?.albumArtist || '').trim();

    if (!title) {
      title = qText([
        '[data-test-id="PLAYERBAR_DESKTOP_TRACK_TITLE"]',
        '[data-test-id="PLAYERBAR_DESKTOP_TITLE"]',
        '[data-test-id="PLAYERBAR_TRACK_TITLE"]',
        '[data-test-id="PLAYERBAR_TITLE"]',
        '[class*="PlayerBarDesktop"] a[href*="/track/"]',
        '[class*="PlayerBar"] a[href*="/track/"]',
        '[class*="PlayerBarDesktop"] [title]',
        '[class*="PlayerBar"] [title]'
      ]);
    }

    if (!artist) {
      artist = qText([
        '[data-test-id="PLAYERBAR_DESKTOP_TRACK_ARTIST"]',
        '[data-test-id="PLAYERBAR_DESKTOP_ARTIST"]',
        '[data-test-id="PLAYERBAR_TRACK_ARTIST"]',
        '[data-test-id="PLAYERBAR_ARTIST"]',
        '[class*="PlayerBarDesktop"] a[href*="/artist/"]',
        '[class*="PlayerBar"] a[href*="/artist/"]'
      ]);
    }

    if ((!title || !artist) && document.title) {
      const parsed = parseTitleLike(document.title);
      if (!artist && parsed.artist) artist = parsed.artist;
      if (!title && parsed.title) title = parsed.title;
    }

    const coverSig = getCoverSig();
    const sig = normalizeSig(`${artist} - ${title}`);
    const key = sig || coverSig || normalizeSig(document.title);

    return {
      title: title.trim(),
      artist: artist.trim(),
      sig,
      key,
      coverSig
    };
  };

  const buildBpmPrompt = (artist, track) => {
    const artSafe = artist || '—';
    const trackSafe = track || '—';

    return [
      'Ты определяешь BPM музыкального трека.',
      'Используй только открытые интернет-источники. Ничего не придумывай.',
      'Если точного BPM нет — верни только 0.',
      'Ответ должен быть только одним числом без слов, пояснений и markdown.',
      '',
      '=== Артист ===',
      artSafe,
      '',
      '=== Трек ===',
      `${artSafe} — ${trackSafe}`
    ].join('\n');
  };

  const parseBpmValue = (raw) => {
    if (raw == null) return 0;
    if (typeof raw === 'number') return normBpm(raw);

    const txt = String(raw).trim();
    if (!txt) return 0;

    try {
      const j = JSON.parse(txt);
      if (typeof j?.bpm !== 'undefined') return normBpm(j.bpm);
    } catch {}

    const m = txt.match(/\b(\d{2,3})\b/);
    return m ? normBpm(m[1]) : 0;
  };

  const getRetryAfterMs = (res) => {
    const raw = res?.headers?.get?.('retry-after');
    if (!raw) return RATE_LIMIT_COOLDOWN_MS;
    const num = Number(raw);
    if (Number.isFinite(num) && num > 0) return Math.max(RATE_LIMIT_COOLDOWN_MS, num * 1000);
    const when = Date.parse(raw);
    if (Number.isFinite(when)) return Math.max(RATE_LIMIT_COOLDOWN_MS, when - Date.now());
    return RATE_LIMIT_COOLDOWN_MS;
  };

  const abortActiveRequest = (reason = 'cancel') => {
    if (activeRequest) {
      pushAiLog('ai-request-abort', {
        reason,
        key: activeRequest.key || '',
        seq: activeRequest.seq || 0
      }, 'warn');
    }
    try { activeRequest?.ctrl?.abort?.(reason); } catch {}
    activeRequest = null;
  };

  const fetchAiBpm = async (meta, mySeq) => {
    if (!meta?.title || !meta?.artist || !meta?.key) {
      pushAiLog('ai-request-skip-no-meta', {
        seq: mySeq,
        title: meta?.title || '',
        artist: meta?.artist || '',
        key: meta?.key || ''
      }, 'warn');
      return;
    }
    pushAiLog('ai-request-prepare', {
      seq: mySeq,
      title: meta.title,
      artist: meta.artist,
      key: meta.key
    });
    const cooldownUntil = requestCooldowns.get(meta.key) || 0;
    if (cooldownUntil > Date.now()) {
      lastNet = { status: 'cooldown', src: 'ai', bpm: 0 };
      publishNet();
      pushAiLog('ai-request-cooldown', {
        seq: mySeq,
        key: meta.key,
        cooldownUntil
      }, 'warn');
      return;
    }

    if (activeRequest && activeRequest.key === meta.key && activeRequest.seq === mySeq) {
      pushAiLog('ai-request-reuse', {
        seq: mySeq,
        key: meta.key
      });
      return activeRequest.promise;
    }

    const ctrl = new AbortController();
    pushAiLog('ai-request-start', {
      seq: mySeq,
      key: meta.key,
      artist: meta.artist,
      title: meta.title,
      endpoint: AI_ENDPOINT,
      model: AI_MODEL
    });
    const promise = fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AI_KEY}`
      },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: AI_MODEL,
        request: {
          messages: [
            {
              role: 'user',
              content: buildBpmPrompt(meta.artist, meta.title)
            }
          ]
        }
      })
    }).then(async (res) => {
      pushAiLog('ai-response-http', {
        seq: mySeq,
        key: meta.key,
        status: res.status,
        ok: res.ok
      }, res.ok ? 'info' : 'warn');
      if (!res.ok) {
        if (res.status === 429) {
          const retryAfterMs = getRetryAfterMs(res);
          requestCooldowns.set(meta.key, Date.now() + retryAfterMs);
          pushAiLog('ai-response-rate-limit', {
            seq: mySeq,
            key: meta.key,
            retryAfterMs
          }, 'warn');
          return { bpm: 0, src: 'ai-rate-limit' };
        }
        pushAiLog('ai-response-http-error', {
          seq: mySeq,
          key: meta.key,
          status: res.status
        }, 'error');
        return { bpm: 0, src: `ai-http-${res.status}` };
      }
      const j = await res.json();
      const content =
        j?.choices?.[0]?.message?.content ??
        j?.message?.content ??
        j?.content ??
        '';
      const bpm = parseBpmValue(content);
      pushAiLog('ai-response-parse', {
        seq: mySeq,
        key: meta.key,
        raw: String(content || '').slice(0, 200),
        bpm
      }, bpm ? 'info' : 'warn');
      return bpm ? { bpm, src: 'ai' } : { bpm: 0, src: 'ai-miss' };
    }).catch((err) => {
      if (err?.name === 'AbortError') {
        pushAiLog('ai-response-abort', {
          seq: mySeq,
          key: meta.key
        }, 'warn');
        return { bpm: 0, src: 'ai-abort' };
      }
      pushAiLog('ai-response-error', {
        seq: mySeq,
        key: meta.key,
        error: err?.message || String(err || 'unknown-error')
      }, 'error');
      return { bpm: 0, src: 'ai-error' };
    }).finally(() => {
      pushAiLog('ai-request-finish', {
        seq: mySeq,
        key: meta.key,
        activeMatch: activeRequest?.ctrl === ctrl
      });
      if (activeRequest?.ctrl === ctrl) activeRequest = null;
    });

    activeRequest = { key: meta.key, seq: mySeq, ctrl, promise };
    return promise;
  };

  const clearWaitTimer = () => {
    if (!waitTimer) return;
    clearTimeout(waitTimer);
    waitTimer = 0;
  };
  const clearMetaPoll = () => {
    if (!metaPollTimer) return;
    clearInterval(metaPollTimer);
    metaPollTimer = 0;
  };

  const shouldBlockPlayback = (el = null) => {
    if (getConfiguredDriveMode() !== DRIVE_MODE_BPM) return false;
    if (gate.selectedMode !== DRIVE_MODE_BPM) return false;
    if (gate.status !== 'waiting') return false;
    if (el && el.tagName !== 'AUDIO') return false;
    return true;
  };

  const rememberResumeIntent = (el = null) => {
    gate.pendingResume = true;
    gate.pendingResumeEl = el || gate.pendingResumeEl || null;
    gate.pendingResumeAt = Date.now();
    pushAiLog('playback-resume-remembered', {
      hasElement: !!gate.pendingResumeEl,
      status: gate.status,
      trackKey: gate.trackKey
    });
  };

  const pauseAndRewind = (el, { remember = false } = {}) => {
    if (!el) return;
    if (remember) rememberResumeIntent(el);
    pushAiLog('playback-paused-and-rewind', {
      remember,
      currentTime: Number(el.currentTime || 0),
      status: gate.status,
      trackKey: gate.trackKey
    }, 'warn');
    try { el.pause?.(); } catch {}
    try { el.currentTime = 0; } catch {}
  };

  const stopAllAudioForGate = () => {
    document.querySelectorAll('audio').forEach((el) => {
      if (!el.paused) pauseAndRewind(el, { remember: true });
    });
  };

  const pickResumeAudio = () => {
    const all = Array.from(document.querySelectorAll('audio'));
    if (gate.pendingResumeEl && gate.pendingResumeEl.isConnected) return gate.pendingResumeEl;
    return all.find(el => el.isConnected) || null;
  };

  const releasePendingPlayback = () => {
    if (!gate.pendingResume) return;
    const el = pickResumeAudio();
    gate.pendingResume = false;
    gate.pendingResumeEl = null;
    gate.pendingResumeAt = 0;
    pushAiLog('playback-release-attempt', {
      hasElement: !!el,
      status: gate.status,
      trackKey: gate.trackKey
    });
    if (!el) return;
    try {
      const ret = nativeAudioPlay ? nativeAudioPlay.call(el) : el.play?.();
      if (ret && typeof ret.catch === 'function') ret.catch((err) => {
        pushAiLog('playback-release-catch', {
          error: err?.message || String(err || 'play-catch')
        }, 'warn');
      });
    } catch (err) {
      pushAiLog('playback-release-error', {
        error: err?.message || String(err || 'play-error')
      }, 'error');
    }
  };

  const enterRawMode = ({ reason = 'raw', resume = false, trackKey = '' } = {}) => {
    pushAiLog('enter-raw-mode', {
      reason,
      resume,
      trackKey: trackKey || gate.trackKey || curTrackKey
    }, reason === 'raw' ? 'info' : 'warn');
    clearWaitTimer();
    clearMetaPoll();
    abortActiveRequest(reason);
    setGate({
      selectedMode: getConfiguredDriveMode(),
      effectiveMode: DRIVE_MODE_RAW,
      status: reason,
      trackKey: trackKey || gate.trackKey || curTrackKey
    });
    lastNet = { status: reason === 'raw' ? 'raw' : 'miss', src: reason === 'raw' ? 'raw' : reason, bpm: 0 };
    publishNet();
    if (resume) releasePendingPlayback();
  };

  const applyAiBpm = (meta, out) => {
    pushAiLog('ai-bpm-apply', {
      key: meta?.key || '',
      title: meta?.title || '',
      artist: meta?.artist || '',
      bpm: out?.bpm || 0,
      src: out?.src || 'ai'
    });
    clearWaitTimer();
    clearMetaPoll();
    setGate({
      selectedMode: DRIVE_MODE_BPM,
      effectiveMode: DRIVE_MODE_BPM,
      status: 'bpm-active',
      trackKey: meta?.key || gate.trackKey || curTrackKey
    });
    curTrackSig = meta?.sig || curTrackSig;
    lastNet = { status: 'hit', src: out.src || 'ai', bpm: out.bpm };
    publishNet();
    try { window.OsuBeat?.retune?.({ presetBpm: out.bpm, source: 'ai' }); } catch {}
    releasePendingPlayback();
  };

  const resolveWithAi = async (meta, mySeq) => {
    if (!meta?.title || !meta?.artist || !meta?.key) {
      pushAiLog('ai-resolve-skip-no-meta', {
        seq: mySeq,
        key: meta?.key || ''
      }, 'warn');
      return;
    }
    pushAiLog('ai-resolve-start', {
      seq: mySeq,
      key: meta.key,
      title: meta.title,
      artist: meta.artist
    });
    const out = await fetchAiBpm(meta, mySeq);
    if (!out) {
      pushAiLog('ai-resolve-empty', {
        seq: mySeq,
        key: meta.key
      }, 'warn');
      return;
    }
    if (mySeq !== seq) {
      pushAiLog('ai-resolve-stale-seq', {
        requestSeq: mySeq,
        currentSeq: seq,
        key: meta.key,
        src: out.src || ''
      }, 'warn');
      return;
    }
    if (getConfiguredDriveMode() !== DRIVE_MODE_BPM) {
      pushAiLog('ai-resolve-skip-mode-changed', {
        seq: mySeq,
        key: meta.key,
        mode: getConfiguredDriveMode(),
        src: out.src || ''
      }, 'warn');
      return;
    }
    if (gate.status !== 'waiting') {
      pushAiLog('ai-resolve-skip-status', {
        seq: mySeq,
        key: meta.key,
        status: gate.status,
        src: out.src || ''
      }, 'warn');
      return;
    }
    if ((meta.key || '') !== (gate.trackKey || '')) {
      pushAiLog('ai-resolve-skip-track-mismatch', {
        seq: mySeq,
        key: meta.key,
        gateTrackKey: gate.trackKey,
        src: out.src || ''
      }, 'warn');
      return;
    }

    if (out.bpm) {
      pushAiLog('ai-resolve-hit', {
        seq: mySeq,
        key: meta.key,
        bpm: out.bpm,
        src: out.src || 'ai'
      });
      applyAiBpm(meta, out);
      return;
    }

    if (out.src === 'ai-abort') {
      pushAiLog('ai-resolve-aborted', {
        seq: mySeq,
        key: meta.key
      }, 'warn');
      return;
    }

    lastNet = {
      status: out.src === 'ai-rate-limit' ? 'rate-limit' : 'miss',
      src: out.src || 'ai-miss',
      bpm: 0
    };
    publishNet();
    pushAiLog('ai-resolve-fallback-raw', {
      seq: mySeq,
      key: meta.key,
      src: out.src || 'ai-miss'
    }, 'warn');
    enterRawMode({ reason: 'raw-fallback', resume: true, trackKey: meta.key });
  };

  const beginWaitingForTrack = (meta = null) => {
    const fresh = meta || getTrackMeta();
    const trackKey = fresh?.key || getCoverSig() || curTrackKey || `pending-${Date.now()}`;
    pushAiLog('waiting-begin', {
      title: fresh?.title || '',
      artist: fresh?.artist || '',
      key: trackKey,
      sig: fresh?.sig || '',
      coverSig: fresh?.coverSig || ''
    });

    seq += 1;
    curTrackKey = trackKey;
    curTrackSig = fresh?.sig || '';
    clearWaitTimer();
    clearMetaPoll();
    abortActiveRequest();
    try { window.OsuBeat?.reset?.(); } catch {}

    setGate({
      selectedMode: DRIVE_MODE_BPM,
      effectiveMode: DRIVE_MODE_BPM,
      status: 'waiting',
      trackKey
    });
    lastNet = { status: 'pending', src: 'ai', bpm: 0 };
    publishNet();
    stopAllAudioForGate();

    const mySeq = seq;
    waitTimer = setTimeout(() => {
      if (mySeq !== seq) {
        pushAiLog('waiting-timeout-stale', { requestSeq: mySeq, currentSeq: seq, key: trackKey }, 'warn');
        return;
      }
      if (getConfiguredDriveMode() !== DRIVE_MODE_BPM) {
        pushAiLog('waiting-timeout-skip-mode', { seq: mySeq, key: trackKey, mode: getConfiguredDriveMode() }, 'warn');
        return;
      }
      if (gate.status !== 'waiting') {
        pushAiLog('waiting-timeout-skip-status', { seq: mySeq, key: trackKey, status: gate.status }, 'warn');
        return;
      }
      pushAiLog('waiting-timeout-fallback', {
        seq: mySeq,
        key: trackKey,
        waitMs: AI_WAIT_MS
      }, 'warn');
      enterRawMode({ reason: 'raw-fallback', resume: true, trackKey });
    }, AI_WAIT_MS);

    metaPollTimer = setInterval(() => {
      if (getConfiguredDriveMode() !== DRIVE_MODE_BPM) {
        clearMetaPoll();
        return;
      }
      if (gate.status !== 'waiting') {
        clearMetaPoll();
        return;
      }

      const latest = getTrackMeta();
      const latestKey = latest?.key || getCoverSig() || '';
      if (latestKey && latestKey !== gate.trackKey) {
        pushAiLog('meta-poll-track-changed', {
          seq: mySeq,
          from: gate.trackKey,
          to: latestKey
        }, 'warn');
        beginWaitingForTrack(latest);
        return;
      }

      if (latest?.title && latest?.artist && latest?.key === gate.trackKey && (!activeRequest || activeRequest.key !== latest.key || activeRequest.seq !== mySeq)) {
        pushAiLog('meta-poll-ready-for-ai', {
          seq: mySeq,
          key: latest.key,
          title: latest.title,
          artist: latest.artist
        });
        resolveWithAi(latest, mySeq);
      }
    }, META_POLL_MS);

    if (fresh?.title && fresh?.artist) resolveWithAi(fresh, mySeq);
  };

  const attachAudioLifecycle = (el) => {
    if (!el || el.__pulseColorGateBound) return;
    el.__pulseColorGateBound = true;
    pushAiLog('audio-bound', {
      hasSrc: !!el.currentSrc,
      readyState: el.readyState,
      paused: el.paused
    });

    const guard = () => {
      if (!shouldBlockPlayback(el)) return;
      pushAiLog('playback-guard-block', {
        status: gate.status,
        selectedMode: gate.selectedMode,
        effectiveMode: gate.effectiveMode,
        trackKey: gate.trackKey
      }, 'warn');
      pauseAndRewind(el, { remember: true });
      if (gate.selectedMode === DRIVE_MODE_BPM && gate.status !== 'waiting') beginWaitingForTrack();
    };

    ['play', 'playing', 'loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough', 'seeked', 'durationchange'].forEach((evt) => {
      el.addEventListener(evt, () => {
        pushAiLog('audio-event', {
          event: evt,
          paused: el.paused,
          currentTime: Number(el.currentTime || 0),
          readyState: el.readyState,
          currentSrc: el.currentSrc || ''
        });
        const meta = getTrackMeta();
        const key = meta?.key || getCoverSig() || '';
        if (key && key !== curTrackKey && gate.selectedMode === DRIVE_MODE_BPM) {
          beginWaitingForTrack(meta);
          return;
        }
        guard();
      }, { capture: true });
    });
  };

  const installPlayPatch = () => {
    const proto = window.HTMLMediaElement?.prototype;
    if (!proto || proto.__pulseColorAiOnlyGatePatched) return;
    if (typeof proto.play !== 'function') return;

    nativeAudioPlay = proto.play;
    proto.play = function pulseColorGatePlay(...args) {
      pushAiLog('media-play-call', {
        tagName: this?.tagName || '',
        blocked: this?.tagName === 'AUDIO' ? shouldBlockPlayback(this) : false,
        status: gate.status,
        selectedMode: gate.selectedMode,
        trackKey: gate.trackKey
      });
      const ret = nativeAudioPlay.apply(this, args);
      if (this?.tagName === 'AUDIO' && shouldBlockPlayback(this)) {
        rememberResumeIntent(this);
        queueMicrotask(() => {
          if (shouldBlockPlayback(this)) pauseAndRewind(this);
        });
      }
      return ret;
    };

    Object.defineProperty(proto, '__pulseColorAiOnlyGatePatched', {
      value: true,
      configurable: false,
      enumerable: false,
      writable: false
    });
  };

  const bindObservers = () => {
    document.querySelectorAll('audio').forEach(attachAudioLifecycle);

    const mo = new MutationObserver(() => {
      document.querySelectorAll('audio').forEach(attachAudioLifecycle);
      const meta = getTrackMeta();
      const key = meta?.key || getCoverSig() || '';
      if (gate.selectedMode === DRIVE_MODE_BPM && key && key !== curTrackKey) beginWaitingForTrack(meta);
    });
    mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'content'] });
  };

  const handleModeChange = (force = false) => {
    const nextMode = getConfiguredDriveMode();
    if (!force && nextMode === gate.selectedMode) return;

    pushAiLog('mode-change', {
      force,
      previousMode: gate.selectedMode,
      nextMode,
      status: gate.status,
      trackKey: gate.trackKey
    });

    clearWaitTimer();
    clearMetaPoll();
    abortActiveRequest('mode-change');
    seq += 1;
    try { window.OsuBeat?.reset?.(); } catch {}

    if (nextMode === DRIVE_MODE_RAW) {
      enterRawMode({ reason: 'raw', resume: true, trackKey: getTrackMeta().key || curTrackKey });
      return;
    }

    beginWaitingForTrack(getTrackMeta());
  };

  installPlayPatch();
  bindObservers();

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && getConfiguredDriveMode() === DRIVE_MODE_BPM && gate.status === 'waiting') {
      const meta = getTrackMeta();
      pushAiLog('visibility-resync', {
        hidden: document.hidden,
        key: meta?.key || '',
        gateTrackKey: gate.trackKey
      });
      if ((meta?.key || '') !== (gate.trackKey || '')) beginWaitingForTrack(meta);
    }
  });
  window.addEventListener('focus', () => {
    if (getConfiguredDriveMode() === DRIVE_MODE_BPM && gate.status === 'waiting') {
      const meta = getTrackMeta();
      pushAiLog('focus-resync', {
        key: meta?.key || '',
        gateTrackKey: gate.trackKey
      });
      if ((meta?.key || '') !== (gate.trackKey || '')) beginWaitingForTrack(meta);
    }
  });
  window.addEventListener('pageshow', () => {
    if (getConfiguredDriveMode() === DRIVE_MODE_BPM && gate.status === 'waiting') {
      const meta = getTrackMeta();
      pushAiLog('pageshow-resync', {
        key: meta?.key || '',
        gateTrackKey: gate.trackKey
      });
      if ((meta?.key || '') !== (gate.trackKey || '')) beginWaitingForTrack(meta);
    }
  });
  window.addEventListener('pulsecolor:beatDriverConfigChanged', () => {
    pushAiLog('config-changed', {
      waveDriveMode: getConfiguredDriveMode()
    });
    handleModeChange();
  });

  modePollTimer = setInterval(() => {
    if (getConfiguredDriveMode() !== gate.selectedMode) {
      pushAiLog('mode-poll-detected-change', {
        selectedMode: gate.selectedMode,
        configuredMode: getConfiguredDriveMode()
      });
      handleModeChange();
    }
  }, MODE_POLL_MS);

  setTimeout(() => handleModeChange(true), 0);
})();
