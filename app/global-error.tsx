"use client";
import { useEffect } from "react";

/** Kök yerleşim de çöktüğünde (globals.css yüklenemeyebilir) kendi başına duran son çare sınırı. */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <html lang="tr">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, minHeight: "100svh", display: "grid", placeItems: "center" }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>Bir sorun oluştu</h1>
          <p style={{ color: "#555", fontSize: 14 }}>Uygulama beklenmeyen bir hatayla karşılaştı.</p>
          {error.digest ? (
            <p>
              <code style={{ background: "#f4f4f5", padding: "2px 6px", fontSize: 12 }}>{error.digest}</code>
            </p>
          ) : null}
          <button
            type="button"
            onClick={retry}
            style={{ marginTop: 16, minHeight: 44, background: "#171717", color: "#fff", border: 0, borderRadius: 8, padding: "10px 16px", fontSize: 14, cursor: "pointer" }}
          >
            Tekrar dene
          </button>
        </div>
      </body>
    </html>
  );
}
