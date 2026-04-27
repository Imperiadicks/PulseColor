/* ========================== PulseColor BPM API: ReccoBeats ========================== */
(() => {
  window.PulseColorBpmApiFactories = window.PulseColorBpmApiFactories || {};

  window.PulseColorBpmApiFactories.ReccoBeats = (core = {}) => {
    const {
      logApi,
      fetchJson,
      fetchBlob,
      maskUrlForLog,
      normBpm,
      extractFirstTempo,
      uniqueClean,
      asArray,
      normalizeCompare,
      isTitleMatch,
      isArtistMatch,
      pushContextIsrc,
      pushContextReccoBeatsId,
      getProvider
    } = core;

    /*---- reccobeats ---- */
    const RECCOBEATS_API_BASE = 'https://api.reccobeats.com';
    const ENABLE_RECCOBEATS_TRACK_LOOKUP = true;
    const ENABLE_RECCOBEATS_AUDIO_ANALYSIS = true;
    const RECCOBEATS_ID_LIMIT = 8;
    const RECCOBEATS_AUDIO_FILE_NAME = 'pulsecolor-deezer-preview.mp3';
    const RECCOBEATS_UPLOAD_DEEZER_PREVIEW_WHEN_AVAILABLE = true;

    const reccoBeatsArtistToText = (track) => {
      const artists = track?.artists;
      if (Array.isArray(artists)) {
        return artists
          .map((item) => item?.name || item?.artistName || item?.title || '')
          .filter(Boolean)
          .join(', ')
          .trim();
      }
      return track?.artist?.name || track?.artistName || track?.artist || '';
    };

    const pickBestReccoBeatsTrack = (tracks, targetTitle, targetArtist) => {
      const list = asArray(tracks);
      let best = null;
      let bestScore = -1;

      for (const track of list) {
        const trackTitle = track?.trackTitle || track?.title || track?.name || '';
        const trackArtist = reccoBeatsArtistToText(track);
        const titleExact = normalizeCompare(trackTitle) === normalizeCompare(targetTitle);
        const artistExact = normalizeCompare(trackArtist) === normalizeCompare(targetArtist);
        const titleNear = isTitleMatch(trackTitle, targetTitle);
        const artistNear = isArtistMatch(trackArtist, targetArtist);

        let score = 0;
        if (titleExact) score += 10; else if (titleNear) score += 6;
        if (artistExact) score += 10; else if (artistNear) score += 6;
        if (track?.id) score += 2;
        if (track?.isrc) score += 2;
        if (track?.href) score += 1;
        if (Number.isFinite(Number(track?.popularity))) score += Math.min(4, Math.round(Number(track.popularity) / 25));

        if (score > bestScore) {
          bestScore = score;
          best = track;
        }
      }

      return bestScore >= 10 ? best : null;
    };

    const getTrackFeatures = async ({ id, sig } = {}) => {
      if (!id) return { bpm: 0, src: 'reccobeats-no-id' };

      const urls = [
        `${RECCOBEATS_API_BASE}/v1/track/${encodeURIComponent(id)}/audio-features`,
        `${RECCOBEATS_API_BASE}/v1/audio-features?ids=${encodeURIComponent(id)}`
      ];

      let lastSrc = 'reccobeats-features-miss';

      for (const url of urls) {
        const out = await fetchJson(url, sig, {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          }
        });

        if (!out.ok) {
          lastSrc = `reccobeats-features-${out.type}`;
          continue;
        }

        const tempo = normBpm(out.data?.tempo) || normBpm(out.data?.bpm) || extractFirstTempo(out.data);
        logApi('reccobeats-track-features', {
          sig,
          id,
          url: maskUrlForLog(url),
          tempo,
          data: out.data
        });

        if (tempo) return { bpm: tempo, src: 'reccobeats' };
        lastSrc = 'reccobeats-features-miss';
      }

      return { bpm: 0, src: lastSrc };
    };

    const lookupByIds = async ({ title, artist, sig, context } = {}) => {
      if (!ENABLE_RECCOBEATS_TRACK_LOOKUP) return { bpm: 0, src: 'reccobeats-track-disabled' };

      const ids = uniqueClean([...(context?.reccobeatsIds || []), ...(context?.isrcs || [])]).slice(0, RECCOBEATS_ID_LIMIT);
      if (!ids.length) return { bpm: 0, src: 'reccobeats-no-id' };

      const url = `${RECCOBEATS_API_BASE}/v1/track?ids=${encodeURIComponent(ids.join(','))}`;
      const out = await fetchJson(url, sig, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!out.ok) return { bpm: 0, src: `reccobeats-track-${out.type}` };

      const tracks = asArray(out.data?.data || out.data?.tracks || out.data);
      const bestTrack = pickBestReccoBeatsTrack(tracks, title, artist) || tracks.find((track) => track?.id) || null;

      logApi('reccobeats-track-picked', {
        sig,
        requested: { title, artist },
        ids,
        tracks,
        bestTrack
      });

      if (!bestTrack?.id) return { bpm: 0, src: 'reccobeats-track-miss' };

      pushContextReccoBeatsId(context, bestTrack.id);
      pushContextIsrc(context, bestTrack.isrc);

      return await getTrackFeatures({ id: bestTrack.id, sig });
    };

    const getAudioBlob = async ({ sig, context } = {}) => {
      const provider = window.__PulseColorAudioBlobProvider || window.PulseColorAudioBlobProvider;
      if (typeof provider === 'function') {
        try {
          const blob = await provider();
          if (blob instanceof Blob) {
            if (context) context.reccoAudioSource = 'external-provider';
            logApi('reccobeats-audio-provider-hit', {
              sig,
              source: 'external-provider',
              blobType: blob.type || '',
              blobSize: blob.size || 0
            });
            return blob;
          }
        } catch (error) {
          logApi('reccobeats-audio-provider-error', {
            sig,
            source: 'external-provider',
            name: error?.name || 'Error',
            message: error?.message || String(error)
          });
        }
      }

      if (!String(context?.deezerPreviewUrl || '').trim()) {
        const deezer = typeof getProvider === 'function' ? getProvider('Deezer') : null;
        if (deezer?.ensurePreview) {
          await deezer.ensurePreview({
            sig,
            context,
            title: context?.requestedTitle || '',
            artist: context?.requestedArtist || ''
          });
        }
      }

      const previewUrl = String(context?.deezerPreviewUrl || '').trim();
      if (!previewUrl) return null;

      const out = await fetchBlob(previewUrl, sig, {
        method: 'GET',
        headers: {
          'Accept': 'audio/mpeg,audio/*,*/*'
        }
      });

      if (!out.ok || !(out.blob instanceof Blob)) {
        logApi('reccobeats-preview-audio-skip', {
          sig,
          reason: out.type || 'preview-fetch-failed',
          url: maskUrlForLog(previewUrl)
        });
        return null;
      }

      if (context) context.reccoAudioSource = 'deezer-preview';

      logApi('reccobeats-preview-audio-ready', {
        sig,
        source: 'deezer-preview',
        url: maskUrlForLog(previewUrl),
        blobType: out.blob.type || '',
        blobSize: out.blob.size || 0
      });

      return out.blob;
    };

    const lookupByAudio = async ({ sig, context } = {}) => {
      if (!ENABLE_RECCOBEATS_AUDIO_ANALYSIS) return { bpm: 0, src: 'reccobeats-audio-disabled' };

      const blob = await getAudioBlob({ sig, context });
      if (!blob) {
        logApi('reccobeats-skip', { sig, reason: 'no-audio-blob-or-preview' });
        return { bpm: 0, src: 'reccobeats-no-audio' };
      }

      const form = new FormData();
      const fileName = blob.name || RECCOBEATS_AUDIO_FILE_NAME;
      form.append('audioFile', blob, fileName);

      const endpoint = `${RECCOBEATS_API_BASE}/v1/analysis/audio-features`;
      logApi('reccobeats-audio-upload-start', {
        sig,
        endpoint,
        formField: 'audioFile',
        fileName,
        source: context?.reccoAudioSource || 'unknown',
        deezerPreviewUrl: maskUrlForLog(context?.deezerPreviewUrl || ''),
        blobType: blob.type || '',
        blobSize: blob.size || 0
      });

      const out = await fetchJson(endpoint, sig, {
        method: 'POST',
        body: form,
        headers: {
          'Accept': 'application/json'
        }
      });
      if (!out.ok) return { bpm: 0, src: `reccobeats-audio-${out.type}` };

      const tempo = normBpm(out.data?.tempo) || normBpm(out.data?.bpm) || extractFirstTempo(out.data);
      logApi('reccobeats-audio-tempo', { sig, tempo, data: out.data });
      return tempo ? { bpm: tempo, src: 'reccobeats-audio' } : { bpm: 0, src: 'reccobeats-audio-miss' };
    };

    const lookup = async ({ title, artist, sig, context } = {}) => {
      logApi('reccobeats-apikey-check', {
        provider: 'reccobeats',
        required: false,
        hasApiKey: false,
        source: 'no-api-key-required',
        sig
      });

      const trackOut = await lookupByIds({ title, artist, sig, context });
      if (trackOut?.bpm) return trackOut;

      const audioOut = await lookupByAudio({ sig, context });
      if (audioOut?.bpm) return audioOut;

      return audioOut?.src !== 'reccobeats-no-audio' ? audioOut : trackOut;
    };

    return {
      name: 'ReccoBeats',
      lookup,
      uploadDeezerPreviewWhenAvailable: RECCOBEATS_UPLOAD_DEEZER_PREVIEW_WHEN_AVAILABLE,
      enabled: () => ENABLE_RECCOBEATS_TRACK_LOOKUP || ENABLE_RECCOBEATS_AUDIO_ANALYSIS
    };
  };
})();
