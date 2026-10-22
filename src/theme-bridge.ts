import { watchPlayerReady } from './player-ready';
import { publishThemeSettings } from './theme-channel.js';
import { watchThemeStyles } from './theme-styles.js';
import { applySurfaceOpacity, clearSurfaceOpacity } from './surface-settings.js';
import { publishOfflineAudio } from './offline-audio-bridge.js';
import { allowVibeSettingsPlayback } from './vibe-settings-interaction.js';
import { smoothWheelMotion } from './wheel-motion.js';
import { mountHeaderViewport } from './header-viewport.js';
window.__pulsecolorThemeBridge?.();
// Retire only our previous main-world scripts during the web-addon migration.
(window as any).__pulsecolorVisualLifetime?.dispose?.();
(window as any).__neuroAudioLifetime?.dispose?.();
(window as any).__pulsecolorScriptLifetime?.dispose?.();
const tag = document.currentScript;
let stopped = false, release: (() => void) | undefined;
let stopOffline: (()=>void) | undefined;
let stopSettingsPlayback: (()=>void) | undefined;
let stopWheelMotion: (()=>void) | undefined;
let stopHeaderViewport: (()=>void) | undefined;
let store: any, rawApi:any;
const selected = () => getComputedStyle(document.documentElement)
  .getPropertyValue('--pulsecolor-theme-active').trim() === '1';
const update = () => {
  if (stopped) return;
  if (tag && !tag.isConnected) { dispose(); return; }
  if (!selected()) { release?.(); release = undefined; stopOffline?.();stopOffline=undefined;stopSettingsPlayback?.();stopSettingsPlayback=undefined;stopWheelMotion?.();stopWheelMotion=undefined;stopHeaderViewport?.();stopHeaderViewport=undefined; clearSurfaceOpacity(); return; }
  if(!stopHeaderViewport)stopHeaderViewport=mountHeaderViewport(document);
  if(!stopWheelMotion)stopWheelMotion=smoothWheelMotion(document);
  if(!stopSettingsPlayback)stopSettingsPlayback=allowVibeSettingsPlayback(document);
  if(!stopOffline&&rawApi)stopOffline=publishOfflineAudio(rawApi);
  if (!release && store) release = publishThemeSettings(store, document, applySurfaceOpacity);
};
const stopStyles = watchThemeStyles(update);
const observer = tag?.parentNode ? new MutationObserver(() => { if (!tag.isConnected) dispose(); }) : null;
function dispose() {
  if (stopped) return;
  stopped=true;stopWatching();stopStyles();release?.();stopOffline?.();stopSettingsPlayback?.();stopWheelMotion?.();stopHeaderViewport?.();clearSurfaceOpacity();observer?.disconnect();window.removeEventListener('pagehide',dispose);
  if (window.__pulsecolorThemeBridge === dispose) delete window.__pulsecolorThemeBridge;
}
window.__pulsecolorThemeBridge=dispose;
const stopWatching=watchPlayerReady(window,document,raw => {
  if (!stopped) { rawApi=raw;store=raw.getSettings('PulseColor'); update(); }
});
observer?.observe(tag!.parentNode!,{childList:true});
window.addEventListener('pagehide',dispose,{once:true});
