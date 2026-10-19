import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { installDiagnostics,defaultAddonRoot } from './install-audio-diagnostics.mjs';
const ids=['128ee994-8689-4343-865d-5da62956e383','a8a17b79-c9d3-4af7-a984-7a2037a205df'];
test('Windows AppData and Linux config paths',()=>{
  assert.equal(defaultAddonRoot('win32',{APPDATA:'C:\\Users\\Test User\\AppData\\Roaming'},'unused'),'C:\\Users\\Test User\\AppData\\Roaming\\PulseSync\\addons');
  assert.equal(defaultAddonRoot('linux',{},'/tmp/home'),'/tmp/home/.config/PulseSync/addons');
});
test('Portable installer preserves settings and backups and rejects store targets before any write',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'pulsecolor-installer-')),pkg=path.join(temp,'package'),dest=path.join(temp,'addons');
  for(const id of ids){
    const source=path.join(pkg,'addons',id),target=path.join(dest,id);
    await fs.mkdir(source,{recursive:true});await fs.mkdir(target,{recursive:true});
    await fs.writeFile(path.join(source,'metadata.json'),JSON.stringify({id,type:'web-addon',script:'script.js'}));
    await fs.writeFile(path.join(source,'script.js'),'// audio-diag-1');
    await fs.writeFile(path.join(source,'pulsesync.settings.json'),'DO NOT INSTALL');
    await fs.writeFile(path.join(target,'metadata.json'),JSON.stringify({id,installSource:'local'}));
    await fs.writeFile(path.join(target,'script.js'),'old');
    await fs.writeFile(path.join(target,'pulsesync.settings.json'),'original settings');
  }
  const result=await installDiagnostics(pkg,dest);
  for(const id of ids){
    assert.equal(await fs.readFile(path.join(dest,id,'pulsesync.settings.json'),'utf8'),'original settings');
    assert.equal(await fs.readFile(path.join(result.backup,id,'script.js'),'utf8'),'old');
    assert.equal(JSON.parse(await fs.readFile(path.join(dest,id,'metadata.json'),'utf8')).installSource,'local');
  }
  await fs.writeFile(path.join(dest,ids[0],'script.js'),'unchanged');
  await fs.writeFile(path.join(dest,ids[1],'metadata.json'),JSON.stringify({id:ids[1],installSource:'store'}));
  await assert.rejects(installDiagnostics(pkg,dest),/store/);
  assert.equal(await fs.readFile(path.join(dest,ids[0],'script.js'),'utf8'),'unchanged');
});
