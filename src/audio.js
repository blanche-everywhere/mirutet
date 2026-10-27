/* Original, sample-free Web Audio cues. No context or nodes until unlock(). */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MiruTetAudio = api;
})(globalThis, function () {
  'use strict';
  // Original miniature mallet instruments: [partial ratio, level, decay scale].
  // Faint upper partials give a sugar-glass/celesta colour without a buzzy
  // waveform, pitch slide or noise transient. Feedback uses the decay scales;
  // piece figures sustain these soft partials until the next pitch step.
  const GLASS = [[1, 1, 1], [2.76, .18, .48], [4.07, .055, .28]];
  const CELESTA = [[1, 1, 1], [2, .25, .55], [3, .07, .30]];
  const WOOD = [[1, 1, 1], [3, .14, .42], [5, .025, .24]];
  function mallet(hz, offset, duration, level, partials) {
    // Keep the public voice tuple: waveform, Hz, offset, duration, attack,
    // relative level, optional end Hz. All new voices keep a fixed pitch.
    return partials.map(([ratio, weight, decay], i) =>
      ['sine', hz * ratio, offset, duration * decay, i ? .001 : .0015, level * weight]);
  }
  const freezeBank = bank => Object.freeze(Object.fromEntries(Object.entries(bank)
    .map(([type, voices]) => [type, Object.freeze(voices.map(Object.freeze))])));
  const FRAME = 1 / 60;
  function figure(notes, partials, passes = 4, level = .72) {
    const frames = notes.reduce((sum, [, length]) => sum + length, 0);
    // Equalise the additive instruments' energy, keeping headroom for feedback
    // and the previous cue's cancellation fade. Echoes are finite, not feedback.
    const balance = level / Math.sqrt(partials.reduce((sum, [, weight]) => sum + weight * weight, 0));
    return Array.from({ length: passes }, (_, pass) => {
      let frame = pass * frames;
      return notes.flatMap(([hz, length]) => {
        const offset = frame * FRAME;
        frame += length;
        return partials.map(([ratio, weight]) =>
          ['sine', hz * ratio, offset, length * FRAME, .0005, balance * weight * .1 ** pass]);
      });
    }).flat();
  }
  // Newly composed figures: independent registers, contours and rhythms.
  // One pass is 12–13 frames; each echo is 20 dB below the preceding pass.
  // Public voice tuples and cue selection stay the same as for feedback.
  const CUES = freezeBank({
    I: figure([[1318.51, 2], [1661.22, 1], [1975.53, 2], [1661.22, 1],
               [1760, 2], [1479.98, 1], [1661.22, 2], [1975.53, 2]], GLASS),
    O: figure([[246.94, 4], [293.66, 4], [261.63, 4]], CELESTA, 3),
    T: figure([[659.25, 2], [880, 1], [1046.5, 2], [783.99, 1],
               [1046.5, 2], [880, 1], [698.46, 1], [659.25, 2]], CELESTA),
    S: figure([[783.99, 3], [987.77, 3], [880, 3], [1174.66, 3]], GLASS),
    Z: figure([[932.33, 3], [698.46, 3], [554.37, 3], [415.30, 3]], CELESTA),
    J: figure([[392, 4], [329.63, 4], [440, 4]], WOOD),
    L: figure([[440, 4], [554.37, 4], [659.25, 4]], WOOD)
  });
  // Feedback shares the same dry, sweet palette, with quieter strikes so it
  // supports rather than masks the piece announcement on the independent bus.
  const FEEDBACK = freezeBank({
    perfect: [...mallet(1046.5, 0, .050, .55, CELESTA),
              ...mallet(1318.51, .032, .060, .55, GLASS)],
    fault: [...mallet(493.88, 0, .048, .55, WOOD),
            ...mallet(392, .030, .058, .55, WOOD)],
    other: mallet(659.25, 0, .065, .65, WOOD)
  });

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
        const { oscillator, gain, start } = voice;
        try {
          if (start >= t) {
            // Future notes/echoes have never sounded. Silence and detach them
            // now: holding a GainNode's default value could otherwise let a
            // note starting inside the fade window leak through at full gain.
            gain.gain.cancelScheduledValues(t);
            gain.gain.setValueAtTime(0, t);
            oscillator.stop(t);
            oscillator.disconnect(); gain.disconnect(); activeVoices.delete(voice);
            continue;
          }
          if (gain.gain.cancelAndHoldAtTime) gain.gain.cancelAndHoldAtTime(t);
          else {
            const held = gain.gain.value;
            gain.gain.cancelScheduledValues(t);
            gain.gain.setValueAtTime(held, t);
          }
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
      const options = getOptions();
      if (!options.sound || options.volume === 0) return;
      if (context?.state === 'running') return;
      try {
        if (!context) {
          const Audio = getAudioClass();
          if (!Audio) return;
          context = new Audio({ latencyHint: 'interactive' });
          master = context.createGain(); pieceBus = context.createGain();
          // No voices exist yet. Start at the requested levels so bus smoothing
          // cannot soften the first audition's sub-millisecond attack.
          master.gain.value = options.volume; pieceBus.gain.value = options.pieceCueVolume / 100;
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
          if (endFrequency !== frequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, end);
          gain.gain.setValueAtTime(0, start);
          gain.gain.linearRampToValueAtTime(.13 * level, start + attack);
          if (piece) gain.gain.setValueAtTime(.13 * level, end - .0005);
          else gain.gain.exponentialRampToValueAtTime(.0001, end - .005);
          gain.gain.linearRampToValueAtTime(0, end);
          oscillator.connect(gain); gain.connect(piece ? pieceBus : master);
          const voice = { oscillator, gain, start };
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
        play(FEEDBACK[kind === 'perfect' ? 'perfect' : kind === 'fault' ? 'fault' : 'other']);
      }
    };
  }
  return Object.freeze({ CUES, selectCue, createAudioEngine });
});
