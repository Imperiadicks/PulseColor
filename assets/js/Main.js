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

  const MAIN_FUNCTION_WAVE_CROSSFADE_CSS = `
html.pcw-color-transitioning #osu-pulse-outer {
  background:
    radial-gradient(circle at 50% 55%,
      color-mix(in hsl, var(--pc-wave-blur-from, var(--ym-background-color-secondary-enabled-blur, rgba(255,255,255,.14))) 45%, transparent) 0%,
      color-mix(in hsl, var(--pc-wave-blur-from, var(--ym-background-color-secondary-enabled-blur, rgba(255,255,255,.14))) 24%, transparent) 35%,
      transparent 75%) !important;
}

html.pcw-color-transitioning #osu-pulse-outer::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(circle at 50% 55%,
      color-mix(in hsl, var(--pc-wave-blur-to, var(--ym-background-color-secondary-enabled-blur, rgba(255,255,255,.14))) 45%, transparent) 0%,
      color-mix(in hsl, var(--pc-wave-blur-to, var(--ym-background-color-secondary-enabled-blur, rgba(255,255,255,.14))) 24%, transparent) 35%,
      transparent 75%);
  opacity: var(--pc-wave-crossfade-opacity, 0);
  mix-blend-mode: screen;
  will-change: opacity;
}

html.pcw-color-transitioning #osu-pulse-outer::after {
  animation: none !important;
  opacity: 0 !important;
}

html.pcw-color-transitioning #osu-pulse-glow,
html.pcw-color-transitioning .osu-ring {
  opacity: 0 !important;
  filter: none !important;
}
`;

  const MAIN_FUNCTION_UI_CSS = `
    .DefaultLayout_root__*, .CommonLayout_root__* {
      background: transparent !important;
    }

    .Root {
      background: var(--ym-background-color-primary-enabled-content) !important;
    }

    body.sc-has-grad::before {
      content: '';
      position: fixed;
      inset: 0;
      background: var(--grad-main);
      opacity: .14;
      z-index: -1;
      pointer-events: none;
    }

    [class*="MainPage_vibe"] {
      position: relative;
      overflow: hidden;
      isolation: isolate;
      transition:
        height .82s cubic-bezier(.22, 1, .36, 1),
        min-height .82s cubic-bezier(.22, 1, .36, 1),
        max-height .82s cubic-bezier(.22, 1, .36, 1);
    }

    .Content_rootOld__g85_m,
    [class*="Content_rootOld__"],
    .Content_main__8_wIa,
    [class*="Content_main__"],
    [class*="MainPage_root__"] {
      transition:
        min-height .82s cubic-bezier(.22, 1, .36, 1),
        height .82s cubic-bezier(.22, 1, .36, 1),
        max-height .82s cubic-bezier(.22, 1, .36, 1),
        padding .82s cubic-bezier(.22, 1, .36, 1),
        margin .82s cubic-bezier(.22, 1, .36, 1),
        border-radius .82s cubic-bezier(.22, 1, .36, 1),
        box-shadow .82s cubic-bezier(.22, 1, .36, 1);
    }

    html.pulsecolor-vibe-player-hidden .Content_rootOld__g85_m,
    html.pulsecolor-vibe-player-hidden [class*="Content_rootOld__"],
    html.pulsecolor-vibe-player-hidden .Content_main__8_wIa,
    html.pulsecolor-vibe-player-hidden [class*="Content_main__"],
    body.pulsecolor-vibe-player-hidden .Content_rootOld__g85_m,
    body.pulsecolor-vibe-player-hidden [class*="Content_rootOld__"],
    body.pulsecolor-vibe-player-hidden .Content_main__8_wIa,
    body.pulsecolor-vibe-player-hidden [class*="Content_main__"] {
      min-height: calc(100vh - 56px) !important;
    }

    html.pulsecolor-vibe-player-hidden [class*="MainPage_root__"],
    body.pulsecolor-vibe-player-hidden [class*="MainPage_root__"] {
      min-height: calc(100vh - 72px) !important;
    }

    html.pulsecolor-vibe-player-hidden [class*="MainPage_vibe"],
    body.pulsecolor-vibe-player-hidden [class*="MainPage_vibe"] {
      min-height: calc(100vh - 104px) !important;
    }

    .ym-dark-theme.pcw-force-white-recolor,
    .ym-dark-theme.pcw-pure-white-palette,
    .ym-dark-theme .pcw-force-white-recolor,
    .ym-dark-theme .pcw-pure-white-palette,
    .pcw-force-white-recolor .ym-dark-theme,
    .pcw-pure-white-palette .ym-dark-theme {
      --ym-logo-color-primary-enabled: #fff;
      --ym-logo-color-primary-variant: #fff;
      --ym-logo-color-primary-player: #fff;
      --ym-controls-color-primary-default-enabled: #fff;
      --ym-controls-color-primary-default-hovered: #fff;
      --ym-controls-color-primary-default-pressed: #fff;
      --ym-controls-color-primary-text-enabled: #fff;
      --ym-controls-color-primary-text-enabled_variant: #fff;
      --ym-controls-color-primary-text-hovered: #fff;
      --ym-controls-color-primary-text-vibe: linear-gradient(180deg, #fff 0%, #fff 100%);
      --ym-controls-color-primary-text-vibe_icon: #fff;
      --ym-controls-color-secondary-on_default-enabled: #fff;
      --ym-controls-color-secondary-on_default-enabled_variant: rgba(255, 255, 255, .86);
      --ym-controls-color-secondary-on_default-hovered: #fff;
      --ym-controls-color-secondary-text-enabled_variant: #fff;
      --ym-controls-color-secondary-text-hovered: #fff;
      --ym-controls-color-secondary-text-selected: #fff;
    }

    .CommonLayout_root__WC_W1,
    .WithTopBanner_root__P__x3 {
      border: 1px solid var(--pc-shell-border, var(--pc-glass-border));
      background: var(--pc-shell-background,
        linear-gradient(126deg,
          var(--ym-background-color-primary-enabled-content) 0%,
          var(--ym-background-color-secondary-enabled-blur) 48%,
          var(--ym-background-color-primary-enabled-basic) 100%)) !important;
      box-shadow: var(--pc-shell-frame-shadow,
        inset 0 1px 0 var(--pc-glass-border),
        inset 0 -24px 48px var(--pc-shell-shadow-soft)) !important;
    }

    .CommonLayout_root__WC_W1,
    .WithTopBanner_root__P__x3 {
      border-radius: 12px;
      overflow: hidden;
    }

    .Navbar_root__chfAR,
    .EntitySidebar_root__D1fGh,
    .Divider_root__99zZ {
      background: transparent !important;
      box-shadow: none !important;
    }

    .PageHeaderPlaylist_root__yJBii,
    .CommonAlbumPage_averageColorBackground__hs1_3,
    .PlaylistPage_averageColorBackground__3wEkw,
    .ArtistPage_averageColorBackground__wXTSY {
      background:
        linear-gradient(180deg, var(--ym-controls-color-secondary-default-enabled, var(--ym-background-color-secondary-enabled-blur)) 0%, transparent 100%) !important;
    }

    .PlayerBarDesktopWithBackgroundProgressBar_player__ASKKs,
    .Content_rootOld__g85_m,
    .Content_main__8_wIa,
    .PlayerBarDesktopWithBackgroundProgressBar_root__bpmwN.PlayerBarDesktopWithBackgroundProgressBar_important__HzXrK,
    .LikesAndHistory_historyIconContainer__KPPbS,
    .LikesAndHistoryItem_root__oI1gk {
      background: transparent;
    }

    .Content_main__8_wIa,
    .PlayerBarDesktopWithBackgroundProgressBar_root__bpmwN.PlayerBarDesktopWithBackgroundProgressBar_important__HzXrK {
      border: 1px solid var(--pc-panel-border, var(--pc-glass-border)) !important;
      background: var(--pc-panel-surface, transparent) !important;
      box-shadow: var(--pc-panel-shadow, var(--pc-shell-shadow)) !important;
      border-radius: 12px;
    }

    .PlayerBarDesktopWithBackgroundProgressBar_player__ASKKs {
      border-top: 1px solid var(--pc-glass-border) !important;
    }

    .rWukOKAJh5Ga7JuIp62L,
    .LikesAndHistory_historyIconContainer__KPPbS,
    .LikesAndHistoryItem_root__oI1gk,
    .VibeContext_context__Z_82k,
    .VibeSettings_toggleSettingsButton__j6fIU,
    .VibeContext_pinButton__b6SNF {
      background: var(--pc-backdrop) !important;
      border: 1px solid var(--pc-glass-border) !important;
      backdrop-filter: blur(18px) saturate(140%);
      -webkit-backdrop-filter: blur(18px) saturate(140%);
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.10);
    }

    .rWukOKAJh5Ga7JuIp62L:hover,
    .LikesAndHistory_historyIconContainer__KPPbS:hover,
    .LikesAndHistoryItem_root__oI1gk:hover {
      background: var(--pc-hover-bg) !important;
    }

    .SonataFullscreenControlsDesktop_sonataButton__69FFc,
    .iJVAJMgccD4vj4E4o068,
    .WsKeF73pWotx9W1tWdYY,
    .SonataFullscreenControlsDesktop_playPauseButtonIcon__IkUNX,
    .vqAVPWFJlhAOleK_SLk4,
    .wy8tgXoSb23KtiD3EFWg,
    .Meta_title__GGBnH {
      color: var(--ym-controls-color-secondary-on_default-enabled) !important;
    }

    .JjlbHZ4FaP9EAcR_1DxF:active {
      color: var(--ym-controls-color-secondary-on_default-enabled) !important;
    }

    .JjlbHZ4FaP9EAcR_1DxF:hover,
    .ChangeVolume_icon__5Zv2a:hover {
      color: var(--ym-controls-color-primary-default-hovered) !important;
    }

    .PlaylistFilters_filter_selected__y3GuB {
      border-color: var(--ym-controls-color-secondary-on_default-enabled) !important;
      background: var(--pc-backdrop) !important;
    }

    .ChangeVolume_root__HDxtA {
      max-width: 160px;
    }

    .DefaultLayout_content__md70Z .MainPage_root__STXqc::-webkit-scrollbar,
    .By12CU9obvaH0jYtauNw::-webkit-scrollbar {
      width: 0;
      height: 0;
      display: none;
    }

    .By12CU9obvaH0jYtauNw {
      scrollbar-width: none;
      -ms-overflow-style: none;
    }

    .MainPage_landing___FGNm {
      padding-right: 24px;
    }

    .SyncLyrics_content__lbkWP::after,
    .SyncLyrics_content__lbkWP::before {
      display: none;
    }

    .FullscreenPlayerDesktop_poster_withSyncLyricsAnimation__bPO0o.FullscreenPlayerDesktop_important__dGfiL,
    .SyncLyricsCard_root__92qn_ {
      inset-block-end: 35px !important;
    }

    .NavbarDesktop_logoLink__KR0Dk {
      margin-top: 15px;
    }

    .CollectionPage_collectionColor__M5l1f,
    .ygfy3HHHNs5lMz5mm4ON,
    .yvGpKZBZLwidMfMcVMR3,
    .PSBpanel {
      color: var(--ym-logo-color-primary-variant) !important;
    }

    .PSBpanel {
      left: 0;
      right: 0 !important;
      display: flex;
      justify-content: center;
      font-weight: 500 !important;
    }

    .mdbxU6IWInQTsVjwnapn {
      background: var(--color-light-5) !important;
    }

    .xZzTMqgg0qtV5vqUIrkK {
      background-color: var(--color-dark-3-6) !important;
    }

    .kc5CjvU5hT9KEj0iTt3C {
      backdrop-filter: none;
      transition: backdrop-filter .24s ease, background-color .24s ease, border-color .24s ease;
    }

    .kc5CjvU5hT9KEj0iTt3C:hover,
    .kc5CjvU5hT9KEj0iTt3C:focus {
      backdrop-filter: saturate(180%) blur(18px);
      background: var(--pc-backdrop) !important;
      border-color: var(--pc-glass-border-strong) !important;
    }

    ::placeholder {
      color: var(--pc-text-soft) !important;
    }

    canvas {
      opacity: .18 !important;
      filter: blur(280px) !important;
    }

    .VibeBlock_vibeAnimation__XVEE6::after,
    .VibeAnimation_enter_active__j0jOl,
    .VibeAnimation_enter_done__Oi2Kz,
    .VibeAnimation_exit__ioGXk,
    [class*="VibeAnimation_enter_active__"],
    [class*="VibeAnimation_enter_done__"],
    [class*="VibeAnimation_exit__"] {
      opacity: 0 !important;
      background: transparent !important;
    }

    .VibeBlock_controls__BpDFL {
      z-index: 2;
    }

    .MsLY_qiKofQrwKAr98EC:after,
    .PlayQueue_root__ponhw:after,
    .PlayQueue_root__ponhw:before,
    .PinsList_root_hasPins__3LXlo:after,
    .PinsList_root_hasPins__3LXlo:before,
    .NavbarDesktop_scrollableContainer__HLc9D:before,
    .NavbarDesktop_scrollableContainer__HLc9D:after,
    .SearchPage_skeletonStickyHeader__SQqeV.SearchPage_important__z3aCa{
    background:
      linear-gradient(
        ◯turn  /* браузер-фикс от YM */
        var(--fade-background-color,
        var(--ym-background-color-secondary-enabled-blur)) 0,
        hsla(0 0% 5% / .90) 100%);
    }

    body.ym-light-theme.sc-has-grad::before,
    .ym-light-theme body.sc-has-grad::before {
      opacity: .08;
      filter: saturate(.82) brightness(1.01);
    }


    .ym-dark-theme .CommonLayout_root__WC_W1,
    .ym-dark-theme .WithTopBanner_root__P__x3,
    .ym-light-theme .CommonLayout_root__WC_W1,
    .ym-light-theme .WithTopBanner_root__P__x3 {
      background: var(--pc-shell-background) !important;
      box-shadow: var(--pc-shell-frame-shadow) !important;
    }

    .ym-dark-theme .Content_main__8_wIa,
    .ym-dark-theme .PlayerBarDesktopWithBackgroundProgressBar_root__bpmwN.PlayerBarDesktopWithBackgroundProgressBar_important__HzXrK,
    .ym-light-theme .Content_main__8_wIa,
    .ym-light-theme .PlayerBarDesktopWithBackgroundProgressBar_root__bpmwN.PlayerBarDesktopWithBackgroundProgressBar_important__HzXrK {
      border-color: var(--pc-panel-border) !important;
      background: var(--pc-panel-surface) !important;
      box-shadow: var(--pc-panel-shadow) !important;
    }

    .ym-light-theme .PlayerBarDesktopWithBackgroundProgressBar_player__ASKKs,
    .ym-light-theme .Content_rootOld__g85_m,
    .ym-light-theme .Content_main__8_wIa,
    .ym-light-theme .PlayerBarDesktopWithBackgroundProgressBar_root__bpmwN.PlayerBarDesktopWithBackgroundProgressBar_important__HzXrK,
    .ym-light-theme .LikesAndHistory_historyIconContainer__KPPbS,
    .ym-light-theme .LikesAndHistoryItem_root__oI1gk,
    .ym-light-theme .rWukOKAJh5Ga7JuIp62L,
    .ym-light-theme .VibeContext_context__Z_82k,
    .ym-light-theme .VibeSettings_toggleSettingsButton__j6fIU,
    .ym-light-theme .VibeContext_pinButton__b6SNF {
      backdrop-filter: unset;
      -webkit-backdrop-filter: unset;
    }

    .ym-light-theme .rWukOKAJh5Ga7JuIp62L:hover,
    .ym-light-theme .LikesAndHistory_historyIconContainer__KPPbS:hover,
    .ym-light-theme .LikesAndHistoryItem_root__oI1gk:hover {
      background: color-mix(in hsl, var(--pc-hover-bg) 84%, transparent) !important;
    }

    .ym-light-theme canvas {
      opacity: .12 !important;
      filter: blur(240px) saturate(.82) !important;
    }

    .ym-light-theme .VibeWidget_root__Chpsm {
      background:
        linear-gradient(180deg, var(--ym-background-color-primary-enabled-content) 0%, var(--color-light-3-3) 82%) !important;
    }
  `;

  function ensureMainFunctionStyle() {
    let style = document.getElementById('pulsecolor-mainfunction-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'pulsecolor-mainfunction-style';
      document.head.appendChild(style);
    }

    const css = MAIN_FUNCTION_WAVE_CROSSFADE_CSS + '\n' + MAIN_FUNCTION_UI_CSS;
    if (style.textContent !== css) style.textContent = css;
  }

  function ensureGradientOverlay() {
    document.body?.classList.add('sc-has-grad');
  }

  function resizeFullscreenPosterCover() {
    const cover = document.querySelector('[class*="FullscreenPlayerDesktopPoster_cover"]');
    if (!cover) return;

    cover.style.width = '600px';
    cover.style.height = '600px';
    cover.style.transition = 'all 0.3s ease';
  }

  function getActiveThemeMode() {
    const root = document.documentElement;
    const body = document.body;

    if (root?.classList?.contains('ym-light-theme') || body?.classList?.contains('ym-light-theme')) return 'light';
    if (root?.classList?.contains('ym-dark-theme') || body?.classList?.contains('ym-dark-theme')) return 'dark';

    const activeRoot = document.querySelector('.ym-light-theme, .ym-dark-theme');
    return activeRoot?.classList?.contains('ym-light-theme') ? 'light' : 'dark';
  }

  function getWavePaletteKeyForMode(mode) {
    return mode === 'light' ? '--color-light-3' : '--color-dark-5';
  }

  function isPaletteTransitionRelevant(mode) {
    return !!mode && mode === getActiveThemeMode();
  }

  function syncWaveCrossfadeVars(mode, fromVars, toVars, progress) {
    if (!isPaletteTransitionRelevant(mode)) return;

    const key = getWavePaletteKeyForMode(mode);
    const fallbackKey = mode === 'light' ? '--color-light-3' : '--color-dark-5';
    const fromValue = fromVars?.[key] || fromVars?.[fallbackKey] || fromVars?.['--color-dark-5'] || fromVars?.['--color-light-3'];
    const toValue = toVars?.[key] || toVars?.[fallbackKey] || toVars?.['--color-dark-5'] || toVars?.['--color-light-3'];
    const rootStyle = document.documentElement.style;

    if (fromValue) rootStyle.setProperty('--pc-wave-blur-from', String(fromValue), 'important');
    if (toValue) rootStyle.setProperty('--pc-wave-blur-to', String(toValue), 'important');
    rootStyle.setProperty('--pc-wave-crossfade-opacity', Math.min(1, Math.max(0, +progress || 0)).toFixed(3), 'important');
    document.documentElement.classList.add('pcw-color-transitioning');
  }

  function clearWaveCrossfadeVars(mode, vars) {
    if (mode && !isPaletteTransitionRelevant(mode)) return;

    const activeMode = mode || getActiveThemeMode();
    const key = getWavePaletteKeyForMode(activeMode);
    const value = vars?.[key] || vars?.['--color-dark-5'] || vars?.['--color-light-3'];
    const rootStyle = document.documentElement.style;

    if (value) {
      rootStyle.setProperty('--pc-wave-blur-from', String(value), 'important');
      rootStyle.setProperty('--pc-wave-blur-to', String(value), 'important');
    }

    rootStyle.setProperty('--pc-wave-crossfade-opacity', '0', 'important');
    document.documentElement.classList.remove('pcw-color-transitioning');
  }

  function handlePaletteTransition(event) {
    const detail = event?.detail || {};
    const phase = detail.phase;

    if (phase === 'start') {
      syncWaveCrossfadeVars(detail.mode, detail.fromVars, detail.toVars, detail.progress || 0);
      window.PulseColorPerformance?.markInteraction?.(920 + 220);
      return;
    }

    if (phase === 'progress') {
      syncWaveCrossfadeVars(detail.mode, detail.fromVars, detail.toVars, detail.progress || 0);
      return;
    }

    if (phase === 'clear') {
      clearWaveCrossfadeVars(detail.mode, detail.vars);
    }
  }

  function handlePaletteApplied() {
    window.OsuBeat?.retune?.({ presetBpm: window.OsuBeat?.bpm?.() || 120 });
  }

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
    return img.currentSrc || img.src || (img.getAttribute && (img.getAttribute('src') || '')) || '';
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

  function getVibeNode() {
    const nodes = [...document.querySelectorAll('[class*="MainPage_vibe"]')]
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

    const legacySelectors = [
      '[class*="VibeBlock_"]',
      '[class*="VibeAnimation_"]',
      '[data-test-id="MY_VIBE_PLAY_BUTTON"]',
      '[data-test-id*="VIBE"]',
      '[aria-label*="\u041c\u043e\u044f \u0432\u043e\u043b\u043d\u0430"]',
      '[aria-label*="\u0432\u043e\u043b\u043d\u0430" i]'
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
    document.body?.classList.toggle('pulsecolor-legacy-vibe', !!isLegacy);
    document.body?.classList.toggle('pulsecolor-modern-vibe', !!vibe && !isLegacy);
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
    if (!target || !imageURL) return;

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
      wrapper.style.cssText = 'position:absolute; inset:0; z-index:0; pointer-events:none;';

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
      try { delete layer.closest?.('[class*="MainPage_vibe"]')?.dataset?.pulsecolorBgUrl; } catch {}
      layer.style.opacity = '0';
      layer.style.transition = 'opacity .6s ease';
      setTimeout(() => layer.remove(), 700);
    });
    lastBackgroundURL = '';
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
    if (!vibe) return;

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
    ensureGradientOverlay();
    resizeFullscreenPosterCover();

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

    const selector = `[class*="MainPage_vibe"], img[data-test-id="ENTITY_COVER_IMAGE"], img[class*="AlbumCover_cover__"], img[src*="avatars.yandex.net/get-music-content"], img[srcset*="avatars.yandex.net/get-music-content"], div[data-test-id="PLAYERBAR_DESKTOP_COVER_CONTAINER"], [data-test-id="FULLSCREEN_PLAYER_MODAL"], [class*="FullscreenPlayerDesktopPoster_cover"], ${PLAYERBAR_SELECTOR}`;
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
    ensureMainFunctionStyle();
    ensureGradientOverlay();
    syncCoreClasses(CORE);
    window.addEventListener('pulsecolor:paletteTransition', handlePaletteTransition);
    window.addEventListener('pulsecolor:paletteApplied', handlePaletteApplied);
    bindHistoryObserver();
    bindCoverObserver();
    bindVibeObserver();
    bindTreeObserver();
    scheduleEffects({ bg: true, layout: true, delay: 0 });
  }

  window.PulseColorCore = Object.assign(window.PulseColorCore || {}, {
    get: getCore,
    apply: applyCore
  });

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();
})();
