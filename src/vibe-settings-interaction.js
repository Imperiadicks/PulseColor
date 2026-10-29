// Treat the player as part of the settings interaction surface, without moving
// React-owned nodes, intercepting controls, or changing global event prototypes.
// Floating UI's outside-press test uses the per-event composed path.
export function allowVibeSettingsPlayback(doc = document) {
  const view = doc.defaultView;
  const includePlayer = event => {
    if (!doc.documentElement.hasAttribute('data-pulsecolor-minimal-vibe') || !doc.documentElement.hasAttribute('data-pc-vibe-settings-open')) return;
    const target = event.target;
    if (!(target instanceof view.Element) || !target.closest('[class*="VibePage_player__"]')) return;
    const modal = doc.querySelector('[data-test-id="VIBE_SETTINGS_BLOCK"]');
    if (!modal) return;
    const path = event.composedPath();
    if (!path.includes(modal)) {
      Object.defineProperty(event, 'composedPath', {configurable: true, value: () => [...path, modal]});
    }
  };
  const events = ['pointerdown', 'mousedown', 'click'];
  for (const name of events) view.addEventListener(name, includePlayer, true);
  return () => {
    for (const name of events) view.removeEventListener(name, includePlayer, true);
  };
}
