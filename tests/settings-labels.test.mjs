import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {waveRenderScale} from '../../PulseColorVisual/src/modules/wave/WaveTimeline.js';

test('setting names describe actual behaviour without changing saved choice values',async()=>{
  const catalog=JSON.parse(await readFile(new URL('../src/settings.catalog.json',import.meta.url),'utf8'));
  const items=catalog.sections.flatMap(section=>section.items);
  assert.ok(catalog.sections.some(section=>section.title==='Волна'));
  assert.equal(items.find(item=>item.id==='waveEnabled').name,'Включить волну');
  assert.ok(!items.some(item=>item.id==='wavePerformanceMode'),'Remove the ineffective FPS selector from the UI');
  const quality=items.find(item=>item.id==='waveWebglQuality');
  assert.deepEqual(Object.values(quality.options).map(option=>option.event),['auto','balanced','low']);
  for(const [index,budget] of [1200000,900000,450000].entries()){
    const option=quality.options[String(index+1)];
    const scale=waveRenderScale(3840,2160,2,option.event);
    assert.ok(Math.abs(3840*2160*scale*scale-budget)<1);
    assert.ok(option.name.includes(String(budget/1000000).replace('.',',')));
  }
  assert.ok(!JSON.stringify(catalog).includes('без ограничений'));
  const source=items.find(item=>item.id==='waveDriveMode');
  assert.deepEqual(Object.values(source.options).map(option=>option.event),['raw','bpm']);
  assert.equal(source.options['1'].name,'По звуку');
  assert.equal(items.find(item=>item.id==='tweakedLyricsMinOpacity').name,'Минимальная непрозрачность строк');
});
