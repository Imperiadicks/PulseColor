/* ========================== PulseColor: BPM API gate + RAW fallback ========================== */
(() => {
  const DRIVE_MODE_RAW = 'raw';
  const DRIVE_MODE_BPM = 'bpm';
  const WAIT_MS = 5000;
  const API_TIMEOUT_MS = 9000;
  const REQUEST_COOLDOWN_MS = 15000;
  const MISS_COOLDOWN_MS = 45000;
  const ERROR_COOLDOWN_MS = 60000;
  const RATE_LIMIT_COOLDOWN_MS = 180000;
  const CACHE_KEY = 'PulseColor.bpmCache.v16';
  const CACHE_LIMIT = 450;

  const TRACK_META_SOURCES = [
    'YandexInternalPlayer',
    'YandexApiIntercept',
    'DOMPlayer',
    'MediaSession'
  ];

  const BPM_SOURCES = [
    'Deezer',
    'GetSongBPM',
    'ReccoBeats',
    'RAW'
  ];

  const BPM_API_FILES = [
    'DeezerBpmApi.js',
    'GetSongBpmApi.js',
    'ReccoBeatsBpmApi.js'
  ];

  const BPM_API_LOAD_TIMEOUT_MS = 7000;

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const normBpm = (b) => {
    b = Math.round(+b || 0);
    if (!b) return 0;
    while (b < 50) b *= 2;
    while (b > 210) b = Math.round(b / 2);
    return clamp(b, 50, 210);
  };
  const normalizeSig = (s) => (s || '').toString().trim().replace(/\s+/g, ' ').toLowerCase();
  const normalizeDriveMode = (value) => String(value || '').trim().toLowerCase() === DRIVE_MODE_BPM ? DRIVE_MODE_BPM : DRIVE_MODE_RAW;
  const normalizeCompare = (s) => (s || '')
    .toString()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\'’`]/g, '')
    .replace(/[()\[\]{}]/g, ' ')
    .replace(/[–—-]/g, ' ')
    .replace(/\b(feat|ft|featuring|remaster(?:ed)?|live|edit|mix|version|radio edit|extended|instrumental|bootleg|vip)\b.*$/gi, '')
    .replace(/[^a-zа-яё0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const getConfiguredDriveMode = () => normalizeDriveMode(window.BeatDriverConfig?.WAVE_DRIVE_MODE);

  const bpmApiState = {
    loadPromise: null,
    loaded: false,
    providers: {},
    failedFiles: []
  };

  const hasAnyBpmApiProvider = () => (
    !!bpmApiState.providers.Deezer ||
    !!bpmApiState.providers.GetSongBPM ||
    !!bpmApiState.providers.ReccoBeats ||
    !!window.PulseColorBpmApiFactories?.Deezer ||
    !!window.PulseColorBpmApiFactories?.GetSongBPM ||
    !!window.PulseColorBpmApiFactories?.ReccoBeats
  );

  const loadCache = () => {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {}; }
    catch { return {}; }
  };
  const saveCache = (obj) => {
    try {
      const keys = Object.keys(obj);
      if (keys.length > CACHE_LIMIT) {
        keys
          .sort((a, b) => (obj[a]?.ts || 0) - (obj[b]?.ts || 0))
          .slice(0, keys.length - CACHE_LIMIT)
          .forEach((k) => { delete obj[k]; });
      }
      localStorage.setItem(CACHE_KEY, JSON.stringify(obj));
    } catch {}
  };

  const requestCooldowns = new Map();
  let waitTimer = 0;
  let seq = 0;
  let curTrackKey = '';
  let curTrackSig = '';
  let activeLookupSig = '';
  let activeLookupPromise = null;
  let activeLookupController = null;
  let resolveTrackRaf = 0;
  let queuedSig = '';
  let coverObserver = null;
  let treeObserver = null;
  const mediaLifecycleBound = new WeakSet();
  let audioNodeCache = null;
  let apiRequestCounter = 0;
  let playbackLockTimer = 0;

  const PLAYBACK_RESUME_DELAY_MS = 120;
  const PLAYBACK_RESUME_RETRY_MS = 350;
  const PLAYBACK_RESUME_MAX_ATTEMPTS = 8;
  const PLAYBACK_LOCK_LOOP_MS = 90;
  const PLAYBACK_LOCK_PAUSE_DELAYS = [0, 35, 90, 180, 360];
  const PLAYBACK_TOGGLE_SELECTOR = [
    '[data-test-id="PLAYERBAR_DESKTOP_PLAY_BUTTON"]',
    '[data-test-id="PLAYERBAR_PLAY_BUTTON"]',
    '[data-test-id="MY_VIBE_PLAY_BUTTON"]',
    '[data-test-id="PLAY_BUTTON"]',
    'button[aria-label*="Воспроизвести"]',
    'button[aria-label*="Слушать"]',
    'button[aria-label*="Play"]'
  ].join(',');

  const playbackGate = {
    blocked: false,
    shouldResume: false,
    trackKey: '',
    reason: '',
    resumeTimer: 0,
    internalResume: false,
    resumeAllowedUntil: 0
  };

  const gate = {
    selectedMode: getConfiguredDriveMode(),
    effectiveMode: DRIVE_MODE_RAW,
    status: 'raw',
    trackKey: '',
    trackSig: ''
  };

  const isBpmPlaybackLocked = () => (
    getConfiguredDriveMode() === DRIVE_MODE_BPM &&
    gate.selectedMode === DRIVE_MODE_BPM &&
    gate.status !== 'bpm-active'
  );

  const getQuickTrackKey = (meta = null) => {
    try {
      return meta?.key || getCoverSig() || curTrackKey || '';
    } catch {
      return meta?.key || curTrackKey || '';
    }
  };

  const isBpmReadyForCurrentTrack = (meta = null) => {
    if (getConfiguredDriveMode() !== DRIVE_MODE_BPM) return true;
    if (gate.selectedMode !== DRIVE_MODE_BPM) return false;
    if (gate.effectiveMode !== DRIVE_MODE_BPM) return false;
    if (gate.status !== 'bpm-active') return false;

    const currentKey = getQuickTrackKey(meta);
    const readyKey = gate.trackKey || curTrackKey || '';
    const currentSig = meta?.sig || '';
    const readySig = gate.trackSig || curTrackSig || '';

    if (currentSig && readySig && currentSig === readySig) return true;
    if (currentKey && readyKey && currentKey === readyKey) return true;

    if (!currentKey && !currentSig) return true;
    if (currentKey && readyKey && currentKey !== readyKey) return false;
    if (currentSig && readySig && currentSig !== readySig) return false;

    return true;
  };

  const shouldBlockPlaybackNow = (meta = null) => (
    getConfiguredDriveMode() === DRIVE_MODE_BPM &&
    !isBpmReadyForCurrentTrack(meta)
  );

  let lastNet = { status: 'idle', src: '', bpm: 0 };
  const publishNet = () => { try { window.__PulseColorNet = { ...lastNet }; } catch {} };
  const publishMode = () => {
    try {
      const snapshot = {
        selectedMode: gate.selectedMode,
        effectiveMode: gate.effectiveMode,
        status: gate.status,
        trackKey: gate.trackKey,
        trackSig: gate.trackSig || '',
        blocked: isBpmPlaybackLocked() || playbackGate.blocked
      };
      window.__PulseColorWaveDrive = snapshot;
      const api = (window.PulseColorWaveMode = window.PulseColorWaveMode || {});
      api.getSelectedMode = () => snapshot.selectedMode;
      api.getEffectiveMode = () => snapshot.effectiveMode;
      api.isPlaybackBlocked = () => snapshot.blocked;
      api.canUseTapTempo = () => snapshot.effectiveMode === DRIVE_MODE_RAW;
      api.canUseLocalBpm = () => snapshot.effectiveMode === DRIVE_MODE_RAW;
      api.hasBpmApiProvider = () => hasAnyBpmApiProvider();
      api.retryBpmApi = () => beginWaitingForTrack(getTrackMeta(), { reason: 'manual-retry', forceResume: isAudioPlaying() });
      api.clearBpmApiCache = () => { try { localStorage.removeItem(CACHE_KEY); } catch {} };
      api.getCoverNode = () => getCoverNode();
    } catch {}
  };
  const setGate = (patch = {}) => {
    Object.assign(gate, patch);
    publishMode();
    logApi('gate', { ...gate });
  };
  publishNet();
  publishMode();

  const logApi = (stage, payload) => {
    try {
      console.groupCollapsed(`[PulseColor][BPM API] ${stage}`);
      console.log(payload);
      console.groupEnd();
    } catch {
      try { console.log(`[PulseColor][BPM API] ${stage}`, payload); } catch {}
    }
  };

  let lastTrackChangeEventKey = '';

  const dispatchPulseColorTrackChange = (meta = null, reason = 'trackchange') => {
    try {
      const fresh = meta || getTrackMeta?.() || null;
      const trackKey = fresh?.key || curTrackKey || getCoverSig?.() || '';
      const trackSig = fresh?.sig || curTrackSig || '';
      const eventKey = `${trackKey}::${trackSig}::${reason}`;

      if (eventKey === lastTrackChangeEventKey) return;
      lastTrackChangeEventKey = eventKey;

      window.dispatchEvent(new CustomEvent('pulsecolor:trackchange', {
        detail: {
          reason,
          trackKey,
          trackSig,
          title: fresh?.title || '',
          artist: fresh?.artist || '',
          mode: getConfiguredDriveMode(),
          gate: { ...gate }
        }
      }));

      logApi('trackchange-event', { reason, trackKey, trackSig });
    } catch {}
  };

  const rememberAudioNode = (audio) => {
    if (!audio || !audio.isConnected) return null;
    audioNodeCache = audio;
    return audio;
  };

  const scanAudioNodes = () => {
    const list = Array.from(document.querySelectorAll('audio'));
    const picked = list.find((audio) => audio && audio.isConnected && (audio.currentSrc || audio.src)) || list[0] || null;
    return picked ? rememberAudioNode(picked) : null;
  };

  const getAudioNode = () => {
    if (audioNodeCache && audioNodeCache.isConnected) return audioNodeCache;
    audioNodeCache = null;
    return scanAudioNodes();
  };

  const isAudioPlaying = (audio = getAudioNode()) => !!(
    audio &&
    !audio.paused &&
    !audio.ended &&
    audio.readyState > 0
  );

  const isVisibleElement = (node) => {
    if (!node || node.nodeType !== 1) return false;

    try {
      const style = getComputedStyle(node);
      if (!style || style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    } catch {}

    try {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    } catch {
      return true;
    }
  };

  const getElementCenter = (node) => {
    try {
      const rect = node.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };
    } catch {
      return { x: 0, y: 0 };
    }
  };

  const getDistanceBetweenElements = (a, b) => {
    const ca = getElementCenter(a);
    const cb = getElementCenter(b);
    return Math.hypot(ca.x - cb.x, ca.y - cb.y);
  };

  const PLAYERBAR_ROOT_SELECTOR = [
    '[data-test-id="PLAYERBAR"]',
    '[data-test-id="PLAYERBAR_DESKTOP"]',
    '[data-test-id="PLAYERBAR_DESKTOP_ROOT"]',
    '[data-test-id="PLAYERBAR_ROOT"]',
    '[class*="PlayerBar"]',
    '[class*="playerBar"]',
    '[class*="Playerbar"]',
    '[class*="playerbar"]',
    '[class*="BaseSonataControls"]',
    '[class*="SonataControls"]',
    '[class*="PlayerControls"]',
    '[class*="ControlsDesktop"]'
  ].join(',');

  const TRANSPORT_ANCHOR_SELECTOR = [
    '[data-test-id="PREVIOUS_TRACK_BUTTON"]',
    '[data-test-id="NEXT_TRACK_BUTTON"]',
    '[data-test-id="PLAYERBAR_DESKTOP_PREVIOUS_TRACK_BUTTON"]',
    '[data-test-id="PLAYERBAR_DESKTOP_NEXT_TRACK_BUTTON"]',
    '[data-test-id="PLAYERBAR_PREVIOUS_TRACK_BUTTON"]',
    '[data-test-id="PLAYERBAR_NEXT_TRACK_BUTTON"]',
    '[data-test-id*="PREVIOUS_TRACK"]',
    '[data-test-id*="NEXT_TRACK"]',
    '[data-test-id*="PREV_TRACK"]'
  ].join(',');

  const TRANSPORT_PLAY_SELECTOR = [
    'button[data-test-id="PLAY_BUTTON"]',
    '[data-test-id="PLAY_BUTTON"]',
    '[data-test-id="PLAYERBAR_DESKTOP_PLAY_BUTTON"]',
    '[data-test-id="PLAYERBAR_PLAY_BUTTON"]',
    '[data-test-id="MY_VIBE_PLAY_BUTTON"]'
  ].join(',');

  const isListOrCardPlayButton = (button) => {
    if (!button || button.nodeType !== 1) return false;

    try {
      const badRoot = button.closest?.([
        '[data-test-id="TRACK"]',
        '[data-test-id="TRACK_LIST"]',
        '[data-test-id="TRACK_LIST_ITEM"]',
        '[data-test-id="VIRTUAL_LIST_ITEM"]',
        '[data-test-id="PLAYLIST_TRACK"]',
        '[data-test-id="ALBUM_TRACK"]',
        '[class*="Track"]',
        '[class*="track"]',
        '[class*="Playlist"]',
        '[class*="playlist"]',
        '[class*="AlbumPage"]',
        '[class*="albumPage"]'
      ].join(','));

      if (!badRoot) return false;
      if (badRoot.closest?.(PLAYERBAR_ROOT_SELECTOR)) return false;
      return true;
    } catch {
      return false;
    }
  };

  const getPlayerbarLikeRoot = (node) => {
    if (!node || node.nodeType !== 1) return null;

    try {
      const closest = node.closest?.(PLAYERBAR_ROOT_SELECTOR);
      if (closest && isVisibleElement(closest)) return closest;
    } catch {}

    let cur = node.parentElement;
    for (let i = 0; cur && i < 12; i += 1, cur = cur.parentElement) {
      try {
        if (!isVisibleElement(cur)) continue;
        const style = getComputedStyle(cur);
        const rect = cur.getBoundingClientRect();
        const fixedLike = style.position === 'fixed' || style.position === 'sticky';
        const bottomLike = rect.bottom >= window.innerHeight - 180 && rect.top >= window.innerHeight * 0.45;
        const wideEnough = rect.width >= Math.min(320, window.innerWidth * 0.35);
        const hasTransportButton = !!cur.querySelector?.(TRANSPORT_PLAY_SELECTOR);
        if (fixedLike && bottomLike && wideEnough && hasTransportButton) return cur;
      } catch {}
    }

    return null;
  };

  const isSafeTransportPlayCandidate = (button) => {
    if (!button || !isVisibleElement(button) || !isPlayButtonState(button)) return false;
    if (isListOrCardPlayButton(button)) return false;

    const root = getPlayerbarLikeRoot(button);
    if (!root) return false;

    try {
      const buttonRect = button.getBoundingClientRect();
      const rootRect = root.getBoundingClientRect();
      const bottomRoot = rootRect.bottom >= window.innerHeight - 220;
      const insideRoot = root.contains(button);
      const notHugeOffset = buttonRect.top >= rootRect.top - 8 && buttonRect.bottom <= rootRect.bottom + 8;
      return insideRoot && bottomRoot && notHugeOffset;
    } catch {
      return true;
    }
  };

  const findTransportPlayButton = () => {
    const anchors = Array.from(document.querySelectorAll(TRANSPORT_ANCHOR_SELECTOR))
      .filter((node) => isVisibleElement(node) && !isListOrCardPlayButton(node));

    const candidates = Array.from(document.querySelectorAll(TRANSPORT_PLAY_SELECTOR))
      .filter(isSafeTransportPlayCandidate);

    if (!candidates.length) return null;

    if (!anchors.length) {
      return candidates[0] || null;
    }

    let best = null;
    let bestDistance = Infinity;

    for (const candidate of candidates) {
      const candidateRoot = getPlayerbarLikeRoot(candidate);
      if (!candidateRoot) continue;

      for (const anchor of anchors) {
        const anchorRoot = getPlayerbarLikeRoot(anchor);
        if (anchorRoot && candidateRoot !== anchorRoot) continue;
        if (!candidateRoot.contains(anchor)) continue;

        const distance = getDistanceBetweenElements(candidate, anchor);
        if (distance < bestDistance) {
          best = candidate;
          bestDistance = distance;
        }
      }
    }

    return best || candidates[0] || null;
  };

  const getPlaybackToggleButton = () => {
    const transportButton = findTransportPlayButton();
    if (transportButton) return transportButton;

    const selectors = [
      '[data-test-id="PLAYERBAR_DESKTOP_PLAY_BUTTON"]',
      '[data-test-id="PLAYERBAR_PLAY_BUTTON"]',
      '[data-test-id="MY_VIBE_PLAY_BUTTON"]',
      'button[aria-label*="Воспроизвести"]',
      'button[aria-label*="Слушать"]',
      'button[aria-label*="Play"]'
    ];

    for (const selector of selectors) {
      try {
        const buttons = Array.from(document.querySelectorAll(selector));
        const btn = buttons.find((button) => isSafeTransportPlayCandidate(button));
        if (btn) return btn;
      } catch {}
    }

    return null;
  };

  const isPlayButtonState = (button) => {
    if (!button) return false;
    const text = String(
      (button.getAttribute('aria-label') || '') + ' ' +
      (button.getAttribute('title') || '') + ' ' +
      (button.textContent || '')
    ).toLowerCase();
    if (!text.trim()) return true;
    if (text.includes('пауза') || text.includes('pause')) return false;
    return (
      text.includes('воспроизведение') ||
      text.includes('воспроизвести') ||
      text.includes('play') ||
      text.includes('слушать')
    );
  };

  const clickPlaybackToggleButton = (reason = 'bpm-ready', attempt = 1) => {
    const button = getPlaybackToggleButton();

    if (!button || !isPlayButtonState(button)) {
      return false;
    }

    try {
      playbackGate.internalResume = true;
      button.click();
      logApi('bpm-playback-resume-click', {
        reason,
        attempt,
        via: 'play-button',
        dataTestId: button.getAttribute?.('data-test-id') || '',
        ariaLabel: button.getAttribute?.('aria-label') || ''
      });

      setTimeout(() => { playbackGate.internalResume = false; }, 300);
      return true;
    } catch (error) {
      playbackGate.internalResume = false;
      logApi('bpm-playback-resume-click-error', {
        reason,
        attempt,
        via: 'play-button',
        name: error?.name || 'Error',
        message: error?.message || String(error)
      });
      return false;
    }
  };

  const clearPlaybackResumeTimer = () => {
    if (!playbackGate.resumeTimer) return;
    clearTimeout(playbackGate.resumeTimer);
    playbackGate.resumeTimer = 0;
  };

  const stopPlaybackLockLoop = () => {
    if (!playbackLockTimer) return;
    clearTimeout(playbackLockTimer);
    playbackLockTimer = 0;
  };

  const hardPausePlayback = (reason = 'bpm-hard-pause') => {
    const audio = getAudioNode();
    if (!audio) return false;

    let paused = false;
    if (!audio.paused) {
      try {
        audio.pause();
        paused = true;
      } catch {}
    }

    for (const delay of PLAYBACK_LOCK_PAUSE_DELAYS) {
      setTimeout(() => {
        if (!shouldBlockPlaybackNow()) return;
        const freshAudio = getAudioNode();
        if (freshAudio && !freshAudio.paused) {
          try { freshAudio.pause(); } catch {}
        }
      }, delay);
    }

    return paused;
  };

  const startPlaybackLockLoop = (reason = 'bpm-lock-loop') => {
    if (playbackLockTimer) return;

    const tick = () => {
      playbackLockTimer = 0;
      if (!playbackGate.blocked && !shouldBlockPlaybackNow()) return;
      if (getConfiguredDriveMode() !== DRIVE_MODE_BPM) return;

      hardPausePlayback(reason);
      playbackLockTimer = setTimeout(tick, PLAYBACK_LOCK_LOOP_MS);
    };

    tick();
  };

  const pausePlaybackForBpmGate = (meta = null, reason = 'bpm-waiting', options = {}) => {
    if (getConfiguredDriveMode() !== DRIVE_MODE_BPM) return;

    const audio = getAudioNode();
    const wasPlaying = isAudioPlaying(audio);
    const mediaSessionPlaying = navigator.mediaSession?.playbackState === 'playing';
    const forceResume = !!options.forceResume;
    const shouldResume = playbackGate.shouldResume || forceResume || wasPlaying || mediaSessionPlaying;

    clearPlaybackResumeTimer();

    playbackGate.blocked = true;
    playbackGate.shouldResume = shouldResume;
    playbackGate.trackKey = meta?.key || curTrackKey || '';
    playbackGate.reason = reason;

    const hardPaused = hardPausePlayback(reason);
    startPlaybackLockLoop(reason);

    logApi('bpm-playback-block', {
      reason,
      shouldResume,
      forceResume,
      trackKey: playbackGate.trackKey,
      audioFound: !!audio,
      wasPlaying,
      hardPaused,
      mediaSessionPlaying,
      gate: { ...gate }
    });
  };

  const tryResumePlayback = (reason = 'bpm-ready', attempt = 1) => {
    clearPlaybackResumeTimer();

    const audio = getAudioNode();
    if (isAudioPlaying(audio)) {
      logApi('bpm-playback-resume-done', { reason, attempt, alreadyPlaying: true });
      return;
    }

    const retry = () => {
      if (attempt >= PLAYBACK_RESUME_MAX_ATTEMPTS) {
        const button = getPlaybackToggleButton();
        if (!clickPlaybackToggleButton(reason, attempt)) {
          logApi('bpm-playback-resume-give-up', {
            reason,
            attempt,
            audioFound: !!audio,
            buttonFound: !!button,
            dataTestId: button?.getAttribute?.('data-test-id') || '',
            ariaLabel: button?.getAttribute?.('aria-label') || ''
          });
        }
        return;
      }

      playbackGate.resumeTimer = setTimeout(() => tryResumePlayback(reason, attempt + 1), PLAYBACK_RESUME_RETRY_MS);
    };

    if (clickPlaybackToggleButton(reason, attempt)) {
      playbackGate.resumeTimer = setTimeout(() => {
        if (isAudioPlaying()) {
          logApi('bpm-playback-resume-done', { reason, attempt, via: 'play-button' });
          return;
        }

        tryResumePlayback(reason, attempt + 1);
      }, PLAYBACK_RESUME_RETRY_MS);
      return;
    }

    if (!audio) {
      retry();
      return;
    }

    try {
      const nativePlay = window.__PulseColorBpmNativePlay || HTMLMediaElement.prototype.play;
      playbackGate.internalResume = true;

      const result = typeof nativePlay === 'function'
        ? nativePlay.call(audio)
        : audio.play?.();

      const clearInternalResume = () => {
        setTimeout(() => { playbackGate.internalResume = false; }, 120);
      };

      if (result && typeof result.then === 'function') {
        result
          .then(() => {
            clearInternalResume();
            logApi('bpm-playback-resume-done', { reason, attempt, via: 'native-audio.play' });
          })
          .catch((error) => {
            clearInternalResume();
            logApi('bpm-playback-resume-error', {
              reason,
              attempt,
              via: 'native-audio.play',
              name: error?.name || 'Error',
              message: error?.message || String(error)
            });
            retry();
          });
      } else {
        clearInternalResume();
        logApi('bpm-playback-resume-done', { reason, attempt, via: 'native-audio.play-sync' });
      }
    } catch (error) {
      playbackGate.internalResume = false;
      logApi('bpm-playback-resume-error', {
        reason,
        attempt,
        via: 'native-audio.play',
        name: error?.name || 'Error',
        message: error?.message || String(error)
      });
      retry();
    }
  };

  const releasePlaybackAfterBpmGate = (reason = 'bpm-ready') => {
    const shouldResume = playbackGate.shouldResume;
    const wasBlocked = playbackGate.blocked;

    clearPlaybackResumeTimer();
    stopPlaybackLockLoop();
    playbackGate.blocked = false;
    playbackGate.shouldResume = false;
    playbackGate.trackKey = '';
    playbackGate.reason = '';
    playbackGate.resumeAllowedUntil = Date.now() + 5000;

    logApi('bpm-playback-release', {
      reason,
      wasBlocked,
      shouldResume,
      gate: { ...gate }
    });

    if (!shouldResume) return;
    playbackGate.resumeTimer = setTimeout(() => tryResumePlayback(reason, 1), PLAYBACK_RESUME_DELAY_MS);
  };

  const maskApiKey = (key) => {
    const value = String(key || '').trim();
    if (!value) return '';
    if (value.length <= 8) return `${value[0] || '*'}***${value[value.length - 1] || '*'}`;
    return `${value.slice(0, 4)}...${value.slice(-4)}`;
  };

  const maskUrlForLog = (url) => {
    const raw = String(url || '');
    if (!raw) return '';
    try {
      const parsed = new URL(raw);
      for (const key of ['api_key', 'apikey', 'key', 'token', 'access_token']) {
        if (parsed.searchParams.has(key)) parsed.searchParams.set(key, maskApiKey(parsed.searchParams.get(key)));
      }
      return parsed.toString();
    } catch {
      return raw.replace(/((?:api_key|apikey|key|token|access_token)=)([^&]+)/gi, (_, prefix, value) => `${prefix}${maskApiKey(decodeURIComponent(value || ''))}`);
    }
  };

  const logApiKeyCheck = (provider, key, extra = {}) => {
    const value = String(key || '').trim();
    logApi(`${provider}-apikey-check`, {
      provider,
      hasApiKey: !!value,
      apiKeyLength: value.length,
      apiKeyMasked: maskApiKey(value),
      source: 'code-constant',
      ...extra
    });
  };

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

  const COVER_IMAGE_SELECTORS = [
    'div[data-test-id="PLAYERBAR_DESKTOP_COVER_CONTAINER"] img',
    '[data-test-id="FULLSCREEN_PLAYER_MODAL"] img[data-test-id="ENTITY_COVER_IMAGE"]',
    'img[data-test-id="ENTITY_COVER_IMAGE"]',
    'img[class*="AlbumCover_cover__"][src*="avatars.yandex.net/get-music-content"]',
    'img[class*="AlbumCover_cover__"][srcset*="avatars.yandex.net/get-music-content"]',
    '[class*="PlayerBar"] img[src*="avatars.yandex.net/get-music-content"]',
    'img[src*="avatars.yandex.net/get-music-content"]',
    'img[srcset*="avatars.yandex.net/get-music-content"]'
  ];

  const coverSrcFromImg = (img) => {
    if (!img) return '';
    return img.currentSrc || img.src || (img.getAttribute && (img.getAttribute('src') || '')) || '';
  };

  const coverScore = (img) => {
    if (!img || !img.isConnected) return -1;

    const src = coverSrcFromImg(img);
    if (!src) return -1;

    const cls = String(img.className || '');
    const rect = img.getBoundingClientRect?.() || { width: 0, height: 0, top: 0, bottom: 0 };
    let visible = true;
    try {
      const style = getComputedStyle(img);
      visible = rect.width > 20 && rect.height > 20 && style.display !== 'none' && style.visibility !== 'hidden';
    } catch {
      visible = !!src;
    }

    let score = 0;
    if (visible) score += 120;
    if (src.includes('avatars.yandex.net/get-music-content')) score += 90;
    if (cls.includes('AlbumCover_cover__')) score += 70;
    if (img.closest?.('div[data-test-id="PLAYERBAR_DESKTOP_COVER_CONTAINER"], [class*="PlayerBar"], [class*="playerBar"]')) score += 130;
    if (img.closest?.('[data-test-id="FULLSCREEN_PLAYER_MODAL"]')) score += 100;
    if (rect.top > window.innerHeight * 0.52 || rect.bottom > window.innerHeight * 0.70) score += 35;
    if (rect.width <= 260 && rect.height <= 260) score += 12;

    return score;
  };

  let coverNodeCache = null;
  let coverNodeCacheTime = 0;

  const getCoverNode = () => {
    const now = performance.now?.() || Date.now();

    if (
      coverNodeCache &&
      coverNodeCache.isConnected &&
      coverSrcFromImg(coverNodeCache) &&
      now - coverNodeCacheTime < 180
    ) {
      return coverNodeCache;
    }

    const nodes = new Set();

    for (const selector of COVER_IMAGE_SELECTORS) {
      try {
        document.querySelectorAll(selector).forEach((img) => nodes.add(img));
      } catch {}
    }

    coverNodeCache = Array.from(nodes)
      .filter((img) => coverScore(img) >= 0)
      .sort((a, b) => coverScore(b) - coverScore(a))[0] || null;
    coverNodeCacheTime = now;

    return coverNodeCache;
  };

  const normalizeCoverSig = (src) => String(src || '')
    .replace(/\/(?:50x50|80x80|100x100|200x200|300x300|400x400|800x800|1000x1000)(?=[/?]|$)/g, '')
    .replace(/[?#].*$/, '');

  const getCoverSig = () => normalizeCoverSig(coverSrcFromImg(getCoverNode()));


  /*---- yandex music metadata ---- */
  const YANDEX_META_TTL_MS = 120000;
  const YANDEX_META_SCAN_MAX_DEPTH = 7;
  const YANDEX_META_SCAN_MAX_ARRAY_ITEMS = 60;
  const YANDEX_META_SCAN_MAX_CANDIDATES = 24;

  const yandexTrackMetaState = {
    installed: false,
    fetchInstalled: false,
    xhrInstalled: false,
    consoleInstalled: false,
    eventInstalled: false,
    lastAccepted: null,
    api: null,
    event: null,
    console: null
  };

  const toCleanString = (value) => String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

  const firstCleanString = (...values) => {
    for (const value of values) {
      if (Array.isArray(value)) {
        const nested = firstCleanString(...value);
        if (nested) return nested;
        continue;
      }
      const text = toCleanString(value);
      if (text) return text;
    }
    return '';
  };

  const idToString = (value) => {
    if (value == null) return '';
    if (typeof value === 'object') return firstCleanString(value.id, value.realId, value.trackId, value.uid, value.value);
    return firstCleanString(value);
  };

  const parseDurationMs = (value) => {
    if (value == null || value === '') return 0;
    if (typeof value === 'number' && Number.isFinite(value)) {
      if (value > 10000) return Math.round(value);
      if (value > 0) return Math.round(value * 1000);
      return 0;
    }

    const raw = String(value || '').trim();
    if (!raw) return 0;
    if (/^\d+(?:\.\d+)?$/.test(raw)) return parseDurationMs(Number(raw));

    const parts = raw.split(':').map((part) => Number(part));
    if (parts.length >= 2 && parts.every((part) => Number.isFinite(part))) {
      let seconds = 0;
      for (const part of parts) seconds = seconds * 60 + part;
      return Math.round(seconds * 1000);
    }

    return 0;
  };

  const normalizeArtistList = (value) => {
    if (!value) return [];
    if (typeof value === 'string') return uniqueClean(value.split(/,|&|feat\.?|ft\.?/i));

    if (Array.isArray(value)) {
      return uniqueClean(value.flatMap((item) => normalizeArtistList(item)));
    }

    if (typeof value === 'object') {
      return uniqueClean([
        firstCleanString(value.name, value.title, value.artistName, value.fullName, value.login),
        ...normalizeArtistList(value.artist),
        ...normalizeArtistList(value.artists),
        ...normalizeArtistList(value['artist-credit'])
      ]);
    }

    return [];
  };

  const artistsToText = (artists) => uniqueClean(artists).join(', ');

  const normalizeCoverUrl = (value) => {
    let raw = firstCleanString(value);
    if (!raw) return '';

    if (raw.includes('%%')) raw = raw.replace('%%', '400x400');
    if (raw.startsWith('//')) raw = `https:${raw}`;
    if (/^avatars\.yandex\.net\//i.test(raw)) raw = `https://${raw}`;
    if (/^get-music-content\//i.test(raw)) raw = `https://avatars.yandex.net/${raw}`;

    return raw;
  };

  const normalizeYandexTrackId = (value) => {
    const id = idToString(value).replace(/[^a-z0-9_:.-]/gi, '').trim();
    return id && id.toLowerCase() !== 'undefined' && id.toLowerCase() !== 'null' ? id : '';
  };

  const normalizeYandexTrackMetaCandidate = (raw, source = 'YandexApiIntercept', extra = {}) => {
    if (!raw || typeof raw !== 'object') return null;

    const title = firstCleanString(
      raw.title,
      raw.trackTitle,
      raw.name,
      raw.track?.title,
      raw.track?.trackTitle,
      raw.track?.name,
      raw.currentTrack?.title,
      raw.currentTrack?.name,
      raw.entity?.title,
      raw.entity?.name
    );

    const artists = uniqueClean([
      ...normalizeArtistList(raw.artists),
      ...normalizeArtistList(raw.artist),
      ...normalizeArtistList(raw.performers),
      ...normalizeArtistList(raw.album?.artists),
      ...normalizeArtistList(raw.track?.artists),
      ...normalizeArtistList(raw.track?.artist),
      ...normalizeArtistList(raw.currentTrack?.artists),
      ...normalizeArtistList(raw.currentTrack?.artist),
      firstCleanString(raw.artistName, raw.artistsNames, raw.artistTitle)
    ]);

    const artist = artistsToText(artists);
    const trackId = normalizeYandexTrackId(
      raw.id ?? raw.realId ?? raw.trackId ?? raw.track?.id ?? raw.track?.realId ?? raw.currentTrack?.id ?? raw.currentTrack?.realId ?? extra.trackId
    );

    const album = firstCleanString(
      raw.album?.title,
      raw.albumTitle,
      raw.albums?.[0]?.title,
      raw.track?.album?.title,
      raw.currentTrack?.album?.title
    );

    const durationMs = parseDurationMs(
      raw.durationMs ?? raw.duration_ms ?? raw.durationMillis ?? raw.duration ?? raw.length ?? raw.track?.durationMs ?? raw.currentTrack?.durationMs ?? extra.durationMs
    );

    const cover = normalizeCoverUrl(
      raw.coverUri ?? raw.ogImage ?? raw.cover?.uri ?? raw.cover?.src ?? raw.cover ?? raw.album?.coverUri ?? raw.track?.coverUri ?? raw.currentTrack?.coverUri
    );

    const isrc = normalizeIsrc(
      raw.isrc ?? raw.ISRC ?? raw.track?.isrc ?? raw.currentTrack?.isrc ?? raw.meta?.isrc ?? extra.isrc
    );

    if (!title && !trackId) return null;

    const meta = {
      source,
      title,
      artist,
      artists,
      album,
      durationMs,
      cover,
      coverSig: normalizeCoverSig(cover),
      yandexTrackId: trackId,
      isrc,
      ts: Date.now()
    };

    meta.sig = normalizeSig(`${meta.artist} - ${meta.title}`);
    meta.key = meta.coverSig || (meta.yandexTrackId ? `ym:${meta.yandexTrackId}` : '') || meta.sig;

    return meta;
  };

  const getVisibleTrackTextMeta = () => {
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

    return { title: title.trim(), artist: artist.trim(), sig: normalizeSig(`${artist} - ${title}`) };
  };

  const yandexMetaMatchesVisible = (meta, visible = getVisibleTrackTextMeta()) => {
    if (!meta) return false;
    if (!visible?.title && !visible?.artist) return true;

    if (visible.title && meta.title && !isTitleMatch(meta.title, visible.title)) return false;
    if (visible.artist && meta.artist && !isArtistMatch(meta.artist, visible.artist)) {
      const visibleArtist = normalizeCompare(visible.artist);
      const metaArtist = normalizeCompare(meta.artist);
      if (!visibleArtist || !metaArtist || !(visibleArtist.includes(metaArtist) || metaArtist.includes(visibleArtist))) return false;
    }

    return true;
  };

  const mergeYandexMetaWithVisible = (meta, visible = getVisibleTrackTextMeta()) => {
    const coverSig = getCoverSig();
    const merged = {
      ...(meta || {}),
      title: firstCleanString(meta?.title, visible.title),
      artist: firstCleanString(meta?.artist, visible.artist),
      coverSig: coverSig || meta?.coverSig || '',
      source: meta?.source || 'YandexInternalPlayer'
    };

    merged.sig = normalizeSig(`${merged.artist} - ${merged.title}`);
    merged.key = coverSig || meta?.key || (merged.yandexTrackId ? `ym:${merged.yandexTrackId}` : '') || merged.sig;
    return merged;
  };

  const acceptYandexTrackMeta = (meta, source = meta?.source || 'YandexApiIntercept') => {
    if (!meta) return null;

    const normalized = {
      ...meta,
      source,
      ts: Date.now(),
      title: toCleanString(meta.title),
      artist: toCleanString(meta.artist),
      album: toCleanString(meta.album),
      yandexTrackId: normalizeYandexTrackId(meta.yandexTrackId),
      isrc: normalizeIsrc(meta.isrc),
      durationMs: parseDurationMs(meta.durationMs),
      cover: normalizeCoverUrl(meta.cover)
    };

    normalized.coverSig = normalizeCoverSig(normalized.cover || meta.coverSig || '');
    normalized.sig = normalizeSig(`${normalized.artist} - ${normalized.title}`);
    normalized.key = normalized.coverSig || (normalized.yandexTrackId ? `ym:${normalized.yandexTrackId}` : '') || normalized.sig;

    if (!normalized.title && !normalized.yandexTrackId) return null;

    if (source === 'YandexApiIntercept') yandexTrackMetaState.api = normalized;
    else if (source === 'YandexInternalConsole') yandexTrackMetaState.console = normalized;
    else yandexTrackMetaState.event = normalized;

    yandexTrackMetaState.lastAccepted = normalized;

    logApi('ym-track-meta', {
      source,
      title: normalized.title,
      artist: normalized.artist,
      album: normalized.album,
      durationMs: normalized.durationMs,
      yandexTrackId: normalized.yandexTrackId,
      isrc: normalized.isrc,
      coverSig: normalized.coverSig,
      sig: normalized.sig,
      key: normalized.key
    });

    return normalized;
  };

  const collectYandexTrackCandidates = (payload, source = 'YandexApiIntercept') => {
    const results = [];
    const seen = new WeakSet();

    const walk = (value, depth = 0) => {
      if (!value || results.length >= YANDEX_META_SCAN_MAX_CANDIDATES) return;
      if (depth > YANDEX_META_SCAN_MAX_DEPTH) return;

      if (Array.isArray(value)) {
        value.slice(0, YANDEX_META_SCAN_MAX_ARRAY_ITEMS).forEach((item) => walk(item, depth + 1));
        return;
      }

      if (typeof value !== 'object') return;
      if (seen.has(value)) return;
      seen.add(value);

      const hasTitle = !!firstCleanString(value.title, value.trackTitle, value.name, value.track?.title, value.currentTrack?.title);
      const hasArtist = !!(
        normalizeArtistList(value.artists).length ||
        normalizeArtistList(value.artist).length ||
        normalizeArtistList(value.performers).length ||
        normalizeArtistList(value.track?.artists).length ||
        normalizeArtistList(value.currentTrack?.artists).length ||
        firstCleanString(value.artistName, value.artistTitle)
      );
      const hasTrackMarker = !!(
        value.trackId || value.realId || value.coverUri || value.durationMs || value.duration_ms || value.isrc ||
        value.track?.id || value.currentTrack?.id || value.type === 'track' || value.entityType === 'track'
      );

      if ((hasTitle && (hasArtist || hasTrackMarker)) || (hasTrackMarker && value.currentTrack)) {
        const candidate = normalizeYandexTrackMetaCandidate(value, source);
        if (candidate) results.push(candidate);
      }

      for (const key of Object.keys(value)) {
        if (results.length >= YANDEX_META_SCAN_MAX_CANDIDATES) break;
        if (/^(lyrics|description|text|html|blocks|experiments)$/i.test(key)) continue;
        walk(value[key], depth + 1);
      }
    };

    walk(payload, 0);
    return results;
  };

  const scoreYandexCandidate = (meta, visible = getVisibleTrackTextMeta()) => {
    if (!meta) return -1;

    let score = 0;
    if (meta.title) score += 8;
    if (meta.artist) score += 8;
    if (meta.yandexTrackId) score += 4;
    if (meta.isrc) score += 5;
    if (meta.durationMs) score += 2;
    if (meta.coverSig) score += 2;
    if (visible.title && meta.title && isTitleMatch(meta.title, visible.title)) score += 10;
    if (visible.artist && meta.artist && isArtistMatch(meta.artist, visible.artist)) score += 10;

    if (meta.source === 'YandexInternalPlayer') score += 5;
    if (meta.source === 'YandexInternalConsole') score += 3;
    if (meta.source === 'YandexApiIntercept') score += 2;

    return score;
  };

  const acceptBestYandexCandidate = (payload, source = 'YandexApiIntercept') => {
    const candidates = collectYandexTrackCandidates(payload, source);
    if (!candidates.length) return null;

    const visible = getVisibleTrackTextMeta();
    const matched = candidates
      .filter((candidate) => yandexMetaMatchesVisible(candidate, visible))
      .sort((a, b) => scoreYandexCandidate(b, visible) - scoreYandexCandidate(a, visible));

    const best = matched[0] || candidates.sort((a, b) => scoreYandexCandidate(b, visible) - scoreYandexCandidate(a, visible))[0];
    if (!best) return null;

    return acceptYandexTrackMeta(mergeYandexMetaWithVisible(best, visible), source);
  };

  const getYandexTrackMetaSnapshot = () => {
    const visible = getVisibleTrackTextMeta();
    const now = Date.now();
    const candidates = [
      yandexTrackMetaState.event,
      yandexTrackMetaState.console,
      yandexTrackMetaState.api,
      yandexTrackMetaState.lastAccepted
    ]
      .filter(Boolean)
      .filter((meta) => now - (meta.ts || 0) <= YANDEX_META_TTL_MS)
      .filter((meta) => yandexMetaMatchesVisible(meta, visible))
      .sort((a, b) => scoreYandexCandidate(b, visible) - scoreYandexCandidate(a, visible));

    return candidates[0] ? mergeYandexMetaWithVisible(candidates[0], visible) : null;
  };

  const isYandexMusicApiUrl = (url) => {
    const raw = String(url || '');
    if (!raw) return false;
    if (/api\.(deezer|getsong|reccobeats)\.com/i.test(raw)) return false;
    if (/avatars\.yandex\.net|get-music-content/i.test(raw)) return false;
    return /music\.yandex\.|\/handlers\/|\/api\/|\/track(?:s)?\b|\/player\b|\/rotor\b|\/landing\b/i.test(raw);
  };

  const inspectYandexApiResponse = async (url, response) => {
    try {
      if (!isYandexMusicApiUrl(url) || !response) return;
      const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
      const contentLength = Number(response.headers?.get?.('content-length') || 0);
      if (contentLength > 5 * 1024 * 1024) return;
      if (contentType && !contentType.includes('json') && !contentType.includes('javascript') && !contentType.includes('text')) return;

      const text = await response.text();
      if (!text || text.length > 5 * 1024 * 1024) return;

      let data = null;
      try { data = JSON.parse(text); } catch { return; }

      const meta = acceptBestYandexCandidate(data, 'YandexApiIntercept');
      if (meta) {
        logApi('ym-api-track-meta', {
          url: maskUrlForLog(url),
          title: meta.title,
          artist: meta.artist,
          yandexTrackId: meta.yandexTrackId,
          isrc: meta.isrc,
          durationMs: meta.durationMs
        });
        checkTrackChange(true);
      }
    } catch (error) {
      logApi('ym-api-track-meta-error', {
        url: maskUrlForLog(url),
        name: error?.name || 'Error',
        message: error?.message || String(error)
      });
    }
  };

  const installYandexFetchInterceptor = () => {
    if (yandexTrackMetaState.fetchInstalled || typeof window.fetch !== 'function') return;
    const originalFetch = window.fetch;
    if (originalFetch.__pulseColorYmMetaPatched) return;

    const patchedFetch = async function patchedPulseColorFetch(input, init) {
      const response = await originalFetch.apply(this, arguments);
      try {
        const url = typeof input === 'string' ? input : (input?.url || '');
        if (isYandexMusicApiUrl(url)) {
          inspectYandexApiResponse(url, response.clone()).catch(() => {});
        }
      } catch {}
      return response;
    };

    patchedFetch.__pulseColorYmMetaPatched = true;
    patchedFetch.__pulseColorOriginalFetch = originalFetch;
    window.fetch = patchedFetch;
    yandexTrackMetaState.fetchInstalled = true;
  };

  const installYandexXhrInterceptor = () => {
    if (yandexTrackMetaState.xhrInstalled || !window.XMLHttpRequest?.prototype) return;
    const proto = window.XMLHttpRequest.prototype;
    if (proto.open.__pulseColorYmMetaPatched) return;

    const originalOpen = proto.open;
    const originalSend = proto.send;

    proto.open = function patchedPulseColorXhrOpen(method, url) {
      try {
        this.__pulseColorYmMetaUrl = String(url || '');
        this.__pulseColorYmMetaMethod = String(method || 'GET');
      } catch {}
      return originalOpen.apply(this, arguments);
    };

    proto.send = function patchedPulseColorXhrSend() {
      try {
        this.addEventListener('loadend', () => {
          try {
            const url = this.__pulseColorYmMetaUrl || '';
            if (!isYandexMusicApiUrl(url)) return;
            const text = String(this.responseText || '');
            if (!text || text.length > 5 * 1024 * 1024) return;
            let data = null;
            try { data = JSON.parse(text); } catch { return; }
            const meta = acceptBestYandexCandidate(data, 'YandexApiIntercept');
            if (meta) {
              logApi('ym-api-track-meta', {
                transport: 'xhr',
                url: maskUrlForLog(url),
                title: meta.title,
                artist: meta.artist,
                yandexTrackId: meta.yandexTrackId,
                isrc: meta.isrc,
                durationMs: meta.durationMs
              });
              checkTrackChange(true);
            }
          } catch {}
        });
      } catch {}
      return originalSend.apply(this, arguments);
    };

    proto.open.__pulseColorYmMetaPatched = true;
    proto.send.__pulseColorYmMetaPatched = true;
    yandexTrackMetaState.xhrInstalled = true;
  };

  const installYandexConsoleWatcher = () => {
    if (yandexTrackMetaState.consoleInstalled || !window.console) return;
    const originalLog = console.log?.bind(console);
    const originalTable = console.table?.bind(console);
    if (!originalLog) return;

    const inspectArgs = (args) => {
      try {
        for (const arg of args) {
          if (typeof arg === 'string') {
            if (!arg.includes('[CrossMediaPlayer]') && !arg.includes('текущий:')) continue;
            const match = arg.match(/текущий:\s*["“](.+?)["”]\s*\(id:\s*([^\)]+)\)/i);
            if (!match) continue;
            const visible = getVisibleTrackTextMeta();
            acceptYandexTrackMeta(mergeYandexMetaWithVisible({
              source: 'YandexInternalConsole',
              title: match[1],
              artist: visible.artist,
              yandexTrackId: normalizeYandexTrackId(match[2]),
              ts: Date.now()
            }, visible), 'YandexInternalConsole');
            checkTrackChange(true);
            continue;
          }

          if (arg && typeof arg === 'object' && String(arg.type || '').toLowerCase() === 'update_player_state') {
            acceptBestYandexCandidate(arg, 'YandexInternalPlayer');
            checkTrackChange(true);
          }
        }
      } catch {}
    };

    console.log = function patchedPulseColorConsoleLog() {
      inspectArgs(Array.from(arguments));
      return originalLog.apply(console, arguments);
    };

    if (originalTable) {
      console.table = function patchedPulseColorConsoleTable() {
        inspectArgs(Array.from(arguments));
        return originalTable.apply(console, arguments);
      };
    }

    yandexTrackMetaState.consoleInstalled = true;
  };

  const installYandexEventWatchers = () => {
    if (yandexTrackMetaState.eventInstalled) return;
    const handler = (event) => {
      try {
        const detail = event?.detail || event;
        const meta = acceptBestYandexCandidate(detail, 'YandexInternalPlayer');
        if (meta) checkTrackChange(true);
      } catch {}
    };

    [
      'update_player_state',
      'player_state_update',
      'playerStateUpdate',
      'YINSON_EVENT_SENDED',
      'yinson_event_sended',
      'crossMediaPlayerUpdate'
    ].forEach((name) => {
      try { window.addEventListener(name, handler, { passive: true }); } catch {}
      try { document.addEventListener(name, handler, { passive: true }); } catch {}
    });

    yandexTrackMetaState.eventInstalled = true;
  };

  const initYandexTrackMetaCapture = () => {
    if (yandexTrackMetaState.installed) return;
    yandexTrackMetaState.installed = true;
    installYandexFetchInterceptor();
    installYandexXhrInterceptor();
    installYandexConsoleWatcher();
    installYandexEventWatchers();
    try {
      window.PulseColorYandexTrackMeta = {
        get: () => getYandexTrackMetaSnapshot(),
        getRaw: () => ({ ...yandexTrackMetaState }),
        inspect: (payload, source = 'ManualInspect') => acceptBestYandexCandidate(payload, source)
      };
    } catch {}
    logApi('ym-track-meta-capture-ready', { sources: TRACK_META_SOURCES });
  };

  const getTrackMeta = () => {
    const visible = getVisibleTrackTextMeta();
    const ymMeta = getYandexTrackMetaSnapshot();

    let title = visible.title;
    let artist = visible.artist;
    let source = navigator.mediaSession?.metadata ? 'MediaSession' : 'DOMPlayer';

    if (ymMeta?.title) {
      title = ymMeta.title;
      source = ymMeta.source || 'YandexInternalPlayer';
    }

    if (ymMeta?.artist) artist = ymMeta.artist;

    const coverSig = getCoverSig() || ymMeta?.coverSig || '';
    const sig = normalizeSig(`${artist} - ${title}`);
    const key = coverSig || ymMeta?.key || (ymMeta?.yandexTrackId ? `ym:${ymMeta.yandexTrackId}` : '') || sig || normalizeSig(document.title);

    const meta = {
      title: title.trim(),
      artist: artist.trim(),
      sig,
      key,
      coverSig,
      source,
      yandexTrackId: ymMeta?.yandexTrackId || '',
      album: ymMeta?.album || '',
      durationMs: ymMeta?.durationMs || 0,
      isrc: ymMeta?.isrc || '',
      yandexMeta: ymMeta || null
    };

    logApi('track-meta', meta);
    return meta;
  };

  const isServiceMeta = (meta) => {
    const artist = String(meta?.artist || '').trim().toLowerCase();
    const title = String(meta?.title || '').trim().toLowerCase();
    const full = `${artist} ${title}`.trim();
    if (!artist || !title) return true;
    if (artist === 'яндекс музыка' || artist === 'yandex music') return true;
    return [
      'собираем музыку для вас',
      'подбираем музыку для вас',
      'музыка для вас',
      'загрузка',
      'loading',
      'advertisement',
      'реклама'
    ].some((part) => full.includes(part));
  };

  const setCooldown = (sig, ms) => {
    if (!sig || !ms) return;
    requestCooldowns.set(sig, Date.now() + ms);
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

  const buildLookup = ({ title, artist }) => `song:${title} artist:${artist}`;
  const isTitleMatch = (songTitle, targetTitle) => {
    const a = normalizeCompare(songTitle);
    const b = normalizeCompare(targetTitle);
    return !!a && !!b && (a === b || a.includes(b) || b.includes(a));
  };
  const isArtistMatch = (songArtist, targetArtist) => {
    const a = normalizeCompare(songArtist);
    const b = normalizeCompare(targetArtist);
    return !!a && !!b && (a === b || a.includes(b) || b.includes(a));
  };
  const pickBestSong = (songs, targetTitle, targetArtist) => {
    const list = Array.isArray(songs) ? songs : [];
    let best = null;
    let bestScore = -1;

    for (const song of list) {
      const songTitle = song?.title || '';
      const songArtist = song?.artist?.name || song?.artist?.title || song?.artist || '';
      const titleExact = normalizeCompare(songTitle) === normalizeCompare(targetTitle);
      const artistExact = normalizeCompare(songArtist) === normalizeCompare(targetArtist);
      const titleNear = isTitleMatch(songTitle, targetTitle);
      const artistNear = isArtistMatch(songArtist, targetArtist);

      let score = 0;
      if (titleExact) score += 8; else if (titleNear) score += 5;
      if (artistExact) score += 8; else if (artistNear) score += 5;
      if (song?.tempo) score += 1;

      if (score > bestScore) {
        bestScore = score;
        best = song;
      }
    }

    return bestScore >= 10 ? best : null;
  };

  const readResponse = async (res) => {
    const rawText = await res.text();
    let data = null;
    try { data = rawText ? JSON.parse(rawText) : null; } catch { data = null; }
    return { rawText, data };
  };

  const fetchJson = async (url, sig, options = {}) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);
    activeLookupController = ctrl;
    const requestId = ++apiRequestCounter;

    try {
      const method = options.method || 'GET';
      const headers = options.headers || {};
      const body = options.body;
      logApi('request-send', {
        requestId,
        method,
        url: maskUrlForLog(url),
        sig,
        selectedMode: gate.selectedMode,
        effectiveMode: gate.effectiveMode,
        status: gate.status,
        headers: Object.keys(headers),
        hasBody: !!body,
        bodyType: body?.constructor?.name || typeof body
      });

      const startedAt = performance.now();
      const res = await fetch(url, {
        method,
        headers,
        body,
        signal: ctrl.signal
      });
      const durationMs = Math.round(performance.now() - startedAt);

      const { rawText, data } = await readResponse(res);
      logApi('response-received', {
        requestId,
        method,
        url: maskUrlForLog(url),
        sig,
        status: res.status,
        ok: res.ok,
        durationMs,
        headers: Object.fromEntries(res.headers.entries()),
        rawText,
        data
      });

      if (!res.ok) {
        if (res.status === 429) {
          setCooldown(sig, getRetryAfterMs(res));
          return { ok: false, type: 'rate-limit', data, rawText };
        }
        setCooldown(sig, ERROR_COOLDOWN_MS);
        return { ok: false, type: `http-${res.status}`, data, rawText };
      }

      return { ok: true, type: 'ok', data, rawText };
    } catch (error) {
      logApi('request-error', {
        requestId,
        url: maskUrlForLog(url),
        sig,
        name: error?.name || 'Error',
        message: error?.message || String(error),
        stack: error?.stack || ''
      });
      if (error?.name === 'AbortError') {
        setCooldown(sig, ERROR_COOLDOWN_MS);
        return { ok: false, type: 'abort', data: null, rawText: '' };
      }
      setCooldown(sig, ERROR_COOLDOWN_MS);
      return { ok: false, type: 'error', data: null, rawText: '' };
    } finally {
      clearTimeout(timer);
      if (activeLookupController === ctrl) activeLookupController = null;
    }
  };


  const fetchBlob = async (url, sig, options = {}) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);
    activeLookupController = ctrl;
    const requestId = ++apiRequestCounter;

    try {
      const method = options.method || 'GET';
      const headers = options.headers || {};
      logApi('request-send', {
        requestId,
        method,
        url: maskUrlForLog(url),
        sig,
        selectedMode: gate.selectedMode,
        effectiveMode: gate.effectiveMode,
        status: gate.status,
        headers: Object.keys(headers),
        responseType: 'blob'
      });

      const startedAt = performance.now();
      const res = await fetch(url, {
        method,
        headers,
        signal: ctrl.signal
      });
      const durationMs = Math.round(performance.now() - startedAt);
      const blob = res.ok ? await res.blob() : null;
      const rawText = res.ok ? '' : await res.text().catch(() => '');

      logApi('response-received', {
        requestId,
        method,
        url: maskUrlForLog(url),
        sig,
        status: res.status,
        ok: res.ok,
        durationMs,
        headers: Object.fromEntries(res.headers.entries()),
        blobType: blob?.type || '',
        blobSize: blob?.size || 0,
        rawText
      });

      if (!res.ok) {
        if (res.status === 429) {
          setCooldown(sig, getRetryAfterMs(res));
          return { ok: false, type: 'rate-limit', blob: null, rawText };
        }
        setCooldown(sig, ERROR_COOLDOWN_MS);
        return { ok: false, type: `http-${res.status}`, blob: null, rawText };
      }

      return { ok: true, type: 'ok', blob, rawText: '' };
    } catch (error) {
      logApi('request-error', {
        requestId,
        url: maskUrlForLog(url),
        sig,
        name: error?.name || 'Error',
        message: error?.message || String(error),
        stack: error?.stack || ''
      });
      setCooldown(sig, ERROR_COOLDOWN_MS);
      return { ok: false, type: error?.name === 'AbortError' ? 'abort' : 'error', blob: null, rawText: '' };
    } finally {
      clearTimeout(timer);
      if (activeLookupController === ctrl) activeLookupController = null;
    }
  };

  const extractTempoCandidates = (payload) => {
    const candidates = [];
    const seen = new WeakSet();

    const push = (raw, src = '') => {
      if (raw == null || raw === '') return;
      const bpm = normBpm(String(raw).replace(',', '.'));
      if (bpm) candidates.push({ bpm, src });
    };

    const walk = (value, path = '') => {
      if (value == null) return;
      if (typeof value === 'number' || typeof value === 'string') return;

      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i += 1) walk(value[i], `${path}[${i}]`);
        return;
      }

      if (typeof value !== 'object') return;
      if (seen.has(value)) return;
      seen.add(value);

      const marker = String(value.key || value.name || value.label || value.type || '').trim().toLowerCase();
      if (marker === 'tempo' || marker === 'bpm' || marker === 'beats_per_minute') {
        push(value.value ?? value.val ?? value.data ?? value.number ?? value.amount, `${path}.${marker}`);
      }

      for (const [key, nested] of Object.entries(value)) {
        const k = String(key || '').toLowerCase();
        if (k === 'tempo' || k === 'bpm' || k === 'beats_per_minute') push(nested, `${path}.${key}`);
        walk(nested, `${path}.${key}`);
      }
    };

    walk(payload, 'root');
    return candidates;
  };

  const extractFirstTempo = (payload) => {
    const list = extractTempoCandidates(payload);
    return list.length ? list[0].bpm : 0;
  };

  const uniqueClean = (items) => Array.from(new Set(
    (Array.isArray(items) ? items : [])
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  ));


  const asArray = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (Array.isArray(value.data)) return value.data;
    if (Array.isArray(value.tracks)) return value.tracks;
    if (Array.isArray(value.items)) return value.items;
    if (Array.isArray(value.results)) return value.results;
    if (Array.isArray(value.content)) return value.content;
    return typeof value === 'object' ? [value] : [];
  };

  const normalizeIsrc = (value) => String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  const pushContextIsrc = (context, value) => {
    const isrc = normalizeIsrc(value);
    if (!context || !isrc) return;
    context.isrcs = uniqueClean([...(context.isrcs || []), isrc]);
  };

  const pushContextReccoBeatsId = (context, value) => {
    const id = String(value || '').trim();
    if (!context || !id) return;
    context.reccobeatsIds = uniqueClean([...(context.reccobeatsIds || []), id]).slice(0, 8);
  };


  const getCurrentScriptUrl = () => {
    const byCurrent = document.currentScript?.src || '';
    if (byCurrent) return byCurrent;

    const scripts = Array.from(document.querySelectorAll('script[src]'));
    const current = scripts.find((script) => /OnlineOsuBPM\.js/i.test(script.src));
    return current?.src || '';
  };

  const buildBpmApiAssetUrls = (file) => {
    const currentSrc = getCurrentScriptUrl();
    const urls = [];

    try {
      const url = new URL(currentSrc || 'http://localhost:2007/assets/OnlineOsuBPM.js?name=PulseColor');
      const name = url.searchParams.get('name') || 'PulseColor';
      const origin = url.origin || 'http://localhost:2007';
      const add = (assetPath) => {
        const normalized = String(assetPath || '').replace(/^\/+/, '');
        const rawUrl = `${origin}/assets/${normalized}?name=${encodeURIComponent(name)}`;
        const encodedUrl = `${origin}/assets/${encodeURIComponent(normalized)}?name=${encodeURIComponent(name)}`;
        if (!urls.includes(rawUrl)) urls.push(rawUrl);
        if (!urls.includes(encodedUrl)) urls.push(encodedUrl);
      };

      add(file);
      add(`API/${file}`);
      add(`js/Osu/API/${file}`);
      add(`assets/js/Osu/API/${file}`);
    } catch {
      urls.push(`http://localhost:2007/assets/${encodeURIComponent(file)}?name=PulseColor`);
    }

    return urls;
  };

  const loadScriptWithTimeout = (url, timeoutMs = BPM_API_LOAD_TIMEOUT_MS) => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    let done = false;
    let timer = 0;

    const cleanup = () => {
      clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
    };

    script.src = url;
    script.async = false;
    script.onload = () => {
      if (done) return;
      done = true;
      cleanup();
      resolve(url);
    };
    script.onerror = () => {
      if (done) return;
      done = true;
      cleanup();
      try { script.remove(); } catch {}
      reject(new Error(`Failed to load script: ${url}`));
    };
    timer = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      try { script.remove(); } catch {}
      reject(new Error(`Script load timeout: ${url}`));
    }, timeoutMs);

    document.head.appendChild(script);
  });

  const loadBpmApiFile = async (file) => {
    const urls = buildBpmApiAssetUrls(file);
    let lastError = null;

    for (const url of urls) {
      try {
        const loadedUrl = await loadScriptWithTimeout(url);
        logApi('api-file-loaded', { file, url: loadedUrl });
        return loadedUrl;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error(`Failed to load BPM API file: ${file}`);
  };

  const createBpmApiCore = () => ({
    logApi,
    logApiKeyCheck,
    fetchJson,
    fetchBlob,
    maskUrlForLog,
    normBpm,
    normalizeCompare,
    isTitleMatch,
    isArtistMatch,
    parseDurationMs,
    uniqueClean,
    asArray,
    normalizeIsrc,
    pushContextIsrc,
    pushContextReccoBeatsId,
    extractTempoCandidates,
    extractFirstTempo,
    buildLookup,
    pickBestSong,
    getProvider: (name) => bpmApiState.providers?.[name] || null
  });

  const ensureBpmApiProvidersLoaded = async () => {
    if (bpmApiState.loaded) return bpmApiState.providers;
    if (bpmApiState.loadPromise) return await bpmApiState.loadPromise;

    bpmApiState.loadPromise = (async () => {
      window.PulseColorBpmApiFactories = window.PulseColorBpmApiFactories || {};

      for (const file of BPM_API_FILES) {
        try {
          await loadBpmApiFile(file);
        } catch (error) {
          bpmApiState.failedFiles.push(file);
          logApi('api-file-load-error', {
            file,
            name: error?.name || 'Error',
            message: error?.message || String(error)
          });
        }
      }

      const factories = window.PulseColorBpmApiFactories || {};
      const core = createBpmApiCore();
      const nextProviders = {};

      for (const [name, factory] of Object.entries(factories)) {
        if (typeof factory !== 'function') continue;
        try {
          const provider = factory(core);
          if (provider?.name && typeof provider.lookup === 'function') {
            nextProviders[provider.name] = provider;
          }
        } catch (error) {
          logApi('api-provider-init-error', {
            name,
            errorName: error?.name || 'Error',
            message: error?.message || String(error)
          });
        }
      }

      bpmApiState.providers = nextProviders;
      bpmApiState.loaded = true;
      logApi('api-providers-ready', {
        providers: Object.keys(nextProviders),
        failedFiles: [...bpmApiState.failedFiles]
      });

      return nextProviders;
    })();

    return await bpmApiState.loadPromise;
  };

  const getBpmProvider = (name) => bpmApiState.providers?.[name] || null;

  const getBpmProviderEntries = () => BPM_SOURCES
    .filter((name) => name !== 'RAW')
    .map((name) => getBpmProvider(name))
    .filter((provider) => provider && typeof provider.lookup === 'function')
    .map((provider) => ({ name: provider.name, fn: provider.lookup }));

  const shouldUploadDeezerPreviewToReccoBeats = (providerName, context) => {
    const recco = getBpmProvider('ReccoBeats');
    return !!(
      recco?.uploadDeezerPreviewWhenAvailable &&
      providerName !== 'ReccoBeats' &&
      String(context?.deezerPreviewUrl || '').trim()
    );
  };

  const lookupOnline = async (trackMeta = {}) => {
    const title = trackMeta.title || '';
    const artist = trackMeta.artist || '';
    const sig = trackMeta.sig || '';
    const t = (title || '').trim();
    const a = (artist || '').trim();
    const s = (sig || '').trim();
    logApi('lookup-start', {
      title: t,
      artist: a,
      sig: s,
      sources: BPM_SOURCES,
      metaSource: trackMeta.source || '',
      yandexTrackId: trackMeta.yandexTrackId || '',
      album: trackMeta.album || '',
      durationMs: trackMeta.durationMs || 0,
      isrc: trackMeta.isrc || ''
    });
    if (!t || !a || !s) return { bpm: 0, src: 'bpm-api-miss' };

    const cooldownUntil = requestCooldowns.get(s) || 0;
    if (cooldownUntil > Date.now()) {
      logApi('lookup-skip', { reason: 'cooldown', sig: s, cooldownLeftMs: cooldownUntil - Date.now() });
      return { bpm: 0, src: 'bpm-api-cooldown' };
    }
    if (activeLookupPromise && activeLookupSig === s) {
      logApi('lookup-join-in-flight', { sig: s });
      return await activeLookupPromise;
    }

    activeLookupSig = s;
    activeLookupPromise = (async () => {
      const providerContext = {
        requestedTitle: t,
        requestedArtist: a,
        requestedAlbum: trackMeta.album || '',
        requestedDurationMs: parseDurationMs(trackMeta.durationMs),
        yandexTrackId: trackMeta.yandexTrackId || '',
        yandexMeta: trackMeta.yandexMeta || null,
        isrcs: uniqueClean([trackMeta.isrc || '', ...(Array.isArray(trackMeta.yandexMeta?.isrcs) ? trackMeta.yandexMeta.isrcs : [])]).map(normalizeIsrc).filter(Boolean),
        reccobeatsIds: [],
        deezer: null,
        deezerPreviewUrl: '',
        reccoAudioSource: ''
      };
      await ensureBpmApiProvidersLoaded();
      const providers = getBpmProviderEntries();
      if (!providers.length) return { bpm: 0, src: 'bpm-api-no-provider' };

      let noKeyCount = 0;
      let lastOut = { bpm: 0, src: 'bpm-api-miss' };
      let bpmCandidate = null;

      for (const provider of providers) {
        const out = await provider.fn({ title: t, artist: a, sig: s, context: providerContext });
        logApi('provider-result', { sig: s, provider: provider.name, out, context: providerContext });

        if (out?.bpm) {
          const shouldStillUploadToReccoBeats = shouldUploadDeezerPreviewToReccoBeats(provider.name, providerContext);

          if (shouldStillUploadToReccoBeats) {
            bpmCandidate = bpmCandidate || out;
            lastOut = out;
            logApi('provider-result-deferred', {
              sig: s,
              provider: provider.name,
              reason: 'deezer-preview-will-be-uploaded-to-reccobeats',
              candidate: out,
              deezerPreviewUrl: maskUrlForLog(providerContext.deezerPreviewUrl || '')
            });
            continue;
          }

          setCooldown(s, REQUEST_COOLDOWN_MS);
          return out;
        }

        if (String(out?.src || '').endsWith('-no-key')) {
          noKeyCount += 1;
          continue;
        }

        if (
          String(out?.src || '').endsWith('-disabled') ||
          String(out?.src || '').endsWith('-no-audio') ||
          String(out?.src || '').endsWith('-no-id')
        ) {
          continue;
        }

        if (out?.src) lastOut = out;
      }

      if ((providerContext.isrcs || []).length && !lastOut?.bpm) {
        const reccoProvider = getBpmProvider('ReccoBeats');
        const reccoAfterMb = reccoProvider
          ? await reccoProvider.lookup({ title: t, artist: a, sig: s, context: providerContext })
          : { bpm: 0, src: 'reccobeats-provider-missing' };
        logApi('provider-result', { sig: s, provider: 'ReccoBeats-after-Deezer-metadata', out: reccoAfterMb, context: providerContext });
        if (reccoAfterMb?.bpm) {
          setCooldown(s, REQUEST_COOLDOWN_MS);
          return reccoAfterMb;
        }
        if (reccoAfterMb?.src && reccoAfterMb.src !== 'reccobeats-no-id') lastOut = reccoAfterMb;
      }

      if (bpmCandidate?.bpm && !lastOut?.bpm) {
        setCooldown(s, REQUEST_COOLDOWN_MS);
        return bpmCandidate;
      }

      if (noKeyCount >= 1 && lastOut.src === 'bpm-api-miss') lastOut = { bpm: 0, src: 'bpm-api-no-key' };
      if (lastOut.src.includes('miss')) setCooldown(s, MISS_COOLDOWN_MS);
      return lastOut;
    })().finally(() => {
      if (activeLookupSig === s) {
        activeLookupSig = '';
        activeLookupPromise = null;
      }
    });

    return await activeLookupPromise;
  };

  const clearWaitTimer = () => {
    if (!waitTimer) return;
    clearTimeout(waitTimer);
    waitTimer = 0;
  };

  const cancelPendingLookup = () => {
    if (resolveTrackRaf) {
      cancelAnimationFrame(resolveTrackRaf);
      resolveTrackRaf = 0;
    }
    queuedSig = '';
    if (activeLookupController) {
      try { activeLookupController.abort(); } catch {}
    }
  };

  const enterSelectedRaw = (reason = 'raw') => {
    clearWaitTimer();
    cancelPendingLookup();
    setGate({ selectedMode: DRIVE_MODE_RAW, effectiveMode: DRIVE_MODE_RAW, status: reason, trackKey: curTrackKey || '', trackSig: curTrackSig || '' });
    lastNet = { status: 'raw', src: 'raw', bpm: 0 };
    publishNet();
    releasePlaybackAfterBpmGate(reason);
  };

  const enterRawFallback = (reason = 'raw-fallback') => {
    clearWaitTimer();
    cancelPendingLookup();
    setGate({ selectedMode: DRIVE_MODE_BPM, effectiveMode: DRIVE_MODE_RAW, status: reason, trackKey: curTrackKey || '', trackSig: curTrackSig || '' });
    if (playbackGate.blocked) {
      logApi('bpm-playback-keep-blocked', {
        reason,
        trackKey: playbackGate.trackKey || curTrackKey || '',
        message: 'BPM mode keeps playback paused until a BPM value is applied or mode is switched to RAW'
      });
    }
  };

  const applyBpmActive = (meta, bpm, src = 'getsongbpm') => {
    clearWaitTimer();
    setGate({ selectedMode: DRIVE_MODE_BPM, effectiveMode: DRIVE_MODE_BPM, status: 'bpm-active', trackKey: meta?.key || curTrackKey || '', trackSig: meta?.sig || curTrackSig || '' });
    lastNet = { status: 'hit', src, bpm };
    publishNet();
    try { window.OsuBeat?.retune?.({ presetBpm: bpm, source: src }); } catch {}
    try { window.OsuBeat?.resync?.('bpm-active'); } catch {}
    dispatchPulseColorTrackChange(meta, 'bpm-active');
    releasePlaybackAfterBpmGate(src || 'bpm-active');
  };

  const resolveTrack = async (meta, mySeq) => {
    if ((meta?.key || '') !== curTrackKey) return;
    if (getConfiguredDriveMode() !== DRIVE_MODE_BPM) return;

    const out = await lookupOnline(meta);
    if (mySeq !== seq) return;
    if (getConfiguredDriveMode() !== DRIVE_MODE_BPM) return;
    if ((meta?.key || '') !== curTrackKey) return;

    if (out.bpm) {
      const cache = loadCache();
      cache[meta.sig] = { bpm: out.bpm, src: out.src, ts: Date.now() };
      saveCache(cache);
      applyBpmActive(meta, out.bpm, out.src || 'bpm-api');
      return;
    }

    lastNet = {
      status: String(out.src || '').includes('rate-limit') ? 'rate-limit' :
        String(out.src || '').includes('no-key') ? 'no-key' :
        String(out.src || '').includes('cooldown') ? 'cooldown' : 'miss',
      src: out.src || 'bpm-api',
      bpm: 0
    };
    publishNet();
    enterRawFallback(out.src || 'raw-fallback');
  };

  function queueTrackResolve() {
    if (getConfiguredDriveMode() !== DRIVE_MODE_BPM) {
      logApi('skip-resolve', { reason: 'not-bpm-mode', configuredMode: getConfiguredDriveMode(), gate: { ...gate } });
      return;
    }

    const meta = getTrackMeta();
    if (!meta?.sig || !meta.title || !meta.artist) {
      logApi('skip-resolve', { reason: 'empty-track-meta', meta });
      return;
    }
    if (isServiceMeta(meta)) {
      logApi('skip-resolve', { reason: 'service-meta', meta });
      return;
    }
    if (activeLookupPromise && activeLookupSig === meta.sig) {
      logApi('skip-resolve', { reason: 'already-in-flight', sig: meta.sig });
      return;
    }
    if (resolveTrackRaf && queuedSig === meta.sig) {
      logApi('skip-resolve', { reason: 'already-queued', sig: meta.sig });
      return;
    }
    queuedSig = meta.sig;

    if (resolveTrackRaf) cancelAnimationFrame(resolveTrackRaf);
    resolveTrackRaf = requestAnimationFrame(() => {
      requestAnimationFrame(async () => {
        resolveTrackRaf = 0;
        queuedSig = '';
        const fresh = getTrackMeta();
        if (!fresh?.sig || !fresh.title || !fresh.artist || isServiceMeta(fresh)) {
          logApi('skip-resolve', { reason: 'fresh-meta-not-ready', meta: fresh });
          return;
        }
        if (activeLookupPromise && activeLookupSig === fresh.sig) return;
        const mySeq = seq;
        await resolveTrack(fresh, mySeq);
      });
    });
  }

  const beginWaitingForTrack = (meta = null, options = {}) => {
    const fresh = meta || getTrackMeta();
    const trackKey = fresh?.key || getCoverSig() || curTrackKey || `pending-${Date.now()}`;
    const reason = options.reason || 'bpm-wait-start';
    const forceResume = !!options.forceResume;
    seq += 1;
    curTrackKey = trackKey;
    curTrackSig = fresh?.sig || '';
    clearWaitTimer();
    cancelPendingLookup();
    try { window.OsuBeat?.reset?.(); } catch {}
    dispatchPulseColorTrackChange(fresh, reason);

    const cache = loadCache();
    const row = fresh?.sig ? cache[fresh.sig] : null;
    const cachedBpm = normBpm(row?.bpm);
    if (cachedBpm) {
      if (forceResume || playbackGate.blocked) playbackGate.shouldResume = true;
      applyBpmActive(fresh, cachedBpm, row?.src || 'cache');
      return;
    }

    setGate({ selectedMode: DRIVE_MODE_BPM, effectiveMode: DRIVE_MODE_BPM, status: 'waiting', trackKey, trackSig: curTrackSig || fresh?.sig || '' });
    pausePlaybackForBpmGate(fresh, reason, { forceResume });
    lastNet = { status: 'pending', src: 'bpm-api', bpm: 0 };
    publishNet();

    const mySeq = seq;
    waitTimer = setTimeout(() => {
      if (mySeq !== seq) return;
      if (getConfiguredDriveMode() !== DRIVE_MODE_BPM) return;
      if (gate.status !== 'waiting') return;
      lastNet = { status: 'miss', src: 'raw-fallback', bpm: 0 };
      publishNet();
      enterRawFallback('raw-fallback');
      logApi('wait-timeout', { seq: mySeq, trackKey, waitMs: WAIT_MS });
    }, WAIT_MS);

    if (fresh?.title && fresh?.artist && !isServiceMeta(fresh)) queueTrackResolve();
    else logApi('skip-resolve', { reason: 'initial-meta-not-ready', meta: fresh });
  };

  function checkTrackChange(forceResolve = false) {
    const meta = getTrackMeta();
    const coverSig = getCoverSig();
    const key = coverSig || meta?.key || '';
    const configuredMode = getConfiguredDriveMode();

    if (configuredMode === DRIVE_MODE_RAW) {
      if (key && key !== curTrackKey) {
        curTrackKey = key;
        curTrackSig = meta?.sig || '';
        dispatchPulseColorTrackChange(meta, 'raw-track-key-change');
        try { window.OsuBeat?.resync?.('raw-track-key-change'); } catch {}
        enterSelectedRaw('raw');
        return;
      }
      if (meta?.sig && meta.sig !== curTrackSig) curTrackSig = meta.sig;
      if (gate.selectedMode !== DRIVE_MODE_RAW || gate.effectiveMode !== DRIVE_MODE_RAW || gate.status !== 'raw') enterSelectedRaw('raw');
      return;
    }

    if (key && key !== curTrackKey) {
      beginWaitingForTrack(meta, { reason: 'track-key-change', forceResume: true });
      return;
    }

    if (meta?.sig && meta.sig !== curTrackSig) {
      curTrackSig = meta.sig;
      beginWaitingForTrack(meta, { reason: 'track-sig-change', forceResume: true });
      return;
    }

    if (gate.selectedMode !== DRIVE_MODE_BPM) {
      beginWaitingForTrack(meta, { reason: 'bpm-mode-enter', forceResume: false });
      return;
    }

    if (gate.status === 'waiting' && forceResolve) {
      queueTrackResolve();
    }
  }

  function bindCoverObserver() {
    const node = getCoverNode();

    if (coverObserver?.__node === node) return;
    if (coverObserver) coverObserver.disconnect();
    coverObserver = null;
    if (!node) return;

    coverObserver = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'attributes' && (m.attributeName === 'src' || m.attributeName === 'srcset')) {
          checkTrackChange(true);
          break;
        }
      }
    });
    coverObserver.__node = node;
    coverObserver.observe(node, { attributes: true, attributeFilter: ['src', 'srcset'] });
  }

  function attachAudioLifecycle(el) {
    if (!el) return;
    rememberAudioNode(el);
    if (mediaLifecycleBound.has(el)) return;
    mediaLifecycleBound.add(el);

    const ping = () => checkTrackChange(true);
    const guardPlaybackWhileLocked = () => {
      const meta = getTrackMeta();
      if (shouldBlockPlaybackNow(meta) || playbackGate.blocked) {
        if (gate.status !== 'waiting' || (meta?.key && meta.key !== gate.trackKey)) {
          beginWaitingForTrack(meta, { reason: 'media-play-blocked-until-bpm-ready', forceResume: true });
        } else {
          pausePlaybackForBpmGate(meta, 'play-blocked-until-bpm-ready', { forceResume: true });
        }
      }
      checkTrackChange(true);
    };

    ['play', 'playing', 'timeupdate'].forEach((evt) => el.addEventListener(evt, guardPlaybackWhileLocked, { passive: true }));
    [
      'loadedmetadata', 'loadeddata', 'durationchange',
      'seeked', 'emptied', 'canplay', 'canplaythrough'
    ].forEach((evt) => el.addEventListener(evt, () => {
      const meta = getTrackMeta();
      if (shouldBlockPlaybackNow(meta) || playbackGate.blocked) {
        pausePlaybackForBpmGate(meta, 'media-event-blocked-until-bpm-ready', { forceResume: playbackGate.shouldResume });
      }
      ping();
    }, { passive: true }));
  }

  function isRelevantNode(node) {
    if (!node || node.nodeType !== 1) return false;
    const relevantSelector = 'audio, div[data-test-id="PLAYERBAR_DESKTOP_COVER_CONTAINER"], img[data-test-id="ENTITY_COVER_IMAGE"], img[class*="AlbumCover_cover__"], img[src*="avatars.yandex.net/get-music-content"], img[srcset*="avatars.yandex.net/get-music-content"]';
    if (node.matches?.(relevantSelector)) return true;
    return !!node.querySelector?.(relevantSelector);
  }

  function getPlaybackToggleFromEvent(event) {
    const target = event?.target;
    if (!target || target.nodeType !== 1) return null;

    try {
      const button = target.closest?.(PLAYBACK_TOGGLE_SELECTOR);
      if (!button) return null;

      if (button.matches?.('[data-test-id="PLAYERBAR_DESKTOP_PLAY_BUTTON"], [data-test-id="PLAYERBAR_PLAY_BUTTON"], [data-test-id="MY_VIBE_PLAY_BUTTON"], [data-test-id="PLAY_BUTTON"]')) {
        return isSafeTransportPlayCandidate(button) ? button : null;
      }

      return isPlayButtonState(button) ? button : null;
    } catch {
      return null;
    }
  }

  function blockUserPlaybackEvent(event, reason = 'user-play-blocked-until-bpm-ready') {
    const meta = getTrackMeta();

    if (!shouldBlockPlaybackNow(meta) && !playbackGate.blocked) return false;

    try { event.preventDefault?.(); } catch {}
    try { event.stopPropagation?.(); } catch {}
    try { event.stopImmediatePropagation?.(); } catch {}

    if (gate.status !== 'waiting' || (meta?.key && meta.key !== gate.trackKey)) {
      beginWaitingForTrack(meta, { reason, forceResume: true });
    } else {
      pausePlaybackForBpmGate(meta, reason, { forceResume: true });
    }

    logApi('bpm-playback-user-event-blocked', {
      reason,
      type: event?.type || '',
      trackKey: meta?.key || '',
      gate: { ...gate }
    });

    return true;
  }

  function installPlaybackHardGate() {
    try {
      window.__PulseColorBpmPlaybackGuard = (media) => {
        if (!media || String(media.tagName || '').toLowerCase() !== 'audio') return true;

        const meta = getTrackMeta();
        if (playbackGate.internalResume && isBpmReadyForCurrentTrack(meta)) return true;
        if (playbackGate.resumeAllowedUntil > Date.now() && isBpmReadyForCurrentTrack(meta)) return true;
        if (!shouldBlockPlaybackNow(meta) && !playbackGate.blocked) return true;

        if (gate.status !== 'waiting' || (meta?.key && meta.key !== gate.trackKey)) {
          beginWaitingForTrack(meta, { reason: 'htmlmedia-play-blocked-until-bpm-ready', forceResume: true });
        } else {
          pausePlaybackForBpmGate(meta, 'htmlmedia-play-blocked-until-bpm-ready', { forceResume: true });
        }

        try { media.pause?.(); } catch {}
        logApi('bpm-playback-htmlmedia-play-blocked', {
          trackKey: meta?.key || '',
          gate: { ...gate }
        });

        return false;
      };

      if (!window.__PulseColorBpmNativePlay) {
        window.__PulseColorBpmNativePlay = HTMLMediaElement.prototype.play;
      }

      if (!HTMLMediaElement.prototype.play?.__pulseColorBpmPatched) {
        const nativePlay = window.__PulseColorBpmNativePlay;
        const patchedPlay = function patchedPulseColorBpmPlay(...args) {
          const guard = window.__PulseColorBpmPlaybackGuard;
          if (typeof guard === 'function' && guard(this, args) === false) {
            const error = new DOMException('PulseColor waits for BPM before playback', 'NotAllowedError');
            return Promise.reject(error);
          }

          return nativePlay.apply(this, args);
        };

        patchedPlay.__pulseColorBpmPatched = true;
        HTMLMediaElement.prototype.play = patchedPlay;
      }

      const capturePlaybackEvent = (event) => {
        if (event.type === 'keydown') {
          const key = String(event.key || '').toLowerCase();
          if (key !== 'enter' && key !== ' ') return;
        }

        if (!getPlaybackToggleFromEvent(event)) return;
        blockUserPlaybackEvent(event, `user-${event.type}-blocked-until-bpm-ready`);
      };

      if (!window.__PulseColorBpmPlaybackEventsInstalled) {
        ['pointerdown', 'mousedown', 'touchstart', 'click', 'keydown'].forEach((evt) => {
          document.addEventListener(evt, capturePlaybackEvent, { capture: true, passive: false });
        });
        window.__PulseColorBpmPlaybackEventsInstalled = true;
      }

      logApi('bpm-playback-hard-gate-ready', {
        patchedPlay: !!HTMLMediaElement.prototype.play?.__pulseColorBpmPatched,
        buttonSelector: PLAYBACK_TOGGLE_SELECTOR
      });
    } catch (error) {
      logApi('bpm-playback-hard-gate-error', {
        name: error?.name || 'Error',
        message: error?.message || String(error)
      });
    }
  }

  function attachAudioFromNode(node) {
    if (!node || node.nodeType !== 1) return false;

    let found = false;

    try {
      if (String(node.tagName || '').toLowerCase() === 'audio') {
        attachAudioLifecycle(node);
        found = true;
      }
    } catch {}

    try {
      node.querySelectorAll?.('audio').forEach((audio) => {
        attachAudioLifecycle(audio);
        found = true;
      });
    } catch {}

    return found;
  }

  function attachAudioFromMutations(muts) {
    let found = false;

    for (const m of muts) {
      if (m.type !== 'childList') continue;
      for (const n of m.addedNodes || []) {
        if (attachAudioFromNode(n)) found = true;
      }
    }

    return found;
  }

  function bindTreeObserver() {
    if (treeObserver) return;

    let refreshTimer = 0;
    let pendingRelevant = false;
    let pendingAudio = false;

    const scheduleRefresh = (delay = 140) => {
      if (refreshTimer) return;
      refreshTimer = window.setTimeout(() => {
        refreshTimer = 0;

        const runRelevant = pendingRelevant;
        const runAudio = pendingAudio;

        pendingRelevant = false;
        pendingAudio = false;

        if (runAudio) scanAudioNodes();
        if (runRelevant) {
          initYandexTrackMetaCapture();
          bindCoverObserver();
          checkTrackChange(true);
        }
      }, delay);
    };

    treeObserver = new MutationObserver((muts) => {
      let relevant = false;

      for (const m of muts) {
        if (m.type !== 'childList') continue;

        for (const n of m.addedNodes || []) {
          if (isRelevantNode(n)) {
            relevant = true;
            break;
          }
        }
        if (relevant) break;

        for (const n of m.removedNodes || []) {
          if (isRelevantNode(n)) {
            relevant = true;
            break;
          }
        }
        if (relevant) break;
      }

      const audioFound = attachAudioFromMutations(muts);

      if (!relevant && !audioFound) return;

      pendingRelevant = pendingRelevant || relevant;
      pendingAudio = pendingAudio || audioFound;
      scheduleRefresh(relevant ? 120 : 180);
    });

    treeObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  window.addEventListener('pulsecolor:beatDriverConfigChanged', (e) => {
    const nextMode = normalizeDriveMode(e?.detail?.cfg?.WAVE_DRIVE_MODE ?? getConfiguredDriveMode());
    logApi('config-changed', { nextMode, cfg: e?.detail?.cfg || null });
    if (nextMode === DRIVE_MODE_RAW) {
      enterSelectedRaw('raw');
      try { window.OsuBeat?.reset?.(); } catch {}
      return;
    }
    beginWaitingForTrack(getTrackMeta(), { reason: 'config-bpm-mode', forceResume: isAudioPlaying() });
  });

  async function initOnlineBpm() {
    await ensureBpmApiProvidersLoaded();

    initYandexTrackMetaCapture();
    installPlaybackHardGate();
    document.querySelectorAll('audio').forEach(attachAudioLifecycle);
    bindCoverObserver();
    bindTreeObserver();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checkTrackChange(true); });
    window.addEventListener('focus', () => checkTrackChange(true));
    window.addEventListener('pageshow', () => checkTrackChange(true));

    if (getConfiguredDriveMode() === DRIVE_MODE_RAW) enterSelectedRaw('raw');
    else beginWaitingForTrack(getTrackMeta(), { reason: 'initial-bpm-mode', forceResume: false });
  }

  initOnlineBpm().catch((error) => {
    logApi('init-error', {
      name: error?.name || 'Error',
      message: error?.message || String(error)
    });
    beginWaitingForTrack(getTrackMeta(), { reason: 'initial-bpm-mode-after-init-error', forceResume: false });
  });
})();
