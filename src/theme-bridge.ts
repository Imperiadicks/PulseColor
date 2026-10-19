import { watchPlayerReady } from './player-ready';
import { publishThemeSettings } from './theme-channel.js';
import { watchThemeStyles } from './theme-styles.js';
import { applySurfaceOpacity, clearSurfaceOpacity } from './surface-settings.js';
window.__pulsecolorThemeBridge?.();
// Retire only our previous main-world scripts during the web-addon migration.
(window as any).__pulsecolorVisualLifetime?.dispose?.();
(window as any).__neuroAudioLifetime?.dispose?.();
(window as any).__pulsecolorScriptLifetime?.dispose?.();
const tag = document.currentScript;
let stopped = false, release: (() => void) | undefined;
let store: any;
const selected = () => getComputedStyle(document.documentElement)
  .getPropertyValue('--pulsecolor-theme-active').trim() === '1';
const update = () => {
  if (stopped) return;
  if (tag && !tag.isConnected) { dispose(); return; }
  if (!selected()) { release?.(); release = undefined; clearSurfaceOpacity(); return; }
  if (!release && store) release = publishThemeSettings(store, document, applySurfaceOpacity);
};
const stopStyles = watchThemeStyles(update);
const observer = tag?.parentNode ? new MutationObserver(() => { if (!tag.isConnected) dispose(); }) : null;
function dispose() {
  if (stopped) return;
  stopped=true;stopWatching();stopStyles();release?.();clearSurfaceOpacity();observer?.disconnect();window.removeEventListener('pagehide',dispose);
  if (window.__pulsecolorThemeBridge === dispose) delete window.__pulsecolorThemeBridge;
}
window.__pulsecolorThemeBridge=dispose;
const stopWatching=watchPlayerReady(window,document,raw => {
  if (!stopped) { store=raw.getSettings('PulseColor'); update(); }
});
observer?.observe(tag!.parentNode!,{childList:true});
window.addEventListener('pagehide',dispose,{once:true});
