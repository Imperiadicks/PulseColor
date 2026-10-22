import {effectivePerformanceSettings} from './performance-profiles.js';
export const THEME_NODE = 'pulsecolor-theme-settings-v1';
const EVENT = 'pulsecolor:theme-settings';
const THEME_ID = '419c58cb-75c5-48bf-b053-933f3b81190f';
const KEYS = new Set(['panelOpacity','coreColorSource','coreBackgroundImage','coreFullVibe','coreMinimalVibe','coreWhiteRecolor','fullscreenVariant','waveEnabled','waveVariant','wavePaletteMode','waveDriveMode','waveWebglQuality','waveDprLimit','waveCoverColors','waveCoverTexture','waveLogging','waveBpmHud','waveReactionIntensity','waveSensitivity','waveSmoothness','waveBrightness','waveMotionEnabled','waveMotionSpeed','tweakedLyricsMaxBlur','tweakedLyricsBlurStep','tweakedLyricsMinOpacity','tweakedLyricsOpacityStep','tweakedLyricsTransitionMs','cover2AnimColorMode','cover2AnimBlobCount','cover2AnimWarp','cover2AnimFlow','cover2AnimSaturation']);
KEYS.add('premiumTestDenial');
KEYS.add('vibeSettingsHintTest');
for(const key of ['appearanceSpeed','performanceProfile','effectsFps','interfaceBlur','adaptiveQuality','staticOnPause'])KEYS.add(key);
export const THEME_SETTING_KEYS = Object.freeze([...KEYS]);
function cleanSettings(input) {
  const result = {};
  for (const key of KEYS) {
    const entry = input?.[key];
    const value = entry && typeof entry === 'object' ? entry.value ?? entry.default : entry;
    if (typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value) ||
        typeof value === 'string' && value.length <= 256) result[key] = value;
  }
  return result;
}

// Deliberately public, bounded configuration only. Never transport functions,
// credentials, host APIs or player objects across the WebHost isolation boundary.
export function publishThemeSettings(store, doc = document, onSettings) {
  const node = doc.createElement('meta'); node.id = THEME_NODE;
  let disposed = false, previous = '';
  const publish = settings => {
    if (disposed) return;
    settings=effectivePerformanceSettings(settings);
    onSettings?.(settings, doc);
    const json = JSON.stringify({protocol:1,theme:THEME_ID,settings:cleanSettings(settings)});
    if (json === previous) return;
    previous = json;node.content = json;
    doc.dispatchEvent(new Event(EVENT));
  };
  doc.getElementById(THEME_NODE)?.remove();
  doc.head.append(node);
  let unsubscribe;
  try {
    unsubscribe = store.onChange(publish);
    publish(store.getCurrent());
  } catch (error) { unsubscribe?.();node.remove();throw error; }
  return () => {
    if (disposed) return;
    disposed = true;unsubscribe?.();node.remove();doc.dispatchEvent(new Event(EVENT));
  };
}

export function connectThemeSettings(doc = document) {
  let available = false, current = {}, previous = '', disposed = false;
  const listeners = new Set(), states = new Set();
  const read = () => {
    if (disposed) return;
    const json = doc.getElementById(THEME_NODE)?.getAttribute('content') || '';
    if (json === previous) return;
    previous = json;
    const wasAvailable = available;
    available = false;
    try {
      if (json.length > 16384) throw Error('Settings payload too large');
      const value = JSON.parse(json);
      if (value.protocol !== 1 || value.theme !== THEME_ID || !value.settings || Array.isArray(value.settings)) throw Error('Unsupported settings payload');
      current = Object.freeze(cleanSettings(value.settings));available = true;
    } catch { current = Object.freeze({}); }
    if (available) for (const listener of listeners) listener(current);
    if (wasAvailable !== available) for (const listener of states) listener();
  };
  const observer = new MutationObserver(records => {
    if (records.some(record => [...record.addedNodes,...record.removedNodes].some(node => node.id === THEME_NODE))) read();
  });
  observer.observe(doc.head,{childList:true});doc.addEventListener(EVENT,read);read();
  return {
    isAvailable: () => available,
    getCurrent() { if (!available) throw Error('PulseColor theme settings are not connected');return current; },
    onChange(listener) { listeners.add(listener);return () => listeners.delete(listener); },
    subscribeState(listener) { states.add(listener);return () => states.delete(listener); },
    dispose() { disposed=true;observer.disconnect();doc.removeEventListener(EVENT,read);listeners.clear();states.clear(); },
  };
}
