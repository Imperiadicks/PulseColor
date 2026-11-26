import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {waveRenderScale} from '../../PulseColorVisual/src/modules/wave/WaveTimeline.js';

test('setting names describe actual behaviour without changing saved choice values',async()=>{
  const catalog=JSON.parse(await readFile(new URL('../../PulseColorVisual/src/settings.catalog.json',import.meta.url),'utf8'));
  const items=catalog.sections.flatMap(section=>section.items);
  assert.ok(catalog.sections.some(section=>section.title==='Волна'));
  assert.equal(items.find(item=>item.id==='waveEnabled').name,'Включить волну');
  assert.ok(!items.some(item=>item.id==='wavePerformanceMode'),'Remove the ineffective FPS selector from the UI');
  const quality=items.find(item=>item.id==='waveWebglQuality');
  assert.deepEqual(Object.values(quality.options).map(option=>option.event),['auto','balanced','low']);
  assert.deepEqual(Object.values(quality.options).map(option=>option.name),['Высокое','Среднее','Низкое']);
  assert.match(quality.description,/4K \(3840 × 2160\)/);
  assert.match(quality.description,/Среднее и низкое уменьшают нагрузку/);
  const width=3840,height=2160;
  assert.equal(waveRenderScale(width,height,2,quality.options['1'].event),1);
  assert.equal(waveRenderScale(width*2,height*2,2,quality.options['1'].event),.5);
  for(const [key,budget] of [['2',900000],['3',450000]]){
    const scale=waveRenderScale(width,height,2,quality.options[key].event);
    assert.ok(Math.abs(width*height*scale*scale-budget)<1);
  }
  assert.ok(!JSON.stringify(catalog).includes('без ограничений'));
  const source=items.find(item=>item.id==='waveDriveMode');
  assert.deepEqual(Object.values(source.options).map(option=>option.event),['raw','bpm']);
  assert.equal(source.options['1'].name,'По звуку');
});
