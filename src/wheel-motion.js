// Spread coarse wheel input over frames; Swiper still owns geometry, looping,
// selection and all transforms. Never add a CSS tween to its computed poses.
export function smoothWheelMotion(doc = document) {
  const view = doc.defaultView, forwarded = new WeakSet();
  const reduced = view.matchMedia('(prefers-reduced-motion: reduce)');
  let root = null, pending = 0, frame = 0, last = 0;
  const cancel = () => {
    if (frame) view.cancelAnimationFrame(frame);
    root = null; pending = 0; frame = 0; last = 0;
  };
  const tick = now => {
    frame = 0;
    if (!root?.isConnected || doc.hidden || reduced.matches) { cancel();return; }
    const dt = last ? Math.min(40, now - last) : 16;
    last = now;
    const amount = Math.abs(pending) < .35 ? pending : pending * (1 - Math.exp(-dt / 55));
    pending -= amount;
    const event = new view.WheelEvent('wheel', {bubbles:true, cancelable:true, deltaMode:0, deltaY:amount});
    forwarded.add(event);
    root.dispatchEvent(event);
    if (pending) frame = view.requestAnimationFrame(tick);
    else cancel();
  };
  const input = event => {
    if (forwarded.has(event) || event.defaultPrevented || !event.cancelable || event.ctrlKey || event.metaKey || reduced.matches) return;
    const target = event.target?.closest?.('[data-test-id="WHEEL_DESKTOP"]');
    if (!target?.swiper?.mousewheel?.enabled || !target.swiper.params.freeMode?.enabled || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? target.clientHeight : 1);
    if (!delta) return;
    // Keep high-resolution trackpad movement native; do not add double inertia.
    if (event.deltaMode === 0 && Math.abs(delta) < 4 && !frame) return;
    event.preventDefault();event.stopImmediatePropagation();
    if (root !== target || Math.sign(pending) !== Math.sign(delta)) { cancel();root = target; }
    pending += delta;
    if (!frame) frame = view.requestAnimationFrame(tick);
  };
  view.addEventListener('wheel', input, {capture:true, passive:false});
  view.addEventListener('pointerdown', cancel, true);
  view.addEventListener('pagehide', cancel);
  return () => {
    cancel();view.removeEventListener('wheel', input, true);
    view.removeEventListener('pointerdown', cancel, true);view.removeEventListener('pagehide', cancel);
  };
}
