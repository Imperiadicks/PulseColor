import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';
export async function buildFamily(rootDir, { mode = 'production', outputRoot = 'dist' } = {}) {
  const previous = process.env.PULSESYNC_BUILD_ROOT;
  process.env.PULSESYNC_BUILD_ROOT = path.resolve(rootDir, outputRoot);
  try { await build({ root: rootDir, configFile: path.join(rootDir, 'vite.config.ts'), mode }); }
  finally {
    if (previous === undefined) delete process.env.PULSESYNC_BUILD_ROOT;
    else process.env.PULSESYNC_BUILD_ROOT = previous;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await buildFamily(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
