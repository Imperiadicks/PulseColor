(() => {
  "use strict";

  const PC = window.PulseColor;
  const U = window.PulseColorRuntimeUtils;
  const presets = window.PulseColorWaveVariants;
  if (!PC?.runtime || !PC.audio || !presets) throw new Error("PulseColor audio and presets must be loaded before WebGLRuntime");
  if (PC.engine?.version >= 2) return;

  const counters = PC.diagnostics.counters;
  const ROOT_ID = "osu-pulse";
  const CANVAS_CLASS = "pulsecolor-webgl-canvas";
  const bitmapCache = new Map();
  const pendingBitmapLoads = new Map();
  const BITMAP_CACHE_LIMIT = 12;
  const COVER2ANIM_PALETTE_FADE_MS = 800;

  let root = null;
  let canvas = null;
  let gl = null;
  let program = null;
  let quadBuffer = null;
  let uniforms = null;
  let attributes = null;
  let currentTexture = null;
  let nextTexture = null;
  let currentTextureAspect = 1;
  let nextTextureAspect = 1;
  let textureReady = false;
  let nextTextureReady = false;
  let textureTransitionAt = 0;
  let textureRequest = 0;
  let removeFrame = null;
  let removeSettings = null;
  let removeDom = null;
  let removeTrack = null;
  let resizeObserver = null;
  let eventCanvas = null;
  let resizePending = true;
  let contextLost = false;
  let lastDrawAt = 0;
  let lastColorAt = 0;
  let lastObservedCoverKey = "";
  let colorA = [0.74, 0.50, 0.96];
  let colorB = [0.34, 0.62, 1.00];
  let themePalette = [colorA, colorB];
  let currentCoverPalette = null;
  let nextCoverPalette = null;
  let activeVisualPass = null;
  let activeVisualModeId = "";
  let fullscreen = null;
  let blockRects = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  let settings = PC.settings.get();
  let serviceRunning = false;
  let audioRetained = false;
  const waveMotion = presets.createMotionState?.() || { pulse: 0, impact: 0, flow: 0, activity: 0 };
  let lastWaveMotionAt = 0;
  const numberOr = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const mixColor = (from, to, amount) => from.map((channel, index) => channel + (to[index] - channel) * amount);

  const vertexSource = `
    attribute vec2 a_position;
    varying vec2 v_uv;
    void main() {
      v_uv = a_position * 0.5 + 0.5;
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  const fragmentSource = `
    precision highp float;
    varying vec2 v_uv;

    uniform vec2 u_resolution;
    uniform float u_time;
    uniform float u_energy;
    uniform float u_bass;
    uniform float u_mids;
    uniform float u_treble;
    uniform float u_transient;
    uniform float u_phase;
    uniform float u_wavePulse;
    uniform float u_waveImpact;
    uniform float u_waveFlow;
    uniform float u_waveActivity;
    uniform float u_waveSpeed;
    uniform float u_waveLobesA;
    uniform float u_waveLobesB;
    uniform float u_waveRingTravel;
    uniform float u_waveFillLift;
    uniform float u_radius;
    uniform float u_ringWidth;
    uniform float u_innerFill;
    uniform float u_waveStrength;
    uniform float u_rippleStrength;
    uniform float u_noiseStrength;
    uniform float u_motionStrength;
    uniform float u_brightness;
    uniform float u_alpha;
    uniform float u_ringCount;
    uniform float u_waveStyle;
    uniform float u_waveEnabled;
    uniform float u_blockGlow;
    uniform vec4 u_blockRect0;
    uniform vec4 u_blockRect1;
    uniform vec4 u_blockRect2;
    uniform vec4 u_blockRect3;
    uniform vec3 u_colorA;
    uniform vec3 u_colorB;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                 mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }

    float roundedRectGlow(vec2 uv, vec4 rect) {
      if (rect.z <= 0.0 || rect.w <= 0.0) return 0.0;
      vec2 p = (uv - rect.xy) * u_resolution;
      vec2 halfSize = rect.zw * u_resolution * 0.5;
      float radius = min(24.0, min(halfSize.x, halfSize.y) * 0.28);
      vec2 q = abs(p) - halfSize + radius;
      float dist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
      return exp(-abs(dist) / 16.0) + exp(-max(dist, 0.0) / 46.0) * 0.35;
    }

    void main() {
      vec2 uv = v_uv;
      vec3 outputColor = vec3(0.0);
      float outputAlpha = 0.0;

      if (u_waveEnabled > 0.5) {
        float aspect = u_resolution.x / max(1.0, u_resolution.y);
        float activity = clamp(u_waveActivity, 0.0, 1.0);
        float pulse = clamp(u_wavePulse, 0.0, 0.55);
        float impact = clamp(u_waveImpact, 0.0, 1.0);
        float flow = clamp(u_waveFlow, 0.0, 1.0);
        float speed = max(0.05, u_waveSpeed);
        float phaseDrive = u_phase * 6.2831853;
        vec2 motion = vec2(
          sin(u_time * speed * 0.73 + flow * 2.4 + phaseDrive * 0.16) + sin(u_time * speed * 0.31 + 1.7) * 0.34,
          cos(u_time * speed * 0.61 + flow * 1.8 - phaseDrive * 0.12) + cos(u_time * speed * 0.27 + 0.8) * 0.30
        );
        motion *= u_motionStrength * activity * (0.16 + flow * 0.84 + impact * 0.42);
        vec2 p = uv - 0.5 - motion;
        p.x *= aspect;
        float angle = atan(p.y, p.x);
        float radius = length(p);
        float audioRadius = u_radius * (1.0 + pulse + impact * 0.025);
        if (u_waveStyle > 0.5) {
          vec2 polarPoint = vec2(cos(angle), sin(angle));
          float organicNoise = noise(polarPoint * 2.35 + vec2(u_time * speed * 0.055, -u_time * speed * 0.042));
          float lowWave = sin(angle * u_waveLobesA - u_time * speed * 0.46 + flow * 1.75 + phaseDrive * 0.08);
          float fineWave = sin(angle * u_waveLobesB + u_time * speed * 0.31 - flow * 1.10 - phaseDrive * 0.05);
          float deformation = lowWave * u_waveStrength * 0.19 + fineWave * u_rippleStrength * 0.13;
          deformation += (organicNoise - 0.5) * u_noiseStrength * 0.72;
          deformation *= activity * (0.18 + flow * 0.72 + impact * 0.18);
          deformation = clamp(deformation, -u_radius * 0.12, u_radius * 0.12);

          float organicRadius = max(0.01, audioRadius + deformation);
          float normalizedRadius = radius / organicRadius;
          float filledBody = (1.0 - smoothstep(0.08, 1.03, normalizedRadius)) * u_innerFill;
          float softShoulder = 1.0 - smoothstep(0.0, 0.34, abs(normalizedRadius - 0.91));
          float outerMist = (1.0 - smoothstep(1.0, 1.48, normalizedRadius)) * step(1.0, normalizedRadius);
          float innerFlow = 0.5 + 0.5 * sin(
            angle * 2.0 - u_time * speed * 0.22 + normalizedRadius * 4.2 + flow * 1.8
          );
          float fillGain = 1.0 + (pulse + impact * 0.20) * u_waveFillLift;
          float organicAlpha = filledBody * fillGain + softShoulder * (0.20 + flow * 0.035) + outerMist * 0.10;
          organicAlpha *= u_alpha;
          organicAlpha = clamp(organicAlpha, 0.0, u_alpha);

          float colorFlow = clamp(0.24 + normalizedRadius * 0.46 + (innerFlow - 0.5) * 0.15, 0.0, 1.0);
          vec3 organicColor = mix(u_colorA, u_colorB, colorFlow);
          organicColor *= u_brightness * (0.82 + pulse * 0.48 + flow * 0.10 + impact * 0.05);
          outputColor += organicColor * organicAlpha;
          outputAlpha = max(outputAlpha, organicAlpha);
        } else {
          float primaryStrength = min(0.070, u_waveStrength * 0.20);
          float secondaryStrength = min(0.035, u_rippleStrength * 0.20);
          float angular = sin(angle * u_waveLobesA + u_time * speed + flow * 1.6 + phaseDrive * 0.22) *
            primaryStrength * activity * (0.16 + flow * 0.72 + impact * 0.72);
          angular += sin(angle * u_waveLobesB - u_time * speed * 0.74 + impact * 2.1 - phaseDrive * 0.17) *
            secondaryStrength * activity * (0.12 + flow * 0.48 + impact * 0.54);
          angular += (noise(p * (7.0 + u_waveLobesA * 0.35) + u_time * speed * 0.16) - 0.5) *
            u_noiseStrength * activity * (0.08 + flow * 0.52 + impact * 0.30);
          angular = clamp(angular, -u_radius * 0.24, u_radius * 0.24);
          float distanceToRing = abs(radius - audioRadius - angular);
          float mainRing = 1.0 - smoothstep(u_ringWidth * 0.48, u_ringWidth, distanceToRing);
          float secondRadius = audioRadius + u_ringWidth * (1.30 + flow * 0.24 + impact * u_waveRingTravel);
          float secondRing = (1.0 - smoothstep(u_ringWidth * 0.18, u_ringWidth * 0.58, abs(radius - secondRadius))) * step(1.5, u_ringCount);
          float thirdRadius = audioRadius + u_ringWidth * (2.10 + flow * 0.34 + impact * u_waveRingTravel * 1.35);
          float thirdRing = (1.0 - smoothstep(u_ringWidth * 0.12, u_ringWidth * 0.42, abs(radius - thirdRadius))) * step(2.5, u_ringCount);
          float fillGain = u_innerFill * (1.0 + (pulse + impact * 0.30) * u_waveFillLift);
          float fill = (1.0 - smoothstep(audioRadius * 0.15, audioRadius * 1.02, radius)) * fillGain;
          float beatBand = exp(-abs(radius - audioRadius * (0.58 + flow * 0.18 + u_phase * 0.32)) / max(0.012, u_ringWidth * 0.28)) * impact * 0.32;
          float waveAlpha = clamp(fill + mainRing * 0.86 + secondRing * 0.24 + thirdRing * 0.15 + beatBand, 0.0, 1.0) * u_alpha;
          vec3 waveColor = mix(u_colorA, u_colorB, clamp(radius / max(0.01, audioRadius * 1.6), 0.0, 1.0));
          waveColor *= u_brightness * (0.88 + pulse * 0.58 + impact * 0.18 + flow * 0.10);
          outputColor += waveColor * waveAlpha;
          outputAlpha = max(outputAlpha, waveAlpha);
        }
      }

      float block = max(max(roundedRectGlow(uv, u_blockRect0), roundedRectGlow(uv, u_blockRect1)),
                        max(roundedRectGlow(uv, u_blockRect2), roundedRectGlow(uv, u_blockRect3))) * u_blockGlow;
      outputColor += mix(u_colorA, u_colorB, 0.42) * block;
      outputAlpha = max(outputAlpha, clamp(block * 0.42, 0.0, 0.46));
      gl_FragColor = vec4(outputColor, clamp(outputAlpha, 0.0, 1.0));
    }
  `;

  const isWebGL2Context = () => Boolean(window.WebGL2RenderingContext && gl instanceof window.WebGL2RenderingContext);

  const shaderSourceForContext = (type, source) => {
    if (!isWebGL2Context()) return source;
    let converted = source;
    if (type === gl.VERTEX_SHADER) {
      converted = converted.replace(/\battribute\b/g, "in").replace(/\bvarying\b/g, "out");
    } else {
      converted = converted
        .replace(/\bvarying\b/g, "in")
        .replace(/\btexture2D\b/g, "texture")
        .replace(/\bgl_FragColor\b/g, "pulseColorOutput")
        .replace(/precision\s+(?:lowp|mediump|highp)\s+float\s*;/, (declaration) => (
          `${declaration}\nout vec4 pulseColorOutput;`
        ));
    }
    return `#version 300 es\n${converted}`;
  };

  const compileShader = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, shaderSourceForContext(type, source));
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader) || "Unknown shader error";
      gl.deleteShader(shader);
      throw new Error(message);
    }
    return shader;
  };

  const createProgram = (nextVertexSource = vertexSource, nextFragmentSource = fragmentSource) => {
    let vertex = null;
    let fragment = null;
    let nextProgram = null;
    try {
      vertex = compileShader(gl.VERTEX_SHADER, nextVertexSource);
      fragment = compileShader(gl.FRAGMENT_SHADER, nextFragmentSource);
      nextProgram = gl.createProgram();
      if (!nextProgram) throw new Error("WebGL program could not be created");
      gl.attachShader(nextProgram, vertex);
      gl.attachShader(nextProgram, fragment);
      gl.linkProgram(nextProgram);
      if (!gl.getProgramParameter(nextProgram, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(nextProgram) || "Unknown program link error");
      }
      return nextProgram;
    } catch (error) {
      if (nextProgram) gl.deleteProgram(nextProgram);
      throw error;
    } finally {
      if (vertex) gl.deleteShader(vertex);
      if (fragment) gl.deleteShader(fragment);
    }
  };

  const createTexture = () => {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    return texture;
  };

  const extractPalette = (bitmap) => {
    try {
      const surface = typeof OffscreenCanvas === "function"
        ? new OffscreenCanvas(48, 48)
        : Object.assign(document.createElement("canvas"), { width: 48, height: 48 });
      const context = surface.getContext("2d", { willReadFrequently: true });
      context.drawImage(bitmap, 0, 0, 48, 48);
      const data = context.getImageData(0, 0, 48, 48).data;
      const clusters = [];
      const thresholdSquared = 4900;
      for (let index = 0; index < data.length; index += 4) {
        if (data[index + 3] < 128) continue;
        const sample = { red: data[index], green: data[index + 1], blue: data[index + 2], weight: 1 };
        let closest = null;
        let closestDistance = Infinity;
        for (const cluster of clusters) {
          const red = cluster.red - sample.red;
          const green = cluster.green - sample.green;
          const blue = cluster.blue - sample.blue;
          const distance = red * red + green * green + blue * blue;
          if (distance < thresholdSquared && distance < closestDistance) {
            closest = cluster;
            closestDistance = distance;
          }
        }
        if (!closest) {
          clusters.push(sample);
          continue;
        }
        const total = closest.weight + sample.weight;
        closest.red = (closest.red * closest.weight + sample.red) / total;
        closest.green = (closest.green * closest.weight + sample.green) / total;
        closest.blue = (closest.blue * closest.weight + sample.blue) / total;
        closest.weight = total;
      }
      if (!clusters.length) return null;
      const palette = clusters
        .sort((left, right) => right.weight - left.weight)
        .slice(0, 6)
        .map((cluster) => [cluster.red / 255, cluster.green / 255, cluster.blue / 255]);
      while (palette.length < 6) palette.push([...(palette[palette.length % Math.max(1, palette.length)] || [0, 0, 0])]);
      return palette;
    } catch (error) {
      PC.logger.debug("cover-palette-fallback", { name: error?.name, message: error?.message });
      return null;
    }
  };

  const cacheBitmap = (key, bitmap, palette) => {
    if (bitmapCache.has(key)) {
      const previous = bitmapCache.get(key);
      if (previous?.bitmap !== bitmap) previous?.bitmap?.close?.();
      bitmapCache.delete(key);
    }
    bitmapCache.set(key, { bitmap, palette, usedAt: Date.now() });
    while (bitmapCache.size > BITMAP_CACHE_LIMIT) {
      const oldestKey = bitmapCache.keys().next().value;
      const oldest = bitmapCache.get(oldestKey);
      oldest?.bitmap?.close?.();
      bitmapCache.delete(oldestKey);
    }
  };

  const loadBitmap = async (url) => {
    const key = U.normalizeCoverUrl(url);
    if (!key) return null;
    const cached = bitmapCache.get(key);
    if (cached) {
      cached.usedAt = Date.now();
      bitmapCache.delete(key);
      bitmapCache.set(key, cached);
      return cached;
    }
    if (pendingBitmapLoads.has(key)) return pendingBitmapLoads.get(key).promise;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    let rejectReady = null;
    const ready = new Promise((resolve, reject) => {
      rejectReady = reject;
      image.onload = resolve;
      image.onerror = () => reject(new Error("Cover image could not be decoded"));
    });
    const record = { image, reject: rejectReady, cancelled: false, promise: null };
    record.promise = (async () => {
      image.src = url;
      await ready;
      if (record.cancelled) throw new Error("Cover image load cancelled");
      const bitmap = typeof createImageBitmap === "function" ? await createImageBitmap(image) : image;
      if (record.cancelled) {
        bitmap?.close?.();
        throw new Error("Cover image load cancelled");
      }
      const asset = { bitmap, palette: extractPalette(bitmap), usedAt: Date.now() };
      cacheBitmap(key, asset.bitmap, asset.palette);
      return asset;
    })().finally(() => {
      if (pendingBitmapLoads.get(key) === record) pendingBitmapLoads.delete(key);
    });
    pendingBitmapLoads.set(key, record);
    return record.promise;
  };

  const cancelPendingBitmapLoads = () => {
    for (const record of pendingBitmapLoads.values()) {
      record.cancelled = true;
      record.image.onload = null;
      record.image.onerror = null;
      try { record.image.src = ""; } catch {}
      const error = new Error("Cover image load cancelled");
      error.name = "AbortError";
      record.reject?.(error);
    }
    pendingBitmapLoads.clear();
  };

  const clearBitmapCache = () => {
    for (const entry of bitmapCache.values()) entry.bitmap?.close?.();
    bitmapCache.clear();
  };

  const uploadNextCover = async (track) => {
    const request = ++textureRequest;
    const wantsCoverPalette = !!fullscreen && settings.addons.cover2Anim?.enabled === true &&
      ["original", "mixed"].includes(settings.addons.cover2Anim?.colorMode);
    const wantsTweakedCover = !!fullscreen && settings.addons.tweakedYmDesign?.enabled === true &&
      settings.addons.tweakedYmDesign?.coverBackground !== false;
    if ((!settings.wave.USE_COVER_TEXTURE && !wantsCoverPalette && !wantsTweakedCover) || !track?.coverUrl || !gl) {
      nextTextureReady = false;
      nextCoverPalette = null;
      return;
    }
    try {
      const asset = await loadBitmap(track.coverUrl);
      if (request !== textureRequest || !asset?.bitmap || !gl) return;
      gl.bindTexture(gl.TEXTURE_2D, nextTexture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, asset.bitmap);
      nextTextureAspect = Math.max(0.001, numberOr(asset.bitmap.width || asset.bitmap.naturalWidth, 1) /
        Math.max(1, numberOr(asset.bitmap.height || asset.bitmap.naturalHeight, 1)));
      nextCoverPalette = asset.palette;
      nextTextureReady = true;
      textureTransitionAt = performance.now();
      PC.logger.info("cover-texture-ready", { key: track.coverKey });
    } catch (error) {
      nextTextureReady = false;
      if (error?.name !== "AbortError") {
        PC.logger.warn("cover-texture-fallback", { key: track?.coverKey, name: error?.name, message: error?.message });
      }
    }
  };

  const parseColor = (value) => {
    const text = String(value || "").trim();
    const rgb = text.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
    if (rgb) return [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255];
    const hex = text.match(/^#([0-9a-f]{6})$/i);
    if (hex) return [parseInt(hex[1].slice(0, 2), 16) / 255, parseInt(hex[1].slice(2, 4), 16) / 255, parseInt(hex[1].slice(4, 6), 16) / 255];
    const hsl = text.match(/hsla?\(\s*([\d.]+)(?:deg)?[,\s]+([\d.]+)%[,\s]+([\d.]+)%/i);
    if (!hsl) return null;
    const h = (((Number(hsl[1]) % 360) + 360) % 360) / 360;
    const s = Number(hsl[2]) / 100;
    const l = Number(hsl[3]) / 100;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const channel = (input) => {
      let t = input;
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)];
  };

  const updateColors = (timestamp) => {
    if (timestamp - lastColorAt < 300) return;
    lastColorAt = timestamp;
    const lightTheme = document.querySelector?.('.ym-light-theme');
    const darkTheme = document.querySelector?.('.ym-dark-theme');
    const themeMode = lightTheme && !darkTheme ? "light" : "dark";
    const publishedPalette = PC.colorizer?.getThemePalette?.(themeMode)
      ?.map(parseColor)
      .filter(Boolean) || [];
    if (publishedPalette.length >= 2) {
      themePalette = Array.from({ length: 6 }, (_, index) => [
        ...publishedPalette[index % publishedPalette.length]
      ]);
      colorA = [...themePalette[0]];
      colorB = [...themePalette[themePalette.length - 1]];
      return;
    }

    const themeNode = lightTheme || darkTheme || document.documentElement;
    const style = getComputedStyle(themeNode);
    const nextA = parseColor(style.getPropertyValue("--grad-main-from")) || parseColor(style.getPropertyValue("--ym-background-color-secondary-enabled-blur"));
    const nextB = parseColor(style.getPropertyValue("--ym-background-color-primary-enabled-content")) || nextA;
    if (nextA) colorA = nextA;
    if (nextB) colorB = nextB;
    const candidates = [
      colorA,
      colorB,
      parseColor(style.getPropertyValue("--ym-background-color-primary-enabled-player")),
      parseColor(style.getPropertyValue("--ym-background-color-primary-enabled-basic")),
      parseColor(style.getPropertyValue("--ym-background-color-primary-enabled-header")),
      parseColor(style.getPropertyValue("--ym-background-color-secondary-enabled-blur"))
    ].filter(Boolean);
    themePalette = Array.from({ length: 6 }, (_, index) => [...candidates[index % candidates.length]]);
  };

  const locatePlayerBlocks = (modal) => {
    const empty = () => Array.from({ length: 4 }, () => [0, 0, 0, 0]);
    if (!modal) return empty();
    const modalRect = modal.getBoundingClientRect();
    const candidates = [];
    for (const node of modal.querySelectorAll("div")) {
      if (node === root || node.contains(root)) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width < 260 || rect.width > Math.min(980, modalRect.width * 0.8) || rect.height < 90 || rect.height > 420) continue;
      if (rect.top < modalRect.top + modalRect.height * 0.48) continue;
      const style = getComputedStyle(node);
      const hasSurface = style.backgroundColor !== "rgba(0, 0, 0, 0)" || style.backdropFilter !== "none" || parseFloat(style.borderRadius) > 4;
      if (!hasSurface) continue;
      const centerDistance = Math.abs((rect.left + rect.width / 2) - (modalRect.left + modalRect.width / 2));
      const candidateScore = rect.width * 0.01 + rect.top * 0.004 - centerDistance * 0.01;
      candidates.push({ rect, score: candidateScore });
    }
    const selected = [];
    for (const candidate of candidates.sort((a, b) => b.score - a.score)) {
      const centerX = candidate.rect.left + candidate.rect.width / 2;
      const centerY = candidate.rect.top + candidate.rect.height / 2;
      const duplicate = selected.some(({ rect }) => (
        Math.abs(centerX - (rect.left + rect.width / 2)) < 24 &&
        Math.abs(centerY - (rect.top + rect.height / 2)) < 24
      ));
      if (!duplicate) selected.push(candidate);
      if (selected.length >= 4) break;
    }
    const normalized = selected.map(({ rect }) => [
      (rect.left + rect.width / 2 - modalRect.left) / Math.max(1, modalRect.width),
      1 - (rect.top + rect.height / 2 - modalRect.top) / Math.max(1, modalRect.height),
      rect.width / Math.max(1, modalRect.width),
      rect.height / Math.max(1, modalRect.height)
    ]);
    while (normalized.length < 4) normalized.push([0, 0, 0, 0]);
    return normalized;
  };

  const resetResourceReferences = (clearContext = false) => {
    activeVisualPass = null;
    activeVisualModeId = "";
    program = null;
    quadBuffer = null;
    currentTexture = null;
    nextTexture = null;
    currentTextureAspect = 1;
    nextTextureAspect = 1;
    uniforms = null;
    attributes = null;
    textureReady = false;
    nextTextureReady = false;
    counters.programs = 0;
    counters.textures = 0;
    counters.framebuffers = 0;
    if (clearContext) {
      gl = null;
      counters.webglContexts = 0;
    }
  };

  const handleContextLost = (event) => {
    event.preventDefault();
    contextLost = true;
    disposeVisualPass(true);
    resetResourceReferences(true);
    PC.logger.warn("webgl-context-lost", {});
  };

  const handleContextRestored = () => {
    if (!serviceRunning || !wantsRender() || !canvas) return;
    contextLost = false;
    PC.logger.info("webgl-context-restored", {});
    try {
      initResources(true);
      uploadNextCover(PC.track.getCurrent());
    } catch (error) {
      PC.logger.error("webgl-context-restore-failed", error);
      teardownSurface(true);
    }
  };

  const refreshLayout = () => {
    resizePending = true;
    blockRects = locatePlayerBlocks(fullscreen);
  };

  const handleWindowResize = () => { refreshLayout(); };

  const bindCanvasEvents = () => {
    if (!canvas || eventCanvas === canvas) return;
    if (eventCanvas) {
      eventCanvas.removeEventListener?.("webglcontextlost", handleContextLost);
      eventCanvas.removeEventListener?.("webglcontextrestored", handleContextRestored);
    }
    eventCanvas = canvas;
    canvas.addEventListener("webglcontextlost", handleContextLost);
    canvas.addEventListener("webglcontextrestored", handleContextRestored);
    window.addEventListener?.("resize", handleWindowResize, { passive: true });
  };

  const unbindCanvasEvents = () => {
    if (eventCanvas) {
      eventCanvas.removeEventListener?.("webglcontextlost", handleContextLost);
      eventCanvas.removeEventListener?.("webglcontextrestored", handleContextRestored);
    }
    eventCanvas = null;
    window.removeEventListener?.("resize", handleWindowResize);
  };

  const ensureRoot = () => {
    root = document.getElementById(ROOT_ID) || document.createElement("div");
    root.id = ROOT_ID;
    root.classList.add("pulsecolor-webgl-root");
    canvas = root.querySelector(`.${CANVAS_CLASS}`) || document.createElement("canvas");
    canvas.className = CANVAS_CLASS;
    if (root.firstChild !== canvas || root.childNodes.length !== 1) root.replaceChildren(canvas);
    if (!root.isConnected) (document.body || document.documentElement).appendChild(root);
    counters.webglCanvases = 1;
    bindCanvasEvents();
  };

  const ensureResizeObserver = () => {
    if (resizeObserver || typeof ResizeObserver !== "function" || !root) return;
    resizeObserver = new ResizeObserver(refreshLayout);
    resizeObserver.observe(root);
  };

  const desiredVisualModeId = () => {
    if (!fullscreen) return "";
    if (settings.addons.cover2Anim?.enabled === true) return "cover2Anim";
    if (settings.addons.tweakedYmDesign?.enabled === true) return "tweakedYmDesign";
    return "";
  };

  const adjustPassCounters = (counts, direction) => {
    if (!counts) return;
    counters.programs = Math.max(0, (Number(counters.programs) || 0) + direction * (Number(counts.programs) || 0));
    counters.textures = Math.max(0, (Number(counters.textures) || 0) + direction * (Number(counts.textures) || 0));
    counters.framebuffers = Math.max(0, (Number(counters.framebuffers) || 0) + direction * (Number(counts.framebuffers) || 0));
  };

  const disposeVisualPass = (deleteResources = true) => {
    const previousId = activeVisualModeId;
    if (activeVisualPass && deleteResources) {
      try { activeVisualPass.dispose?.(); }
      catch (error) { PC.logger.error("visual-pass-dispose", error, { id: previousId }); }
      adjustPassCounters(activeVisualPass.resourceCounts, -1);
    }
    activeVisualPass = null;
    activeVisualModeId = "";
    canvas?.style?.removeProperty?.("filter");
    if (previousId) window.PulseColorAddonSupport?.setActive?.(previousId, false);
  };

  const getPassViewport = () => {
    const rect = canvas?.getBoundingClientRect?.() || { width: canvas?.width || 2, height: canvas?.height || 2 };
    return {
      cssWidth: Math.max(2, numberOr(rect.width, canvas?.width || 2)),
      cssHeight: Math.max(2, numberOr(rect.height, canvas?.height || 2)),
      dpr: Math.max(0.01, (canvas?.width || 2) / Math.max(2, numberOr(rect.width, canvas?.width || 2)))
    };
  };

  const syncVisualPass = () => {
    if (!gl || !quadBuffer) return;
    const desiredId = desiredVisualModeId();
    if (desiredId === activeVisualModeId && activeVisualPass) return;
    disposeVisualPass(true);
    if (!desiredId) return;
    const definition = PC.visualModes?.get?.(desiredId);
    if (!definition) {
      PC.logger.warn("visual-pass-missing", { id: desiredId });
      return;
    }
    try {
      activeVisualPass = definition.createPass({ gl, quadBuffer, createProgram, canvas, root });
      activeVisualModeId = desiredId;
      adjustPassCounters(activeVisualPass.resourceCounts, 1);
      activeVisualPass.resize?.(canvas?.width || 2, canvas?.height || 2, getPassViewport());
      window.PulseColorAddonSupport?.setActive?.(desiredId, true);
      PC.logger.info("visual-pass-ready", { id: desiredId });
    } catch (error) {
      activeVisualPass = null;
      activeVisualModeId = "";
      PC.logger.error("visual-pass-init", error, { id: desiredId });
    }
  };

  const initResources = (restored = false) => {
    ensureRoot();
    ensureResizeObserver();
    if (fullscreen) attachRoot(fullscreen);
    if (!gl || restored) {
      gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false }) ||
        canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
    }
    if (!gl) throw new Error("WebGL is unavailable");
    if (restored) resetResourceReferences(false);
    else disposeResources(false);
    program = createProgram();
    quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    attributes = { position: gl.getAttribLocation(program, "a_position") };
    const names = ["resolution", "time", "energy", "bass", "mids", "treble", "transient", "phase", "wavePulse", "waveImpact", "waveFlow", "waveActivity", "waveSpeed", "waveLobesA", "waveLobesB", "waveRingTravel", "waveFillLift", "radius", "ringWidth", "innerFill", "waveStrength", "rippleStrength", "noiseStrength", "motionStrength", "brightness", "alpha", "ringCount", "waveStyle", "waveEnabled", "blockGlow", "blockRect0", "blockRect1", "blockRect2", "blockRect3", "colorA", "colorB"];
    uniforms = Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(program, `u_${name}`)]));
    currentTexture = createTexture();
    nextTexture = createTexture();
    currentTextureAspect = 1;
    nextTextureAspect = 1;
    textureReady = false;
    nextTextureReady = false;
    counters.webglContexts = 1;
    counters.programs = 1;
    counters.textures = 2;
    counters.framebuffers = 0;
    syncVisualPass();
    resizePending = true;
    PC.logger.info("webgl-ready", { context: isWebGL2Context() ? "webgl2" : "webgl1" });
  };

  function disposeResources(clearContext = true) {
    disposeVisualPass(true);
    if (gl) {
      if (program) gl.deleteProgram(program);
      if (quadBuffer) gl.deleteBuffer(quadBuffer);
      if (currentTexture) gl.deleteTexture(currentTexture);
      if (nextTexture) gl.deleteTexture(nextTexture);
    }
    resetResourceReferences(clearContext);
  }

  function teardownSurface(clearCache = true) {
    textureRequest += 1;
    cancelPendingBitmapLoads();
    removeFrame?.();
    removeFrame = null;
    if (audioRetained) {
      PC.audio.release("webgl");
      audioRetained = false;
    }
    resizeObserver?.disconnect();
    resizeObserver = null;
    unbindCanvasEvents();
    disposeResources(true);
    root?.remove();
    root = null;
    canvas = null;
    contextLost = false;
    Object.assign(waveMotion, presets.createMotionState?.() || { pulse: 0, impact: 0, flow: 0, activity: 0 });
    lastWaveMotionAt = 0;
    counters.webglCanvases = 0;
    fullscreen?.classList.remove("pulsecolor-integrated-fullscreen");
    if (clearCache) clearBitmapCache();
  }

  const attachRoot = (modal) => {
    const previousModal = fullscreen || root?.parentElement?.closest?.('[data-test-id="FULLSCREEN_PLAYER_MODAL"]');
    fullscreen = modal || null;
    if (!root) return;
    if (previousModal && previousModal !== modal) previousModal.classList.remove("pulsecolor-integrated-fullscreen");
    if (modal) {
      if (root.parentElement !== modal) modal.prepend(root);
      root.classList.add("pulsecolor-webgl-root--fullscreen");
      modal.classList.add("pulsecolor-integrated-fullscreen");
    } else {
      fullscreen?.classList.remove("pulsecolor-integrated-fullscreen");
      if (root.parentElement !== document.body && document.body) document.body.appendChild(root);
      root.classList.remove("pulsecolor-webgl-root--fullscreen");
    }
    resizePending = true;
    if (gl) {
      syncVisualPass();
      if (modal) uploadNextCover(PC.track.getCurrent());
    }
  };

  const resize = () => {
    if (!canvas || !gl) return;
    const dprLimit = U.clamp(numberOr(settings.wave.WEBGL_DPR_LIMIT, 1.5), 0.75, 2);
    const mode = settings.wave.WEBGL_QUALITY;
    const qualityScale = mode === "low" ? 0.65 : mode === "balanced" ? 0.82 : 1;
    const dpr = Math.min(window.devicePixelRatio || 1, dprLimit) * qualityScale;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(2, Math.round(rect.width * dpr));
    const height = Math.max(2, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    activeVisualPass?.resize?.(width, height, { cssWidth: rect.width, cssHeight: rect.height, dpr });
    resizePending = false;
  };

  const wantsRender = () => {
    const waveEnabled = settings.wave.ENABLE_CUSTOM_WAVE !== false && !desiredVisualModeId();
    return waveEnabled || !!desiredVisualModeId();
  };

  const syncRunning = () => {
    const active = serviceRunning && wantsRender();
    if (active && !removeFrame) {
      let initialized = false;
      try {
        if (!gl) {
          initResources();
          initialized = true;
        }
      }
      catch (error) {
        PC.logger.error("webgl-init-failed", error);
        teardownSurface(true);
        return;
      }
      root?.removeAttribute("hidden");
      if (!audioRetained) {
        PC.audio.retain("webgl");
        audioRetained = true;
      }
      removeFrame = PC.runtime.addFrameListener(draw, 20);
      if (initialized) uploadNextCover(PC.track.getCurrent());
    } else if (!active && (removeFrame || root || gl)) {
      teardownSurface(true);
    }
  };
  const handleVisualModeRegistered = () => {
    if (gl) syncVisualPass();
    syncRunning();
  };

  function draw(timestamp) {
    if (!gl || !program || contextLost || !wantsRender()) return;
    syncVisualPass();
    const coverIntegrationActive = activeVisualModeId === "cover2Anim";
    const tweakedIntegrationActive = activeVisualModeId === "tweakedYmDesign";
    const efficient = coverIntegrationActive
      ? false
      : tweakedIntegrationActive
        ? false
        : settings.wave.WAVE_PERFORMANCE_MODE !== "max";
    if (efficient && timestamp - lastDrawAt < 32) return;
    lastDrawAt = timestamp;
    if (resizePending) resize();
    updateColors(timestamp);

    const frame = PC.audio.getFrame();
    const preset = presets.get(settings.wave.WAVE_VARIANT);
    const intensitySetting = U.clamp(numberOr(settings.wave.REACTION_INTENSITY, 1), 0.1, 3);
    const intensity = (0.82 + Math.sqrt(intensitySetting) * 0.18) * preset.response;
    const bpmDriven = frame.mode === "bpm" && Number(frame.bpm) > 0;
    const bpmWave = bpmDriven ? Math.pow(0.5 + 0.5 * Math.cos((frame.phase || 0) * Math.PI * 2), 3) : 0;
    const drive = bpmDriven ? {
      mode: "bpm",
      active: true,
      energy: 0.12 + bpmWave * 0.76,
      bass: 0.10 + bpmWave * 0.90,
      mids: 0.14 + bpmWave * 0.46,
      treble: 0.08 + bpmWave * 0.28,
      transient: Math.pow(bpmWave, 1.8),
      kick: Math.pow(bpmWave, 1.45),
      rise: Math.pow(bpmWave, 1.25) * 0.72,
      heavy: 0.12 + bpmWave * 0.82,
      motion: 0.18 + bpmWave * 0.72,
      voice: 0.10 + bpmWave * 0.24,
      phase: frame.phase || 0
    } : frame;
    const driven = {
      ...drive,
      energy: U.clamp(numberOr(drive.energy, 0) * intensity, 0, 1.4),
      bass: U.clamp(numberOr(drive.bass, 0) * intensity, 0, 1.4),
      mids: U.clamp(numberOr(drive.mids, 0) * intensity, 0, 1.4),
      treble: U.clamp(numberOr(drive.treble, 0) * intensity, 0, 1.4),
      transient: U.clamp(numberOr(drive.transient, 0) * intensity, 0, 1.4),
      kick: U.clamp(numberOr(drive.kick, 0) * intensity, 0, 1.4),
      rise: U.clamp(numberOr(drive.rise, 0) * intensity, 0, 1.4),
      heavy: U.clamp(numberOr(drive.heavy, 0) * intensity, 0, 1.4),
      motion: U.clamp(numberOr(drive.motion, 0) * intensity, 0, 1.4),
      voice: U.clamp(numberOr(drive.voice, 0) * intensity, 0, 1.4)
    };
    const motionDt = lastWaveMotionAt ? Math.min(120, Math.max(0, timestamp - lastWaveMotionAt)) : 16.67;
    lastWaveMotionAt = timestamp;
    presets.stepMotion?.(waveMotion, driven, preset, motionDt);
    let textureMix = 0;
    if (nextTextureReady) {
      const transitionMs = tweakedIntegrationActive && settings.addons.tweakedYmDesign?.coverBackground !== false
        ? U.clamp(numberOr(settings.addons.tweakedYmDesign?.coverCrossfadeMs, 900), 1, 3000)
        : COVER2ANIM_PALETTE_FADE_MS;
      textureMix = U.clamp((timestamp - textureTransitionAt) / transitionMs, 0, 1);
      if (textureMix >= 1) {
        const previous = currentTexture;
        const previousPalette = currentCoverPalette;
        currentTexture = nextTexture;
        nextTexture = previous;
        const previousAspect = currentTextureAspect;
        currentTextureAspect = nextTextureAspect;
        nextTextureAspect = previousAspect;
        currentCoverPalette = nextCoverPalette;
        nextCoverPalette = previousPalette;
        textureReady = true;
        nextTextureReady = false;
        textureMix = 0;
      }
    }

    const pulsePalette = settings.wave.USE_COVER_COLORS === false
      ? Array.from({ length: 6 }, (_, index) => index % 2 ? [0.42, 0.52, 0.72] : [0.72, 0.76, 0.86])
      : themePalette;
    const coverPalette = nextCoverPalette
      ? Array.from({ length: Math.max(2, nextCoverPalette.length) }, (_, index) => mixColor(
          currentCoverPalette?.[index % currentCoverPalette.length] || themePalette[index % themePalette.length],
          nextCoverPalette[index % nextCoverPalette.length],
          textureMix
        ))
      : currentCoverPalette || [colorA, colorB];

    gl.disable(gl.DEPTH_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (activeVisualPass) {
      try {
        activeVisualPass.update?.({
          timestamp,
          dt: motionDt,
          frame: driven,
          settings: settings.addons[activeVisualModeId] || {},
          pulsePalette,
          coverPalette,
          container: fullscreen,
          playback: PC.dom.getPlayback(),
          track: PC.track.getCurrent()
        });
        const filter = activeVisualPass.getCanvasFilter?.() || "";
        if (filter) canvas.style?.setProperty?.("filter", filter, "important");
        else canvas.style?.removeProperty?.("filter");
        activeVisualPass.render?.({
          currentTexture,
          nextTexture,
          textureReady,
          nextTextureReady,
          textureMix,
          currentTextureAspect,
          nextTextureAspect,
          pulsePalette,
          coverPalette
        });
      } catch (error) {
        PC.logger.error("visual-pass-render", error, { id: activeVisualModeId });
      }
    } else {
      canvas.style?.removeProperty?.("filter");
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.enableVertexAttribArray(attributes.position);
    gl.vertexAttribPointer(attributes.position, 2, gl.FLOAT, false, 0, 0);

    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
    gl.uniform1f(uniforms.time, timestamp / 1000);
    gl.uniform1f(uniforms.energy, driven.energy);
    gl.uniform1f(uniforms.bass, driven.bass);
    gl.uniform1f(uniforms.mids, driven.mids);
    gl.uniform1f(uniforms.treble, driven.treble);
    gl.uniform1f(uniforms.transient, driven.transient);
    gl.uniform1f(uniforms.phase, driven.phase || 0);
    gl.uniform1f(uniforms.wavePulse, waveMotion.pulse);
    gl.uniform1f(uniforms.waveImpact, waveMotion.impact);
    gl.uniform1f(uniforms.waveFlow, waveMotion.flow);
    gl.uniform1f(uniforms.waveActivity, waveMotion.activity);
    const motionConfig = preset.motion || {};
    const motionSpeedScale = U.clamp(numberOr(settings.wave.MOTION_SPEED, 0.36) / 0.36, 0.14, 2.8);
    gl.uniform1f(uniforms.waveSpeed, numberOr(motionConfig.speed, 0.5) * motionSpeedScale);
    gl.uniform1f(uniforms.waveLobesA, numberOr(motionConfig.lobesA, 7));
    gl.uniform1f(uniforms.waveLobesB, numberOr(motionConfig.lobesB, 13));
    gl.uniform1f(uniforms.waveRingTravel, numberOr(motionConfig.ringTravel, 0.28));
    gl.uniform1f(uniforms.waveFillLift, numberOr(motionConfig.fillLift, 0.20));
    gl.uniform1f(uniforms.radius, preset.radius);
    gl.uniform1f(uniforms.ringWidth, preset.ringWidth);
    gl.uniform1f(uniforms.innerFill, preset.innerFill);
    gl.uniform1f(uniforms.waveStrength, preset.waveStrength);
    gl.uniform1f(uniforms.rippleStrength, preset.rippleStrength);
    gl.uniform1f(uniforms.noiseStrength, preset.noiseStrength);
    gl.uniform1f(uniforms.motionStrength, settings.wave.MOTION_ENABLED === false ? 0 : preset.motionStrength * numberOr(settings.wave.MOTION_SPEED, 0.36));
    gl.uniform1f(uniforms.brightness, preset.brightness * numberOr(settings.wave.BRIGHTNESS_BASE, 1));
    gl.uniform1f(uniforms.alpha, preset.alpha);
    gl.uniform1f(uniforms.ringCount, preset.ringCount);
    gl.uniform1f(uniforms.waveStyle, preset.renderStyle === "organic-field" ? 1 : 0);
    const waveEnabled = settings.wave.ENABLE_CUSTOM_WAVE !== false && !desiredVisualModeId();
    gl.uniform1f(uniforms.waveEnabled, waveEnabled ? 1 : 0);
    gl.uniform1f(uniforms.blockGlow, 0);
    for (let index = 0; index < 4; index += 1) {
      const rect = blockRects[index] || [0, 0, 0, 0];
      gl.uniform4f(uniforms[`blockRect${index}`], rect[0], rect[1], rect[2], rect[3]);
    }
    gl.uniform3f(uniforms.colorA, pulsePalette[0][0], pulsePalette[0][1], pulsePalette[0][2]);
    gl.uniform3f(uniforms.colorB, pulsePalette[1][0], pulsePalette[1][1], pulsePalette[1][2]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  const engine = {
    version: 2,
    getCanvas: () => canvas,
    getContextType: () => gl
      ? (isWebGL2Context() ? "webgl2" : "webgl1")
      : "none",
    setPreset(id) { PC.settings.updateWave({ WAVE_VARIANT: presets.get(id).id }, "engine-api"); },
    stop: () => stopService()
  };

  PC.engine = engine;

  const startService = () => {
    if (serviceRunning) return;
    serviceRunning = true;
    window.addEventListener?.("pulsecolor:visual-mode-registered", handleVisualModeRegistered);
    removeSettings = PC.settings.subscribe((next) => {
      const textureWasEnabled = settings.wave.USE_COVER_TEXTURE;
      const coverPaletteWasEnabled = ["original", "mixed"].includes(settings.addons.cover2Anim?.colorMode);
      const tweakedCoverWasEnabled = settings.addons.tweakedYmDesign?.enabled === true &&
        settings.addons.tweakedYmDesign?.coverBackground !== false;
      settings = next;
      if (gl) syncVisualPass();
      if ((!textureWasEnabled && settings.wave.USE_COVER_TEXTURE) ||
          (!coverPaletteWasEnabled && ["original", "mixed"].includes(settings.addons.cover2Anim?.colorMode)) ||
          (!tweakedCoverWasEnabled && settings.addons.tweakedYmDesign?.enabled === true &&
            settings.addons.tweakedYmDesign?.coverBackground !== false)) {
        uploadNextCover(PC.track.getCurrent());
      }
      syncRunning();
    });
    removeDom = PC.dom.subscribe((dom) => {
      const fullscreenChanged = dom.fullscreen !== fullscreen;
      const nextCoverKey = String(dom.track?.coverKey || "");
      const coverChanged = nextCoverKey !== lastObservedCoverKey;
      lastObservedCoverKey = nextCoverKey;
      if (fullscreenChanged) attachRoot(dom.fullscreen);
      refreshLayout();
      syncRunning();
      if (coverChanged && gl && !fullscreenChanged) uploadNextCover(dom.track);
    });
    removeTrack = PC.track.subscribe((track) => {
      Object.assign(waveMotion, presets.createMotionState?.() || { pulse: 0, impact: 0, flow: 0, activity: 0 });
      lastWaveMotionAt = 0;
      uploadNextCover(track);
    });
    syncRunning();
  };

  function stopService() {
    if (!serviceRunning && !root && !gl) return;
    serviceRunning = false;
    window.removeEventListener?.("pulsecolor:visual-mode-registered", handleVisualModeRegistered);
    removeSettings?.();
    removeDom?.();
    removeTrack?.();
    removeSettings = null;
    removeDom = null;
    removeTrack = null;
    lastObservedCoverKey = "";
    teardownSurface(true);
  }

  if (typeof PC.runtime.registerService === "function") {
    PC.runtime.registerService("webgl", { start: startService, stop: stopService });
  } else {
    startService();
  }
})();
