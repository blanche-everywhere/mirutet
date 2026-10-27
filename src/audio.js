/* Original, sample-free Web Audio cues. No context or nodes until unlock(). */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MiruTetAudio = api;
})(globalThis, function () {
  'use strict';
  // Each voice: waveform, Hz, offset, duration, attack, relative level, end Hz.
  // Soft attacks and zero-ended releases keep these small motifs comfortable
  // at piece cadence. Pitch ranges, contours and overtone balance differ.
  const CUES = Object.freeze(Object.fromEntries(Object.entries({
    I: [['sine', 880, 0, .110, .008, 1, 1174.66]],
    O: [['sine', 523.25, 0, .145, .006, .85], ['sine', 1046.5, 0, .070, .005, .25]],
    T: [['triangle', 659.25, 0, .120, .016, .85], ['sine', 1318.5, 0, .045, .008, .16]],
    S: [['triangle', 587.33, 0, .075, .007, .8], ['triangle', 783.99, .050, .075, .007, .8]],
    Z: [['sine', 739.99, 0, .075, .007, .9], ['sine', 554.37, .050, .075, .007, .9]],
    J: [['triangle', 349.23, 0, .135, .005, 1, 329.63], ['sine', 698.46, 0, .055, .005, .18]],
    L: [['triangle', 440, 0, .100, .012, .85], ['sine', 660, .055, .095, .012, .65]]
  }).map(([type, voices]) => [type, Object.freeze(voices.map(Object.freeze))])));

  function selectCue(event, timing = 'next') {
    if (event?.kind !== 'spawn' || !event.queueDrawn) return null;
    const type = timing === 'next' ? event.nextType : timing === 'current' ? event.type : null;
    return Object.hasOwn(CUES, type) ? type : null;
  }

  function createAudioEngine(getOptions, getAudioClass = () => globalThis.AudioContext || globalThis.webkitAudioContext) {
    let context, master, pieceBus, resuming = false, cueVoices = [], feedbackVoices = [];
    const activeVoices = new Set();
    function configure() {
      if (!context || !master || !pieceBus) return;
      try {
        const options = getOptions(), t = context.currentTime;
        master.gain.setTargetAtTime(options.sound ? options.volume : 0, t, .004);
        pieceBus.gain.setTargetAtTime(options.pieceCueVolume / 100, t, .004);
      } catch (_) { /* Audio is optional. */ }
    }
    function stop(voices) {
      if (!context) return;
      const t = context.currentTime;
      for (const voice of voices) {
        const { oscillator, gain } = voice;
        try {
          if (gain.gain.cancelAndHoldAtTime) gain.gain.cancelAndHoldAtTime(t);
          else gain.gain.cancelScheduledValues(t);
          gain.gain.setTargetAtTime(0, t, .002);
          oscillator.stop(t + .012);
          if (context.state !== 'running') {
            // Suspended clocks cannot fire onended yet. Detach cancelled nodes
            // immediately so future resumes cannot reveal stale sound.
            oscillator.disconnect(); gain.disconnect(); activeVoices.delete(voice);
          }
        } catch (_) { /* A context can close while voices are ending. */ }
      }
    }
    function stopCues() { stop(cueVoices); cueVoices = []; }
    function unlock() {
      if (!getOptions().sound || getOptions().volume === 0) return;
      if (context?.state === 'running') return;
      try {
        if (!context) {
          const Audio = getAudioClass();
          if (!Audio) return;
          context = new Audio({ latencyHint: 'interactive' });
          master = context.createGain(); pieceBus = context.createGain();
          master.gain.value = 0; pieceBus.gain.value = 0;
          pieceBus.connect(master); master.connect(context.destination);
        }
        configure();
        if (context.state === 'suspended' && !resuming) {
          resuming = true;
          context.resume().catch(() => {
            stop(activeVoices); cueVoices = []; feedbackVoices = [];
          }).finally(() => { resuming = false; });
        }
      } catch (_) { resuming = false; stop(activeVoices); }
    }
    function play(voices, piece = false) {
      const options = getOptions();
      if (!options.sound || options.volume === 0 || piece && options.pieceCueVolume === 0) return;
      // Scheduling while resume is pending preserves the very first preview.
      // No waiting or context creation in gameplay handlers. Failed/suspended
      // audio never accumulates a backlog for a later gesture to replay.
      if (!context || !master || !pieceBus ||
          context.state !== 'running' && !(context.state === 'suspended' && resuming)) return;
      try {
        configure();
        if (piece) stopCues();
        else { stop(feedbackVoices); feedbackVoices = []; }
        const t = context.currentTime;
        for (const [wave, frequency, offset, duration, attack, level, endFrequency = frequency] of voices) {
          const oscillator = context.createOscillator(), gain = context.createGain();
          const start = t + offset, end = start + duration;
          oscillator.type = wave;
          oscillator.frequency.setValueAtTime(frequency, start);
          oscillator.frequency.exponentialRampToValueAtTime(endFrequency, end);
          gain.gain.setValueAtTime(0, start);
          gain.gain.linearRampToValueAtTime(.13 * level, start + attack);
          gain.gain.exponentialRampToValueAtTime(.0001, end - .005);
          gain.gain.linearRampToValueAtTime(0, end);
          oscillator.connect(gain); gain.connect(piece ? pieceBus : master);
          const voice = { oscillator, gain };
          activeVoices.add(voice);
          if (piece) cueVoices.push(voice);
          else feedbackVoices.push(voice);
          oscillator.onended = () => {
            oscillator.disconnect(); gain.disconnect();
            activeVoices.delete(voice);
            cueVoices = cueVoices.filter(v => v !== voice);
            feedbackVoices = feedbackVoices.filter(v => v !== voice);
          };
          oscillator.start(start); oscillator.stop(end);
        }
      } catch (_) { /* Unsupported/restricted audio must never interrupt input. */ }
    }
    return {
      unlock, configure, stopCues,
      piece(type) { if (Object.hasOwn(CUES, type)) play(CUES[type], true); },
      sound(kind) {
        const frequencies = kind === 'perfect' ? [660, 880, 1100] : kind === 'fault' ? [330, 260] : [440];
        play(frequencies.map((frequency, i) => ['sine', frequency, i * .065, .15, .008, 1]));
      }
    };
  }
  return Object.freeze({ CUES, selectCue, createAudioEngine });
});
