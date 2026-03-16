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
  const coverURL = () => {
    const imgMini = document.querySelector('div[data-test-id="PLAYERBAR_DESKTOP_COVER_CONTAINER"] img');
    if (imgMini?.src) return imgMini.src;

    const imgFull = document.querySelector('[data-test-id="FULLSCREEN_PLAYER_MODAL"] img[data-test-id="ENTITY_COVER_IMAGE"]');
    if (imgFull?.src) return imgFull.src;

    const any = document.querySelector('img[data-test-id="ENTITY_COVER_IMAGE"]');
    return any?.src || null;
  };

  const CANVAS = document.createElement('canvas');
  CANVAS.width = CANVAS.height = 64;
  const CTX = CANVAS.getContext('2d', { willReadFrequently: true });
  const CACHE = new Map();

  const normL = o => ({
    ...o,
    s: clamp(o.s, 8, 92),
    l: clamp(o.l, 18, 82)
  });

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

          for (let y = 0; y < 64; y++) {
            for (let x = 0; x < 64; x++) {
              const idx = (y * 64 + x) * 4;
              const r = d[idx];
              const g = d[idx + 1];
              const b = d[idx + 2];
              const sum = r + g + b;

              if (sum < 36 || sum > 738) continue;

              const hsl = rgb2hsl(r, g, b);
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

    for (let i = 1; i <= 10; i++) {
      const p = i / 10;

      const lightColor = {
        h: tuned.h,
        s: clamp(tuned.s - p * (mode === 'light' ? 5 : 4), 8, 72),
        l: clamp(tuned.l + (98 - tuned.l) * p, 4, 98)
      };

      const darkColor = {
        h: tuned.h,
        s: clamp(tuned.s - p * (mode === 'light' ? 3.5 : 8), 8, 72),
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
      h: tuned.h,
      s: clamp(tuned.s + (mode === 'light' ? 8 : 0), 4, 76),
      l: clamp(tuned.l - (mode === 'light' ? 6 : 12), 4, 96)
    };

    const gradTo = {
      h: tuned.h,
      s: clamp(tuned.s - (mode === 'light' ? 4 : 2), 4, 76),
      l: clamp(tuned.l + (mode === 'light' ? 8 : 16), 4, 98)
    };

    vars['--grad-main'] = `linear-gradient(135deg, ${H(gradFrom)} 0%, ${H(gradTo)} 100%)`;
    return vars;
  };


  const PALETTE_ANIMATION_MS = 820;
  const PALETTE_FRAME_MS = 34;

  const cloneHSL = (o) => ({
    h: ((+o.h % 360) + 360) % 360,
    s: +(+o.s).toFixed(1),
    l: +(+o.l).toFixed(1)
  });

  const easePalette = (t) => 1 - Math.pow(1 - t, 3);

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

    .FullscreenPlayerDesktopContent_syncLyrics__6dTfH {
      margin-block-end: 0;
      height: 100vh;
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

  const applyVars = ({ dark, light }) => {
    let st = document.getElementById('colorize-style');
    if (!st) {
      st = document.createElement('style');
      st.id = 'colorize-style';
      document.head.appendChild(st);
    }

    const buildThemeBlock = (selector, vars, map) => {
      let out = `${selector}{\n`;
      Object.entries(vars).forEach(([k, v]) => {
        out += `  ${k}: ${v} !important;\n`;
      });
      out += map + '\n}\n';
      return out;
    };

    const css =
      buildThemeBlock('.ym-dark-theme', dark, YM_DARK_MAP) +
      buildThemeBlock('.ym-light-theme', light, YM_LIGHT_MAP) +
      THEME_CSS_SHARED;

    st.textContent = css;
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

    const startedAt = performance.now();
    let lastPaint = startedAt;
    const token = ++paletteAnimationToken;

    const step = (now) => {
      if (token !== paletteAnimationToken) return;

      const elapsed = now - startedAt;
      const progress = Math.min(1, elapsed / PALETTE_ANIMATION_MS);
      const eased = easePalette(progress);

      if (progress >= 1 || now - lastPaint >= PALETTE_FRAME_MS) {
        lastPaint = now;
        applyBasePalette(mixBase(from, target, eased));
      }

      if (progress < 1) {
        paletteAnimationFrame = requestAnimationFrame(step);
        return;
      }

      paletteAnimationFrame = 0;
      applyBasePalette(target);
    };

    paletteAnimationFrame = requestAnimationFrame(step);
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
    const img = document.querySelector('[class*="PlayerBarDesktopWithBackgroundProgressBar_cover"] img');
    if (img && img.src.includes('/100x100')) return img.src.replace('/100x100', '/1000x1000');
    return img?.src || null;
  }

  function backgroundReplace(imageURL) {
    const target = document.querySelector('[class*="MainPage_vibe"]');
    if (!target || !imageURL || imageURL === lastBackgroundURL) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageURL;

    img.onload = () => {
      lastBackgroundURL = imageURL;

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
      layer.style.opacity = '0';
      layer.style.transition = 'opacity .6s ease';
      setTimeout(() => layer.remove(), 700);
    });
    lastBackgroundURL = '';
  }

  function FullVibe() {
    const v = document.querySelector('[class*="MainPage_vibe"]');
    if (v) v.style.setProperty('height', '88.35vh', 'important');
  }

  function RemoveFullVibe() {
    const v = document.querySelector('[class*="MainPage_vibe"]');
    if (v) v.style.setProperty('height', '0', 'important');
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
      else tryInjectBackground?.();
    } catch {}
  }

  window.PulseColorCore = window.PulseColorCore || {};
  window.PulseColorCore.get = () => CORE;
  window.PulseColorCore.apply = applyCoreSettings;

  window.addEventListener('pulsecolor:coreSettingsChanged', (e) => {
    const core = e?.detail?.core;
    applyCoreSettings(core);
    try {
      recolor?.(true);
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

  function scheduleSync({ force = false, bg = false } = {}) {
    syncForce = syncForce || !!force;
    syncNeedBg = syncNeedBg || !!bg;
    if (syncFrame) return;

    syncFrame = requestAnimationFrame(async () => {
      syncFrame = 0;

      if (syncRunning) {
        scheduleSync({ force: syncForce, bg: syncNeedBg });
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
        if (syncForce || syncNeedBg) scheduleSync({ force: syncForce, bg: syncNeedBg });
      }
    });
  }

  function getCoverNode() {
    return document.querySelector('div[data-test-id="PLAYERBAR_DESKTOP_COVER_CONTAINER"] img')
      || document.querySelector('[data-test-id="FULLSCREEN_PLAYER_MODAL"] img[data-test-id="ENTITY_COVER_IMAGE"]')
      || document.querySelector('img[data-test-id="ENTITY_COVER_IMAGE"]');
  }

  function bindCoverObserver() {
    const node = getCoverNode();
    if (coverObserver?.__node === node) return;
    if (coverObserver) coverObserver.disconnect();
    coverObserver = null;
    if (!node) return;

    coverObserver = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'attributes' && m.attributeName === 'src') {
          scheduleSync({ force: true, bg: true });
          break;
        }
      }
    });
    coverObserver.__node = node;
    coverObserver.observe(node, { attributes: true, attributeFilter: ['src'] });
  }

  function bindVibeObserver() {
    const vibe = document.querySelector('[class*="MainPage_vibe"]');
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
    if (node.matches?.('[class*="MainPage_vibe"], img[data-test-id="ENTITY_COVER_IMAGE"], div[data-test-id="PLAYERBAR_DESKTOP_COVER_CONTAINER"], [data-test-id="FULLSCREEN_PLAYER_MODAL"]')) return true;
    return !!node.querySelector?.('[class*="MainPage_vibe"], img[data-test-id="ENTITY_COVER_IMAGE"], div[data-test-id="PLAYERBAR_DESKTOP_COVER_CONTAINER"], [data-test-id="FULLSCREEN_PLAYER_MODAL"]');
  }

  function bindTreeObserver() {
    if (treeObserver) return;

    treeObserver = new MutationObserver((muts) => {
      let shouldSync = false;
      let shouldBg = false;

      for (const m of muts) {
        if (m.type !== 'childList') continue;

        for (const n of m.addedNodes) {
          if (isRelevantNode(n)) {
            shouldSync = true;
            shouldBg = true;
            break;
          }
        }
        if (shouldSync) break;

        for (const n of m.removedNodes) {
          if (isRelevantNode(n)) {
            shouldSync = true;
            shouldBg = true;
            break;
          }
        }
        if (shouldSync) break;
      }

      bindCoverObserver();
      bindVibeObserver();

      if (shouldSync) scheduleSync({ force: true, bg: shouldBg });
    });

    treeObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  function handleRouteChange() {
    const currentURL = location.href;
    if (currentURL === lastPageURL) return;
    lastPageURL = currentURL;
    bindCoverObserver();
    bindVibeObserver();
    scheduleSync({ force: true, bg: true });
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
      if (!document.hidden) scheduleSync({ force: true, bg: true });
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

    lastBackgroundURL = '';
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
