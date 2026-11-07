"use client";
// lib/offline/browser-print.ts — Ajansız yazdırma: gizli iframe + print(). Chrome --kiosk-printing ile açıldıysa
// pencere çıkmadan varsayılan yazıcıya gider; değilse Chrome'un Yazdır penceresi açılır.
let queue: Promise<void> = Promise.resolve();

export function printHtml(html: string): Promise<void> {
  const run = () => new Promise<void>((resolve) => {
    const f = document.createElement("iframe");
    f.setAttribute("aria-hidden", "true");
    f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    document.body.appendChild(f);
    const done = () => { setTimeout(() => { f.remove(); resolve(); }, 1000); };
    const w = f.contentWindow;
    if (!w) { f.remove(); resolve(); return; }
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } finally { done(); } }, 150);
  });
  // Fişler sırayla: üst üste print() çağrısı Chrome'da birini yutabilir.
  queue = queue.then(run, run);
  return queue;
}
