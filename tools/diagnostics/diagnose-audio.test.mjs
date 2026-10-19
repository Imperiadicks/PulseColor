import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('./diagnose-audio.js',import.meta.url),'utf8');
async function report(patch=()=>{}){
  let tick=0;
  const ctx={navigator:{platform:'Win32',userAgent:'Chrome/144.0.0'},console:{log(){}},setTimeout(fn){tick++;queueMicrotask(fn)},document:{hidden:false,getElementById(id){
    if(id==='pulsecolor-theme-settings-v1')return {};
    const p={protocol:2,diagnostic:{build:'audio-diag-1',sent:tick*30,subscribed:true,
      engine:{playing:true,hasAnalyser:true,sampleRate:48000,bins:512,reads:tick*60,rawRms:.1,rawSpectrumPeak:80}}};
    const c={build:'audio-diag-1',consumers:1,received:tick*30};patch(p,c);
    return {getAttribute:()=>JSON.stringify(id==='pulsecolor-audio-state-v2'?p:c)};
  }}};ctx.window={};ctx.window.top=ctx.window;
  return await vm.runInNewContext(source,ctx);
}
test('One-shot report distinguishes transport, reader, stopped loop and missing consumer',async()=>{
  assert.equal((await report()).findings.length,0);
  assert.ok((await report((p,c)=>c.received=0)).findings.includes('frames-not-reaching-visual'));
  assert.ok((await report(p=>p.diagnostic.engine.hasAnalyser=false)).findings.includes('audio-reader-unavailable'));
  assert.ok((await report(p=>p.diagnostic.sent=0)).findings.includes('subscribed-but-audio-loop-not-publishing'));
  assert.ok((await report((p,c)=>c.consumers=0)).findings.includes('visual-has-no-audio-consumers'));
  assert.ok((await report((p,c)=>p.diagnostic.subscribed=false)).findings.includes('provider-not-subscribed'));
});
test('Paused audio is not misdiagnosed as broken silent capture; old builds are detected',async()=>{
  const silence=p=>{p.diagnostic.engine.rawRms=0;p.diagnostic.engine.rawSpectrumPeak=0};
  assert.ok((await report(silence)).findings.includes('reader-returns-silence'));
  const paused=await report(p=>{silence(p);p.diagnostic.engine.playing=false});
  assert.ok(paused.findings.includes('playback-not-reported-playing'));
  assert.equal(paused.findings.includes('reader-returns-silence'),false);
  assert.ok((await report(p=>delete p.diagnostic.build)).findings.includes('diagnostic-build-not-loaded'));
  assert.equal(paused.samples.length,12);
});
