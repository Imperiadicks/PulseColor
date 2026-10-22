import path from "node:path";

import { promises as fs } from "node:fs";
import { defineConfig } from "vite";
import { bundleObfuscationPlugin } from './scripts/bundle-obfuscation.mjs';

import addonConfig from "./addon.config.mjs";
import { settingsMetadata } from './src/settings.ts';
import catalog from './src/settings.catalog.json' with { type: 'json' };
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
    bundleObfuscationPlugin(outDir),
    {
      name: "pulsecolor-css-theme",
      async closeBundle() {
        await fs.cp(path.join(root, "addon"), outDir, {
          recursive: true,
          force: true,
        });
        for (const file of [
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
              script: 'script.js',
              settings: settingsMetadata.toConfig(),
            },
            null,
            4,
          ) + "\n",
        );
        await fs.writeFile(path.join(outDir, 'handleEvents.json'), JSON.stringify(catalog, null, 4) + '\n');
      },
    },
  ],
}));
