/* ────────────────────────────────── BRIDGE (Colorize 2) ────────────────────────────────── */
(() => {
  /*──────────────────────── helpers ────────────────────────*/
  const LOG = (...a) => console.log('[Colorize 2]', ...a);
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  const rgb2hsl = (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0, s = 0, l = (max + min) / 2;

    if (d) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }

    return {
      h: Math.round(h * 360),
      s: +(s * 100).toFixed(1),
      l: +(l * 100).toFixed(1)
    };
  };

  const H = o => `hsl(${Math.round(o.h)}, ${+o.s.toFixed(1)}%, ${+o.l.toFixed(1)}%)`;
  const HA = (o, a) => `hsla(${Math.round(o.h)}, ${+o.s.toFixed(1)}%, ${+o.l.toFixed(1)}%, ${a})`;

  const parseHEX = hex => {
    hex = String(hex || '').replace('#', '').trim();
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const n = parseInt(hex, 16);
    if (Number.isNaN(n)) return { h: 0, s: 0, l: 50 };
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return rgb2hsl(r, g, b);
  };

  /*──────────────────────── settings ────────────────────────*/
  const getSettings = async () => ({
    'Тема': {
      useCustomColor: false,
      baseColor: ''
    }
  });

  /*──────────────────────── cover helpers ───────────────────*/
  const COVER_IMAGE_SELECTORS = [
    'div[data-test-id="PLAYERBAR_DESKTOP_COVER_CONTAINER"] img',
    '[data-test-id="FULLSCREEN_PLAYER_MODAL"] img[data-test-id="ENTITY_COVER_IMAGE"]',
    'img[data-test-id="ENTITY_COVER_IMAGE"]',
    'img[class*="AlbumCover_cover__"][src*="avatars.yandex.net/get-music-content"]',
    'img[class*="AlbumCover_cover__"][srcset*="avatars.yandex.net/get-music-content"]',
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

  const normalizeCoverURL = (src, size = '1000x1000') => String(src || '')
    .replace(/\/(?:50x50|80x80|100x100|200x200|300x300|400x400|800x800|1000x1000)(?=[/?]|$)/g, `/${size}`);

  const coverURL = () => {
    const src = coverSrcFromImg(getCoverNode());
    return src ? normalizeCoverURL(src, '400x400') : null;
  };

  const CANVAS = document.createElement('canvas');
  CANVAS.width = CANVAS.height = 64;
  const CTX = CANVAS.getContext('2d', { willReadFrequently: true });
  const CACHE = new Map();

  const normL = o => {
    const neutral = (+o.s || 0) <= 4;

    return {
      ...o,
      h: neutral ? 0 : o.h,
      s: neutral ? 0 : clamp(o.s, 8, 92),
      l: neutral ? clamp(o.l, 28, 92) : clamp(o.l, 18, 82)
    };
  };

  const colorsFromCover = (src) => {
    if (CACHE.has(src)) return Promise.resolve(CACHE.get(src));

    return new Promise((res) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        try {
          const w = img.width;
          const h = img.height;
          const scale = 64 / Math.max(w, h);

          CTX.clearRect(0, 0, 64, 64);
          CTX.drawImage(img, 0, 0, w * scale, h * scale);

          const d = CTX.getImageData(0, 0, 64, 64).data;
          const hueMap = new Map();
          let count = 0;
          let neutralBrightCount = 0;
          let neutralBrightL = 0;

          for (let y = 0; y < 64; y++) {
            for (let x = 0; x < 64; x++) {
              const idx = (y * 64 + x) * 4;
              const r = d[idx];
              const g = d[idx + 1];
              const b = d[idx + 2];
              const sum = r + g + b;

              if (sum < 36) continue;

              const hsl = rgb2hsl(r, g, b);

              if (hsl.l >= 68 && hsl.s <= 18) {
                neutralBrightCount += 1;
                neutralBrightL += hsl.l;
              }

              if (sum > 738) continue;
              if (hsl.s < 14) continue;

              const hueKey = Math.round(hsl.h / 8) * 8;
              const cur = hueMap.get(hueKey) || { count: 0, s: 0, l: 0 };
              cur.count += 1;
              cur.s += hsl.s;
              cur.l += hsl.l;
              hueMap.set(hueKey, cur);
              count += 1;
            }
          }

          const neutralTotal = count + neutralBrightCount;
          const neutralRatio = neutralBrightCount / Math.max(1, neutralTotal);

          if (
            neutralBrightCount >= 90 &&
            (neutralRatio >= 0.22 || count < neutralBrightCount * 1.8)
          ) {
            const neutral = normL({
              h: 0,
              s: 0,
              l: clamp(neutralBrightL / neutralBrightCount, 72, 90)
            });
            const result = [neutral, neutral];
            CACHE.set(src, result);
            res(result);
            return;
          }

          if (!count) {
            res(null);
            return;
          }

          let max = -1;
          let dom = null;

          for (const [hue, data] of hueMap.entries()) {
            if (data.count > max) {
              max = data.count;
              dom = {
                h: hue,
                s: +(data.s / data.count).toFixed(1),
                l: +(data.l / data.count).toFixed(1)
              };
            }
          }

          const resultColor = normL(dom);
          const result = [resultColor, resultColor];
          CACHE.set(src, result);
          res(result);
        } catch {
          res(null);
        }
      };

      img.onerror = () => res(null);
      img.src = src;
    });
  };

  const fallbackHSL = () => {
    const root = document.querySelector('[class*="PlayerBarDesktop_root"]');
    if (!root) return [{ h: 0, s: 0, l: 50 }, { h: 0, s: 0, l: 50 }];

    const v = getComputedStyle(root).getPropertyValue('--player-average-color-background');
    const m = v.match(/hsl\((\d+),\s*([\d.]+)%,\s*([\d.]+)%\)/);
    const hsl = m ? { h: +m[1], s: +m[2], l: +m[3] } : { h: 0, s: 0, l: 50 };
    return [hsl, hsl];
  };

  /*──────────────────────── palette & vars ────────────────*/
  const tuneBaseForTheme = (base, mode = 'dark') => {
    const neutral = (+base.s || 0) <= 2;

    if (neutral) {
      if (mode === 'light') {
        return {
          h: 0,
          s: 0,
          l: +clamp(base.l * 0.94, 78, 92).toFixed(1)
        };
      }

      return {
        h: 0,
        s: 0,
        l: +clamp(base.l * 0.46, 34, 48).toFixed(1)
      };
    }

    if (mode === 'light') {
      return {
        h: base.h,
        s: +clamp(base.s * 0.52, 14, 42).toFixed(1),
        l: +clamp(base.l * 0.98 + 10, 68, 82).toFixed(1)
      };
    }

    return {
      h: base.h,
      s: +clamp(base.s * 0.58, 14, 44).toFixed(1),
      l: +clamp(base.l * 0.64 + 4, 22, 38).toFixed(1)
    };
  };

  const buildVars = (base, mode = 'dark') => {
    const tuned = tuneBaseForTheme(base, mode);
    const vars = {};
    const neutral = (+tuned.s || 0) <= 2;
    const minSat = neutral ? 0 : 8;
    const maxSat = neutral ? 0 : 72;

    for (let i = 1; i <= 10; i++) {
      const p = i / 10;

      const lightColor = {
        h: neutral ? 0 : tuned.h,
        s: clamp(tuned.s - p * (mode === 'light' ? 5 : 4), minSat, maxSat),
        l: clamp(tuned.l + (98 - tuned.l) * p, 4, 98)
      };

      const darkColor = {
        h: neutral ? 0 : tuned.h,
        s: clamp(tuned.s - p * (mode === 'light' ? 3.5 : 8), minSat, maxSat),
        l: clamp(tuned.l - (tuned.l - (mode === 'light' ? 10 : 4)) * p, 2, 96)
      };

      vars[`--color-light-${i}`] = H(lightColor);
      vars[`--color-dark-${i}`] = H(darkColor);

      for (let a = 1; a <= 10; a++) {
        const alpha = +(a / 10).toFixed(1);
        vars[`--color-light-${i}-${a}`] = HA(lightColor, alpha);
        vars[`--color-dark-${i}-${a}`] = HA(darkColor, alpha);
      }
    }

    const gradFrom = {
      h: neutral ? 0 : tuned.h,
      s: neutral ? 0 : clamp(tuned.s + (mode === 'light' ? 8 : 0), 4, 76),
      l: clamp(tuned.l - (mode === 'light' ? 6 : 12), 4, 96)
    };

    const gradTo = {
      h: neutral ? 0 : tuned.h,
      s: neutral ? 0 : clamp(tuned.s - (mode === 'light' ? 4 : 2), 4, 76),
      l: clamp(tuned.l + (mode === 'light' ? 8 : 16), 4, 98)
    };

    vars['--grad-main-from'] = H(gradFrom);
    vars['--grad-main-to'] = H(gradTo);
    vars['--grad-main'] = 'linear-gradient(135deg, var(--grad-main-from) 0%, var(--grad-main-to) 100%)';
    return vars;
  };


  const PALETTE_ANIMATION_MS = 920;
  const PALETTE_TRANSITION_EASING = 'cubic-bezier(.22, 1, .36, 1)';

  const cloneHSL = (o) => ({
    h: ((+o.h % 360) + 360) % 360,
    s: +(+o.s).toFixed(1),
    l: +(+o.l).toFixed(1)
  });

  const mixHue = (from, to, t) => {
    const delta = ((to - from + 540) % 360) - 180;
    return (from + delta * t + 360) % 360;
  };

  const mixBase = (from, to, t) => ({
    h: mixHue(from.h, to.h, t),
    s: from.s + (to.s - from.s) * t,
    l: from.l + (to.l - from.l) * t
  });

  const isSameBase = (a, b) => {
    if (!a || !b) return false;
    return Math.abs((((a.h - b.h) + 540) % 360) - 180) < 0.3
      && Math.abs(a.s - b.s) < 0.15
      && Math.abs(a.l - b.l) < 0.15;
  };

  const COLORIZE_PALETTE_KEYS = (() => {
    const keys = ['--grad-main-from', '--grad-main-to'];

    for (let i = 1; i <= 10; i++) {
      keys.push(`--color-light-${i}`);
      keys.push(`--color-dark-${i}`);

      for (let a = 1; a <= 10; a++) {
        keys.push(`--color-light-${i}-${a}`);
        keys.push(`--color-dark-${i}-${a}`);
      }
    }

    return keys;
  })();

  const paletteEndpointName = (key, side) => `--pc-${String(key).replace(/^--/, '')}-${side}`;

  const buildPaletteAliasBlock = () => COLORIZE_PALETTE_KEYS.map((key) => {
    const from = paletteEndpointName(key, 'from');
    const to = paletteEndpointName(key, 'to');
    return `  ${key}: color-mix(in hsl, var(${from}, var(${to}, transparent)) var(--pc-palette-from-weight, 0%), var(${to}, var(${from}, transparent)) var(--pc-palette-to-weight, 100%));`;
  }).join('\n');

  const COLORIZE_DIRECT_PALETTE_KEYS = COLORIZE_PALETTE_KEYS.concat('--grad-main');

  const arePaletteVarsSame = (a, b) => {
    if (!a || !b) return false;
    return COLORIZE_PALETTE_KEYS.every((key) => String(a[key] || '') === String(b[key] || ''));
  };

  const COLORIZE_TRANSITION_CSS = (() => {
    return `
.ym-dark-theme,
.ym-light-theme {
  --pc-palette-progress: 100%;
  --pc-palette-from-weight: 0%;
  --pc-palette-to-weight: 100%;
${buildPaletteAliasBlock()}
  --grad-main: linear-gradient(135deg, var(--grad-main-from) 0%, var(--grad-main-to) 100%);
}
`;
  })();

  const COLORIZE_WAVE_CROSSFADE_CSS = `
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


  /*──────────────────────── YM MAPS ───────────────────────*/
  const YM_DARK_MAP = `
    --ym-background-color-primary-enabled-basic: var(--color-dark-10);
    --ym-background-color-primary-enabled-content: var(--color-dark-9);
    --ym-background-color-primary-enabled-popover: var(--color-dark-8-9);
    --ym-background-color-primary-enabled-overlay: var(--color-dark-10-5);
    --ym-background-color-primary-enabled-vibe: linear-gradient(180deg, var(--color-dark-10), var(--color-dark-7));
    --ym-background-color-primary-enabled-header: var(--color-dark-10-4);
    --ym-background-color-primary-enabled-player: var(--color-dark-8);
    --ym-background-color-primary-enabled-tooltip: var(--color-light-7);
    --ym-background-color-primary-enabled-shimmer: linear-gradient(90deg, var(--color-dark-7-5) 40%, var(--color-light-2-3) 50%, var(--color-dark-7-5) 60%);
    --ym-background-color-secondary-enabled-blur: var(--color-dark-5);

    --ym-logo-color-primary-enabled: var(--color-light-10);
    --ym-logo-color-primary-variant: var(--color-light-8);
    --ym-logo-color-primary-player: var(--color-light-9);

    --ym-controls-color-primary-default-disabled: var(--color-dark-6);
    --ym-controls-color-primary-default-enabled: var(--color-light-9);
    --ym-controls-color-primary-default-hovered: var(--color-light-8);
    --ym-controls-color-primary-default-pressed: var(--color-light-10);
    --ym-controls-color-primary-default-focused_stroke: var(--color-light-6-4);
    --ym-controls-color-primary-on_default-disabled: var(--color-dark-3-8);
    --ym-controls-color-primary-on_default-enabled: var(--color-dark-10);

    --ym-controls-color-primary-outline-disabled: var(--color-dark-7);
    --ym-controls-color-primary-outline-enabled: var(--color-dark-6-10);
    --ym-controls-color-primary-outline-hovered: var(--color-dark-5);
    --ym-controls-color-primary-outline-hovered_stroke: var(--color-light-7);
    --ym-controls-color-primary-outline-selected_stroke: var(--color-light-8);
    --ym-controls-color-primary-outline-pressed: var(--color-dark-4);
    --ym-controls-color-primary-outline-focused_stroke: var(--color-light-6-4);
    --ym-controls-color-primary-on_outline-disabled: var(--color-light-4-6);
    --ym-controls-color-primary-on_outline-enabled: var(--color-light-10);

    --ym-controls-color-primary-text-disabled: var(--color-light-4-5);
    --ym-controls-color-primary-text-enabled: var(--color-light-10-6);
    --ym-controls-color-primary-text-enabled_variant: var(--color-light-9);
    --ym-controls-color-primary-text-hovered: var(--color-light-8);
    --ym-controls-color-primary-text-hovered_variant: var(--color-light-9);
    --ym-controls-color-primary-text-vibe: linear-gradient(180deg, var(--color-light-10-9) 8.63%, var(--color-light-7-7) 77.58%);
    --ym-controls-color-primary-text-vibe_icon: var(--color-light-8-7);

    --ym-controls-color-secondary-default-disabled: var(--color-light-10-1);
    --ym-controls-color-secondary-default-enabled: var(--color-light-10-1);
    --ym-controls-color-secondary-default-hovered: var(--color-light-10-2);
    --ym-controls-color-secondary-default-pressed: var(--color-light-10-3);
    --ym-controls-color-secondary-default-focused: var(--color-dark-10-5);
    --ym-controls-color-secondary-default-focused_stroke: var(--color-light-10-4);
    --ym-controls-color-secondary-on_default-disabled: var(--color-light-6-3);
    --ym-controls-color-secondary-on_default-enabled: var(--color-light-9);
    --ym-controls-color-secondary-on_default-enabled_variant: var(--color-light-10-5);
    --ym-controls-color-secondary-on_default-hovered: var(--color-light-8);

    --ym-controls-color-secondary-outline-disabled_stroke: var(--color-dark-7);
    --ym-controls-color-secondary-outline-enabled_stroke: var(--color-light-8-3);
    --ym-controls-color-secondary-outline-hovered_stroke: var(--color-light-6-5);
    --ym-controls-color-secondary-outline-selected: var(--color-dark-7);
    --ym-controls-color-secondary-outline-selected_stroke: var(--color-light-9);
    --ym-controls-color-secondary-outline-pressed: var(--color-dark-5);
    --ym-controls-color-secondary-outline-focused_stroke: var(--color-dark-5);
    --ym-controls-color-secondary-on_outline-disabled: var(--color-light-4-5);
    --ym-controls-color-secondary-on_outline-enabled: var(--color-light-9);
    --ym-controls-color-secondary-on_outline-enabled_variant: var(--color-light-5-6);

    --ym-controls-color-secondary-text-disabled: var(--color-light-10-1);
    --ym-controls-color-secondary-text-enabled: var(--color-light-8-5);
    --ym-controls-color-secondary-text-enabled_variant: var(--color-light-10);
    --ym-controls-color-secondary-text-hovered: var(--color-light-9);
    --ym-controls-color-secondary-text-selected: var(--color-light-9);

    --ym-controls-color-secondary-card-disabled: var(--color-light-10-3);
    --ym-controls-color-secondary-card-enabled: var(--color-dark-8-9);
    --ym-controls-color-secondary-card-hovered: var(--color-dark-6-9);

    --ym-controls-color-plus-default-disabled: var(--color-light-10-1);
    --ym-controls-color-plus-default-enabled: linear-gradient(90deg, var(--color-light-6), var(--color-light-8) 30%, var(--color-light-7) 75%, var(--color-light-5));
    --ym-controls-color-plus-default-hovered: linear-gradient(90deg, var(--color-light-6-9), var(--color-light-8-9) 30%, var(--color-light-7-9) 75%, var(--color-light-5-9));
    --ym-controls-color-plus-default-pressed: var(--color-light-10-3);
    --ym-controls-color-plus-default-focused_stroke: var(--color-light-10-5);
    --ym-controls-color-plus-on_default-disabled: var(--color-light-4-6);
    --ym-controls-color-plus-on_default-enabled: var(--color-light-8-9);

    --ym-controls-color-accent-default-enabled: var(--color-light-7);
    --ym-controls-color-accent-default-hovered: var(--color-light-6);
    --ym-controls-color-accent-default-pressed: var(--color-light-10-8);
    --ym-controls-color-accent-default-focused_stroke: var(--color-light-6-3);
    --ym-controls-color-accent-on_default-enabled: var(--color-dark-10);

    --ym-message-color-successful-text-enabled: hsl(142, 56%, 52%);
    --ym-message-color-error-text-enabled: hsl(8, 88%, 58%);

    --ym-outline-color-primary-disabled: var(--color-light-10-1);
    --ym-surface-color-primary-enabled-list: var(--color-light-10-1);
    --ym-surface-color-primary-enabled-entity: var(--color-dark-10-6);

    --ym-slider-color-primary-disabled: var(--color-light-10-1);
    --ym-slider-color-primary-progress: var(--color-light-10-2);
    --ym-slider-color-primary-enabled: var(--color-light-9);

    --ym-shadow-xxs: rgba(0, 0, 0, 0.08);
    --ym-shadow-xs: rgba(0, 0, 0, 0.16);
    --ym-shadow-s: rgba(0, 0, 0, 0.24);
    --ym-shadow-m: rgba(0, 0, 0, 0.32);
    --ym-shadow-l: rgba(0, 0, 0, 0.40);
    --ym-shadow-xl: rgba(0, 0, 0, 0.48);
    --ym-shadow-xxl: rgba(0, 0, 0, 0.56);
    --ym-shadow-xxxl: rgba(0, 0, 0, 0.64);
    --ym-shadow-modal-s: rgba(0, 0, 0, 0.24);
    --ym-shadow-modal-xl: rgba(0, 0, 0, 0.48);

    --id-default-color-dark-surface-elevated-0: var(--color-dark-8);

    --pc-glass-border: var(--color-light-10-1);
    --pc-glass-border-strong: var(--color-light-10-2);
    --pc-card-bg: color-mix(in hsl, var(--ym-background-color-primary-enabled-content) 72%, transparent);
    --pc-card-bg-strong: color-mix(in hsl, var(--ym-background-color-primary-enabled-content) 84%, var(--ym-background-color-primary-enabled-basic));
    --pc-hover-bg: color-mix(in hsl, var(--ym-controls-color-secondary-default-hovered) 78%, transparent);
    --pc-shell-shadow: 0 24px 60px rgba(0, 0, 0, 0.34), inset 0 1px 0 var(--pc-glass-border);
    --pc-shell-shadow-soft: rgba(0, 0, 0, 0.26);
    --pc-backdrop: color-mix(in hsl, var(--ym-background-color-primary-enabled-content) 28%, transparent);
    --pc-text-soft: var(--color-light-6-7);
    --pc-pulse-blend: screen;
    --pc-pulse-alpha: .94;
  `;

  const YM_LIGHT_MAP = `
    --ym-background-color-primary-enabled-basic: var(--color-light-4);
    --ym-background-color-primary-enabled-content: var(--color-light-7);
    --ym-background-color-primary-enabled-popover: var(--color-light-6-9);
    --ym-background-color-primary-enabled-overlay: var(--color-dark-10-8);
    --ym-background-color-primary-enabled-vibe: linear-gradient(180deg, var(--color-light-9), var(--color-light-3));
    --ym-background-color-primary-enabled-header: var(--color-light-8-4);
    --ym-background-color-primary-enabled-player: var(--color-light-3);
    --ym-background-color-primary-enabled-tooltip: var(--color-dark-8);
    --ym-background-color-primary-enabled-shimmer: linear-gradient(90deg, var(--color-light-3-4) 40%, var(--color-light-8-5) 50%, var(--color-light-3-4) 60%);
    --ym-background-color-secondary-enabled-blur: var(--color-light-3);

    --ym-logo-color-primary-enabled: var(--color-dark-10);
    --ym-logo-color-primary-variant: var(--color-dark-8);
    --ym-logo-color-primary-player: var(--color-dark-7);

    --ym-controls-color-primary-default-disabled: var(--color-light-4);
    --ym-controls-color-primary-default-enabled: var(--color-dark-8);
    --ym-controls-color-primary-default-hovered: var(--color-dark-7);
    --ym-controls-color-primary-default-pressed: var(--color-dark-9);
    --ym-controls-color-primary-default-focused_stroke: var(--color-dark-6-3);
    --ym-controls-color-primary-on_default-disabled: var(--color-dark-4-6);
    --ym-controls-color-primary-on_default-enabled: var(--color-light-10);

    --ym-controls-color-primary-outline-disabled: var(--color-light-4);
    --ym-controls-color-primary-outline-enabled: var(--color-light-7);
    --ym-controls-color-primary-outline-hovered: var(--color-light-5);
    --ym-controls-color-primary-outline-hovered_stroke: var(--color-dark-7);
    --ym-controls-color-primary-outline-selected_stroke: var(--color-dark-8);
    --ym-controls-color-primary-outline-pressed: var(--color-light-10);
    --ym-controls-color-primary-outline-focused_stroke: var(--color-dark-6-3);
    --ym-controls-color-primary-on_outline-disabled: var(--color-dark-4-5);
    --ym-controls-color-primary-on_outline-enabled: var(--color-dark-9);

    --ym-controls-color-primary-text-disabled: var(--color-dark-4-5);
    --ym-controls-color-primary-text-enabled: var(--color-dark-7-8);
    --ym-controls-color-primary-text-enabled_variant: var(--color-dark-9);
    --ym-controls-color-primary-text-hovered: var(--color-dark-8);
    --ym-controls-color-primary-text-hovered_variant: var(--color-light-8);
    --ym-controls-color-primary-text-vibe: linear-gradient(167.52deg, var(--color-dark-10-9) 27.43%, var(--color-dark-8-9) 50.08%, var(--color-dark-6-9) 95.09%);
    --ym-controls-color-primary-text-vibe_icon: var(--color-dark-10-9);

    --ym-controls-color-secondary-default-disabled: var(--color-dark-1-1);
    --ym-controls-color-secondary-default-enabled: var(--color-dark-2-1);
    --ym-controls-color-secondary-default-hovered: var(--color-dark-3-2);
    --ym-controls-color-secondary-default-pressed: var(--color-light-8-6);
    --ym-controls-color-secondary-default-focused: var(--color-dark-5-5);
    --ym-controls-color-secondary-default-focused_stroke: var(--color-dark-3-3);
    --ym-controls-color-secondary-on_default-disabled: var(--color-dark-4-4);
    --ym-controls-color-secondary-on_default-enabled: var(--color-dark-10-9);
    --ym-controls-color-secondary-on_default-enabled_variant: var(--color-light-8-7);
    --ym-controls-color-secondary-on_default-hovered: var(--color-light-8);

    --ym-controls-color-secondary-outline-disabled_stroke: var(--color-dark-2-2);
    --ym-controls-color-secondary-outline-enabled_stroke: var(--color-dark-4-4);
    --ym-controls-color-secondary-outline-hovered_stroke: var(--color-dark-6-5);
    --ym-controls-color-secondary-outline-selected: var(--color-light-6);
    --ym-controls-color-secondary-outline-selected_stroke: var(--color-dark-10);
    --ym-controls-color-secondary-outline-pressed: var(--color-dark-2-2);
    --ym-controls-color-secondary-outline-focused_stroke: var(--color-dark-2-2);
    --ym-controls-color-secondary-on_outline-disabled: var(--color-dark-4-4);
    --ym-controls-color-secondary-on_outline-enabled: var(--color-dark-9);
    --ym-controls-color-secondary-on_outline-enabled_variant: var(--color-dark-6-7);

    --ym-controls-color-secondary-text-disabled: var(--color-light-6-4);
    --ym-controls-color-secondary-text-enabled: var(--color-light-8-5);
    --ym-controls-color-secondary-text-enabled_variant: var(--color-light-6);
    --ym-controls-color-secondary-text-hovered: var(--color-light-7);
    --ym-controls-color-secondary-text-selected: var(--color-light-7);

    --ym-controls-color-secondary-card-disabled: var(--color-light-7-3);
    --ym-controls-color-secondary-card-enabled: var(--color-dark-9-9);
    --ym-controls-color-secondary-card-hovered: var(--color-dark-8-9);

    --ym-controls-color-plus-default-disabled: var(--color-light-6-3);
    --ym-controls-color-plus-default-enabled: linear-gradient(90deg, var(--color-dark-6), var(--color-dark-8) 30%, var(--color-dark-7) 75%, var(--color-dark-5));
    --ym-controls-color-plus-default-hovered: linear-gradient(90deg, var(--color-dark-6-9), var(--color-dark-8-9) 30%, var(--color-dark-7-9) 75%, var(--color-dark-5-9));
    --ym-controls-color-plus-default-pressed: var(--color-light-8);
    --ym-controls-color-plus-default-focused_stroke: var(--color-dark-6-4);
    --ym-controls-color-plus-on_default-disabled: var(--color-dark-4-6);
    --ym-controls-color-plus-on_default-enabled: var(--color-light-8-9);

    --ym-controls-color-accent-default-enabled: var(--color-dark-7);
    --ym-controls-color-accent-default-hovered: var(--color-dark-6);
    --ym-controls-color-accent-default-pressed: var(--color-light-8);
    --ym-controls-color-accent-default-focused_stroke: var(--color-dark-6-3);
    --ym-controls-color-accent-on_default-enabled: var(--color-light-10);

    --ym-message-color-successful-text-enabled: hsl(142, 56%, 42%);
    --ym-message-color-error-text-enabled: hsl(8, 88%, 52%);

    --ym-outline-color-primary-disabled: var(--color-dark-2-2);
    --ym-surface-color-primary-enabled-list: var(--color-dark-1-1);
    --ym-surface-color-primary-enabled-entity: var(--color-dark-4-5);

    --ym-slider-color-primary-disabled: var(--color-dark-1-1);
    --ym-slider-color-primary-progress: var(--color-dark-3-3);
    --ym-slider-color-primary-enabled: var(--color-dark-8);

    --ym-shadow-xxs: rgba(0, 0, 0, 0.12);
    --ym-shadow-xs: rgba(0, 0, 0, 0.16);
    --ym-shadow-s: rgba(0, 0, 0, 0.24);
    --ym-shadow-m: rgba(0, 0, 0, 0.32);
    --ym-shadow-l: rgba(0, 0, 0, 0.40);
    --ym-shadow-xl: rgba(0, 0, 0, 0.48);
    --ym-shadow-xxl: rgba(0, 0, 0, 0.56);
    --ym-shadow-xxxl: rgba(0, 0, 0, 0.64);
    --ym-shadow-modal-s: rgba(0, 0, 0, 0.24);
    --ym-shadow-modal-xl: rgba(0, 0, 0, 0.48);

    --id-default-color-dark-surface-elevated-0: var(--color-light-6);

    --pc-glass-border: var(--color-dark-8-1);
    --pc-glass-border-strong: var(--color-dark-8-2);
    --pc-card-bg: color-mix(in hsl, var(--ym-background-color-primary-enabled-content) 72%, transparent);
    --pc-card-bg-strong: color-mix(in hsl, var(--ym-background-color-primary-enabled-content) 84%, var(--ym-background-color-primary-enabled-basic));
    --pc-hover-bg: color-mix(in hsl, var(--ym-controls-color-secondary-default-hovered) 62%, transparent);
    --pc-shell-shadow: 0 14px 28px rgba(0, 0, 0, 0.10), inset 0 1px 0 var(--pc-glass-border);
    --pc-shell-shadow-soft: rgba(0, 0, 0, 0.08);
    --pc-backdrop: color-mix(in hsl, var(--ym-background-color-primary-enabled-content) 42%, transparent);
    --pc-text-soft: var(--color-dark-6-7);
    --pc-pulse-blend: multiply;
    --pc-pulse-alpha: .68;
  `;

  const THEME_CSS_SHARED = `
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
      transition: height 1.5s ease;
    }

    .CommonLayout_root__WC_W1,
    .WithTopBanner_root__P__x3,
    .Navbar_root__chfAR,
    .EntitySidebar_root__D1fGh,
    .Divider_root__99zZ {
      background:
        radial-gradient(circle at 72% 22%, var(--ym-background-color-secondary-enabled-blur) 0%, transparent 34%),
        radial-gradient(circle at 20% 80%, var(--ym-background-color-secondary-enabled-blur) 0%, transparent 28%),
        linear-gradient(180deg, var(--ym-background-color-primary-enabled-content) 0%, var(--ym-background-color-primary-enabled-basic) 100%) !important;
      box-shadow:
        inset 0 1px 0 var(--pc-glass-border),
        inset 0 -24px 48px var(--pc-shell-shadow-soft),
        0 18px 44px rgba(0, 0, 0, 0.10) !important;
    }

    .CommonLayout_root__WC_W1,
    .WithTopBanner_root__P__x3 {
      border-radius: 18px;
      overflow: hidden;
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
      background: unset;
    }

    .Content_main__8_wIa,
    .PlayerBarDesktopWithBackgroundProgressBar_root__bpmwN.PlayerBarDesktopWithBackgroundProgressBar_important__HzXrK {
      border: 1px solid var(--pc-glass-border) !important;
      box-shadow: var(--pc-shell-shadow) !important;
      border-radius: 18px;
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


    .ym-light-theme .CommonLayout_root__WC_W1,
    .ym-light-theme .WithTopBanner_root__P__x3,
    .ym-light-theme .Navbar_root__chfAR,
    .ym-light-theme .EntitySidebar_root__D1fGh,
    .ym-light-theme .Divider_root__99zZ {
      box-shadow:
        inset 0 1px 0 var(--pc-glass-border),
        inset 0 -18px 36px var(--pc-shell-shadow-soft),
        0 14px 30px rgba(0, 0, 0, 0.08) !important;
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

  const buildThemeMapBlock = (selector, map) => `${selector}{\n${map}\n}\n`;

  const ensureStaticColorizeStyle = () => {
    let st = document.getElementById('colorize-static-style');
    if (!st) {
      st = document.createElement('style');
      st.id = 'colorize-static-style';
      document.head.appendChild(st);
    }

    const css =
      COLORIZE_TRANSITION_CSS + '\n' +
      COLORIZE_WAVE_CROSSFADE_CSS + '\n' +
      buildThemeMapBlock('.ym-dark-theme', YM_DARK_MAP) +
      buildThemeMapBlock('.ym-light-theme', YM_LIGHT_MAP) +
      THEME_CSS_SHARED;

    if (st.textContent !== css) st.textContent = css;

    const oldDynamicStyle = document.getElementById('colorize-style');
    if (oldDynamicStyle) oldDynamicStyle.remove();
  };

  const lastInlinePalette = {
    dark: null,
    light: null,
    retryTimer: 0,
    settleTimer: 0
  };

  const activePaletteTransitions = new WeakMap();

  const cleanupDirectPaletteVars = (node) => {
    COLORIZE_DIRECT_PALETTE_KEYS.forEach((key) => node.style.removeProperty(key));
  };

  const writePaletteEndpoints = (node, vars, side) => {
    COLORIZE_PALETTE_KEYS.forEach((key) => {
      const value = vars?.[key];
      if (value == null) return;
      node.style.setProperty(paletteEndpointName(key, side), String(value), 'important');
    });
  };

  const setPaletteProgress = (node, progress) => {
    const p = clamp(progress, 0, 1);
    const to = +(p * 100).toFixed(3);
    const from = +(100 - to).toFixed(3);

    node.style.setProperty('--pc-palette-progress', `${to}%`, 'important');
    node.style.setProperty('--pc-palette-from-weight', `${from}%`, 'important');
    node.style.setProperty('--pc-palette-to-weight', `${to}%`, 'important');
  };

  const getThemeModeFromNode = (node) => {
    if (node?.classList?.contains('ym-light-theme')) return 'light';
    if (node?.classList?.contains('ym-dark-theme')) return 'dark';
    return null;
  };

  const getActiveThemeMode = () => {
    const root = document.documentElement;
    const body = document.body;

    if (root?.classList?.contains('ym-light-theme') || body?.classList?.contains('ym-light-theme')) return 'light';
    if (root?.classList?.contains('ym-dark-theme') || body?.classList?.contains('ym-dark-theme')) return 'dark';

    const activeRoot = document.querySelector('.ym-light-theme, .ym-dark-theme');
    return activeRoot?.classList?.contains('ym-light-theme') ? 'light' : 'dark';
  };

  const getWavePaletteKeyForMode = (mode) => mode === 'light' ? '--color-light-3' : '--color-dark-5';

  const isWaveThemeNode = (node) => {
    const nodeMode = getThemeModeFromNode(node);
    return !!nodeMode && nodeMode === getActiveThemeMode();
  };

  const syncWaveCrossfadeVars = (node, fromVars, toVars, progress) => {
    if (!isWaveThemeNode(node)) return;

    const mode = getThemeModeFromNode(node) || getActiveThemeMode();
    const key = getWavePaletteKeyForMode(mode);
    const fallbackKey = mode === 'light' ? '--color-light-3' : '--color-dark-5';
    const fromValue = fromVars?.[key] || fromVars?.[fallbackKey] || fromVars?.['--color-dark-5'] || fromVars?.['--color-light-3'];
    const toValue = toVars?.[key] || toVars?.[fallbackKey] || toVars?.['--color-dark-5'] || toVars?.['--color-light-3'];
    const rootStyle = document.documentElement.style;

    if (fromValue) rootStyle.setProperty('--pc-wave-blur-from', String(fromValue), 'important');
    if (toValue) rootStyle.setProperty('--pc-wave-blur-to', String(toValue), 'important');
    rootStyle.setProperty('--pc-wave-crossfade-opacity', clamp(progress, 0, 1).toFixed(3), 'important');
    document.documentElement.classList.add('pcw-color-transitioning');
  };

  const clearWaveCrossfadeVars = (node, vars) => {
    if (node && !isWaveThemeNode(node)) return;

    const mode = node ? getThemeModeFromNode(node) || getActiveThemeMode() : getActiveThemeMode();
    const key = getWavePaletteKeyForMode(mode);
    const value = vars?.[key] || vars?.['--color-dark-5'] || vars?.['--color-light-3'];
    const rootStyle = document.documentElement.style;

    if (value) {
      rootStyle.setProperty('--pc-wave-blur-from', String(value), 'important');
      rootStyle.setProperty('--pc-wave-blur-to', String(value), 'important');
    }

    rootStyle.setProperty('--pc-wave-crossfade-opacity', '0', 'important');
    document.documentElement.classList.remove('pcw-color-transitioning');
  };

  const parsePaletteColor = (value) => {
    const raw = String(value || '').trim();
    const m = raw.match(/^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+)\s*)?\)$/i);
    if (!m) return null;

    return {
      h: +m[1],
      s: +m[2],
      l: +m[3],
      a: m[4] == null ? 1 : +m[4],
      alpha: m[4] != null
    };
  };

  const formatPaletteColor = (color, alphaMode = false) => {
    const h = Math.round(((color.h % 360) + 360) % 360);
    const s = +clamp(color.s, 0, 100).toFixed(1);
    const l = +clamp(color.l, 0, 100).toFixed(1);
    const a = +clamp(color.a == null ? 1 : color.a, 0, 1).toFixed(3);

    return alphaMode || a < 1
      ? `hsla(${h}, ${s}%, ${l}%, ${a})`
      : `hsl(${h}, ${s}%, ${l}%)`;
  };

  const mixPaletteValue = (fromValue, toValue, progress) => {
    if (String(fromValue || '') === String(toValue || '')) return toValue;

    const from = parsePaletteColor(fromValue);
    const to = parsePaletteColor(toValue);
    if (!from || !to) return progress < 0.5 ? fromValue : toValue;

    return formatPaletteColor({
      h: mixHue(from.h, to.h, progress),
      s: from.s + (to.s - from.s) * progress,
      l: from.l + (to.l - from.l) * progress,
      a: from.a + (to.a - from.a) * progress
    }, from.alpha || to.alpha);
  };

  const mixPaletteVars = (fromVars, toVars, progress) => {
    const out = {};
    COLORIZE_PALETTE_KEYS.forEach((key) => {
      out[key] = mixPaletteValue(fromVars?.[key], toVars?.[key], progress);
    });
    out['--grad-main'] = 'linear-gradient(135deg, var(--grad-main-from) 0%, var(--grad-main-to) 100%)';
    return out;
  };

  const easePaletteProgress = (t) => {
    const p = clamp(t, 0, 1);
    return 1 - Math.pow(1 - p, 3);
  };

  const stopPaletteTransition = (node) => {
    const active = activePaletteTransitions.get(node);
    if (active?.raf) cancelAnimationFrame(active.raf);
    if (active?.wave) clearWaveCrossfadeVars(node, active.toVars || active.fromVars);
    activePaletteTransitions.delete(node);
  };

  const getCurrentPaletteVars = (node, fallbackVars) => {
    const active = activePaletteTransitions.get(node);
    if (!active) return fallbackVars;
    return mixPaletteVars(active.fromVars, active.toVars, active.progress || 0);
  };

  const bakePaletteEndpoints = (selector, vars) => {
    if (!vars || typeof vars !== 'object') return;

    document.querySelectorAll(selector).forEach((node) => {
      stopPaletteTransition(node);
      cleanupDirectPaletteVars(node);
      writePaletteEndpoints(node, vars, 'from');
      writePaletteEndpoints(node, vars, 'to');
      setPaletteProgress(node, 1);
      clearWaveCrossfadeVars(node, vars);
      node.classList.remove('pc-color-palette-reset');
    });
  };

  const startPaletteCrossfade = (node, fromVars, toVars) => {
    stopPaletteTransition(node);
    cleanupDirectPaletteVars(node);
    writePaletteEndpoints(node, fromVars, 'from');
    writePaletteEndpoints(node, toVars, 'to');
    setPaletteProgress(node, 0);
    node.classList.remove('pc-color-palette-reset');

    const wave = isWaveThemeNode(node);
    if (wave) {
      syncWaveCrossfadeVars(node, fromVars, toVars, 0);
      window.PulseColorPerformance?.markInteraction?.(PALETTE_ANIMATION_MS + 220);
    }

    const state = {
      fromVars,
      toVars,
      progress: 0,
      startedAt: 0,
      raf: 0,
      wave
    };

    activePaletteTransitions.set(node, state);

    const step = (now) => {
      if (!state.startedAt) state.startedAt = now;

      const raw = clamp((now - state.startedAt) / PALETTE_ANIMATION_MS, 0, 1);
      const eased = easePaletteProgress(raw);

      state.progress = eased;
      setPaletteProgress(node, eased);
      if (state.wave) syncWaveCrossfadeVars(node, fromVars, toVars, eased);

      if (raw < 1) {
        state.raf = requestAnimationFrame(step);
        return;
      }

      cleanupDirectPaletteVars(node);
      writePaletteEndpoints(node, toVars, 'from');
      writePaletteEndpoints(node, toVars, 'to');
      setPaletteProgress(node, 1);
      if (state.wave) clearWaveCrossfadeVars(node, toVars);
      activePaletteTransitions.delete(node);
    };

    state.raf = requestAnimationFrame(step);
  };

  const applyInlineThemeVars = (selector, nextVars, prevVars) => {
    if (!nextVars || typeof nextVars !== 'object') return 0;

    const nodes = document.querySelectorAll(selector);
    const hasPrev = !!prevVars;

    nodes.forEach((node) => {
      const fromVars = hasPrev ? getCurrentPaletteVars(node, prevVars) : nextVars;
      const shouldAnimate = hasPrev && !arePaletteVarsSame(fromVars, nextVars);

      if (!shouldAnimate) {
        stopPaletteTransition(node);
        cleanupDirectPaletteVars(node);
        writePaletteEndpoints(node, nextVars, 'from');
        writePaletteEndpoints(node, nextVars, 'to');
        setPaletteProgress(node, 1);
        node.classList.remove('pc-color-palette-reset');
        return;
      }

      startPaletteCrossfade(node, fromVars, nextVars);
    });

    return nodes.length;
  };

  const retryInlineThemeVars = () => {
    clearTimeout(lastInlinePalette.retryTimer);

    lastInlinePalette.retryTimer = setTimeout(() => {
      if (!lastInlinePalette.dark || !lastInlinePalette.light) return;

      applyInlineThemeVars('.ym-dark-theme', lastInlinePalette.dark, null);
      applyInlineThemeVars('.ym-light-theme', lastInlinePalette.light, null);
    }, 180);
  };

  const applyVars = ({ dark, light }) => {
    ensureStaticColorizeStyle();

    const prevDark = lastInlinePalette.dark;
    const prevLight = lastInlinePalette.light;

    const darkCount = applyInlineThemeVars('.ym-dark-theme', dark, prevDark);
    const lightCount = applyInlineThemeVars('.ym-light-theme', light, prevLight);

    lastInlinePalette.dark = dark;
    lastInlinePalette.light = light;

    clearTimeout(lastInlinePalette.settleTimer);
    lastInlinePalette.settleTimer = setTimeout(() => {
      bakePaletteEndpoints('.ym-dark-theme', lastInlinePalette.dark);
      bakePaletteEndpoints('.ym-light-theme', lastInlinePalette.light);
    }, PALETTE_ANIMATION_MS + 120);

    if (!darkCount || !lightCount) retryInlineThemeVars();
  };


  let paletteAnimationFrame = 0;
  let paletteAnimationToken = 0;
  let paletteCurrentBase = null;

  const applyBasePalette = (base) => {
    const normalized = cloneHSL(base);
    paletteCurrentBase = normalized;
    applyVars({
      dark: buildVars(normalized, 'dark'),
      light: buildVars(normalized, 'light')
    });
  };

  const animateBasePalette = (targetBase, { immediate = false } = {}) => {
    const target = cloneHSL(targetBase);

    if (paletteAnimationFrame) {
      cancelAnimationFrame(paletteAnimationFrame);
      paletteAnimationFrame = 0;
    }

    if (immediate || !paletteCurrentBase) {
      applyBasePalette(target);
      return;
    }

    const from = cloneHSL(paletteCurrentBase);
    if (isSameBase(from, target)) {
      applyBasePalette(target);
      return;
    }

    const token = ++paletteAnimationToken;

    // Не пересобираем промежуточные палитры от base-цвета.
    // applyVars ставит from/to-переменные, а переход двигается одной общей прогресс-переменной.
    paletteAnimationFrame = requestAnimationFrame(() => {
      if (token !== paletteAnimationToken) return;
      paletteAnimationFrame = 0;
      applyBasePalette(target);
    });
  };

  function ensureGradientOverlay() {
    if (document.getElementById('sc-grad-overlay')) return;
    const st = document.createElement('style');
    st.id = 'sc-grad-overlay';
    st.textContent = '';
    document.head.appendChild(st);
    document.body.classList.add('sc-has-grad');
  }

  const cover = document.querySelector('[class*="FullscreenPlayerDesktopPoster_cover"]');
  if (cover) {
    cover.style.width = '600px';
    cover.style.height = '600px';
    cover.style.transition = 'all 0.3s ease';
  }

  /*──────────────────────── effects / background ─────────────────────*/
  let SETTINGS = {};
  let lastSETTINGS_JSON = '';
  let lastSrc = '';
  let lastHex = '';
  let lastBackgroundURL = '';
  let lastPageURL = location.href;

  async function getHiResCover() {
    const src = coverSrcFromImg(getCoverNode());
    return src ? normalizeCoverURL(src, '1000x1000') : null;
  }

  function getVibeNode() {
    const nodes = [...document.querySelectorAll('[class*="MainPage_vibe"]')]
      .filter(node => node && node.nodeType === 1 && node.isConnected);

    if (!nodes.length) return null;

    return nodes.find(hasLegacyVibeMarkers) || nodes.find(node => {
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
      '[aria-label*="Моя волна"]',
      '[aria-label*="волна" i]'
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

  function resetFullVibeHeight(vibe = getVibeNode()) {
    if (!vibe) return;
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

      [...target.querySelectorAll('.bg-layer')].forEach(layer => {
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
    document.querySelectorAll('.bg-layer').forEach(layer => {
      try { delete layer.closest?.('[class*="MainPage_vibe"]')?.dataset?.pulsecolorBgUrl; } catch {}
      layer.style.opacity = '0';
      layer.style.transition = 'opacity .6s ease';
      setTimeout(() => layer.remove(), 700);
    });
    lastBackgroundURL = '';
  }

  function FullVibe() {
    const v = getVibeNode();
    if (!v) return;

    const isLegacy = syncVibeModeClass(v);

    if (!isLegacy) {
      resetFullVibeHeight(v);
      v.dataset.pulsecolorFullVibe = 'modern-skip';
      return;
    }

    v.dataset.pulsecolorFullVibe = 'legacy-full';
    v.style.setProperty('height', '88.35vh', 'important');
  }

  function RemoveFullVibe() {
    const v = getVibeNode();
    if (!v) return;

    syncVibeModeClass(v);
    resetFullVibeHeight(v);
  }

  const CORE_KEY = 'PulseColor.CoreSettings.v1';
  const CORE_DEFAULT = {
    enableBackgroundImage: true,
    enableFullVibe: true,
    forceWhiteRecolor: false
  };

  function getCoreSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(CORE_KEY) || 'null');
      return Object.assign({}, CORE_DEFAULT, (s && typeof s === 'object') ? s : {});
    } catch {
      return Object.assign({}, CORE_DEFAULT);
    }
  }

  let CORE = getCoreSettings();

  function applyCoreSettings(next = null) {
    CORE = next && typeof next === 'object'
      ? Object.assign({}, CORE_DEFAULT, next)
      : getCoreSettings();

    try {
      if (CORE.enableFullVibe) FullVibe();
      else RemoveFullVibe();
    } catch {}

    try {
      if (!CORE.enableBackgroundImage) removeBackgroundImage();
      else scheduleSync?.({ bg: true });
    } catch {}
  }

  window.PulseColorCore = window.PulseColorCore || {};
  window.PulseColorCore.get = () => CORE;
  window.PulseColorCore.apply = applyCoreSettings;

  window.addEventListener('pulsecolor:coreSettingsChanged', (e) => {
    const core = e?.detail?.core;
    applyCoreSettings(core);
    try {
      scheduleSync?.({ force: true, bg: true });
    } catch {}
  });

  /*──────────────────────── recolor ─────────────────────*/
  const recolor = async (force = false) => {
    const src = coverURL();
    const core = (typeof CORE === 'object' && CORE) ? CORE : getCoreSettings();

    const useHex = core.forceWhiteRecolor ? true : !!SETTINGS['Тема']?.useCustomColor;
    const hex = core.forceWhiteRecolor ? '#ffffff' : (SETTINGS['Тема']?.baseColor || '');

    let base, gradC1, gradC2;

    if (useHex) {
      if (!force && hex === lastHex) return;
      gradC1 = gradC2 = base = normL(parseHEX(hex));
      lastHex = hex;
    } else {
      if (!force && src === lastSrc) return;
      const pair = await colorsFromCover(src) || fallbackHSL();
      if (!pair) return;

      [gradC1, gradC2] = pair;
      base = {
        h: Math.round((gradC1.h + gradC2.h) / 2),
        s: +((gradC1.s + gradC2.s) / 2).toFixed(1),
        l: +((gradC1.l + gradC2.l) / 2).toFixed(1)
      };
      lastSrc = src;
    }

    animateBasePalette(base, { immediate: force && !paletteCurrentBase });

    ensureGradientOverlay();

    window.OsuBeat?.retune?.({ presetBpm: window.OsuBeat?.bpm?.() || 120 });

    const image = await getHiResCover();

    const backgroundImageNow = !!core.enableBackgroundImage;
    if (backgroundImageNow !== (window.__LAST_BG_ENABLED || null) || force) {
      window.__LAST_BG_ENABLED = backgroundImageNow;
      if (backgroundImageNow) backgroundReplace(image);
      else removeBackgroundImage();
    }

    const fullVibeNow = !!core.enableFullVibe;
    if (fullVibeNow !== (window.__LAST_FULLVIBE || null) || force) {
      window.__LAST_FULLVIBE = fullVibeNow;
      if (fullVibeNow) FullVibe();
      else RemoveFullVibe();
    }
  };

  let syncFrame = 0;
  let syncForce = false;
  let syncNeedBg = false;
  let syncRunning = false;
  let coverObserver = null;
  let vibeObserver = null;
  let treeObserver = null;

  function runWhenIdle(fn, timeout = 900) {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(fn, { timeout });
      return;
    }

    window.setTimeout(fn, 0);
  }

  function scheduleSync({ force = false, bg = false, delay = 160 } = {}) {
    syncForce = syncForce || !!force;
    syncNeedBg = syncNeedBg || !!bg;
    if (syncFrame) return;

    syncFrame = window.setTimeout(() => {
      syncFrame = 0;

      runWhenIdle(async () => {
        if (syncRunning) {
          scheduleSync({ force: syncForce, bg: syncNeedBg, delay: 120 });
          return;
        }

        const runForce = syncForce;
        const runBg = syncNeedBg;
        syncForce = false;
        syncNeedBg = false;
        syncRunning = true;

        try {
          if (runBg) await tryInjectBackground();
          await recolor(runForce || runBg);
        } catch (e) {
          LOG('sync error', e);
        } finally {
          syncRunning = false;
          if (syncForce || syncNeedBg) scheduleSync({ force: syncForce, bg: syncNeedBg, delay: 120 });
        }
      });
    }, delay);
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
          scheduleSync({ force: true, bg: true });
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
      if (!hasBgLayer) scheduleSync({ bg: true });
    });
    vibeObserver.__node = vibe;
    vibeObserver.observe(vibe, { childList: true });
  }

  function isRelevantNode(node) {
    if (!node || node.nodeType !== 1) return false;
    const relevantSelector = '[class*="MainPage_vibe"], img[data-test-id="ENTITY_COVER_IMAGE"], img[class*="AlbumCover_cover__"], img[src*="avatars.yandex.net/get-music-content"], img[srcset*="avatars.yandex.net/get-music-content"], div[data-test-id="PLAYERBAR_DESKTOP_COVER_CONTAINER"], [data-test-id="FULLSCREEN_PLAYER_MODAL"]';
    if (node.matches?.(relevantSelector)) return true;
    return !!node.querySelector?.(relevantSelector);
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
      let shouldBg = false;

      for (const m of muts) {
        if (m.type !== 'childList') continue;

        for (const n of m.addedNodes || []) {
          if (isRelevantNode(n)) {
            shouldSync = true;
            shouldBg = true;
            break;
          }
        }
        if (shouldSync) break;

        for (const n of m.removedNodes || []) {
          if (isRelevantNode(n)) {
            shouldSync = true;
            shouldBg = true;
            break;
          }
        }
        if (shouldSync) break;
      }

      if (!shouldSync) return;

      scheduleObserverBind(120);
      scheduleSync({ force: true, bg: shouldBg, delay: 180 });
    });

    treeObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  function handleRouteChange() {
    const currentURL = location.href;
    if (currentURL === lastPageURL) return;
    lastPageURL = currentURL;

    window.setTimeout(() => {
      bindCoverObserver();
      bindVibeObserver();
      scheduleSync({ force: true, bg: true, delay: 220 });
    }, 80);
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
      if (!document.hidden) scheduleSync({ force: true, bg: true, delay: 220 });
    });
  }

  async function tryInjectBackground() {
    const core = (typeof CORE === 'object' && CORE) ? CORE : getCoreSettings();
    if (!core.enableBackgroundImage) {
      removeBackgroundImage();
      return;
    }

    const image = await getHiResCover();
    if (!image) return;

    backgroundReplace(image);
  }

  const init = async () => {
    try {
      applyCoreSettings();
    } catch {}

    bindHistoryObserver();
    bindCoverObserver();
    bindVibeObserver();
    bindTreeObserver();

    await recolor(true);
  };

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();
})();
