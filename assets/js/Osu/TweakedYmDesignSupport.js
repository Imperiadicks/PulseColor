(() => {
  "use strict";

  document.querySelectorAll(".pulsecolor-tweaked-music-glow").forEach((node) => node.remove());
  document.documentElement.classList.remove("pulsecolor-tweaked-ym-active");

  const INSTANCE_ID = (Number(window.__PULSECOLOR_TWEAKED_YM_SUPPORT_INSTANCE__) || 0) + 1;
  window.__PULSECOLOR_TWEAKED_YM_SUPPORT_INSTANCE__ = INSTANCE_ID;
  window.__PULSECOLOR_TWEAKED_YM_SUPPORT__ = true;

  const coordinator = window.PulseColorAddonSupport;
  if (!coordinator?.register) return;

  const FULLSCREEN_SELECTOR = '[data-test-id="FULLSCREEN_PLAYER_MODAL"]';
  const TWEAKED_SELECTOR = ".ps-apple-cover-bg, .ps-apple-cover-host";
  const STYLE_ID = "pulsecolor-tweaked-ym-design-support-style";
  const ROOT_ACTIVE_CLASS = "pulsecolor-tweaked-ym-support-active";
  const ROOT_BLUR_CLASS = "pulsecolor-tweaked-blur-optimized";

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const handle = coordinator.register("tweakedYmDesign", { name: "Tweaked YM Design" });
  const isCurrent = () => window.__PULSECOLOR_TWEAKED_YM_SUPPORT_INSTANCE__ === INSTANCE_ID;

  let settings = handle.getSettings();
  let activeModal = null;
  let scanTimer = 0;
  let reactiveTimer = 0;
  let blurValue = 22;
  let coverScaleValue = 1.12;
  let coverExpandValue = 0;
  let coverExtraBlurValue = 0;
  let coverBrightnessValue = 1;
  let coverVignetteLiftValue = 0;
  let coverSaturateValue = 0.96;
  let coverContrastValue = 0.90;
  let beatGlowValue = 0;
  let musicEnvelopeReady = false;
  let musicFastEnv = 0;
  let musicSlowEnv = 0;
  let musicDropEnv = 0;

  function ensureStyle() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }

    style.textContent = `
      html.${ROOT_ACTIVE_CLASS} {
        --pc-tweaked-cover-scale: 1.10;
        --pc-tweaked-cover-expand: 0%;
        --pc-tweaked-cover-extra-blur: 0px;
        --pc-tweaked-cover-brightness: 1;
        --pc-tweaked-cover-vignette-opacity: 1;
        --pc-tweaked-cover-saturate: .96;
        --pc-tweaked-cover-contrast: .90;
        --pc-tweaked-beat-bloom: 0px;
        --pc-tweaked-beat-inset-bloom: 0px;
        --pc-tweaked-beat-bg-alpha: 0;
        --pc-tweaked-beat-shadow-alpha: 0;
        --pc-tweaked-beat-inset-alpha: 0;
      }

      html.${ROOT_ACTIVE_CLASS} ${FULLSCREEN_SELECTOR} .ps-apple-cover-bg__layer--visible {
        inset: calc(-10% - var(--pc-tweaked-cover-expand)) !important;
        transform: scale(var(--pc-tweaked-cover-scale)) translate(0, 0) !important;
        animation: none !important;
        filter:
          blur(var(--pc-tweaked-cover-extra-blur))
          saturate(var(--pc-tweaked-cover-saturate))
          contrast(var(--pc-tweaked-cover-contrast))
          brightness(var(--pc-tweaked-cover-brightness)) !important;
        transition:
          inset 520ms cubic-bezier(.22,1,.36,1),
          transform 520ms cubic-bezier(.22,1,.36,1),
          filter 520ms cubic-bezier(.22,1,.36,1);
      }

      html.${ROOT_ACTIVE_CLASS} ${FULLSCREEN_SELECTOR} .ps-apple-cover-bg__layer--visible.ps-apple-cover-bg__layer--css-blur {
        filter:
          blur(calc(var(--ps-cover-blur, 28px) + var(--pc-tweaked-cover-extra-blur)))
          saturate(var(--pc-tweaked-cover-saturate))
          contrast(var(--pc-tweaked-cover-contrast))
          brightness(var(--pc-tweaked-cover-brightness)) !important;
      }

      html.${ROOT_ACTIVE_CLASS} ${FULLSCREEN_SELECTOR} .ps-apple-cover-bg__vignette {
        opacity: var(--pc-tweaked-cover-vignette-opacity) !important;
        transition: opacity 420ms cubic-bezier(.22,1,.36,1);
      }

      html.${ROOT_BLUR_CLASS} {
        --pc-tweaked-blur: 22px;
      }

      html.${ROOT_BLUR_CLASS} ${FULLSCREEN_SELECTOR} :is(
        [class*="VibePlayerbarMeta_center"],
        .tovibe-form,
        [class*="AlbumCover_playButton_playing"],
        [class*="AlbumCover_button"],
        [class*="VibePage_hoveredButton"],
        [class*="VibePlayerBar_button"]
      ) {
        backdrop-filter: blur(var(--pc-tweaked-blur)) !important;
        -webkit-backdrop-filter: blur(var(--pc-tweaked-blur)) !important;
        transition:
          backdrop-filter 420ms cubic-bezier(.22,1,.36,1),
          -webkit-backdrop-filter 420ms cubic-bezier(.22,1,.36,1);
      }

      html.${ROOT_ACTIVE_CLASS} ${FULLSCREEN_SELECTOR} :is(
        [class*="VibePlayerbarMeta_center"],
        .tovibe-form,
        [class*="AlbumCover_playButton_playing"],
        [class*="AlbumCover_button"],
        [class*="VibePage_hoveredButton"],
        [class*="VibePlayerBar_button"]
      ) {
        background-color: rgba(255, 255, 255, var(--pc-tweaked-beat-bg-alpha)) !important;
        box-shadow:
          0 0 var(--pc-tweaked-beat-bloom) rgba(255, 255, 255, var(--pc-tweaked-beat-shadow-alpha)),
          inset 0 0 var(--pc-tweaked-beat-inset-bloom) rgba(255, 255, 255, var(--pc-tweaked-beat-inset-alpha)) !important;
        transition:
          backdrop-filter 420ms cubic-bezier(.22,1,.36,1),
          -webkit-backdrop-filter 420ms cubic-bezier(.22,1,.36,1),
          box-shadow 220ms cubic-bezier(.22,1,.36,1),
          background-color 180ms cubic-bezier(.22,1,.36,1);
      }
    `;
  }

  function isVisible(node) {
    if (!node) return false;
    try {
      const rect = node.getBoundingClientRect();
      if (rect.width < 100 || rect.height < 100) return false;
      const cs = getComputedStyle(node);
      return cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity || 1) > 0.01;
    } catch {
      return false;
    }
  }

  function findTweakedFullscreen() {
    const modal = document.querySelector(FULLSCREEN_SELECTOR);
    if (!isVisible(modal)) return null;
    return modal.querySelector(TWEAKED_SELECTOR) ? modal : null;
  }

  function resetReactiveVars() {
    const root = document.documentElement;
    root.style.removeProperty("--pc-tweaked-blur");
    root.style.removeProperty("--pc-tweaked-cover-scale");
    root.style.removeProperty("--pc-tweaked-cover-expand");
    root.style.removeProperty("--pc-tweaked-cover-extra-blur");
    root.style.removeProperty("--pc-tweaked-cover-brightness");
    root.style.removeProperty("--pc-tweaked-cover-vignette-opacity");
    root.style.removeProperty("--pc-tweaked-cover-saturate");
    root.style.removeProperty("--pc-tweaked-cover-contrast");
    root.style.removeProperty("--pc-tweaked-beat-bloom");
    root.style.removeProperty("--pc-tweaked-beat-inset-bloom");
    root.style.removeProperty("--pc-tweaked-beat-bg-alpha");
    root.style.removeProperty("--pc-tweaked-beat-shadow-alpha");
    root.style.removeProperty("--pc-tweaked-beat-inset-alpha");
    blurValue = Number(settings.blurPx) || 22;
    coverScaleValue = 1.10;
    coverExpandValue = 0;
    coverExtraBlurValue = 0;
    coverBrightnessValue = 1;
    coverVignetteLiftValue = 0;
    coverSaturateValue = 0.96;
    coverContrastValue = 0.90;
    beatGlowValue = 0;
    musicEnvelopeReady = false;
    musicFastEnv = 0;
    musicSlowEnv = 0;
    musicDropEnv = 0;
  }

  function applyBaseVars() {
    const root = document.documentElement;
    const base = Math.round(Number(settings.blurPx) || 22);
    blurValue = Number.isFinite(blurValue) ? blurValue : base;
    coverScaleValue = Number.isFinite(coverScaleValue) ? coverScaleValue : 1.10;
    coverExpandValue = Number.isFinite(coverExpandValue) ? coverExpandValue : 0;
    coverExtraBlurValue = Number.isFinite(coverExtraBlurValue) ? coverExtraBlurValue : 0;
    coverBrightnessValue = Number.isFinite(coverBrightnessValue) ? coverBrightnessValue : 1;
    coverVignetteLiftValue = Number.isFinite(coverVignetteLiftValue) ? coverVignetteLiftValue : 0;
    coverSaturateValue = Number.isFinite(coverSaturateValue) ? coverSaturateValue : 0.96;
    coverContrastValue = Number.isFinite(coverContrastValue) ? coverContrastValue : 0.90;
    beatGlowValue = Number.isFinite(beatGlowValue) ? beatGlowValue : 0;
    root.style.setProperty("--pc-tweaked-blur", `${Math.round(blurValue)}px`);
    root.style.setProperty("--pc-tweaked-cover-scale", coverScaleValue.toFixed(3));
    root.style.setProperty("--pc-tweaked-cover-expand", `${coverExpandValue.toFixed(2)}%`);
    root.style.setProperty("--pc-tweaked-cover-extra-blur", `${coverExtraBlurValue.toFixed(2)}px`);
    root.style.setProperty("--pc-tweaked-cover-brightness", coverBrightnessValue.toFixed(3));
    root.style.setProperty("--pc-tweaked-cover-vignette-opacity", (1 - coverVignetteLiftValue).toFixed(3));
    root.style.setProperty("--pc-tweaked-cover-saturate", coverSaturateValue.toFixed(3));
    root.style.setProperty("--pc-tweaked-cover-contrast", coverContrastValue.toFixed(3));
    root.style.setProperty("--pc-tweaked-beat-bloom", `${(beatGlowValue * 150).toFixed(1)}px`);
    root.style.setProperty("--pc-tweaked-beat-inset-bloom", `${(beatGlowValue * 66).toFixed(1)}px`);
    root.style.setProperty("--pc-tweaked-beat-bg-alpha", (beatGlowValue * 0.035).toFixed(4));
    root.style.setProperty("--pc-tweaked-beat-shadow-alpha", (beatGlowValue * 0.22).toFixed(4));
    root.style.setProperty("--pc-tweaked-beat-inset-alpha", (beatGlowValue * 0.10).toFixed(4));
  }

  function applySettings() {
    const root = document.documentElement;
    const active = !!activeModal && settings.enabled !== false;
    root.classList.toggle(ROOT_ACTIVE_CLASS, active && settings.musicGlow !== false);
    root.classList.toggle(ROOT_BLUR_CLASS, active && settings.optimizeBlur !== false);

    if (!active) {
      resetReactiveVars();
      return;
    }

    applyBaseVars();
  }

  function getAudioState() {
    try {
      return window.PulseColorAudio?.getState?.() || null;
    } catch {
      return null;
    }
  }

  function getPlaybackVolumeGain() {
    try {
      const audios = Array.from(document.querySelectorAll("audio"));
      const audio = audios.find((el) =>
        el &&
        el.isConnected &&
        !el.ended &&
        Number(el.currentTime || 0) > 0 &&
        !el.muted &&
        Number(el.volume) > 0
      ) || audios.find((el) => el && el.isConnected && !el.ended && !el.muted && Number(el.volume) > 0);

      if (!audio) return 1;
      const volume = Number(audio.volume);
      if (!Number.isFinite(volume) || volume <= 0) return 1;
      return clamp(volume, 0.08, 1);
    } catch {
      return 1;
    }
  }

  function getMusicDynamics(parts, active) {
    const total = Math.max(0, Number(parts.total) || 0);
    if (!active || total < 0.00001) {
      musicEnvelopeReady = false;
      musicFastEnv = 0;
      musicSlowEnv = 0;
      musicDropEnv += (0 - musicDropEnv) * 0.16;
      return { loud: 0, growth: 0, beatPulse: 0 };
    }

    if (!musicEnvelopeReady) {
      musicFastEnv = total;
      musicSlowEnv = Math.max(total, 0.015);
      musicDropEnv = 0;
      musicEnvelopeReady = true;
      return { loud: 0, growth: 0, beatPulse: 0 };
    }

    musicFastEnv += (total - musicFastEnv) * (total > musicFastEnv ? 0.22 : 0.075);
    musicSlowEnv += (total - musicSlowEnv) * (total > musicSlowEnv ? 0.012 : 0.028);

    const base = Math.max(0.025, musicSlowEnv);
    const relativeLift = clamp((musicFastEnv - base) / base, 0, 1.25);
    const shareDenom = Math.max(0.05, total);
    const kickShare = clamp((parts.kick || 0) / shareDenom, 0, 1.25);
    const voiceShare = clamp((parts.voice || 0) / shareDenom, 0, 1.25);
    const heavyShare = clamp((parts.heavy || 0) / shareDenom, 0, 1.25);
    const riseShare = clamp((parts.rise || 0) / shareDenom, 0, 1.25);
    const fluxShare = clamp((parts.flux || 0) / shareDenom, 0, 1.25);

    const musicalRise = clamp(
      relativeLift * 0.58 +
      riseShare * 0.20 +
      fluxShare * 0.18 +
      voiceShare * 0.08 +
      heavyShare * 0.08,
      0,
      1
    );
    const beatPulse = Math.pow(clamp(kickShare * 0.38 + riseShare * 0.26 + fluxShare * 0.18 + (parts.beat ? 0.18 : 0), 0, 1), 1.25);

    const targetDrop = clamp(musicalRise * 0.78 + relativeLift * 0.14 + voiceShare * 0.08, 0, 1);
    musicDropEnv += (targetDrop - musicDropEnv) * (targetDrop > musicDropEnv ? 0.18 : 0.070);

    return {
      loud: clamp(relativeLift * 0.46 + musicDropEnv * 0.42 + heavyShare * 0.08 + voiceShare * 0.07, 0, 1),
      growth: clamp(musicDropEnv * 0.82 + musicalRise * 0.18, 0, 1),
      beatPulse
    };
  }

  function updateReactiveBlur() {
    if (!isCurrent()) return;
    reactiveTimer = 0;

    if (!activeModal || settings.enabled === false) {
      resetReactiveVars();
      return;
    }

    const root = document.documentElement;
    const baseBlur = clamp(Number(settings.blurPx) || 22, 8, 50);
    const strength = clamp(Number(settings.glowStrength) || 0.22, 0, 0.5);

    if (settings.musicGlow === false) {
      blurValue += (baseBlur - blurValue) * 0.30;
      coverScaleValue += (1.10 - coverScaleValue) * 0.26;
      coverExpandValue += (0 - coverExpandValue) * 0.26;
      coverExtraBlurValue += (0 - coverExtraBlurValue) * 0.26;
      coverBrightnessValue += (1 - coverBrightnessValue) * 0.26;
      coverVignetteLiftValue += (0 - coverVignetteLiftValue) * 0.26;
      coverSaturateValue += (0.96 - coverSaturateValue) * 0.26;
      coverContrastValue += (0.90 - coverContrastValue) * 0.26;
      beatGlowValue += (0 - beatGlowValue) * 0.32;
    } else {
      const state = getAudioState();
      const osu = window.__OSU__ || {};
      const volumeGain = getPlaybackVolumeGain();
      const compensateVolume = (value) => Math.max(0, Number(value) || 0) / volumeGain;
      const rawRms = +(osu.rms || 0);
      const audioActive = state?.active !== false || rawRms > 0.000001;
      const rms = audioActive ? compensateVolume(rawRms) : 0;
      const voice = audioActive ? Math.max(compensateVolume(state?.voice), compensateVolume(osu.voiceEnv), compensateVolume(osu.voiceLevel)) : 0;
      const flux = audioActive ? Math.max(compensateVolume(state?.flux), compensateVolume(osu.fluxLevel)) : 0;
      const energy = audioActive ? Math.max(compensateVolume(state?.energy), compensateVolume(osu.energySmooth), rms) : 0;
      const kick = audioActive ? Math.max(compensateVolume(state?.kick || state?.bass), compensateVolume(osu.kickEnv), compensateVolume(osu.kickLevel)) : 0;
      const heavy = audioActive ? Math.max(compensateVolume(state?.heavy), compensateVolume(osu.energyHeavy)) : 0;
      const rise = audioActive ? Math.max(compensateVolume(state?.rise), compensateVolume(osu.energyRise)) : 0;
      const beat = state?.beat ? 1 : 0;

      const total = Math.max(energy, rms, heavy * 0.88 + voice * 0.24, kick * 0.70 + heavy * 0.30);
      const dynamics = getMusicDynamics({ total, kick, voice, heavy, rise, flux, beat }, audioActive);
      const loud = dynamics.loud;
      const growth = dynamics.growth;
      const beatPulse = dynamics.beatPulse;
      const power = clamp(strength / 0.22, 0.35, 2.20);
      const blurTarget = settings.optimizeBlur === false
        ? baseBlur
        : clamp(baseBlur + growth * (4 + power * 10) + beatPulse * (1 + power * 2.5), 8, 56);
      const scaleTarget = clamp(1.10 + growth * (0.020 + power * 0.045) + beatPulse * (0.004 + power * 0.010), 1.10, 1.24);
      const expandTarget = clamp(growth * (0.7 + power * 3.3) + beatPulse * (0.18 + power * 0.55), 0, 6.8);
      const extraBlurTarget = clamp(growth * (5.0 + power * 15.0) + beatPulse * (1.2 + power * 3.2), 0, 36);
      const brightnessTarget = clamp(1 + loud * (0.012 + power * 0.025) + beatPulse * (0.006 + power * 0.012), 1, 1.075);
      const vignetteLiftTarget = clamp(loud * (0.035 + power * 0.060) + beatPulse * (0.010 + power * 0.025), 0, 0.16);
      const saturateTarget = clamp(0.96 - growth * 0.15 - beatPulse * 0.035, 0.72, 0.98);
      const contrastTarget = clamp(0.90 - growth * 0.16 - beatPulse * 0.040, 0.68, 0.92);
      const beatGlowTarget = clamp(beatPulse * (0.050 + power * 0.075), 0, 0.16);

      blurValue += (blurTarget - blurValue) * (blurTarget > blurValue ? 0.20 : 0.10);
      coverScaleValue += (scaleTarget - coverScaleValue) * (scaleTarget > coverScaleValue ? 0.18 : 0.08);
      coverExpandValue += (expandTarget - coverExpandValue) * (expandTarget > coverExpandValue ? 0.20 : 0.09);
      coverExtraBlurValue += (extraBlurTarget - coverExtraBlurValue) * (extraBlurTarget > coverExtraBlurValue ? 0.22 : 0.10);
      coverBrightnessValue += (brightnessTarget - coverBrightnessValue) * (brightnessTarget > coverBrightnessValue ? 0.18 : 0.10);
      coverVignetteLiftValue += (vignetteLiftTarget - coverVignetteLiftValue) * (vignetteLiftTarget > coverVignetteLiftValue ? 0.18 : 0.10);
      coverSaturateValue += (saturateTarget - coverSaturateValue) * 0.16;
      coverContrastValue += (contrastTarget - coverContrastValue) * 0.16;
      beatGlowValue += (beatGlowTarget - beatGlowValue) * (beatGlowTarget > beatGlowValue ? 0.46 : 0.24);
    }

    root.style.setProperty("--pc-tweaked-blur", `${Math.round(blurValue)}px`);
    root.style.setProperty("--pc-tweaked-cover-scale", coverScaleValue.toFixed(3));
    root.style.setProperty("--pc-tweaked-cover-expand", `${coverExpandValue.toFixed(2)}%`);
    root.style.setProperty("--pc-tweaked-cover-extra-blur", `${coverExtraBlurValue.toFixed(2)}px`);
    root.style.setProperty("--pc-tweaked-cover-brightness", coverBrightnessValue.toFixed(3));
    root.style.setProperty("--pc-tweaked-cover-vignette-opacity", (1 - coverVignetteLiftValue).toFixed(3));
    root.style.setProperty("--pc-tweaked-cover-saturate", coverSaturateValue.toFixed(3));
    root.style.setProperty("--pc-tweaked-cover-contrast", coverContrastValue.toFixed(3));
    root.style.setProperty("--pc-tweaked-beat-bloom", `${(beatGlowValue * 150).toFixed(1)}px`);
    root.style.setProperty("--pc-tweaked-beat-inset-bloom", `${(beatGlowValue * 66).toFixed(1)}px`);
    root.style.setProperty("--pc-tweaked-beat-bg-alpha", (beatGlowValue * 0.035).toFixed(4));
    root.style.setProperty("--pc-tweaked-beat-shadow-alpha", (beatGlowValue * 0.22).toFixed(4));
    root.style.setProperty("--pc-tweaked-beat-inset-alpha", (beatGlowValue * 0.10).toFixed(4));
    scheduleReactiveBlur(115);
  }

  function scheduleReactiveBlur(delay = 115) {
    if (!isCurrent()) return;
    if (reactiveTimer) return;
    reactiveTimer = window.setTimeout(updateReactiveBlur, delay);
  }

  function setActiveModal(modal) {
    if (activeModal === modal) return;
    activeModal = modal;
    handle.setActive(!!modal, { addon: "Tweaked YM Design" });
    applySettings();
    if (modal) scheduleReactiveBlur(20);
  }

  function scan() {
    if (!isCurrent()) return;
    scanTimer = 0;
    setActiveModal(findTweakedFullscreen());
    scheduleScan(activeModal ? 900 : 1300);
  }

  function scheduleScan(delay = 250) {
    if (!isCurrent()) return;
    if (scanTimer) return;
    scanTimer = window.setTimeout(scan, delay);
  }

  ensureStyle();

  handle.subscribeSettings((next) => {
    if (!isCurrent()) return;
    settings = next || {};
    applySettings();
    if (activeModal) scheduleReactiveBlur(20);
  });

  const observer = new MutationObserver(() => {
    if (isCurrent()) scheduleScan(120);
    else observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("resize", () => scheduleScan(120), { passive: true });
  window.addEventListener("pulsecolor:audio", () => {
    if (activeModal && settings.enabled !== false) scheduleReactiveBlur(20);
  });

  scheduleScan(0);
})();
