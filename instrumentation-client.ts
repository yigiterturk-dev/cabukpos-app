// #57: İstemci tarafı hata yakalama iskeleti. Uygulamadan önce çalışır; kendi hataları uygulamayı etkilemez.
try {
  const send = (source: string, message: string, stack?: string) => {
    try {
      void fetch("/api/telemetry/client", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source, message, stack, path: location.pathname }),
        keepalive: true,
      });
    } catch { /* telemetri hatası uygulamayı etkilemez */ }
  };
  window.addEventListener("error", (event) => {
    send("client.error", event.message || "bilinmeyen hata", event.error instanceof Error ? event.error.stack : undefined);
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    send("client.unhandledRejection", reason instanceof Error ? reason.message : String(reason), reason instanceof Error ? reason.stack : undefined);
  });
} catch { /* telemetri kurulumu başarısız olsa da uygulama çalışır */ }
