/* ========================== PulseColor: Online BPM + TapTempo fallback ========================== */
(() => {
  const CACHE_KEY = 'PulseColor.bpmCache.v6';
  const CACHE_LIMIT = 450;
  const REQUEST_COOLDOWN_MS = 15000;
  const MISS_COOLDOWN_MS = 45000;
  const ERROR_COOLDOWN_MS = 60000;
  const RATE_LIMIT_COOLDOWN_MS = 180000;

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const normBpm = (b) => {
    b = Math.round(+b || 0);
    if (!b) return 0;
    while (b < 50) b *= 2;
    while (b > 210) b = Math.round(b / 2);
    return clamp(b, 50, 210);
  };

  const loadCache = () => {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {}; }
    catch { return {}; }
  };

  const saveCache = (obj) => {
    try {
      const keys = Object.keys(obj);
      if (keys.length > CACHE_LIMIT) {
        keys
          .sort((a, b) => (obj[a]?.ts || 0) - (obj[b]?.ts || 0))
          .slice(0, keys.length - CACHE_LIMIT)
          .forEach(k => { delete obj[k]; });
      }
      localStorage.setItem(CACHE_KEY, JSON.stringify(obj));
    } catch {}
  };

  const normalizeSig = (s) => (s || '').toString().trim().replace(/\s+/g, ' ').toLowerCase();

  const getTrackMeta = () => {
    const md = navigator.mediaSession?.metadata;
    const title = md?.title || '';
    const artist = md?.artist || md?.albumArtist || '';
    const sig = normalizeSig(`${artist} - ${title}`);
    return { title: title.trim(), artist: artist.trim(), sig };
  };

  const AI_ENDPOINT = 'https://api.onlysq.ru/ai/v2';
  const AI_MODEL = 'gemini-2.0-flash-lite';
  const AI_KEY = 'sq-L4uZha9NlowdITyEPc2pFtrpCqbOD52g';

  const parseBpmValue = (raw) => {
    if (raw == null) return 0;

    if (typeof raw === 'number') return normBpm(raw);

    const txt = String(raw).trim();
    if (!txt) return 0;

    try {
      const j = JSON.parse(txt);
      if (typeof j?.bpm !== 'undefined') return normBpm(j.bpm);
    } catch {}

    const m = txt.match(/\b(\d{2,3})\b/);
    return m ? normBpm(m[1]) : 0;
  };

  const buildBpmPrompt = (artist, track) => {
    const artSafe = artist || '—';
    const trackSafe = track || '—';

    return [
      'Ты всегда должен писать на русском.',
      'Ты определяешь BPM музыкального трека.',
      'Используй только информацию из открытых интернет-источников; не придумывай факты.',
      'Имя артиста и название трека используй строго буквально, без правок и сокращений.',
      'Если по данной записи не найдено точное надёжное значение BPM — верни только 0.',
      'Никаких пояснений, слов, markdown, единиц измерения, JSON и лишнего текста.',
      'Ответ должен быть только одним числом, например: 120',
      '',
      '=== Артист ===',
      artSafe,
      '',
      '=== Трек ===',
      `${artSafe} — ${trackSafe}`
    ].join('\n');
  };

  let activeLookupSig = '';
  let activeLookupPromise = null;
  const requestCooldowns = new Map();

  const setCooldown = (sig, ms) => {
    if (!sig || !ms) return;
    requestCooldowns.set(sig, Date.now() + ms);
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

  const fetchAIBpm = async ({ artist, title, sig }) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 9000);

    try {
      const res = await fetch(AI_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AI_KEY}`
        },
        signal: ctrl.signal,
        body: JSON.stringify({
          model: AI_MODEL,
          request: {
            messages: [
              {
                role: 'user',
                content: buildBpmPrompt(artist, title)
              }
            ]
          }
        })
      });

      if (!res.ok) {
        if (res.status === 429) {
          setCooldown(sig, getRetryAfterMs(res));
          return { bpm: 0, src: 'ai-rate-limit' };
        }

        setCooldown(sig, ERROR_COOLDOWN_MS);
        return { bpm: 0, src: 'ai-http-' + res.status };
      }

      const j = await res.json();
      const content =
        j?.choices?.[0]?.message?.content ??
        j?.message?.content ??
        j?.content ??
        '';

      const bpm = parseBpmValue(content);

      if (bpm) {
        setCooldown(sig, REQUEST_COOLDOWN_MS);
        return { bpm, src: 'ai' };
      }

      setCooldown(sig, MISS_COOLDOWN_MS);
      return { bpm: 0, src: 'ai-miss' };
    } catch {
      setCooldown(sig, ERROR_COOLDOWN_MS);
      return { bpm: 0, src: 'ai-error' };
    } finally {
      clearTimeout(t);
    }
  };

  const lookupOnline = async ({ title, artist, sig } = {}) => {
    const t = (title || '').trim();
    const a = (artist || '').trim();
    const s = (sig || '').trim();
    if (!t || !a || !s) return { bpm: 0, src: 'ai-miss' };

    const cooldownUntil = requestCooldowns.get(s) || 0;
    if (cooldownUntil > Date.now()) {
      return { bpm: 0, src: 'ai-cooldown' };
    }

    if (activeLookupPromise && activeLookupSig === s) {
      return await activeLookupPromise;
    }

    activeLookupSig = s;
    activeLookupPromise = fetchAIBpm({ artist: a, title: t, sig: s })
      .finally(() => {
        if (activeLookupSig === s) {
          activeLookupSig = '';
          activeLookupPromise = null;
        }
      });

    return await activeLookupPromise;
  };

  const TapTempo = (() => {
    const state = {
      lastT: 0,
      prevIoi: 0,
      iois: [],
      beats: [],
      bpm: 0,
      stableHits: 0,
      resetAt: 0
    };

    const reset = () => {
      state.lastT = 0;
      state.prevIoi = 0;
      state.iois = [];
      state.beats = [];
      state.bpm = 0;
      state.stableHits = 0;
      state.resetAt = performance.now();
    };

    const median = (arr) => {
      const xs = arr.slice().sort((a, b) => a - b);
      const n = xs.length;
      if (!n) return 0;
      const mid = Math.floor(n / 2);
      return (n % 2) ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
    };

    const isNear = (x, y, rel = 0.12) => {
      if (!x || !y) return false;
      return Math.abs(x - y) <= Math.max(18, y * rel);
    };

    const pushBeat = (t, strength) => {
      if (strength < 0.16) return 0;

      if (!state.lastT) {
        state.lastT = t;
        state.beats = [t];
        return 0;
      }

      const ioi = t - state.lastT;

      if (ioi < 220 || ioi > 1200) {
        state.lastT = t;
        state.beats = [t];
        state.iois = [];
        state.stableHits = 0;
        return 0;
      }

      state.beats.push(t);
      state.lastT = t;

      state.iois.push(ioi);
      if (state.iois.length > 10) state.iois.shift();

      const bpmCand = normBpm(60000 / ioi);
      if (!bpmCand) return 0;

      if (state.beats.length >= 3) {
        const t3 = state.beats[state.beats.length - 1];
        const t2 = state.beats[state.beats.length - 2];
        const t1 = state.beats[state.beats.length - 3];
        const pred = t2 + (t2 - t1);
        if (!isNear(t3, pred, 0.14)) state.stableHits = 0;
      }

      if (state.iois.length >= 3) {
        const med = median(state.iois);
        const bpmMed = normBpm(60000 / med);
        if (bpmMed) {
          const relDev = median(state.iois.map(v => Math.abs(v - med) / med));
          if (relDev < 0.08) {
            if (state.bpm && Math.abs(state.bpm - bpmMed) <= 2) state.stableHits++;
            else state.stableHits = 1;
            state.bpm = bpmMed;
            if (state.stableHits >= 2) return state.bpm;
          } else {
            state.stableHits = 0;
          }
        }
      }

      return 0;
    };

    return { reset, pushBeat };
  })();

  let curSig = '';
  let curTrackKey = '';
  let seq = 0;
  let lastNet = { status: 'idle', src: '', bpm: 0 };
  let lastApplied = { sig: '', src: '', bpm: 0 };
  let resolveTrackRaf = 0;
  let queuedSig = '';
  let coverObserver = null;
  let treeObserver = null;
  const mediaLifecycleBound = new WeakSet();

  const publishNet = () => { try { window.__PulseColorNet = { ...lastNet }; } catch {} };
  publishNet();

  const isProtectedSrc = (src) => src === 'ai' || src === 'cache';

  const applyFromCacheSoft = (sig, cache) => {
    const row = cache[sig];
    if (!row?.bpm) return 0;
    const b = normBpm(row.bpm);
    if (!b) return 0;
    window.OsuBeat?.retune?.({ presetBpm: b, source: row.src || 'cache' });
    lastApplied = { sig, src: row.src || 'cache', bpm: b };
    return b;
  };

  const resolveTrack = async (meta, mySeq) => {
    if (!meta?.sig) return;
    const cache = loadCache();

    if (lastApplied.sig === meta.sig && isProtectedSrc(lastApplied.src) && lastApplied.bpm) {
      return;
    }

    const cached = applyFromCacheSoft(meta.sig, cache);
    if (cached) {
      lastNet = { status: 'hit', src: 'cache', bpm: cached };
      publishNet();
      return;
    }

    const cooldownUntil = requestCooldowns.get(meta.sig) || 0;
    if (cooldownUntil > Date.now()) {
      lastNet = { status: 'cooldown', src: 'ai', bpm: 0 };
      publishNet();
      return;
    }

    lastNet = { status: 'pending', src: '', bpm: 0 };
    publishNet();

    const out = await lookupOnline(meta);
    if (mySeq !== seq) return;

    if (out.bpm) {
      lastNet = { status: 'hit', src: out.src, bpm: out.bpm };
      publishNet();

      window.OsuBeat?.retune?.({ presetBpm: out.bpm, source: out.src });
      lastApplied = { sig: meta.sig, src: out.src, bpm: out.bpm };

      cache[meta.sig] = { bpm: out.bpm, src: out.src, ts: Date.now() };
      saveCache(cache);
      return;
    }

    lastNet = {
      status: out.src === 'ai-rate-limit' ? 'rate-limit' : (out.src === 'ai-cooldown' ? 'cooldown' : 'miss'),
      src: out.src || '',
      bpm: 0
    };
    publishNet();
  };

  const getCoverSig = () => {
    const img = document.querySelector('div[data-test-id="PLAYERBAR_DESKTOP_COVER_CONTAINER"] img')
      || document.querySelector('img[data-test-id="ENTITY_COVER_IMAGE"]');
    const src = img?.src || '';
    return src.replace(/\/(?:100x100|200x200|400x400|1000x1000)(?=[/?]|$)/g, '');
  };

  function queueTrackResolve() {
    const meta = getTrackMeta();
    if (!meta?.sig || !meta.title || !meta.artist) return;

    if (activeLookupPromise && activeLookupSig === meta.sig) return;
    if (resolveTrackRaf && queuedSig === meta.sig) return;
    if (lastApplied.sig === meta.sig && isProtectedSrc(lastApplied.src) && lastApplied.bpm) return;

    queuedSig = meta.sig;

    if (resolveTrackRaf) cancelAnimationFrame(resolveTrackRaf);
    resolveTrackRaf = requestAnimationFrame(() => {
      requestAnimationFrame(async () => {
        resolveTrackRaf = 0;
        queuedSig = '';
        const fresh = getTrackMeta();
        if (!fresh?.sig || !fresh.title || !fresh.artist) return;
        if (activeLookupPromise && activeLookupSig === fresh.sig) return;
        const mySeq = seq;
        await resolveTrack(fresh, mySeq);
      });
    });
  }

  function resetForTrack(meta = null) {
    seq++;
    TapTempo.reset();
    window.OsuBeat?.reset?.();
    curSig = meta?.sig || '';
    lastApplied = { sig: '', src: '', bpm: 0 };
    lastNet = { status: 'idle', src: '', bpm: 0 };
    publishNet();
  }

  function checkTrackChange(forceResolve = false) {
    const meta = getTrackMeta();
    const coverSig = getCoverSig();
    const key = coverSig || meta?.sig || '';

    if (key && key !== curTrackKey) {
      curTrackKey = key;
      resetForTrack(meta);
      queueTrackResolve();
      return;
    }

    if (meta?.sig && meta.sig !== curSig) {
      curSig = meta.sig;
      queueTrackResolve();
      return;
    }

    if (forceResolve && meta?.sig) {
      if (lastApplied.sig === meta.sig && isProtectedSrc(lastApplied.src) && lastApplied.bpm) return;
      if (activeLookupPromise && activeLookupSig === meta.sig) return;
      queueTrackResolve();
    }
  }

  function bindCoverObserver() {
    const node = document.querySelector('div[data-test-id="PLAYERBAR_DESKTOP_COVER_CONTAINER"] img')
      || document.querySelector('img[data-test-id="ENTITY_COVER_IMAGE"]');

    if (coverObserver?.__node === node) return;
    if (coverObserver) coverObserver.disconnect();
    coverObserver = null;
    if (!node) return;

    coverObserver = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'attributes' && m.attributeName === 'src') {
          checkTrackChange(true);
          break;
        }
      }
    });
    coverObserver.__node = node;
    coverObserver.observe(node, { attributes: true, attributeFilter: ['src'] });
  }

  function attachAudioLifecycle(el) {
    if (!el || mediaLifecycleBound.has(el)) return;
    mediaLifecycleBound.add(el);

    const ping = () => checkTrackChange(true);
    [
      'play',
      'playing',
      'loadedmetadata',
      'loadeddata',
      'durationchange',
      'seeked',
      'emptied',
      'canplay',
      'canplaythrough'
    ].forEach(evt => el.addEventListener(evt, ping, { passive: true }));
  }

  function isRelevantNode(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.matches?.('audio, div[data-test-id="PLAYERBAR_DESKTOP_COVER_CONTAINER"], img[data-test-id="ENTITY_COVER_IMAGE"]')) return true;
    return !!node.querySelector?.('audio, div[data-test-id="PLAYERBAR_DESKTOP_COVER_CONTAINER"], img[data-test-id="ENTITY_COVER_IMAGE"]');
  }

  function bindTreeObserver() {
    if (treeObserver) return;

    treeObserver = new MutationObserver((muts) => {
      let relevant = false;

      for (const m of muts) {
        if (m.type !== 'childList') continue;
        for (const n of m.addedNodes) {
          if (isRelevantNode(n)) { relevant = true; break; }
        }
        if (relevant) break;
        for (const n of m.removedNodes) {
          if (isRelevantNode(n)) { relevant = true; break; }
        }
        if (relevant) break;
      }

      document.querySelectorAll('audio').forEach(attachAudioLifecycle);
      bindCoverObserver();
      if (relevant) checkTrackChange(true);
    });

    treeObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  window.addEventListener('osu-kick', (e) => {
    const bpmLocked = window.OsuBeat?.isLocked?.();
    const externalLocked = window.OsuBeat?.isExternalLocked?.();
    if (bpmLocked && (externalLocked || isProtectedSrc(lastApplied?.src))) return;

    const strength = +e.detail?.strength || 0;
    const t = performance.now();
    const b = TapTempo.pushBeat(t, strength);
    if (!b) return;

    const cur = window.OsuBeat?.bpm?.();
    if (cur && Math.abs(cur - b) <= 1 && (window.OsuBeat?.confidence?.() ?? 0) >= 0.55) return;

    window.OsuBeat?.retune?.({ presetBpm: b });
    lastApplied = { sig: curSig, src: 'tap', bpm: b };
  });

  document.querySelectorAll('audio').forEach(attachAudioLifecycle);
  bindCoverObserver();
  bindTreeObserver();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkTrackChange(true);
  });
  window.addEventListener('focus', () => checkTrackChange(true));
  window.addEventListener('pageshow', () => checkTrackChange(true));
  checkTrackChange(true);
})();