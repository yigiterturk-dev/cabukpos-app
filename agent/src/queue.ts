// agent/src/queue.ts — Yazdırma kuyruğu: yazıcı başına sırayla, 3 deneme (artan bekleme); olmazsa failed listesi.
export type Job = { id: string; printer: string; data: Uint8Array; tries: number; error?: string; at: number };
export type Send = (printer: string, data: Uint8Array) => Promise<void>;

export function createQueue(send: Send, opts: { delays?: number[]; maxFailed?: number; onChange?: () => void } = {}) {
  const delays = opts.delays ?? [1000, 3000, 9000];
  const maxFailed = opts.maxFailed ?? 50;
  const chains = new Map<string, Promise<void>>();
  const failed: Job[] = [];
  const done = new Set<string>();
  let n = 0;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function attempt(job: Job) {
    for (;;) {
      try {
        await send(job.printer, job.data);
        done.add(job.id);
        return;
      } catch (e) {
        job.tries++;
        job.error = e instanceof Error ? e.message : String(e);
        if (job.tries >= delays.length) {
          failed.push(job);
          if (failed.length > maxFailed) failed.shift();
          opts.onChange?.();
          return;
        }
        await sleep(delays[job.tries - 1]);
      }
    }
  }

  /** İşi sıraya koyar; iş bitince (başarılı ya da failed'e düşünce) çözülen söz döner. */
  function enqueue(printer: string, data: Uint8Array, id = `j${Date.now().toString(36)}${(n++).toString(36)}`) {
    const job: Job = { id, printer, data, tries: 0, at: Date.now() };
    const prev = chains.get(printer) ?? Promise.resolve();
    const p = prev.then(() => attempt(job));
    chains.set(printer, p);
    return { id, done: p.then(() => done.has(id)) };
  }

  function retry(id: string) {
    const i = failed.findIndex((j) => j.id === id);
    if (i < 0) return null;
    const [job] = failed.splice(i, 1);
    opts.onChange?.();
    return enqueue(job.printer, job.data, job.id);
  }

  return { enqueue, retry, failed: () => failed.map(({ data: _d, ...j }) => j), dropFailed: (id: string) => { const i = failed.findIndex((j) => j.id === id); if (i >= 0) failed.splice(i, 1); } };
}
