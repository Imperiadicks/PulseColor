import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {THEME_SETTING_KEYS} from '../src/theme-channel.js';
test('the bounded settings channel covers the whole theme catalog and is identical in both web-addons',async()=>{
  const catalog=JSON.parse(await readFile(new URL('../src/settings.catalog.json',import.meta.url),'utf8'));
  assert.deepEqual([...THEME_SETTING_KEYS].sort(),catalog.sections.flatMap(section=>section.items.map(item=>item.id)).sort());
  // Only the theme publisher resolves presets. Isolated consumers transport
  // the resulting settings unchanged, with the identical bounded schema.
  const canonical=(await readFile(new URL('../src/theme-channel.js',import.meta.url),'utf8'))
    .replace("import {effectivePerformanceSettings} from './performance-profiles.js';\n",'')
    .replace('    settings=effectivePerformanceSettings(settings);\n','');
  for(const name of ['PulseColorAudioCore','PulseColorVisual','Cover-Tweaked'])assert.equal(await readFile(new URL(`../../${name}/src/runtime/theme-channel.js`,import.meta.url),'utf8'),canonical);
});
