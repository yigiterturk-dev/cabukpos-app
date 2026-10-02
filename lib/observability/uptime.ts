// #57: Uptime izleme çekirdeği. Saf fonksiyonlar; cron rotası ince kalır, testler DB'siz koşar.
export type UptimeResult = { url: string; ok: boolean; status?: number; ms: number; error?: string };

/** Virgülle ayrılmış hedef listesini ayrıştırır; yalnız http(s) adresleri kalır. */
export function parseTargets(raw: string | undefined | null): string[] {
  return (raw ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter((t) => /^https?:\/\//.test(t));
}

async function checkOne(url: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<UptimeResult> {
  const start = performance.now();
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": "cabukpos-uptime/1" } });
    return { url, ok: res.ok, status: res.status, ms: Math.round(performance.now() - start) };
  } catch (err) {
    return { url, ok: false, ms: Math.round(performance.now() - start), error: err instanceof Error ? err.message : String(err) };
  }
}

/** Kendi readiness'si + harici hedefleri denetler; özet döner. */
export async function runUptimeChecks(opts: {
  self: () => Promise<boolean>;
  targets: string[];
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<{ ok: boolean; self: boolean; results: UptimeResult[] }> {
  const [selfOk, results] = await Promise.all([
    opts.self().catch(() => false),
    Promise.all(opts.targets.map((t) => checkOne(t, opts.fetchImpl ?? fetch, opts.timeoutMs ?? 5000))),
  ]);
  return { ok: selfOk && results.every((r) => r.ok), self: selfOk, results };
}
