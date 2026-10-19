export const PANEL_OPACITY_PROPERTY = '--pulsecolor-panel-opacity';
export function applySurfaceOpacity(settings, doc = document) {
  const entry = settings?.panelOpacity;
  const raw = entry && typeof entry === 'object' ? entry.value ?? entry.default : entry;
  const value = typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.min(20, raw)) : 10;
  const next = value + '%';
  const style = doc.documentElement.style;
  if (style.getPropertyValue(PANEL_OPACITY_PROPERTY) !== next) style.setProperty(PANEL_OPACITY_PROPERTY, next);
}
export function clearSurfaceOpacity(doc = document) {
  doc.documentElement.style.removeProperty(PANEL_OPACITY_PROPERTY);
}
