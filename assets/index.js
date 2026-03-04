(() => {
  try {
    const current = document.currentScript?.src || "";
    const u = new URL(current);

    const themeName = u.searchParams.get("name") || "PulseColor";
    const assetsBase = `${u.origin}/assets/`;

    const assetUrl = (file) =>
      `${assetsBase}${encodeURIComponent(file)}?name=${encodeURIComponent(themeName)}`;

    const testCss = assetUrl("main.css");
    const testJs = assetUrl("colorize.js");

    console.log("[PulseColor] index.js loaded");
    console.log("[PulseColor] Theme:", themeName);
    console.log("[PulseColor] assets base:", assetsBase);
    console.log("[PulseColor] main.css url:", testCss);
    console.log("[PulseColor] colorize.js url:", testJs);
  } catch (e) {
    console.warn("[PulseColor] index.js init error", e);
  }
})();
