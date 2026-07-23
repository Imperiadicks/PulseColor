(() => {
  "use strict";

  const PC = window.PulseColor;
  const U = window.PulseColorRuntimeUtils;
  if (!PC?.visualModes || !PC.dom || !PC.settings || !U) {
    throw new Error("PulseColor RuntimeCore must be loaded before TweakedYMDesign");
  }
  if (PC.visualModes.get("tweakedYmDesign")) return;

  // Runtime-owned adaptation of Tweaked YM Design 1.0.0 by nelifs.
  const LYRICS_LINE_SELECTOR = '[data-test-id="SYNC_LYRICS_LINE"]';
  const LYRICS_DISTANCE_ATTRIBUTE = "data-pulsecolor-lyrics-distance";
  const MAX_BLURRED_LINE_DISTANCE = 8;
  const BACKGROUND_MAX_DIMENSION = 96;
  const reducedMotionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)") || null;
  const trackedLyrics = new Set();
  let settings = PC.settings.get();
  let domSnapshot = PC.dom.getSnapshot();
  let removeDom = null;
  let removeSettings = null;
  let serviceRunning = false;
  let lastLyricsContainer = null;
  let lastActiveIndex = -1;
  let lastLineCount = 0;

  const numberOr = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
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
      "--pulsecolor-lyrics-transition",
      `${U.clamp(numberOr(tweaked.lyricsTransitionMs, 250), 0, 1200)}ms`
    );
    document.documentElement.classList.toggle("pulsecolor-tweaked-enabled", enabled);
    document.documentElement.classList.toggle("pulsecolor-tweaked-vibe", enabled);
    domSnapshot.fullscreen?.classList.toggle("pulsecolor-tweaked-fullscreen", enabled);
    applyLyrics(forceLyrics);
  };

  const startService = () => {
    if (serviceRunning) return;
    serviceRunning = true;
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
    domSnapshot.fullscreen?.classList.remove("pulsecolor-tweaked-fullscreen");
    document.documentElement.classList.remove("pulsecolor-tweaked-enabled", "pulsecolor-tweaked-vibe");
    document.documentElement.style.removeProperty("--pulsecolor-lyrics-transition");
  };

  const vertexSource = `
    precision highp float;
    attribute vec2 a_position;
    varying vec2 v_uv;
    void main() {
      v_uv = a_position * 0.5 + 0.5;
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  const blurFragmentSource = `
    precision highp float;
    varying vec2 v_uv;
    uniform sampler2D u_current;
    uniform sampler2D u_next;
    uniform float u_mix;
    uniform vec2 u_direction;
    uniform float u_viewAspect;
    uniform float u_currentAspect;
    uniform float u_nextAspect;
    uniform vec2 u_currentDrift;
    uniform vec2 u_nextDrift;
    uniform float u_currentZoom;
    uniform float u_nextZoom;

    vec2 coverUv(vec2 uv, float imageAspect, vec2 drift, float zoom) {
      vec2 point = uv - 0.5;
      if (imageAspect > u_viewAspect) point.x *= u_viewAspect / max(0.001, imageAspect);
      else point.y *= imageAspect / max(0.001, u_viewAspect);
      point = point / max(1.0, zoom) - drift;
      return clamp(point + 0.5, vec2(0.0), vec2(1.0));
    }

    vec3 sourceAt(vec2 uv) {
      vec3 currentColor = texture2D(u_current, coverUv(uv, u_currentAspect, u_currentDrift, u_currentZoom)).rgb;
      vec3 nextColor = texture2D(u_next, coverUv(uv, u_nextAspect, u_nextDrift, u_nextZoom)).rgb;
      return mix(currentColor, nextColor, u_mix);
    }

    void main() {
      vec3 color = sourceAt(v_uv) * 0.227027;
      color += sourceAt(v_uv + u_direction * 1.384615) * 0.316216;
      color += sourceAt(v_uv - u_direction * 1.384615) * 0.316216;
      color += sourceAt(v_uv + u_direction * 3.230769) * 0.070270;
      color += sourceAt(v_uv - u_direction * 3.230769) * 0.070270;
      gl_FragColor = vec4(color, 1.0);
    }
  `;

  const compositeFragmentSource = `
    precision highp float;
    varying vec2 v_uv;
    uniform sampler2D u_blurred;
    uniform float u_saturation;
    uniform float u_overlay;
    uniform float u_alpha;

    vec3 applySaturation(vec3 color, float amount) {
      float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
      return mix(vec3(luminance), color, amount);
    }

    void main() {
      vec3 color = applySaturation(texture2D(u_blurred, v_uv).rgb, u_saturation);
      float top = 1.0 - v_uv.y;
      float vertical = top < 0.55
        ? mix(u_overlay * 0.35, u_overlay, top / 0.55)
        : mix(u_overlay, min(1.0, u_overlay * 1.1), (top - 0.55) / 0.45);
      vec2 ellipse = (v_uv - vec2(0.5, 0.45)) / vec2(0.425, 0.35);
      float radial = smoothstep(0.0, 1.0, length(ellipse)) * 0.55;
      float darkness = 1.0 - (1.0 - radial) * (1.0 - vertical);
      color *= 1.0 - clamp(darkness, 0.0, 0.95);
      gl_FragColor = vec4(color, u_alpha);
    }
  `;

  const motionState = (timestamp, durationSeconds, variant) => {
    const duration = Math.max(4, numberOr(durationSeconds, 26));
    const cycle = ((timestamp / 1000 / duration) % 2 + 2) % 2;
    const progress = cycle <= 1 ? cycle : 2 - cycle;
    const eased = 0.5 - Math.cos(progress * Math.PI) * 0.5;
    if (variant === "b") {
      return {
        drift: [(-0.01 + 0.02 * eased), (0.005 - 0.02 * eased)],
        zoom: 1.13 + 0.05 * eased
      };
    }
    return {
      drift: [0.015 * eased, -0.01 * eased],
      zoom: 1.12 + 0.05 * eased
    };
  };

  const createPass = (host) => {
    const gl = host.gl;
    const blurProgram = host.createProgram(vertexSource, blurFragmentSource);
    const compositeProgram = host.createProgram(vertexSource, compositeFragmentSource);
    const textures = [gl.createTexture(), gl.createTexture()];
    const framebuffers = [gl.createFramebuffer(), gl.createFramebuffer()];
    const blurPosition = gl.getAttribLocation(blurProgram, "a_position");
    const compositePosition = gl.getAttribLocation(compositeProgram, "a_position");
    const location = (program, name) => gl.getUniformLocation(program, name);
    const blurUniforms = {
      current: location(blurProgram, "u_current"),
      next: location(blurProgram, "u_next"),
      mix: location(blurProgram, "u_mix"),
      direction: location(blurProgram, "u_direction"),
      viewAspect: location(blurProgram, "u_viewAspect"),
      currentAspect: location(blurProgram, "u_currentAspect"),
      nextAspect: location(blurProgram, "u_nextAspect"),
      currentDrift: location(blurProgram, "u_currentDrift"),
      nextDrift: location(blurProgram, "u_nextDrift"),
      currentZoom: location(blurProgram, "u_currentZoom"),
      nextZoom: location(blurProgram, "u_nextZoom")
    };
    const compositeUniforms = {
      blurred: location(compositeProgram, "u_blurred"),
      saturation: location(compositeProgram, "u_saturation"),
      overlay: location(compositeProgram, "u_overlay"),
      alpha: location(compositeProgram, "u_alpha")
    };
    let width = 2;
    let height = 2;
    let targetWidth = 2;
    let targetHeight = 2;
    let context = null;
    let activeVariant = "a";
    let currentTextureReference = null;
    let motionElapsed = 0;

    const configureTarget = (index) => {
      gl.bindTexture(gl.TEXTURE_2D, textures[index]);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, targetWidth, targetHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers[index]);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, textures[index], 0);
    };

    const syncTargets = () => {
      const scale = Math.min(1, BACKGROUND_MAX_DIMENSION / Math.max(width, height));
      const nextWidth = Math.max(2, Math.round(width * scale));
      const nextHeight = Math.max(2, Math.round(height * scale));
      if (nextWidth === targetWidth && nextHeight === targetHeight) return;
      targetWidth = nextWidth;
      targetHeight = nextHeight;
      configureTarget(0);
      configureTarget(1);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };

    const bindQuad = (program, attribute) => {
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, host.quadBuffer);
      gl.enableVertexAttribArray(attribute);
      gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
    };

    const bindTexture = (texture, unit, uniform) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(uniform, unit);
    };

    return {
      resourceCounts: Object.freeze({ programs: 2, textures: 2, framebuffers: 2 }),
      resize(nextWidth, nextHeight) {
        width = Math.max(2, numberOr(nextWidth, 2));
        height = Math.max(2, numberOr(nextHeight, 2));
        syncTargets();
      },
      update(nextContext) {
        context = nextContext;
        motionElapsed += U.clamp(numberOr(nextContext?.dt, 0), 0, 100);
        syncTargets();
      },
      render(textureState) {
        if (!context || context.settings?.coverBackground === false) return;
        const hasCurrent = textureState.textureReady === true;
        const hasNext = textureState.nextTextureReady === true;
        if (!hasCurrent && !hasNext) return;
        if (hasCurrent && currentTextureReference && currentTextureReference !== textureState.currentTexture) {
          activeVariant = activeVariant === "a" ? "b" : "a";
        }
        if (hasCurrent) currentTextureReference = textureState.currentTexture;

        const motionEnabled = context.settings.coverMotion !== false && reducedMotionQuery?.matches !== true;
        const currentMotion = motionEnabled
          ? motionState(motionElapsed, context.settings.coverMotionDuration, activeVariant)
          : { drift: [0, 0], zoom: activeVariant === "a" ? 1.12 : 1.13 };
        const nextVariant = activeVariant === "a" ? "b" : "a";
        const nextMotion = motionEnabled
          ? motionState(motionElapsed, context.settings.coverMotionDuration, nextVariant)
          : { drift: [0, 0], zoom: nextVariant === "a" ? 1.12 : 1.13 };
        const mix = hasNext ? U.clamp(numberOr(textureState.textureMix, 0), 0, 1) : 0;
        const currentTexture = hasCurrent ? textureState.currentTexture : textureState.nextTexture;
        const nextTexture = hasNext ? textureState.nextTexture : currentTexture;
        const currentAspect = hasCurrent
          ? numberOr(textureState.currentTextureAspect, 1)
          : numberOr(textureState.nextTextureAspect, 1);
        const nextAspect = hasNext ? numberOr(textureState.nextTextureAspect, currentAspect) : currentAspect;
        const configuredBlur = U.clamp(numberOr(context.settings.coverBlur, 28), 0, 36);
        const sourceBlur = Math.min(18, Math.round(configuredBlur * 0.3));

        gl.disable(gl.BLEND);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers[0]);
        gl.viewport(0, 0, targetWidth, targetHeight);
        bindQuad(blurProgram, blurPosition);
        bindTexture(currentTexture, 0, blurUniforms.current);
        bindTexture(nextTexture, 1, blurUniforms.next);
        gl.uniform1f(blurUniforms.mix, mix);
        gl.uniform1f(blurUniforms.viewAspect, width / Math.max(1, height));
        gl.uniform1f(blurUniforms.currentAspect, currentAspect);
        gl.uniform1f(blurUniforms.nextAspect, nextAspect);
        gl.uniform2f(blurUniforms.currentDrift, currentMotion.drift[0], currentMotion.drift[1]);
        gl.uniform2f(blurUniforms.nextDrift, nextMotion.drift[0], nextMotion.drift[1]);
        gl.uniform1f(blurUniforms.currentZoom, currentMotion.zoom);
        gl.uniform1f(blurUniforms.nextZoom, nextMotion.zoom);
        gl.uniform2f(blurUniforms.direction, sourceBlur / Math.max(1, targetWidth), 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers[1]);
        gl.viewport(0, 0, targetWidth, targetHeight);
        bindQuad(blurProgram, blurPosition);
        bindTexture(textures[0], 0, blurUniforms.current);
        bindTexture(textures[0], 1, blurUniforms.next);
        gl.uniform1f(blurUniforms.mix, 0);
        gl.uniform1f(blurUniforms.currentAspect, width / Math.max(1, height));
        gl.uniform1f(blurUniforms.nextAspect, width / Math.max(1, height));
        gl.uniform2f(blurUniforms.currentDrift, 0, 0);
        gl.uniform2f(blurUniforms.nextDrift, 0, 0);
        gl.uniform1f(blurUniforms.currentZoom, 1);
        gl.uniform1f(blurUniforms.nextZoom, 1);
        gl.uniform2f(blurUniforms.direction, 0, sourceBlur / Math.max(1, targetHeight));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, width, height);
        bindQuad(compositeProgram, compositePosition);
        bindTexture(textures[1], 0, compositeUniforms.blurred);
        gl.uniform1f(compositeUniforms.saturation, U.clamp(numberOr(context.settings.coverSaturate, 1.2), 0.5, 2.5));
        gl.uniform1f(compositeUniforms.overlay, U.clamp(numberOr(context.settings.coverOverlay, 0.55), 0, 0.9));
        gl.uniform1f(compositeUniforms.alpha, hasCurrent ? 1 : mix);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      },
      getCanvasFilter: () => "",
      dispose() {
        for (const framebuffer of framebuffers) gl.deleteFramebuffer(framebuffer);
        for (const texture of textures) gl.deleteTexture(texture);
        gl.deleteProgram(blurProgram);
        gl.deleteProgram(compositeProgram);
      },
      inspect: () => ({
        targetWidth,
        targetHeight,
        activeVariant,
        hasContext: !!context
      })
    };
  };

  const definition = Object.freeze({
    id: "tweakedYmDesign",
    version: 2,
    createPass,
    testing: Object.freeze({ activeLineIndex, lineStyle, motionState, applyLyrics, clearLyrics })
  });

  PC.visualModes.register("tweakedYmDesign", definition);
  PC.design = Object.freeze({ version: 4, refresh: applyDomDesign, stop: stopService });
  if (typeof PC.runtime.registerService === "function") {
    PC.runtime.registerService("tweaked-ym-design", { start: startService, stop: stopService });
  } else {
    startService();
  }
})();
