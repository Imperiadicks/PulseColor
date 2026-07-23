(() => {
  "use strict";

  const PC = window.PulseColor;
  if (!PC?.dom) throw new Error("PulseColor RuntimeCore must be loaded before PulseColorSettingsUI");
  if (window.PulseColorSettingsUI?.version >= 2) return;

  const injectors = new Map();
  let timer = 0;
  let removeDom = null;
  let serviceRunning = false;

  const run = () => {
    timer = 0;
    for (const [id, injector] of injectors) {
      try { injector(); }
      catch (error) { PC.logger.error("settings-ui-injector", error, { id }); }
    }
  };

  const request = (delay = 80) => {
    if (!serviceRunning || timer) return;
    timer = window.setTimeout(run, Math.max(0, Number(delay) || 0));
  };

  const api = {
    version: 2,
    register(id, injector) {
      if (typeof injector !== "function") throw new TypeError("Settings UI injector must be a function");
      const key = String(id || `injector-${injectors.size + 1}`);
      injectors.set(key, injector);
      request(0);
      return () => injectors.delete(key);
    },
    request,
    refresh: run
  };

  const handleDomReady = () => request(0);
  const handleRouteChange = () => request(120);
  const startService = () => {
    if (serviceRunning) return;
    serviceRunning = true;
    removeDom = PC.dom.subscribe(() => request(60));
    document.addEventListener("DOMContentLoaded", handleDomReady, { once: true });
    window.addEventListener("popstate", handleRouteChange, { passive: true });
    window.addEventListener("hashchange", handleRouteChange, { passive: true });
    request(0);
  };
  const stopService = () => {
    if (!serviceRunning) return;
    serviceRunning = false;
    removeDom?.();
    removeDom = null;
    document.removeEventListener("DOMContentLoaded", handleDomReady);
    window.removeEventListener("popstate", handleRouteChange);
    window.removeEventListener("hashchange", handleRouteChange);
    if (timer) clearTimeout(timer);
    timer = 0;
    document.getElementById("pulsecolor-settings-category")?.remove();
  };
  window.PulseColorSettingsUI = api;
  if (typeof PC.runtime.registerService === "function") {
    PC.runtime.registerService("settings-ui", { start: startService, stop: stopService });
  } else {
    startService();
  }
})();
