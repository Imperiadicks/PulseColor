import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { yarnInvocation, buildAll } from './build-all.mjs';

test('Windows runs the Yarn batch wrapper through cmd, Linux launches Yarn directly', () => {
  assert.deepEqual(yarnInvocation('build', 'win32'), ['cmd.exe', ['/d', '/s', '/c', 'yarn build']]);
  assert.deepEqual(yarnInvocation('sync', 'win32'), ['cmd.exe', ['/d', '/s', '/c', 'yarn sync']]);
  assert.deepEqual(yarnInvocation('build', 'linux'), ['yarn', ['build']]);
  assert.throws(() => yarnInvocation('build & echo unexpected', 'win32'));
});

test('All builds finish before sync, and paths stay outside shell commands', () => {
  const calls = [];
  assert.equal(buildAll({ sync: true, run(command, args, options) {
    calls.push({ command, args, name: path.basename(options.cwd), cwd: options.cwd });
    return { status: 0 };
  } }), 0);
  assert.deepEqual(calls.map(c => c.name), ['PulseColorAudioCore', 'PulseColorVisual', 'PulseColor', 'PulseColorAudioCore', 'PulseColorVisual', 'PulseColor']);
  assert.deepEqual(calls.map(c => c.args.join(' ')), ['build', 'build', 'build', 'sync', 'sync', 'sync'].map(task => yarnInvocation(task)[1].join(' ')));
  assert.ok(calls.every(c => !c.args.includes(c.cwd)));
});

test('Build failure prevents installation; launch failures are explained', () => {
  let calls = 0;
  assert.equal(buildAll({ sync: true, run() { calls++; return { status: 7 }; } }), 7);
  assert.equal(calls, 1);
  assert.throws(() => buildAll({ run: () => ({ error: new Error('ENOENT') }) }), /yarn --version/);
  assert.equal(buildAll({ run: () => ({ status: null, signal: 'SIGTERM' }) }), 1);
});
