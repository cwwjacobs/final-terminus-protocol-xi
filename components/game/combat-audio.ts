import type { CombatEvent } from './world-feedback';

export type CombatSound = 'thunder' | 'arc' | 'wave' | 'thread';
export function combatSound(event: CombatEvent): CombatSound | null {
  if (event.kind === 'static_strike') return 'thunder';
  if (event.kind === 'static_discharge') return 'arc';
  if (event.kind === 'shimmer_wave') return 'wave';
  if (event.kind === 'ability' && event.source === 'mendingThread') return 'thread';
  return null;
}

/** Small original synthesized cues. One context, master gain, bounded voices. */
export function createCombatAudio() {
  let context: AudioContext | null = null, master: GainNode | null = null, volume = .35;
  const voices = new Set<AudioScheduledSourceNode>();
  function track(source: AudioScheduledSourceNode, nodes: AudioNode[], end: number) {
    if (voices.size >= 12) voices.values().next().value?.stop();
    voices.add(source);
    source.onended = () => { voices.delete(source); source.disconnect(); nodes.forEach(node => node.disconnect()); };
    source.start(); source.stop(end);
  }
  return {
    unlock() {
      try {
        if (!context) {
          const Constructor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (!Constructor) return;
          context = new Constructor(); master = context.createGain(); master.gain.value = volume; master.connect(context.destination);
        }
        if (context.state === 'suspended') void context.resume().catch(() => {});
      } catch { /* Audio support never blocks combat. */ }
    },
    setVolume(value: number) { volume = Math.max(0, Math.min(1, value)); if (master && context) master.gain.setTargetAtTime(volume, context.currentTime, .03); },
    play(sound: CombatSound) {
      if (!context || !master || context.state !== 'running' || document.hidden || volume === 0) return;
      const ctx = context, now = ctx.currentTime;
      const duration = sound === 'thunder' ? 1.8 : sound === 'arc' ? .32 : .85;
      const gain = ctx.createGain(); gain.connect(master);
      gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(sound === 'thunder' ? .38 : .14, now + .025);
      gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
      if (sound === 'thunder' || sound === 'arc') {
        const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(); source.buffer = buffer;
        filter.type = sound === 'thunder' ? 'lowpass' : 'bandpass'; filter.frequency.value = sound === 'thunder' ? 240 : 1500; filter.Q.value = .6;
        source.connect(filter); filter.connect(gain); track(source, [filter, gain], now + duration);
      } else {
        const source = ctx.createOscillator(); source.type = 'sine'; source.frequency.setValueAtTime(sound === 'wave' ? 523.25 : 783.99, now);
        source.frequency.exponentialRampToValueAtTime(sound === 'wave' ? 1046.5 : 1174.66, now + duration * .7);
        source.connect(gain); track(source, [gain], now + duration);
      }
    },
    silence() { for (const source of voices) { try { source.stop(); } catch {} } voices.clear(); },
    dispose() { for (const source of voices) { try { source.stop(); } catch {} } voices.clear(); if (context) void context.close().catch(() => {}); context = null; master = null; },
  };
}
