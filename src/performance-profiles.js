export const PERFORMANCE_PROFILES=Object.freeze({
  economy:{appearanceSpeed:'slow',effectsFps:'15',interfaceBlur:'none',adaptiveQuality:true,staticOnPause:true,waveWebglQuality:'low',waveDprLimit:1,cover2AnimBlobCount:16},
  balanced:{appearanceSpeed:'normal',effectsFps:'30',interfaceBlur:'light',adaptiveQuality:true,staticOnPause:true,waveWebglQuality:'balanced',waveDprLimit:1.5,cover2AnimBlobCount:32},
  maximum:{appearanceSpeed:'fast',effectsFps:'60',interfaceBlur:'full',adaptiveQuality:false,staticOnPause:false,waveWebglQuality:'auto',waveDprLimit:2,cover2AnimBlobCount:64},
});
export function effectivePerformanceSettings(input={}){
  const entry=input.performanceProfile;
  const raw=entry&&typeof entry==='object'?entry.value??entry.default:entry;
  const id=({1:'custom',2:'economy',3:'balanced',4:'maximum'})[raw]||raw;
  return {...input,...(PERFORMANCE_PROFILES[id]||{})};
}
