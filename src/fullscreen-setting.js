// Files from older releases may still contain two independent switches.
export function migrateFullscreenSettings(raw) {
  const next = { ...raw };
  const unwrap = value => value && typeof value === 'object' ? value.value ?? value.default : value;
  const enabled = (value, fallback) => {
    const v = unwrap(value);
    return v === undefined ? fallback : v === true || v === 'true' || v === 1;
  };
  if (!Object.hasOwn(next, 'fullscreenVariant')) next.fullscreenVariant =
    enabled(next.tweakedEnabled, false) ? 'tweakedYmDesign' :
    enabled(next.cover2AnimEnabled, true) ? 'cover2Anim' : 'standard';
  delete next.tweakedEnabled;
  delete next.cover2AnimEnabled;
  return next;
}
