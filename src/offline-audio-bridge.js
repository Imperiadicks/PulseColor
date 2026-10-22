// Main-world transport for the detached media element used by downloads.
// Capture copies only: never replace the player's source or output routing.
import {createScriptAudio,findPlayerAudio} from '../../PulseColorAudioCore/src/runtime/script-audio.js';
const DEMAND='pulsecolor:offline-demand-v1',FRAME='pulsecolor:offline-frame-v1';
export function publishOfflineAudio(api,doc=document){
  let until=0,provider=null,reader=null,stopped=false;
  const encode=array=>btoa(String.fromCharCode(...new Uint8Array(array.buffer,array.byteOffset,array.byteLength)));
  const frequency=new Uint8Array(1024),waveform=new Float32Array(2048);
  const demand=event=>{
    if(typeof event.detail!=='string'||event.detail.length>256)return;
    try{const p=JSON.parse(event.detail);if(p.protocol===1&&p.client==='128ee994-8689-4343-865d-5da62956e383')until=p.active?performance.now()+2500:0}catch{}
  };
  const tick=()=>{
    if(stopped)return;
    let offline=false;
    try{offline=performance.now()<until&&!doc.hidden&&findPlayerAudio(api.getState()).some(a=>/^(?:blob:|file:|music-application:)/.test(a.currentSrc||a.src))}catch{}
    if(!offline){if(reader){provider.releaseReader();reader=null}return}
    provider??=createScriptAudio(api);
    reader??=provider.getReader();
    if(!reader?.isAvailable())return;
    reader.getByteFrequencyData(frequency);reader.getFloatTimeDomainData(waveform);
    doc.dispatchEvent(new CustomEvent(FRAME,{detail:JSON.stringify({protocol:1,sampleRate:reader.context.sampleRate,frequency:encode(frequency),waveform:encode(waveform)})}));
  };
  doc.addEventListener(DEMAND,demand);
  const timer=setInterval(tick,50);
  return()=>{stopped=true;clearInterval(timer);doc.removeEventListener(DEMAND,demand);provider?.dispose()};
}
