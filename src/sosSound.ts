let ctx: AudioContext | null = null;

// Two-tone siren: 4 short beeps alternating 880 Hz / 660 Hz
export function playSosSound() {
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    ctx = ctx ?? new AC();
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      const start = t0 + i * 0.3;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = i % 2 === 0 ? 880 : 660;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.15, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.27);
    }
  } catch {
    /* sound is a bonus; never break the SOS flow */
  }
}
