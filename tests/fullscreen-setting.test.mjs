import assert from 'node:assert/strict';
import { test } from 'node:test';
import { migrateFullscreenSettings } from '../src/fullscreen-setting.js';
test('two fullscreen switches migrate to one exclusive choice without losing other settings', () => {
  for (const [tweakedEnabled, cover2AnimEnabled, expected] of [
    [false,false,'standard'], [true,false,'tweakedYmDesign'],
    [false,true,'cover2Anim'], [true,true,'tweakedYmDesign'],
  ]) {
    const original = {tweakedEnabled,cover2AnimEnabled,waveEnabled:false};
    assert.deepEqual(migrateFullscreenSettings(original),{waveEnabled:false,fullscreenVariant:expected});
    assert.ok(Object.hasOwn(original,'tweakedEnabled'));
  }
  assert.deepEqual(migrateFullscreenSettings({fullscreenVariant:'standard',tweakedEnabled:true,cover2AnimEnabled:true}),{fullscreenVariant:'standard'});
  assert.equal(migrateFullscreenSettings({}).fullscreenVariant,'cover2Anim');
});
