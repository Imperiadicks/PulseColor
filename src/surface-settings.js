export const PANEL_OPACITY_PROPERTY = '--pulsecolor-panel-opacity';
export function applySurfaceOpacity(settings, doc = document) {
  const blurEntry=settings?.interfaceBlur;
  const blurValue=blurEntry&&typeof blurEntry==='object'?blurEntry.value??blurEntry.default:blurEntry;
  const blur=['none','light','full'].includes(blurValue)?blurValue:({1:'none',2:'light',3:'full'}[blurValue]||'full');
  const filters={heavy:'blur(28px)',medium:'saturate(180%) blur(15px)',large:'blur(25px)'};
  for(const [name,fallback]of Object.entries(filters)){
    const value=blur==='none'?'none':blur==='light'?'blur(8px)':fallback;
    const property='--pulsecolor-ui-blur-'+name;
    if(doc.documentElement.style.getPropertyValue(property)!==value)doc.documentElement.style.setProperty(property,value);
  }
  const speed=settings?.appearanceSpeed;
  const rawSpeed=speed&&typeof speed==='object'?speed.value??speed.default:speed;
  const mode=['fast','normal','slow'].includes(rawSpeed)?rawSpeed:({1:'fast',2:'normal',3:'slow'}[rawSpeed]||'normal');
  const root=doc.documentElement;
  if(root.getAttribute('data-pulsecolor-appearance')!==mode){
    root.setAttribute('data-pulsecolor-appearance',mode);
    doc.defaultView?.dispatchEvent(new Event('pulsecolor:appearance-change'));
  }
  const entry = settings?.panelOpacity;
  const raw = entry && typeof entry === 'object' ? entry.value ?? entry.default : entry;
  const value = typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.min(20, raw)) : 10;
  const next = value + '%';
  const style = doc.documentElement.style;
  if (style.getPropertyValue(PANEL_OPACITY_PROPERTY) !== next) style.setProperty(PANEL_OPACITY_PROPERTY, next);
}
export function clearSurfaceOpacity(doc = document) {
  doc.documentElement.style.removeProperty(PANEL_OPACITY_PROPERTY);
  doc.documentElement.removeAttribute('data-pulsecolor-appearance');
  for(const name of ['heavy','medium','large'])doc.documentElement.style.removeProperty('--pulsecolor-ui-blur-'+name);
  doc.defaultView?.dispatchEvent(new Event('pulsecolor:appearance-change'));
}
