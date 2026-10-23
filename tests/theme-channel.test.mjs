import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {THEME_SETTING_KEYS} from '../../PulseColorVisual/src/runtime/theme-channel.js';
test('Visual publishes a bounded settings schema shared with AudioCore',async()=>{
  const catalog=JSON.parse(await readFile(new URL('../../PulseColorVisual/src/settings.catalog.json',import.meta.url),'utf8'));
  assert.deepEqual([...THEME_SETTING_KEYS].sort(),catalog.sections.flatMap(s=>s.items.map(i=>i.id)).sort());
  const visual=await readFile(new URL('../../PulseColorVisual/src/runtime/theme-channel.js',import.meta.url),'utf8');
  const audio=await readFile(new URL('../../PulseColorAudioCore/src/runtime/theme-channel.js',import.meta.url),'utf8');
  assert.equal(visual,audio);
});
