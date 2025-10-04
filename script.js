/* ========================== TECH BLOCK (панель, логи, HUD, настройки) ========================== */
(() => {
  const KEY_LOG = 'osuLogEnabled';
  const KEY_BPM = 'osuShowBPM';

  /* ---------- лог-окошко ---------- */
  function mountLogBox(){
    if (document.getElementById('osu-wave-log')) return;
    const box = document.createElement('div');
    box.id = 'osu-wave-log';
    box.style.cssText = `
      position:fixed; top:14px; left:50%; transform:translateX(-50%);
      z-index:100000; display:flex; flex-direction:column; gap:8px;
      max-width:520px; pointer-events:none; align-items:center;`;
    document.body.appendChild(box);
  }
  function __realShowLog(message, type='info') {
    let box = document.getElementById('osu-wave-log');
    if (!box) { mountLogBox(); box = document.getElementById('osu-wave-log'); }
    const item = document.createElement('div');
    item.style.cssText = `
      display:flex; align-items:center; gap:10px; pointer-events:auto;
      min-width:280px; max-width:520px; padding:8px 14px;
      background:${type==='error'?'rgba(200,0,0,.9)':
                 type==='warn'?'rgba(200,150,0,.9)':'rgba(50,50,50,.9)'};
      color:#fff; font:13px/1.4 monospace;
      border-radius:8px; box-shadow:0 6px 18px rgba(0,0,0,.35);
      opacity:0; transform:scale(.95);
      transition:opacity .35s, transform .35s;`;
    const txt = document.createElement('span');
    txt.textContent = message;
    txt.style.cssText = `flex:1; word-break:break-word;`;
    const close = document.createElement('span');
    close.textContent = '✖';
    close.style.cssText = `cursor:pointer; color:#ccc; font-size:14px;`;
    close.onclick = () => {
      item.style.opacity='0'; item.style.transform='scale(.95)';
      setTimeout(()=>item.remove(), 350);
    };
    item.append(txt, close); box.appendChild(item);
    requestAnimationFrame(()=>{ item.style.opacity='1'; item.style.transform='scale(1)'; });
    while (box.children.length > 10) box.firstChild.remove();
  }
  window.__setLogEnabled = (v) => {
    window.__LOG_ENABLED = !!v;
    localStorage.setItem(KEY_LOG, window.__LOG_ENABLED ? '1' : '0');
    window.showLog = window.__LOG_ENABLED ? __realShowLog : function(){};
    const box = document.getElementById('osu-wave-log');
    if (box) box.innerHTML='';
  };
  {
    const saved = localStorage.getItem(KEY_LOG);
    window.__LOG_ENABLED = saved === null ? false : saved !== '0';
    window.showLog = window.__LOG_ENABLED ? __realShowLog : function(){};
  }

  /* ---------- BPM HUD ---------- */
  function mountHUD(){
    if (document.getElementById('osu-hud-maxfft')) return;
    const el = document.createElement('div');
    el.id = 'osu-hud-maxfft';
    el.style.cssText = `
      position:fixed; top:6px; right:6px; z-index:100001;
      background:rgba(0,0,0,.5); color:#fff; font:12px/1 monospace;
      padding:4px 6px; border-radius:6px; pointer-events:none;`;
    el.textContent = '…';
    document.body.appendChild(el);
    applyBpmHudVisibility();
  }
  function applyBpmHudVisibility(forceValue = null){
    const v = forceValue == null
      ? ((localStorage.getItem(KEY_BPM) ?? '1') !== '0')
      : !!forceValue;
    const hud = document.getElementById('osu-hud-maxfft');
    if (hud) hud.style.display = v ? '' : 'none';
    if (forceValue != null) localStorage.setItem(KEY_BPM, v ? '0' : '1');
  }

  /* ---------- Конфиг (можно менять в панели) ---------- */
  window.BeatDriverConfig = Object.assign({
    // импульсы / распады
    BEAT_IMPULSE_DOWN: 1,
    BEAT_IMPULSE:      0.1,
    KICK_IMPULSE_BASE: 1,
    DECAY_MS:          500,
    DECAY_MS_VOICE:    350,

    // детектор
    TH_RMS: 0,      // порог громкости в ЯМ
    MIN_CONF: 0.35, 

    // анти-дребезг вторичных событий
    KICK_COOLDOWN_MS: 50,
    VOICE_COOLDOWN_MS: 75,

    // усиление
    OUTER_GAIN: 10.00, 
    INNER_GAIN: 0.50,

    // яркость/смещение
    BRIGHTNESS_BASE: 1.00, // Яркость самой волны
    OFFSET_X_VW:     3, // Для смещения волны, чтоб отцентрировать/сместить в другое место

    // лимиты масштабов
    OUTER_MIN_SCALE: 0.94,
    OUTER_MAX_SCALE: 5.00,
    INNER_MIN_SCALE: 0.1,
    INNER_MAX_SCALE: 1.40,

    // единый режим (оба кольца одинаково по шкале)
    UNIFIED_MODE: false,

    // движение INNER
    MOTION_ENABLED:  true,
    MOTION_STRENGTH: 150, 
    MOTION_SPEED:    1,

    // опережение удара (для ощущения синхры)
    BEAT_LEAD_MS:    100
  }, window.BeatDriverConfig || {});

  /* ---------- Settings Panel (сворачиваемые группы + API) ---------- */
  function mountTechPanel(){
    if (document.getElementById('osu-tech-panel')) return;

    const wrap = document.createElement('div');
    wrap.id = 'osu-tech-panel';
    wrap.style.cssText = `
      position:fixed; bottom:12px; left:7px; z-index:2147483646;
      font:12px/1 monospace; color:#fff; pointer-events:auto; user-select:none;`;

    const gear = document.createElement('button');
    gear.id = 'osu-tech-gear';
    gear.textContent = '⚙ Настройки волны';
    gear.ariaExpanded = 'false';
    gear.style.cssText = `
      padding:6px 10px; border-radius:8px;
      border:1px solid rgba(255,255,255,.25);
      background:rgba(0,0,0,.45); color:#fff;
      cursor:pointer; backdrop-filter:saturate(120%) blur(6px);`;

    const panel = document.createElement('div');
    panel.id = 'osu-tech-body';
    panel.style.cssText = `
      position:absolute; bottom:36px; left:0;
      min-width:260px; padding:10px; border-radius:10px;
      border:1px solid rgba(255,255,255,.15);
      background:rgba(10,10,10,.72);
      box-shadow:0 12px 30px rgba(0,0,0,.4);
      display:none;`;

    // helpers
    const rowCheck = (labelText, checked, onchg, hint='') => {
      const r = document.createElement('label');
      r.style.cssText = `display:flex; align-items:center; gap:8px; padding:6px 4px;`;
      const chk = document.createElement('input'); chk.type='checkbox'; chk.checked=!!checked;
      chk.onchange = ()=>onchg(chk.checked);
      const span = document.createElement('span'); span.textContent = labelText; if (hint) span.title = hint;
      r.append(chk, span); return r;
    };
    const rowNum = (labelText, key, step, hint='', min=null, max=null) => {
      const row = document.createElement('label');
      row.style.cssText = `display:flex;justify-content:space-between;align-items:center;gap:8px;padding:4px;`;
      const span = document.createElement('span'); span.textContent = labelText; if (hint) span.title = hint;
      const inp = document.createElement('input');
      inp.type='number'; inp.step=String(step); inp.value=(window.BeatDriverConfig[key]);
      if (min!=null) inp.min = String(min);
      if (max!=null) inp.max = String(max);
      inp.style.cssText=`width:120px;font:12px monospace;`;
      inp.oninput=()=>{ const v=+inp.value; if(!isNaN(v)) window.BeatDriverConfig[key]=v; };
      row.append(span, inp); return row;
    };

    // collapsible с запоминанием
    const groups = {}; // key -> {box, header, body, storageKey}
    const group = (title, hint = '', keyId = '') => {
      const key = 'osu-tech-group:' + (keyId || title);
      const saved = localStorage.getItem(key);
      const isOpenSaved = saved == null ? '1' : saved;

      const box = document.createElement('div');
      box.className = 'group-box';
      box.dataset.key = keyId;

      const header = document.createElement('button');
      header.type = 'button';
      header.className = 'group-header';
      header.setAttribute('aria-expanded', isOpenSaved === '1' ? 'true' : 'false');
      header.innerHTML = `
        <span class="group-title">${title}</span>
        <span class="group-toggle" aria-hidden="true">▾</span>
      `;

      if (hint){
        const s = document.createElement('span');
        s.className = 'hint'; s.textContent = hint;
        box.appendChild(s);
      }

      const body = document.createElement('div');
      body.className = 'group-body';
      body.style.display = (isOpenSaved === '1') ? '' : 'none';

      header.onclick = () => {
        const open = body.style.display !== 'none';
        body.style.display = open ? 'none' : '';
        header.setAttribute('aria-expanded', open ? 'false' : 'true');
        localStorage.setItem(key, open ? '0' : '1');
      };

      box.appendChild(header);
      box.appendChild(body);
      box.__body = body;

      groups[keyId] = { box, header, body, storageKey: key };
      return box;
    };

    // верхние чекбоксы
    panel.append(
      rowCheck('Показывать логи', window.__LOG_ENABLED, (v)=>window.__setLogEnabled(v), 'Включает всплывающие сообщения'),
      rowCheck('Показывать BPM', (localStorage.getItem('osuShowBPM') ?? '1') !== '0',
        (v)=>{ const hud=document.getElementById('osu-hud-maxfft'); if(hud) hud.style.display=v?'':'none'; localStorage.setItem('osuShowBPM', v?'1':'0'); },
        'Маленький HUD в правом верхнем углу')
    );

    // 1) Реакция на удары
    const gBeats = group('Реакция на удары', 'Отклик внешнего кольца на такт и сильную долю.', 'beats');
    gBeats.__body.append(
      rowNum('Импульс сильной доли (Downbeat)', 'BEAT_IMPULSE_DOWN', 0.01, 'Сила «пинка» на 1-ю долю такта'),
      rowNum('Импульс обычного бита',           'BEAT_IMPULSE',      0.01, 'Отклик на 2-ю/3-ю/4-ю доли'),
      rowNum('База баса (Kick Base)',           'KICK_IMPULSE_BASE', 0.01, 'Минимальный вклад баса')
    ); panel.append(gBeats);

    // 2) Затухание / анти-дребезг
    const gDecay = group('Затухание и анти-дребезг', 'Скорость остывания и защита от частых срабатываний.', 'decay');
    gDecay.__body.append(
      rowNum('Спад внешнего (мс)', 'DECAY_MS', 1, 'Чем меньше — тем короче шлейф'),
      rowNum('Спад голоса (мс)',   'DECAY_MS_VOICE', 1, 'Быстрота «успокоения» вокала'),
      rowNum('Анти-дребезг баса (мс)',   'KICK_COOLDOWN_MS', 1, 'Мин. интервал между басовыми срабатываниями'),
      rowNum('Анти-дребезг голоса (мс)', 'VOICE_COOLDOWN_MS',1, 'Мин. интервал между голосовыми пиками')
    ); panel.append(gDecay);

    // 3) Порог и уверенность
    const gThresh = group('Порог и уверенность', 'Фильтрация шума и минимальная уверенность детектора.', 'threshold');
    gThresh.__body.append(
      rowNum('Порог тишины RMS', 'TH_RMS', 0.000001, 'Ниже — считаем тишиной (движений нет)'),
      rowNum('Мин. уверенность (0..1)', 'MIN_CONF', 0.01, 'Ниже — биты игнорируются', 0, 1)
    ); panel.append(gThresh);

    // 4) Усиление, яркость и лимиты
    const gGain = group('Усиление и яркость', 'Мощность пульса, яркость и пределы масштабов.', 'gain');
    gGain.__body.append(
      rowNum('Усиление внешнего', 'OUTER_GAIN', 0.01, 'Множитель для внешнего кольца'),
      rowNum('Усиление внутреннего', 'INNER_GAIN', 0.01, 'Множитель для внутреннего кольца'),
      rowNum('Базовая яркость', 'BRIGHTNESS_BASE', 0.01, 'Глобальная яркость эффекта'),
      rowNum('Мин. масштаб внешнего', 'OUTER_MIN_SCALE', 0.01, 'Лимит снизу для outer'),
      rowNum('Макс. масштаб внешнего', 'OUTER_MAX_SCALE', 0.01, 'Лимит сверху для outer'),
      rowNum('Мин. масштаб внутреннего', 'INNER_MIN_SCALE', 0.01, 'Лимит снизу для inner'),
      rowNum('Макс. масштаб внутреннего', 'INNER_MAX_SCALE', 0.01, 'Лимит сверху для inner')
    ); panel.append(gGain);

    // 5) Движение внутреннего
    const gMove = group('Движение внутреннего кольца', 'Смещение inner: пружина + мягкий дрейф.', 'move');
    gMove.__body.append(
      rowCheck('Включить движение (Inner)', !!window.BeatDriverConfig.MOTION_ENABLED,
        (v)=>{ window.BeatDriverConfig.MOTION_ENABLED = !!v; },
        'Если выключено — inner только пульсирует без смещения'
      ),
      rowNum('Сила движения (px)', 'MOTION_STRENGTH', 1, 'Амплитуда смещения'),
      rowNum('Скорость движения',  'MOTION_SPEED', 0.01, '0.05–1.0 (реком. 0.25–0.40)', 0.05, 1),
      rowNum('Смещение вправо (vw)','OFFSET_X_VW', 0.1, 'Сдвиг всего эффекта'),
      rowNum('Опережение удара (мс)','BEAT_LEAD_MS', 1, 'Сдвиг фазы вперёд'),
      rowCheck('Единый режим (оба кольца одинаково)', !!window.BeatDriverConfig.UNIFIED_MODE,
        (v)=>{ window.BeatDriverConfig.UNIFIED_MODE = !!v; },
        'Обе шкалы масштаба объединяются в одну'
      ),
    ); panel.append(gMove);

    gear.onclick = () => {
      const open = panel.style.display !== 'none';
      panel.style.display = open ? 'none' : 'block';
      gear.ariaExpanded = String(!open);
    };

    wrap.append(gear, panel);
    document.body.appendChild(wrap);

    // Экспорт управления группами
    window.PulseUI = Object.assign(window.PulseUI||{}, {
      groups: Object.keys(groups), // ['beats','decay','threshold','gain','move']
      toggleGroup(key, open){
        const g = groups[key]; if (!g) return false;
        const isOpen = g.body.style.display !== 'none';
        const want = (typeof open === 'boolean') ? open : !isOpen;
        g.body.style.display = want ? '' : 'none';
        g.header.setAttribute('aria-expanded', want ? 'true' : 'false');
        localStorage.setItem(g.storageKey, want ? '1' : '0');
        return true;
      },
      getGroupState(key){
        const g = groups[key]; if (!g) return null;
        return g.body.style.display !== 'none';
      }
    });
  }

  function mountAll(){ mountLogBox(); mountHUD(); mountTechPanel(); }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', mountAll,{once:true});
  else mountAll();
  new MutationObserver(()=>{if(!document.getElementById('osu-tech-panel'))mountAll();})
    .observe(document.documentElement,{childList:true,subtree:true});
})();

/* ========================== Вспомогательно: true, если реально есть звук ========================== */
function __audioOn(){
  const rms = (window.__OSU__?.rms || 0);
  const thr = (window.BeatDriverConfig?.TH_RMS || 0.000001) * 1.2;
  return rms > thr;
}

/* ========================== AUDIOTAP v2 (tee @Destination + captureStream) ========================== */
(() => {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;

  const OSU = (window.__OSU__ = window.__OSU__ || {});
  if (AudioNode.prototype.__osuTapPatched) { if (!OSU.__tapRaf) OSU.__tapRaf = requestAnimationFrame(loop); return; }

  let ctxMain = null;
  const bundles = new Set();           // { ctx, analyser, time(Float32Array), spec(Uint8Array) }
  const perCtx  = new WeakMap();       // ctx -> bundle
  const tappedAudio = new WeakSet();   // <audio> уже подключали
  const teedNodes  = new WeakSet();    // AudioNode уже врезали

  function ensureBundleForCtx(ctx){
    if (!ctx) return null;
    let b = perCtx.get(ctx);
    if (!b){
      const a = ctx.createAnalyser();
      a.fftSize = 4096;
      a.smoothingTimeConstant = 0.55;
      b = { ctx, analyser:a, time:new Float32Array(a.fftSize), spec:new Uint8Array(a.frequencyBinCount) };
      perCtx.set(ctx, b); bundles.add(b);
      if (!OSU.analyser) {
        OSU.ctx = ctx; ctxMain = ctx;
        OSU.analyser = a;
        OSU.fftBins = a.frequencyBinCount;
        OSU.spec = b.spec;
        OSU.timeBuf = new Uint8Array(a.fftSize);
        window.showLog?.('[Tap] bound main analyser');
      }
    }
    return b;
  }

  // hook connect → destination
  const origConnect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function(dest, ...rest){
    const out = origConnect.call(this, dest, ...rest);
    try{
      const ctx = this.context || dest?.context;
      if (dest && ctx && /Destination/i.test(dest.constructor?.name||'')) {
        const b = ensureBundleForCtx(ctx);
        if (b && !teedNodes.has(this)) {
          try { origConnect.call(this, b.analyser); } catch {}
          teedNodes.add(this);
          if (!OSU.__tapRaf) OSU.__tapRaf = requestAnimationFrame(loop);
          window.showLog?.('[Tap] tee @dest from ' + (this.constructor?.name||'AudioNode'));
        }
      }
    }catch{}
    return out;
  };
  AudioNode.prototype.__osuTapPatched = true;

  // прямой захват <audio>
  function tapMediaElement(el){
    if (!el || tappedAudio.has(el)) return;
    tappedAudio.add(el);

    const ctx = ctxMain || new AC();
    ctxMain = ctx;

    const stream = el.captureStream?.();
    if (stream) {
      const src = ctx.createMediaStreamSource(stream);
      const b = ensureBundleForCtx(ctx);
      try { src.connect(b.analyser); } catch {}
      if (!OSU.__tapRaf) OSU.__tapRaf = requestAnimationFrame(loop);
      window.showLog?.('[Tap] captureStream attached');
      return;
    }
    try{
      const src = ctx.createMediaElementSource(el);
      const b = ensureBundleForCtx(ctx);
      src.connect(b.analyser);
      if (!OSU.__tapRaf) OSU.__tapRaf = requestAnimationFrame(loop);
      window.showLog?.('[Tap] mediaElementSource attached');
    }catch(e){
      window.showLog?.('[Tap] mediaElementSource failed: ' + e?.name);
    }
  }
  document.querySelectorAll('audio').forEach(tapMediaElement);
  new MutationObserver(muts=>{
    for (const m of muts){
      m.addedNodes && m.addedNodes.forEach(n=>{
        if (n && n.nodeType===1){
          if (n.tagName==='AUDIO') tapMediaElement(n);
          n.querySelectorAll && n.querySelectorAll('audio').forEach(tapMediaElement);
        }
      });
    }
  }).observe(document.documentElement,{childList:true,subtree:true});
  if (OSU.ctx) ensureBundleForCtx(OSU.ctx);

  // цикл анализа
  let ema = 0;
  function loop(){
    let maxRms = 0;
    for (const b of bundles){
      try{
        b.analyser.getFloatTimeDomainData(b.time);
        let s = 0; const t = b.time;
        for (let i=0;i<t.length;i++){ const v=t[i]; s += v*v; }
        const rms = Math.sqrt(s / t.length);
        if (rms > maxRms) maxRms = rms;
        b.analyser.getByteFrequencyData(b.spec);
        if (b.analyser === OSU.analyser) OSU.spec = b.spec;
      }catch{}
    }
    ema = ema*0.85 + maxRms*0.15;
    OSU.rms = ema;
    OSU.__tapRaf = requestAnimationFrame(loop);
  }
})();

/* ========================== OsuBeatClassic (BPM + биты из spectral flux) ========================== */
(() => {
  const OSU = (window.__OSU__ = window.__OSU__ || {});
  if (!('requestAnimationFrame' in window)) return;

  const CFG = {
    bpmMin: 50, bpmMax: 210,
    gateHoldMs: 55,                 // защита от слишком частых онсетов
    fluxWin: 48,                    // окно локальной статистики
    fluxK: 1.45,                    // множитель сигмы
    retempoEveryMs: 800,            // как часто пересчитывать темп
    lockNeedIOIs: 6,                // сколько межударных интервалов нужно
  };

  let analyser = null, spec=null, lastSpec=null;
  let fluxBuf=[], timeBuf=[];
  let lastOnsetT = 0, lastBeatT = 0;
  let ibIs = [];
  let bpm = 0, periodMs = 0;
  let locked = false, conf = 0;
  let nextBeat = 0, beatIndex = 0;
  let lastRetempo = 0;

  const now = ()=>performance.now();
  const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));

  function bindAnalyser(){
    if (OSU.analyser && OSU.analyser!==analyser){
      analyser = OSU.analyser;
      spec = OSU.spec = new Uint8Array(analyser.frequencyBinCount);
      lastSpec = new Uint8Array(analyser.frequencyBinCount);
      analyser.smoothingTimeConstant = 0.55;
    }
  }

  function spectralFlux(){
    analyser.getByteFrequencyData(spec);

    // --- БАС / ГОЛОС + события ---
    let low=0, mid=0, nL=0, nM=0;
    for (let i=0;i<spec.length;i++){
      const v = spec[i]/255;
      if (i < spec.length*0.18){ low += v*v; nL++; }                         // ~до 200 Гц
      if (i > spec.length*0.25 && i < spec.length*0.65){ mid += v*v; nM++; } // ~300..2к Гц
    }
    const kickStr  = Math.sqrt(low/(nL||1));
    const voiceStr = Math.sqrt(mid/(nM||1));

    // непрерывная огибающая голоса (EMA)
    OSU.voiceEnv   = (OSU.voiceEnv ?? 0) * 0.92 + voiceStr * 0.08;
    OSU.voiceLevel = voiceStr;

    const nowMs = performance.now();
    const V_THR = (window.BeatDriverConfig?.VOICE_EVENT_THR ?? 0.10);
    const V_CD  = (window.BeatDriverConfig?.VOICE_COOLDOWN_MS ?? 60);
    const K_CD  = (window.BeatDriverConfig?.KICK_COOLDOWN_MS  ?? 45);

    if (kickStr > 0.13 && (!OsuBeat.__lastKickAt || nowMs-OsuBeat.__lastKickAt > K_CD)){
      OsuBeat.__lastKickAt = nowMs;
      window.dispatchEvent(new CustomEvent('osu-kick', { detail:{ strength:kickStr }}));
    }
    if (voiceStr > V_THR && (!OsuBeat.__lastVoiceAt || nowMs-OsuBeat.__lastVoiceAt > V_CD)){
      OsuBeat.__lastVoiceAt = nowMs;
      window.dispatchEvent(new CustomEvent('osu-voice', { detail:{ strength:voiceStr }}));
    }

    // --- spectral flux (half-wave rectified) с акцентом на низ ---
    let f = 0, N = spec.length;
    for (let i=0;i<N;i++){
      const w = (i < N*0.20) ? 1.8 : (i < N*0.55 ? 1.0 : 0.7);
      const d = (spec[i] - lastSpec[i]);
      if (d > 0) f += (d/255) * w;
      lastSpec[i] = spec[i];
    }
    return f;
  }

  function localFluxThresh(){
    const n = fluxBuf.length;
    const w = Math.min(CFG.fluxWin, n);
    if (!w) return Infinity;
    let m=0; for (let i=n-w; i<n; i++) m += fluxBuf[i]; m/=w;
    let s=0; for (let i=n-w; i<n; i++){ const d=fluxBuf[i]-m; s += d*d; }
    const stdev = Math.sqrt(s/Math.max(1,w));
    return m + CFG.fluxK * stdev;
  }
  function pushFlux(t, f){
    fluxBuf.push(f); timeBuf.push(t);
    if (fluxBuf.length > 800){ fluxBuf.shift(); timeBuf.shift(); }
  }

  function estimateTempoByIOI(){
    if (ibIs.length < CFG.lockNeedIOIs) return 0;
    const xs = ibIs.slice(-14);
    const norm = xs.map(v=>{
      let p=v;
      while (p < 60000/CFG.bpmMax) p*=2;
      while (p > 60000/CFG.bpmMin) p/=2;
      return clamp(p, 60000/CFG.bpmMax, 60000/CFG.bpmMin);
    });
    const bin=10, minP=60000/CFG.bpmMax, maxP=60000/CFG.bpmMin;
    const bins = new Array(Math.floor((maxP-minP)/bin)+1).fill(0);
    for (const v of norm){
      const idx = Math.round((v-minP)/bin);
      if (bins[idx]!=null) bins[idx] += 1;
    }
    let bestI=0, bestV=-1;
    for (let i=0;i<bins.length;i++) if (bins[i]>bestV){ bestV=bins[i]; bestI=i; }
    const per = minP + bestI*bin;
    return clamp(Math.round(60000/per), CFG.bpmMin, CFG.bpmMax);
  }

  function dispatch(name, detail){ window.dispatchEvent(new CustomEvent(name, { detail })); }

  function loop(){
    bindAnalyser();
    const t = now();
    if (!analyser){ requestAnimationFrame(loop); return; }

    const f = spectralFlux(); pushFlux(t, f);
    const thr = localFluxThresh();
    const isPeak = f > thr && (f - (fluxBuf.at(-2)||0)) > 0;

    if (isPeak && (t - lastOnsetT) >= CFG.gateHoldMs){
      lastOnsetT = t;

      if (lastBeatT > 0){
        const ibi = t - lastBeatT;
        if (ibi >= 180 && ibi <= 1200){ ibIs.push(ibi); if (ibIs.length > 32) ibIs.shift(); }
      }
      if (t - lastRetempo >= CFG.retempoEveryMs){
        lastRetempo = t;
        const est = estimateTempoByIOI();
        if (est){
          const targetPeriod = 60000/est;
          if (!locked){ bpm = est; periodMs = targetPeriod; locked = true; conf = Math.max(conf, 0.30); }
          else { bpm = Math.round(bpm*0.6 + est*0.4); periodMs = periodMs*0.6 + targetPeriod*0.4; conf = Math.min(1, conf + 0.05); }
        } else {
          conf = Math.max(0, conf - 0.02);
          if (conf < 0.12) locked = false;
        }
      }

      lastBeatT = t;
      if (locked){ nextBeat = t + periodMs; }
      const payload = { time: t, bpm: bpm||null, beatIndex: ++beatIndex, downbeat: (beatIndex%4)===1, confidence: conf };
      dispatch('osu-beat', payload);
      dispatch('osu-beat-visual', payload);
    }

    // сетка бита — только если реально есть звук
    if (locked && periodMs > 0 && (__audioOn?.() ?? true)){
      while (t >= nextBeat){
        const payload = { time: nextBeat, bpm, beatIndex: ++beatIndex, downbeat: (beatIndex%4)===1, confidence: conf };
        dispatch('osu-beat',        payload);
        dispatch('osu-beat-visual', payload);
        nextBeat += periodMs;
      }
    } else if (locked) {
      nextBeat = t + periodMs;
    }

    // фаза (0..1)
    let phase = 0;
    if (locked && periodMs>0){
      const prev = nextBeat - periodMs;
      phase = Math.min(1, Math.max(0, (t - prev) / periodMs));
    }

    // HUD
    const hud = document.getElementById('osu-hud-maxfft');
    if (hud){ hud.textContent = bpm ? `${bpm} BPM  • conf ${conf.toFixed(2)}${locked?' ✓':''}` : '…'; }

    // экспорт API
    OsuBeat.bpm        = () => (bpm || null);
    OsuBeat.confidence = () => conf;
    OsuBeat.phase      = () => phase;
    OsuBeat.isLocked   = () => !!locked;

    requestAnimationFrame(loop);
  }

  // API
  const OsuBeat = (window.OsuBeat = window.OsuBeat || {});
  OsuBeat.bpm        = () => null;
  OsuBeat.confidence = () => 0;
  OsuBeat.phase      = () => 0;
  OsuBeat.isLocked   = () => false;
  OsuBeat.onBeat     = (fn)=>{ window.addEventListener('osu-beat', e=>fn?.(e.detail)); };
  OsuBeat.retune     = ({ presetBpm } = {}) => {
    if (!presetBpm) return;
    const b = clamp(Math.round(presetBpm), CFG.bpmMin, CFG.bpmMax);
    bpm = b; periodMs = 60000 / b; locked = true; conf = Math.max(conf, 0.50); nextBeat = now() + periodMs;
  };

  requestAnimationFrame(loop);
})();

/* ========================== BeatDriver (импульсы + шкала) ========================== */
(() => {
  const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
  let impKick = 0, impVoice = 0;

  const getConf = () => (window.OsuBeat?.confidence?.() ?? 0);
  const audioActive = () => (__audioOn?.() ?? true);

  // Бит → внешний контур
  const onBeat = (e) => {
    if (!audioActive()) return;
    const c = getConf();
    const weight = 0.6 + 0.4 * clamp(c, 0, 1);
    const down = !!e.detail?.downbeat;
    const cfg = window.BeatDriverConfig||{};
    const base = down ? (cfg.BEAT_IMPULSE_DOWN||0) : (cfg.BEAT_IMPULSE||0);
    impKick += base * weight * (cfg.OUTER_GAIN||1);

    try{
      const outer = document.getElementById('osu-pulse-outer');
      if (outer){
        outer.classList.remove('pulse'); void outer.offsetWidth;
        outer.classList.add('pulse');
        setTimeout(()=>outer && outer.classList.remove('pulse'), 480);
      }
    }catch{}
  };
  window.addEventListener('osu-beat-visual', onBeat);
  window.addEventListener('osu-beat',        onBeat);

  // Бас → внешний
  window.addEventListener('osu-kick', (e) => {
    if (!audioActive()) return;
    const s = +e.detail?.strength || 0;
    if (s < 0.0045) return;
    const cfg = window.BeatDriverConfig||{};
    impKick += Math.min(0.16, (cfg.KICK_IMPULSE_BASE||0) + s * 0.55) * (cfg.OUTER_GAIN||1);
  });

  // Голос → внутренний (усилен)
  window.addEventListener('osu-voice', (e) => {
    if (!audioActive()) return;
    const s = +e.detail?.strength || 0;
    const cfg = window.BeatDriverConfig||{};
    const gainImp = (cfg.VOICE_IMPULSE_GAIN ?? 1.20); // усилитель события голоса
    const add = Math.min(0.22, (0.075 + s * 0.90)) * (cfg.INNER_GAIN||1) * gainImp;
    impVoice += add;
  });

  window.BeatDriver = {
    // возвращает масштабы внешнего/внутреннего колец
    scales(dtMs){
      const cfg = window.BeatDriverConfig||{};
      const active = audioActive();

      // эксп. распады импульсов
      const dKick  = Math.exp(-dtMs / (cfg.DECAY_MS       || 150));
      const dVoice = Math.exp(-dtMs / (cfg.DECAY_MS_VOICE || 190));
      impKick  *= dKick;
      impVoice *= dVoice;

      if (!active) return { outer:1, inner:1, active:false };

      const soft = (x, k=0.9) => Math.tanh(x * k);

      // дыхание по фазе + микро по RMS
      const ph = window.OsuBeat?.phase?.() ?? 0;
      const breath = Math.sin(ph * 2 * Math.PI) * 0.008;
      const rms = Math.min(1, Math.max(0, (window.__OSU__?.rms || 0) * 3.0));
      const micro = rms * 0.006;

      // непрерывная огибающая голоса
      const voiceEnv = Math.max(0, Math.min(1, (window.__OSU__?.voiceEnv || 0)));
      const envGain  = (cfg.VOICE_ENVELOPE_GAIN ?? 1.40);

      if (cfg.UNIFIED_MODE) {
        const uni = soft(impKick * .6 + (impVoice + voiceEnv*envGain) * .6) + breath + micro;
        const minS = Math.min(cfg.OUTER_MIN_SCALE||0.94, cfg.INNER_MIN_SCALE||0.95);
        const maxS = Math.max(cfg.OUTER_MAX_SCALE||1.6,  cfg.INNER_MAX_SCALE||1.4);
        const s = Math.min(maxS, Math.max(minS, 1 + uni));
        return { outer:s, inner:s, active:true };
      }

      const outerRaw = 1 + breath + soft(impKick)  + micro;
      const innerRaw = 1 + breath + soft( impVoice * 0.70 + voiceEnv * envGain ) + micro * 0.40;

      const outer = Math.min(cfg.OUTER_MAX_SCALE||1.6, Math.max(cfg.OUTER_MIN_SCALE||0.94, outerRaw));
      const inner = Math.min(cfg.INNER_MAX_SCALE||1.4, Math.max(cfg.INNER_MIN_SCALE||0.95, innerRaw));

      return { outer, inner, active:true };
    },
    isActive(){ return audioActive(); }
  };
})();

/* ========================== VISUAL (сверхплавное движение, кольца, свечение) ========================== */
(() => {
  const clamp = (x,a,b)=>Math.min(b,Math.max(a,x));
  const now   = ()=>performance.now();

  // ── DOM ──────────────────────────────────────────────────────────────
  let root = document.getElementById('osu-pulse');
  if (!root){ root=document.createElement('div'); root.id='osu-pulse'; document.body.appendChild(root); }

  let outer = document.getElementById('osu-pulse-outer');
  if (!outer){ outer=document.createElement('div'); outer.id='osu-pulse-outer'; root.appendChild(outer); }

  let inner = document.getElementById('osu-pulse-inner');
  if (!inner){ inner=document.createElement('div'); inner.id='osu-pulse-inner'; root.appendChild(inner); }

  let ringHost = document.getElementById('osu-pulse-rings');
  if (!ringHost){
    ringHost=document.createElement('div');
    ringHost.id='osu-pulse-rings';
    ringHost.style.cssText='position:absolute;inset:0;pointer-events:none;';
    root.appendChild(ringHost);
  }

  // Glow-слой (яркость > 2 усиливает свечение)
  let glow = document.getElementById('osu-pulse-glow');
  if (!glow){
    glow = document.createElement('div');
    glow.id = 'osu-pulse-glow';
    glow.style.cssText = `
      position:absolute; inset:0; pointer-events:none; mix-blend-mode:screen;
      opacity:0; filter:blur(0px);
      background:
        radial-gradient(circle at 50% 55%,
          rgba(255,255,255,.55) 0%,
          rgba(255,255,255,.18) 28%,
          transparent 70%);
      will-change: opacity, filter;`;
    root.appendChild(glow);
  }

  // ── Состояние движения ──────────────────────────────────────────────
  if (!window.__pmState)
    window.__pmState = {dx:0,dy:0,vx:0,vy:0,tx:0,ty:0,last:now(),lastBeatIdx:-1,breath:0,vxLP:0,vyLP:0,__ts:performance.now()};
  const S = window.__pmState;

  // ── Кольца ───────────────────────────────────────────────────────────
  const rings=[]; const MAX_RINGS=6;
  const easeOutCubic = x=>1-Math.pow(1-x,3);

  function spawnRing(detail){
    const bpm = window.OsuBeat?.bpm?.();
    if (!bpm) return;

    while (rings.length >= MAX_RINGS){ const r=rings.shift(); r?.el?.remove(); }
    const conf = +(window.OsuBeat?.confidence?.() ?? 0);
    const period = clamp(60000/Math.max(50,Math.min(210,bpm)),285,900);
    const dur = clamp(period*(0.95+(1-conf)*0.25),260,1000);

    const down = !!detail?.downbeat;
    const baseScale = down?1.05:1.02, endScale=down?1.38:1.26;
    const startAlpha = 0.10 + conf*0.10;

    const el=document.createElement('div');
    el.className='osu-ring';
    el.style.cssText=`
      position:absolute;inset:0;pointer-events:none;mix-blend-mode:screen;border-radius:50%;
      transform:scale(${baseScale});opacity:${startAlpha};transition:none;filter:blur(${down?0.6:0.4}px);
      background:
        radial-gradient(circle at 50% 55%,
          color-mix(in hsl, var(--ym-background-color-secondary-enabled-blur, rgba(255,255,255,.24)) 52%, transparent) 0%,
          color-mix(in hsl, var(--ym-background-color-secondary-enabled-blur, rgba(255,255,255,.24)) 26%, transparent) 28%,
          transparent 70%);
      will-change:transform,opacity,filter;`;
    ringHost.appendChild(el);
    rings.push({el,t0:now(),dur,start:{s:baseScale,a:startAlpha},end:{s:endScale,a:0}});
  }
  window.addEventListener('osu-beat',        e=>spawnRing(e.detail));
  window.addEventListener('osu-beat-visual', e=>spawnRing(e.detail));

  // лёгкий «тычок» цели от вокала
  window.addEventListener('osu-voice', (e)=>{
    const s = +e.detail?.strength || 0;
    const kick = (window.BeatDriverConfig?.MOTION_STRENGTH || 100)*0.18*Math.min(1, Math.max(0, s*160));
    const ang = Math.random()*Math.PI*2;
    S.tx += Math.cos(ang)*kick;
    S.ty += Math.sin(ang)*kick;
  });

  // ── helpers для гладкого шумового движения ──
  const SEED_X = 11.37, SEED_Y = 29.51;
  const fract = x => x - Math.floor(x);
  const hash  = n => fract(Math.sin(n*12.9898 + 78.233) * 43758.5453);
  const vnoise = (tt, seed) => { const i=Math.floor(tt), f=tt-i; const a=hash(i+seed), b=hash(i+1+seed); const u=f*f*(3-2*f); return (a*(1-u)+b*u)*2-1; };

  // ── Главный кадр ────────────────────────────────────────────────────
  (function frame(){
    const tNow = performance.now();
    const dtSec = Math.min(0.060, (tNow - (S.__ts || tNow))/1000); S.__ts = tNow;

    const cfg     = window.BeatDriverConfig || {};
    const bpm     = window.OsuBeat?.bpm?.();
    const conf    = +(window.OsuBeat?.confidence?.() ?? 0);
    const audioOn = (typeof __audioOn === 'function')
      ? __audioOn()
      : ((window.__OSU__?.rms || 0) > (cfg.TH_RMS || 1e-6));
    const moving  = !!cfg.MOTION_ENABLED && (audioOn || (!!bpm && conf >= (cfg.MIN_CONF ?? 0.35)));

    // масштабы из драйвера (и одновременно тайминг распадов)
    const scales = window.BeatDriver?.scales?.(dtSec*1000) || {outer:1,inner:1,active:false};

    // ── яркость/свечение (яркость >2 усиливает glow) ──
    const baseBright = moving ? (1 + (Math.max(scales.outer,scales.inner)-1)*0.9) : 1;
    const brightRaw  = baseBright * (cfg.BRIGHTNESS_BASE || 1);
    const bright     = Math.min(brightRaw, 8);
    const rmsUi      = clamp((window.__OSU__?.rms||0)*3.0,0,1);
    const alpha      = moving ? (0.05 + (0.18-0.05)*rmsUi) : 0.05;
    const offsetVW   = (cfg.OFFSET_X_VW || 1);

    root.style.filter    = `brightness(${bright.toFixed(3)})`;
    root.style.opacity   = alpha.toFixed(3);
    root.style.transform = `translateX(${offsetVW}vw)`;

    const over      = Math.max(0, bright - 2);
    const glowAlpha = Math.min(0.65, 0.18 + over * 0.12);
    const glowBlur  = Math.min(90,   14  + over * 24);
    glow.style.opacity = glowAlpha.toFixed(3);
    glow.style.filter  = `blur(${glowBlur.toFixed(1)}px)`;

    // ── сверхплавное движение (value-noise цель + пере-демпфированная пружина) ──
    const R     = (cfg.MOTION_STRENGTH || 100);                // радиус области, px
    const speed = Math.max(0.05, Math.min(1, cfg.MOTION_SPEED ?? 0.30));

    if (!moving){
      S.vx*=0.80; S.vy*=0.80;
      S.tx*=0.85; S.ty*=0.85;
      S.breath += (-S.breath) * (1 - Math.exp(-dtSec/0.45));
    } else {
      // 1) цель из гладкого шума
      const t  = tNow*0.001;
      const F  = 0.05 * (0.35 + speed);   // ~0.017..0.085 Гц
      const aimX = vnoise(t*F,        SEED_X) * R * 0.90;
      const aimY = vnoise(t*F*1.123,  SEED_Y) * R * 0.90;

      // сглаживаем цель (LPF ~0.7s)
      const aimL = 1 - Math.exp(-dtSec / 0.70);
      S.tx += (aimX - S.tx) * aimL;
      S.ty += (aimY - S.ty) * aimL;

      // граница круга
      const rT = Math.hypot(S.tx, S.ty);
      if (rT > R){ const s = R / rT; S.tx *= s; S.ty *= s; }

      // 2) пере-демпфированная пружина (ζ=1.15)
      const wn   = 3.2 * (0.35 + speed);
      const zeta = 1.15;
      const k    = wn*wn;
      const c    = 2*zeta*wn;

      let ax = k*(S.tx - S.dx) - c*S.vx;
      let ay = k*(S.ty - S.dy) - c*S.vy;

      // сглаживаем скорость (LPF ~0.25s)
      const vL = 1 - Math.exp(-dtSec / 0.25);
      S.vx += ax * dtSec; S.vy += ay * dtSec;
      S.vx = S.vxLP + (S.vx - S.vxLP) * vL; S.vxLP = S.vx;
      S.vy = S.vyLP + (S.vy - S.vyLP) * vL; S.vyLP = S.vy;

      S.dx += S.vx * dtSec;
      S.dy += S.vy * dtSec;

      // итоговая позиция тоже в круге
      const rO = Math.hypot(S.dx, S.dy);
      if (rO > R){ const s = R / rO; S.dx *= s; S.dy *= s; }

      // 3) «дыхание» по BPM (медленно и плавно)
      if (bpm){
        const omega = (Math.PI*2) * (bpm/60) * (0.22 + 0.4*speed);
        const aimB  = Math.sin(t*omega) * R * 0.22;
        const bL    = 1 - Math.exp(-dtSec / 0.50);
        S.breath += (aimB - S.breath) * bL;
      }
    }

    // ── применяем трансформы ──
    outer && (outer.style.transform = `scale(${(scales.outer||1).toFixed(4)})`);
    if (inner){
      const dx = S.dx;
      const dy = S.dy + (S.breath||0);
      inner.style.transform = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(${(scales.inner||1).toFixed(4)})`;
    }

    // ── апдейт колец ──
    if (rings.length){
      const tt = now(); const toRemove=[];
      for (let i=0;i<rings.length;i++){
        const r=rings[i];
        const p = clamp((tt - r.t0) / r.dur, 0, 1);
        const k = easeOutCubic(p);
        r.el.style.transform = `scale(${(r.start.s + (r.end.s - r.start.s)*k).toFixed(4)})`;
        r.el.style.opacity   = (r.start.a + (r.end.a - r.start.a)*k).toFixed(3);
        if (p>=1) toRemove.push(i);
      }
      for (let i=toRemove.length-1;i>=0;i--){ const r=rings.splice(toRemove[i],1)[0]; r?.el?.remove(); }
    }

    requestAnimationFrame(frame);
  })();
})();

/* ────────────────────────────────── BRIDGE (Colorize 2) ────────────────────────────────── */
(() => {
  /*──────────────────────── helpers ────────────────────────*/
  const LOG = (...a) => console.log('[Colorize 2]', ...a);

  const rgb2hsl = (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d   = max - min;
    let h = 0, s = 0, l = (max + min) / 2;
    if (d) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2;               break;
        case b: h = (r - g) / d + 4;               break;
      }
      h /= 6;
    }
    return { h: Math.round(h * 360), s: +(s * 100).toFixed(1), l: +(l * 100).toFixed(1) };
  };
  const H  = o      => `hsl(${o.h},${o.s}%,${o.l}%)`;
  const HA = (o, a) => `hsla(${o.h},${o.s}%,${o.l}%,${a})`;

  const parseHEX = hex => {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const n = parseInt(hex, 16);
    if (Number.isNaN(n)) return { h: 0, s: 0, l: 50 };
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return rgb2hsl(r, g, b);
  };

  /*──────────────────────── settings ────────────────────────*/
  const HANDLE   = 'PulseColor';

  const getSettings = async () => {
    try {
      const r = await fetch(`http://localhost:2007/get_handle?name=${HANDLE}`);
      const j = await r.json();
      const s = {};
      j?.data?.sections?.forEach(sec => {
        s[sec.title] = {};
        sec.items.forEach(it => {
          if ('bool'  in it) s[sec.title][it.id] = it.bool;
          if ('input' in it) s[sec.title][it.id] = it.input;
        });
      });
      return s;
    } catch (e) {
      LOG('settings error', e);
      return {};
    }
  };

  /*──────────────────────── cover helpers ───────────────────*/
  const coverURL = () => {
    const imgMini = document.querySelector('div[data-test-id="PLAYERBAR_DESKTOP_COVER_CONTAINER"] img');
    if (imgMini?.src) return imgMini.src;
    const imgFull = document.querySelector('[data-test-id="FULLSCREEN_PLAYER_MODAL"] img[data-test-id="ENTITY_COVER_IMAGE"]');
    if (imgFull?.src) return imgFull.src;
    const any = document.querySelector('img[data-test-id="ENTITY_COVER_IMAGE"]');
    return any?.src || null;
  };

  const CANVAS = document.createElement('canvas');
  CANVAS.width = CANVAS.height = 64;
  const CTX    = CANVAS.getContext('2d');
  const CACHE  = new Map();

  const normL = o => ({ ...o, l: Math.min(85, Math.max(20, o.l)) });

  const colorsFromCover = (src) => {
    if (CACHE.has(src)) return Promise.resolve(CACHE.get(src));
    return new Promise((res) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const w = img.width, h = img.height, scale = 64 / Math.max(w, h);
          CTX.clearRect(0, 0, 64, 64);
          CTX.drawImage(img, 0, 0, w * scale, h * scale);
          const d = CTX.getImageData(0, 0, 64, 64).data;

          const hueMap = new Map(); let count = 0;
          for (let y=0;y<64;y++){
            for (let x=0;x<64;x++){
              const idx=(y*64+x)*4; const r=d[idx], g=d[idx+1], b=d[idx+2];
              if (r+g+b<30 || r+g+b>740) continue;
              const hsl = rgb2hsl(r,g,b); if (hsl.s<20) continue;
              const hueKey = Math.round(hsl.h/10)*10;
              const cur = hueMap.get(hueKey) || {count:0,s:0,l:0};
              cur.count++; cur.s+=hsl.s; cur.l+=hsl.l; hueMap.set(hueKey,cur);
              count++;
            }
          }
          if (!count){ res(null); return; }
          let max=-1, dom=null;
          for (const [hue,data] of hueMap.entries()){
            if (data.count>max){ max=data.count; dom={h:hue,s:+(data.s/data.count).toFixed(1),l:+(data.l/data.count).toFixed(1)}; }
          }
          const resultColor = normL(dom); const result=[resultColor,resultColor];
          CACHE.set(src,result); res(result);
        } catch(e){ res(null); }
      };
      img.onerror = () => res(null);
      img.src = src;
    });
  };

  const fallbackHSL = () => {
    const root = document.querySelector('[class*="PlayerBarDesktop_root"]');
    if (!root) return [{ h: 0, s: 0, l: 50 }, { h: 0, s: 0, l: 50 }];
    const v = getComputedStyle(root).getPropertyValue('--player-average-color-background');
    const m = v.match(/hsl\((\d+),\s*([\d.]+)%,\s*([\d.]+)%\)/);
    const hsl = m ? { h:+m[1], s:+m[2], l:+m[3] } : { h:0, s:0, l:50 };
    return [hsl, hsl];
  };

  /*──────────────────────── palette & vars ────────────────*/
  const buildVars = base => {
    const vars = {};
    for (let i = 1; i <= 10; i++) {
      const lHi = base.l + (80 - base.l) * i / 10;
      const lLo = base.l - base.l * i / 10;
      vars[`--color-light-${i}`] = H({ ...base, l: lHi });
      vars[`--color-dark-${i}`]  = H({ ...base, l: lLo });
      for (let a = 1; a <= 10; a++) {
        vars[`--color-light-${i}-${a}`] = HA({ ...base, l: lHi }, a / 10);
        vars[`--color-dark-${i}-${a}`]  = HA({ ...base, l: lLo }, a / 10);
      }
    }
    vars['--grad-main'] =
      `linear-gradient(120deg,
        hsl(${base.h},${base.s}%,${Math.max(0, base.l - 25)}%) 0%,
        hsl(${base.h},${base.s}%,${Math.min(100, base.l + 25)}%) 100%)`;
    return vars;
  };

  /*──────────────────────── YM_MAP + кастом-CSS ───────────*/
  const YM_MAP = `
    --ym-background-color-primary-enabled-basic: var(--color-dark-8);
    --ym-surface-color-primary-enabled-list:     var(--color-light-1-4);
    --ym-background-color-primary-enabled-content: var(--color-dark-6);
    --ym-controls-color-primary-text-enabled_variant: var(--color-light-10-10);
    --ym-controls-color-primary-text-enabled:    var(--color-light-10-5);
    --ym-controls-color-primary-text-hovered:    var(--color-light-7);
    --ym-background-color-secondary-enabled-blur: var(--color-light-1);
    --ym-controls-color-secondary-outline-enabled_stroke: var(--color-light-10-10);
    --ym-controls-color-primary-text-disabled:   var(--ym-controls-color-secondary-outline-enabled_stroke);
    --ym-controls-color-secondary-outline-hovered_stroke: var(--color-light-5);
    --ym-controls-color-secondary-on_outline-enabled: var(--color-light-10-8);
    --ym-logo-color-primary-variant:            var(--color-light-10);
    --ym-controls-color-primary-outline-enabled: var(--color-dark-1-10);
    --ym-controls-color-secondary-outline-selected: var(--color-dark-3);
    --ym-controls-color-secondary-card-enabled: var(--color-dark-5-7);
    --ym-controls-color-secondary-card-hovered: var(--color-light-5-5);
    --ym-controls-color-primary-default-disabled: var(--color-light-4);
    --ym-controls-color-primary-default-enabled: var(--color-light-10);
    --ym-controls-color-primary-default-hovered: var(--color-light-8);
    --ym-controls-color-secondary-default-disabled: var(--color-dark-1);
    --ym-controls-color-secondary-default-enabled: var(--color-dark-5);
    --ym-controls-color-secondary-default-hovered: var(--color-dark-3);
    --ym-background-color-primary-enabled-popover: var(--color-dark-7-9);
    --ym-controls-color-secondary-text-enabled: var(--color-light-10-10);
    --ym-controls-color-secondary-on_default-hovered: var(--color-light-10-10);
    --ym-controls-color-secondary-on_default-enabled: var(--color-light-10-10);
    --id-default-color-dark-surface-elevated-0: var(--color-dark-6);

    .DefaultLayout_root__*, .CommonLayout_root__*{ background:transparent !important; }
    .ChangeVolume_root__HDxtA{ max-width:160px; }
    .DefaultLayout_content__md70Z .MainPage_root__STXqc::-webkit-scrollbar{ width:0; }
    .MainPage_landing___FGNm{ padding-right:24px; }
    .SyncLyrics_content__lbkWP:after, .SyncLyrics_content__lbkWP:before{ display:none; }
    .FullscreenPlayerDesktopContent_syncLyrics__6dTfH{ margin-block-end:0; height:calc(100vh); }
    .NavbarDesktop_logoLink__KR0Dk{ margin-top:15px; }
    .CollectionPage_collectionColor__M5l1f,.ygfy3HHHNs5lMz5mm4ON,.yvGpKZBZLwidMfMcVMR3{ color:var(--ym-logo-color-primary-variant); }
    .kc5CjvU5hT9KEj0iTt3C{ backdrop-filter:none; }
    .kc5CjvU5hT9KEj0iTt3C:hover,.kc5CjvU5hT9KEj0iTt3C:focus{ backdrop-filter:saturate(180%) blur(15px); }
    ::placeholder{ color:var(--color-light-4-10) !important; }
    .PSBpanel{ color:var(--ym-logo-color-primary-variant) !important; font-weight:500 !important; left:0; right:0 !important; display:flex; justify-content:center; }
    .mdbxU6IWInQTsVjwnapn{ background:var(--color-light-5) !important; }
    .xZzTMqgg0qtV5vqUIrkK{ background-color:var(--color-dark-3-6) !important; }
    .FullscreenPlayerDesktop_poster_withSyncLyricsAnimation__bPO0o.FullscreenPlayerDesktop_important__dGfiL,
    .SyncLyricsCard_root__92qn_{ inset-block-end:35px !important; }
        .DefaultLayout_root__*, .CommonLayout_root__*{
      background:transparent !important;
    }
          .ChangeVolume_root__HDxtA{ max-width:160px; }
    .DefaultLayout_content__md70Z .MainPage_root__STXqc::-webkit-scrollbar{ width:0; }
    .MainPage_landing___FGNm{ padding-right:24px; }
    .SyncLyrics_content__lbkWP:after, .SyncLyrics_content__lbkWP:before{ display:none; }
    .FullscreenPlayerDesktopContent_syncLyrics__6dTfH{
      margin-block-end:0; height:calc(100vh);
    }
    .NavbarDesktop_logoLink__KR0Dk{ margin-top:15px; }
    canvas{ opacity:.2 !important; filter:blur(360px) !important; }
    .VibeBlock_vibeAnimation__XVEE6:after{ background:transparent !important; }
    .CollectionPage_collectionColor__M5l1f,
    .ygfy3HHHNs5lMz5mm4ON,
    .yvGpKZBZLwidMfMcVMR3{ color:var(--ym-logo-color-primary-variant); }
    .kc5CjvU5hT9KEj0iTt3C{ backdrop-filter:none; }
    .kc5CjvU5hT9KEj0iTt3C:hover,
    .kc5CjvU5hT9KEj0iTt3C:focus{ backdrop-filter:saturate(180%) blur(15px); }
    ::placeholder{ color:var(--color-light-4-10) !important; }
    .PSBpanel{
      color:var(--ym-logo-color-primary-variant) !important;
      font-weight:500 !important;
      left:0; right:0 !important;
      display:flex; justify-content:center;
    }
    .mdbxU6IWInQTsVjwnapn{ background:var(--color-light-5) !important; }
    .xZzTMqgg0qtV5vqUIrkK{ background-color:var(--color-dark-3-6) !important; }
    .FullscreenPlayerDesktop_poster_withSyncLyricsAnimation__bPO0o.FullscreenPlayerDesktop_important__dGfiL,
    .SyncLyricsCard_root__92qn_{ inset-block-end:35px !important; }
  
.CommonLayout_root__WC_W1
{
  background:radial-gradient(circle at 70% 70%,
    var(--ym-background-color-secondary-enabled-blur)      0%,
    var(--ym-background-color-primary-enabled-content)    70%,
    var(--ym-background-color-primary-enabled-basic)     100%) !important;
}
.Navbar_root__chfAR,
.EntitySidebar_root__D1fGh,
.Divider_root__99zZ{
  background:radial-gradient(circle at 70% 70%,
    var(--ym-background-color-secondary-enabled-blur)      0%,
    var(--ym-background-color-primary-enabled-content)    70%,
    var(--ym-background-color-primary-enabled-basic)     100%) !important;
}
   .MsLY_qiKofQrwKAr98EC:after,
   .PlayQueue_root__ponhw:after,
   .PlayQueue_root__ponhw:before,
   .PinsList_root_hasPins__3LXlo:after,
   .PinsList_root_hasPins__3LXlo:before,
   .NavbarDesktop_scrollableContainer__HLc9D:before,
   .NavbarDesktop_scrollableContainer__HLc9D:after,
   .SearchPage_skeletonStickyHeader__SQqeV.SearchPage_important__z3aCa{
  background:
    linear-gradient(
      ◯turn  /* браузер-фикс от YM */
      var(--fade-background-color,
           var(--ym-background-color-secondary-enabled-blur)) 0,
      hsla(0 0% 5% / .90) 100%);
}
      .VibeContext_context__Z_82k, 
      .VibeSettings_toggleSettingsButton__j6fIU,
      .VibeContext_pinButton__b6SNF{
          backdrop-filter: blur(25px);
          background-color: rgba(0, 0, 0, 0.15); 
      }

      .Root{
      background: var(--ym-background-color-primary-enabled-content) !important
      }
  `;

  const applyVars = vars => {
    let st = document.getElementById('colorize-style');
    if (!st) { st = document.createElement('style'); st.id = 'colorize-style'; document.head.appendChild(st); }
    let css = '.ym-dark-theme{\n';
    Object.entries(vars).forEach(([k, v]) => css += `  ${k}: ${v} !important;\n`);
    css += YM_MAP + '\n}';
    st.textContent = css;
  };

  function ensureGradientOverlay(){
    if (document.getElementById('sc-grad-overlay')) return;
    const css = `
      body.sc-has-grad::before{
        content:''; position:fixed; inset:0; background:var(--grad-main);
        z-index:-1; pointer-events:none;
      }`;
    const st = document.createElement('style');
    st.id  = 'sc-grad-overlay';
    st.textContent = css;
    document.head.appendChild(st);
    document.body.classList.add('sc-has-grad');
  }

  const cover = document.querySelector('[class*="FullscreenPlayerDesktopPoster_cover"]');
  if (cover) { cover.style.width = '600px'; cover.style.height = '600px'; cover.style.transition = 'all 0.3s ease'; }

  /*──────────────────────── эффекты / фон ─────────────────────*/
  let SETTINGS = {};
  let lastSETTINGS_JSON = '';
  let lastSrc = '', lastHex = '';
  let lastFullVibe = null;
  let lastAvatarZoom = null;
  let lastBackgroundURL = '';
  let lastPageURL = location.href;
  let lastBackgroundImage = null;

  async function getHiResCover() {
    const img = document.querySelector('[class*="PlayerBarDesktopWithBackgroundProgressBar_cover"] img');
    if (img && img.src.includes('/100x100')) return img.src.replace('/100x100','/1000x1000');
    return img?.src || null;
  }

  function backgroundReplace(imageURL) {
    const target = document.querySelector('[class*="MainPage_vibe"]');
    if (!target || !imageURL || imageURL === lastBackgroundURL) return;

    const img = new Image(); img.crossOrigin = 'anonymous'; img.src = imageURL;
    img.onload = () => {
      lastBackgroundURL = imageURL;

      const wrapper = document.createElement('div');
      wrapper.className = 'bg-layer';
      wrapper.style.cssText = `position:absolute; inset:0; z-index:0; pointer-events:none;`;

      const imageLayer = document.createElement('div');
      imageLayer.className = 'bg-cover';
      imageLayer.style.cssText = `
        position:absolute; inset:0;
        background-image:url("${imageURL}");
        background-size:cover; background-position:center; background-repeat:no-repeat;
        opacity:0; transition:opacity 1s ease; pointer-events:none;`;

      const gradient = document.createElement('div');
      gradient.className = 'bg-gradient';
      gradient.style.cssText = `
        position:absolute; inset:0;
        background: radial-gradient(circle at 70% 70%,
          var(--ym-background-color-secondary-enabled-blur, rgba(0,0,0,0)) 0%,
          var(--ym-background-color-primary-enabled-content, rgba(0,0,0,0.2)) 70%,
          var(--ym-background-color-primary-enabled-basic, rgba(0,0,0,0.3)) 100%);
        opacity:0.6; pointer-events:none; z-index:1;`;

      [...target.querySelectorAll('.bg-layer')].forEach(layer => {
        layer.style.opacity = '0'; layer.style.transition = 'opacity .6s ease';
        setTimeout(()=>layer.remove(),700);
      });

      wrapper.appendChild(imageLayer);
      wrapper.appendChild(gradient);
      target.appendChild(wrapper);
      requestAnimationFrame(()=>{ imageLayer.offsetHeight; imageLayer.style.opacity='1'; });
    };
  }

  function removeBackgroundImage() {
    document.querySelectorAll('.bg-layer').forEach(layer=>{
      layer.style.opacity='0'; layer.style.transition='opacity .6s ease'; setTimeout(()=>layer.remove(),700);
    });
    lastBackgroundURL = null;
  }

  function handleAvatarMouseMove(event) {
    const rect = this.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 9;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 9;
    const translateX = Math.max(-45, Math.min(45, -x * 11));
    const translateY = Math.max(-45, Math.min(45, -y * 11));
    this.style.transform = `scale(1.8) translate(${translateX}px, ${translateY}px)`;
  }
  function handleAvatarMouseLeave(){ this.style.transform = 'scale(1)'; }
  function setupAvatarZoomEffect(){
    const avatar = document.querySelector('[class*="PageHeaderCover_coverImage"]');
    if (!avatar || avatar.classList.contains('avatar-zoom-initialized')) return;
    avatar.classList.add('avatar-zoom-initialized');
    avatar.addEventListener('mousemove', handleAvatarMouseMove);
    avatar.addEventListener('mouseleave', handleAvatarMouseLeave);
  }
  function removeAvatarZoomEffect(){
    const avatar = document.querySelector('[class*="PageHeaderCover_coverImage"]');
    if (avatar && avatar.classList.contains('avatar-zoom-initialized')) {
      avatar.removeEventListener('mousemove', handleAvatarMouseMove);
      avatar.removeEventListener('mouseleave', handleAvatarMouseLeave);
      avatar.classList.remove('avatar-zoom-initialized');
    }
  }
  function FullVibe(){ const v=document.querySelector('[class*="MainPage_vibe"]'); if (v) v.style.setProperty("height","88.35vh","important"); }
  function RemoveFullVibe(){ const v=document.querySelector('[class*="MainPage_vibe"]'); if (v) v.style.setProperty("height","0","important"); }

  /*──────────────────────── Setting HandleEvents ─────────────────────*/
  const recolor = async (force = false) => {
    const src = coverURL();
    const useHex = SETTINGS['Тема']?.useCustomColor;
    const hex = SETTINGS['Тема']?.baseColor || '';

    let base, gradC1, gradC2;

    if (useHex) {
      if (!force && hex === lastHex) return;
      gradC1 = gradC2 = base = normL(parseHEX(hex));
      lastHex = hex;
    } else {
      if (!force && src === lastSrc) return;
      const pair = await colorsFromCover(src) || fallbackHSL();
      if (!pair) return;
      [gradC1, gradC2] = pair;
      base = {
        h: Math.round((gradC1.h + gradC2.h) / 2),
        s: +((gradC1.s + gradC2.s) / 2).toFixed(1),
        l: +((gradC1.l + gradC2.l) / 2).toFixed(1)
      };
      lastSrc = src;
    }

    const customWaveNow = !!SETTINGS?.['Эффекты']?.enableCustomWaveBeta;
    if (customWaveNow !== (window.__LAST_CUSTOM_WAVE||null) || force) {
      window.__LAST_CUSTOM_WAVE = customWaveNow;
      const pulse = document.getElementById('osu-pulse');
      if (pulse) {
        pulse.style.display = customWaveNow ? '' : 'none';
      }
    }

    applyVars(buildVars(base));
    ensureGradientOverlay();

    // моментально «перенастроить» детектор под новый трек
    window.OsuBeat?.retune?.({ presetBpm: window.OsuBeat?.bpm?.() || 120 });

    const image = await getHiResCover();

    const backgroundImageNow = !!SETTINGS?.['Эффекты']?.enableBackgroundImage;
    if (backgroundImageNow !== (window.__LAST_BG_ENABLED||null) || force) {
      window.__LAST_BG_ENABLED = backgroundImageNow;
      if (backgroundImageNow) backgroundReplace(image);
      else removeBackgroundImage();
    }

    const avatarZoomNow = !!SETTINGS?.['Эффекты']?.enableAvatarZoom;
    if (avatarZoomNow !== (window.__LAST_AVATAR_ZOOM||null) || force) {
      window.__LAST_AVATAR_ZOOM = avatarZoomNow;
      if (avatarZoomNow) setupAvatarZoomEffect(); else removeAvatarZoomEffect();
    }

    const fullVibeNow = !!SETTINGS?.['Эффекты']?.FullVibe;
    if (fullVibeNow !== (window.__LAST_FULLVIBE||null) || force) {
      window.__LAST_FULLVIBE = fullVibeNow;
      if (fullVibeNow) FullVibe(); else RemoveFullVibe();
    }
  };

  const init = async () => {
    SETTINGS = await getSettings();
    lastSETTINGS_JSON = JSON.stringify(SETTINGS);
    checkVibeReturn();
    await recolor(true);
  };

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();

  new MutationObserver(() => recolor()).observe(document.body, { childList:true, subtree:true });

  setInterval(async () => {
    const newSettings = await getSettings();
    const newJSON = JSON.stringify(newSettings);
    if (newJSON !== lastSETTINGS_JSON) {
      SETTINGS = newSettings; lastSETTINGS_JSON = newJSON; await recolor(true);
    }
  }, 500);

  function checkVibeReturn() {
    let lastCover = '';
    return setInterval(async () => {
      const vibe = document.querySelector('[class*="MainPage_vibe"]');
      if (!vibe) return;
      const src = coverURL();
      const hasBackground = vibe.style.backgroundImage?.includes('url(');
if (!hasBackground || src !== lastCover) {
  lastCover = src;

  // ретюн при смене обложки
  window.OsuBeat?.retune?.({ presetBpm: window.OsuBeat?.bpm?.() || 120 });

  await recolor(true);
}

    }, 1200);
  }

  const monitorPageChangeAndSetBackground = () => {
    const checkPage = () => {
      const currentURL = location.href;
      if (currentURL !== lastPageURL) {
        lastPageURL = currentURL;
        tryInjectBackground();
      }
    };
    setInterval(checkPage, 300);
  };

  async function tryInjectBackground() {
    const image = await getHiResCover();
    if (!image) return;
    lastBackgroundURL = '';
    backgroundReplace(image);
  }

  monitorPageChangeAndSetBackground();
})();

