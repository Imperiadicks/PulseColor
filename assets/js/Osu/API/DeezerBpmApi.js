/* ========================== PulseColor BPM API: Deezer ========================== */
(() => {
  window.PulseColorBpmApiFactories = window.PulseColorBpmApiFactories || {};

  window.PulseColorBpmApiFactories.Deezer = (core = {}) => {
    const {
      logApi,
      fetchJson,
      normBpm,
      extractFirstTempo,
      uniqueClean,
      asArray,
      normalizeCompare,
      isTitleMatch,
      isArtistMatch,
      parseDurationMs,
      normalizeIsrc,
      pushContextIsrc
    } = core;

    /*---- deezer ---- */
    const DEEZER_API_BASE = 'https://api.deezer.com';
    const ENABLE_DEEZER_LOOKUP = true;
    const DEEZER_LIMIT = 10;
    const DEEZER_PREVIEW_LIMIT = 5;

    const buildDeezerSearchQueries = ({ title, artist }) => {
      const t = String(title || '').trim();
      const a = String(artist || '').trim();
      return uniqueClean([
        a && t ? `artist:"${a}" track:"${t}"` : '',
        a && t ? `${a} ${t}` : '',
        t
      ]).slice(0, 3);
    };

    const deezerArtistToText = (track) => track?.artist?.name || track?.artist || '';

    const pickBestDeezerTrack = (tracks, targetTitle, targetArtist, targetDurationMs = 0) => {
      const list = asArray(tracks);
      let best = null;
      let bestScore = -1;

      for (const track of list) {
        const trackTitle = track?.title || track?.title_short || '';
        const trackArtist = deezerArtistToText(track);
        const titleExact = normalizeCompare(trackTitle) === normalizeCompare(targetTitle);
        const artistExact = normalizeCompare(trackArtist) === normalizeCompare(targetArtist);
        const titleNear = isTitleMatch(trackTitle, targetTitle);
        const artistNear = isArtistMatch(trackArtist, targetArtist);

        let score = 0;
        if (titleExact) score += 10; else if (titleNear) score += 6;
        if (artistExact) score += 10; else if (artistNear) score += 6;
        if (track?.id) score += 2;
        if (track?.bpm) score += 2;
        if (track?.isrc) score += 2;
        if (track?.preview) score += 1;
        const trackDurationMs = parseDurationMs(track?.duration);
        if (targetDurationMs && trackDurationMs) {
          const diff = Math.abs(targetDurationMs - trackDurationMs);
          if (diff <= 2500) score += 5;
          else if (diff <= 7000) score += 3;
          else if (diff <= 15000) score += 1;
        }
        if (Number.isFinite(Number(track?.rank))) score += Math.min(4, Math.round(Number(track.rank) / 250000));

        if (score > bestScore) {
          bestScore = score;
          best = track;
        }
      }

      return bestScore >= 12 ? best : null;
    };

    const pickBestDeezerPreviewTrack = (tracks, targetTitle, targetArtist, targetDurationMs = 0) => {
      const list = asArray(tracks).filter((track) => !!track?.preview);
      let best = null;
      let bestScore = -1;

      for (const track of list) {
        const trackTitle = track?.title || track?.title_short || '';
        const trackArtist = deezerArtistToText(track);
        const titleExact = normalizeCompare(trackTitle) === normalizeCompare(targetTitle);
        const artistExact = normalizeCompare(trackArtist) === normalizeCompare(targetArtist);
        const titleNear = isTitleMatch(trackTitle, targetTitle);
        const artistNear = isArtistMatch(trackArtist, targetArtist);

        let score = 0;
        if (titleExact) score += 10; else if (titleNear) score += 6;
        if (artistExact) score += 10; else if (artistNear) score += 6;
        if (track?.id) score += 2;
        if (track?.preview) score += 4;
        if (track?.isrc) score += 2;
        const trackDurationMs = parseDurationMs(track?.duration);
        if (targetDurationMs && trackDurationMs) {
          const diff = Math.abs(targetDurationMs - trackDurationMs);
          if (diff <= 2500) score += 5;
          else if (diff <= 7000) score += 3;
          else if (diff <= 15000) score += 1;
        }
        if (Number.isFinite(Number(track?.rank))) score += Math.min(4, Math.round(Number(track.rank) / 250000));

        if (score > bestScore) {
          bestScore = score;
          best = track;
        }
      }

      return bestScore >= 10 ? best : null;
    };

    const ensurePreview = async ({ title, artist, sig, context } = {}) => {
      if (!context || context.deezerPreviewUrl || !ENABLE_DEEZER_LOOKUP) return context?.deezerPreviewUrl || '';

      const queries = buildDeezerSearchQueries({ title, artist });
      if (!queries.length) {
        logApi('reccobeats-preview-source-skip', { sig, reason: 'empty-deezer-query', title, artist });
        return '';
      }

      for (const query of queries) {
        const url = `${DEEZER_API_BASE}/search/track?q=${encodeURIComponent(query)}&limit=${encodeURIComponent(DEEZER_PREVIEW_LIMIT)}`;
        const out = await fetchJson(url, sig, {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          }
        });

        if (!out.ok) {
          logApi('reccobeats-preview-source-error', { sig, query, src: `deezer-${out.type}` });
          continue;
        }

        const picked = pickBestDeezerPreviewTrack(out.data?.data || out.data, title, artist, context?.requestedDurationMs || 0);
        logApi('reccobeats-preview-source-picked', {
          sig,
          query,
          requested: { title, artist },
          bestTrack: picked,
          searchItems: asArray(out.data?.data || out.data)
        });

        if (!picked?.preview) continue;

        context.deezerPreviewUrl = String(picked.preview || '').trim();
        context.deezerTrackId = picked.id || context.deezerTrackId || '';
        context.deezer = context.deezer || { query, search: out.data, track: picked, detail: null };
        pushContextIsrc(context, picked?.isrc);
        return context.deezerPreviewUrl;
      }

      return '';
    };

    const lookup = async ({ title, artist, sig, context } = {}) => {
      logApi('deezer-apikey-check', {
        provider: 'deezer',
        required: false,
        hasApiKey: false,
        source: 'public-api',
        sig
      });

      if (!ENABLE_DEEZER_LOOKUP) return { bpm: 0, src: 'deezer-disabled' };

      const queries = buildDeezerSearchQueries({ title, artist });
      if (!queries.length) return { bpm: 0, src: 'deezer-empty-query' };

      let lastSrc = 'deezer-miss';
      let bestTrack = null;
      let bestSearchData = null;
      let bestQuery = '';

      for (const query of queries) {
        const url = `${DEEZER_API_BASE}/search/track?q=${encodeURIComponent(query)}&limit=${encodeURIComponent(DEEZER_LIMIT)}`;
        const out = await fetchJson(url, sig, {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          }
        });

        if (!out.ok) {
          lastSrc = `deezer-${out.type}`;
          continue;
        }

        const picked = pickBestDeezerTrack(out.data?.data || out.data, title, artist, context?.requestedDurationMs || 0);
        logApi('deezer-search-picked', {
          sig,
          query,
          requested: { title, artist },
          searchItems: asArray(out.data?.data || out.data),
          bestTrack: picked
        });

        if (picked?.id) {
          bestTrack = picked;
          bestSearchData = out.data;
          bestQuery = query;
          break;
        }
      }

      if (!bestTrack?.id) return { bpm: 0, src: lastSrc };

      const detailUrl = `${DEEZER_API_BASE}/track/${encodeURIComponent(bestTrack.id)}`;
      const detailOut = await fetchJson(detailUrl, sig, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      const detail = detailOut.ok && detailOut.data && !detailOut.data.error ? detailOut.data : null;
      const merged = { ...bestTrack, ...(detail || {}) };
      const tempo = normBpm(merged?.bpm) || extractFirstTempo(merged);

      if (context) {
        context.deezer = { query: bestQuery, search: bestSearchData, track: bestTrack, detail };
        context.deezerTrackId = merged?.id || bestTrack.id;
        context.deezerPreviewUrl = String(merged?.preview || bestTrack?.preview || '').trim();
        pushContextIsrc(context, merged?.isrc || bestTrack?.isrc);
      }

      logApi('deezer-track-detail', {
        sig,
        requested: { title, artist },
        trackId: bestTrack.id,
        isrc: normalizeIsrc(merged?.isrc || bestTrack?.isrc),
        previewUrl: merged?.preview || bestTrack?.preview || '',
        normalizedTempo: tempo,
        detail: merged
      });

      return tempo ? { bpm: tempo, src: 'deezer' } : { bpm: 0, src: 'deezer-no-bpm' };
    };

    return {
      name: 'Deezer',
      lookup,
      ensurePreview,
      enabled: () => ENABLE_DEEZER_LOOKUP
    };
  };
})();
