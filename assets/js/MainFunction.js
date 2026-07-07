(() => {
  'use strict';

  const CORE_KEY = 'PulseColor.CoreSettings.v1';
  const CORE_DEFAULT = {
    enableBackgroundImage: true,
    enableFullVibe: true,
    forceWhiteRecolor: false
  };
  const COVER_IMAGE_SELECTORS = [
    'div[data-test-id="PLAYERBAR_DESKTOP_COVER_CONTAINER"] img',
    '[data-test-id="FULLSCREEN_PLAYER_MODAL"] img[data-test-id="ENTITY_COVER_IMAGE"]',
    'img[data-test-id="ENTITY_COVER_IMAGE"]',
    'img[class*="AlbumCover_cover__"][src*="avatars.yandex.net/get-music-content"]',
    'img[class*="AlbumCover_cover__"][srcset*="avatars.yandex.net/get-music-content"]',
    'img[src*="avatars.yandex.net/get-music-content"]',
    'img[srcset*="avatars.yandex.net/get-music-content"]'
  ];
  const PLAYERBAR_SELECTOR = [
    '[data-test-id="PLAYERBAR"]',
    '[data-test-id="PLAYERBAR_DESKTOP"]',
    '[data-test-id="PLAYERBAR_DESKTOP_ROOT"]',
    '[data-test-id="PLAYERBAR_ROOT"]',
    '[class*="PlayerBarDesktopWithBackgroundProgressBar_root"]',
    '[class*="PlayerBarDesktop_root"]',
    '[class*="PlayerBar_root"]'
  ].join(',');
  const OLD_VIBE_SELECTOR = '[class*="MainPage_vibe"], [data-test-id="VIBE_BLOCK"]';
  const NEW_WAVE_SELECTOR = '[class*="VibePage_root"], [class*="DefaultLayout_rootNewWave"]';

  let lastBackgroundURL = '';
  let lastPageURL = location.href;
  let coverNodeCache = null;
  let coverNodeCacheTime = 0;
  let effectsFrame = 0;
  let effectsNeedBackground = false;
  let effectsNeedLayout = false;
  let effectsRunning = false;
  let coverObserver = null;
  let vibeObserver = null;
  let treeObserver = null;

  function normalizeCore(next) {
    return Object.assign({}, CORE_DEFAULT, (next && typeof next === 'object') ? next : {});
  }

  function readCore() {
    try {
      return normalizeCore(JSON.parse(localStorage.getItem(CORE_KEY) || 'null'));
    } catch {
      return normalizeCore();
    }
  }

  function syncCoreClasses(core) {
    const forceWhite = !!core.forceWhiteRecolor;
    document.documentElement?.classList.toggle('pcw-force-white-recolor', forceWhite);
    document.body?.classList.toggle('pcw-force-white-recolor', forceWhite);
  }

  let CORE = readCore();

  function coverSrcFromImg(img) {
    if (!img) return '';
    const src = img.currentSrc || img.src || (img.getAttribute && (img.getAttribute('src') || '')) || '';
    if (src) return src;
    const srcset = img.getAttribute?.('srcset') || '';
    return srcset.split(',')[0]?.trim().split(/\s+/)[0] || '';
  }

  function coverScore(img) {
    if (!img || !img.isConnected) return -1;

    const src = coverSrcFromImg(img);
    if (!src) return -1;

    const cls = String(img.className || '');
    const rect = img.getBoundingClientRect?.() || { width: 0, height: 0, top: 0, bottom: 0 };
    const style = getComputedStyle(img);
    const visible = rect.width > 20 && rect.height > 20 && style.display !== 'none' && style.visibility !== 'hidden';

    let score = 0;
    if (visible) score += 120;
    if (src.includes('avatars.yandex.net/get-music-content')) score += 90;
    if (cls.includes('AlbumCover_cover__')) score += 70;
    if (img.closest?.('div[data-test-id="PLAYERBAR_DESKTOP_COVER_CONTAINER"], [class*="PlayerBar"], [class*="playerBar"]')) score += 130;
    if (img.closest?.('[data-test-id="FULLSCREEN_PLAYER_MODAL"]')) score += 100;
    if (rect.top > window.innerHeight * 0.52 || rect.bottom > window.innerHeight * 0.70) score += 35;
    if (rect.width <= 260 && rect.height <= 260) score += 12;

    return score;
  }

  function getCoverNode() {
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
  }

  function normalizeCoverURL(src, size = '1000x1000') {
    return String(src || '')
      .replace(/\/(?:50x50|80x80|100x100|200x200|300x300|400x400|800x800|1000x1000)(?=[/?]|$)/g, `/${size}`);
  }

  async function getHiResCover() {
    const src = coverSrcFromImg(getCoverNode());
    return src ? normalizeCoverURL(src, '1000x1000') : null;
  }

  function getNewWaveNode() {
    return document.querySelector('[class*="VibePage_root"]') ||
      document.querySelector('[class*="DefaultLayout_rootNewWave"]') ||
      null;
  }

  function isNewWavePage() {
    return !!document.querySelector(NEW_WAVE_SELECTOR);
  }

  function getVibeNode() {
    const newWave = getNewWaveNode();
    if (newWave) return newWave;

    const nodes = [...document.querySelectorAll(OLD_VIBE_SELECTOR)]
      .filter((node) => node && node.nodeType === 1 && node.isConnected);

    if (!nodes.length) return null;

    return nodes.find(hasLegacyVibeMarkers) || nodes.find((node) => {
      const rect = node.getBoundingClientRect?.();
      const style = getComputedStyle(node);
      return rect && rect.width > 0 && rect.height >= 0 && style.display !== 'none' && style.visibility !== 'hidden';
    }) || nodes[0];
  }

  function hasLegacyVibeMarkers(vibe) {
    if (!vibe || !vibe.querySelector) return false;
    if (vibe.matches?.(NEW_WAVE_SELECTOR)) return false;

    const legacySelectors = [
      '[class*="VibeBlock_"]',
      '[class*="VibeAnimation_"]',
      '[data-test-id="MY_VIBE_PLAY_BUTTON"]'
    ];

    for (const selector of legacySelectors) {
      try {
        if (vibe.querySelector(selector)) return true;
      } catch {}
    }

    return false;
  }

  function syncVibeModeClass(vibe) {
    const isLegacy = hasLegacyVibeMarkers(vibe);
    const newWave = isNewWavePage();
    document.documentElement?.classList.toggle('colorize-new-wave-page', newWave);
    document.documentElement?.classList.toggle('pulsecolor-legacy-vibe', !!isLegacy);
    document.documentElement?.classList.toggle('pulsecolor-modern-vibe', !!vibe && !isLegacy);
    document.documentElement?.classList.toggle('pulsecolor-vibe-page', !!vibe);
    document.body?.classList.toggle('pulsecolor-legacy-vibe', !!isLegacy);
    document.body?.classList.toggle('pulsecolor-modern-vibe', !!vibe && !isLegacy);
    document.body?.classList.toggle('pulsecolor-vibe-page', !!vibe);

    if (vibe) {
      vibe.dataset.pulsecolorVibeDetected = '1';
      vibe.dataset.pulsecolorVibeMode = isLegacy ? 'legacy' : 'modern';
    }

    return isLegacy;
  }

  function isVisibleLayoutNode(node) {
    if (!node || !node.isConnected) return false;

    try {
      const style = getComputedStyle(node);
      if (!style || style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    } catch {}

    try {
      const rect = node.getBoundingClientRect();
      return rect.width > 80 && rect.height > 20;
    } catch {
      return true;
    }
  }

  function hasVisiblePlayerBar() {
    try {
      return Array.from(document.querySelectorAll(PLAYERBAR_SELECTOR)).some((node) => {
        if (!isVisibleLayoutNode(node)) return false;
        if (node.closest?.('[data-test-id="FULLSCREEN_PLAYER_MODAL"], [class*="FullscreenPlayerDesktop_root"]')) return false;

        const rect = node.getBoundingClientRect?.();
        if (!rect) return true;

        return rect.bottom >= window.innerHeight - 220 || rect.top >= window.innerHeight * 0.45;
      });
    } catch {
      return false;
    }
  }

  function setVibeLayoutState(vibe, expanded) {
    const active = !!vibe && !!expanded;
    document.documentElement?.classList.toggle('pulsecolor-vibe-player-hidden', active);
    document.body?.classList.toggle('pulsecolor-vibe-player-hidden', active);

    if (vibe) {
      vibe.dataset.pulsecolorVibeLayout = active ? 'player-hidden-expanded' : 'normal';
    }
  }

  function clearVibeLayoutState(vibe = null) {
    document.documentElement?.classList.remove('pulsecolor-vibe-player-hidden');
    document.body?.classList.remove('pulsecolor-vibe-player-hidden');
    if (vibe) delete vibe.dataset.pulsecolorVibeLayout;
  }

  function resetFullVibeHeight(vibe = getVibeNode()) {
    if (!vibe) {
      syncVibeModeClass(null);
      clearVibeLayoutState();
      return;
    }

    clearVibeLayoutState(vibe);
    vibe.style.removeProperty('height');
    vibe.style.removeProperty('min-height');
    vibe.style.removeProperty('max-height');
    delete vibe.dataset.pulsecolorFullVibe;
  }

  function backgroundReplace(imageURL) {
    const target = getVibeNode();
    cleanupForeignBackgroundLayers(target);
    if (!target || !imageURL) return;

    const targetStyle = getComputedStyle(target);
    if (targetStyle.position === 'static') target.style.setProperty('position', 'relative', 'important');
    target.style.setProperty('isolation', 'isolate', 'important');

    const hasCurrentLayer = !!target.querySelector('.bg-layer .bg-cover');
    if ((imageURL === lastBackgroundURL || target.dataset.pulsecolorBgUrl === imageURL) && hasCurrentLayer) {
      lastBackgroundURL = imageURL;
      target.dataset.pulsecolorBgUrl = imageURL;
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageURL;

    img.onload = () => {
      if (!target.isConnected) return;

      lastBackgroundURL = imageURL;
      target.dataset.pulsecolorBgUrl = imageURL;

      const wrapper = document.createElement('div');
      wrapper.className = 'bg-layer';
      wrapper.setAttribute('aria-hidden', 'true');
      wrapper.style.cssText = 'position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden;';

      const imageLayer = document.createElement('div');
      imageLayer.className = 'bg-cover';
      imageLayer.style.cssText = `
        position:absolute;
        inset:0;
        background-image:url("${imageURL}");
        background-size:cover;
        background-position:center;
        background-repeat:no-repeat;
        opacity:0;
        transition:opacity 1s ease;
        pointer-events:none;
      `;

      const gradient = document.createElement('div');
      gradient.className = 'bg-gradient';
      gradient.style.cssText = `
        position:absolute;
        inset:0;
        background:
          radial-gradient(circle at 70% 70%,
            var(--ym-background-color-secondary-enabled-blur, rgba(0,0,0,0)) 0%,
            var(--ym-background-color-primary-enabled-content, rgba(0,0,0,0.2)) 70%,
            var(--ym-background-color-primary-enabled-basic, rgba(0,0,0,0.3)) 100%);
        opacity:.72;
        pointer-events:none;
        z-index:1;
      `;

      [...target.querySelectorAll('.bg-layer')].forEach((layer) => {
        layer.style.opacity = '0';
        layer.style.transition = 'opacity .6s ease';
        setTimeout(() => layer.remove(), 700);
      });

      wrapper.appendChild(imageLayer);
      wrapper.appendChild(gradient);
      target.appendChild(wrapper);

      requestAnimationFrame(() => {
        imageLayer.offsetHeight;
        imageLayer.style.opacity = '1';
      });
    };
  }

  function removeBackgroundImage() {
    document.querySelectorAll('.bg-layer').forEach((layer) => {
      try { delete layer.closest?.(`${OLD_VIBE_SELECTOR}, ${NEW_WAVE_SELECTOR}`)?.dataset?.pulsecolorBgUrl; } catch {}
      layer.style.opacity = '0';
      layer.style.transition = 'opacity .6s ease';
      setTimeout(() => layer.remove(), 700);
    });
    lastBackgroundURL = '';
  }

  function cleanupForeignBackgroundLayers(target) {
    document.querySelectorAll('.bg-layer').forEach((layer) => {
      if (target && target.contains(layer)) return;
      layer.remove();
    });
  }

  function FullVibe() {
    const vibe = getVibeNode();
    if (!vibe) {
      clearVibeLayoutState();
      return;
    }

    const isLegacy = syncVibeModeClass(vibe);
    const playerHidden = !hasVisiblePlayerBar();

    setVibeLayoutState(vibe, playerHidden);

    if (!isLegacy) {
      vibe.style.removeProperty('height');
      vibe.style.removeProperty('max-height');
      if (playerHidden) vibe.style.setProperty('min-height', 'calc(100vh - 104px)', 'important');
      else vibe.style.removeProperty('min-height');
      vibe.dataset.pulsecolorFullVibe = playerHidden ? 'modern-player-hidden-full' : 'modern-skip';
      return;
    }

    vibe.dataset.pulsecolorFullVibe = playerHidden ? 'legacy-player-hidden-full' : 'legacy-full';
    vibe.style.removeProperty('height');
    vibe.style.removeProperty('max-height');
    vibe.style.setProperty('min-height', playerHidden ? 'calc(100vh - 104px)' : '88.35vh', 'important');
  }

  function RemoveFullVibe() {
    const vibe = getVibeNode();
    if (!vibe) {
      syncVibeModeClass(null);
      clearVibeLayoutState();
      return;
    }

    syncVibeModeClass(vibe);
    resetFullVibeHeight(vibe);
  }

  async function tryInjectBackground() {
    if (!CORE.enableBackgroundImage) {
      removeBackgroundImage();
      return;
    }

    const image = await getHiResCover();
    if (image) backgroundReplace(image);
  }

  function runWhenIdle(fn, timeout = 900) {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(fn, { timeout });
      return;
    }

    window.setTimeout(fn, 0);
  }

  function applyVibeLayout() {
    if (CORE.enableFullVibe) FullVibe();
    else RemoveFullVibe();
  }

  function scheduleEffects({ bg = false, layout = false, delay = 160 } = {}) {
    effectsNeedBackground = effectsNeedBackground || !!bg;
    effectsNeedLayout = effectsNeedLayout || !!layout;
    if (effectsFrame) return;

    effectsFrame = window.setTimeout(() => {
      effectsFrame = 0;

      runWhenIdle(async () => {
        if (effectsRunning) {
          scheduleEffects({ bg: effectsNeedBackground, layout: effectsNeedLayout, delay: 120 });
          return;
        }

        const runBackground = effectsNeedBackground;
        const runLayout = effectsNeedLayout;
        effectsNeedBackground = false;
        effectsNeedLayout = false;
        effectsRunning = true;

        try {
          if (runLayout) applyVibeLayout();
          if (runBackground) await tryInjectBackground();
        } finally {
          effectsRunning = false;
          if (effectsNeedBackground || effectsNeedLayout) {
            scheduleEffects({ bg: effectsNeedBackground, layout: effectsNeedLayout, delay: 120 });
          }
        }
      });
    }, delay);
  }

  function getCore() {
    return normalizeCore(CORE);
  }

  function applyCore(next = null) {
    CORE = next && typeof next === 'object' ? normalizeCore(next) : readCore();
    window.dispatchEvent(new CustomEvent('pulsecolor:coreSettingsChanged', {
      detail: { core: normalizeCore(CORE) }
    }));
    return normalizeCore(CORE);
  }

  window.addEventListener('pulsecolor:coreSettingsChanged', (event) => {
    const next = event?.detail?.core;
    CORE = next && typeof next === 'object' ? normalizeCore(next) : readCore();
    syncCoreClasses(CORE);
    applyVibeLayout();

    if (CORE.enableBackgroundImage) scheduleEffects({ bg: true });
    else removeBackgroundImage();
  });

  function bindCoverObserver() {
    const node = getCoverNode();
    if (coverObserver?.__node === node) return;
    if (coverObserver) coverObserver.disconnect();
    coverObserver = null;
    if (!node) return;

    coverObserver = new MutationObserver((muts) => {
      for (const mutation of muts) {
        if (mutation.type === 'attributes' && (mutation.attributeName === 'src' || mutation.attributeName === 'srcset')) {
          scheduleEffects({ bg: true });
          break;
        }
      }
    });
    coverObserver.__node = node;
    coverObserver.observe(node, { attributes: true, attributeFilter: ['src', 'srcset'] });
  }

  function bindVibeObserver() {
    const vibe = getVibeNode();
    if (vibeObserver?.__node === vibe) return;
    if (vibeObserver) vibeObserver.disconnect();
    vibeObserver = null;
    if (!vibe) return;

    vibeObserver = new MutationObserver(() => {
      const hasBgLayer = !!vibe.querySelector('.bg-layer');
      if (!hasBgLayer) scheduleEffects({ bg: true });
      scheduleEffects({ layout: true });
    });
    vibeObserver.__node = vibe;
    vibeObserver.observe(vibe, { childList: true });
  }

  function isEffectsNode(node) {
    if (!node || node.nodeType !== 1) return false;

    const selector = `${OLD_VIBE_SELECTOR}, ${NEW_WAVE_SELECTOR}, img[data-test-id="ENTITY_COVER_IMAGE"], img[class*="AlbumCover_cover__"], img[src*="avatars.yandex.net/get-music-content"], img[srcset*="avatars.yandex.net/get-music-content"], div[data-test-id="PLAYERBAR_DESKTOP_COVER_CONTAINER"], [data-test-id="FULLSCREEN_PLAYER_MODAL"], ${PLAYERBAR_SELECTOR}`;
    if (node.matches?.(selector)) return true;
    return !!node.querySelector?.(selector);
  }

  function bindTreeObserver() {
    if (treeObserver) return;

    let bindTimer = 0;

    const scheduleObserverBind = (delay = 120) => {
      if (bindTimer) return;
      bindTimer = window.setTimeout(() => {
        bindTimer = 0;
        bindCoverObserver();
        bindVibeObserver();
      }, delay);
    };

    treeObserver = new MutationObserver((muts) => {
      let shouldSync = false;

      for (const mutation of muts) {
        if (mutation.type !== 'childList') continue;

        for (const node of mutation.addedNodes || []) {
          if (isEffectsNode(node)) {
            shouldSync = true;
            break;
          }
        }
        if (shouldSync) break;

        for (const node of mutation.removedNodes || []) {
          if (isEffectsNode(node)) {
            shouldSync = true;
            break;
          }
        }
        if (shouldSync) break;
      }

      if (!shouldSync) return;

      scheduleObserverBind();
      scheduleEffects({ bg: true, layout: true, delay: 180 });
    });

    treeObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  function handleRouteChange() {
    const currentURL = location.href;
    if (currentURL === lastPageURL) return;
    lastPageURL = currentURL;

    const previousVibe = getVibeNode();
    if (previousVibe) resetFullVibeHeight(previousVibe);
    else clearVibeLayoutState();

    window.setTimeout(() => {
      bindCoverObserver();
      bindVibeObserver();
      scheduleEffects({ bg: true, layout: true, delay: 220 });
    }, 80);

    window.dispatchEvent(new CustomEvent('pulsecolor:routeChanged', {
      detail: { url: currentURL }
    }));
  }

  function bindHistoryObserver() {
    if (window.__PulseColorHistoryHooked) return;
    window.__PulseColorHistoryHooked = true;

    const { pushState, replaceState } = history;
    history.pushState = function (...args) {
      const out = pushState.apply(this, args);
      queueMicrotask(handleRouteChange);
      return out;
    };
    history.replaceState = function (...args) {
      const out = replaceState.apply(this, args);
      queueMicrotask(handleRouteChange);
      return out;
    };

    window.addEventListener('popstate', handleRouteChange);
    window.addEventListener('hashchange', handleRouteChange);
    window.addEventListener('visibilitychange', () => {
      if (!document.hidden) scheduleEffects({ bg: true, layout: true, delay: 220 });
    });
  }

  function init() {
    syncCoreClasses(CORE);
    bindHistoryObserver();
    bindCoverObserver();
    bindVibeObserver();
    bindTreeObserver();
    scheduleEffects({ bg: true, layout: true, delay: 0 });

    window.setInterval(() => {
      const vibe = getVibeNode();
      syncVibeModeClass(vibe);
      if (vibe) scheduleEffects({ layout: true, delay: 120 });
    }, 1200);
  }

  window.PulseColorCore = Object.assign(window.PulseColorCore || {}, {
    get: getCore,
    apply: applyCore
  });

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();
})();
