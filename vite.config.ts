import path from "node:path";

import { promises as fs } from "node:fs";
import { defineConfig } from "vite";

import addonConfig from "./addon.config.mjs";
const root = import.meta.dirname;
const outDir = path.resolve(
  root,
  process.env.PULSESYNC_BUILD_ROOT || "dist",
  addonConfig.directoryName,
);

export default defineConfig(({ mode }) => ({
  build: {
    outDir,
    emptyOutDir: true,
    target: "chrome140",
    minify: mode === "development" ? false : "oxc",
    cssCodeSplit: false,
    lib: {
      entry: path.join(root, "src/theme.ts"),
      formats: ["iife"],
      name: "PulseColorTheme",
      fileName: () => 'script.js',
      cssFileName: "script",
    },
  },
  plugins: [
    {
      name: "pulsecolor-css-theme",
      async closeBundle() {
        await fs.cp(path.join(root, "addon"), outDir, {
          recursive: true,
          force: true,
        });
        for (const file of [
          "README.md",
          "LICENSE-PulseColor.md",
          "THIRD-PARTY-NOTICES.md",
          "LICENSE",
          "LICENSE.ru.md",
        ]) {
          await fs.copyFile(path.join(root, file), path.join(outDir, file));
        }
        await fs.writeFile(
          path.join(outDir, "metadata.json"),
          JSON.stringify(
            {
              ...addonConfig,
              css: "script.css",
            },
            null,
            4,
          ) + "\n",
        );
        // The JS entry only collects CSS imports. Never ship a theme runtime.
        await fs.rm(path.join(outDir, 'script.js'), { force: true });
        await fs.rm(path.join(outDir, 'handleEvents.json'), { force: true });
      },
    },
  ],
}));
