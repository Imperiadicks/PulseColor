# PulseColor

PulseColor — это ребрендинг аддона [Colorize 2](https://github.com/Imperiadicks/Colorize-2).

# API

<a href="https://getsongbpm.com/">GetSongBPM</a> — используется для поиска BPM по названию трека и артисту.

<a href="https://api.deezer.com/">Deezer API</a> — используется для поиска трека, получения preview, ISRC и дополнительных данных о релизе.

<a href="https://reccobeats.com/docs/documentation/Analysis/audio-features-extraction">ReccoBeats</a> — используется для анализа preview-аудио и получения tempo/BPM.

<a href="https://music.yandex.ru/">Yandex Music</a> — используется только как источник metadata текущего трека внутри приложения. Аудио из Яндекс Музыки не отправляется во внешние API.

## Локальный Audio API

PulseColor публикует в renderer-контексте PulseSync объект `window.PulseColorAudioAPI` с версией контракта `1`. API доступен другим локальным аддонам в том же `window`; это не HTTP-сервис. Спектр и временная форма копируются только в массивы вызывающего аддона. `AudioContext`, `AnalyserNode` и внутренние буферы наружу не передаются.

Доступные методы:

- `getCapabilities()` — поддерживаемые данные и ограничения;
- `getSnapshot()` — последний нормализованный аудиокадр;
- `getFormat()` — `sampleRate`, `fftSize` и `frequencyBinCount`;
- `readFrequencyData(target)` — копирует спектр в переданный `Uint8Array`;
- `readTimeDomainData(target)` — копирует форму сигнала в переданный `Float32Array`;
- `subscribe(listener, { maxFps })` — подписывает на общий runtime-цикл и возвращает функцию отписки. `maxFps` ограничен диапазоном 1–60, значение по умолчанию — 30.

Снимок содержит нормализованные поля `rms`, `peak`, `bass`, `mids`, `treble`, `flux`, `transient`, `voice`, `energy`, `rise`, `motion`, `active` и timestamp `time`. Для режима BPM доступны:

- `selectedMode` — выбранный пользователем режим (`raw` или `bpm`);
- `effectiveMode` — режим, который фактически используется сейчас;
- `mode` — совместимый псевдоним `effectiveMode`;
- `bpm`, `phase` и `confidence`;
- `bpmStatus` — `raw`, `loading`, `bpm`, `error`, `timeout`, `fallback_raw` или `cancelled`;
- `bpmSource` — источник текущего результата или fallback.

Во время поиска BPM `selectedMode` остаётся `bpm`, а `effectiveMode` равен `raw`: воспроизведение не блокируется. Фаза рассчитывается относительно текущей позиции трека, поэтому корректно реагирует на паузу и перемотку, но не заявляет синхронизацию с реальным началом музыкального такта.

```js
function connectPulseColorAudio() {
  const api = window.PulseColorAudioAPI;
  if (!api || api.version !== 1) return () => {};

  const format = api.getFormat();
  const spectrum = new Uint8Array(format.frequencyBinCount);

  return api.subscribe((frame) => {
    api.readFrequencyData(spectrum);
    // frame.energy, frame.bass, frame.transient, frame.bpm, frame.phase
    // frame.selectedMode, frame.effectiveMode, frame.bpmStatus, frame.bpmSource
  }, { maxFps: 30 });
}

let unsubscribeAudio = () => {};
const onReady = () => {
  unsubscribeAudio();
  unsubscribeAudio = connectPulseColorAudio();
};

if (window.PulseColorAudioAPI) {
  onReady();
} else {
  window.addEventListener("pulsecolor:audio-api-ready", onReady, { once: true });
}

const disconnect = () => {
  window.removeEventListener("pulsecolor:audio-api-ready", onReady);
  unsubscribeAudio();
};
```

Событие `pulsecolor:audio-api-ready` отправляется после публикации API, `pulsecolor:audio-api-stopped` — при остановке runtime. Ошибка одного listener не останавливает другие подписки. Аудиокадры и массивы анализа остаются локальными и не отправляются по сети.

Аудиоанализ работает, пока активна визуализация PulseColor либо существует хотя бы один внешний подписчик. После последней отписки PulseColor отключает собственный анализатор и освобождает созданный `AudioContext`.

Для старых интеграций сохранён читающий фасад `window.PulseColorAudio.getState()`.

## Встроенные fullscreen-интеграции

PulseColor использует общий WebGL-runtime для трёх вариантов волны и Cover2Anim. Tweaked YM Design перенесён отдельно в исходной архитектуре аддона: две CSS-background обложки, предварительное canvas-размытие 96×96, crossfade, две drift-траектории, saturation, overlay/vignette, progressive blur синхронизированного текста и scoped-правки Vibe-интерфейса. Его DOM discovery и настройки подключены к общему координатору PulseColor, поэтому второй глобальный observer не создаётся.

Внешние Cover2Anim и Tweaked YM Design отмечены конфликтующими: PulseColor не изменяет их файлы и предоставляет собственную реализацию в общем runtime.

Cover2Anim 0.3.5 (автор karst3nz) адаптирован под единый WebGL-runtime и аудиоанализатор. Tweaked YM Design 1.0.0 (автор nelifs) перенесён целиком по поведению и подключён к lifecycle общего DOM-координатора темы.

## Ограничение API-ключей

PulseColor является клиентским внедряемым аддоном и не имеет доверенного серверного хранилища секретов. Поэтому ключ клиентского BPM-провайдера невозможно надёжно скрыть переносом в `localStorage` или другую renderer-конфигурацию. Runtime маскирует ключи и Authorization-данные в диагностических логах; их значения в документации и отчётах не публикуются.

---
## Большая благодарнасть проекту [PulseSync](https://pulsesync.dev/) за предоставление возможности создания тем 

### Источники вдохновлённые на эту тему и частично взятый код из них:

[Тема🎶ChromaSync🎨](https://discord.com/channels/1227552882744754267/1392417241810862080) автор: [Desai](https://github.com/Desai0)

[Pulsma](https://discord.com/channels/1227552882744754267/1391540329001390090) автор: [EvT](https://github.com/Maks1mio)
