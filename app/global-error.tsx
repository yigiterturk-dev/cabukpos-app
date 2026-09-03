"use client";

// Root layout'un kendisi patlarsa devreye girer (kendi <html>/<body>'sini render eder).
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="tr">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>
        <main
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: "0 20px",
            background: "#F7F8FA",
            color: "#16181D",
          }}
        >
          <div style={{ maxWidth: 420, textAlign: "center" }}>
            <h1 style={{ fontSize: 20, margin: 0 }}>Uygulama yüklenemedi</h1>
            <p style={{ color: "#6B7280", fontSize: 15 }}>
              Geçici bir sorun oluştu. Sayfayı yenilemeyi dene.
            </p>
            {error.digest ? (
              <p style={{ color: "#6B7280", fontSize: 12, fontFamily: "monospace" }}>
                Referans: {error.digest}
              </p>
            ) : null}
            <button
              type="button"
              onClick={reset}
              style={{
                marginTop: 20, padding: "10px 16px", borderRadius: 12, border: 0,
                background: "#2F5BEA", color: "#fff", fontWeight: 600, cursor: "pointer",
              }}
            >
              Tekrar dene
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
