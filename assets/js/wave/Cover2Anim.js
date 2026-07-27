(() => {
  "use strict";

  const PC = window.PulseColor;
  const U = window.PulseColorRuntimeUtils;
  if (!PC?.visualModes || !U) throw new Error("PulseColor RuntimeCore must be loaded before Cover2Anim");
  if (PC.visualModes.get("cover2Anim")) return;

  // Runtime-owned adaptation of Cover2Anim 0.3.5 by karst3nz.
  const FALLBACK_PALETTE = Object.freeze(Array.from({ length: 6 }, () => Object.freeze([0, 0, 0])));
  const PALETTE_FADE_MS = 800;
  const COLOR_STAGGER = 0.25;
  const MIN_BLOB_COUNT = 16;
  const MAX_BLOB_COUNT = 256;
  const MIN_ORBIT_SPEED = 0.00007;
  const MAX_ORBIT_SPEED = 0.00025;
  const MIN_PULSE_SPEED = 0.00020;
  const MAX_PULSE_SPEED = 0.00045;
  const GLOBAL_ROTATION_SPEED = 0.00001;
  const MUSIC_MOTION_MAX = 2.15;
  const DEFAULT_CANVAS_FILTER = "blur(100px)";

  const vertexSource = `
    precision highp float;
    attribute vec2 a_position;
    uniform vec2 u_resolution;
    uniform mat2 u_rotation;
    uniform vec2 u_blobCenter;
    uniform float u_blobRadius;
    varying vec2 v_localPos;

    void main() {
      v_localPos = a_position;
      vec2 worldPos = u_blobCenter + a_position * u_blobRadius;
      vec2 center = u_resolution * 0.5;
      worldPos = u_rotation * (worldPos - center) + center;
      vec2 clip = (worldPos / max(u_resolution, vec2(1.0))) * 2.0 - 1.0;
      clip.y = -clip.y;
      gl_Position = vec4(clip, 0.0, 1.0);
    }
  `;

  const fragmentSource = `
    precision mediump float;
    varying vec2 v_localPos;
    uniform vec3 u_color;
    uniform vec3 u_prevColor;
    uniform float u_blendT;
    uniform float u_time;
    uniform float u_warp;
    uniform float u_flow;
    uniform float u_saturation;
    uniform float u_highlight;
    uniform float u_beat;

    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    float valueNoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      float a = hash21(i);
      float b = hash21(i + vec2(1.0, 0.0));
      float c = hash21(i + vec2(0.0, 1.0));
      float d = hash21(i + vec2(1.0, 1.0));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    }

    float fbm3(vec2 p) {
      float value = 0.5 * valueNoise(p);
      value += 0.25 * valueNoise(p * 2.0 + vec2(7.3, 1.7));
      value += 0.125 * valueNoise(p * 4.0 + vec2(3.1, 9.4));
      return value;
    }

    void main() {
      vec2 p = v_localPos;
      float distanceFromCenter = length(p);
      if (distanceFromCenter > 1.0) discard;

      float breathe = 0.03 * sin(u_time * 0.6 + distanceFromCenter * 4.0);
      float radial = 1.0 - smoothstep(0.45 + breathe, 1.0, distanceFromCenter);
      float flowTime = u_time * u_flow;
      vec2 domain = vec2(
        fbm3(p * 0.9 + flowTime * 0.13),
        fbm3(p * 0.9 + vec2(3.7, 11.2) + flowTime * 0.17)
      );
      float warped = u_warp > 0.0 ? fbm3(p * 2.0 + u_warp * 2.0 * domain) : 0.5;
      float noiseModulation = 0.5 + 0.8 * warped;
      float beatAccent = clamp(u_beat, 0.0, 1.0) * u_highlight * (0.72 + 0.28 * noiseModulation);
      float alpha = clamp(radial * noiseModulation * (0.72 + beatAccent * 0.08), 0.0, 0.90);
      if (alpha < 0.005) discard;

      float blend = u_blendT * u_blendT * (3.0 - 2.0 * u_blendT);
      vec3 baseColor = mix(u_prevColor, u_color, blend);
      float fresnel = pow(clamp(distanceFromCenter / 0.65, 0.0, 1.0), 2.5);
      vec3 edgeTint = mix(baseColor, vec3(1.0), (0.055 + beatAccent * 0.07) * fresnel);
      float chroma = fresnel * noiseModulation * (0.032 + beatAccent * 0.018);
      vec3 finalColor = edgeTint + vec3(chroma, 0.0, -chroma);
      float centerLight = (u_highlight * 0.06 + beatAccent * 0.34) * (1.0 - distanceFromCenter);
      finalColor = mix(finalColor, min(finalColor + vec3(0.16), vec3(1.0)), centerLight);
      float luminance = dot(finalColor, vec3(0.2126, 0.7152, 0.0722));
      finalColor = mix(vec3(luminance), finalColor, u_saturation);
      finalColor *= 0.70 + beatAccent * 0.27;
      gl_FragColor = vec4(clamp(finalColor, 0.0, 1.0), alpha);
    }
  `;

  const numberOr = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamp01 = (value) => U.clamp(numberOr(value, 0), 0, 1);
  const lerp = (from, to, amount) => from + (to - from) * amount;
  const smoothstep = (value) => {
    const next = clamp01(value);
    return next * next * (3 - 2 * next);
  };
  const smoothSignal = (current, target, dt, attackMs, releaseMs) => {
    const duration = target > current ? attackMs : releaseMs;
    const amount = duration <= 0 ? 1 : 1 - Math.exp(-Math.max(0, dt) / duration);
    return lerp(current, target, amount);
  };
  const normalizeColor = (color, fallback = [0, 0, 0]) => (
    Array.isArray(color) && color.length >= 3
      ? color.slice(0, 3).map((channel, index) => U.clamp(numberOr(channel, fallback[index]), 0, 1))
      : [...fallback]
  );
  const mixColor = (from, to, amount) => from.map((channel, index) => lerp(channel, to[index], amount));
  const toCssColor = (color) => `rgb(${color.map((channel) => Math.round(clamp01(channel) * 255)).join(" ")})`;
  const colorsEqual = (left, right) => left?.length === 3 && right?.length === 3 &&
    left.every((channel, index) => Math.abs(channel - right[index]) < 0.0005);
  const paletteKey = (palette) => palette.map((color) => color.map((channel) => channel.toFixed(4)).join(",")).join("|");
  const transitionProgress = (progress, offset = 0) => {
    const start = clamp01(offset);
    return smoothstep((clamp01(progress) - start) / Math.max(0.0001, 1 - start));
  };
  const displayedBlobColor = (blob) => mixColor(
    blob.color,
    blob.targetColor,
    colorsEqual(blob.color, blob.targetColor) ? 1 : transitionProgress(blob.colorMix, blob.colorOffset)
  );

  const rgbToHsl = (color) => {
    const [red, green, blue] = normalizeColor(color);
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const lightness = (max + min) * 0.5;
    if (max === min) return { h: 0, s: 0, l: lightness };
    const delta = max - min;
    const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    let hue = max === red
      ? (green - blue) / delta + (green < blue ? 6 : 0)
      : max === green
        ? (blue - red) / delta + 2
        : (red - green) / delta + 4;
    hue *= 60;
    return { h: hue, s: saturation, l: lightness };
  };

  const hslToRgb = ({ h, s, l }) => {
    const hue = ((numberOr(h, 0) % 360) + 360) % 360;
    const saturation = clamp01(s);
    const lightness = clamp01(l);
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const intermediate = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
    const offset = lightness - chroma * 0.5;
    let rgb = hue < 60 ? [chroma, intermediate, 0]
      : hue < 120 ? [intermediate, chroma, 0]
        : hue < 180 ? [0, chroma, intermediate]
          : hue < 240 ? [0, intermediate, chroma]
            : hue < 300 ? [intermediate, 0, chroma]
              : [chroma, 0, intermediate];
    return rgb.map((channel) => clamp01(channel + offset));
  };

  const mixHsl = (left, right) => {
    const from = rgbToHsl(left);
    const to = rgbToHsl(right);
    let hue = from.h;
    const delta = to.h - from.h;
    if (delta > 180) hue += 360;
    else if (delta < -180) hue -= 360;
    return hslToRgb({
      h: (hue + to.h) * 0.5,
      s: (from.s + to.s) * 0.5,
      l: (from.l + to.l) * 0.5
    });
  };

  const expandCoverPalette = (palette) => {
    const source = Array.isArray(palette) && palette.length
      ? palette.map((color, index) => normalizeColor(color, FALLBACK_PALETTE[index % FALLBACK_PALETTE.length]))
      : FALLBACK_PALETTE.map((color) => [...color]);
    if (source.length >= 6) return source.slice(0, 6);
    return Array.from({ length: 6 }, (_, index) => {
      const position = index / 5 * Math.max(1, source.length - 1);
      const from = source[Math.floor(position) % source.length];
      const to = source[Math.min(source.length - 1, Math.ceil(position))];
      return mixColor(from, to, position - Math.floor(position));
    });
  };

  const selectPalette = (settings, pulsePalette, coverPalette) => {
    const pulse = expandCoverPalette(pulsePalette);
    const cover = expandCoverPalette(coverPalette);
    if (settings?.colorMode === "original") return cover;
    if (settings?.colorMode === "mixed") {
      return pulse.map((color, index) => mixHsl(color, cover[index % cover.length]));
    }
    return pulse;
  };

  const deriveBackground = (palette) => {
    const source = rgbToHsl(palette?.[0] || FALLBACK_PALETTE[0]);
    const edge = 0.12;
    const saturationScale = Math.min(clamp01(source.l / edge), clamp01((1 - source.l) / edge));
    return hslToRgb({
      h: source.h,
      s: source.s * saturationScale,
      l: clamp01(0.18 * (1 - source.l))
    });
  };

  const effectiveBlobCount = (settings, viewportWidth = window.innerWidth || 1920) => {
    const minimum = Math.round(U.clamp(numberOr(settings?.blobCount, MIN_BLOB_COUNT), MIN_BLOB_COUNT, MAX_BLOB_COUNT));
    const responsive = viewportWidth < 768
      ? minimum
      : Math.max(minimum, Math.min(minimum * 2, Math.floor(viewportWidth / 240)));
    return responsive;
  };

  const createBlobs = (count, palette, width, height, random = Math.random) => {
    const colors = expandCoverPalette(palette);
    const orbitRange = MAX_ORBIT_SPEED - MIN_ORBIT_SPEED;
    const pulseRange = MAX_PULSE_SPEED - MIN_PULSE_SPEED;
    return Array.from({ length: count }, (_, index) => {
      const color = [...colors[index % colors.length]];
      return {
        color,
        targetColor: [...color],
        baseX: random() * Math.max(1, width),
        baseY: random() * Math.max(1, height),
        radius: 280 + random() * 280,
        currentRadius: 350,
        orbitX: 200 + random() * 600,
        orbitY: 200 + random() * 600,
        phaseX: random() * Math.PI * 2,
        phaseY: random() * Math.PI * 2,
        speedX: MIN_ORBIT_SPEED + random() * orbitRange,
        speedY: MIN_ORBIT_SPEED + random() * orbitRange,
        pulsePhase: random() * Math.PI * 2,
        pulseSpeed: MIN_PULSE_SPEED + random() * pulseRange,
        colorMix: 1,
        colorOffset: index / Math.max(1, count) * COLOR_STAGGER
      };
    });
  };

  const rescaleBlobPositions = (items, previousWidth, previousHeight, nextWidth, nextHeight) => {
    if (!(previousWidth > 0) || !(previousHeight > 0)) return;
    const scaleX = nextWidth / previousWidth;
    const scaleY = nextHeight / previousHeight;
    for (const blob of items) {
      blob.baseX = U.clamp(blob.baseX * scaleX, 0, nextWidth);
      blob.baseY = U.clamp(blob.baseY * scaleY, 0, nextHeight);
    }
  };

  const createPass = (host) => {
    const gl = host.gl;
    const program = host.createProgram(vertexSource, fragmentSource);
    const position = gl.getAttribLocation(program, "a_position");
    const location = (name) => gl.getUniformLocation(program, name);
    const uniforms = {
      resolution: location("u_resolution"),
      rotation: location("u_rotation"),
      center: location("u_blobCenter"),
      radius: location("u_blobRadius"),
      color: location("u_color"),
      previousColor: location("u_prevColor"),
      blend: location("u_blendT"),
      time: location("u_time"),
      warp: location("u_warp"),
      flow: location("u_flow"),
      saturation: location("u_saturation"),
      highlight: location("u_highlight"),
      beat: location("u_beat")
    };
    let physicalWidth = 2;
    let physicalHeight = 2;
    let cssWidth = 2;
    let cssHeight = 2;
    let settings = {};
    let blobs = [];
    let palette = FALLBACK_PALETTE.map((color) => [...color]);
    let paletteSignature = "";
    let backgroundColor = deriveBackground(palette);
    let backgroundStartColor = [...backgroundColor];
    let targetBackgroundColor = [...backgroundColor];
    let backgroundMix = 1;
    let backgroundOffset = 0;
    let animationTime = 0;
    let timestamp = 0;
    let paused = false;
    let previousSettings = null;
    let lastBackgroundCss = "";
    let musicEnergy = 0;
    let beatLight = 0;
    let musicHighlight = 0;
    let musicSpeedMultiplier = 0;

    const recreateBlobs = () => {
      const count = effectiveBlobCount(settings, cssWidth);
      blobs = createBlobs(count, palette, cssWidth, cssHeight, Math.random);
    };

    const updatePalette = (nextPalette) => {
      const nextSignature = paletteKey(nextPalette);
      if (nextSignature === paletteSignature) return;
      palette = nextPalette.map((color) => [...color]);
      paletteSignature = nextSignature;
      if (!blobs.length) {
        recreateBlobs();
      } else {
        for (let index = 0; index < blobs.length; index += 1) {
          const blob = blobs[index];
          const nextColor = palette[index % palette.length];
          if (colorsEqual(blob.targetColor, nextColor)) continue;
          blob.color = displayedBlobColor(blob);
          blob.targetColor = [...nextColor];
          blob.colorMix = colorsEqual(blob.color, nextColor) ? 1 : 0;
        }
      }
      const nextBackground = deriveBackground(palette);
      if (!colorsEqual(nextBackground, targetBackgroundColor)) {
        backgroundStartColor = [...backgroundColor];
        targetBackgroundColor = nextBackground;
        backgroundMix = 0;
        backgroundOffset = palette.length > 0 ? (palette.length - 1) / (2 * palette.length) * COLOR_STAGGER : 0;
      }
    };

    const syncSettings = (nextSettings) => {
      settings = nextSettings || {};
      if (!previousSettings) {
        previousSettings = { ...settings };
        return;
      }
      const countChanged = numberOr(settings.blobCount, MIN_BLOB_COUNT) !== numberOr(previousSettings.blobCount, MIN_BLOB_COUNT);
      if (countChanged) recreateBlobs();
      previousSettings = { ...settings };
    };

    const updateMusicReaction = (frame, dt) => {
      const audio = frame || {};
      const isReactive = !paused && audio.active !== false;
      const energyTarget = isReactive
        ? clamp01(clamp01(audio.energy) * 0.68 + clamp01(audio.motion) * 0.22 + clamp01(audio.heavy) * 0.10)
        : 0;
      const beatTarget = isReactive
        ? clamp01(clamp01(audio.transient) * 0.58 + clamp01(audio.kick) * 0.30 + clamp01(audio.rise) * 0.12)
        : 0;
      musicEnergy = smoothSignal(musicEnergy, energyTarget, dt, 135, 650);
      beatLight = smoothSignal(beatLight, beatTarget, dt, 24, 230);
      const highlightTarget = isReactive ? clamp01(energyTarget * 0.34 + beatTarget * 0.66) : 0;
      musicHighlight = smoothSignal(musicHighlight, highlightTarget, dt, 42, 340);
      const motionTarget = isReactive ? smoothstep(musicEnergy) * MUSIC_MOTION_MAX : 0;
      musicSpeedMultiplier = smoothSignal(musicSpeedMultiplier, motionTarget, dt, 150, 700);
    };

    const updateMotion = (dt) => {
      const motionDt = paused ? 0 : dt * musicSpeedMultiplier;
      animationTime += motionDt;
      const musicBlendRate = 0.72 + musicEnergy * 0.78 + beatLight * 0.25;
      const blobFadeMs = PALETTE_FADE_MS / musicBlendRate;
      for (const blob of blobs) {
        blob.baseX = U.clamp(blob.baseX, 0, cssWidth);
        blob.baseY = U.clamp(blob.baseY, 0, cssHeight);
        blob.phaseX += motionDt * blob.speedX;
        blob.phaseY += motionDt * blob.speedY;
        blob.pulsePhase += motionDt * blob.pulseSpeed;
        blob.currentRadius = blob.radius + Math.sin(blob.pulsePhase) * 90;
        if (!colorsEqual(blob.color, blob.targetColor)) {
          blob.colorMix = Math.min(1, blob.colorMix + dt / blobFadeMs);
          if (blob.colorMix >= 1) blob.color = [...blob.targetColor];
        }
      }
      if (!colorsEqual(backgroundColor, targetBackgroundColor)) {
        backgroundMix = Math.min(1, backgroundMix + dt / PALETTE_FADE_MS);
        const progress = transitionProgress(backgroundMix, backgroundOffset);
        backgroundColor = mixColor(backgroundStartColor, targetBackgroundColor, progress);
        if (backgroundMix >= 1) backgroundColor = [...targetBackgroundColor];
      }
    };

    return {
      resourceCounts: Object.freeze({ programs: 1, textures: 0, framebuffers: 0 }),
      resize(nextWidth, nextHeight, viewport = {}) {
        physicalWidth = Math.max(2, numberOr(nextWidth, 2));
        physicalHeight = Math.max(2, numberOr(nextHeight, 2));
        const previousWidth = cssWidth;
        const previousHeight = cssHeight;
        cssWidth = Math.max(2, numberOr(viewport.cssWidth, physicalWidth));
        cssHeight = Math.max(2, numberOr(viewport.cssHeight, physicalHeight));
        if (!blobs.length) return;
        if (effectiveBlobCount(settings, previousWidth) !== effectiveBlobCount(settings, cssWidth)) recreateBlobs();
        else rescaleBlobPositions(blobs, previousWidth, previousHeight, cssWidth, cssHeight);
      },
      update(context) {
        syncSettings(context.settings);
        timestamp = numberOr(context.timestamp, timestamp);
        const dt = U.clamp(numberOr(context.dt, 16), 0, 100);
        const nextPaused = context.playback ? context.playback.paused === true : context.frame?.active === false;
        paused = nextPaused;
        updateMusicReaction(context.frame, dt);
        updatePalette(selectPalette(settings, context.pulsePalette, context.coverPalette));
        if (!blobs.length) recreateBlobs();
        updateMotion(dt);
        const backgroundCss = toCssColor(backgroundColor);
        if (backgroundCss !== lastBackgroundCss) {
          lastBackgroundCss = backgroundCss;
          host.root?.style?.setProperty?.("background-color", backgroundCss);
        }
      },
      render() {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, physicalWidth, physicalHeight);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, host.quadBuffer);
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        gl.uniform2f(uniforms.resolution, cssWidth, cssHeight);
        gl.uniform1f(uniforms.time, animationTime / 1000);
        gl.uniform1f(uniforms.warp, U.clamp(numberOr(settings.warp, 0.14), 0, 1));
        gl.uniform1f(uniforms.flow, U.clamp(numberOr(settings.flow, 0.53), 0, 1));
        gl.uniform1f(uniforms.saturation, U.clamp(numberOr(settings.saturation, 1.5), 0.8, 1.5));
        gl.uniform1f(uniforms.highlight, musicHighlight);
        gl.uniform1f(uniforms.beat, beatLight);
        const angle = animationTime * GLOBAL_ROTATION_SPEED;
        const cosine = Math.cos(angle);
        const sine = Math.sin(angle);
        gl.uniformMatrix2fv(uniforms.rotation, false, new Float32Array([cosine, sine, -sine, cosine]));
        for (const blob of blobs) {
          gl.uniform2f(
            uniforms.center,
            blob.baseX + Math.sin(blob.phaseX) * blob.orbitX,
            blob.baseY + Math.cos(blob.phaseY) * blob.orbitY
          );
          gl.uniform1f(uniforms.radius, blob.currentRadius);
          const blend = colorsEqual(blob.color, blob.targetColor)
            ? 1
            : transitionProgress(blob.colorMix, blob.colorOffset);
          gl.uniform3f(uniforms.previousColor, blob.color[0], blob.color[1], blob.color[2]);
          gl.uniform3f(uniforms.color, blob.targetColor[0], blob.targetColor[1], blob.targetColor[2]);
          gl.uniform1f(uniforms.blend, blend);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
      },
      getCanvasFilter: () => DEFAULT_CANVAS_FILTER,
      dispose() {
        host.root?.style?.removeProperty?.("background-color");
        lastBackgroundCss = "";
        gl.deleteProgram(program);
      },
      inspect: () => ({
        blobCount: blobs.length,
        effectiveBlobSpeed: musicSpeedMultiplier,
        musicEnergy,
        musicSpeedMultiplier,
        beatLight,
        musicHighlight,
        paused,
        backgroundColor: [...backgroundColor],
        physicalWidth,
        physicalHeight,
        cssWidth,
        cssHeight
      })
    };
  };

  PC.visualModes.register("cover2Anim", Object.freeze({
    id: "cover2Anim",
    version: 3,
    createPass,
    testing: Object.freeze({
      createBlobs,
      effectiveBlobCount,
      expandCoverPalette,
      selectPalette,
      deriveBackground,
      transitionProgress,
      displayedBlobColor,
      rescaleBlobPositions
    })
  }));
})();
