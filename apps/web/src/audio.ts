let context: AudioContext | undefined;
let enabled = false;
export function setAudio(on: boolean) {
  enabled = on;
  if (on) { context ??= new AudioContext(); void context.resume(); }
}
export function sound(kind: string) {
  if (!enabled || !context || context.state !== 'running') return;
  const notes = kind === 'GIFT' ? [440,660,880] : kind === 'PODIUM' ? [523,659,784,1047] : kind === 'FINAL_RUSH' ? [220,330,440] : [520,780];
  notes.forEach((frequency, i) => {
    const oscillator = context!.createOscillator(), gain = context!.createGain(), at = context!.currentTime + i * .09;
    oscillator.type = 'sine'; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(.055, at + .01); gain.gain.exponentialRampToValueAtTime(.001, at + .18);
    oscillator.connect(gain); gain.connect(context!.destination); oscillator.start(at); oscillator.stop(at + .2);
  });
}
