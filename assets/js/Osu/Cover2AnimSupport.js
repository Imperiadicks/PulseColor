(() => {
  "use strict";

  if (window.__PULSECOLOR_COVER2ANIM_SUPPORT__) return;
  window.__PULSECOLOR_COVER2ANIM_SUPPORT__ = true;

  const coordinator = window.PulseColorAddonSupport;
  if (!coordinator?.register) return;

  const FULLSCREEN_SELECTOR = '[data-test-id="FULLSCREEN_PLAYER_MODAL"]';
  const CANVAS_SELECTOR = ".c2a-canvas-bg";
  const BG_SELECTOR = ".c2a-bg-div";
  const ACTIVE_SELECTOR = ".canvas-mode, .c2a-canvas-bg, .c2a-bg-div";
  const handle = coordinator.register("cover2Anim", { name: "Cover2Anim" });

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const baseStyles = new WeakMap();
  const trackedElements = new Set();

  let settings = handle.getSettings();
  let active = false;
  let modal = null;
  let canvas = null;
  let bgDiv = null;
  let scanTimer = 0;
  let rafId = 0;
  let frameTimer = 0;
  let lastFrameAt = 0;
  let visual = 0;
  let beatPulse = 0;
  let fastEnergy = 0;
  let slowEnergy = 0.12;
  let prevKick = 0;

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

  function readTarget() {
    if (settings.enabled === false) return null;

    const nextModal = document.querySelector(FULLSCREEN_SELECTOR);
    if (!isVisible(nextModal)) return null;
    if (!nextModal.matches(ACTIVE_SELECTOR) && !nextModal.querySelector(ACTIVE_SELECTOR)) return null;

    return {
      modal: nextModal,
      canvas: nextModal.querySelector(CANVAS_SELECTOR),
      bgDiv: nextModal.querySelector(BG_SELECTOR)
    };
  }

  function rememberBase(el) {
    if (!el || baseStyles.has(el)) return;
    baseStyles.set(el, {
      filter: el.style.filter || "",
      opacity: el.style.opacity || "",
      transform: el.style.transform || "",
      transformOrigin: el.style.transformOrigin || "",
      transition: el.style.transition || "",
      willChange: el.style.willChange || ""
    });
    trackedElements.add(el);
  }

  function resetElement(el) {
    if (!el || !baseStyles.has(el)) return;
    const base = baseStyles.get(el);
    el.style.filter = base.filter;
    el.style.opacity = base.opacity;
    el.style.transform = base.transform;
    el.style.transformOrigin = base.transformOrigin;
    el.style.transition = base.transition;
    el.style.willChange = base.willChange;
    baseStyles.delete(el);
    trackedElements.delete(el);
  }

  function resetVisuals() {
    Array.from(trackedElements).forEach(resetElement);
    visual = 0;
    beatPulse = 0;
    fastEnergy = 0;
    slowEnergy = 0.12;
    prevKick = 0;
  }

  function stopFrameLoop() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    if (frameTimer) {
      clearTimeout(frameTimer);
      frameTimer = 0;
    }
    lastFrameAt = 0;
  }

  function scheduleFrame(delay = 0) {
    if (rafId || frameTimer || !active || settings.musicReactive === false) return;

    if (delay > 0) {
      frameTimer = window.setTimeout(() => {
        frameTimer = 0;
        rafId = requestAnimationFrame(frame);
      }, delay);
      return;
    }

    rafId = requestAnimationFrame(frame);
  }

  function getAudioState() {
    try {
      return window.PulseColorAudio?.getState?.() || null;
    } catch {
      return null;
    }
  }

  function updateEnvelope(audio, dt) {
    if (!audio?.active) {
      fastEnergy *= 0.86;
      slowEnergy += (0.12 - slowEnergy) * 0.035;
      beatPulse *= Math.exp(-dt / 180);
      prevKick *= 0.82;
      return 0;
    }

    const energy = clamp(
      Number(audio.energy || 0) * 0.72 +
      Number(audio.heavy || 0) * 0.22 +
      Number(audio.voice || 0) * 0.10,
      0,
      1
    );
    const kick = clamp(Number(audio.kick || audio.bass || 0), 0, 1);
    const rise = clamp(Number(audio.rise || 0), 0, 1);
    const flux = clamp(Number(audio.flux || 0), 0, 1);
    const kickDelta = Math.max(0, kick - prevKick * 0.82);

    fastEnergy += (energy - fastEnergy) * (energy > fastEnergy ? 0.34 : 0.12);
    slowEnergy += (energy - slowEnergy) * 0.018;

    const relativeLift = clamp((fastEnergy - slowEnergy * 0.72) * 3.9, 0, 1);
    const beatHit = audio.beat ? 0.55 : 0;
    const beatTarget = clamp(kick * 0.74 + kickDelta * 2.15 + rise * 0.65 + flux * 0.30 + beatHit, 0, 1);
    const beatDecay = Math.exp(-dt / (settings.efficientMode ? 260 : 155));

    beatPulse = Math.max(beatPulse * beatDecay, beatTarget);
    prevKick = kick;

    return clamp(relativeLift * 0.28 + beatPulse * 0.82, 0, 1);
  }

  function applyVisual(now) {
    if (!canvas && !bgDiv) return;

    const efficient = settings.efficientMode === true;
    const reactionStrength = clamp(Number(settings.reactionStrength ?? 0.25), 0, 0.8);
    const beatStrength = clamp(Number(settings.beatStrength ?? 0.16), 0, 0.7);
    const dt = lastFrameAt ? Math.min(80, Math.max(8, now - lastFrameAt)) : 16;
    const target = updateEnvelope(getAudioState(), dt);
    const up = efficient ? 0.20 : 0.42;
    const down = efficient ? 0.065 : 0.13;

    visual += (target - visual) * (target > visual ? up : down);

    const pulse = clamp(visual * (0.014 + reactionStrength * 0.085) + beatPulse * beatStrength * 0.095, 0, 0.085);
    const canvasScale = 1 + pulse;
    const bgScale = 1 + pulse * 0.42;
    const brightness = 1 + clamp(visual * reactionStrength * 0.22 + beatPulse * beatStrength * 0.34, 0, 0.28);
    const saturate = 1 + clamp(visual * reactionStrength * 0.28 + beatPulse * beatStrength * 0.26, 0, 0.34);
    const contrast = 1 + clamp(visual * reactionStrength * 0.10 + beatPulse * beatStrength * 0.08, 0, 0.12);
    const transition = efficient
      ? "transform 190ms cubic-bezier(.22,1,.36,1), opacity 210ms ease, filter 190ms ease"
      : "transform 75ms linear, opacity 95ms linear, filter 75ms linear";

    if (canvas) {
      rememberBase(canvas);
      const base = baseStyles.get(canvas);
      const baseFilter = String(base?.filter || "").trim();
      const dynamicFilter = `brightness(${brightness.toFixed(3)}) saturate(${saturate.toFixed(3)}) contrast(${contrast.toFixed(3)})`;

      canvas.style.transformOrigin = "50% 50%";
      canvas.style.willChange = "transform, opacity, filter";
      canvas.style.transition = transition;
      canvas.style.transform = `translateZ(0) scale(${canvasScale.toFixed(4)})`;
      canvas.style.opacity = String(clamp(0.92 + visual * 0.055 + beatPulse * 0.035, 0.88, 1));
      canvas.style.filter = baseFilter ? `${baseFilter} ${dynamicFilter}` : dynamicFilter;
    }

    if (bgDiv) {
      rememberBase(bgDiv);
      bgDiv.style.transformOrigin = "50% 50%";
      bgDiv.style.willChange = "transform, opacity";
      bgDiv.style.transition = transition;
      bgDiv.style.transform = `translateZ(0) scale(${bgScale.toFixed(4)})`;
      bgDiv.style.opacity = String(clamp(0.96 + visual * 0.035 + beatPulse * 0.02, 0.9, 1));
    }
  }

  function frame(now) {
    rafId = 0;
    if (!active || settings.musicReactive === false) return;

    applyVisual(now);
    lastFrameAt = now;

    if (settings.efficientMode === true) {
      scheduleFrame(110);
    } else {
      scheduleFrame(0);
    }
  }

  function syncFrameLoop() {
    if (!active || settings.musicReactive === false || (!canvas && !bgDiv)) {
      stopFrameLoop();
      resetVisuals();
      return;
    }
    scheduleFrame(0);
  }

  function setActive(next) {
    const value = !!next;
    if (active === value) return;
    active = value;
    handle.setActive(value, { addon: "Cover2Anim" });
    syncFrameLoop();
  }

  function setTarget(target) {
    const nextModal = target?.modal || null;
    const nextCanvas = target?.canvas || null;
    const nextBgDiv = target?.bgDiv || null;
    const changed = nextModal !== modal || nextCanvas !== canvas || nextBgDiv !== bgDiv;

    if (changed) {
      resetVisuals();
      modal = nextModal;
      canvas = nextCanvas;
      bgDiv = nextBgDiv;
    }

    setActive(!!target);
    if (changed || active) syncFrameLoop();
  }

  function scan() {
    scanTimer = 0;
    setTarget(readTarget());
    scheduleScan(active ? 650 : 1200);
  }

  function scheduleScan(delay = 200) {
    if (scanTimer) return;
    scanTimer = window.setTimeout(scan, delay);
  }

  handle.subscribeSettings((next) => {
    settings = next || {};
    scheduleScan(0);
    syncFrameLoop();
  });

  const observer = new MutationObserver(() => scheduleScan(active ? 220 : 140));
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("resize", () => scheduleScan(160), { passive: true });
  window.addEventListener("beforeunload", () => {
    stopFrameLoop();
    resetVisuals();
    handle.setActive(false, { addon: "Cover2Anim" });
  });

  scheduleScan(0);
})();
