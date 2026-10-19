// Paste this entire file into the Yandex Music DevTools Console.
// Reads DOM status only: no privileged APIs, audio capture or settings changes.
(async () => {
  const ids = ['pulsecolor-audio-state-v2', 'pulsecolor-audio-client-state-v2'];
  const read = id => {
    const text = document.getElementById(id)?.getAttribute('content');
    if (!text) return null;
    if (text.length > 16384) return { error: 'oversized-status' };
    try { return JSON.parse(text); } catch { return { error: 'invalid-status' }; }
  };
  const readStatus = () => ({
    provider: read(ids[0]), client: read(ids[1]),
    theme: !!document.getElementById('pulsecolor-theme-settings-v1'),
    hidden: document.hidden,
  });
  console.log('PulseColor: collecting audio diagnostics for 12 seconds. Keep music playing and the wave visible.');
  const first = readStatus(), samples = [];
  for (let i = 0; i < 12; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    samples.push(readStatus());
  }
  const last = samples.at(-1), p = last.provider?.diagnostic, c = last.client;
  const delta = (a, b) => typeof a === 'number' && typeof b === 'number' ? b - a : null;
  const findings = [];
  if (!last.theme) findings.push('theme-marker-missing');
  if (!last.provider) findings.push('provider-marker-missing');
  if (!c) findings.push('visual-client-marker-missing');
  if (p?.build !== 'audio-diag-1' || c?.build !== 'audio-diag-1') findings.push('diagnostic-build-not-loaded');
  if (c?.consumers === 0) findings.push('visual-has-no-audio-consumers');
  if (c?.consumers > 0 && p?.subscribed === false) findings.push('provider-not-subscribed');
  const sent = delta(first.provider?.diagnostic?.sent, p?.sent);
  const received = delta(first.client?.received, c?.received);
  const reads = delta(first.provider?.diagnostic?.engine?.reads, p?.engine?.reads);
  if (sent > 0 && received === 0) findings.push('frames-not-reaching-visual');
  if (p?.subscribed && sent === 0) findings.push('subscribed-but-audio-loop-not-publishing');
  if (p?.engine?.hasAnalyser === false && p?.subscribed) findings.push('audio-reader-unavailable');
  if (p?.engine?.hasAnalyser && !(p.engine.sampleRate>0 && p.engine.bins>0)) findings.push('invalid-reader-format');
  const rmsPeak = Math.max(0, ...samples.map(s => s.provider?.diagnostic?.engine?.rawRms || 0));
  const spectrumPeak = Math.max(0, ...samples.map(s => s.provider?.diagnostic?.engine?.rawSpectrumPeak || 0));
  if (samples.every(s => s.provider?.diagnostic?.engine?.playing === false)) findings.push('playback-not-reported-playing');
  if (p?.engine?.hasAnalyser && p.engine.playing === true && reads > 0 && rmsPeak === 0 && spectrumPeak === 0) findings.push('reader-returns-silence');
  if (samples.every(s => s.hidden)) findings.push('document-hidden-during-test');
  const report = {
    protocol: 1, diagnosticBuild: 'audio-diag-1',
    platform: navigator.platform, top: window === window.top,
    chromium: navigator.userAgent.match(/(?:Chrome|Chromium)\/[\d.]+/)?.[0] || null,
    durationSeconds: 12, findings,
    counts: { sent, received, reads, rmsPeak, spectrumPeak }, first, samples,
  };
  console.log('PULSECOLOR_AUDIO_REPORT ' + JSON.stringify(report));
  return report;
})();
