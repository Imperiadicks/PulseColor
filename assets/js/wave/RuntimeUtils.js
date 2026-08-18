(() => {
  "use strict";

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const safeJson = (raw, fallback = null) => {
    try {
      const parsed = JSON.parse(String(raw || ""));
      return parsed == null ? fallback : parsed;
    } catch {
      return fallback;
    }
  };

  const cleanText = (value) => String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  const normalizeCompare = (value) => cleanText(value)
    .toLowerCase()
    .replace(/[()\[\]{}]/g, " ")
    .replace(/[\u2013\u2014-]/g, " ")
    .replace(/\b(feat|ft|featuring|remaster(?:ed)?|live|edit|mix|version|radio edit|extended|instrumental|bootleg|vip)\b.*$/gi, "")
    .replace(/[^a-z\u0430-\u044f\u04510-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const normalizeIdentity = (value) => cleanText(value)
    .toLowerCase()
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^a-z\u0430-\u044f\u04510-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const VERSION_PATTERNS = Object.freeze([
    ["live", /\b(?:live|concert|live at|live from)\b|\u0436\u0438\u0432(?:\u043e\u0435|\u043e\u0439|\u0430\u044f)?\s+\u0438\u0441\u043f\u043e\u043b\u043d\u0435\u043d\u0438\u0435/i],
    ["remaster", /\bremaster(?:ed)?\b|\u0440\u0435\u043c\u0430\u0441\u0442\u0435\u0440/i],
    ["remix", /\b(?:remix|rework|bootleg|vip mix)\b|\u0440\u0435\u043c\u0438\u043a\u0441/i],
    ["acoustic", /\bacoustic\b|\u0430\u043a\u0443\u0441\u0442\u0438\u0447/i],
    ["instrumental", /\binstrumental\b|\u0438\u043d\u0441\u0442\u0440\u0443\u043c\u0435\u043d\u0442\u0430\u043b/i],
    ["radio", /\bradio\s+(?:edit|version|mix)\b|\u0440\u0430\u0434\u0438\u043e\s*\u0432\u0435\u0440\u0441/i],
    ["edit", /\b(?:edit|extended edit)\b|\u0432\u0435\u0440\u0441\u0438\u044f\s+edit/i]
  ]);

  const extractVersionTags = (value) => {
    const text = cleanText(value);
    const tags = [];
    for (const [tag, pattern] of VERSION_PATTERNS) {
      if (pattern.test(text)) tags.push(tag);
    }
    if (tags.includes("radio")) {
      const editIndex = tags.indexOf("edit");
      if (editIndex >= 0) tags.splice(editIndex, 1);
    }
    return Object.freeze(tags.sort());
  };

  const versionsCompatible = (left, right) => {
    const a = extractVersionTags(left);
    const b = extractVersionTags(right);
    if (!a.length && !b.length) return true;
    return a.length === b.length && a.every((tag, index) => tag === b[index]);
  };

  const normalizeBpm = (value) => {
    const bpm = Number(value);
    if (!Number.isFinite(bpm)) return 0;
    const rounded = Math.round(bpm * 100) / 100;
    return rounded >= 40 && rounded <= 260 ? rounded : 0;
  };

  const parseDurationMs = (value) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      if (value > 10000) return Math.round(value);
      if (value > 0) return Math.round(value * 1000);
      return 0;
    }
    const raw = String(value || "").trim();
    if (!raw) return 0;
    if (/^\d+(?:\.\d+)?$/.test(raw)) return parseDurationMs(Number(raw));
    const parts = raw.split(":").map(Number);
    if (parts.length < 2 || parts.some((part) => !Number.isFinite(part))) return 0;
    return Math.round(parts.reduce((seconds, part) => seconds * 60 + part, 0) * 1000);
  };

  const normalizeCoverUrl = (value) => String(value || "")
    .replace(/\/(?:50x50|80x80|100x100|200x200|300x300|400x400|800x800|1000x1000)(?=[/?]|$)/g, "/%%x%%")
    .replace(/[?#].*$/, "");

  const normalizeTrackId = (value) => cleanText(value)
    .replace(/[^a-z0-9_:.-]/gi, "")
    .replace(/^ym:/i, "")
    .trim();

  const getTrackCacheKey = (track = {}) => {
    const id = normalizeTrackId(track.id || track.trackId || track.yandexTrackId);
    if (id) return `ym:${id}`;
    const artistIdentity = normalizeIdentity(track.artist);
    const titleIdentity = normalizeIdentity(track.title);
    if (!artistIdentity || !titleIdentity) return "";
    const durationMs = parseDurationMs(track.durationMs || track.duration);
    const durationSec = durationMs ? Math.max(5, Math.round(durationMs / 5000) * 5) : 0;
    const coverKey = normalizeCoverUrl(track.coverUrl || track.artwork || "");
    return ["meta", artistIdentity, titleIdentity, `dur:${durationSec}`, coverKey ? `cover:${coverKey}` : ""].filter(Boolean).join("::");
  };

  const normalizeTrack = (input = {}) => {
    const title = cleanText(input.title);
    const artist = cleanText(input.artist);
    const durationMs = parseDurationMs(input.durationMs || input.duration);
    const coverUrl = String(input.coverUrl || input.artwork || "").trim();
    const id = normalizeTrackId(input.id || input.trackId || input.yandexTrackId);
    const titleKey = normalizeIdentity(title);
    const artistKey = normalizeIdentity(artist);
    const coverKey = normalizeCoverUrl(coverUrl);
    const sig = [artistKey, titleKey].filter(Boolean).join("::");
    const key = id ? `ym:${id}` : sig || [durationMs || "", coverKey].filter(Boolean).join("::");
    const cacheKey = getTrackCacheKey({ id, title, artist, durationMs, coverUrl });
    return Object.freeze({
      id,
      key,
      cacheKey,
      sig,
      title,
      artist,
      durationMs,
      coverUrl,
      coverKey,
      versionTags: extractVersionTags(title),
      source: cleanText(input.source || "unknown")
    });
  };

  const migrateBpmCache = (current, legacy, options = {}) => {
    const limit = Math.max(1, Number(options.limit) || 450);
    const normalizationVersion = Number(options.normalizationVersion) || 1;
    const rows = [];
    const append = (input) => {
      if (!input || typeof input !== "object") return;
      for (const [key, row] of Object.entries(input)) {
        const bpm = normalizeBpm(row && typeof row === "object" ? row.bpm : row);
        if (!bpm || !key) continue;
        rows.push([key, {
          bpm,
          source: String(row?.source || row?.src || "legacy"),
          fetchedAt: Number(row?.fetchedAt || row?.ts || Date.now()),
          normalizationVersion: Number(row?.normalizationVersion) || normalizationVersion
        }]);
      }
    };
    append(legacy);
    append(current);
    rows.sort((a, b) => b[1].fetchedAt - a[1].fetchedAt);
    const migrated = {};
    for (const [key, row] of rows) {
      if (Object.prototype.hasOwnProperty.call(migrated, key)) continue;
      migrated[key] = row;
      if (Object.keys(migrated).length >= limit) break;
    }
    return migrated;
  };

  const api = Object.freeze({
    clamp,
    safeJson,
    cleanText,
    normalizeCompare,
    normalizeIdentity,
    extractVersionTags,
    versionsCompatible,
    normalizeBpm,
    parseDurationMs,
    normalizeCoverUrl,
    normalizeTrackId,
    getTrackCacheKey,
    normalizeTrack,
    migrateBpmCache
  });

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.PulseColorRuntimeUtils = api;
})();
