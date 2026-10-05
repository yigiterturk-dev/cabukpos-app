// lib/fiscal/okc.ts — ÖKC/ETMOS mali cihaz sürücü katmanı (#18). Satışı hiçbir durumda engellemez:
// kesilemeyen fişin künyesi yazılmaz, satış zaten eşitlenmiştir. Gerçek cihaz/entegratör (#18 insan payı)
// gelince bu arayüze takılır — fake-okc sandbox yaşam döngüsünü simüle eder.
import { eq, sql } from "drizzle-orm";
import { schema, withTenant } from "@/db";import { okcFiscalNo, zNoOf, type OkcSaleData } from "@/lib/core/okc";
import { audit } from "@/lib/audit";
import { fakeProvidersBlocked } from "@/lib/fake-providers";

export type OkcReceiptInput = {
  serial: string;
  /** Kiracı sayacı — sahte sürücü fiş no üretir; gerçek cihaz kendi numarasını verir, yok sayar. */
  seq: number;
  receiptNo: string;
  total: number;
  vat: { rate: number; gross: number; net: number; vat: number }[];
  payments: { method: string; amount: number }[];
  soldAt: Date;
};

export type OkcResult =
  | { ok: true; no: string; zNo: number }
  | { ok: false; error: string; retryable: boolean };

export interface OkcProvider {
  receipt(doc: OkcReceiptInput): Promise<OkcResult>;
  /** İade/iptal — gerçek cihazda mali fiş iptali; sandbox kayıt dışı bırakır. */
  cancel(no: string, issuedAt: Date): Promise<{ ok: true } | { ok: false; error: string }>;
}

export function getOkc(name: string, opts: { fakeFail: boolean }): OkcProvider {
  if (name === "fake-okc") {
    if (fakeProvidersBlocked()) throw new Error("Sahte ÖKC sağlayıcısı production'da kullanılamaz.");
    return fakeOkc(opts);
  }
  throw new Error(`Bilinmeyen ÖKC sağlayıcı: ${name}`);
}

function fakeOkc({ fakeFail }: { fakeFail: boolean }): OkcProvider {
  return {
    async receipt(doc) {
      if (fakeFail) return { ok: false, error: "sandbox: cihaz hatası", retryable: true };
      const zNo = zNoOf(doc.soldAt);
      return { ok: true, no: okcFiscalNo(doc.serial, zNo, doc.seq), zNo };
    },
    async cancel() {
      return fakeFail ? { ok: false, error: "sandbox: iptal reddedildi" } : { ok: true };
    },
  };
}

export type OkcOutcome = { status: "ok" | "error"; data?: OkcSaleData; error?: string };

/** Satışı mali fişle künyeler. Ayar kapalıysa ya da daha önce künyelendiyse null — çağıran bir şey yapmaz. */
export async function okcReceiptFor(tenantId: string, saleId: string): Promise<OkcOutcome | null> {
  return withTenant(tenantId, async (tx) => {
    const [s] = await tx.select().from(schema.fiscalSettings);
    if (!s?.okcProvider || !s.okcSerial) return null;
    const [sale] = await tx.select().from(schema.sales).where(eq(schema.sales.id, saleId));
    if (!sale || sale.status !== "kapandi") return null;
    if (sale.okc) return null;
    const payments = await tx.select({ method: schema.payments.method, amount: schema.payments.amount }).from(schema.payments).where(eq(schema.payments.saleId, saleId));
    // Sayaç: fiş sırası; başarısız denemede geri sarılır (numara yalnız kesimde yanar — e-Arşiv kuralının aynısı).
    const [cur] = await tx.insert(schema.fiscalSettings).values({ tenantId, okcCounter: 1 })
      .onConflictDoUpdate({ target: schema.fiscalSettings.tenantId, set: { okcCounter: sql`${schema.fiscalSettings.okcCounter} + 1` } }).returning();
    let r: OkcResult;
    try { r = await getOkc(s.okcProvider, { fakeFail: s.okcFakeFail }).receipt({
      serial: s.okcSerial, seq: cur.okcCounter, receiptNo: sale.receiptNo, total: sale.total, vat: sale.vat, payments, soldAt: sale.createdAt,
    }); } catch (e) { r = { ok: false, error: e instanceof Error ? e.message : "ÖKC hatası", retryable: true }; }
    if (!r.ok) {
      await tx.update(schema.fiscalSettings).set({ okcCounter: cur.okcCounter - 1 }).where(eq(schema.fiscalSettings.tenantId, tenantId));
      return { status: "error", error: r.error };
    }
    const data: OkcSaleData = { no: r.no, zNo: r.zNo, serial: s.okcSerial, test: s.okcProvider.startsWith("fake") || undefined };
    await tx.update(schema.sales).set({ okc: data }).where(eq(schema.sales.id, saleId));
    await audit(tx, tenantId, "system:okc", "fiscal.okc", { saleId, no: data.no });
    return { status: "ok", data };
  });
}

/** Ayar sayfası: ÖKC bağlantısını canlı dener (sandbox). */
export async function okcPing(tenantId: string): Promise<OkcResult> {
  return withTenant(tenantId, async (tx) => {
    const [s] = await tx.select().from(schema.fiscalSettings);
    if (!s?.okcProvider || !s.okcSerial) return { ok: false, error: "ÖKC kapalı", retryable: false };
    return getOkc(s.okcProvider, { fakeFail: s.okcFakeFail }).receipt({
      serial: s.okcSerial, seq: 1, receiptNo: "PING", total: 1, vat: [], payments: [], soldAt: new Date(),
    }).then((r) => r.ok ? { ok: true as const, no: r.no, zNo: r.zNo } : r);
  });
}
