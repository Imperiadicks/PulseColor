// Watch stylesheet changes only: audio metadata and page rendering must not
// trigger computed-style reads. Removed stylesheet subtrees count as well.
export function watchThemeStyles(update, doc = document) {
  const sheet = node => node?.nodeType === 1 &&
    (node.matches?.('style,link[rel~="stylesheet"]') ||
      node.querySelector?.('style,link[rel~="stylesheet"]'));
  const observer = new MutationObserver(records => {
    if (records.some(record =>
      record.type === 'attributes' && record.target?.matches?.('link,style') ||
      record.target?.closest?.('style,link[rel~="stylesheet"]') ||
      record.target?.parentElement?.closest?.('style') ||
      [...record.addedNodes, ...record.removedNodes].some(sheet))) update();
  });
  observer.observe(doc.head, { childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ['disabled', 'media', 'href', 'rel'] });
  const loaded = event => { if (sheet(event.target)) update(); };
  doc.addEventListener('load', loaded, true);
  return () => { observer.disconnect(); doc.removeEventListener('load', loaded, true); };
}
