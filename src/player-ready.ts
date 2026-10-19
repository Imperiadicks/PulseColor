// Observe host script installation, then subscribe once to player readiness.
// Never change host API properties or suppress the host's crash protection.
export function watchPlayerReady(
  host: any,
  doc: Document,
  ready: (api: any) => void,
) {
  let disposed = false;
  let subscribed: any = null;
  let delivered = false;
  const complete = (api: any) => {
    if (disposed || delivered || host.pulsesyncApi !== api) return;
    if (
      typeof api.getState !== "function" ||
      typeof api.getSettings !== "function"
    )
      return;
    delivered = true;
    observer.disconnect();
    doc.removeEventListener("load", check, true);
    doc.removeEventListener("DOMContentLoaded", check);
    ready(api);
  };
  const check = () => {
    const api = host.pulsesyncApi;
    if (disposed || delivered || !api) return;
    if (api.playerInstance) {
      complete(api);
      return;
    }
    if (subscribed === api || typeof api._waitForPlayer !== "function") return;
    subscribed = api;
    api._waitForPlayer(() => complete(api));
  };
  const observer = new host.MutationObserver(check);
  observer.observe(doc.documentElement, { childList: true, subtree: true });
  doc.addEventListener("load", check, true);
  doc.addEventListener("DOMContentLoaded", check);
  check();
  return () => {
    disposed = true;
    observer.disconnect();
    doc.removeEventListener("load", check, true);
    doc.removeEventListener("DOMContentLoaded", check);
  };
}
