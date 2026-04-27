/* ========================== PulseColor BPM API: GetSongBPM ========================== */
(() => {
  window.PulseColorBpmApiFactories = window.PulseColorBpmApiFactories || {};

  window.PulseColorBpmApiFactories.GetSongBPM = (core = {}) => {
    const {
      logApi,
      logApiKeyCheck,
      fetchJson,
      buildLookup,
      pickBestSong,
      normBpm,
      extractFirstTempo
    } = core;

    /*---- getsongbpm ---- */
    const GETSONGBPM_API_BASE = 'https://api.getsong.co';
    const GETSONGBPM_API_KEY = '355f34fabf00b058b675ea3e427efa52';

    const getApiKey = () => String(GETSONGBPM_API_KEY || '').trim();

    const lookup = async ({ title, artist, sig } = {}) => {
      const apiKey = getApiKey();
      logApiKeyCheck('getsongbpm', apiKey, { sig, title, artist });
      if (!apiKey) {
        logApi('getsongbpm-skip', { sig, reason: 'empty-api-key-in-code' });
        return { bpm: 0, src: 'getsongbpm-no-key' };
      }

      const searchLookup = buildLookup({ title, artist });
      const searchUrl = `${GETSONGBPM_API_BASE}/search/?type=both&limit=12&lookup=${encodeURIComponent(searchLookup)}&api_key=${encodeURIComponent(apiKey)}`;
      const searchOut = await fetchJson(searchUrl, sig, {
        headers: {
          'Accept': 'application/json'
        }
      });
      if (!searchOut.ok) return { bpm: 0, src: `getsongbpm-${searchOut.type}` };

      const bestSong = pickBestSong(searchOut.data?.search, title, artist);
      logApi('getsongbpm-search-picked', {
        sig,
        requested: { title, artist },
        searchItems: Array.isArray(searchOut.data?.search) ? searchOut.data.search : [],
        bestSong
      });
      if (!bestSong?.id) return { bpm: 0, src: 'getsongbpm-miss' };

      const searchTempo = normBpm(bestSong?.tempo);
      if (searchTempo) return { bpm: searchTempo, src: 'getsongbpm' };

      const songUrl = `${GETSONGBPM_API_BASE}/song/?id=${encodeURIComponent(bestSong.id)}&api_key=${encodeURIComponent(apiKey)}`;
      const songOut = await fetchJson(songUrl, sig, {
        headers: {
          'Accept': 'application/json'
        }
      });
      if (!songOut.ok) return { bpm: 0, src: `getsongbpm-${songOut.type}` };

      const tempo = normBpm(songOut.data?.song?.tempo) || extractFirstTempo(songOut.data);
      logApi('getsongbpm-song-tempo', {
        sig,
        songId: bestSong.id,
        song: songOut.data?.song || null,
        normalizedTempo: tempo
      });
      return tempo ? { bpm: tempo, src: 'getsongbpm' } : { bpm: 0, src: 'getsongbpm-miss' };
    };

    return {
      name: 'GetSongBPM',
      lookup,
      enabled: () => !!getApiKey()
    };
  };
})();
