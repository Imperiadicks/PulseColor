import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';
const PACKAGE_LIMIT = 10_000_000;

async function packageBytes(directory) {
  let total = 0;
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) total += await packageBytes(target);
    else if (entry.isFile()) total += (await fs.stat(target)).size;
  }
  return total;
}

export async function buildFamily(rootDir, { mode = 'production', outputRoot = 'dist' } = {}) {
  const config = (await import(pathToFileURL(path.join(rootDir, 'addon.config.mjs')).href)).default;
  const addonDir = path.resolve(rootDir, outputRoot, config.directoryName);
  const previous = process.env.PULSESYNC_BUILD_ROOT;
  process.env.PULSESYNC_BUILD_ROOT = path.resolve(rootDir, outputRoot);
  try {
    await build({ root: rootDir, configFile: path.join(rootDir, 'vite.config.ts'), mode });
    const bytes = await packageBytes(addonDir);
    if (bytes > PACKAGE_LIMIT)
      throw new Error(`PulseColor is ${bytes} bytes; PulseSync limit is ${PACKAGE_LIMIT} bytes.`);
    console.log(`[package-size] ${bytes} / ${PACKAGE_LIMIT} bytes`);
  }
  finally {
    if (previous === undefined) delete process.env.PULSESYNC_BUILD_ROOT;
    else process.env.PULSESYNC_BUILD_ROOT = previous;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await buildFamily(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
