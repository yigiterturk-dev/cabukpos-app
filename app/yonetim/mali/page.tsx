import Link from "next/link";
import { headers } from "next/headers";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { DEFAULT_MODES, FISCAL_CHANNELS } from "@/lib/core/fiscal";
import { formatTL } from "@/lib/core/money";
import { FiscalRowActions, FiscalSettingsForm } from "@/components/admin/FiscalForms";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; tone: "neutral" | "ok" | "warn" | "bad" | "brand" }> = {
  pending: { label: "Bekliyor", tone: "neutral" }, issued: { label: "Kesildi", tone: "ok" }, error: { label: "Hata", tone: "bad" },
  cancelled: { label: "İptal", tone: "neutral" }, cancel_rejected: { label: "İade faturası gerekli", tone: "warn" },
};
const FILTERS = [["", "Tümü"], ["error", "Hata"], ["pending", "Bekliyor"], ["issued", "Kesildi"], ["cancel_rejected", "İade faturası gerekli"], ["cancelled", "İptal"]] as const;
const dt = (d: Date) => d.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" });
const seg = (on: boolean) => `rounded-lg border px-3 py-2 text-sm ${on ? "border-brand bg-brand-soft font-medium text-brand" : "border-line hover:bg-stone-50"}`;

export default async function Mali({ searchParams }: { searchParams: Promise<{ sekme?: string; durum?: string }> }) {
  const a = await requireAdmin();
  const q = await searchParams;
  const tab = q.sekme === "belgeler" ? "belgeler" : "ayarlar";
  const durum = FILTERS.some(([v]) => v === q.durum) ? (q.durum as (typeof schema.fiscalDocStatus.enumValues)[number]) : "";
  const D = schema.fiscalDocuments;
  const [[t], [fs, counts, docs]] = await Promise.all([
    getDb().select({ taxId: schema.tenants.taxId, taxOffice: schema.tenants.taxOffice, address: schema.tenants.address }).from(schema.tenants).where(eq(schema.tenants.id, a.tenantId)),
    withTenant(a.tenantId, (tx) => Promise.all([
      tx.select().from(schema.fiscalSettings).then((r) => r[0]),
      tx.select({ status: D.status, n: sql<number>`count(*)::int` }).from(D).groupBy(D.status),
      tab === "belgeler"
        ? tx.select({ id: D.id, status: D.status, number: D.number, buyer: D.buyer, token: D.token, lastError: D.lastError, attempts: D.attempts, emailSentAt: D.emailSentAt, createdAt: D.createdAt, receiptNo: schema.sales.receiptNo, total: schema.sales.total })
          .from(D).innerJoin(schema.sales, eq(schema.sales.id, D.saleId)).where(durum ? and(eq(D.status, durum)) : undefined).orderBy(desc(D.createdAt)).limit(200)
        : Promise.resolve([]),
    ])),
  ]);
  const n = (s: string) => counts.find((c) => c.status === s)?.n ?? 0;
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const fake = (fs?.provider ?? "fake-earsiv") === "fake-earsiv";
  return (
    <>
      <PageHeader title="Mali belge" desc="Bilgi fişi ya da e-Arşiv fatura. Kesilemeyen belgeler otomatik yeniden denenir; iade edilen faturalar iptal edilir." />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link href="/yonetim/mali" className={seg(tab === "ayarlar")}>Ayarlar</Link>
        <Link href="/yonetim/mali?sekme=belgeler" className={seg(tab === "belgeler")}>Belgeler</Link>
        {n("error") > 0 && <Link href="/yonetim/mali?sekme=belgeler&durum=error"><Badge tone="bad">{n("error")} hata</Badge></Link>}
        {n("cancel_rejected") > 0 && <Link href="/yonetim/mali?sekme=belgeler&durum=cancel_rejected"><Badge tone="warn">{n("cancel_rejected")} iade faturası gerekli</Badge></Link>}
      </div>
      {tab === "ayarlar" ? (
        <Card className="p-5">
          <FiscalSettingsForm fake={fake} channels={a.vertical === "market" ? ["kasa"] : FISCAL_CHANNELS}
            initial={{ taxId: t?.taxId ?? "", taxOffice: t?.taxOffice ?? "", address: t?.address ?? "", series: fs?.series ?? "CBP", modes: { ...DEFAULT_MODES, ...fs?.channelModes }, fakeFail: fs?.fakeFail ?? false }} />
        </Card>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-1" role="group" aria-label="Durum">
            {FILTERS.map(([v, l]) => <Link key={v} href={`/yonetim/mali?sekme=belgeler${v ? `&durum=${v}` : ""}`} aria-pressed={durum === v} className={seg(durum === v)}>{l}</Link>)}
          </div>
          {docs.length === 0 ? <Empty>Belge yok.</Empty> : (
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted"><tr><th className="p-3 font-medium">Tarih</th><th className="font-medium">Fiş no</th><th className="font-medium">Alıcı</th><th className="text-right font-medium">Tutar</th><th className="pl-3 font-medium">Durum</th><th className="font-medium">Numara</th><th className="p-3 font-medium">E-posta</th></tr></thead>
                <tbody>
                  {docs.map((d) => (
                    <tr key={d.id} className="border-t border-line align-top" data-testid="fiscal-row">
                      <td className="whitespace-nowrap p-3">{dt(d.createdAt)}</td>
                      <td className="whitespace-nowrap py-3 font-mono">{d.receiptNo}</td>
                      <td className="py-3">{d.buyer.name}<div className="text-xs text-muted">{d.buyer.taxId}</div></td>
                      <td className="whitespace-nowrap py-3 text-right tabular-nums">{formatTL(d.total)}</td>
                      <td className="py-3 pl-3"><Badge tone={STATUS[d.status].tone}>{STATUS[d.status].label}</Badge>
                        {d.lastError && <div className="mt-1 max-w-56 text-xs text-muted">{d.lastError}{d.status === "error" ? ` (${d.attempts}. deneme)` : ""}</div>}</td>
                      <td className="py-3 font-mono text-xs">{d.number ?? "—"}
                        <div className="mt-2"><FiscalRowActions id={d.id} status={d.status} canMail={!!d.buyer.email} url={`${origin}/f/${d.token}`} /></div></td>
                      <td className="p-3 text-xs">{!d.buyer.email ? "—" : d.emailSentAt ? "Gönderildi" : "Gönderilmedi"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </>
  );
}
