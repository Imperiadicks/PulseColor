(() => {
  "use strict";

  if (window.PulseColor?.runtime?.version >= 2) return;

  const U = window.PulseColorRuntimeUtils;
  if (!U) throw new Error("PulseColor RuntimeUtils must be loaded first");

  const STORAGE = Object.freeze({
    wave: "PulseColor.BeatDriverConfig.v1",
    core: "PulseColor.CoreSettings.v1",
    addons: "PulseColor.AddonSupport.v1"
  });

  const DEFAULT_WAVE = Object.freeze({
    ENABLE_CUSTOM_WAVE: true,
    WAVE_VARIANT: "variant1",
    WAVE_DRIVE_MODE: "raw",
    WAVE_PERFORMANCE_MODE: "efficient",
    REACTION_INTENSITY: 1,
    SMOOTHNESS: 0.72,
    SENSITIVITY: 1,
    USE_COVER_COLORS: true,
    USE_COVER_TEXTURE: false,
    WEBGL_QUALITY: "auto",
    WEBGL_DPR_LIMIT: 1.5,
    BRIGHTNESS_BASE: 1,
    MOTION_ENABLED: true,
    MOTION_SPEED: 0.36
  });

  const DEFAULT_CORE = Object.freeze({
    enableBackgroundImage: true,
    enableFullVibe: true,
    forceWhiteRecolor: false
  });

  const DEFAULT_ADDONS = Object.freeze({
    tweakedYmDesign: Object.freeze({
      enabled: false,
      lyricsBlur: true,
      lyricsMaxBlur: 8,
      lyricsBlurStep: 2.2,
      lyricsMinOpacity: 0.35,
      lyricsOpacityStep: 0.12,
      lyricsTransitionMs: 250,
      coverBackground: true,
      coverBlur: 28,
      coverSaturate: 1.2,
      coverOverlay: 0.55,
      coverCrossfadeMs: 900,
      coverMotion: true,
      coverMotionDuration: 26
    }),
    cover2Anim: Object.freeze({
      enabled: true,
      colorMode: "pulsecolor",
      blobCount: 16,
      blobSpeed: 0.5,
      paletteBlendSpeed: 0.8,
      backgroundLightness: 0,
      showFps: false,
      canvasFilter: "",
      warp: 0.14,
      flow: 0.53,
      saturation: 1.5,
      highlight: 0.99,
      paletteFadeMs: 500
    })
  });

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const mergeSection = (defaults, stored) => Object.assign({}, defaults, stored && typeof stored === "object" ? stored : {});
  const numberOr = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const onlyKnown = (defaults, input) => {
    const merged = mergeSection(defaults, input);
    return Object.fromEntries(Object.keys(defaults).map((key) => [key, merged[key]]));
  };

  const normalizeWave = (input) => {
    const merged = mergeSection(DEFAULT_WAVE, input);
    const next = Object.fromEntries(Object.keys(DEFAULT_WAVE).map((key) => [key, merged[key]]));
    next.ENABLE_CUSTOM_WAVE = next.ENABLE_CUSTOM_WAVE !== false;
    next.WAVE_VARIANT = ["variant1", "variant2", "variant3"].includes(next.WAVE_VARIANT) ? next.WAVE_VARIANT : "variant1";
    next.WAVE_DRIVE_MODE = String(next.WAVE_DRIVE_MODE).toLowerCase() === "bpm" ? "bpm" : "raw";
    next.WAVE_PERFORMANCE_MODE = String(next.WAVE_PERFORMANCE_MODE).toLowerCase() === "max" ? "max" : "efficient";
    next.REACTION_INTENSITY = U.clamp(numberOr(next.REACTION_INTENSITY, 1), 0.1, 3);
    next.SMOOTHNESS = U.clamp(numberOr(next.SMOOTHNESS, 0.72), 0, 1);
    next.SENSITIVITY = U.clamp(numberOr(next.SENSITIVITY, 1), 0.25, 3);
    next.USE_COVER_COLORS = next.USE_COVER_COLORS !== false;
    next.USE_COVER_TEXTURE = next.USE_COVER_TEXTURE === true;
    next.WEBGL_QUALITY = ["auto", "balanced", "low"].includes(next.WEBGL_QUALITY) ? next.WEBGL_QUALITY : "auto";
    next.WEBGL_DPR_LIMIT = U.clamp(numberOr(next.WEBGL_DPR_LIMIT, 1.5), 0.75, 2);
    next.BRIGHTNESS_BASE = U.clamp(numberOr(next.BRIGHTNESS_BASE, 1), 0.25, 5);
    next.MOTION_ENABLED = next.MOTION_ENABLED !== false;
    next.MOTION_SPEED = U.clamp(numberOr(next.MOTION_SPEED, 0.36), 0.05, 1);
    return next;
  };

  const normalizeTweaked = (input) => {
    const next = onlyKnown(DEFAULT_ADDONS.tweakedYmDesign, input);
    next.enabled = next.enabled !== false;
    next.lyricsBlur = next.lyricsBlur !== false;
    next.lyricsMaxBlur = U.clamp(numberOr(next.lyricsMaxBlur, 8), 0, 24);
    next.lyricsBlurStep = U.clamp(numberOr(next.lyricsBlurStep, 2.2), 0, 8);
    next.lyricsMinOpacity = U.clamp(numberOr(next.lyricsMinOpacity, 0.35), 0.1, 1);
    next.lyricsOpacityStep = U.clamp(numberOr(next.lyricsOpacityStep, 0.12), 0, 0.4);
    next.lyricsTransitionMs = U.clamp(numberOr(next.lyricsTransitionMs, 250), 0, 1200);
    next.coverBackground = next.coverBackground !== false;
    next.coverBlur = U.clamp(numberOr(next.coverBlur, 28), 0, 64);
    next.coverSaturate = U.clamp(numberOr(next.coverSaturate, 1.2), 0.5, 2.5);
    next.coverOverlay = U.clamp(numberOr(next.coverOverlay, 0.55), 0, 0.9);
    next.coverCrossfadeMs = U.clamp(numberOr(next.coverCrossfadeMs, 900), 0, 3000);
    next.coverMotion = next.coverMotion !== false;
    next.coverMotionDuration = U.clamp(numberOr(next.coverMotionDuration, 26), 4, 90);
    return next;
  };

  const normalizeCover2Anim = (input) => {
    const next = onlyKnown(DEFAULT_ADDONS.cover2Anim, input);
    next.enabled = next.enabled !== false;
    next.colorMode = ["original", "mixed"].includes(next.colorMode) ? next.colorMode : "pulsecolor";
    next.blobCount = Math.round(U.clamp(numberOr(next.blobCount, 16), 16, 256));
    next.blobSpeed = U.clamp(numberOr(next.blobSpeed, 0.5), 0.25, 4);
    next.paletteBlendSpeed = U.clamp(numberOr(next.paletteBlendSpeed, 0.8), 0.1, 3);
    next.backgroundLightness = U.clamp(numberOr(next.backgroundLightness, 0), 0, 1);
    next.showFps = next.showFps === true;
    next.canvasFilter = typeof next.canvasFilter === "string" ? next.canvasFilter.trim().slice(0, 160) : "";
    next.warp = U.clamp(numberOr(next.warp, 0.14), 0, 1);
    next.flow = U.clamp(numberOr(next.flow, 0.53), 0, 1);
    next.saturation = U.clamp(numberOr(next.saturation, 1.5), 0.8, 1.5);
    next.highlight = U.clamp(numberOr(next.highlight, 0.99), 0, 1);
    next.paletteFadeMs = U.clamp(numberOr(next.paletteFadeMs, 500), 0, 5000);
    return next;
  };

  const normalizeCore = (input) => {
    const next = onlyKnown(DEFAULT_CORE, input);
    next.enableBackgroundImage = next.enableBackgroundImage !== false;
    next.enableFullVibe = next.enableFullVibe !== false;
    next.forceWhiteRecolor = next.forceWhiteRecolor === true;
    return next;
  };

  const redact = (value, depth = 0) => {
    if (depth > 4) return "[depth-limit]";
    if (Array.isArray(value)) return value.slice(0, 12).map((item) => redact(item, depth + 1));
    if (!value || typeof value !== "object") {
      if (typeof value === "string" && /^https?:/i.test(value)) {
        try {
          const url = new URL(value);
          ["api_key", "apikey", "key", "token", "access_token"].forEach((key) => {
            if (url.searchParams.has(key)) url.searchParams.set(key, "[redacted]");
          });
          return url.toString();
        } catch (error) {
          return value.replace(/((?:api_key|apikey|key|token|access_token)=)[^&]+/gi, "$1[redacted]");
        }
      }
      return value;
    }
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (/authorization|cookie|secret|api.?key|token/i.test(key)) out[key] = "[redacted]";
      else out[key] = redact(item, depth + 1);
    }
    return out;
  };

  const diagnostics = {
    rafActive: 0,
    frameListeners: 0,
    mutationObservers: 0,
    audioAnalysers: 0,
    audioContexts: 0,
    webglCanvases: 0,
    webglContexts: 0,
    textures: 0,
    programs: 0,
    framebuffers: 0,
    trackChanges: 0,
    bpmRequests: 0,
    externalAudioSubscribers: 0,
    lastFrameMs: 0
  };

  const logger = {
    enabled: () => localStorage.getItem("osuLogEnabled") === "1",
    debug(stage, detail) {
      if (!this.enabled()) return;
      console.debug(`[PulseColor] ${stage}`, redact(detail));
    },
    info(stage, detail) {
      if (!this.enabled()) return;
      console.info(`[PulseColor] ${stage}`, redact(detail));
    },
    warn(stage, detail) {
      console.warn(`[PulseColor] ${stage}`, redact(detail));
    },
    error(stage, error, detail = {}) {
      console.error(`[PulseColor] ${stage}`, redact({
        ...detail,
        name: error?.name || "Error",
        message: error?.message || String(error)
      }));
    }
  };

  const normalizeAddonState = (tweakedInput, coverInput, preferred = "cover2Anim") => {
    const tweakedYmDesign = normalizeTweaked(tweakedInput);
    const cover2Anim = normalizeCover2Anim(coverInput);
    if (tweakedYmDesign.enabled && cover2Anim.enabled) {
      if (preferred === "tweakedYmDesign") cover2Anim.enabled = false;
      else tweakedYmDesign.enabled = false;
    }
    return { tweakedYmDesign, cover2Anim };
  };

  const storedAddons = U.safeJson(localStorage.getItem(STORAGE.addons), {});
  let state = {
    wave: normalizeWave(U.safeJson(localStorage.getItem(STORAGE.wave), {})),
    core: normalizeCore(U.safeJson(localStorage.getItem(STORAGE.core), {})),
    addons: normalizeAddonState(storedAddons?.tweakedYmDesign, storedAddons?.cover2Anim)
  };

  const settingListeners = new Set();
  let suppressConfigEvent = false;
  let suppressCoreConfigEvent = false;

  const persist = (section) => {
    localStorage.setItem(STORAGE[section], JSON.stringify(state[section]));
  };
  persist("wave");
  persist("core");
  persist("addons");

  const notifySettings = (section, source = "runtime") => {
    const snapshot = clone(state);
    for (const listener of settingListeners) {
      try { listener(snapshot, { section, source }); }
      catch (error) { logger.error("settings-listener", error, { section }); }
    }
  };

  const settings = {
    STORAGE,
    defaults: { wave: DEFAULT_WAVE, core: DEFAULT_CORE, addons: DEFAULT_ADDONS },
    get() { return clone(state); },
    getWave() { return { ...state.wave }; },
    getCore() { return { ...state.core }; },
    getAddons() { return clone(state.addons); },
    updateWave(patch, source = "api") {
      state.wave = normalizeWave(mergeSection(state.wave, patch));
      syncBeatDriverConfig();
      persist("wave");
      suppressConfigEvent = true;
      try {
        window.dispatchEvent(new CustomEvent("pulsecolor:beatDriverConfigChanged", { detail: { cfg: window.BeatDriverConfig, source } }));
      } finally {
        suppressConfigEvent = false;
      }
      notifySettings("wave", source);
      return this.getWave();
    },
    updateCore(patch, source = "api") {
      state.core = normalizeCore(mergeSection(state.core, patch));
      persist("core");
      suppressCoreConfigEvent = true;
      try {
        window.dispatchEvent(new CustomEvent("pulsecolor:coreSettingsChanged", { detail: { core: this.getCore(), source } }));
      } finally {
        suppressCoreConfigEvent = false;
      }
      notifySettings("core", source);
      return this.getCore();
    },
    updateAddon(id, patch, source = "api") {
      if (!Object.prototype.hasOwnProperty.call(state.addons, id)) throw new Error(`Unknown PulseColor integration: ${id}`);
      const tweakedInput = id === "tweakedYmDesign" ? mergeSection(state.addons.tweakedYmDesign, patch) : state.addons.tweakedYmDesign;
      const coverInput = id === "cover2Anim" ? mergeSection(state.addons.cover2Anim, patch) : state.addons.cover2Anim;
      const preferred = patch?.enabled === true ? id : "cover2Anim";
      state.addons = normalizeAddonState(tweakedInput, coverInput, preferred);
      persist("addons");
      notifySettings("addons", source);
      return { ...state.addons[id] };
    },
    updateAddons(patch, source = "api") {
      const incoming = patch && typeof patch === "object" ? patch : {};
      const tweakedInput = mergeSection(state.addons.tweakedYmDesign, incoming.tweakedYmDesign);
      const coverInput = mergeSection(state.addons.cover2Anim, incoming.cover2Anim);
      const preferred = incoming.cover2Anim?.enabled === true
        ? "cover2Anim"
        : incoming.tweakedYmDesign?.enabled === true
          ? "tweakedYmDesign"
          : "cover2Anim";
      state.addons = normalizeAddonState(tweakedInput, coverInput, preferred);
      persist("addons");
      notifySettings("addons", source);
      return this.getAddons();
    },
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("PulseColor settings listener must be a function");
      settingListeners.add(listener);
      listener(this.get(), { section: "all", source: "subscribe" });
      return () => settingListeners.delete(listener);
    }
  };

  const syncBeatDriverConfig = () => {
    const target = window.BeatDriverConfig || {};
    for (const key of Object.keys(target)) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULT_WAVE, key)) delete target[key];
    }
    window.BeatDriverConfig = Object.assign(target, state.wave);
  };
  syncBeatDriverConfig();

  const handleLegacyWaveSettings = (event) => {
    if (suppressConfigEvent) return;
    const incoming = event?.detail?.cfg;
    if (!incoming || typeof incoming !== "object") return;
    state.wave = normalizeWave(mergeSection(state.wave, incoming));
    syncBeatDriverConfig();
    persist("wave");
    notifySettings("wave", event?.detail?.source || "legacy-ui");
  };

  const handleLegacyCoreSettings = (event) => {
    if (suppressCoreConfigEvent) return;
    const incoming = event?.detail?.core;
    if (!incoming || typeof incoming !== "object") return;
    state.core = normalizeCore(mergeSection(state.core, incoming));
    persist("core");
    notifySettings("core", event?.detail?.source || "legacy-ui");
  };

  let settingsBridgeBound = false;
  const startSettingsBridge = () => {
    if (settingsBridgeBound) return;
    settingsBridgeBound = true;
    window.addEventListener("pulsecolor:beatDriverConfigChanged", handleLegacyWaveSettings);
    window.addEventListener("pulsecolor:coreSettingsChanged", handleLegacyCoreSettings);
  };
  const stopSettingsBridge = () => {
    if (!settingsBridgeBound) return;
    settingsBridgeBound = false;
    window.removeEventListener("pulsecolor:beatDriverConfigChanged", handleLegacyWaveSettings);
    window.removeEventListener("pulsecolor:coreSettingsChanged", handleLegacyCoreSettings);
  };

  const frameListeners = new Map();
  const services = new Map();
  let rafId = 0;
  let lastFrameAt = 0;
  let running = false;

  const startService = (record) => {
    if (!record || record.started) return;
    record.started = true;
    try {
      const result = record.service.start?.();
      if (result?.catch) result.catch((error) => logger.error("service-start", error, { service: record.name }));
    } catch (error) {
      record.started = false;
      logger.error("service-start", error, { service: record.name });
    }
  };

  const stopService = (record) => {
    if (!record?.started) return;
    record.started = false;
    try {
      const result = record.service.stop?.();
      if (result?.catch) result.catch((error) => logger.error("service-stop", error, { service: record.name }));
    } catch (error) {
      logger.error("service-stop", error, { service: record.name });
    }
  };

  const scheduleFrame = () => {
    if (!running || document.hidden || rafId || frameListeners.size === 0) return;
    rafId = requestAnimationFrame(runFrame);
    diagnostics.rafActive = 1;
  };

  function runFrame(timestamp) {
    rafId = 0;
    diagnostics.rafActive = 0;
    if (!running || document.hidden || frameListeners.size === 0) return;
    const dt = Math.min(100, Math.max(0, timestamp - (lastFrameAt || timestamp)));
    lastFrameAt = timestamp;
    const started = performance.now();
    const ordered = Array.from(frameListeners.entries()).sort((a, b) => a[1].priority - b[1].priority);
    for (const [listener] of ordered) {
      try { listener(timestamp, dt); }
      catch (error) { logger.error("frame-listener", error); }
    }
    diagnostics.lastFrameMs = performance.now() - started;
    scheduleFrame();
  }

  const runtime = {
    version: 2,
    start() {
      if (running) return;
      running = true;
      startSettingsBridge();
      startDomCoordinator();
      for (const record of services.values()) startService(record);
      scheduleFrame();
      logger.info("runtime-start", { version: this.version });
    },
    stop() {
      if (!running) return;
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      diagnostics.rafActive = 0;
      for (const record of Array.from(services.values()).reverse()) stopService(record);
      activeAddonIds.clear();
      syncAddonActivity("runtime-stop");
      stopDomCoordinator();
      stopSettingsBridge();
      domListeners.clear();
      trackListeners.clear();
      settingListeners.clear();
      addonSettingsListeners.clear();
      frameListeners.clear();
      diagnostics.frameListeners = 0;
      lastFrameAt = 0;
      window.dispatchEvent(new CustomEvent("pulsecolor:runtime-stopped"));
      logger.info("runtime-stop", diagnostics);
    },
    isRunning: () => running,
    addFrameListener(listener, priority = 50) {
      if (typeof listener !== "function") throw new TypeError("Frame listener must be a function");
      frameListeners.set(listener, { priority: Number(priority) || 50 });
      diagnostics.frameListeners = frameListeners.size;
      scheduleFrame();
      return () => {
        frameListeners.delete(listener);
        diagnostics.frameListeners = frameListeners.size;
      };
    },
    registerService(name, service) {
      const key = String(name || "").trim();
      if (!key) throw new TypeError("Runtime service name is required");
      if (!service || typeof service !== "object") throw new TypeError("Runtime service must be an object");
      const previous = services.get(key);
      if (previous) stopService(previous);
      const record = { name: key, service, started: false };
      services.set(key, record);
      if (running) startService(record);
      return () => {
        if (services.get(key) !== record) return;
        stopService(record);
        services.delete(key);
      };
    },
    requestFrame: scheduleFrame
  };

  const TRACK_TITLE_SELECTORS = [
    '[data-test-id="PLAYERBAR_TITLE"]',
    '[data-test-id="TRACK_TITLE"]',
    '[class*="PlayerBarDesktop_meta"] [class*="title"]',
    '[class*="PlayerBar"] [class*="Meta_title"]'
  ];
  const TRACK_ARTIST_SELECTORS = [
    '[data-test-id="PLAYERBAR_ARTISTS"]',
    '[data-test-id="TRACK_ARTISTS"]',
    '[class*="PlayerBarDesktop_meta"] [class*="artists"]',
    '[class*="PlayerBar"] [class*="Meta_artists"]'
  ];
  const COVER_SELECTORS = [
    'div[data-test-id="PLAYERBAR_DESKTOP_COVER_CONTAINER"] img',
    '[data-test-id="FULLSCREEN_PLAYER_MODAL"] img[data-test-id="ENTITY_COVER_IMAGE"]',
    'img[data-test-id="ENTITY_COVER_IMAGE"]',
    'img[class*="AlbumCover_cover__"][src*="avatars.yandex.net/get-music-content"]'
  ];
  const TRACK_ID_SELECTORS = [
    '[data-test-id="PLAYERBAR_TITLE"] a[href*="/track/"]',
    '[data-test-id="PLAYERBAR_DESKTOP_COVER_CONTAINER"] a[href*="/track/"]',
    '[class*="PlayerBarDesktop"] a[href*="/track/"]',
    '[class*="PlayerBar"] a[href*="/track/"]',
    '[data-test-id="FULLSCREEN_PLAYER_MODAL"] a[href*="/track/"]',
    '[data-test-id="PLAYERBAR_TITLE"][data-track-id]',
    '[data-test-id="PLAYERBAR_DESKTOP_COVER_CONTAINER"] [data-track-id]',
    '[data-test-id="FULLSCREEN_PLAYER_MODAL"] [data-track-id]'
  ];
  const DOM_RELEVANT_SELECTOR = [
    "audio",
    "img",
    '[data-test-id="FULLSCREEN_PLAYER_MODAL"]',
    '[data-test-id="SYNC_LYRICS_CONTENT"]',
    '[data-test-id="SYNC_LYRICS_LINE"]',
    '[data-test-id="PLAYERBAR_TITLE"]',
    '[data-test-id="PLAYERBAR_ARTISTS"]',
    '[class*="PlayerBar"]',
    '[class*="Vibe"]',
    '[class*="SettingsPage"]',
    '[class*="SettingsList"]',
    '[class*="DefaultLayout_rootNewWave"]'
  ].join(",");

  const domListeners = new Set();
  const trackListeners = new Set();
  const audioBindings = new Map();
  let domObserver = null;
  let domScanQueued = false;
  let currentTrack = U.normalizeTrack();
  const EMPTY_PLAYBACK = Object.freeze({ currentTimeMs: 0, durationMs: 0, paused: true, ended: false, playbackRate: 1 });
  let domSnapshot = Object.freeze({ fullscreen: null, lyrics: null, audio: null, cover: null, track: currentTrack, playback: EMPTY_PLAYBACK });

  const queryText = (selectors, root = document) => {
    for (const selector of selectors) {
      const node = root.querySelector(selector);
      const value = node?.textContent?.replace(/\s+/g, " ").trim();
      if (value) return value;
    }
    return "";
  };

  const readCover = () => {
    for (const selector of COVER_SELECTORS) {
      const images = Array.from(document.querySelectorAll(selector));
      const image = images.find((item) => {
        const rect = item.getBoundingClientRect();
        return item.isConnected && rect.width >= 24 && rect.height >= 24;
      }) || images[0];
      if (image) return image;
    }
    return null;
  };

  const coverUrl = (image) => {
    if (!image) return "";
    const srcset = String(image.getAttribute("srcset") || "").split(",").map((item) => item.trim().split(/\s+/)[0]).filter(Boolean);
    return image.currentSrc || srcset[srcset.length - 1] || image.src || "";
  };

  const readTrackId = () => {
    for (const selector of TRACK_ID_SELECTORS) {
      const node = document.querySelector(selector);
      if (!node) continue;
      const dataId = U.normalizeTrackId(node.getAttribute?.("data-track-id") || node.dataset?.trackId);
      if (dataId) return dataId;
      const href = String(node.getAttribute?.("href") || node.href || "");
      const match = href.match(/\/track\/([^/?#]+)/i);
      const hrefId = U.normalizeTrackId(match?.[1]);
      if (hrefId) return hrefId;
    }
    return "";
  };

  const readPlayback = (audio) => Object.freeze({
    currentTimeMs: Number.isFinite(audio?.currentTime) ? Math.max(0, audio.currentTime * 1000) : 0,
    durationMs: Number.isFinite(audio?.duration) ? Math.max(0, audio.duration * 1000) : 0,
    paused: audio ? !!audio.paused : navigator.mediaSession?.playbackState !== "playing",
    ended: !!audio?.ended,
    playbackRate: Number.isFinite(audio?.playbackRate) && audio.playbackRate > 0 ? audio.playbackRate : 1
  });

  const readTrack = (cover, audio) => {
    const metadata = navigator.mediaSession?.metadata;
    const artwork = Array.isArray(metadata?.artwork) ? metadata.artwork[metadata.artwork.length - 1]?.src : "";
    const title = metadata?.title || queryText(TRACK_TITLE_SELECTORS);
    const artist = metadata?.artist || queryText(TRACK_ARTIST_SELECTORS);
    return U.normalizeTrack({
      id: readTrackId(),
      title,
      artist,
      durationMs: Number.isFinite(audio?.duration) ? audio.duration * 1000 : 0,
      coverUrl: coverUrl(cover) || artwork,
      source: metadata?.title ? "media-session" : "playerbar"
    });
  };

  const attachAudioEvents = (audio) => {
    if (!audio || audioBindings.has(audio)) return;
    const bindings = new Map();
    ["play", "playing", "pause", "loadedmetadata", "durationchange", "emptied", "ended", "seeking", "seeked"].forEach((type) => {
      const handler = scheduleDomScan;
      bindings.set(type, handler);
      audio.addEventListener(type, handler, { passive: true });
    });
    audioBindings.set(audio, bindings);
  };

  const unwrapObservableValue = (value) => {
    try {
      const current = value?.value;
      return current && current !== value ? current : value;
    } catch {
      return value;
    }
  };

  const isAudioElement = (value) => Boolean(
    value &&
    String(value.tagName || "").toUpperCase() === "AUDIO" &&
    typeof value.addEventListener === "function"
  );

  const readPulseSyncAudio = () => {
    try {
      const controller = window.pulsesyncApi?.playerInstance?.playbackController;
      const playback = controller?.getPlayback?.() || controller?.playbacks?.get?.("MAIN") || null;
      const mediaController = playback?.mediaController;
      const rootPlayer = unwrapObservableValue(mediaController?.currentMediaPlayer);
      const candidates = [];
      const addPlayerAudio = (playerLike) => {
        const player = unwrapObservableValue(playerLike);
        const audio = unwrapObservableValue(player?.currentAudioElement);
        if (isAudioElement(audio) && !candidates.includes(audio)) candidates.push(audio);
      };

      addPlayerAudio(rootPlayer);
      for (const key of ["currentMediaPlayer", "firstMediaPlayer", "secondMediaPlayer", "crossOutMediaPlayer", "crossInMediaPlayer"]) {
        addPlayerAudio(rootPlayer?.[key]);
      }

      return candidates.find((audio) => !audio.paused && !audio.ended && audio.readyState >= 2) ||
        candidates.find((audio) => !audio.ended && Number(audio.currentTime || 0) > 0) ||
        candidates[0] || null;
    } catch (error) {
      logger.debug("pulsesync-audio-discovery-failed", { name: error?.name, message: error?.message });
      return null;
    }
  };

  const detachAudioEvents = () => {
    for (const [audio, bindings] of audioBindings) {
      for (const [type, handler] of bindings) audio.removeEventListener?.(type, handler);
    }
    audioBindings.clear();
  };

  function scanDom() {
    domScanQueued = false;
    if (!running) return;
    const cover = readCover();
    const domAudios = Array.from(document.querySelectorAll("audio"));
    const audio = domAudios.find((node) => !node.paused && !node.ended) || readPulseSyncAudio() || domAudios[0] || null;
    domAudios.forEach(attachAudioEvents);
    attachAudioEvents(audio);
    const fullscreen = document.querySelector('[data-test-id="FULLSCREEN_PLAYER_MODAL"]');
    const lyrics = fullscreen?.querySelector('[data-test-id="SYNC_LYRICS_CONTENT"]') || document.querySelector('[data-test-id="SYNC_LYRICS_CONTENT"]');
    const nextTrack = readTrack(cover, audio);
    const previousKey = currentTrack.key;
    currentTrack = nextTrack;
    domSnapshot = Object.freeze({ fullscreen, lyrics, audio, cover, track: currentTrack, playback: readPlayback(audio) });

    for (const listener of domListeners) {
      try { listener(domSnapshot); }
      catch (error) { logger.error("dom-listener", error); }
    }

    if (nextTrack.key && nextTrack.key !== previousKey) {
      diagnostics.trackChanges += 1;
      logger.info("track-change", { key: nextTrack.key, title: nextTrack.title, artist: nextTrack.artist, source: nextTrack.source });
      for (const listener of trackListeners) {
        try { listener(nextTrack); }
        catch (error) { logger.error("track-listener", error); }
      }
      window.dispatchEvent(new CustomEvent("pulsecolor:trackchange", { detail: nextTrack }));
    }
  }

  function scheduleDomScan() {
    if (!running || domScanQueued) return;
    domScanQueued = true;
    queueMicrotask(scanDom);
  }

  const isRelevantDomNode = (node) => {
    if (!node || node.nodeType !== 1) return false;
    try {
      return node.matches?.(DOM_RELEVANT_SELECTOR) ||
        node.closest?.(DOM_RELEVANT_SELECTOR) ||
        node.querySelector?.(DOM_RELEVANT_SELECTOR);
    } catch {
      return false;
    }
  };

  const handleDomMutations = (mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes") {
        if (mutation.attributeName === "src" || mutation.attributeName === "srcset" || isRelevantDomNode(mutation.target)) {
          scheduleDomScan();
          return;
        }
        continue;
      }
      if (isRelevantDomNode(mutation.target)) {
        scheduleDomScan();
        return;
      }
      for (const node of [...mutation.addedNodes, ...mutation.removedNodes]) {
        if (isRelevantDomNode(node)) {
          scheduleDomScan();
          return;
        }
      }
    }
  };

  const handleVisibilityChange = () => {
    if (document.hidden) {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      diagnostics.rafActive = 0;
    } else {
      scheduleDomScan();
      scheduleFrame();
    }
  };

  function startDomCoordinator() {
    if (domObserver) return;
    domObserver = new MutationObserver(handleDomMutations);
    domObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "src", "srcset"]
    });
    diagnostics.mutationObservers = 1;
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("resize", scheduleDomScan, { passive: true });
    scheduleDomScan();
  }

  function stopDomCoordinator() {
    domObserver?.disconnect();
    domObserver = null;
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("resize", scheduleDomScan);
    detachAudioEvents();
    domScanQueued = false;
    diagnostics.mutationObservers = 0;
  }

  const dom = {
    getSnapshot: () => domSnapshot,
    getPlayback: () => {
      const audio = domSnapshot.audio;
      return audio ? readPlayback(audio) : domSnapshot.playback;
    },
    subscribe(listener) {
      domListeners.add(listener);
      listener(domSnapshot);
      return () => domListeners.delete(listener);
    },
    requestScan: scheduleDomScan
  };

  const track = {
    getCurrent: () => currentTrack,
    getPlayback: () => dom.getPlayback(),
    subscribe(listener) {
      trackListeners.add(listener);
      if (currentTrack.key) listener(currentTrack);
      return () => trackListeners.delete(listener);
    }
  };

  const addonSettingsListeners = new Set();
  const activeAddonIds = new Set();
  const syncAddonActivity = (reason = "update") => {
    const active = activeAddonIds.size > 0;
    window.__PULSECOLOR_THIRD_PARTY_VISUAL_ACTIVE__ = active;
    window.dispatchEvent(new CustomEvent("pulsecolor:addon-support-active", {
      detail: { active, ids: Array.from(activeAddonIds), reason }
    }));
  };
  const addonSupport = {
    __v2: true,
    STORAGE_KEY: STORAGE.addons,
    DEFAULT_SETTINGS: clone(DEFAULT_ADDONS),
    getSettings: () => settings.getAddons(),
    getAdapterSettings: (id) => settings.getAddons()[id] || {},
    setAdapterSettings(id, patch) {
      const next = settings.updateAddon(id, patch, "legacy-addon-ui");
      for (const listener of addonSettingsListeners) listener(settings.getAddons());
      return next;
    },
    setSettings(next) {
      settings.updateAddons(next, "legacy-addon-ui");
      for (const listener of addonSettingsListeners) listener(settings.getAddons());
      return settings.getAddons();
    },
    subscribeSettings(listener) {
      addonSettingsListeners.add(listener);
      listener(settings.getAddons());
      return () => addonSettingsListeners.delete(listener);
    },
    setActive(id, active = true) {
      const key = String(id || "").trim();
      if (!key) return false;
      const before = activeAddonIds.has(key);
      if (active) activeAddonIds.add(key);
      else activeAddonIds.delete(key);
      if (before !== activeAddonIds.has(key)) syncAddonActivity(`set-active:${key}`);
      return activeAddonIds.has(key);
    },
    register(id, meta = {}) {
      const key = String(id || "").trim();
      return {
        id: key,
        meta,
        getSettings: () => addonSupport.getAdapterSettings(key),
        subscribeSettings(listener) {
          return addonSupport.subscribeSettings((all) => listener(all[key] || {}));
        },
        setActive: (active) => addonSupport.setActive(key, active),
        setSettings: (patch) => addonSupport.setAdapterSettings(key, patch),
        dispose() { addonSupport.setActive(key, false); }
      };
    },
    isAnyActive: () => activeAddonIds.size > 0,
    getActiveIds: () => Array.from(activeAddonIds)
  };

  const visualModeDefinitions = new Map();
  const visualModes = Object.freeze({
    register(id, definition) {
      const key = String(id || "").trim();
      if (!key) throw new TypeError("Visual mode id is required");
      if (!definition || typeof definition.createPass !== "function") {
        throw new TypeError(`Visual mode ${key} must provide createPass()`);
      }
      visualModeDefinitions.set(key, definition);
      window.dispatchEvent(new CustomEvent("pulsecolor:visual-mode-registered", { detail: { id: key } }));
      return () => {
        if (visualModeDefinitions.get(key) === definition) visualModeDefinitions.delete(key);
      };
    },
    get: (id) => visualModeDefinitions.get(String(id || "").trim()) || null,
    getIds: () => Array.from(visualModeDefinitions.keys())
  });

  const PulseColor = window.PulseColor = Object.assign(window.PulseColor || {}, {
    version: 2,
    runtime,
    settings,
    dom,
    track,
    visualModes,
    logger,
    diagnostics: {
      counters: diagnostics,
      snapshot: () => Object.freeze({ ...diagnostics })
    }
  });

  window.PulseColorAddonSupport = addonSupport;
  window.__PULSECOLOR_THIRD_PARTY_VISUAL_ACTIVE__ = false;
  window.PulseColorIsThirdPartyVisualActive = () => addonSupport.isAnyActive();
  PulseColor.runtime.start();
})();
