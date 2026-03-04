
/* ========================== PulseColor: Online BPM + TapTempo fallback ========================== */
(() => {
  const CACHE_KEY = 'PulseColor.bpmCache.v3';
  const CACHE_LIMIT = 450;

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const normBpm = (b) => {
    b = Math.round(+b || 0);
    if (!b) return 0;
    while (b < 50) b *= 2;
    while (b > 210) b = Math.round(b / 2);
    return clamp(b, 50, 210);
  };

  const proxy = (url) => {
    try {
      if (url.startsWith('https://')) return 'https://r.jina.ai/https://' + url.slice('https://'.length);
      if (url.startsWith('http://')) return 'https://r.jina.ai/http://' + url.slice('http://'.length);
      return url;
    } catch {
      return url;
    }
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const fetchText = async (url, timeoutMs = 8000) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal, credentials: 'omit', cache: 'no-store' });
      if (!res.ok) return '';
      return await res.text();
    } catch {
      return '';
    } finally {
      clearTimeout(t);
    }
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
    } catch { }
  };

  const normalizeSig = (s) => (s || '').toString().trim().replace(/\s+/g, ' ').toLowerCase();

  const getTrackMeta = () => {
    const md = navigator.mediaSession?.metadata;
    const title = md?.title || '';
    // md.artist обычно уже готов, но иногда пусто — тогда берём md.albumArtist (если есть) или пусто
    const artist = md?.artist || md?.albumArtist || '';
    const sig = normalizeSig(`${artist} - ${title}`);
    return { title: title.trim(), artist: artist.trim(), sig };
  };

  const parseBpmFromPage = (txt) => {
    if (!txt) return 0;

    // bpmdatabase / musicstax / разные форматы
    const rx = [
      /\bBPM\b[^0-9]{0,12}(\d{2,3})\b/i,
      /\b(\d{2,3})\s*BPM\b/i,
      /"tempo"\s*:\s*(\d{2,3})\b/i,
      /"bpm"\s*:\s*(\d{2,3})\b/i,
      /\btempo\b[^0-9]{0,12}(\d{2,3})\b/i,
    ];
    for (const r of rx) {
      const m = txt.match(r);
      if (m && m[1]) {
        const b = normBpm(m[1]);
        if (b) return b;
      }
    }
    return 0;
  };

  const pickFirstLink = (html, domain) => {
    if (!html) return '';
    const re = new RegExp(`href="(https?:\\/\\/[^"]*${domain}[^"]*)"`, 'ig');
    const m = re.exec(html);
    return m?.[1] || '';
  };

  const ddgSearch = async (query) => {
    const url = proxy(`https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
    const html = await fetchText(url, 9000);
    return html || '';
  };

  const lookupOnline = async ({ title, artist } = {}) => {
    const t = (title || '').trim();
    const a = (artist || '').trim();
    if (!t || !a) return { bpm: 0, src: 'net' };

    const q1 = `site:bpmdatabase.com ${a} ${t} bpm`;
    const ddg1 = await ddgSearch(q1);
    const l1 = pickFirstLink(ddg1, 'bpmdatabase.com');
    if (l1) {
      const page = await fetchText(proxy(l1), 9000);
      const bpm = parseBpmFromPage(page);
      if (bpm) return { bpm, src: 'bpmdatabase' };
    }

    const q2 = `site:musicstax.com ${a} ${t} bpm`;
    const ddg2 = await ddgSearch(q2);
    const l2 = pickFirstLink(ddg2, 'musicstax.com');
    if (l2) {
      const page = await fetchText(proxy(l2), 9000);
      const bpm = parseBpmFromPage(page);
      if (bpm) return { bpm, src: 'musicstax' };
    }

    return { bpm: 0, src: 'net' };
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
        if (!isNear(t3, pred, 0.14)) {
          state.stableHits = 0;
        }
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
  let seq = 0;
  let onlineInFlight = 0;
  let lastNet = { status: 'idle', src: '', bpm: 0 };
  let lastApplied = { sig: '', src: '', bpm: 0 };

  const publishNet = () => { try { window.__PulseColorNet = { ...lastNet }; } catch { } };
  publishNet();

  const applyFromCacheSoft = (sig, cache) => {
    const row = cache[sig];
    if (!row?.bpm) return 0;
    const b = normBpm(row.bpm);
    if (!b) return 0;
    window.OsuBeat?.preset?.(b);
    lastApplied = { sig, src: row.src || 'cache', bpm: b };
    return b;
  };

  const resolveTrack = async (meta, mySeq) => {
    if (!meta?.sig) return;
    const cache = loadCache();

    applyFromCacheSoft(meta.sig, cache);

    lastNet = { status: 'pending', src: '', bpm: 0 }; publishNet();

    const out = await lookupOnline(meta);
    if (mySeq !== seq) return; 

    if (out.bpm) {
      lastNet = { status: 'hit', src: out.src, bpm: out.bpm }; publishNet();

      window.OsuBeat?.retune?.({ presetBpm: out.bpm });
      lastApplied = { sig: meta.sig, src: out.src, bpm: out.bpm };

      cache[meta.sig] = { bpm: out.bpm, src: out.src, ts: Date.now() };
      saveCache(cache);
      return;
    }

    lastNet = { status: 'miss', src: '', bpm: 0 }; publishNet();
  };

  window.addEventListener('osu-kick', (e) => {
    const bpmLocked = window.OsuBeat?.isLocked?.();
    if (bpmLocked && lastApplied?.src && (lastApplied.src === 'bpmdatabase' || lastApplied.src === 'musicstax')) return;

    const strength = +e.detail?.strength || 0;
    const t = performance.now();
    const b = TapTempo.pushBeat(t, strength);
    if (!b) return;

    const cur = window.OsuBeat?.bpm?.();
    if (cur && Math.abs(cur - b) <= 1 && (window.OsuBeat?.confidence?.() ?? 0) >= 0.55) return;

    window.OsuBeat?.retune?.({ presetBpm: b });
    lastApplied = { sig: curSig, src: 'tap', bpm: b };
  });

  setInterval(() => {
    const meta = getTrackMeta();
    if (!meta?.sig) return;

    if (meta.sig !== curSig) {
      curSig = meta.sig;
      seq++;
      TapTempo.reset();

      window.OsuBeat?.reset?.();

      const mySeq = seq;
      onlineInFlight = mySeq;

      (async () => {
        await sleep(350);
        const meta2 = getTrackMeta();
        if (mySeq !== seq) return;

        if (!meta2.title || !meta2.artist) {
          await sleep(600);
        }
        const meta3 = getTrackMeta();
        if (mySeq !== seq) return;

        await resolveTrack(meta3, mySeq);
      })();
    }
  }, 800);
})();

