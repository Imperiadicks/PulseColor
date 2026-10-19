import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ids=['128ee994-8689-4343-865d-5da62956e383','a8a17b79-c9d3-4af7-a984-7a2037a205df'];
export function defaultAddonRoot(platform=process.platform,env=process.env,home=os.homedir()) {
  const p=platform==='win32'?path.win32:path;
  const base=platform==='win32'?(env.APPDATA||p.join(home,'AppData','Roaming')):
    platform==='darwin'?p.join(home,'Library','Application Support'):(env.XDG_CONFIG_HOME||p.join(home,'.config'));
  return p.join(base,'PulseSync','addons');
}
async function exists(p){try{await fs.access(p);return true}catch{return false}}
export async function installDiagnostics(packageRoot,targetRoot) {
  // Validate every package and destination before modifying either addon.
  for(const id of ids){
    const source=path.join(packageRoot,'addons',id),target=path.join(targetRoot,id);
    const meta=JSON.parse(await fs.readFile(path.join(source,'metadata.json'),'utf8'));
    if(meta.id!==id||meta.type!=='web-addon'||meta.script!=='script.js')throw Error('Unexpected diagnostic package: '+id);
    if(!(await fs.readFile(path.join(source,'script.js'),'utf8')).includes('audio-diag-1'))throw Error('Diagnostic build marker missing: '+id);
    if(await exists(target)){
      if((await fs.lstat(target)).isSymbolicLink())throw Error('Refusing a symlink destination: '+target);
      const current=JSON.parse(await fs.readFile(path.join(target,'metadata.json'),'utf8'));
      if(current.id!==id||current.installSource==='store')throw Error('Refusing to overwrite an unrelated/store addon: '+target);
    }
  }
  const backup=path.join(targetRoot,'.pulsecolor-audio-backups',Date.now()+'-'+process.pid);
  for(const id of ids){
    const target=path.join(targetRoot,id);
    if(await exists(target)){
      await fs.mkdir(backup,{recursive:true});
      await fs.cp(target,path.join(backup,id),{recursive:true});
    }
  }
  console.log('Backup directory (if previous addons existed): '+backup);
  for(const id of ids){
    const target=path.join(targetRoot,id);
    await fs.cp(path.join(packageRoot,'addons',id),target,{recursive:true,
      filter:source=>path.basename(source)!=='pulsesync.settings.json'});
    const file=path.join(target,'metadata.json'),meta=JSON.parse(await fs.readFile(file,'utf8'));
    meta.installSource='local';meta.fromPext=false;
    await fs.writeFile(file,JSON.stringify(meta,null,2)+'\n');
  }
  return {backup,installed:ids};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    await installDiagnostics(import.meta.dirname,path.resolve(process.env.PULSESYNC_ADDONS_DIR||defaultAddonRoot()));
    console.log('Installed audio-diag-1. Start PulseSync and Yandex Music. Settings preserved. See AUDIO-DIAGNOSTICS.md.');
  }catch(error){console.error('Installation failed: '+error.message);process.exitCode=1}
}
