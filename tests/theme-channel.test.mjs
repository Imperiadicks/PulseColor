import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {THEME_SETTING_KEYS as visualKeys} from '../../PulseColorVisual/src/runtime/theme-channel.js';
import {THEME_SETTING_KEYS as audioKeys} from '../../PulseColorAudioCore/src/runtime/theme-channel.js';
import {FIXED_SETTINGS} from '../../PulseColorVisual/src/runtime/fixed-settings.js';

test('Visual and AudioCore share the bounded settings they consume',async()=>{
  const catalog=JSON.parse(await readFile(new URL('../../PulseColorVisual/src/settings.catalog.json',import.meta.url),'utf8'));
  const catalogIds=catalog.sections.flatMap(section=>section.items.map(item=>item.id));
  const visualSurfaceKey='hideWindowButtons';
  assert.ok(catalogIds.includes(visualSurfaceKey),'Window buttons remain a user setting');

  // The mod-source switch and fixed defaults also cross the bridge.
  const expectedVisual=new Set([
    ...catalogIds,
    ...Object.keys(FIXED_SETTINGS),
    'waveUseModSettings',
  ]);
  assert.deepEqual([...visualKeys].sort(),[...expectedVisual].sort());
  assert.deepEqual([...audioKeys].sort(),visualKeys.filter(id=>id!==visualSurfaceKey).sort());
});
