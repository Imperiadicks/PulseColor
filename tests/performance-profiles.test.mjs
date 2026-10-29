import assert from 'node:assert/strict';
import {test} from 'node:test';
import {effectivePerformanceSettings,PERFORMANCE_PROFILES} from '../src/performance-profiles.js';
test('custom uses actual PulseSync values; presets never rewrite them',()=>{
 const saved={performanceProfile:{value:'custom'},effectsFps:{value:'60'},interfaceBlur:{value:'none'},waveDprLimit:{value:1.25},cover2AnimBlobCount:{value:48}};
 const before=structuredClone(saved);
 assert.deepEqual(effectivePerformanceSettings(saved),saved);
 for(const profile of ['economy','balanced','maximum']){
  const result=effectivePerformanceSettings({...saved,performanceProfile:{value:profile}});
  for(const [key,value]of Object.entries(PERFORMANCE_PROFILES[profile]))assert.equal(result[key],value);
  assert.deepEqual(saved,before);
 }
 assert.deepEqual(effectivePerformanceSettings(saved),before);
 assert.deepEqual(effectivePerformanceSettings({...saved,performanceProfile:{value:1}}),{...saved,performanceProfile:{value:1}});
});
