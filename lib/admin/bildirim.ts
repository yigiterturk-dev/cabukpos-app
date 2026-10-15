// lib/admin/bildirim.ts — bildirim merkezi kaynakları (canlı sorgu; kalıcı okundu kaydı yok, iskelet).
import { and, desc, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { foldTabs, type TabState } from "@/lib/core/tab";
import { initialEvents } from "@/lib/tabs/stream";

export type Bildirim = { id: string; title: string; desc: string; href: string; tone: "bad" | "warn" | "info"; at: string };

const gecikti = (t: TabState, now: number) =>
  Boolean(t.delivery.acceptedAt && t.delivery.prepMin && !t.delivery.outAt && now - new Date(t.delivery.acceptedAt).getTime() > t.delivery.prepMin * 60_000);

export async function bildirimler(tenantId: string, storeId: string): Promise<Bildirim[]> {
  const out: Bildirim[] = [];
  const now = Date.now();
  for (const t of [...foldTabs(await initialEvents({ tenantId, storeId })).values()].filter((x) => x.kind !== "masa")) {
    if (t.closed || t.delivery.rejected || t.delivery.cancelled) continue;
    const ad = t.order?.source?.platform ?? (t.kind === "paket" ? "Telefon" : "Platform");
    if (!t.delivery.acceptedAt) {
      out.push({ id: `tab-${t.id}`, title: `${ad} siparişi onay bekliyor`, desc: `${t.order?.name ?? ""} · ${(t.total / 100).toFixed(2)} ₺`.trim(), href: "/kasa", tone: "warn", at: t.openedAt });
    } else if (gecikti(t, now)) {
      out.push({ id: `gec-${t.id}`, title: `${ad} siparişi hazırlıkta gecikti`, desc: `${t.order?.name ?? ""} · ${t.delivery.prepMin} dk hedefi aşıldı`, href: "/kasa", tone: "bad", at: t.delivery.acceptedAt! });
    }
  }
  await withTenant(tenantId, async (tx) => {
    const s = await tx.select({ id: schema.sales.id, review: schema.sales.review, at: schema.sales.createdAt }).from(schema.sales)
      .where(and(eq(schema.sales.tenantId, tenantId), isNotNull(schema.sales.review), gte(schema.sales.createdAt, sql`now() - interval '7 days'`)))
      .orderBy(desc(schema.sales.createdAt)).limit(5);
    for (const r of s) out.push({ id: `sat-${r.id}`, title: "İncelenmesi gereken satış", desc: r.review ?? "", href: "/yonetim/raporlar?sekme=inceleme", tone: "info", at: r.at.toISOString() });

    const f = await tx.select({ id: schema.fiscalDocuments.id, status: schema.fiscalDocuments.status, at: schema.fiscalDocuments.createdAt }).from(schema.fiscalDocuments)
      .where(and(eq(schema.fiscalDocuments.tenantId, tenantId), sql`${schema.fiscalDocuments.status} in ('error', 'cancel_rejected')`))
      .orderBy(desc(schema.fiscalDocuments.createdAt)).limit(5);
    for (const r of f) out.push({ id: `mal-${r.id}`, title: r.status === "error" ? "e-Arşiv belge hatası" : "İptali reddedilen belge", desc: "Mali → Belgeler'den inceleyin", href: `/yonetim/mali?sekme=belgeler&durum=${r.status}`, tone: "bad", at: r.at.toISOString() });

    const fr = await tx.select({ id: schema.fiscalRefunds.id, at: schema.fiscalRefunds.createdAt }).from(schema.fiscalRefunds)
      .where(and(eq(schema.fiscalRefunds.tenantId, tenantId), isNull(schema.fiscalRefunds.resolvedAt), eq(schema.fiscalRefunds.kind, "alici_faturasi")))
      .orderBy(desc(schema.fiscalRefunds.createdAt)).limit(5);
    for (const r of fr) out.push({ id: `iad-${r.id}`, title: "Alıcının iade faturası bekleniyor", desc: "Raporlar → İncelenecek'ten no/tarih girin", href: "/yonetim/raporlar", tone: "info", at: r.at.toISOString() });
  });
  return out.sort((a, b) => (a.at < b.at ? 1 : -1));
}
