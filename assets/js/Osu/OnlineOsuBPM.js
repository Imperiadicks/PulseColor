/* ========================== PulseColor: GetSongBPM gate + RAW fallback ========================== */
(() => {
  const DRIVE_MODE_RAW = 'raw';
  const DRIVE_MODE_BPM = 'bpm';
  const WAIT_MS = 5000;
  const API_TIMEOUT_MS = 9000;
  const REQUEST_COOLDOWN_MS = 15000;
  const MISS_COOLDOWN_MS = 45000;
  const ERROR_COOLDOWN_MS = 60000;
  const RATE_LIMIT_COOLDOWN_MS = 180000;
  const CACHE_KEY = 'PulseColor.bpmCache.v9';
  const CACHE_LIMIT = 450;
  const API_BASE = 'https://api.getsong.co';
  const STATIC_API_KEY = '';
  const API_KEY_STORAGE_KEY = 'PulseColor.getSongBpmApiKey';

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
  const getApiKey = () => {
    const fromWindow = (window.__GETSONGBPM_API_KEY || window.__GETSONGBPM_APIKEY || '').toString().trim();
    if (fromWindow) return fromWindow;
    try {
      const fromStorage = (localStorage.getItem(API_KEY_STORAGE_KEY) || '').toString().trim();
      if (fromStorage) return fromStorage;
    } catch {}
    return STATIC_API_KEY.trim();
  };

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

  const gate = {
    selectedMode: getConfiguredDriveMode(),
    effectiveMode: DRIVE_MODE_RAW,
    status: 'raw',
    trackKey: ''
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
      api.canUseTapTempo = () => snapshot.effectiveMode === DRIVE_MODE_RAW;
      api.canUseLocalBpm = () => snapshot.effectiveMode === DRIVE_MODE_RAW;
      api.hasGetSongBpmApiKey = () => !!getApiKey();
      api.retryGetSongBpm = () => beginWaitingForTrack(getTrackMeta());
      api.clearGetSongBpmCache = () => { try { localStorage.removeItem(CACHE_KEY); } catch {} };
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
      console.groupCollapsed(`[PulseColor][GetSongBPM] ${stage}`);
      console.log(payload);
      console.groupEnd();
    } catch {
      try { console.log(`[PulseColor][GetSongBPM] ${stage}`, payload); } catch {}
    }
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

  const getCoverNode = () => {
    const nodes = new Set();

    for (const selector of COVER_IMAGE_SELECTORS) {
      try {
        document.querySelectorAll(selector).forEach((img) => nodes.add(img));
      } catch {}
    }

    return Array.from(nodes)
      .filter((img) => coverScore(img) >= 0)
      .sort((a, b) => coverScore(b) - coverScore(a))[0] || null;
  };

  const normalizeCoverSig = (src) => String(src || '')
    .replace(/\/(?:50x50|80x80|100x100|200x200|300x300|400x400|800x800|1000x1000)(?=[/?]|$)/g, '')
    .replace(/[?#].*$/, '');

  const getCoverSig = () => normalizeCoverSig(coverSrcFromImg(getCoverNode()));

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
    const key = coverSig || sig || normalizeSig(document.title);
    const meta = { title: title.trim(), artist: artist.trim(), sig, key, coverSig };
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

  const fetchJson = async (url, sig) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);
    activeLookupController = ctrl;

    try {
      logApi('request', { url, sig, selectedMode: gate.selectedMode, effectiveMode: gate.effectiveMode, status: gate.status });
      const res = await fetch(url, { method: 'GET', signal: ctrl.signal });
      const rawText = await res.text();
      let data = null;
      try { data = rawText ? JSON.parse(rawText) : null; } catch { data = null; }
      logApi('response', {
        url,
        sig,
        status: res.status,
        ok: res.ok,
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
      logApi('error', {
        url,
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

  const lookupOnline = async ({ title, artist, sig } = {}) => {
    const t = (title || '').trim();
    const a = (artist || '').trim();
    const s = (sig || '').trim();
    if (!t || !a || !s) return { bpm: 0, src: 'getsongbpm-miss' };

    const apiKey = getApiKey();
    if (!apiKey) return { bpm: 0, src: 'getsongbpm-no-key' };

    const cooldownUntil = requestCooldowns.get(s) || 0;
    if (cooldownUntil > Date.now()) return { bpm: 0, src: 'getsongbpm-cooldown' };
    if (activeLookupPromise && activeLookupSig === s) return await activeLookupPromise;

    activeLookupSig = s;
    activeLookupPromise = (async () => {
      const lookup = buildLookup({ title: t, artist: a });
      const searchUrl = `${API_BASE}/search/?type=both&limit=12&lookup=${encodeURIComponent(lookup)}&api_key=${encodeURIComponent(apiKey)}`;
      const searchOut = await fetchJson(searchUrl, s);
      if (!searchOut.ok) return { bpm: 0, src: `getsongbpm-${searchOut.type}` };

      const bestSong = pickBestSong(searchOut.data?.search, t, a);
      logApi('search-picked', {
        sig: s,
        requested: { title: t, artist: a },
        searchItems: Array.isArray(searchOut.data?.search) ? searchOut.data.search : [],
        bestSong
      });
      if (!bestSong?.id) {
        setCooldown(s, MISS_COOLDOWN_MS);
        return { bpm: 0, src: 'getsongbpm-miss' };
      }

      const searchTempo = normBpm(bestSong?.tempo);
      if (searchTempo) {
        setCooldown(s, REQUEST_COOLDOWN_MS);
        return { bpm: searchTempo, src: 'getsongbpm' };
      }

      const songUrl = `${API_BASE}/song/?id=${encodeURIComponent(bestSong.id)}&api_key=${encodeURIComponent(apiKey)}`;
      const songOut = await fetchJson(songUrl, s);
      if (!songOut.ok) return { bpm: 0, src: `getsongbpm-${songOut.type}` };

      const tempo = normBpm(songOut.data?.song?.tempo);
      logApi('song-tempo', {
        sig: s,
        songId: bestSong.id,
        song: songOut.data?.song || null,
        normalizedTempo: tempo
      });
      if (tempo) {
        setCooldown(s, REQUEST_COOLDOWN_MS);
        return { bpm: tempo, src: 'getsongbpm' };
      }

      setCooldown(s, MISS_COOLDOWN_MS);
      return { bpm: 0, src: 'getsongbpm-miss' };
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
    setGate({ selectedMode: DRIVE_MODE_RAW, effectiveMode: DRIVE_MODE_RAW, status: reason, trackKey: curTrackKey || '' });
    lastNet = { status: 'raw', src: 'raw', bpm: 0 };
    publishNet();
  };

  const enterRawFallback = (reason = 'raw-fallback') => {
    clearWaitTimer();
    cancelPendingLookup();
    setGate({ selectedMode: DRIVE_MODE_BPM, effectiveMode: DRIVE_MODE_RAW, status: reason, trackKey: curTrackKey || '' });
  };

  const applyBpmActive = (meta, bpm, src = 'getsongbpm') => {
    clearWaitTimer();
    setGate({ selectedMode: DRIVE_MODE_BPM, effectiveMode: DRIVE_MODE_BPM, status: 'bpm-active', trackKey: meta?.key || curTrackKey || '' });
    lastNet = { status: 'hit', src, bpm };
    publishNet();
    try { window.OsuBeat?.retune?.({ presetBpm: bpm, source: src }); } catch {}
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
      applyBpmActive(meta, out.bpm, out.src || 'getsongbpm');
      return;
    }

    lastNet = {
      status: out.src === 'getsongbpm-rate-limit' ? 'rate-limit' :
        out.src === 'getsongbpm-no-key' ? 'no-key' :
        out.src === 'getsongbpm-cooldown' ? 'cooldown' : 'miss',
      src: out.src || 'getsongbpm',
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

  const beginWaitingForTrack = (meta = null) => {
    const fresh = meta || getTrackMeta();
    const trackKey = fresh?.key || getCoverSig() || curTrackKey || `pending-${Date.now()}`;
    seq += 1;
    curTrackKey = trackKey;
    curTrackSig = fresh?.sig || '';
    clearWaitTimer();
    cancelPendingLookup();
    try { window.OsuBeat?.reset?.(); } catch {}

    const apiKey = getApiKey();
    if (!apiKey) {
      lastNet = { status: 'no-key', src: 'getsongbpm-no-key', bpm: 0 };
      publishNet();
      setGate({ selectedMode: DRIVE_MODE_BPM, effectiveMode: DRIVE_MODE_RAW, status: 'getsongbpm-no-key', trackKey });
      return;
    }

    const cache = loadCache();
    const row = fresh?.sig ? cache[fresh.sig] : null;
    const cachedBpm = normBpm(row?.bpm);
    if (cachedBpm) {
      setGate({ selectedMode: DRIVE_MODE_BPM, effectiveMode: DRIVE_MODE_BPM, status: 'bpm-active', trackKey });
      lastNet = { status: 'hit', src: row?.src || 'cache', bpm: cachedBpm };
      publishNet();
      try { window.OsuBeat?.retune?.({ presetBpm: cachedBpm, source: row?.src || 'cache' }); } catch {}
      return;
    }

    setGate({ selectedMode: DRIVE_MODE_BPM, effectiveMode: DRIVE_MODE_BPM, status: 'waiting', trackKey });
    lastNet = { status: 'pending', src: 'getsongbpm', bpm: 0 };
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
        enterSelectedRaw('raw');
        return;
      }
      if (meta?.sig && meta.sig !== curTrackSig) curTrackSig = meta.sig;
      if (gate.selectedMode !== DRIVE_MODE_RAW || gate.effectiveMode !== DRIVE_MODE_RAW || gate.status !== 'raw') enterSelectedRaw('raw');
      return;
    }

    if (key && key !== curTrackKey) {
      beginWaitingForTrack(meta);
      return;
    }

    if (meta?.sig && meta.sig !== curTrackSig) {
      curTrackSig = meta.sig;
      beginWaitingForTrack(meta);
      return;
    }

    if (gate.selectedMode !== DRIVE_MODE_BPM) {
      beginWaitingForTrack(meta);
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
    if (!el || mediaLifecycleBound.has(el)) return;
    mediaLifecycleBound.add(el);
    const ping = () => checkTrackChange(true);
    [
      'play', 'playing', 'loadedmetadata', 'loadeddata', 'durationchange',
      'seeked', 'emptied', 'canplay', 'canplaythrough'
    ].forEach((evt) => el.addEventListener(evt, ping, { passive: true }));
  }

  function isRelevantNode(node) {
    if (!node || node.nodeType !== 1) return false;
    const relevantSelector = 'audio, div[data-test-id="PLAYERBAR_DESKTOP_COVER_CONTAINER"], img[data-test-id="ENTITY_COVER_IMAGE"], img[class*="AlbumCover_cover__"], img[src*="avatars.yandex.net/get-music-content"], img[srcset*="avatars.yandex.net/get-music-content"]';
    if (node.matches?.(relevantSelector)) return true;
    return !!node.querySelector?.(relevantSelector);
  }

  function bindTreeObserver() {
    if (treeObserver) return;
    treeObserver = new MutationObserver((muts) => {
      let relevant = false;
      for (const m of muts) {
        if (m.type !== 'childList') continue;
        for (const n of m.addedNodes) {
          if (isRelevantNode(n)) { relevant = true; break; }
        }
        if (relevant) break;
        for (const n of m.removedNodes) {
          if (isRelevantNode(n)) { relevant = true; break; }
        }
        if (relevant) break;
      }
      document.querySelectorAll('audio').forEach(attachAudioLifecycle);
      bindCoverObserver();
      if (relevant) checkTrackChange(true);
    });
    treeObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  window.addEventListener('pulsecolor:getSongBpmApiKeyChanged', () => {
    logApi('api-key-changed', { hasKey: !!getApiKey(), configuredMode: getConfiguredDriveMode() });
    if (getConfiguredDriveMode() === DRIVE_MODE_BPM) beginWaitingForTrack(getTrackMeta());
  });

  window.addEventListener('pulsecolor:beatDriverConfigChanged', (e) => {
    const nextMode = normalizeDriveMode(e?.detail?.cfg?.WAVE_DRIVE_MODE ?? getConfiguredDriveMode());
    logApi('config-changed', { nextMode, cfg: e?.detail?.cfg || null });
    if (nextMode === DRIVE_MODE_RAW) {
      enterSelectedRaw('raw');
      try { window.OsuBeat?.reset?.(); } catch {}
      return;
    }
    beginWaitingForTrack(getTrackMeta());
  });

  document.querySelectorAll('audio').forEach(attachAudioLifecycle);
  bindCoverObserver();
  bindTreeObserver();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkTrackChange(true); });
  window.addEventListener('focus', () => checkTrackChange(true));
  window.addEventListener('pageshow', () => checkTrackChange(true));

  if (getConfiguredDriveMode() === DRIVE_MODE_RAW) enterSelectedRaw('raw');
  else beginWaitingForTrack(getTrackMeta());
})();
