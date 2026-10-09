// lib/fiscal/okc-cloud.ts — Yol A: bulut e-ÖKC/VÖRC çözücü sürücüsü (parasut/uyumsoft). BYOK: kiracı kendi
// çözücü hesabının API anahtarını Yönetim → Mali'ye girer (fiscalSettings.okcApiKey, AES-256-GCM şifreli).
// İstek/yanıt sözleşmesi OkcReceiptInput/OkcResult'a bağlıdır; uç adları entegratör sandbox teklifiyle
// doğrulanınca yalnız buradaki path'ler güncellenir (docs/OKC-YOL-HARITASI.md — tek oturum maddesi).
import type { OkcProvider, OkcReceiptInput, OkcResult } from "./okc";

export type CloudOkcName = "parasut" | "uyumsoft";
export type CloudOkcConfig = { key: string; url: string };

const TIMEOUT_MS = 8000;

async function call(cfg: CloudOkcConfig, path: string, method: "POST" | "GET", body?: unknown): Promise<unknown> {
  const res = await fetch(cfg.url.replace(/\/$/, "") + path, {
    method,
    headers: { authorization: `Bearer ${cfg.key}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  const j = (await res.json().catch(() => null)) as { no?: unknown; zNo?: unknown; error?: unknown } | null;
  if (!res.ok) {
    const detail = typeof j?.error === "string" ? `: ${j.error}` : "";
    throw Object.assign(new Error(`ÖKC sağlayıcı hatası (HTTP ${res.status})${detail}`), { retryable: res.status >= 500 || res.status === 429 });
  }
  return j;
}

const str = (v: unknown, what: string): string => {
  if (typeof v !== "string" || !v) throw Object.assign(new Error(`ÖKC cevabı tanınmadı (${what})`), { retryable: true });
  return v;
};
const num = (v: unknown, what: string): number => {
  if (typeof v !== "number" || !Number.isFinite(v)) throw Object.assign(new Error(`ÖKC cevabı tanınmadı (${what})`), { retryable: true });
  return v;
};

export function cloudOkc(name: CloudOkcName, cfg: CloudOkcConfig): OkcProvider {
  void name; // uç farkları teklif netleşince buraya: parasut/uyumsoft path farklıysa ayır
  return {
    async receipt(doc: OkcReceiptInput): Promise<OkcResult> {
      try {
        const j = await call(cfg, "/e-okc/receipts", "POST", {
          deviceSerial: doc.serial,
          receiptNo: doc.receiptNo,
          total: doc.total,
          vat: doc.vat,
          payments: doc.payments,
          soldAt: doc.soldAt.toISOString(),
        });
        return { ok: true, no: str(j && (j as { no?: unknown }).no, "no"), zNo: num(j && (j as { zNo?: unknown }).zNo, "zNo") };
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        return { ok: false, error: err.message, retryable: (err as { retryable?: boolean }).retryable ?? true };
      }
    },
    async cancel(no: string, issuedAt: Date) {
      try {
        await call(cfg, `/e-okc/receipts/${encodeURIComponent(no)}/cancel`, "POST", { issuedAt: issuedAt.toISOString() });
        return { ok: true as const };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
      }
    },
    async zReport() {
      try {
        const j = await call(cfg, "/e-okc/z-report", "POST");
        return { ok: true as const, no: str(j && (j as { no?: unknown }).no, "z no"), zNo: num(j && (j as { zNo?: unknown }).zNo, "zNo") };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}
