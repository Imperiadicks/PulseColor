(function () {
  const THEME_NAME = "PulseColor";
  const ORIGIN = "http://localhost:2007";
  const ASSETS_BASE = ORIGIN + "/assets/";

  function assetUrl(file) {
    return (
      ASSETS_BASE +
      encodeURIComponent(file) +
      "?name=" +
      encodeURIComponent(THEME_NAME)
    );
  }

  async function injectCss(file) {
    const url = assetUrl(file);
    console.log("[PulseColor] CSS (inline):", url);

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`CSS HTTP ${res.status}: ${url}`);

    const cssText = await res.text();

    
    if (cssText.trim().startsWith("<")) {
      throw new Error("CSS response looks like HTML (wrong endpoint/theme?): " + url);
    }

    const id = "pulsecolor-css-" + file.replace(/[^a-z0-9_-]/gi, "_");
    let style = document.getElementById(id);
    if (!style) {
      style = document.createElement("style");
      style.id = id;
      document.head.appendChild(style);
    }
    style.textContent = cssText;
  }

  function loadJs(file) {
    const url = assetUrl(file);
    console.log("[PulseColor] JS:", url);

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Failed to load JS: " + url));
      document.body.appendChild(script);
    });
  }

  async function init() {
    try {
      console.log("[PulseColor] Theme:", THEME_NAME);

      await injectCss("main.css");
      await injectCss("osu.css");

      await loadJs("colorize.js");
      await loadJs("OnlineOsuBPM.js");
      await loadJs("MainOsu.js");
      await loadJs("ControlPanelOsu.js");
      await loadJs("controlPulseColor.js");
      await loadJs("index.js");

      console.log("[PulseColor] All assets loaded successfully.");
    } catch (e) {
      console.error("[PulseColor] Asset load failed:", e);
    }
  }

  init();
})();