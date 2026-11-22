import bankUrl from './sfx/combat.mp3';
import cues from './sfx/cues.json';

// A squad volley shares a recorded burst. Crowds increase the visual density
// while weapon cadence and the number of voices stay intelligible on a phone.
const mix = {
  rifle:     { gain: .48, interval: .14, priority: 1 },
  smg:       { gain: .47, interval: .19, priority: 1 },
  vulcan:    { gain: .50, interval: .27, priority: 1 },
  rocket:    { gain: .63, interval: .56, priority: 2 },
  hit:       { gain: .15, interval: .12, priority: 0 },
  blast:     { gain: .56, interval: .29, priority: 2 },
  casualty:  { gain: .40, interval: .27, priority: 2 },
  crateOpen: { gain: .76, interval: .12, priority: 3 },
  recruit:   { gain: .57, interval: .12, priority: 3 },
  upgrade:   { gain: .83, interval: .18, priority: 4 },
  bossSpawn: { gain: .86, interval: 1.3, priority: 4 },
  bossWarn:  { gain: .80, interval: .62, priority: 4 },
  bossStomp: { gain: .85, interval: .66, priority: 3 },
  bossDown:  { gain: .85, interval: 1.3, priority: 4 },
  start:     { gain: .72, interval: .30, priority: 4 },
  won:       { gain: .84, interval: 1.2, priority: 5 },
  lost:      { gain: .79, interval: 1.2, priority: 5 },
};
const weaponCues = { round: 'rifle', tracer: 'smg', shell: 'vulcan', rocket: 'rocket' };
const tierCues = ['rifle', 'smg', 'vulcan', 'vulcan'];
const voices = new Set();
const lastPlayed = new Map();
const maxVoices = 12;
let context, compressor, master, ready, bank, muted = false, generation = 0;

const loadBank = () => fetch(bankUrl).then(response => {
  if (!response.ok) throw new Error('Could not load audio bank');
  return response.arrayBuffer();
});
let bankBytes = loadBank().catch(() => null);

export function unlock() {
  try {
    if (!context) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      context = new Audio({ latencyHint: 'interactive' });
      compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -12;
      compressor.knee.value = 7;
      compressor.ratio.value = 4;
      compressor.attack.value = .004;
      compressor.release.value = .14;
      master = context.createGain();
      master.gain.value = .82;
      compressor.connect(master).connect(context.destination);
    }
    const resumed = context.state === 'running' ? Promise.resolve() : context.resume();
    if (!ready) {
      ready = bankBytes.then(bytes => bytes || loadBank()).then(bytes => context.decodeAudioData(bytes)).then(buffer => {
        bank = buffer;
      }).catch(() => { ready = undefined; bankBytes = loadBank().catch(() => null); });
    }
    return Promise.all([resumed, ready]).catch(() => {});
  } catch { return Promise.resolve(); }
}

function stopVoice(voice) {
  voices.delete(voice);
  const now = context.currentTime;
  voice.gain.gain.setTargetAtTime(0, now, .003);
  voice.source.stop(now + .016);
}

export function quiet() {
  generation++;
  if (context) for (const voice of voices) stopVoice(voice);
  lastPlayed.clear();
}

export function setMuted(value) {
  muted = Boolean(value);
  if (muted) quiet();
}

function play(key, x) {
  if (!bank || muted || context?.state !== 'running') return;
  const settings = mix[key];
  if (!settings) return;
  const now = context.currentTime;
  if (now - (lastPlayed.get(key) ?? -Infinity) < settings.interval) return;
  if (voices.size >= maxVoices) {
    let quietest;
    for (const voice of voices) {
      if (!quietest || voice.priority < quietest.priority) quietest = voice;
    }
    if (quietest.priority >= settings.priority) return;
    stopVoice(quietest);
  }
  lastPlayed.set(key, now);
  const [offset, duration] = cues[key];
  const source = context.createBufferSource();
  source.buffer = bank;
  const gain = context.createGain();
  gain.gain.value = settings.gain;
  if (settings.priority < 3) source.playbackRate.value = .965 + Math.random() * .07;
  const pan = context.createStereoPanner?.();
  source.connect(gain);
  if (pan) {
    pan.pan.value = Math.max(-.5, Math.min(.5, (Number(x) || 0) * .115));
    gain.connect(pan).connect(compressor);
  } else gain.connect(compressor);
  const voice = { source, gain, priority: settings.priority };
  voices.add(voice);
  source.onended = () => {
    voices.delete(voice);
    source.disconnect();
    gain.disconnect();
    pan?.disconnect();
  };
  source.start(now, offset, duration);
}

export function sound(type, enabled, tier = 0, x = 0, kind) {
  if (!enabled || muted || !context) return;
  const key = type === 'fire' ? (weaponCues[kind] || tierCues[tier] || 'rifle') : type;
  if (bank && context.state === 'running') {
    play(key, x);
  } else if (key === 'start') {
    // Only the gesture's start cue may wait for decode. A pause or mute
    // invalidates it and ordinary combat events always expire immediately.
    const at = performance.now(), requested = generation;
    unlock().then(() => {
      if (requested === generation && performance.now() - at < 650) play(key, x);
    });
  }
}
