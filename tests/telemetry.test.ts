import { test } from "node:test";
import assert from "node:assert/strict";
import { captureError, captureEvent, exportOtlpLogs, withSpan } from "@/lib/observability/telemetry";

type Call = { url: string; init?: RequestInit };

function recordingFetch(calls: Call[], status = 200): typeof fetch {
  return (async (input: string, init?: RequestInit) => {
    calls.push({ url: input, init });
    return new Response(null, { status });
  }) as typeof fetch;
}

test("telemetry: OTEL endpoint yokken dışarı istek çıkmaz", async () => {
  delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const calls: Call[] = [];
  await captureError("test", new Error("patladı"), { ek: 1 }, recordingFetch(calls));
  assert.equal(calls.length, 0);
});

test("telemetry: OTLP yükü logs sinyali biçiminde", async () => {
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "https://otel.example";
  try {
    const calls: Call[] = [];
    const err = new Error("fiş kesilemedi");
    await captureError("fiscal", err, { tenant: "t1" }, recordingFetch(calls));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://otel.example/v1/logs");
    const body = JSON.parse(String(calls[0].init?.body));
    const record = body.resourceLogs[0].scopeLogs[0].logRecords[0];
    assert.equal(body.resourceLogs[0].resource.attributes[0].value.stringValue, "cabukpos");
    assert.equal(record.severityText, "ERROR");
    assert.match(record.body.stringValue, /fiscal.*fiş kesilemedi/);
    assert.ok(record.attributes.some((a: { key: string }) => a.key === "error.stack"));
    assert.ok(record.attributes.some((a: { key: string; value: { stringValue: string } }) => a.key === "tenant" && a.value.stringValue === "t1"));
  } finally {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  }
});

test("telemetry: export fetch patlarsa çağırana sıçramaz", async () => {
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "https://otel.example";
  try {
    const boom = (async () => {
      throw new Error("ağ yok");
    }) as typeof fetch;
    await assert.doesNotReject(() => exportOtlpLogs([{ severity: "INFO", body: "selam", source: "test" }], boom));
  } finally {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  }
});

test("telemetry: withSpan sonucu aynen döner", async () => {
  const out = await withSpan("test.iyi", async () => 42, recordingFetch([]));
  assert.equal(out, 42);
});

test("telemetry: withSpan hatayı kaydeder ve yeniden fırlatır", async () => {
  const calls: Call[] = [];
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "https://otel.example";
  try {
    await assert.rejects(
      () => withSpan("test.kotu", async () => { throw new Error("kırıldı"); }, recordingFetch(calls)),
      /kırıldı/,
    );
    const record = JSON.parse(String(calls[0].init?.body)).resourceLogs[0].scopeLogs[0].logRecords[0];
    assert.match(record.body.stringValue, /test\.kotu.*kırıldı/);
  } finally {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  }
});

test("telemetry: captureEvent INFO kaydı düşürür", async () => {
  const calls: Call[] = [];
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "https://otel.example";
  try {
    await captureEvent("server.start", { runtime: "node" }, recordingFetch(calls));
    const record = JSON.parse(String(calls[0].init?.body)).resourceLogs[0].scopeLogs[0].logRecords[0];
    assert.equal(record.severityText, "INFO");
  } finally {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  }
});
