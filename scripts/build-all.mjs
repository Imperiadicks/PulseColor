import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(import.meta.dirname,'../..');

export function yarnInvocation(task, platform = process.platform) {
  if (!['build', 'sync'].includes(task)) throw new Error('Unknown build task');
  // yarn.cmd is a batch wrapper on Windows, not a directly executable binary.
  // Only fixed commands enter cmd; project paths are passed separately as cwd.
  return platform === 'win32'
    ? ['cmd.exe', ['/d', '/s', '/c', `yarn ${task}`]]
    : ['yarn', [task]];
}

export function buildAll({ sync = false, run = spawnSync } = {}) {
  // Finish all builds before replacing any installed addon.
  for (const task of sync ? ['build', 'sync'] : ['build']) {
    const [command, args] = yarnInvocation(task);
    for (const name of ['PulseColorAudioCore', 'PulseColorVisual', 'Cover-Tweaked', 'PulseColor']) {
      const result = run(command, args, { cwd: path.join(root, name), stdio: 'inherit' });
      if (result.error) throw new Error(`Не удалось запустить ${task} для ${name}. Проверьте yarn --version и установку зависимостей.`, { cause: result.error });
      if (result.status !== 0) return result.status || 1;
    }
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = buildAll({ sync: process.argv.includes('--sync') });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
