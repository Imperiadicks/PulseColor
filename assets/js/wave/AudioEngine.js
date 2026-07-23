(() => {
  "use strict";

  const PC = window.PulseColor;
  const U = window.PulseColorRuntimeUtils;
  if (!PC?.runtime || !U) throw new Error("PulseColor RuntimeCore must be loaded before AudioEngine");
  if (PC.audio?.version >= 2) return;

  const AC = window.AudioContext || window.webkitAudioContext;
  const counters = PC.diagnostics.counters;
  const consumers = new Set();
  const subscribers = new Map();
  let tappedNodes = new WeakSet();
  const ownedContexts = new WeakSet();
  const audioBindings = new Map();

  let context = null;
  let analyser = null;
  let source = null;
  let silenceGain = null;
  let sourceLinks = [];
  let ownContext = false;
  let sourceMode = "none";
  let removeFrame = null;
  let nativeConnect = null;
  let patchedConnect = null;
  let removeDom = null;
  let removeTrack = null;
  let mediaElement = null;
  let audioRefreshTimer = 0;
  let audioRefreshGeneration = 0;
  let serviceRunning = false;
  let analyserGeneration = 0;
  let externalSubscriberId = 0;
  let frequency = new Uint8Array(0);
  let timeDomain = new Float32Array(0);
  let previousSpectrum = new Uint8Array(0);
  let adaptiveFloor = 0.018;
  let adaptivePeak = 0.24;
  let beatHold = 0;
  let lastBeatAt = 0;
  let lastPulseSyncGraphProbeAt = -Infinity;
  let pulseSyncGraphProbeRunning = false;
  let silentMediaSince = 0;
  let lastForcedMediaRefreshAt = -Infinity;

  const PULSESYNC_GRAPH_PROBE_INTERVAL_MS = 2500;
  const SILENT_MEDIA_REBIND_MS = 900;
  const SILENT_MEDIA_REBIND_COOLDOWN_MS = 4000;

  const frame = {
    active: false,
    selectedMode: "raw",
    effectiveMode: "raw",
    mode: "raw",
    bpmStatus: "raw",
    bpmSource: "",
    rms: 0,
    peak: 0,
    energy: 0,
    motion: 0,
    kick: 0,
    bass: 0,
    mids: 0,
    treble: 0,
    voice: 0,
    rise: 0,
    heavy: 0,
    flux: 0,
    transient: 0,
    bpm: null,
    phase: 0,
    confidence: 0,
    beat: false,
    time: performance.now()
  };

  const allocateBuffers = () => {
    if (!analyser) return;
    if (frequency.length !== analyser.frequencyBinCount) {
      frequency = new Uint8Array(analyser.frequencyBinCount);
      previousSpectrum = new Uint8Array(analyser.frequencyBinCount);
    }
    if (timeDomain.length !== analyser.fftSize) timeDomain = new Float32Array(analyser.fftSize);
  };

  const configureAnalyser = (node) => {
    node.fftSize = 2048;
    node.smoothingTimeConstant = 0.58;
    node.minDecibels = -96;
    node.maxDecibels = -18;
  };

  const setAnalyser = (nextContext, nextAnalyser, mode, ownsContext = false) => {
    if (!serviceRunning || consumers.size === 0 || !nextContext || !nextAnalyser || analyser) return false;
    context = nextContext;
    analyser = nextAnalyser;
    ownContext = ownsContext;
    sourceMode = mode;
    configureAnalyser(analyser);
    allocateBuffers();
    counters.audioAnalysers = 1;
    counters.audioContexts = 1;
    PC.logger.info("audio-analyser-ready", {
      mode,
      sampleRate: context.sampleRate,
      fftSize: analyser.fftSize,
      ownContext
    });
    return true;
  };

  const getDirectGraphMethods = () => ({
    connect: window.__pulseSyncYandexStationOriginalAudioNodeConnect || nativeConnect || window.AudioNode?.prototype?.connect,
    disconnect: window.__pulseSyncYandexStationOriginalAudioNodeDisconnect || window.AudioNode?.prototype?.disconnect
  });

  const disconnectGraphLink = (link) => {
    if (!link?.node || !link.destination) return;
    try {
      if (typeof link.disconnect === "function") link.disconnect.call(link.node, link.destination);
      else link.node.disconnect?.(link.destination);
    } catch (error) {
      PC.logger.debug("audio-graph-link-disconnect-failed", { name: error?.name, message: error?.message });
    }
  };

  const recoverPulseSyncHostGraph = () => {
    if (!serviceRunning || consumers.size === 0 || analyser || pulseSyncGraphProbeRunning) return false;
    const now = performance.now();
    if (now - lastPulseSyncGraphProbeAt < PULSESYNC_GRAPH_PROBE_INTERVAL_MS) return false;
    lastPulseSyncGraphProbeAt = now;

    const cast = window.pulseSyncYandexStationCast;
    const directConnect = window.__pulseSyncYandexStationOriginalAudioNodeConnect;
    const directDisconnect = window.__pulseSyncYandexStationOriginalAudioNodeDisconnect;
    if (
      typeof directConnect !== "function" ||
      typeof directDisconnect !== "function" ||
      typeof cast?.startMuteGuard !== "function" ||
      typeof cast?.stopMuteGuard !== "function"
    ) return false;

    try {
      if (cast.isActive?.() || cast.muteTimer) return false;
    } catch {
      return false;
    }

    const connectKey = "__pulseSyncYandexStationOriginalAudioNodeConnect";
    const candidates = [];
    const probeConnect = function pulseColorPulseSyncGraphProbe(destination, ...args) {
      const result = directConnect.call(this, destination, ...args);
      try {
        if (
          this?.context &&
          !ownedContexts.has(this.context) &&
          destination === this.context.destination
        ) candidates.push(this);
      } catch { }
      return result;
    };

    pulseSyncGraphProbeRunning = true;
    let guardStarted = false;
    try {
      window[connectKey] = probeConnect;
      guardStarted = true;
      cast.startMuteGuard();
      cast.stopMuteGuard();
      guardStarted = false;
    } catch (error) {
      PC.logger.warn("audio-pulsesync-graph-probe-failed", { name: error?.name, message: error?.message });
    } finally {
      if (guardStarted) {
        try { cast.stopMuteGuard(); } catch { }
      }
      if (window[connectKey] === probeConnect) window[connectKey] = directConnect;
      pulseSyncGraphProbeRunning = false;
    }

    const groupedByContext = new Map();
    for (const node of new Set(candidates)) {
      const nodeContext = node?.context;
      if (!nodeContext || nodeContext.state === "closed") continue;
      if (!groupedByContext.has(nodeContext)) groupedByContext.set(nodeContext, []);
      groupedByContext.get(nodeContext).push(node);
    }
    const selected = Array.from(groupedByContext.entries()).sort((left, right) => {
      const leftScore = (left[0].state === "running" ? 1000 : 0) + left[1].length;
      const rightScore = (right[0].state === "running" ? 1000 : 0) + right[1].length;
      return rightScore - leftScore;
    })[0];
    if (!selected) return false;

    const [hostContext, nodes] = selected;
    let tapAnalyser = null;
    let tapSilence = null;
    const links = [];
    try {
      tapAnalyser = hostContext.createAnalyser();
      configureAnalyser(tapAnalyser);
      tapSilence = hostContext.createGain();
      tapSilence.gain.value = 0;
      directConnect.call(tapAnalyser, tapSilence);
      directConnect.call(tapSilence, hostContext.destination);
      for (const node of nodes) {
        try {
          directConnect.call(node, tapAnalyser);
          links.push({ node, destination: tapAnalyser, disconnect: directDisconnect });
        } catch { }
      }
      if (links.length === 0) throw new Error("PulseSync graph contains no connectable source nodes");

      source = links[0].node;
      sourceLinks = links;
      silenceGain = tapSilence;
      mediaElement = null;
      if (!setAnalyser(hostContext, tapAnalyser, "pulsesync-host-graph", false)) {
        source = null;
        sourceLinks = [];
        silenceGain = null;
        links.forEach(disconnectGraphLink);
        directDisconnect.call(tapAnalyser, tapSilence);
        directDisconnect.call(tapSilence, hostContext.destination);
        return false;
      }
      PC.logger.info("audio-pulsesync-graph-recovered", {
        sources: links.length,
        sampleRate: hostContext.sampleRate
      });
      return true;
    } catch (error) {
      links.forEach(disconnectGraphLink);
      try { tapAnalyser && directDisconnect.call(tapAnalyser); } catch { }
      try { tapSilence && directDisconnect.call(tapSilence); } catch { }
      source = null;
      sourceLinks = [];
      silenceGain = null;
      PC.logger.warn("audio-pulsesync-graph-attach-failed", { name: error?.name, message: error?.message });
      return false;
    }
  };

  const installAudioGraphTap = () => {
    if (!serviceRunning || consumers.size === 0 || !window.AudioNode?.prototype?.connect || window.AudioNode.prototype.connect.__pulseColorRuntimeTap) return;
    nativeConnect = window.AudioNode.prototype.connect;
    patchedConnect = function pulseColorRuntimeConnect(destination, ...args) {
      const result = nativeConnect.call(this, destination, ...args);
      try {
        const ctx = this.context || destination?.context;
        const isDestination = destination && /AudioDestinationNode|Destination/i.test(destination.constructor?.name || "");
        if (serviceRunning && consumers.size > 0 && !analyser && ctx && !ownedContexts.has(ctx) && isDestination && !tappedNodes.has(this)) {
          const tapAnalyser = ctx.createAnalyser();
          const zero = ctx.createGain();
          zero.gain.value = 0;
          const graph = getDirectGraphMethods();
          graph.connect.call(tapAnalyser, zero);
          graph.connect.call(zero, destination);
          graph.connect.call(this, tapAnalyser);
          silenceGain = zero;
          source = this;
          sourceLinks = [{ node: this, destination: tapAnalyser, disconnect: graph.disconnect }];
          mediaElement = null;
          tappedNodes.add(this);
          setAnalyser(ctx, tapAnalyser, "host-audio-graph", false);
        }
      } catch (error) {
        PC.logger.warn("audio-graph-tap-failed", { name: error?.name, message: error?.message });
      }
      return result;
    };
    patchedConnect.__pulseColorRuntimeTap = true;
    window.AudioNode.prototype.connect = patchedConnect;
  };

  const uninstallAudioGraphTap = () => {
    if (patchedConnect && window.AudioNode?.prototype?.connect === patchedConnect && nativeConnect) {
      window.AudioNode.prototype.connect = nativeConnect;
    }
    patchedConnect = null;
    nativeConnect = null;
    tappedNodes = new WeakSet();
  };

  const bindAudioLifecycle = (audio) => {
    if (!serviceRunning || consumers.size === 0 || !audio || audioBindings.has(audio)) return;
    const bindings = new Map();
    ["play", "playing", "loadeddata", "loadedmetadata", "canplay"].forEach((eventName) => {
      const handler = () => {
        if (eventName === "playing" && analyser && audio === mediaElement && sourceMode === "capture-stream") {
          scheduleAudioRefresh(audio, 40, true);
        } else if (analyser && audio !== mediaElement) scheduleAudioRefresh(audio, 0);
        else ensureAnalyser(audio);
      };
      bindings.set(eventName, handler);
      audio.addEventListener(eventName, handler, { passive: true });
    });
    audioBindings.set(audio, bindings);
  };

  const unbindAudioElement = (audio) => {
    const bindings = audioBindings.get(audio);
    if (!bindings) return;
    for (const [eventName, handler] of bindings) audio.removeEventListener?.(eventName, handler);
    audioBindings.delete(audio);
  };

  const unbindAudioLifecycle = () => {
    for (const audio of Array.from(audioBindings.keys())) unbindAudioElement(audio);
  };

  const ensureAnalyser = async (preferredAudio = null) => {
    if (!serviceRunning || analyser || !AC || consumers.size === 0) return analyser;
    const generation = analyserGeneration;
    const audio = preferredAudio || PC.dom.getSnapshot().audio || document.querySelector("audio");
    if (!audio) {
      recoverPulseSyncHostGraph();
      return analyser;
    }
    bindAudioLifecycle(audio);

    let candidateContext = null;
    try {
      const ctx = candidateContext = new AC();
      ownedContexts.add(ctx);
      const tapAnalyser = ctx.createAnalyser();
      configureAnalyser(tapAnalyser);
      let tapSource = null;
      let tapSilence = null;
      let mode = "capture-stream";
      let stream = null;
      try {
        stream = audio.captureStream?.() || audio.mozCaptureStream?.() || null;
      } catch (error) {
        PC.logger.debug("audio-capture-stream-unavailable", { name: error?.name, message: error?.message });
      }
      const streamHasAudio = stream && (
        typeof stream.getAudioTracks !== "function" || stream.getAudioTracks().length > 0
      );
      if (streamHasAudio) {
        try {
          tapSource = ctx.createMediaStreamSource(stream);
        } catch (error) {
          PC.logger.debug("audio-capture-stream-source-failed", { name: error?.name, message: error?.message });
        }
      }
      if (!tapSource) {
        mode = "media-element";
        tapSource = ctx.createMediaElementSource(audio);
      }

      const graph = getDirectGraphMethods();
      if (mode === "capture-stream") {
        tapSilence = ctx.createGain();
        tapSilence.gain.value = 0;
        graph.connect.call(tapSource, tapAnalyser);
        graph.connect.call(tapAnalyser, tapSilence);
        graph.connect.call(tapSilence, ctx.destination);
      } else {
        graph.connect.call(tapSource, tapAnalyser);
        graph.connect.call(tapAnalyser, ctx.destination);
      }

      if (!serviceRunning || consumers.size === 0 || generation !== analyserGeneration || analyser) {
        tapSource.disconnect?.();
        tapAnalyser.disconnect?.();
        tapSilence?.disconnect?.();
        await ctx.close();
        ownedContexts.delete(ctx);
        return null;
      }
      source = tapSource;
      sourceLinks = [];
      silenceGain = tapSilence;
      mediaElement = audio;
      if (!setAnalyser(ctx, tapAnalyser, mode, true)) {
        source = null;
        silenceGain = null;
        mediaElement = null;
        tapSource.disconnect?.();
        tapAnalyser.disconnect?.();
        tapSilence?.disconnect?.();
        await ctx.close();
        ownedContexts.delete(ctx);
        return analyser;
      }
      if (ctx.state === "suspended") await ctx.resume();
    } catch (error) {
      PC.logger.warn("audio-media-tap-failed", { name: error?.name, message: error?.message });
      const failedContext = candidateContext || (ownContext ? context : null);
      if (failedContext && failedContext.state !== "closed") {
        try { await failedContext.close(); } catch (closeError) { PC.logger.warn("audio-context-close-failed", closeError); }
      }
      if (failedContext) ownedContexts.delete(failedContext);
      context = null;
      analyser = null;
      source = null;
      sourceLinks = [];
      silenceGain = null;
      mediaElement = null;
      ownContext = false;
      sourceMode = "none";
      counters.audioAnalysers = 0;
      counters.audioContexts = 0;
    }
    return analyser;
  };

  const averageBand = (fromHz, toHz) => {
    if (!frequency.length || !context) return 0;
    const nyquist = context.sampleRate / 2;
    const start = U.clamp(Math.floor((fromHz / nyquist) * frequency.length), 0, frequency.length - 1);
    const end = U.clamp(Math.ceil((toHz / nyquist) * frequency.length), start + 1, frequency.length);
    let sum = 0;
    for (let index = start; index < end; index += 1) sum += frequency[index];
    return sum / Math.max(1, end - start) / 255;
  };

  const smooth = (current, target, dt, riseMs, fallMs) => {
    const tau = target > current ? riseMs : fallMs;
    const alpha = 1 - Math.exp(-Math.max(0, dt) / Math.max(1, tau));
    return current + (target - current) * alpha;
  };

  const clearFrame = (timestamp, dt) => {
    frame.active = false;
    frame.beat = false;
    frame.time = timestamp;
    for (const key of ["rms", "peak", "energy", "motion", "kick", "bass", "mids", "treble", "voice", "rise", "heavy", "flux", "transient"]) {
      frame[key] = smooth(frame[key], 0, dt, 80, 360);
    }
  };

  const syncBpmFrame = (waveSettings) => {
    const bpmState = PC.bpm?.getState?.() || null;
    frame.selectedMode = bpmState?.selectedMode || waveSettings.WAVE_DRIVE_MODE || "raw";
    frame.effectiveMode = bpmState?.effectiveMode || waveSettings.WAVE_DRIVE_MODE || "raw";
    frame.mode = frame.effectiveMode;
    frame.bpmStatus = bpmState?.status || (frame.selectedMode === "bpm" ? "loading" : "raw");
    frame.bpmSource = bpmState?.source || "";
    frame.bpm = bpmState?.bpm || null;
    frame.phase = bpmState?.phase || 0;
    frame.confidence = frame.bpmStatus === "bpm" || frame.bpmStatus === "ready" ? 1 : 0;
  };

  const sample = (timestamp, dt) => {
    const waveSettings = PC.settings.getWave();
    syncBpmFrame(waveSettings);
    if (!analyser) {
      ensureAnalyser();
      clearFrame(timestamp, dt);
      publish(timestamp);
      return;
    }

    if (context?.state === "suspended") context.resume().catch((error) => PC.logger.warn("audio-context-resume-failed", error));
    analyser.getByteFrequencyData(frequency);
    analyser.getFloatTimeDomainData(timeDomain);

    let sumSquares = 0;
    let peak = 0;
    for (let index = 0; index < timeDomain.length; index += 1) {
      const value = timeDomain[index];
      sumSquares += value * value;
      peak = Math.max(peak, Math.abs(value));
    }
    const rms = Math.sqrt(sumSquares / Math.max(1, timeDomain.length));
    const mediaIsAdvancing = Boolean(
      mediaElement &&
      !mediaElement.paused &&
      !mediaElement.ended &&
      mediaElement.readyState >= 2 &&
      Number(mediaElement.currentTime || 0) > 0
    );
    if (sourceMode === "capture-stream" && mediaIsAdvancing && rms < 0.00001) {
      if (!silentMediaSince) silentMediaSince = timestamp;
      if (
        timestamp - silentMediaSince >= SILENT_MEDIA_REBIND_MS &&
        timestamp - lastForcedMediaRefreshAt >= SILENT_MEDIA_REBIND_COOLDOWN_MS
      ) {
        lastForcedMediaRefreshAt = timestamp;
        silentMediaSince = timestamp;
        scheduleAudioRefresh(mediaElement, 0, true);
      }
    } else {
      silentMediaSince = 0;
    }
    const bassRaw = averageBand(20, 180);
    const midsRaw = averageBand(180, 4000);
    const trebleRaw = averageBand(4000, 12000);
    const rawEnergy = U.clamp(rms * 0.95 + bassRaw * 0.25 + midsRaw * 0.13 + trebleRaw * 0.06, 0, 1.2);

    adaptiveFloor = Math.min(rawEnergy, adaptiveFloor * 0.997 + rawEnergy * 0.003);
    adaptiveFloor = U.clamp(adaptiveFloor, 0.001, 0.55);
    adaptivePeak = Math.max(rawEnergy, adaptivePeak * 0.992);
    adaptivePeak = U.clamp(adaptivePeak, adaptiveFloor + 0.10, 1.2);

    const sensitivityValue = Number(waveSettings.SENSITIVITY);
    const smoothingValue = Number(waveSettings.SMOOTHNESS);
    const sensitivity = U.clamp(Number.isFinite(sensitivityValue) ? sensitivityValue : 1, 0.25, 3);
    const smoothing = U.clamp(Number.isFinite(smoothingValue) ? smoothingValue : 0.72, 0, 1);
    const sensitivityGain = U.clamp(0.88 + Math.log2(1 + sensitivity) * 0.12, 0.90, 1.12);
    const dynamicEnergy = U.clamp((rawEnergy - adaptiveFloor) / Math.max(0.10, adaptivePeak - adaptiveFloor), 0, 1);
    const absoluteEnergy = Math.pow(U.clamp(rawEnergy, 0, 1), 1.15) * sensitivityGain;
    const normalized = U.clamp(absoluteEnergy * 0.76 + dynamicEnergy * 0.24, 0, 1);
    const normalizeBand = (value) => U.clamp(Math.pow(U.clamp(value, 0, 1), 1.32) * sensitivityGain, 0, 1);
    const bassLevel = normalizeBand(bassRaw);
    const midsLevel = normalizeBand(midsRaw);
    const trebleLevel = normalizeBand(trebleRaw);

    let flux = 0;
    const step = Math.max(1, Math.floor(frequency.length / 256));
    let fluxSamples = 0;
    for (let index = 0; index < frequency.length; index += step) {
      const delta = frequency[index] - previousSpectrum[index];
      if (delta > 0) flux += delta;
      previousSpectrum[index] = frequency[index];
      fluxSamples += 1;
    }
    flux = U.clamp(flux / Math.max(1, fluxSamples) / 42, 0, 1);

    const attack = 42 + smoothing * 170;
    const release = 190 + smoothing * 620;
    frame.rms = smooth(frame.rms, rms, dt, attack, release);
    frame.peak = smooth(frame.peak, peak, dt, 28, 260);
    frame.energy = smooth(frame.energy, normalized, dt, attack, release);
    frame.bass = smooth(frame.bass, bassLevel, dt, attack * 0.72, release * 0.72);
    frame.mids = smooth(frame.mids, midsLevel, dt, attack, release);
    frame.treble = smooth(frame.treble, trebleLevel, dt, attack * 0.8, release * 0.65);
    frame.flux = smooth(frame.flux, flux, dt, 35, 230);
    frame.transient = U.clamp(frame.flux * 0.72 + Math.max(0, normalized - frame.energy) * 1.8, 0, 1);
    frame.kick = smooth(frame.kick, U.clamp(frame.bass * 0.72 + frame.transient * 0.58, 0, 1), dt, 24, 210);
    frame.voice = smooth(frame.voice, U.clamp(frame.mids * 0.74 + frame.treble * 0.12 - frame.bass * 0.10, 0, 1), dt, 70, 340);
    frame.rise = smooth(frame.rise, U.clamp(Math.max(0, normalized - frame.energy) * 2.4 + flux * 0.32, 0, 1), dt, 38, 280);
    frame.heavy = smooth(frame.heavy, U.clamp(frame.bass * 0.66 + frame.energy * 0.34, 0, 1), dt, 65, 420);
    frame.motion = smooth(frame.motion, U.clamp(frame.energy * 0.54 + frame.mids * 0.22 + frame.heavy * 0.24, 0, 1), dt, 90, 520);

    const beatCandidate = frame.kick > 0.58 && frame.transient > 0.22 && timestamp - lastBeatAt > 150;
    if (beatCandidate) {
      lastBeatAt = timestamp;
      beatHold = 1;
    }
    beatHold = Math.max(0, beatHold - dt / 180);
    frame.beat = beatCandidate;
    frame.active = rms > 0.00001 || frame.energy > 0.015;
    frame.time = timestamp;
    publish(timestamp);
  };

  const snapshot = () => Object.freeze({ ...frame });

  const publish = (timestamp) => {
    for (const subscription of subscribers.values()) {
      const interval = 1000 / subscription.maxFps;
      if (timestamp - subscription.lastAt < interval) continue;
      subscription.lastAt = timestamp;
      try { subscription.listener(snapshot()); }
      catch (error) { PC.logger.error("audio-api-listener", error); }
    }
  };

  const releaseAnalyser = async () => {
    analyserGeneration += 1;
    const closingContext = context;
    const closingAnalyser = analyser;
    const closingSource = source;
    const closingSilence = silenceGain;
    const closingSourceLinks = sourceLinks;
    const closeContext = ownContext;
    context = null;
    analyser = null;
    source = null;
    silenceGain = null;
    sourceLinks = [];
    mediaElement = null;
    ownContext = false;
    sourceMode = "none";
    frequency = new Uint8Array(0);
    timeDomain = new Float32Array(0);
    previousSpectrum = new Uint8Array(0);
    adaptiveFloor = 0.018;
    adaptivePeak = 0.24;
    beatHold = 0;
    lastBeatAt = 0;
    counters.audioAnalysers = 0;
    counters.audioContexts = 0;
    if (closingSourceLinks.length > 0) closingSourceLinks.forEach(disconnectGraphLink);
    else {
      try {
        if (!closeContext && closingSource && closingAnalyser) closingSource.disconnect?.(closingAnalyser);
        else closingSource?.disconnect?.();
      } catch (error) { PC.logger.warn("audio-source-disconnect-failed", error); }
    }
    try { closingAnalyser?.disconnect?.(); } catch (error) { PC.logger.warn("audio-analyser-disconnect-failed", error); }
    try { closingSilence?.disconnect?.(); } catch (error) { PC.logger.warn("audio-silence-disconnect-failed", error); }
    if (closeContext && closingContext?.state !== "closed") {
      try { await closingContext.close(); } catch (error) { PC.logger.warn("audio-context-close-failed", error); }
    }
    if (closingContext) ownedContexts.delete(closingContext);
    silentMediaSince = 0;
  };

  const cancelAudioRefresh = () => {
    audioRefreshGeneration += 1;
    if (audioRefreshTimer) clearTimeout(audioRefreshTimer);
    audioRefreshTimer = 0;
  };

  function scheduleAudioRefresh(preferredAudio = null, delayMs = 60, force = false) {
    if (!serviceRunning || consumers.size === 0) return;
    const generation = ++audioRefreshGeneration;
    if (audioRefreshTimer) clearTimeout(audioRefreshTimer);
    audioRefreshTimer = setTimeout(async () => {
      audioRefreshTimer = 0;
      if (!serviceRunning || consumers.size === 0 || generation !== audioRefreshGeneration) return;
      const latestAudio = PC.dom.getSnapshot().audio;
      const targetAudio = latestAudio || preferredAudio || null;
      const graphSource = sourceMode === "host-audio-graph" || sourceMode === "pulsesync-host-graph";
      const needsReplacement = Boolean(analyser) && (force ||
        (targetAudio && targetAudio !== mediaElement) ||
        (!targetAudio && graphSource)
      );

      if (needsReplacement) {
        const previousMediaElement = mediaElement;
        await releaseAnalyser();
        if (previousMediaElement && previousMediaElement !== targetAudio) unbindAudioElement(previousMediaElement);
      }
      if (!serviceRunning || consumers.size === 0 || generation !== audioRefreshGeneration) return;
      if (!analyser) {
        if (!targetAudio) lastPulseSyncGraphProbeAt = -Infinity;
        await ensureAnalyser(targetAudio);
      }
    }, Math.max(0, Number(delayMs) || 0));
  }

  const syncFrameLoop = () => {
    if (!serviceRunning) return;
    if (consumers.size > 0 && !removeFrame) {
      installAudioGraphTap();
      const audio = PC.dom.getSnapshot().audio;
      if (audio) bindAudioLifecycle(audio);
      removeFrame = PC.runtime.addFrameListener(sample, 10);
      ensureAnalyser(audio);
    } else if (consumers.size === 0) {
      cancelAudioRefresh();
      removeFrame?.();
      removeFrame = null;
      unbindAudioLifecycle();
      uninstallAudioGraphTap();
      releaseAnalyser();
    }
  };

  const retain = (consumer) => {
    consumers.add(consumer || "anonymous");
    syncFrameLoop();
  };

  const release = (consumer) => {
    consumers.delete(consumer || "anonymous");
    syncFrameLoop();
  };

  const api = {
    version: 2,
    retain,
    release,
    getFrame: () => frame,
    getSnapshot: snapshot,
    getFormat: () => Object.freeze({
      sampleRate: context?.sampleRate || 0,
      fftSize: analyser?.fftSize || 0,
      frequencyBinCount: analyser?.frequencyBinCount || 0
    }),
    readFrequencyData(target) {
      if (!(target instanceof Uint8Array)) throw new TypeError("readFrequencyData expects Uint8Array");
      const length = Math.min(target.length, frequency.length);
      target.set(frequency.subarray(0, length), 0);
      return length;
    },
    readTimeDomainData(target) {
      if (!(target instanceof Float32Array)) throw new TypeError("readTimeDomainData expects Float32Array");
      const length = Math.min(target.length, timeDomain.length);
      target.set(timeDomain.subarray(0, length), 0);
      return length;
    },
    getSourceMode: () => sourceMode,
    stop: () => stopService()
  };

  const externalApi = Object.freeze({
    version: 1,
    getCapabilities: () => Object.freeze({
      scalarFrame: true,
      frequencyData: true,
      timeDomainData: true,
      bpm: true,
      mutableAnalyser: false
    }),
    getSnapshot: api.getSnapshot,
    getFormat: api.getFormat,
    readFrequencyData: api.readFrequencyData,
    readTimeDomainData: api.readTimeDomainData,
    subscribe(listener, options = {}) {
      if (typeof listener !== "function") throw new TypeError("PulseColorAudioAPI.subscribe expects a function");
      const maxFps = U.clamp(Number(options.maxFps) || 30, 1, 60);
      const id = ++externalSubscriberId;
      const consumer = `external:${id}`;
      subscribers.set(id, { id, listener, maxFps, lastAt: 0, consumer });
      counters.externalAudioSubscribers = subscribers.size;
      retain(consumer);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        const subscription = subscribers.get(id);
        subscribers.delete(id);
        counters.externalAudioSubscribers = subscribers.size;
        if (subscription) release(subscription.consumer);
      };
    }
  });

  const startService = () => {
    if (serviceRunning) return;
    serviceRunning = true;
    removeDom = PC.dom.subscribe((dom) => {
      if (consumers.size === 0) return;
      if (dom.audio) bindAudioLifecycle(dom.audio);
      scheduleAudioRefresh(dom.audio, 0);
    });
    removeTrack = PC.track?.subscribe?.(() => {
      PC.dom.requestScan?.();
      scheduleAudioRefresh(null, 100, true);
    }) || null;
    syncFrameLoop();
    window.dispatchEvent(new CustomEvent("pulsecolor:audio-api-ready", { detail: { version: 1 } }));
  };

  async function stopService() {
    if (!serviceRunning && !analyser && !removeFrame && subscribers.size === 0) return;
    serviceRunning = false;
    removeDom?.();
    removeDom = null;
    removeTrack?.();
    removeTrack = null;
    cancelAudioRefresh();
    removeFrame?.();
    removeFrame = null;
    consumers.clear();
    subscribers.clear();
    counters.externalAudioSubscribers = 0;
    unbindAudioLifecycle();
    uninstallAudioGraphTap();
    await releaseAnalyser();
    lastPulseSyncGraphProbeAt = -Infinity;
    pulseSyncGraphProbeRunning = false;
    silentMediaSince = 0;
    lastForcedMediaRefreshAt = -Infinity;
    clearFrame(performance.now(), 1000);
    window.dispatchEvent(new CustomEvent("pulsecolor:audio-api-stopped"));
  }

  PC.audio = api;
  window.PulseColorAudioAPI = externalApi;
  window.PulseColorAudio = Object.freeze({
    __v2: true,
    getState: api.getSnapshot,
    getSnapshot: api.getSnapshot,
    subscribe: externalApi.subscribe
  });
  if (typeof PC.runtime.registerService === "function") {
    PC.runtime.registerService("audio", { start: startService, stop: stopService });
  } else {
    startService();
  }
})();
