let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

// Browsers only allow sound after the user has interacted with the page once.
export function unlockAlarmSound() {
  const c = audio();
  if (c && c.state === 'suspended') c.resume();
}

export function alarmSoundReady(): boolean {
  return !!ctx && ctx.state === 'running';
}

export function playAlarm(durationMs = 10_000): () => void {
  const c = audio();
  if (!c) return () => {};
  if (c.state === 'suspended') c.resume();

  const gain = c.createGain();
  gain.gain.value = 0;
  gain.connect(c.destination);
  const osc = c.createOscillator();
  osc.type = 'square';
  osc.frequency.value = 1760;
  osc.connect(gain);

  const start = c.currentTime + 0.05;
  const end = start + durationMs / 1000;
  // "beep beep" pair, then a short pause, repeated.
  for (let t = start; t < end; t += 0.8) {
    for (const offset of [0, 0.22]) {
      gain.gain.setValueAtTime(0.18, t + offset);
      gain.gain.setValueAtTime(0, t + offset + 0.14);
    }
  }
  osc.start(start);
  osc.stop(end);

  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    try {
      osc.stop();
    } catch {
      // already stopped
    }
    gain.disconnect();
  };
}
