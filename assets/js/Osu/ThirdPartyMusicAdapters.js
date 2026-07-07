(() => {
  "use strict";

  if (window.PulseColorAddonSupport?.__v1) return;

  const STORAGE_KEY = "PulseColor.AddonSupport.v1";
  const root = document.documentElement;
  const adapters = new Map();
  const settingsListeners = new Set();

  const DEFAULT_SETTINGS = Object.freeze({
    tweakedYmDesign: Object.freeze({
      enabled: true,
      musicGlow: true,
      glowStrength: 0.22,
      optimizeBlur: true,
      blurPx: 22
    }),
    cover2Anim: Object.freeze({
      enabled: true,
      musicReactive: true,
      reactionStrength: 0.25,
      beatStrength: 0.16,
      efficientMode: false
    })
  });

  let lastAnyActive = false;
  let lastActiveIds = "";
  let settings = loadSettings();

  function safeParseJson(raw) {
    try {
      return JSON.parse(raw || "");
    } catch {
      return null;
    }
  }

  function clampNumber(value, min, max, fallback) {
    const next = Number(value);
    if (!Number.isFinite(next)) return fallback;
    return Math.min(max, Math.max(min, next));
  }

  function bool(value, fallback) {
    return typeof value === "boolean" ? value : fallback;
  }

  function normalizeSettings(input) {
    const src = input && typeof input === "object" ? input : {};
    const tweaked = src.tweakedYmDesign && typeof src.tweakedYmDesign === "object" ? src.tweakedYmDesign : {};
    const cover = src.cover2Anim && typeof src.cover2Anim === "object" ? src.cover2Anim : {};

    return {
      tweakedYmDesign: {
        enabled: bool(tweaked.enabled, DEFAULT_SETTINGS.tweakedYmDesign.enabled),
        musicGlow: bool(tweaked.musicGlow, DEFAULT_SETTINGS.tweakedYmDesign.musicGlow),
        glowStrength: clampNumber(tweaked.glowStrength, 0, 0.5, DEFAULT_SETTINGS.tweakedYmDesign.glowStrength),
        optimizeBlur: bool(tweaked.optimizeBlur, DEFAULT_SETTINGS.tweakedYmDesign.optimizeBlur),
        blurPx: clampNumber(tweaked.blurPx, 8, 50, DEFAULT_SETTINGS.tweakedYmDesign.blurPx)
      },
      cover2Anim: {
        enabled: bool(cover.enabled, DEFAULT_SETTINGS.cover2Anim.enabled),
        musicReactive: bool(cover.musicReactive, DEFAULT_SETTINGS.cover2Anim.musicReactive),
        reactionStrength: clampNumber(cover.reactionStrength, 0, 0.8, DEFAULT_SETTINGS.cover2Anim.reactionStrength),
        beatStrength: clampNumber(cover.beatStrength, 0, 0.7, DEFAULT_SETTINGS.cover2Anim.beatStrength),
        efficientMode: bool(cover.efficientMode, DEFAULT_SETTINGS.cover2Anim.efficientMode)
      }
    };
  }

  function loadSettings() {
    return normalizeSettings(safeParseJson(localStorage.getItem(STORAGE_KEY)));
  }

  function persistSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {}
  }

  function getSettings() {
    return normalizeSettings(settings);
  }

  function getAdapterSettings(id) {
    return { ...(getSettings()[id] || {}) };
  }

  function notifySettings() {
    const next = getSettings();
    window.dispatchEvent(new CustomEvent("pulsecolor:addonSupportSettingsChanged", {
      detail: { settings: next }
    }));
    for (const fn of settingsListeners) {
      try { fn(next); } catch {}
    }
  }

  function setSettings(nextSettings) {
    settings = normalizeSettings(nextSettings);
    persistSettings();
    notifySettings();
    return getSettings();
  }

  function setAdapterSettings(id, patch) {
    const current = getSettings();
    const prev = current[id] || {};
    current[id] = { ...prev, ...(patch || {}) };
    return setSettings(current)[id] || {};
  }

  function ensureStyle() {
    if (document.getElementById("pulsecolor-addon-support-style")) return;
    const style = document.createElement("style");
    style.id = "pulsecolor-addon-support-style";
    style.textContent = `
      html.pulsecolor-third-party-visual-active #osu-pulse {
        display: none !important;
        opacity: 0 !important;
      }
    `;
    document.head.appendChild(style);
  }

  function getActiveIds() {
    return Array.from(adapters.entries())
      .filter(([, entry]) => !!entry.active)
      .map(([id]) => id);
  }

  function recalcActiveState() {
    const ids = getActiveIds();
    const anyActive = ids.length > 0;
    const packedIds = ids.join("|");

    if (anyActive === lastAnyActive && packedIds === lastActiveIds) return;

    lastAnyActive = anyActive;
    lastActiveIds = packedIds;
    window.__PULSECOLOR_THIRD_PARTY_VISUAL_ACTIVE__ = anyActive;
    root.classList.toggle("pulsecolor-third-party-visual-active", anyActive);

    const detail = { active: anyActive, activeIds: ids };
    window.dispatchEvent(new CustomEvent("pulsecolor:third-party-visual", { detail }));
    window.dispatchEvent(new CustomEvent("pulsecolor:addonSupportActiveChanged", { detail }));
  }

  function register(id, meta = {}) {
    if (!id) return null;
    const entry = adapters.get(id) || { active: false, meta: {} };
    entry.meta = { ...entry.meta, ...meta };
    adapters.set(id, entry);
    recalcActiveState();

    return {
      id,
      setActive(active, detail = {}) {
        const item = adapters.get(id);
        if (!item) return;
        const next = !!active;
        item.detail = detail;
        if (item.active === next) return;
        item.active = next;
        recalcActiveState();
      },
      getSettings: () => getAdapterSettings(id),
      subscribeSettings(fn) {
        if (typeof fn !== "function") return () => {};
        const wrapped = (allSettings) => fn({ ...(allSettings[id] || {}) }, allSettings);
        settingsListeners.add(wrapped);
        try { wrapped(getSettings()); } catch {}
        return () => settingsListeners.delete(wrapped);
      },
      unregister() {
        adapters.delete(id);
        recalcActiveState();
      }
    };
  }

  const api = {
    __v1: true,
    STORAGE_KEY,
    DEFAULT_SETTINGS,
    register,
    getSettings,
    setSettings,
    getAdapterSettings,
    setAdapterSettings,
    isActive: (id) => !!adapters.get(id)?.active,
    isAnyActive: () => getActiveIds().length > 0,
    getActiveIds,
    subscribeSettings(fn) {
      if (typeof fn !== "function") return () => {};
      settingsListeners.add(fn);
      try { fn(getSettings()); } catch {}
      return () => settingsListeners.delete(fn);
    }
  };

  ensureStyle();
  window.__PULSECOLOR_THIRD_PARTY_VISUAL_ACTIVE__ = false;
  window.PulseColorAddonSupport = Object.assign(window.PulseColorAddonSupport || {}, api);
  window.PulseColorThirdPartyVisuals = Object.assign(window.PulseColorThirdPartyVisuals || {}, {
    active: api.isAnyActive
  });
})();
