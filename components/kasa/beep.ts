/** Kısa iki ton (hazır bildirimi; high → yeni platform siparişi). Ses izni yoksa sessiz geçer. */
export function beep(high = false) {
  try {
    const ctx = new AudioContext();
    [0, 0.18].forEach((t, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = (i ? 1320 : 880) * (high ? 1.25 : 1);
      g.gain.setValueAtTime(0.15, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.15);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.16);
    });
    setTimeout(() => void ctx.close(), 600);
  } catch { /* ses yok */ }
}
