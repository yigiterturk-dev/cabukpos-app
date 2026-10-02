// #57: Bağımlılıksız APM iskeleti. alerts.ts kuralı: env kapalıysa hiçbir istek dışarı çıkmaz.
// OTEL_EXPORTER_OTLP_ENDPOINT tanımlıysa kayıtlar OTLP/HTTP JSON (logs sinyali) ile dışa aktarılır;
// Sentry/oteller için ileride gerçek SDK'ya geçiş bu modülün arkasından yapılır.
import { dispatchAlert } from "@/lib/observability/alerts";

export type TelemetrySeverity = "INFO" | "WARN" | "ERROR";

export type TelemetryEntry = {
  severity: TelemetrySeverity;
  body: string;
  source: string;
  stack?: string;
  detail?: Record<string, unknown>;
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function otlpEndpoint(): string | undefined {
  const raw = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!raw) return undefined;
  return `${raw.replace(/\/+$/, "")}/v1/logs`;
}

function toEntry(severity: TelemetrySeverity, source: string, error: unknown, detail?: Record<string, unknown>): TelemetryEntry {
  const message = error instanceof Error ? error.message : String(error);
  return { severity, source, body: message, stack: error instanceof Error ? error.stack : undefined, detail };
}

/** OTLP/HTTP JSON log kaydı; hata verirse sessizce yutar (telemetri işi bozmaz). */
export async function exportOtlpLogs(entries: TelemetryEntry[], fetchImpl: FetchLike = fetch): Promise<void> {
  const endpoint = otlpEndpoint();
  if (!endpoint || entries.length === 0) return;
  const nowMs = Date.now();
  const payload = {
    resourceLogs: [
      {
        resource: { attributes: [{ key: "service.name", value: { stringValue: process.env.OTEL_SERVICE_NAME ?? "cabukpos" } }] },
        scopeLogs: [
          {
            logRecords: entries.map((e) => ({
              timeUnixNano: `${nowMs}000000`,
              severityText: e.severity,
              body: { stringValue: `[${e.source}] ${e.body}` },
              attributes: [
                ...(e.stack ? [{ key: "error.stack", value: { stringValue: e.stack } }] : []),
                ...Object.entries(e.detail ?? {}).map(([key, value]) => ({ key, value: { stringValue: String(value) } })),
              ],
            })),
          },
        ],
      },
    ],
  };
  try {
    await fetchImpl(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5_000),
    });
  } catch { /* telemetri hatası uygulamayı etkilemez */ }
}

/** Sunucu hatasını yakalar: yapılandırılmış log + ops webhook'u + (varsa) OTLP. Asla fırlatmaz. */
export async function captureError(source: string, error: unknown, detail?: Record<string, unknown>, fetchImpl?: FetchLike): Promise<void> {
  const entry = toEntry("ERROR", source, error, detail);
  console.error(JSON.stringify({ level: "error", source, message: entry.body, stack: entry.stack, ...detail }));
  await dispatchAlert(`telemetry.${source}`, { message: entry.body, ...detail });
  await exportOtlpLogs([entry], fetchImpl);
}

/** Dikkat değer olayı (yavaş span, tuhaf durum); ERROR olmayan kayıt. Asla fırlatmaz. */
export async function captureEvent(event: string, detail?: Record<string, unknown>, fetchImpl?: FetchLike): Promise<void> {
  console.info(JSON.stringify({ level: "info", event, ...detail }));
  await exportOtlpLogs([{ severity: "INFO", body: event, source: event, detail }], fetchImpl);
}

/** APM iskeleti: async işi süreyle sarar; hata yakalanıp kaydedilir, yavaşsa WARN düşer. Sonucu değiştirmez. */
export async function withSpan<T>(name: string, fn: () => Promise<T>, fetchImpl?: FetchLike): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    const ms = Math.round(performance.now() - start);
    const slowMs = Number(process.env.APM_SLOW_SPAN_MS ?? 1000);
    if (ms >= slowMs) await captureEvent(`span.slow:${name}`, { ms }, fetchImpl);
    return result;
  } catch (err) {
    const ms = Math.round(performance.now() - start);
    await captureError(`span:${name}`, err, { ms }, fetchImpl);
    throw err;
  }
}
