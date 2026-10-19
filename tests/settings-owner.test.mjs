import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import config from '../addon.config.mjs';
import { deliverAddon } from '../scripts/addon-delivery.mjs';

test('current Visual values migrate once, then subsequent installs preserve theme edits', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'pulsecolor-settings-owner-'));
  const previous = process.env.PULSESYNC_ADDONS_DIR;
  const installed = path.join(root, 'installed');
  process.env.PULSESYNC_ADDONS_DIR = installed;
  t.after(async () => {
    if (previous === undefined) delete process.env.PULSESYNC_ADDONS_DIR;
    else process.env.PULSESYNC_ADDONS_DIR = previous;
    await rm(root, {recursive:true,force:true});
  });
  const source = path.join(root,'built');
  const theme = path.join(installed, config.id);
  const visual = path.join(installed, config.dependencies[0]);
  for (const dir of [source,theme,visual]) await mkdir(dir,{recursive:true});
  await writeFile(path.join(source,'metadata.json'),JSON.stringify({...config,css:'script.css',script:''}));
  await writeFile(path.join(source,'script.css'),':root{}');
  const settings = dir => path.join(dir,'pulsesync.settings.json');
  await writeFile(settings(theme),JSON.stringify({waveEnabled:true}));
  const original = JSON.stringify({waveEnabled:false,waveVariant:'variant1',fullscreenVariant:'standard'});
  await writeFile(settings(visual),original);
  const options = {migrateSettingsFrom:config.dependencies[0],migrateSettingsOnce:true};
  await deliverAddon(source,config,root,options);
  assert.equal(await readFile(settings(theme),'utf8'),original);
  assert.equal(await readFile(settings(visual),'utf8'),original);
  const edited = JSON.stringify({waveEnabled:true,coreColorSource:'artist',fullscreenVariant:'standard'});
  await writeFile(settings(theme),edited);
  await deliverAddon(source,config,root,options);
  assert.equal(await readFile(settings(theme),'utf8'),edited);
});
