/** Kısa iki ton (hazır bildirimi; high → yeni platform siparişi). Ses izni yoksa ya da Tercihler'den kapatıldıysa sessiz geçer. */
export function beep(high = false) {
  try {
    if (localStorage.getItem("sesli_uyari") === "kapali") return;
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

/** Yeni sipariş alarmı: belirgin, yüksek, ~2 sn (üç kez yükselen üç nota). Kısa "bip" yerine. */
export function orderAlarm() {
  try {
    if (localStorage.getItem("sesli_uyari") === "kapali") return;
    const ctx = new AudioContext();
    const notes = [784, 988, 1319];
    for (let r = 0; r < 3; r++) notes.forEach((f, i) => {
      const t = r * 0.62 + i * 0.16;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "square";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.3);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.32);
    });
    setTimeout(() => void ctx.close(), 2500);
  } catch { /* ses yok */ }
}
