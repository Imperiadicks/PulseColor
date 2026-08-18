(() => {
  "use strict";

  const PC = window.PulseColor;
  const U = window.PulseColorRuntimeUtils;
  if (!PC?.dom || !PC.settings || !U) {
    throw new Error("PulseColor RuntimeCore must be loaded before TweakedYMDesign");
  }
  if (PC.design?.source === "Tweaked YM Design 1.0.0") return;

  // Full Tweaked YM Design 1.0.0 by nelifs, adapted only to the shared
  // PulseColor settings and DOM lifecycle.
  const STYLE_ID = "pulsecolor-tweaked-ym-design-style";
  const SOURCE_STYLE = `
html.pulsecolor-tweaked-enabled [data-test-id="SYNC_LYRICS_LINE"] {
  transition: filter var(--ps-lyrics-blur-transition, 380ms) cubic-bezier(.4, 0, .2, 1),
    opacity var(--ps-lyrics-blur-transition, 380ms) cubic-bezier(.4, 0, .2, 1),
    transform var(--ps-lyrics-blur-transition, 380ms) cubic-bezier(.4, 0, .2, 1);
  transform-origin: 50%;
  contain: layout style;
}

html.pulsecolor-tweaked-enabled [data-test-id="SYNC_LYRICS_LINE"] > span {
  display: inline-block;
}

[data-test-id="FULLSCREEN_PLAYER_MODAL"].pulsecolor-tweaked-fullscreen {
  background: transparent !important;
}

[data-test-id="FULLSCREEN_PLAYER_MODAL"].pulsecolor-tweaked-fullscreen::before,
[data-test-id="FULLSCREEN_PLAYER_MODAL"].pulsecolor-tweaked-fullscreen::after {
  z-index: -1 !important;
}

.ps-apple-cover-host {
  isolation: isolate;
  background: transparent !important;
}

.ps-apple-cover-host > :not(.ps-apple-cover-bg) {
  z-index: 1;
  position: relative;
}

.ps-apple-cover-bg {
  z-index: 0;
  pointer-events: none;
  contain: strict;
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.ps-apple-cover-bg__layer {
  opacity: 0;
  transition: opacity var(--ps-cover-crossfade, .9s) ease-in-out;
  contain: strict;
  background-position: 50%;
  background-repeat: no-repeat;
  background-size: cover;
  position: absolute;
  inset: -10%;
  transform: scale(1.12) translate(0, 0);
}

.ps-apple-cover-bg__layer--css-blur {
  filter: blur(var(--ps-cover-blur, 28px)) saturate(var(--ps-cover-saturate, 1.2));
}

.ps-apple-cover-bg__layer--visible { opacity: 1; }

.ps-apple-cover-bg__layer--motion:not(.ps-apple-cover-bg__layer--motion-off) {
  animation: ps-apple-cover-drift-a var(--ps-cover-motion-duration, 26s) ease-in-out infinite alternate;
}

.ps-apple-cover-bg__layer--b.ps-apple-cover-bg__layer--motion:not(.ps-apple-cover-bg__layer--motion-off) {
  animation-name: ps-apple-cover-drift-b;
}

.ps-apple-cover-bg--paused .ps-apple-cover-bg__layer--motion { animation-play-state: paused; }

.ps-apple-cover-bg__vignette {
  background:
    radial-gradient(ellipse 85% 70% at 50% 45%, transparent 0%, #0000008c 100%),
    linear-gradient(180deg,
      rgba(0, 0, 0, calc(var(--ps-cover-overlay, .55) * .35)) 0%,
      rgba(0, 0, 0, var(--ps-cover-overlay, .55)) 55%,
      rgba(0, 0, 0, calc(var(--ps-cover-overlay, .55) * 1.1)) 100%);
  position: absolute;
  inset: 0;
}

@keyframes ps-apple-cover-drift-a {
  0% { transform: scale(1.12) translate(0, 0); }
  100% { transform: scale(1.17) translate(1.5%, -1%); }
}

@keyframes ps-apple-cover-drift-b {
  0% { transform: scale(1.13) translate(-1%, .5%); }
  100% { transform: scale(1.18) translate(1%, -1.5%); }
}

html.pulsecolor-tweaked-vibe [class*="VibePlayerbarMeta_center"],
html.pulsecolor-tweaked-vibe .tovibe-form,
html.pulsecolor-tweaked-vibe [class*="AlbumCover_playButton_playing"],
html.pulsecolor-tweaked-vibe [class*="AlbumCover_button"],
html.pulsecolor-tweaked-vibe [class*="VibePage_hoveredButton"],
html.pulsecolor-tweaked-vibe [class*="VibePlayerBar_button"] {
  backdrop-filter: blur(50px);
}

html.pulsecolor-tweaked-vibe .tovibe-input {
  color: #fff;
}

html.pulsecolor-tweaked-vibe [class*="VibePage_text"],
html.pulsecolor-tweaked-vibe [class*="MainPage_actionsContainerRight"],
html.pulsecolor-tweaked-vibe [class*="VibePage_words"] {
  display: none;
}

html.pulsecolor-tweaked-vibe [class*="VibePlayerbarMeta_root"] {
  height: 80%;
}

html.pulsecolor-tweaked-vibe [class*="NavbarDesktop_logo"] {
  filter: saturate(0%);
}

html.pulsecolor-tweaked-vibe [class*="VibePage_meta"] {
  --player-block-height: 4rem;
}

html.pulsecolor-tweaked-vibe [class*="VibeArtistCover_cover"] {
  aspect-ratio: 1;
  margin-top: 4rem;
  mask-image: linear-gradient(#000 80%, transparent 93%);
}

@media (prefers-reduced-motion: reduce) {
  html.pulsecolor-tweaked-enabled [data-test-id="SYNC_LYRICS_LINE"] {
    transition-duration: .01ms;
  }

  .ps-apple-cover-bg__layer--motion { animation: none !important; }
}
`;
  const LYRICS_LINE_SELECTOR = '[data-test-id="SYNC_LYRICS_LINE"]';
  const LYRICS_DISTANCE_ATTRIBUTE = "data-ps-lyrics-distance";
  const MAX_BLURRED_LINE_DISTANCE = 8;
  const COVER_SELECTOR = '[data-test-id="ENTITY_COVER_IMAGE"]';
  const COVER_ROOT_CLASS = "ps-apple-cover-bg";
  const COVER_HOST_CLASS = "ps-apple-cover-host";
  const trackedLyrics = new Set();
  let settings = PC.settings.get();
  let domSnapshot = PC.dom.getSnapshot();
  let removeDom = null;
  let removeSettings = null;
  let serviceRunning = false;
  let lastLyricsContainer = null;
  let lastActiveIndex = -1;
  let lastLineCount = 0;
  let coverBackground = null;

  const ensureSourceStyle = () => {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    if (style.textContent !== SOURCE_STYLE) style.textContent = SOURCE_STYLE;
  };

  const removeSourceStyle = () => document.getElementById(STYLE_ID)?.remove();

  const numberOr = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

  const backgroundCache = new Map();
  const pendingBackgrounds = new Map();

  const resolveCoverSource = (image, { preferSmall = true, maxWidth = 400 } = {}) => {
    const srcset = image.getAttribute("srcset");
    if (srcset) {
      const candidates = srcset.split(",").map((entry) => entry.trim()).map((entry) => {
        const [url, descriptor] = entry.split(/\s+/);
        const width = descriptor?.endsWith("w") ? Number.parseInt(descriptor, 10) : 0;
        const density = descriptor?.endsWith("x") ? Number.parseFloat(descriptor) : 1;
        return { url: url || "", width: width || Math.round(density * 400) };
      }).filter((entry) => entry.url);
      if (candidates.length) {
        if (preferSmall) {
          const bounded = candidates.filter((entry) => entry.width <= maxWidth)
            .sort((left, right) => right.width - left.width)[0];
          if (bounded?.url) return bounded.url;
          const smallest = candidates.sort((left, right) => left.width - right.width)[0];
          if (smallest?.url) return smallest.url;
        }
        const largest = candidates.sort((left, right) => right.width - left.width)[0];
        if (largest?.url) return largest.url;
      }
    }
    return image.currentSrc || image.src;
  };

  const preprocessCover = (url, { size = 96, blurPx = 8, saturate = 1.2, quality = 0.68 } = {}) => {
    if (backgroundCache.has(url)) return Promise.resolve(backgroundCache.get(url));
    if (pendingBackgrounds.has(url)) return pendingBackgrounds.get(url);
    const request = new Promise((resolve) => {
      const image = new Image();
      image.decoding = "async";
      image.crossOrigin = "anonymous";
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) {
          resolve(null);
          return;
        }
        context.filter = `blur(${blurPx}px) saturate(${saturate})`;
        context.drawImage(image, 0, 0, size, size);
        let dataUrl = null;
        try { dataUrl = canvas.toDataURL("image/jpeg", quality); } catch {}
        if (dataUrl) {
          backgroundCache.set(url, dataUrl);
          while (backgroundCache.size > 12) backgroundCache.delete(backgroundCache.keys().next().value);
        }
        resolve(dataUrl);
      };
      image.onerror = () => resolve(null);
      image.src = url;
    }).finally(() => pendingBackgrounds.delete(url));
    pendingBackgrounds.set(url, request);
    return request;
  };

  const makeScheduler = (delay) => {
    let timeoutId = 0;
    let frameId = 0;
    const schedule = (callback) => {
      if (timeoutId || frameId) return;
      timeoutId = window.setTimeout(() => {
        timeoutId = 0;
        frameId = requestAnimationFrame(() => {
          frameId = 0;
          callback();
        });
      }, delay);
    };
    schedule.cancel = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (frameId) cancelAnimationFrame(frameId);
      timeoutId = 0;
      frameId = 0;
    };
    return schedule;
  };

  class OriginalCoverBackground {
    scheduleApply = makeScheduler(200);
    modal = null;
    coverImage = null;
    observer = null;
    layers = null;
    activeLayerIsA = true;
    currentSourceUrl = "";
    applying = false;
    generation = 0;
    paused = false;

    update(modal, config, force = false) {
      this.config = config;
      this.syncVariables();
      const targetModal = config.enabled ? modal : null;
      if (targetModal !== this.modal) this.setModal(targetModal);
      if (!config.enabled) return;
      this.layers?.root.classList.toggle("ps-apple-cover-bg--paused", this.paused);
      this.scheduleApply(() => this.apply(force));
    }

    setPaused(paused) {
      this.paused = paused;
      this.layers?.root.classList.toggle("ps-apple-cover-bg--paused", paused);
      if (!paused) this.scheduleApply(() => this.apply(true));
    }

    syncVariables() {
      const root = document.documentElement;
      root.style.setProperty("--ps-cover-blur", `${Math.min(this.config.blurPx, 36)}px`);
      root.style.setProperty("--ps-cover-saturate", String(this.config.saturate));
      root.style.setProperty("--ps-cover-overlay", String(this.config.overlay));
      root.style.setProperty("--ps-cover-crossfade", `${this.config.crossfadeMs}ms`);
      root.style.setProperty("--ps-cover-motion-duration", `${this.config.motionDurationS}s`);
    }

    setModal(modal) {
      this.generation += 1;
      this.teardownModal();
      this.modal = modal;
      if (!modal) return;
      modal.classList.add(COVER_HOST_CLASS);
      this.ensureLayers();
      this.attachObserver();
    }

    ensureLayers() {
      const root = document.createElement("div");
      root.className = COVER_ROOT_CLASS;
      root.setAttribute("aria-hidden", "true");
      const layerA = document.createElement("div");
      layerA.className = "ps-apple-cover-bg__layer ps-apple-cover-bg__layer--a";
      layerA.dataset.psCoverLayer = "a";
      const layerB = document.createElement("div");
      layerB.className = "ps-apple-cover-bg__layer ps-apple-cover-bg__layer--b";
      layerB.dataset.psCoverLayer = "b";
      const vignette = document.createElement("div");
      vignette.className = "ps-apple-cover-bg__vignette";
      vignette.dataset.psCoverVignette = "";
      root.append(layerA, layerB, vignette);
      this.modal.prepend(root);
      this.layers = { root, layerA, layerB, vignette };
      this.activeLayerIsA = true;
    }

    attachObserver() {
      let imageObserver = null;
      const attachImage = (image) => {
        if (image === this.coverImage) return;
        imageObserver?.disconnect();
        this.coverImage = image;
        if (!image) return;
        imageObserver = new MutationObserver(() => this.scheduleApply(() => this.apply(true)));
        imageObserver.observe(image, { attributes: true, attributeFilter: ["src", "srcset"] });
      };
      attachImage(this.modal.querySelector(COVER_SELECTOR));
      const modalObserver = new MutationObserver(() => {
        attachImage(this.modal?.querySelector(COVER_SELECTOR));
        this.scheduleApply(() => this.apply(false));
      });
      modalObserver.observe(this.modal, { childList: true, subtree: true });
      this.observer = { disconnect: () => { modalObserver.disconnect(); imageObserver?.disconnect(); } };
    }

    async apply(force) {
      if (this.paused || this.applying || !this.modal || !this.layers || !this.config?.enabled) {
        if (this.layers) this.layers.root.hidden = !this.config?.enabled;
        return;
      }
      const image = this.coverImage || this.modal.querySelector(COVER_SELECTOR);
      if (!image) {
        this.layers.root.hidden = true;
        return;
      }
      if (!image.complete || image.naturalWidth === 0) {
        image.addEventListener("load", () => this.scheduleApply(() => this.apply(true)), { once: true });
        return;
      }
      const sourceUrl = resolveCoverSource(image, { preferSmall: true, maxWidth: 400 });
      if (!sourceUrl || (!force && sourceUrl === this.currentSourceUrl)) return;
      const generation = this.generation;
      this.applying = true;
      try {
        const processed = await preprocessCover(sourceUrl, {
          size: 96,
          blurPx: Math.min(18, Math.round(this.config.blurPx * 0.3)),
          saturate: this.config.saturate
        });
        if (generation !== this.generation || !this.layers || this.paused) return;
        this.layers.root.hidden = false;
        this.swapLayers(processed || sourceUrl, !processed);
        this.currentSourceUrl = sourceUrl;
      } finally {
        this.applying = false;
      }
    }

    swapLayers(url, useCssBlur) {
      const incoming = this.activeLayerIsA ? this.layers.layerB : this.layers.layerA;
      const outgoing = this.activeLayerIsA ? this.layers.layerA : this.layers.layerB;
      incoming.style.backgroundImage = `url(${JSON.stringify(url)})`;
      incoming.classList.toggle("ps-apple-cover-bg__layer--css-blur", useCssBlur);
      incoming.classList.add("ps-apple-cover-bg__layer--visible");
      incoming.classList.toggle("ps-apple-cover-bg__layer--motion", !useCssBlur);
      incoming.classList.remove("ps-apple-cover-bg__layer--motion-off");
      outgoing.classList.remove(
        "ps-apple-cover-bg__layer--visible",
        "ps-apple-cover-bg__layer--motion",
        "ps-apple-cover-bg__layer--css-blur"
      );
      outgoing.style.backgroundImage = "";
      this.activeLayerIsA = !this.activeLayerIsA;
    }

    teardownModal() {
      this.observer?.disconnect();
      this.observer = null;
      this.coverImage = null;
      this.modal?.classList.remove(COVER_HOST_CLASS);
      this.layers?.root.remove();
      this.layers = null;
      this.currentSourceUrl = "";
      this.activeLayerIsA = true;
    }

    stop() {
      this.generation += 1;
      this.scheduleApply.cancel();
      this.teardownModal();
      this.modal = null;
    }
  }
  const isActiveLine = (line) => line.classList.contains("swiper-slide-active") ||
    Array.from(line.classList).some((name) => name.includes("SyncLyricsScroller_line_active"));
  const activeLineIndex = (lines) => {
    const index = lines.findIndex(isActiveLine);
    return index >= 0 ? index : lines.length ? Math.floor(lines.length / 2) : -1;
  };
  const lineStyle = (distance, config) => {
    const blur = distance > 0 && distance <= MAX_BLURRED_LINE_DISTANCE
      ? Math.min(config.maxBlur, distance * config.blurStep)
      : 0;
    return {
      blur,
      opacity: distance === 0 ? 1 : Math.max(config.minOpacity, 1 - distance * config.opacityStep),
      scale: distance === 0 ? 1 : Math.max(0.94, 1 - distance * 0.02)
    };
  };

  const resetLine = (line) => {
    line.removeAttribute(LYRICS_DISTANCE_ATTRIBUTE);
    line.style.removeProperty("filter");
    line.style.removeProperty("opacity");
    line.style.removeProperty("transform");
  };

  const clearLyrics = () => {
    for (const line of trackedLyrics) resetLine(line);
    trackedLyrics.clear();
    lastLyricsContainer = null;
    lastActiveIndex = -1;
    lastLineCount = 0;
  };

  const currentLyricsContainer = () => {
    const modal = domSnapshot.fullscreen;
    if (!modal) return null;
    if (domSnapshot.lyrics && modal.contains(domSnapshot.lyrics)) return domSnapshot.lyrics;
    return modal.querySelector('[data-test-id="SYNC_LYRICS_CONTENT"]') || modal;
  };

  const applyLyrics = (force = false) => {
    const tweaked = settings.addons.tweakedYmDesign || {};
    const container = currentLyricsContainer();
    if (tweaked.enabled !== true || tweaked.lyricsBlur === false || !container) {
      clearLyrics();
      return;
    }
    const lines = Array.from(container.querySelectorAll(LYRICS_LINE_SELECTOR));
    const activeIndex = activeLineIndex(lines);
    if (activeIndex < 0) {
      clearLyrics();
      return;
    }
    if (!force && container === lastLyricsContainer && activeIndex === lastActiveIndex && lines.length === lastLineCount) return;
    lastLyricsContainer = container;
    lastActiveIndex = activeIndex;
    lastLineCount = lines.length;
    const config = {
      maxBlur: U.clamp(numberOr(tweaked.lyricsMaxBlur, 8), 0, 24),
      blurStep: U.clamp(numberOr(tweaked.lyricsBlurStep, 2.2), 0, 8),
      minOpacity: U.clamp(numberOr(tweaked.lyricsMinOpacity, 0.35), 0.1, 1),
      opacityStep: U.clamp(numberOr(tweaked.lyricsOpacityStep, 0.12), 0, 0.4)
    };
    const activeLines = new Set(lines);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const distance = Math.abs(index - activeIndex);
      const style = lineStyle(distance, config);
      trackedLyrics.add(line);
      line.setAttribute(LYRICS_DISTANCE_ATTRIBUTE, String(distance));
      line.style.opacity = style.opacity.toFixed(2);
      line.style.filter = style.blur > 0 ? `blur(${style.blur}px)` : "none";
      line.style.transform = style.scale < 1 ? `scale(${style.scale.toFixed(3)})` : "none";
    }
    for (const line of Array.from(trackedLyrics)) {
      if (activeLines.has(line)) continue;
      resetLine(line);
      trackedLyrics.delete(line);
    }
  };

  const applyDomDesign = (forceLyrics = false) => {
    const tweaked = settings.addons.tweakedYmDesign || {};
    const enabled = tweaked.enabled === true;
    document.documentElement.style.setProperty(
      "--ps-lyrics-blur-transition",
      `${U.clamp(numberOr(tweaked.lyricsTransitionMs, 250), 0, 1200)}ms`
    );
    document.documentElement.classList.toggle("pulsecolor-tweaked-enabled", enabled);
    document.documentElement.classList.toggle("pulsecolor-tweaked-vibe", enabled);
    domSnapshot.fullscreen?.classList.toggle("pulsecolor-tweaked-fullscreen", enabled);
    coverBackground?.update(domSnapshot.fullscreen, {
      enabled,
      blurPx: 28,
      saturate: 1.2,
      overlay: 0.55,
      crossfadeMs: U.clamp(numberOr(tweaked.coverCrossfadeMs, 900), 0, 3000),
      motionDurationS: 26
    }, forceLyrics);
    window.PulseColorAddonSupport?.setActive?.("tweakedYmDesign", enabled && !!domSnapshot.fullscreen);
    applyLyrics(forceLyrics);
  };

  const startService = () => {
    if (serviceRunning) return;
    serviceRunning = true;
    ensureSourceStyle();
    coverBackground = new OriginalCoverBackground();
    const handleVisibility = () => coverBackground?.setPaused(document.hidden || document.visibilityState !== "visible");
    document.addEventListener("visibilitychange", handleVisibility);
    coverBackground.removeVisibility = () => document.removeEventListener("visibilitychange", handleVisibility);
    handleVisibility();
    removeDom = PC.dom.subscribe((nextSnapshot) => {
      if (domSnapshot.fullscreen && domSnapshot.fullscreen !== nextSnapshot.fullscreen) {
        domSnapshot.fullscreen.classList.remove("pulsecolor-tweaked-fullscreen");
      }
      domSnapshot = nextSnapshot;
      applyDomDesign(false);
    });
    removeSettings = PC.settings.subscribe((nextSettings) => {
      settings = nextSettings;
      applyDomDesign(true);
    });
  };

  const stopService = () => {
    if (!serviceRunning) return;
    serviceRunning = false;
    removeDom?.();
    removeSettings?.();
    removeDom = null;
    removeSettings = null;
    clearLyrics();
    coverBackground?.removeVisibility?.();
    coverBackground?.stop();
    coverBackground = null;
    window.PulseColorAddonSupport?.setActive?.("tweakedYmDesign", false);
    domSnapshot.fullscreen?.classList.remove("pulsecolor-tweaked-fullscreen");
    document.documentElement.classList.remove("pulsecolor-tweaked-enabled", "pulsecolor-tweaked-vibe");
    document.documentElement.style.removeProperty("--ps-lyrics-blur-transition");
    document.documentElement.style.removeProperty("--ps-cover-blur");
    document.documentElement.style.removeProperty("--ps-cover-saturate");
    document.documentElement.style.removeProperty("--ps-cover-overlay");
    document.documentElement.style.removeProperty("--ps-cover-crossfade");
    document.documentElement.style.removeProperty("--ps-cover-motion-duration");
    removeSourceStyle();
  };

  // Fullscreen background is intentionally owned by the original DOM/CSS runtime above.

  PC.design = Object.freeze({
    version: 5,
    source: "Tweaked YM Design 1.0.0",
    refresh: applyDomDesign,
    stop: stopService,
    testing: Object.freeze({ activeLineIndex, lineStyle, applyLyrics, clearLyrics, resolveCoverSource, preprocessCover })
  });
  if (typeof PC.runtime.registerService === "function") {
    PC.runtime.registerService("tweaked-ym-design", { start: startService, stop: stopService });
  } else {
    startService();
  }
})();
