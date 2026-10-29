import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
test('theme builds CSS only and does not export settings or a script',async()=>{
  const entry=await readFile(new URL('../src/theme.ts',import.meta.url),'utf8');
  assert.ok(!entry.includes('theme-bridge'));
  const config=await readFile(new URL('../vite.config.ts',import.meta.url),'utf8');
  assert.ok(!config.includes('settingsMetadata'));
  assert.ok(!config.includes("script: 'script.js'"));
  const delivery=await readFile(new URL('../scripts/addon-delivery.mjs',import.meta.url),'utf8');
  assert.ok(delivery.includes("metadata.type === 'theme' ? false"));
});
