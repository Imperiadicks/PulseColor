/* ========================== PulseColor: AI BPM cascade gate + manual unlock ========================== */
(() => {
  const AI_WAIT_MS = 5000;
  const AI_RETRY_MS = 2200;
  const AI_STATUS_WAITING = 'waiting';
  const AI_STATUS_MANUAL = 'manual-search';
  const MODE_POLL_MS = 250;
  const META_POLL_MS = 180;
  const RATE_LIMIT_COOLDOWN_MS = 180000;
  const DRIVE_MODE_RAW = 'raw';
  const DRIVE_MODE_BPM = 'bpm';

  const AI_ENDPOINT = 'https://api.onlysq.ru/ai/v2';
  const AI_MODEL = 'gpt-5';
  const AI_KEY = 'sq-L4uZha9NlowdITyEPc2pFtrpCqbOD52g';
  const BPM_SOURCE_SITE = 'songbpm.com';

  const AI_UNAVAILABLE_MODELS = Object.freeze([
    'claude-opus-4-6',
    'claude-sonnet-4-6',
    'flux-2-dev',
    'gemini-3.1-pro',
    'gpt-5.4',
    'grok-2-image',
    'grok-2-vision',
    'grok-3',
    'grok-4-1-fast',
    'lucid-origin',
    'phoenix-1.0',
    'pplx-gemini-3.1-pro'
  ]);
  const AI_UNAVAILABLE_MODELS_SET = new Set(AI_UNAVAILABLE_MODELS);
  const AI_BROKEN_MODELS = Object.freeze([
    'o3-mini',
    'o3-mini-2025-01-31',
    'o4-mini',
    'o4-mini-2025-04-16'
  ]);
  const AI_BROKEN_MODELS_SET = new Set(AI_BROKEN_MODELS);
  const AI_MODEL_PRIORITY_DRAFT = Object.freeze([
    'gpt-5',
    'gpt-5-2025-08-07',
    'gpt-5-chat',
    'gpt-5-search',
    'gpt-5-search-api-2025-10-14',
    'gpt-5.1',
    'gpt-5.1-chat',
    'o3',
    'o3-2025-04-16',
    'o3-mini',
    'o3-mini-2025-01-31',
    'o4-mini',
    'o4-mini-2025-04-16',
    'gpt-4.1',
    'gpt-4.1-mini',
    'gpt-4o-search-preview',
    'gpt-4o-search-preview-2025-03-11',
    'gpt-4o-mini-search-preview',
    'gpt-4o-mini-search-preview-2025-03-11',
    'searchgpt',
    'chatgpt-4o',
    'gpt-4o',
    'gpt-4o-mini',
    'gemini-2.5-pro',
    'pplx-gpt-5.1',
    'pplx-gpt-5-mini',
    'pplx-gpt-5.2',
    'pplx-grok-4-1-fast',
    'sonar-reasoning-pro',
    'sonar-reasoning',
    'sonar-deep-research',
    'sonar-pro',
    'sonar',
    'qwen-max-latest',
    'qwen3-max',
    'qwen3-omni-flash',
    'qwen3-235b-a22b-2507',
    'qwen3-next-80b-a3b',
    'deepseek-r1',
    'deepseek-v3',
    'command-a-reasoning-08-2025',
    'command-r-plus-08-2024',
    'command-a-03-2025',
    'glm-4.7-flash',
    'zai-glm-4.6',
    'gpt-5-mini',
    'gpt-5-nano',
    'gpt-oss-120b',
    'gpt-oss-20b',
    'qwen-3-32b',
    'qwen2.5-72b-instruct',
    'qwen2.5-14b-instruct-1m',
    'qvq-72b-preview-0310',
    'llama-3.3-70b',
    'llama3.1-8b',
    'mistral-small-3.1'
  ]);
  const AI_ACTIVE_MODEL_POOL = Object.freeze(
    AI_MODEL_PRIORITY_DRAFT.filter((model, index, arr) => arr.indexOf(model) === index && !AI_UNAVAILABLE_MODELS_SET.has(model) && !AI_BROKEN_MODELS_SET.has(model))
  );
  const AI_MODEL_PROBE_PROMPT = 'Ответь только числом 200.';
  const AI_MODEL_PROBE_TIMEOUT_MS = 12000;

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const normBpm = (b) => {
    b = Math.round(+b || 0);
    if (!b) return 0;
    while (b < 50) b *= 2;
    while (b > 210) b = Math.round(b / 2);
    return clamp(b, 50, 210);
  };
  const normalizeSig = (s) => (s || '').toString().trim().replace(/\s+/g, ' ').toLowerCase();
  const normalizeDriveMode = (value) => {
    const mode = String(value || '').trim().toLowerCase();
    return mode === DRIVE_MODE_BPM ? DRIVE_MODE_BPM : DRIVE_MODE_RAW;
  };
  const getConfiguredDriveMode = () => normalizeDriveMode(window.BeatDriverConfig?.WAVE_DRIVE_MODE);

  const publishModelRegistry = () => {
    try {
      const snapshot = {
        endpoint: AI_ENDPOINT,
        sourceSite: BPM_SOURCE_SITE,
        currentModel: AI_MODEL,
        activeModels: AI_ACTIVE_MODEL_POOL.slice(),
        unavailableModels: AI_UNAVAILABLE_MODELS.slice(),
        brokenModels: AI_BROKEN_MODELS.slice(),
        priorityDraft: AI_MODEL_PRIORITY_DRAFT.slice()
      };
      window.__PulseColorAiModelRegistry = snapshot;
      const api = (window.PulseColorAiModels = window.PulseColorAiModels || {});
      api.getCurrentModel = () => snapshot.currentModel;
      api.getActiveModels = () => snapshot.activeModels.slice();
      api.getUnavailableModels = () => snapshot.unavailableModels.slice();
      api.getBrokenModels = () => snapshot.brokenModels.slice();
      api.getPriorityDraft = () => snapshot.priorityDraft.slice();
      api.getProbePrompt = () => AI_MODEL_PROBE_PROMPT;
      api.getLastProbe = () => safeJson(window.__PulseColorAiModelProbe || null);
      api.getLastProbeJson = (space = 2) => {
        try {
          return JSON.stringify(window.__PulseColorAiModelProbe || null, null, Number(space) || 2);
        } catch {
          return 'null';
        }
      };
      api.probeAll = (opts = {}) => probeAiModelsBatch(opts);
      api.probeActive = (opts = {}) => probeAiModelsBatch({ ...opts, models: AI_ACTIVE_MODEL_POOL.slice() });
      api.probeModels = (models = [], opts = {}) => probeAiModelsBatch({ ...opts, models });
      api.isUnavailable = (model) => AI_UNAVAILABLE_MODELS_SET.has(String(model || '').trim());
      api.hasModel = (model) => snapshot.activeModels.includes(String(model || '').trim());
    } catch {}
  };

  const requestCooldowns = new Map();
  const modelCooldowns = new Map();
  let seq = 0;
  let curTrackKey = '';
  let curTrackSig = '';
  let waitTimer = 0;
  let metaPollTimer = 0;
  let modePollTimer = 0;
  let activeRequest = null;
  let nextAiRetryAt = 0;
  let nativeAudioPlay = null;
  const releaseState = {
    lastAttemptAt: 0,
    lastDeferredLogAt: 0,
    lastUiClickAt: 0,
    lastUiClickKey: '',
    lastObserverReleaseAt: 0,
    lastObservedAudioSignature: ''
  };

  const AI_LOG_LIMIT = 250;
  const AI_ABORT_REASONS = new Set(['cancel', 'mode-change', 'track-change', 'raw-fallback', 'raw', 'timeout']);
  const AI_LOG_PREFIX = '[PulseColor AI]';
  const AI_VERBOSE_LOGS = (() => {
    try {
      return !!window.PulseColorDebug?.verboseAiLogs || !!window.__PULSECOLOR_VERBOSE_AI_LOGS__;
    } catch {
      return false;
    }
  })();
  const AI_CONSOLE_SILENT_EVENTS = new Set([
    'audio-bound',
    'audio-event',
    'gate-state',
    'media-play-call',
    'playback-guard-block',
    'playback-paused-and-rewind',
    'playback-release-attempt',
    'playback-release-deferred',
    'playback-release-abort-no-element',
    'playback-release-success',
    'playback-resume-cleared',
    'playback-resume-remembered'
  ]);
  const aiLogs = [];
  const safeJson = (value) => {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      try {
        return String(value);
      } catch {
        return null;
      }
    }
  };
  const shouldPrintAiLog = (entry) => {
    if (!entry) return false;
    if (entry.level === 'error') return true;
    if (AI_VERBOSE_LOGS) return true;
    return !AI_CONSOLE_SILENT_EVENTS.has(entry.event);
  };

  const pushAiLog = (event, payload = {}, level = 'info') => {
    const entry = {
      ts: new Date().toISOString(),
      time: Date.now(),
      level,
      event,
      payload: safeJson(payload)
    };
    aiLogs.push(entry);
    if (aiLogs.length > AI_LOG_LIMIT) aiLogs.splice(0, aiLogs.length - AI_LOG_LIMIT);
    try {
      window.__PulseColorAILogs = aiLogs;
      const api = (window.PulseColorAILogger = window.PulseColorAILogger || {});
      api.getLogs = () => aiLogs.slice();
      api.clear = () => { aiLogs.length = 0; };
      api.dump = () => aiLogs.slice();
      api.last = () => aiLogs[aiLogs.length - 1] || null;
      api.print = () => {
        try {
          console.table(aiLogs.map(({ ts, level, event, payload }) => ({ ts, level, event, payload: JSON.stringify(payload) })));
        } catch {}
        return aiLogs.slice();
      };
      window.dispatchEvent(new CustomEvent('pulsecolor:ai-log', { detail: entry }));
    } catch {}

    try {
      if (shouldPrintAiLog(entry)) {
        const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
        console[method](AI_LOG_PREFIX, event, entry.payload || {});
      }
    } catch {}
    return entry;
  };

  const gate = {
    selectedMode: getConfiguredDriveMode(),
    effectiveMode: DRIVE_MODE_RAW,
    status: 'raw',
    trackKey: '',
    pendingResume: false,
    pendingResumeEl: null,
    pendingResumeAt: 0,
  };

  let lastNet = { status: 'idle', src: '', bpm: 0 };
  const publishNet = () => { try { window.__PulseColorNet = { ...lastNet }; } catch {} };
  const publishMode = () => {
    try {
      const snapshot = {
        selectedMode: gate.selectedMode,
        effectiveMode: gate.effectiveMode,
        status: gate.status,
        trackKey: gate.trackKey,
        blocked: gate.selectedMode === DRIVE_MODE_BPM && gate.status === AI_STATUS_WAITING
      };
      window.__PulseColorWaveDrive = snapshot;
      const api = (window.PulseColorWaveMode = window.PulseColorWaveMode || {});
      api.getSelectedMode = () => snapshot.selectedMode;
      api.getEffectiveMode = () => snapshot.effectiveMode;
      api.isPlaybackBlocked = () => snapshot.blocked;
      api.canUseAI = () => snapshot.selectedMode === DRIVE_MODE_BPM && (snapshot.status === AI_STATUS_WAITING || snapshot.status === AI_STATUS_MANUAL);
      api.canUseTapTempo = () => false;
      api.canUseLocalBpm = () => false;
    } catch {}
  };
  const setGate = (patch = {}) => {
    const before = { ...gate };
    Object.assign(gate, patch);
    publishMode();
    const changed = ['selectedMode', 'effectiveMode', 'status', 'trackKey', 'pendingResume'].some((k) => before[k] !== gate[k]);
    if (changed) {
      pushAiLog('gate-state', {
        before: {
          selectedMode: before.selectedMode,
          effectiveMode: before.effectiveMode,
          status: before.status,
          trackKey: before.trackKey,
          pendingResume: before.pendingResume
        },
        after: {
          selectedMode: gate.selectedMode,
          effectiveMode: gate.effectiveMode,
          status: gate.status,
          trackKey: gate.trackKey,
          pendingResume: gate.pendingResume
        }
      });
    }
  };
  publishNet();
  publishMode();
  publishModelRegistry();
  pushAiLog('ai-model-registry', {
    currentModel: AI_MODEL,
    activeCount: AI_ACTIVE_MODEL_POOL.length,
    unavailableCount: AI_UNAVAILABLE_MODELS.length,
    unavailableModels: AI_UNAVAILABLE_MODELS.slice(),
    brokenCount: AI_BROKEN_MODELS.length,
    brokenModels: AI_BROKEN_MODELS.slice()
  });
  pushAiLog('init', {
    endpoint: AI_ENDPOINT,
    model: AI_MODEL,
    sourceSite: BPM_SOURCE_SITE,
    selectedMode: gate.selectedMode,
    effectiveMode: gate.effectiveMode,
    status: gate.status,
    waitMs: AI_WAIT_MS
  });

  const isAiSearchStatus = (status = gate.status) => status === AI_STATUS_WAITING || status === AI_STATUS_MANUAL;
  const getModelCooldownUntil = (model) => modelCooldowns.get(String(model || '').trim()) || 0;
  const getModelCooldownRemainingMs = (model) => Math.max(0, getModelCooldownUntil(model) - Date.now());
  const setModelCooldown = (model, delayMs) => {
    const safeModel = String(model || '').trim();
    if (!safeModel) return 0;
    const ms = Math.max(RATE_LIMIT_COOLDOWN_MS, Number(delayMs) || RATE_LIMIT_COOLDOWN_MS);
    const until = Date.now() + ms;
    modelCooldowns.set(safeModel, until);
    return until;
  };
  const getAiRetryDelayMs = (fallbackMs = AI_RETRY_MS) => {
    const remaining = AI_ACTIVE_MODEL_POOL
      .map((model) => getModelCooldownRemainingMs(model))
      .filter((value) => value > 0)
      .sort((a, b) => a - b);
    if (!remaining.length) return Math.max(500, Number(fallbackMs) || AI_RETRY_MS);
    return Math.max(900, Math.min(Math.max(500, Number(fallbackMs) || AI_RETRY_MS), remaining[0]));
  };
  const setNextAiRetry = (delayMs = AI_RETRY_MS) => {
    nextAiRetryAt = Date.now() + Math.max(500, Number(delayMs) || AI_RETRY_MS);
    return nextAiRetryAt;
  };
  const clearNextAiRetry = () => {
    nextAiRetryAt = 0;
  };

  const qText = (selectors, root = document) => {
    for (const selector of selectors) {
      const el = root.querySelector(selector);
      const txt = el?.textContent?.trim();
      if (txt) return txt;
    }
    return '';
  };

  const parseTitleLike = (raw) => {
    const txt = String(raw || '').replace(/\s*[-–—|•]\s*Яндекс\s*Музыка.*$/i, '').trim();
    if (!txt) return { title: '', artist: '' };
    const parts = txt.split(/\s+[—–-]\s+/).map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) return { artist: parts[0], title: parts.slice(1).join(' — ') };
    return { artist: '', title: txt };
  };

  const getCoverSig = () => {
    const img = document.querySelector('div[data-test-id="PLAYERBAR_DESKTOP_COVER_CONTAINER"] img')
      || document.querySelector('img[data-test-id="ENTITY_COVER_IMAGE"]')
      || document.querySelector('[class*="PlayerBar"] img[src], [class*="playerBar"] img[src]');
    const src = img?.src || '';
    return src.replace(/\/(?:100x100|200x200|400x400|1000x1000)(?=[/?]|$)/g, '');
  };

  const getTrackMeta = () => {
    const md = navigator.mediaSession?.metadata;
    let title = (md?.title || '').trim();
    let artist = (md?.artist || md?.albumArtist || '').trim();

    if (!title) {
      title = qText([
        '[data-test-id="PLAYERBAR_DESKTOP_TRACK_TITLE"]',
        '[data-test-id="PLAYERBAR_DESKTOP_TITLE"]',
        '[data-test-id="PLAYERBAR_TRACK_TITLE"]',
        '[data-test-id="PLAYERBAR_TITLE"]',
        '[class*="PlayerBarDesktop"] a[href*="/track/"]',
        '[class*="PlayerBar"] a[href*="/track/"]',
        '[class*="PlayerBarDesktop"] [title]',
        '[class*="PlayerBar"] [title]'
      ]);
    }

    if (!artist) {
      artist = qText([
        '[data-test-id="PLAYERBAR_DESKTOP_TRACK_ARTIST"]',
        '[data-test-id="PLAYERBAR_DESKTOP_ARTIST"]',
        '[data-test-id="PLAYERBAR_TRACK_ARTIST"]',
        '[data-test-id="PLAYERBAR_ARTIST"]',
        '[class*="PlayerBarDesktop"] a[href*="/artist/"]',
        '[class*="PlayerBar"] a[href*="/artist/"]'
      ]);
    }

    if ((!title || !artist) && document.title) {
      const parsed = parseTitleLike(document.title);
      if (!artist && parsed.artist) artist = parsed.artist;
      if (!title && parsed.title) title = parsed.title;
    }

    const coverSig = getCoverSig();
    const sig = normalizeSig(`${artist} - ${title}`);
    const key = sig || coverSig || normalizeSig(document.title);

    return {
      title: title.trim(),
      artist: artist.trim(),
      sig,
      key,
      coverSig
    };
  };

  const simplifyTrackTitle = (value) => String(value || '')
    .replace(/\s*\((?:feat\.?|ft\.?|featuring|with|prod\.? by|from|remaster(?:ed)?(?: \d{4})?|live|version|edit|mix|sped up|slowed(?: and reverb)?)[^)]*\)/gi, ' ')
    .replace(/\s*-\s*(?:feat\.?|ft\.?|featuring|with|from|remaster(?:ed)?(?: \d{4})?|live|version|edit|mix|sped up|slowed(?: and reverb)?).*$/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const buildSongBpmQueries = (artist, track) => {
    const artSafe = String(artist || '').trim();
    const trackSafe = String(track || '').trim();
    const simpleTrack = simplifyTrackTitle(trackSafe);
    const unique = new Set();

    [
      `${artSafe} ${trackSafe}`.trim(),
      `${artSafe} - ${trackSafe}`.trim(),
      simpleTrack && simpleTrack !== trackSafe ? `${artSafe} ${simpleTrack}`.trim() : '',
      simpleTrack && simpleTrack !== trackSafe ? `${artSafe} - ${simpleTrack}`.trim() : ''
    ].filter(Boolean).forEach((q) => unique.add(q));

    return [...unique];
  };

  const buildBpmPrompt = (artist, track) => {
    const artSafe = artist || '—';
    const trackSafe = track || '—';
    const queryHints = buildSongBpmQueries(artist, track);

    return [
      'Ты определяешь BPM музыкального трека.',
      `Используй только сайт ${BPM_SOURCE_SITE}. Другие сайты, базы и догадки запрещены.`,
      `Нужно искать только страницы результатов вида https://${BPM_SOURCE_SITE}/searches/...`,
      'Сначала ищи точное совпадение артист + трек.',
      'Затем проверь, что в найденной строке SongBPM совпадает артист и название трека.',
      'Разрешено считать совпадением только вариант того же трека после очистки служебных хвостов вроде feat, remaster, live, edit, mix, version.',
      'Игнорируй другие песни с похожим названием, ремиксы, каверы и других артистов.',
      'Если точного совпадения на SongBPM нет — верни только 0.',
      'Ответ должен быть только одним целым числом BPM без слов, пояснений и markdown.',
      '',
      '=== Артист ===',
      artSafe,
      '',
      '=== Трек ===',
      `${artSafe} — ${trackSafe}`,
      '',
      '=== Поисковые запросы для SongBPM ===',
      ...queryHints.map((q, i) => `${i + 1}. site:${BPM_SOURCE_SITE}/searches "${q}"`)
    ].join('\n');
  };

  const parseBpmValue = (raw) => {
    if (raw == null) return 0;
    if (typeof raw === 'number') return normBpm(raw);

    const txt = String(raw).trim();
    if (!txt) return 0;

    try {
      const j = JSON.parse(txt);
      const jsonCandidate = j?.bpm ?? j?.tempo ?? j?.data?.bpm ?? j?.result?.bpm ?? j?.response?.bpm;
      if (typeof jsonCandidate !== 'undefined') return normBpm(jsonCandidate);
    } catch {}

    const labelled = [
      /\b(?:bpm|tempo)\s*[:=~-]?\s*(\d{2,3}(?:[.,]\d+)?)\b/i,
      /\b(\d{2,3}(?:[.,]\d+)?)\s*bpm\b/i
    ];
    for (const rx of labelled) {
      const m = txt.match(rx);
      if (m) return normBpm(String(m[1]).replace(',', '.'));
    }

    const compact = txt.replace(/^[^\d-]+|[^\d.]+$/g, '').trim();
    if (/^\d{2,3}(?:[.,]\d+)?$/.test(compact)) return normBpm(compact.replace(',', '.'));

    const candidates = [];
    const rx = /(^|[^\d:])(\d{2,3}(?:[.,]\d+)?)(?![:\d])/g;
    let m;
    while ((m = rx.exec(txt))) {
      const num = Number(String(m[2]).replace(',', '.'));
      if (Number.isFinite(num) && num >= 50 && num <= 210) candidates.push(num);
    }
    if (!candidates.length) return 0;
    return normBpm(candidates[candidates.length - 1]);
  };

  const getRetryAfterMs = (res) => {
    const raw = res?.headers?.get?.('retry-after');
    if (!raw) return RATE_LIMIT_COOLDOWN_MS;
    const num = Number(raw);
    if (Number.isFinite(num) && num > 0) return Math.max(RATE_LIMIT_COOLDOWN_MS, num * 1000);
    const when = Date.parse(raw);
    if (Number.isFinite(when)) return Math.max(RATE_LIMIT_COOLDOWN_MS, when - Date.now());
    return RATE_LIMIT_COOLDOWN_MS;
  };

  const dedupeModelList = (models) => {
    const list = Array.isArray(models) ? models : [];
    const out = [];
    const seen = new Set();
    for (const item of list) {
      const model = String(item || '').trim();
      if (!model || seen.has(model)) continue;
      seen.add(model);
      out.push(model);
    }
    return out;
  };

  const buildAiRequestBody = (model, prompt) => ({
    model,
    request: {
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    }
  });

  const probeAiModel = async (model, { prompt = AI_MODEL_PROBE_PROMPT, timeoutMs = AI_MODEL_PROBE_TIMEOUT_MS } = {}) => {
    const cleanModel = String(model || '').trim();
    const cleanPrompt = String(prompt || '').trim() || AI_MODEL_PROBE_PROMPT;
    const safeTimeoutMs = Math.max(1000, Number(timeoutMs) || AI_MODEL_PROBE_TIMEOUT_MS);
    const ctrl = new AbortController();
    const startedAt = Date.now();
    const timer = setTimeout(() => {
      try { ctrl.abort('probe-timeout'); } catch {}
    }, safeTimeoutMs);

    pushAiLog('ai-model-probe-start', {
      model: cleanModel,
      timeoutMs: safeTimeoutMs
    });

    try {
      const res = await fetch(AI_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AI_KEY}`
        },
        signal: ctrl.signal,
        body: JSON.stringify(buildAiRequestBody(cleanModel, cleanPrompt))
      });

      let raw = '';
      try { raw = await res.text(); } catch {}

      let parsed = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch {}

      const content =
        parsed?.choices?.[0]?.message?.content ??
        parsed?.message?.content ??
        parsed?.content ??
        raw ??
        '';

      const result = {
        model: cleanModel,
        ok: res.ok,
        status: Number(res.status) || 0,
        elapsedMs: Date.now() - startedAt,
        contentSnippet: String(content || '').slice(0, 120)
      };

      pushAiLog('ai-model-probe-http', {
        model: result.model,
        status: result.status,
        ok: result.ok,
        elapsedMs: result.elapsedMs,
        contentSnippet: result.contentSnippet
      }, res.ok ? 'info' : 'warn');

      return result;
    } catch (err) {
      const reason = ctrl?.signal?.aborted
        ? String(ctrl.signal.reason || err?.message || 'probe-timeout')
        : String(err?.message || err || 'probe-error');
      const result = {
        model: cleanModel,
        ok: false,
        status: reason === 'probe-timeout' ? 408 : 0,
        elapsedMs: Date.now() - startedAt,
        error: reason
      };
      pushAiLog('ai-model-probe-error', {
        model: result.model,
        status: result.status,
        elapsedMs: result.elapsedMs,
        error: result.error
      }, 'warn');
      return result;
    } finally {
      clearTimeout(timer);
    }
  };

  const buildAiProbeSummary = (results, {
    prompt = AI_MODEL_PROBE_PROMPT,
    timeoutMs = AI_MODEL_PROBE_TIMEOUT_MS,
    testedModels = [],
    skippedUnavailable = []
  } = {}) => {
    const cleanResults = Array.isArray(results) ? results.map((item) => ({ ...item })) : [];
    const ok200 = [];
    const http500 = [];
    const otherHttp = [];
    const timeout = [];
    const networkErrors = [];
    const byModel = {};

    for (const item of cleanResults) {
      const model = String(item?.model || '').trim();
      if (!model) continue;
      byModel[model] = { ...item };
      if (item.status === 200) {
        ok200.push(model);
      } else if (item.status === 500) {
        http500.push(model);
      } else if (item.status === 408) {
        timeout.push(model);
      } else if (item.status > 0) {
        otherHttp.push({ model, status: item.status });
      } else {
        networkErrors.push({ model, error: String(item?.error || 'unknown-error') });
      }
    }

    return {
      testedAt: new Date().toISOString(),
      endpoint: AI_ENDPOINT,
      prompt: String(prompt || '').trim() || AI_MODEL_PROBE_PROMPT,
      timeoutMs: Math.max(1000, Number(timeoutMs) || AI_MODEL_PROBE_TIMEOUT_MS),
      totalTested: cleanResults.length,
      testedModels: dedupeModelList(testedModels),
      skippedUnavailable: dedupeModelList(skippedUnavailable),
      ok200,
      http500,
      otherHttp,
      timeout,
      networkErrors,
      byModel
    };
  };

  const storeAiProbeSummary = (summary) => {
    try {
      window.__PulseColorAiModelProbe = safeJson(summary);
      window.__PulseColorAiModelProbeJson = JSON.stringify(summary, null, 2);
    } catch {}
    return summary;
  };

  const probeAiModelsBatch = async ({
    models = AI_ACTIVE_MODEL_POOL,
    prompt = AI_MODEL_PROBE_PROMPT,
    timeoutMs = AI_MODEL_PROBE_TIMEOUT_MS,
    includeUnavailable = false
  } = {}) => {
    const uniqueModels = dedupeModelList(Array.isArray(models) ? models : AI_ACTIVE_MODEL_POOL);
    const skippedUnavailable = includeUnavailable ? [] : uniqueModels.filter((model) => AI_UNAVAILABLE_MODELS_SET.has(model));
    const testedModels = includeUnavailable ? uniqueModels : uniqueModels.filter((model) => !AI_UNAVAILABLE_MODELS_SET.has(model));

    pushAiLog('ai-model-probe-batch-start', {
      count: testedModels.length,
      skippedUnavailable: skippedUnavailable.length,
      timeoutMs: Math.max(1000, Number(timeoutMs) || AI_MODEL_PROBE_TIMEOUT_MS),
      includeUnavailable,
      models: testedModels
    }, 'warn');

    const results = await Promise.all(testedModels.map((model) => probeAiModel(model, { prompt, timeoutMs })));
    const summary = buildAiProbeSummary(results, {
      prompt,
      timeoutMs,
      testedModels,
      skippedUnavailable
    });

    storeAiProbeSummary(summary);

    pushAiLog('ai-model-probe-batch-finish', {
      totalTested: summary.totalTested,
      ok200: summary.ok200.length,
      http500: summary.http500.length,
      otherHttp: summary.otherHttp.length,
      timeout: summary.timeout.length,
      networkErrors: summary.networkErrors.length
    }, summary.http500.length || summary.otherHttp.length || summary.timeout.length || summary.networkErrors.length ? 'warn' : 'info');

    return summary;
  };

  const abortActiveRequest = (reason = 'cancel') => {
    if (activeRequest) {
      pushAiLog('ai-request-abort', {
        reason,
        key: activeRequest.key || '',
        seq: activeRequest.seq || 0
      }, 'warn');
    }
    try { activeRequest?.ctrl?.abort?.(reason); } catch {}
    activeRequest = null;
  };

  const fetchAiBpm = async (meta, mySeq) => {
    if (!meta?.title || !meta?.artist || !meta?.key) {
      pushAiLog('ai-request-skip-no-meta', {
        seq: mySeq,
        title: meta?.title || '',
        artist: meta?.artist || '',
        key: meta?.key || ''
      }, 'warn');
      return;
    }

    pushAiLog('ai-request-prepare', {
      seq: mySeq,
      title: meta.title,
      artist: meta.artist,
      key: meta.key
    });

    const trackCooldownUntil = requestCooldowns.get(meta.key) || 0;
    if (trackCooldownUntil > Date.now()) {
      lastNet = { status: 'cooldown', src: 'ai', bpm: 0 };
      publishNet();
      pushAiLog('ai-request-cooldown', {
        seq: mySeq,
        key: meta.key,
        cooldownUntil: trackCooldownUntil
      }, 'warn');
      return { bpm: 0, src: 'ai-track-cooldown', retryDelayMs: Math.max(900, trackCooldownUntil - Date.now()) };
    }

    if (activeRequest && activeRequest.key === meta.key && activeRequest.seq === mySeq) {
      pushAiLog('ai-request-reuse', {
        seq: mySeq,
        key: meta.key,
        model: activeRequest.model || ''
      });
      return activeRequest.promise;
    }

    const prompt = buildBpmPrompt(meta.artist, meta.title);
    const models = AI_ACTIVE_MODEL_POOL.slice();

    pushAiLog('ai-cascade-start', {
      seq: mySeq,
      key: meta.key,
      title: meta.title,
      artist: meta.artist,
      models
    });

    const promise = (async () => {
      let sawRateLimit = false;
      let sawServiceUnavailable = false;
      let sawHttpError = false;

      for (const model of models) {
        if (mySeq !== seq) return { bpm: 0, src: 'ai-abort' };
        if (getConfiguredDriveMode() !== DRIVE_MODE_BPM) return { bpm: 0, src: 'ai-abort' };
        if (!isAiSearchStatus(gate.status)) return { bpm: 0, src: 'ai-abort' };

        const cooldownUntil = getModelCooldownUntil(model);
        if (cooldownUntil > Date.now()) {
          pushAiLog('ai-model-skip-cooldown', {
            seq: mySeq,
            key: meta.key,
            model,
            cooldownUntil,
            retryInMs: cooldownUntil - Date.now()
          }, 'warn');
          sawRateLimit = true;
          continue;
        }

        const ctrl = new AbortController();
        activeRequest = { key: meta.key, seq: mySeq, ctrl, model, promise: null };

        pushAiLog('ai-request-start', {
          seq: mySeq,
          key: meta.key,
          artist: meta.artist,
          title: meta.title,
          endpoint: AI_ENDPOINT,
          model,
          sourceSite: BPM_SOURCE_SITE
        });

        try {
          const res = await fetch(AI_ENDPOINT, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${AI_KEY}`
            },
            signal: ctrl.signal,
            body: JSON.stringify(buildAiRequestBody(model, prompt))
          });

          pushAiLog('ai-response-http', {
            seq: mySeq,
            key: meta.key,
            model,
            status: res.status,
            ok: res.ok
          }, res.ok ? 'info' : 'warn');

          if (!res.ok) {
            if (res.status === 429) {
              const retryAfterMs = getRetryAfterMs(res);
              setModelCooldown(model, retryAfterMs);
              sawRateLimit = true;
              pushAiLog('ai-response-rate-limit', {
                seq: mySeq,
                key: meta.key,
                model,
                retryAfterMs
              }, 'warn');
              continue;
            }

            if (res.status === 503) sawServiceUnavailable = true;
            else sawHttpError = true;

            pushAiLog('ai-response-http-error', {
              seq: mySeq,
              key: meta.key,
              model,
              status: res.status
            }, 'error');
            continue;
          }

          const j = await res.json();
          const content =
            j?.choices?.[0]?.message?.content ??
            j?.message?.content ??
            j?.content ??
            '';
          const bpm = parseBpmValue(content);
          pushAiLog('ai-response-parse', {
            seq: mySeq,
            key: meta.key,
            model,
            raw: String(content || '').slice(0, 200),
            bpm
          }, bpm ? 'info' : 'warn');

          if (bpm) return { bpm, src: 'ai', model };
        } catch (err) {
          const abortReason = ctrl?.signal?.aborted
            ? (ctrl.signal.reason ?? err?.message ?? String(err || 'abort'))
            : (err?.name === 'AbortError' ? (ctrl?.signal?.reason ?? 'AbortError') : '');
          const abortText = String(abortReason || '').trim();
          if (ctrl?.signal?.aborted || err?.name === 'AbortError' || AI_ABORT_REASONS.has(abortText)) {
            pushAiLog('ai-response-abort', {
              seq: mySeq,
              key: meta.key,
              model,
              reason: abortText || 'abort'
            }, 'warn');
            return { bpm: 0, src: 'ai-abort' };
          }
          sawHttpError = true;
          pushAiLog('ai-response-error', {
            seq: mySeq,
            key: meta.key,
            model,
            error: err?.message || String(err || 'unknown-error')
          }, 'error');
        } finally {
          pushAiLog('ai-request-finish', {
            seq: mySeq,
            key: meta.key,
            model,
            activeMatch: activeRequest?.ctrl === ctrl
          });
          if (activeRequest?.ctrl === ctrl) activeRequest = null;
        }
      }

      if (sawRateLimit) return { bpm: 0, src: 'ai-rate-limit', retryDelayMs: getAiRetryDelayMs(AI_RETRY_MS) };
      if (sawServiceUnavailable) return { bpm: 0, src: 'ai-service-unavailable', retryDelayMs: AI_RETRY_MS };
      if (sawHttpError) return { bpm: 0, src: 'ai-http-error', retryDelayMs: AI_RETRY_MS };
      return { bpm: 0, src: 'ai-miss', retryDelayMs: AI_RETRY_MS };
    })();

    if (activeRequest) activeRequest.promise = promise;
    return promise;
  };

  const clearWaitTimer = () => {
    if (!waitTimer) return;
    clearTimeout(waitTimer);
    waitTimer = 0;
  };
  const clearMetaPoll = () => {
    if (!metaPollTimer) return;
    clearInterval(metaPollTimer);
    metaPollTimer = 0;
  };

  const shouldBlockPlayback = (el = null) => {
    if (getConfiguredDriveMode() !== DRIVE_MODE_BPM) return false;
    if (gate.selectedMode !== DRIVE_MODE_BPM) return false;
    if (gate.status !== AI_STATUS_WAITING) return false;
    if (el && el.tagName !== 'AUDIO') return false;
    return true;
  };

  const canRetryReleaseNow = () => (Date.now() - releaseState.lastAttemptAt) >= 350;
  const shouldLogDeferredNow = () => (Date.now() - releaseState.lastDeferredLogAt) >= 1200;

  const pickPlayButton = () => {
    const selectors = [
      '[data-test-id="PLAYERBAR_DESKTOP_PLAY_BUTTON"]',
      '[data-test-id="PLAYERBAR_PLAY_BUTTON"]',
      '[data-test-id="PLAYERBAR_DESKTOP_PLAY_PAUSE_BUTTON"]',
      '[data-test-id="PLAYERBAR_PLAY_PAUSE_BUTTON"]',
      'button[aria-label*="Играть"]',
      'button[aria-label*="Воспроизвести"]',
      'button[aria-label*="Play"]',
      'button[title*="Играть"]',
      'button[title*="Play"]'
    ];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) return el;
    }
    return null;
  };

  const tryUiPlayFallback = (reason = 'ui-fallback') => {
    const now = Date.now();
    if ((now - releaseState.lastUiClickAt) < 900 && releaseState.lastUiClickKey === (gate.trackKey || '')) return false;
    const btn = pickPlayButton();
    if (!btn) return false;
    releaseState.lastUiClickAt = now;
    releaseState.lastUiClickKey = gate.trackKey || '';
    pushAiLog('playback-release-ui-click', {
      reason,
      status: gate.status,
      trackKey: gate.trackKey
    }, 'warn');
    try {
      btn.click();
      return true;
    } catch (err) {
      pushAiLog('playback-release-ui-click-error', {
        reason,
        error: err?.message || String(err || 'ui-click-error')
      }, 'error');
      return false;
    }
  };

  const clearPendingResumeIntent = (reason = 'clear') => {
    if (!gate.pendingResume && !gate.pendingResumeEl) return;
    gate.pendingResume = false;
    gate.pendingResumeEl = null;
    gate.pendingResumeAt = 0;
    releaseState.lastObserverReleaseAt = 0;
    releaseState.lastObservedAudioSignature = '';
    pushAiLog('playback-resume-cleared', {
      reason,
      status: gate.status,
      trackKey: gate.trackKey
    });
  };

  const rememberResumeIntent = (el = null) => {
    gate.pendingResume = true;
    gate.pendingResumeEl = el || gate.pendingResumeEl || null;
    gate.pendingResumeAt = Date.now();
    releaseState.lastObserverReleaseAt = 0;
    releaseState.lastObservedAudioSignature = '';
    pushAiLog('playback-resume-remembered', {
      hasElement: !!gate.pendingResumeEl,
      status: gate.status,
      trackKey: gate.trackKey
    });
  };

  const pauseAndRewind = (el, { remember = false } = {}) => {
    if (!el) return;
    if (remember) rememberResumeIntent(el);
    pushAiLog('playback-paused-and-rewind', {
      remember,
      currentTime: Number(el.currentTime || 0),
      status: gate.status,
      trackKey: gate.trackKey
    }, 'warn');
    try { el.pause?.(); } catch {}
    try { el.currentTime = 0; } catch {}
  };

  const stopAllAudioForGate = () => {
    document.querySelectorAll('audio').forEach((el) => {
      if (!el.paused) pauseAndRewind(el, { remember: true });
    });
  };

  const pickResumeAudio = () => {
    const all = Array.from(document.querySelectorAll('audio'));
    if (gate.pendingResumeEl && gate.pendingResumeEl.isConnected) return gate.pendingResumeEl;
    return all.find(el => el.isConnected) || null;
  };

  const getAudioObserverSignature = () => Array.from(document.querySelectorAll('audio'))
    .map((el, index) => {
      const src = el.currentSrc || el.src || '';
      return `${index}:${src}:${el.readyState}:${el.paused ? 'p' : 'r'}`;
    })
    .join('|');

  const releasePendingPlayback = (reason = 'deferred') => {
    if (!gate.pendingResume) return false;
    releaseState.lastAttemptAt = Date.now();
    const el = pickResumeAudio();
    pushAiLog('playback-release-attempt', {
      reason,
      hasElement: !!el,
      status: gate.status,
      trackKey: gate.trackKey
    });

    if (!el) {
      const pendingAgeMs = gate.pendingResumeAt ? (Date.now() - gate.pendingResumeAt) : 0;
      if ((gate.status === 'bpm-active' || gate.status === AI_STATUS_MANUAL) && pendingAgeMs >= 2200) {
        pushAiLog('playback-release-abort-no-element', {
          reason,
          pendingAgeMs,
          status: gate.status,
          trackKey: gate.trackKey
        }, 'warn');
        clearPendingResumeIntent('bpm-active-no-audio-element');
        return false;
      }
      const uiTriggered = tryUiPlayFallback(reason);
      if (uiTriggered) return true;
      return false;
    }

    gate.pendingResumeEl = el;
    try {
      const ret = nativeAudioPlay ? nativeAudioPlay.call(el) : el.play?.();
      clearPendingResumeIntent(`${reason}:play-ok`);
      if (ret && typeof ret.catch === 'function') ret.catch((err) => {
        gate.pendingResume = true;
        gate.pendingResumeEl = el;
        gate.pendingResumeAt = Date.now();
        pushAiLog('playback-release-catch', {
          reason,
          error: err?.message || String(err || 'play-catch')
        }, 'warn');
        tryUiPlayFallback(`${reason}:catch`);
      });
      return true;
    } catch (err) {
      gate.pendingResume = true;
      gate.pendingResumeEl = el;
      gate.pendingResumeAt = Date.now();
      pushAiLog('playback-release-error', {
        reason,
        error: err?.message || String(err || 'play-error')
      }, 'error');
      return tryUiPlayFallback(`${reason}:error`);
    }
  };

  const tryReleasePendingPlayback = (reason = 'deferred') => {
    if (!gate.pendingResume) return false;
    if (gate.status === AI_STATUS_WAITING) return false;
    if (!canRetryReleaseNow()) return false;
    const ok = releasePendingPlayback(reason);
    if (ok) {
      pushAiLog('playback-release-success', { reason, status: gate.status, trackKey: gate.trackKey });
      return true;
    }
    if (shouldLogDeferredNow()) {
      releaseState.lastDeferredLogAt = Date.now();
      pushAiLog('playback-release-deferred', { reason, status: gate.status, trackKey: gate.trackKey }, 'warn');
    }
    return false;
  };

  const tryReleasePendingPlaybackOnAudioMutation = (reason = 'audio-dom-change') => {
    if (!gate.pendingResume) return false;
    if (gate.status === AI_STATUS_WAITING) return false;

    const signature = getAudioObserverSignature();
    if (!signature) return false;

    const now = Date.now();
    if (
      releaseState.lastObservedAudioSignature === signature
      && (now - releaseState.lastObserverReleaseAt) < 900
    ) {
      return false;
    }

    releaseState.lastObservedAudioSignature = signature;
    releaseState.lastObserverReleaseAt = now;
    return tryReleasePendingPlayback(reason);
  };

  const enterManualSearchMode = ({ reason = 'manual-unlock', trackKey = '' } = {}) => {
    pushAiLog('manual-search-unlock', {
      reason,
      trackKey: trackKey || gate.trackKey || curTrackKey
    }, 'warn');
    clearWaitTimer();
    releaseState.lastAttemptAt = 0;
    releaseState.lastDeferredLogAt = 0;
    setGate({
      selectedMode: DRIVE_MODE_BPM,
      effectiveMode: DRIVE_MODE_RAW,
      status: AI_STATUS_MANUAL,
      trackKey: trackKey || gate.trackKey || curTrackKey
    });
    lastNet = { status: 'manual', src: 'ai-search', bpm: 0 };
    publishNet();
    clearPendingResumeIntent('manual-unlock');
  };

  const enterRawMode = ({ reason = 'raw', resume = false, trackKey = '' } = {}) => {
    pushAiLog('enter-raw-mode', {
      reason,
      resume,
      trackKey: trackKey || gate.trackKey || curTrackKey
    }, reason === 'raw' ? 'info' : 'warn');
    clearWaitTimer();
    clearMetaPoll();
    clearNextAiRetry();
    abortActiveRequest(reason);
    releaseState.lastAttemptAt = 0;
    releaseState.lastDeferredLogAt = 0;
    setGate({
      selectedMode: getConfiguredDriveMode(),
      effectiveMode: DRIVE_MODE_RAW,
      status: reason,
      trackKey: trackKey || gate.trackKey || curTrackKey
    });
    lastNet = { status: reason === 'raw' ? 'raw' : 'miss', src: reason === 'raw' ? 'raw' : reason, bpm: 0 };
    publishNet();
    if (resume) tryReleasePendingPlayback('enter-raw-mode');
  };

  const applyAiBpm = (meta, out) => {
    pushAiLog('ai-bpm-apply', {
      key: meta?.key || '',
      title: meta?.title || '',
      artist: meta?.artist || '',
      bpm: out?.bpm || 0,
      src: out?.src || 'ai',
      model: out?.model || ''
    });
    clearWaitTimer();
    clearMetaPoll();
    clearNextAiRetry();
    releaseState.lastAttemptAt = 0;
    releaseState.lastDeferredLogAt = 0;
    setGate({
      selectedMode: DRIVE_MODE_BPM,
      effectiveMode: DRIVE_MODE_BPM,
      status: 'bpm-active',
      trackKey: meta?.key || gate.trackKey || curTrackKey
    });
    curTrackSig = meta?.sig || curTrackSig;
    lastNet = { status: 'hit', src: out.src || 'ai', bpm: out.bpm, model: out.model || '' };
    publishNet();
    try { window.OsuBeat?.retune?.({ presetBpm: out.bpm, source: 'ai' }); } catch {}
    tryReleasePendingPlayback('ai-bpm-apply');
  };

  const resolveWithAi = async (meta, mySeq) => {
    if (!meta?.title || !meta?.artist || !meta?.key) {
      pushAiLog('ai-resolve-skip-no-meta', {
        seq: mySeq,
        key: meta?.key || ''
      }, 'warn');
      return;
    }
    pushAiLog('ai-resolve-start', {
      seq: mySeq,
      key: meta.key,
      title: meta.title,
      artist: meta.artist
    });
    const out = await fetchAiBpm(meta, mySeq);
    if (!out) {
      pushAiLog('ai-resolve-empty', {
        seq: mySeq,
        key: meta.key
      }, 'warn');
      return;
    }
    if (mySeq !== seq) {
      pushAiLog('ai-resolve-stale-seq', {
        requestSeq: mySeq,
        currentSeq: seq,
        key: meta.key,
        src: out.src || ''
      }, 'warn');
      return;
    }
    if (getConfiguredDriveMode() !== DRIVE_MODE_BPM) {
      pushAiLog('ai-resolve-skip-mode-changed', {
        seq: mySeq,
        key: meta.key,
        mode: getConfiguredDriveMode(),
        src: out.src || ''
      }, 'warn');
      return;
    }
    if (!isAiSearchStatus(gate.status)) {
      pushAiLog('ai-resolve-skip-status', {
        seq: mySeq,
        key: meta.key,
        status: gate.status,
        src: out.src || ''
      }, 'warn');
      return;
    }
    if ((meta.key || '') !== (gate.trackKey || '')) {
      pushAiLog('ai-resolve-skip-track-mismatch', {
        seq: mySeq,
        key: meta.key,
        gateTrackKey: gate.trackKey,
        src: out.src || ''
      }, 'warn');
      return;
    }

    if (out.bpm) {
      pushAiLog('ai-resolve-hit', {
        seq: mySeq,
        key: meta.key,
        bpm: out.bpm,
        src: out.src || 'ai',
        model: out.model || ''
      });
      applyAiBpm(meta, out);
      return;
    }

    if (out.src === 'ai-abort') {
      pushAiLog('ai-resolve-aborted', {
        seq: mySeq,
        key: meta.key
      }, 'warn');
      return;
    }

    const retryDelayMs = Math.max(900, Number(out.retryDelayMs) || AI_RETRY_MS);
    setNextAiRetry(retryDelayMs);
    lastNet = {
      status: out.src === 'ai-rate-limit' ? 'rate-limit' : out.src === 'ai-service-unavailable' ? 'service-unavailable' : 'searching',
      src: out.src || 'ai-miss',
      bpm: 0
    };
    publishNet();
    pushAiLog('ai-resolve-continue-search', {
      seq: mySeq,
      key: meta.key,
      src: out.src || 'ai-miss',
      retryDelayMs,
      status: gate.status
    }, 'warn');
  };

  const beginWaitingForTrack = (meta = null) => {
    const fresh = meta || getTrackMeta();
    const trackKey = fresh?.key || getCoverSig() || curTrackKey || `pending-${Date.now()}`;
    pushAiLog('waiting-begin', {
      title: fresh?.title || '',
      artist: fresh?.artist || '',
      key: trackKey,
      sig: fresh?.sig || '',
      coverSig: fresh?.coverSig || ''
    });

    seq += 1;
    curTrackKey = trackKey;
    curTrackSig = fresh?.sig || '';
    clearWaitTimer();
    clearMetaPoll();
    clearNextAiRetry();
    abortActiveRequest();
    try { window.OsuBeat?.reset?.(); } catch {}
    releaseState.lastAttemptAt = 0;
    releaseState.lastDeferredLogAt = 0;

    setGate({
      selectedMode: DRIVE_MODE_BPM,
      effectiveMode: DRIVE_MODE_BPM,
      status: AI_STATUS_WAITING,
      trackKey
    });
    lastNet = { status: 'pending', src: 'ai', bpm: 0 };
    publishNet();
    stopAllAudioForGate();

    const mySeq = seq;
    waitTimer = setTimeout(() => {
      if (mySeq !== seq) {
        pushAiLog('waiting-timeout-stale', { requestSeq: mySeq, currentSeq: seq, key: trackKey }, 'warn');
        return;
      }
      if (getConfiguredDriveMode() !== DRIVE_MODE_BPM) {
        pushAiLog('waiting-timeout-skip-mode', { seq: mySeq, key: trackKey, mode: getConfiguredDriveMode() }, 'warn');
        return;
      }
      if (gate.status !== AI_STATUS_WAITING) {
        pushAiLog('waiting-timeout-skip-status', { seq: mySeq, key: trackKey, status: gate.status }, 'warn');
        return;
      }
      pushAiLog('waiting-timeout-manual-unlock', {
        seq: mySeq,
        key: trackKey,
        waitMs: AI_WAIT_MS
      }, 'warn');
      enterManualSearchMode({ reason: 'manual-unlock', trackKey });
    }, AI_WAIT_MS);

    metaPollTimer = setInterval(() => {
      if (getConfiguredDriveMode() !== DRIVE_MODE_BPM) {
        clearMetaPoll();
        return;
      }
      if (!isAiSearchStatus(gate.status)) {
        clearMetaPoll();
        return;
      }

      const latest = getTrackMeta();
      const latestKey = latest?.key || getCoverSig() || '';
      if (latestKey && latestKey !== gate.trackKey) {
        pushAiLog('meta-poll-track-changed', {
          seq: mySeq,
          from: gate.trackKey,
          to: latestKey
        }, 'warn');
        beginWaitingForTrack(latest);
        return;
      }

      if (latest?.title && latest?.artist && latest?.key === gate.trackKey && (!activeRequest || activeRequest.key !== latest.key || activeRequest.seq !== mySeq) && (!nextAiRetryAt || Date.now() >= nextAiRetryAt)) {
        pushAiLog('meta-poll-ready-for-ai', {
          seq: mySeq,
          key: latest.key,
          title: latest.title,
          artist: latest.artist,
          status: gate.status
        });
        resolveWithAi(latest, mySeq);
      }
    }, META_POLL_MS);

    if (fresh?.title && fresh?.artist && (!nextAiRetryAt || Date.now() >= nextAiRetryAt)) resolveWithAi(fresh, mySeq);
  };

  const attachAudioLifecycle = (el) => {
    if (!el || el.__pulseColorGateBound) return;
    el.__pulseColorGateBound = true;
    pushAiLog('audio-bound', {
      hasSrc: !!el.currentSrc,
      readyState: el.readyState,
      paused: el.paused
    });

    const guard = () => {
      if (!shouldBlockPlayback(el)) return;
      pushAiLog('playback-guard-block', {
        status: gate.status,
        selectedMode: gate.selectedMode,
        effectiveMode: gate.effectiveMode,
        trackKey: gate.trackKey
      }, 'warn');
      pauseAndRewind(el, { remember: true });
      if (gate.selectedMode === DRIVE_MODE_BPM && gate.status === 'bpm-active') beginWaitingForTrack();
    };

    ['play', 'playing', 'loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough', 'seeked', 'durationchange'].forEach((evt) => {
      el.addEventListener(evt, () => {
        pushAiLog('audio-event', {
          event: evt,
          paused: el.paused,
          currentTime: Number(el.currentTime || 0),
          readyState: el.readyState,
          currentSrc: el.currentSrc || ''
        });
        const meta = getTrackMeta();
        const key = meta?.key || getCoverSig() || '';
        if (key && key !== curTrackKey && gate.selectedMode === DRIVE_MODE_BPM) {
          beginWaitingForTrack(meta);
          return;
        }
        guard();
        if (!shouldBlockPlayback(el)) tryReleasePendingPlayback(`audio:${evt}`);
      }, { capture: true });
    });
  };

  const installPlayPatch = () => {
    const proto = window.HTMLMediaElement?.prototype;
    if (!proto || proto.__pulseColorAiOnlyGatePatched) return;
    if (typeof proto.play !== 'function') return;

    nativeAudioPlay = proto.play;
    proto.play = function pulseColorGatePlay(...args) {
      pushAiLog('media-play-call', {
        tagName: this?.tagName || '',
        blocked: this?.tagName === 'AUDIO' ? shouldBlockPlayback(this) : false,
        status: gate.status,
        selectedMode: gate.selectedMode,
        trackKey: gate.trackKey
      });
      const ret = nativeAudioPlay.apply(this, args);
      if (this?.tagName === 'AUDIO' && shouldBlockPlayback(this)) {
        rememberResumeIntent(this);
        queueMicrotask(() => {
          if (shouldBlockPlayback(this)) pauseAndRewind(this);
          else tryReleasePendingPlayback('play-patch-microtask');
        });
      }
      return ret;
    };

    Object.defineProperty(proto, '__pulseColorAiOnlyGatePatched', {
      value: true,
      configurable: false,
      enumerable: false,
      writable: false
    });
  };

  const bindObservers = () => {
    document.querySelectorAll('audio').forEach(attachAudioLifecycle);
    releaseState.lastObservedAudioSignature = getAudioObserverSignature();

    const mo = new MutationObserver(() => {
      document.querySelectorAll('audio').forEach(attachAudioLifecycle);

      const nextAudioSignature = getAudioObserverSignature();
      if (nextAudioSignature && nextAudioSignature !== releaseState.lastObservedAudioSignature) {
        releaseState.lastObservedAudioSignature = nextAudioSignature;
        tryReleasePendingPlaybackOnAudioMutation('audio-dom-change');
      }

      const meta = getTrackMeta();
      const key = meta?.key || getCoverSig() || '';
      if (gate.selectedMode === DRIVE_MODE_BPM && key && key !== curTrackKey) beginWaitingForTrack(meta);
    });
    mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'content'] });
  };

  const handleModeChange = (force = false) => {
    const nextMode = getConfiguredDriveMode();
    if (!force && nextMode === gate.selectedMode) return;

    pushAiLog('mode-change', {
      force,
      previousMode: gate.selectedMode,
      nextMode,
      status: gate.status,
      trackKey: gate.trackKey
    });

    clearWaitTimer();
    clearMetaPoll();
    abortActiveRequest('mode-change');
    seq += 1;
    releaseState.lastAttemptAt = 0;
    releaseState.lastDeferredLogAt = 0;
    try { window.OsuBeat?.reset?.(); } catch {}

    if (nextMode === DRIVE_MODE_RAW) {
      enterRawMode({ reason: 'raw', resume: true, trackKey: getTrackMeta().key || curTrackKey });
      return;
    }

    beginWaitingForTrack(getTrackMeta());
  };

  publishModelRegistry();
  installPlayPatch();
  bindObservers();

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) tryReleasePendingPlayback('visibilitychange');
    if (!document.hidden && getConfiguredDriveMode() === DRIVE_MODE_BPM && isAiSearchStatus(gate.status)) {
      const meta = getTrackMeta();
      pushAiLog('visibility-resync', {
        hidden: document.hidden,
        key: meta?.key || '',
        gateTrackKey: gate.trackKey
      });
      if ((meta?.key || '') !== (gate.trackKey || '')) beginWaitingForTrack(meta);
    }
  });
  window.addEventListener('focus', () => {
    tryReleasePendingPlayback('focus');
    if (getConfiguredDriveMode() === DRIVE_MODE_BPM && isAiSearchStatus(gate.status)) {
      const meta = getTrackMeta();
      pushAiLog('focus-resync', {
        key: meta?.key || '',
        gateTrackKey: gate.trackKey
      });
      if ((meta?.key || '') !== (gate.trackKey || '')) beginWaitingForTrack(meta);
    }
  });
  window.addEventListener('pageshow', () => {
    tryReleasePendingPlayback('pageshow');
    if (getConfiguredDriveMode() === DRIVE_MODE_BPM && isAiSearchStatus(gate.status)) {
      const meta = getTrackMeta();
      pushAiLog('pageshow-resync', {
        key: meta?.key || '',
        gateTrackKey: gate.trackKey
      });
      if ((meta?.key || '') !== (gate.trackKey || '')) beginWaitingForTrack(meta);
    }
  });
  window.addEventListener('pulsecolor:beatDriverConfigChanged', () => {
    pushAiLog('config-changed', {
      waveDriveMode: getConfiguredDriveMode()
    });
    handleModeChange();
  });

  modePollTimer = setInterval(() => {
    tryReleasePendingPlayback('mode-poll');
    if (getConfiguredDriveMode() !== gate.selectedMode) {
      pushAiLog('mode-poll-detected-change', {
        selectedMode: gate.selectedMode,
        configuredMode: getConfiguredDriveMode()
      });
      handleModeChange();
    }
  }, MODE_POLL_MS);

  setTimeout(() => handleModeChange(true), 0);
})();
