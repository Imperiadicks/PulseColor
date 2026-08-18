(() => {
  "use strict";

  const PC = window.PulseColor;
  const U = window.PulseColorRuntimeUtils;
  if (!PC?.runtime || !U) throw new Error("PulseColor RuntimeCore must be loaded before OnlineOsuBPM");
  if (PC.bpm?.version >= 2) return;

  const CACHE_KEY = "PulseColor.bpmCache.v17";
  const LEGACY_CACHE_KEY = "PulseColor.bpmCache.v16";
  const CACHE_LIMIT = 450;
  const NORMALIZATION_VERSION = 3;
  const REQUEST_TIMEOUT_MS = 12000;
  const counters = PC.diagnostics.counters;

  let requestGeneration = 0;
  let activeRequest = null;
  let removeTrack = null;
  let removeSettings = null;
  let serviceRunning = false;
  let lastPlayback = { trackKey: "", positionMs: 0 };
  let cache = U.migrateBpmCache(
    U.safeJson(localStorage.getItem(CACHE_KEY), {}),
    null,
    { limit: CACHE_LIMIT, normalizationVersion: NORMALIZATION_VERSION }
  );
  let legacyCache = U.migrateBpmCache(
    null,
    U.safeJson(localStorage.getItem(LEGACY_CACHE_KEY), {}),
    { limit: CACHE_LIMIT, normalizationVersion: NORMALIZATION_VERSION }
  );

  const state = {
    selectedMode: PC.settings.getWave().WAVE_DRIVE_MODE === "bpm" ? "bpm" : "raw",
    effectiveMode: "raw",
    status: "raw",
    bpm: 0,
    source: "",
    trackKey: "",
    trackSig: "",
    error: "",
    cacheHit: false
  };

  const stateListeners = new Set();
  const stateView = Object.freeze({
    get selectedMode() { return state.selectedMode; },
    get effectiveMode() { return state.effectiveMode; },
    get status() { return state.status; },
    get bpm() { return state.bpm || null; },
    get source() { return state.source; },
    get trackKey() { return state.trackKey; },
    get trackSig() { return state.trackSig; },
    get error() { return state.error; },
    get cacheHit() { return state.cacheHit; },
    get phase() {
      if (state.effectiveMode !== "bpm" || !state.bpm) return 0;
      const period = 60000 / state.bpm;
      const currentTrack = PC.track.getCurrent();
      if (!currentTrack?.key || currentTrack.key !== state.trackKey) return 0;
      const playback = PC.track.getPlayback?.() || PC.dom?.getPlayback?.() || null;
      if (Number.isFinite(playback?.currentTimeMs) && playback.currentTimeMs >= 0) {
        lastPlayback = { trackKey: currentTrack.key, positionMs: playback.currentTimeMs };
      }
      const positionMs = lastPlayback.trackKey === currentTrack.key ? lastPlayback.positionMs : 0;
      return ((positionMs % period) + period) % period / period;
    }
  });

  const compactLogDetail = (detail) => {
    if (!detail || typeof detail !== "object") return detail;
    const out = {};
    for (const [key, value] of Object.entries(detail)) {
      if (["data", "detail", "context", "searchItems", "tracks"].includes(key)) {
        out[key] = Array.isArray(value) ? `[${value.length} items]` : value ? "[omitted]" : value;
      } else if (key === "out" && value && typeof value === "object") {
        out.out = { bpm: U.normalizeBpm(value.bpm), src: String(value.src || "") };
      } else {
        out[key] = value;
      }
    }
    return out;
  };

  const logApi = (stage, detail = {}) => PC.logger.info(`bpm:${stage}`, compactLogDetail(detail));
  const logApiKeyCheck = (provider, key, detail = {}) => logApi("provider-config", {
    provider,
    configured: !!String(key || "").trim(),
    sig: detail.sig || ""
  });

  const saveCache = () => {
    cache = U.migrateBpmCache(cache, null, { limit: CACHE_LIMIT, normalizationVersion: NORMALIZATION_VERSION });
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  };
  saveCache();

  const notify = (reason) => {
    PC.logger.info("bpm-state", {
      reason,
      selectedMode: state.selectedMode,
      effectiveMode: state.effectiveMode,
      status: state.status,
      bpm: state.bpm,
      source: state.source,
      trackKey: state.trackKey,
      cacheHit: state.cacheHit
    });
    for (const listener of stateListeners) {
      try { listener(stateView, reason); }
      catch (error) { PC.logger.error("bpm-state-listener", error); }
    }
    window.dispatchEvent(new CustomEvent("pulsecolor:bpm-state", { detail: {
      selectedMode: state.selectedMode,
      effectiveMode: state.effectiveMode,
      status: state.status,
      bpm: state.bpm || null,
      source: state.source,
      trackKey: state.trackKey,
      cacheHit: state.cacheHit,
      reason
    } }));
  };

  const setState = (patch, reason) => {
    Object.assign(state, patch);
    notify(reason);
  };

  const asArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
  const uniqueClean = (values) => Array.from(new Set(asArray(values).flat().map((value) => String(value || "").trim()).filter(Boolean)));
  const normalizeIsrc = (value) => String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const isTitleMatch = (left, right) => {
    if (!U.versionsCompatible(left, right)) return false;
    const a = U.normalizeCompare(left);
    const b = U.normalizeCompare(right);
    return !!a && !!b && (a === b || a.includes(b) || b.includes(a));
  };
  const isArtistMatch = (left, right) => {
    const a = U.normalizeCompare(left);
    const b = U.normalizeCompare(right);
    return !!a && !!b && (a === b || a.includes(b) || b.includes(a));
  };
  const durationMatches = (leftMs, rightMs, toleranceMs = 15000) => {
    const left = U.parseDurationMs(leftMs);
    const right = U.parseDurationMs(rightMs);
    return !left || !right || Math.abs(left - right) <= toleranceMs;
  };
  const trackCacheKey = (track) => track?.cacheKey || U.getTrackCacheKey(track);
  const buildLookup = ({ title, artist } = {}) => [String(artist || "").trim(), String(title || "").trim()].filter(Boolean).join(" ");

  const extractFirstTempo = (value, depth = 0) => {
    if (depth > 5 || value == null) return 0;
    if (typeof value === "number" || typeof value === "string") return U.normalizeBpm(value);
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 30)) {
        const bpm = extractFirstTempo(item, depth + 1);
        if (bpm) return bpm;
      }
      return 0;
    }
    if (typeof value !== "object") return 0;
    for (const key of ["tempo", "bpm", "beatsPerMinute", "beats_per_minute"]) {
      const bpm = U.normalizeBpm(value[key]);
      if (bpm) return bpm;
    }
    for (const [key, item] of Object.entries(value)) {
      if (/status|duration|length|code|year|rank|id/i.test(key)) continue;
      const bpm = extractFirstTempo(item, depth + 1);
      if (bpm) return bpm;
    }
    return 0;
  };

  const pickBestSong = (songs, targetTitle, targetArtist, targetDurationMs = 0) => {
    let best = null;
    let bestScore = -1;
    for (const song of asArray(songs)) {
      const title = song?.title || song?.name || song?.song_title || "";
      const artist = song?.artist?.name || song?.artist || song?.artist_name || "";
      const titleExact = U.normalizeCompare(title) === U.normalizeCompare(targetTitle);
      const artistExact = U.normalizeCompare(artist) === U.normalizeCompare(targetArtist);
      const titleNear = isTitleMatch(title, targetTitle);
      const artistNear = isArtistMatch(artist, targetArtist);
      if (!U.versionsCompatible(title, targetTitle)) continue;
      let score = 0;
      if (titleExact) score += 10; else if (titleNear) score += 6;
      if (artistExact) score += 10; else if (artistNear) score += 6;
      if (song?.tempo) score += 1;
      const songDurationMs = U.parseDurationMs(song?.duration || song?.length || song?.duration_ms);
      if (targetDurationMs && songDurationMs) {
        const diff = Math.abs(targetDurationMs - songDurationMs);
        if (diff <= 2500) score += 5;
        else if (diff <= 7000) score += 3;
        else if (diff > 15000) score -= 8;
      }
      if (score > bestScore) { best = song; bestScore = score; }
    }
    return bestScore >= 12 ? best : null;
  };

  const maskUrlForLog = (value) => {
    try {
      const url = new URL(String(value || ""));
      ["api_key", "apikey", "key", "token", "access_token"].forEach((key) => {
        if (url.searchParams.has(key)) url.searchParams.set(key, "[redacted]");
      });
      return `${url.origin}${url.pathname}${url.search}`;
    } catch {
      return String(value || "").replace(/((?:api_key|apikey|key|token|access_token)=)[^&]+/gi, "$1[redacted]");
    }
  };

  const createCore = (signal, session) => {
    let providers = {};
    const fetchBase = async (url, sig, options = {}, responseType = "json") => {
      const startedAt = performance.now();
      if (signal.aborted) return { ok: false, type: "cancelled", data: null };
      logApi("request-start", { provider: session.provider || "", sig, endpoint: maskUrlForLog(url) });
      try {
        const response = await fetch(url, { ...options, signal });
        const durationMs = Math.round(performance.now() - startedAt);
        if (!response.ok) {
          logApi("request-end", { sig, endpoint: maskUrlForLog(url), status: response.status, durationMs });
          return { ok: false, type: response.status === 429 ? "rate-limit" : `http-${response.status}`, status: response.status };
        }
        const data = responseType === "blob" ? await response.blob() : await response.json();
        logApi("request-end", { sig, endpoint: maskUrlForLog(url), status: response.status, durationMs });
        return responseType === "blob" ? { ok: true, type: "ok", blob: data, status: response.status } : { ok: true, type: "ok", data, status: response.status };
      } catch (error) {
        const type = signal.aborted || error?.name === "AbortError" ? "cancelled" : "network-error";
        logApi("request-error", { sig, endpoint: maskUrlForLog(url), type, name: error?.name, message: error?.message });
        return { ok: false, type, error };
      }
    };

    const core = {
      logApi,
      logApiKeyCheck,
      fetchJson: (url, sig, options) => fetchBase(url, sig, options, "json"),
      fetchBlob: (url, sig, options) => fetchBase(url, sig, options, "blob"),
      maskUrlForLog,
      buildLookup,
      pickBestSong,
      normBpm: U.normalizeBpm,
      extractFirstTempo,
      uniqueClean,
      asArray,
      normalizeCompare: U.normalizeCompare,
      isTitleMatch,
      isArtistMatch,
      durationMatches,
      versionsCompatible: U.versionsCompatible,
      parseDurationMs: U.parseDurationMs,
      normalizeIsrc,
      pushContextIsrc(context, value) {
        const isrc = normalizeIsrc(value);
        if (context && isrc) context.isrcs = uniqueClean([...(context.isrcs || []), isrc]);
      },
      pushContextReccoBeatsId(context, value) {
        const id = String(value || "").trim();
        if (context && id) context.reccobeatsIds = uniqueClean([...(context.reccobeatsIds || []), id]);
      },
      getProvider: (name) => providers[name] || null
    };
    providers = {
      GetSongBPM: window.PulseColorBpmApiFactories?.GetSongBPM?.(core) || null,
      Deezer: window.PulseColorBpmApiFactories?.Deezer?.(core) || null,
      ReccoBeats: window.PulseColorBpmApiFactories?.ReccoBeats?.(core) || null
    };
    return { core, providers };
  };

  const cancelActive = (reason = "cancelled", notifyCancellation = true) => {
    if (!activeRequest) return;
    activeRequest.controller.abort(reason);
    clearTimeout(activeRequest.timeoutId);
    activeRequest = null;
    if (notifyCancellation) {
      setState({ status: "cancelled", effectiveMode: "raw", bpm: 0, source: "", error: reason, cacheHit: false }, reason);
    }
  };

  const applyReady = (track, bpm, source, generation) => {
    if (!activeRequest || activeRequest.generation !== generation) return false;
    if (PC.track.getCurrent().key !== track.key || state.selectedMode !== "bpm") return false;
    const value = U.normalizeBpm(bpm);
    if (!value) return false;
    clearTimeout(activeRequest.timeoutId);
    activeRequest = null;
    const cacheKey = trackCacheKey(track);
    if (cacheKey) cache[cacheKey] = {
      bpm: value,
      source,
      fetchedAt: Date.now(),
      normalizationVersion: NORMALIZATION_VERSION
    };
    saveCache();
    lastPlayback = { trackKey: track.key, positionMs: PC.track.getPlayback?.()?.currentTimeMs || 0 };
    setState({ status: "bpm", effectiveMode: "bpm", bpm: value, source, trackKey: track.key, trackSig: track.sig, error: "", cacheHit: false }, "bpm-ready");
    return true;
  };

  const fallbackRaw = (track, status, source, generation, error = "") => {
    if (activeRequest?.generation === generation) {
      clearTimeout(activeRequest.timeoutId);
      activeRequest = null;
    }
    if (PC.track.getCurrent().key !== track.key || state.selectedMode !== "bpm") return;
    setState({ status, effectiveMode: "raw", bpm: 0, source, trackKey: track.key, trackSig: track.sig, error, cacheHit: false }, status);
  };

  const resolveTrack = async (track, reason = "track-change") => {
    if (state.selectedMode !== "bpm") return;
    if (!track?.key || !track?.sig || !track.title || !track.artist) {
      setState({ status: "fallback_raw", effectiveMode: "raw", bpm: 0, source: "metadata-miss", trackKey: track?.key || "", trackSig: track?.sig || "", cacheHit: false }, "metadata-miss");
      return;
    }
    if (activeRequest?.trackKey === track.key) return;
    cancelActive("superseded", false);

    const cacheKey = trackCacheKey(track);
    let cached = cacheKey ? cache[cacheKey] : null;
    let migratedLegacy = false;
    if (!cached && !(track.versionTags?.length) && track.sig && legacyCache[track.sig]) {
      cached = legacyCache[track.sig];
      migratedLegacy = true;
    }
    const cachedBpm = U.normalizeBpm(cached?.bpm);
    if (cachedBpm) {
      if (migratedLegacy && cacheKey) {
        cache[cacheKey] = { ...cached, normalizationVersion: NORMALIZATION_VERSION };
        delete legacyCache[track.sig];
        saveCache();
      }
      lastPlayback = { trackKey: track.key, positionMs: PC.track.getPlayback?.()?.currentTimeMs || 0 };
      setState({ status: "bpm", effectiveMode: "bpm", bpm: cachedBpm, source: `cache:${cached.source || "unknown"}`, trackKey: track.key, trackSig: track.sig, error: "", cacheHit: true }, "cache-hit");
      return;
    }

    const generation = ++requestGeneration;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort("timeout"), REQUEST_TIMEOUT_MS);
    activeRequest = { generation, controller, timeoutId, trackKey: track.key };
    counters.bpmRequests += 1;
    setState({ status: "loading", effectiveMode: "raw", bpm: 0, source: "", trackKey: track.key, trackSig: track.sig, error: "", cacheHit: false }, reason);

    const session = { provider: "" };
    const { providers } = createCore(controller.signal, session);
    const context = {
      requestedTitle: track.title,
      requestedArtist: track.artist,
      requestedDurationMs: track.durationMs,
      yandexTrackId: track.id,
      isrcs: [],
      reccobeatsIds: [],
      deezer: null,
      deezerPreviewUrl: "",
      reccoAudioSource: ""
    };

    try {
      session.provider = "GetSongBPM";
      const direct = providers.GetSongBPM ? await providers.GetSongBPM.lookup({ ...track, context }) : { bpm: 0, src: "getsongbpm-provider-missing" };
      if (controller.signal.aborted) throw new DOMException(String(controller.signal.reason || "Aborted"), "AbortError");
      if (U.normalizeBpm(direct?.bpm) && applyReady(track, direct.bpm, direct.src || "getsongbpm", generation)) return;

      session.provider = "Deezer";
      const deezer = providers.Deezer ? await providers.Deezer.lookup({ ...track, context }) : { bpm: 0, src: "deezer-provider-missing" };
      if (controller.signal.aborted) throw new DOMException(String(controller.signal.reason || "Aborted"), "AbortError");
      if (U.normalizeBpm(deezer?.bpm) && applyReady(track, deezer.bpm, deezer.src || "deezer", generation)) return;

      if (!context.deezerPreviewUrl && providers.Deezer?.ensurePreview) {
        await providers.Deezer.ensurePreview({ ...track, context });
      }
      if (controller.signal.aborted) throw new DOMException(String(controller.signal.reason || "Aborted"), "AbortError");

      session.provider = "ReccoBeats";
      const recco = providers.ReccoBeats ? await providers.ReccoBeats.lookup({ ...track, context }) : { bpm: 0, src: "reccobeats-provider-missing" };
      if (controller.signal.aborted) throw new DOMException(String(controller.signal.reason || "Aborted"), "AbortError");
      if (U.normalizeBpm(recco?.bpm) && applyReady(track, recco.bpm, recco.src || "reccobeats", generation)) return;

      const finalSource = recco?.src || deezer?.src || direct?.src || "bpm-miss";
      const transportError = [direct?.src, deezer?.src, recco?.src].some((src) => /network-error|http-|rate-limit/i.test(String(src || "")));
      fallbackRaw(track, transportError ? "error" : "fallback_raw", finalSource, generation, transportError ? "BPM providers were unavailable" : "");
    } catch (error) {
      const timedOut = controller.signal.aborted && String(controller.signal.reason || "").includes("timeout");
      if (activeRequest?.generation !== generation) return;
      fallbackRaw(track, timedOut ? "timeout" : error?.name === "AbortError" ? "cancelled" : "error", session.provider || "bpm-error", generation, error?.message || String(error));
    }
  };

  const selectMode = (mode, source = "api") => {
    const selectedMode = String(mode).toLowerCase() === "bpm" ? "bpm" : "raw";
    if (state.selectedMode === selectedMode && (selectedMode === "raw" || state.trackKey === PC.track.getCurrent().key)) return;
    state.selectedMode = selectedMode;
    if (selectedMode === "raw") {
      cancelActive("mode-raw");
      setState({ status: "raw", effectiveMode: "raw", bpm: 0, source: "", trackKey: PC.track.getCurrent().key, trackSig: PC.track.getCurrent().sig, error: "", cacheHit: false }, source);
    } else {
      resolveTrack(PC.track.getCurrent(), source);
    }
  };

  const api = {
    version: 2,
    getState: () => stateView,
    getPhase: () => stateView.phase,
    selectMode,
    resolveCurrent: (reason = "manual") => resolveTrack(PC.track.getCurrent(), reason),
    clearCache() {
      cache = {};
      legacyCache = {};
      localStorage.removeItem(CACHE_KEY);
      localStorage.removeItem(LEGACY_CACHE_KEY);
      return true;
    },
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("BPM listener must be a function");
      stateListeners.add(listener);
      listener(stateView, "subscribe");
      return () => stateListeners.delete(listener);
    },
    stop: () => stopService()
  };

  PC.bpm = api;
  const legacyWaveMode = window.PulseColorWaveMode || {};
  delete legacyWaveMode.canUseTapTempo;
  delete legacyWaveMode.canUseLocalBpm;
  window.PulseColorWaveMode = Object.assign(legacyWaveMode, {
    getSelectedMode: () => state.selectedMode,
    getEffectiveMode: () => state.effectiveMode,
    getStatus: () => state.status,
    isPlaybackBlocked: () => false,
    clearBpmApiCache: () => api.clearCache()
  });
  const legacyOsuBeat = window.OsuBeat || {};
  delete legacyOsuBeat.reset;
  delete legacyOsuBeat.resync;
  delete legacyOsuBeat.retune;
  window.OsuBeat = Object.assign(legacyOsuBeat, {
    bpm: () => state.bpm || null,
    confidence: () => state.status === "bpm" ? 1 : 0,
    phase: () => stateView.phase,
    locked: () => state.status === "bpm"
  });

  const startService = () => {
    if (serviceRunning) return;
    serviceRunning = true;
    removeTrack = PC.track.subscribe((track) => {
      lastPlayback = { trackKey: track.key, positionMs: PC.track.getPlayback?.()?.currentTimeMs || 0 };
      if (state.selectedMode === "bpm") resolveTrack(track, "track-change");
      else setState({ trackKey: track.key, trackSig: track.sig, effectiveMode: "raw", status: "raw", bpm: 0, source: "", error: "", cacheHit: false }, "raw-track-change");
    });
    removeSettings = PC.settings.subscribe((next, change) => {
      const mode = next.wave.WAVE_DRIVE_MODE === "bpm" ? "bpm" : "raw";
      if (mode !== state.selectedMode) selectMode(mode, `settings:${change.source}`);
    });
    if (state.selectedMode === "bpm") resolveTrack(PC.track.getCurrent(), "initial");
    else notify("initial-raw");
  };

  function stopService() {
    if (!serviceRunning && !activeRequest) return;
    serviceRunning = false;
    removeTrack?.();
    removeSettings?.();
    removeTrack = null;
    removeSettings = null;
    cancelActive("runtime-stop", false);
    stateListeners.clear();
  }

  if (typeof PC.runtime.registerService === "function") {
    PC.runtime.registerService("bpm", { start: startService, stop: stopService });
  } else {
    startService();
  }
})();
