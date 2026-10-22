// Separate the transparent header from the page's painted/interactive viewport.
// Keep React nodes, native scroll offsets and virtual-list measurements intact.
export function mountHeaderViewport(doc = document) {
  const view = doc.defaultView;
  const headerSelector = '[data-test-id="STICKY_HEADER"], [data-test-id="TEXT_STICKY_HEADER"], [data-test-id="INNER_HEADER"]';
  let frame = 0, stopped = false;
  const marked = new Map();
  const observed = new Set();
  const resize = new view.ResizeObserver(() => schedule());
  const restore = node => {
    const previous = marked.get(node);
    if (!previous) return;
    node.removeAttribute('data-pc-header-viewport');
    if (previous.value) node.style.setProperty('--pc-header-clip', previous.value, previous.priority);
    else node.style.removeProperty('--pc-header-clip');
    marked.delete(node);
  };
  function update() {
    frame = 0;if (stopped) return;
    const next = new Set(), watch = new Set();
    for (const header of doc.querySelectorAll(headerSelector)) {
      const main = header.closest('main[class*="Content_main"]');
      if (!main || header.closest('[class*="SearchPage_root"]')) continue;
      const queue = [...main.children].map(node => [node, 0]);
      let viewport = null;
      for (const [node, depth] of queue) {
        if (node.contains(header) || node === header || header.contains(node)) continue;
        const style = view.getComputedStyle(node);
        if (/auto|scroll/.test(style.overflowY) && node.clientHeight > 80) { viewport = node;break; }
        if (depth < 2) for (const child of node.children) queue.push([child, depth + 1]);
      }
      if (!viewport) continue;
      const boundary = Math.max(0, header.getBoundingClientRect().bottom - viewport.getBoundingClientRect().top);
      if (boundary >= viewport.clientHeight) continue;
      next.add(viewport);
      if (!marked.has(viewport)) {
        marked.set(viewport, {value:viewport.style.getPropertyValue('--pc-header-clip'),priority:viewport.style.getPropertyPriority('--pc-header-clip')});
        viewport.setAttribute('data-pc-header-viewport', '');
      }
      const value = Math.round(boundary * 100) / 100 + 'px';
      if (viewport.style.getPropertyValue('--pc-header-clip') !== value) viewport.style.setProperty('--pc-header-clip', value);
      watch.add(header);watch.add(viewport);watch.add(main);
    }
    for (const node of [...marked.keys()]) if (!next.has(node)) restore(node);
    for (const node of observed) if (!watch.has(node)) { resize.unobserve(node);observed.delete(node); }
    for (const node of watch) if (!observed.has(node)) { resize.observe(node);observed.add(node); }
  }
  function schedule() { if (!stopped && !frame) frame = view.requestAnimationFrame(update); }
  const observer = new view.MutationObserver(records => {
    if (records.some(r => r.target.matches?.('main[class*="Content_main"], main[class*="Content_main"] > header') ||
      [...r.addedNodes, ...r.removedNodes].some(n => n.matches?.('main[class*="Content_main"], header, ' + headerSelector)))) schedule();
  });
  observer.observe(doc.documentElement, {childList:true, subtree:true});
  view.addEventListener('resize', schedule);update();
  return () => {
    stopped = true;view.cancelAnimationFrame(frame);observer.disconnect();resize.disconnect();
    view.removeEventListener('resize', schedule);
    for (const node of [...marked.keys()]) restore(node);
  };
}
