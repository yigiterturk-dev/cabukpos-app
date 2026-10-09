import Link from "next/link";
import { headers } from "next/headers";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { DEFAULT_MODES, FISCAL_CHANNELS } from "@/lib/core/fiscal";
import { formatTL } from "@/lib/core/money";
import { FiscalRowActions, FiscalSettingsForm } from "@/components/admin/FiscalForms";
import { queryEnvelopes } from "@/lib/admin/fiscal-actions";
import { currentIstMonth } from "@/lib/admin/accounting";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { fakeProvidersBlocked } from "@/lib/fake-providers";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; tone: "neutral" | "ok" | "warn" | "bad" | "brand" }> = {
  pending: { label: "Bekliyor", tone: "neutral" }, issued: { label: "Kesildi", tone: "ok" }, error: { label: "Hata", tone: "bad" },
  cancelled: { label: "İptal", tone: "neutral" }, cancel_rejected: { label: "İptal reddedildi", tone: "warn" },
};
const FILTERS = [["", "Tümü"], ["error", "Hata"], ["pending", "Bekliyor"], ["issued", "Kesildi"], ["cancel_rejected", "İptal reddedildi"], ["cancelled", "İptal"]] as const;
const GIB: Record<string, { label: string; tone: "neutral" | "ok" | "warn" | "bad" | "brand" }> = {
  hazir: { label: "Zarf bekliyor", tone: "neutral" }, zarf: { label: "Zarf bekliyor", tone: "neutral" }, gonderildi: { label: "GİB'de", tone: "brand" }, iletildi: { label: "Alıcıya iletildi", tone: "brand" },
  kabul: { label: "Kabul edildi", tone: "ok" }, red: { label: "Reddedildi", tone: "bad" },
};
const dt = (d: Date) => d.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" });
const seg = (on: boolean) => `rounded-lg border px-3 py-2 text-sm ${on ? "border-brand bg-brand-soft font-medium text-brand" : "border-line hover:bg-surface-2"}`;

export default async function Mali({ searchParams }: { searchParams: Promise<{ sekme?: string; durum?: string }> }) {
  const a = await requireAdmin();
  const q = await searchParams;
  const tab = q.sekme === "belgeler" ? "belgeler" : q.sekme === "muhasebe" ? "muhasebe" : "ayarlar";
  const { year, month } = currentIstMonth();
  const durum = FILTERS.some(([v]) => v === q.durum) ? (q.durum as (typeof schema.fiscalDocStatus.enumValues)[number]) : "";
  const D = schema.fiscalDocuments;
  const [[t], [fs, counts, docs]] = await Promise.all([
    getDb().select({ taxId: schema.tenants.taxId, taxOffice: schema.tenants.taxOffice, address: schema.tenants.address }).from(schema.tenants).where(eq(schema.tenants.id, a.tenantId)),
    withTenant(a.tenantId, (tx) => Promise.all([
      tx.select().from(schema.fiscalSettings).then((r) => r[0]),
      tx.select({ status: D.status, n: sql<number>`count(*)::int` }).from(D).groupBy(D.status),
      tab === "belgeler"
        ? tx.select({ id: D.id, status: D.status, number: D.number, buyer: D.buyer, token: D.token, lastError: D.lastError, attempts: D.attempts, emailSentAt: D.emailSentAt, createdAt: D.createdAt, receiptNo: schema.sales.receiptNo, total: schema.sales.total, kind: D.kind, gibStatus: D.gibStatus })
          .from(D).innerJoin(schema.sales, eq(schema.sales.id, D.saleId)).where(durum ? and(eq(D.status, durum)) : undefined).orderBy(desc(D.createdAt)).limit(200)
        : Promise.resolve([]),
    ])),
  ]);
  const E = schema.fiscalEnvelopes;
  const envelopes = tab === "belgeler"
    ? await withTenant(a.tenantId, (tx) =>
        tx.select({ id: E.id, ettn: E.ettn, status: E.status, sentAt: E.sentAt, respondedAt: E.respondedAt, lastError: E.lastError, n: sql<number>`(select count(*)::int from fiscal_documents d where d.envelope_id = ${E.id})` })
          .from(E).orderBy(desc(E.createdAt)).limit(20))
    : [];
  const R = schema.fiscalRefunds;
  const refunds = docs.length ? await withTenant(a.tenantId, (tx) => tx.select({ id: R.id, docId: R.fiscalDocId, kind: R.kind, resolvedAt: R.resolvedAt, no: R.buyerInvoiceNo }).from(R).where(inArray(R.fiscalDocId, docs.map((d) => d.id))).orderBy(R.createdAt)) : [];
  const n = (s: string) => counts.find((c) => c.status === s)?.n ?? 0;
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const fake = (fs?.provider ?? "fake-earsiv") === "fake-earsiv";
  const blockEarsiv = fake && fakeProvidersBlocked();
  return (
    <>
      <PageHeader title="Mali belge" desc="Bilgi fişi ya da e-Arşiv fatura. Kesilemeyen belgeler otomatik yeniden denenir; tam iade edilen faturalar iptal edilir, kısmi iadede iade tutanağı düzenlenir." />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link href="/yonetim/mali" className={seg(tab === "ayarlar")}>Ayarlar</Link>
        <Link href="/yonetim/mali?sekme=belgeler" className={seg(tab === "belgeler")}>Belgeler</Link>
        <Link href="/yonetim/mali?sekme=muhasebe" className={seg(tab === "muhasebe")}>Muhasebe</Link>
        {n("error") > 0 && <Link href="/yonetim/mali?sekme=belgeler&durum=error"><Badge tone="bad">{n("error")} hata</Badge></Link>}
        {n("cancel_rejected") > 0 && <Link href="/yonetim/mali?sekme=belgeler&durum=cancel_rejected"><Badge tone="warn">{n("cancel_rejected")} iptal reddedildi</Badge></Link>}
      </div>
      {tab === "muhasebe" ? (
        <Card className="max-w-xl p-5">
          <h2 className="font-semibold">Muhasebe programına aktar</h2>
          <p className="mt-1 text-sm text-muted">Ayın yevmiye fişleri: gün sonu POS satışları, e-Arşiv cari satışları, iadeler ve alımlar. Alım satırlarında KDV ayrıştırması fişte bulunmadığından genel toplam 153’e yazılır; mizanı muhasebeciniz eşler. e-Defter çıktısı entegratör ön verisidir, GİB imzası kapsamaz.</p>
          <form method="get" action="/api/yonetim/muhasebe" className="mt-4 flex flex-wrap items-end gap-3">
            <label className="text-sm"><span className="block text-xs text-muted">Ay</span>
              <input type="month" name="aylik" required defaultValue={`${year}-${String(month).padStart(2, "0")}`} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm" />
            </label>
            <label className="text-sm"><span className="block text-xs text-muted">Format</span>
              <select name="format" className="rounded-lg border border-line bg-surface px-3 py-2 text-sm">
                <option value="parasut">Paraşüt</option>
                <option value="logo">Logo</option>
                <option value="mikro">Mikro</option>
                <option value="edefter">e-Defter yevmiye (ön veri)</option>
              </select>
            </label>
            <button className="press inline-flex min-h-11 items-center rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">İndir</button>
          </form>
        </Card>
      ) : tab === "ayarlar" ? (
        <Card className="p-5">
          <FiscalSettingsForm fake={fake} blockEarsiv={blockEarsiv} channels={a.vertical === "market" ? ["kasa"] : FISCAL_CHANNELS}
            initial={{ taxId: t?.taxId ?? "", taxOffice: t?.taxOffice ?? "", address: t?.address ?? "", series: fs?.series ?? "CBP", modes: { ...DEFAULT_MODES, ...fs?.channelModes }, fakeFail: fs?.fakeFail ?? false }}
            okc={fs?.okcProvider ? { provider: fs.okcProvider, serial: fs.okcSerial ?? "", hasKey: Boolean(fs.okcApiKey), apiUrl: fs.okcApiUrl } : null} />
        </Card>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-1" role="group" aria-label="Durum">
            {FILTERS.map(([v, l]) => <Link key={v} href={`/yonetim/mali?sekme=belgeler${v ? `&durum=${v}` : ""}`} aria-pressed={durum === v} className={seg(durum === v)}>{l}</Link>)}
          </div>
          {envelopes.length > 0 && (
            <Card className="mb-4 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-semibold">e-Fatura zarfları</h2>
                <span className="text-sm text-muted">VKN&apos;li alıcılara kesilen belgeler zarfla GİB&apos;e gider; alıcı cevabı (kabul/red) otomatik sorgulanır.</span>
                <form action={queryEnvelopes} className="ml-auto"><button className="press inline-flex min-h-11 items-center rounded-lg border border-line px-4 py-2 text-sm font-medium hover:bg-surface-2">Şimdi sorgula</button></form>
              </div>
              <div className="mt-3 divide-y divide-line text-sm">
                {envelopes.map((e) => (
                  <div key={e.id} className="flex flex-wrap items-center gap-3 py-2">
                    <Badge tone={GIB[e.status].tone}>{GIB[e.status].label}</Badge>
                    <span className="font-mono text-xs text-muted">{e.ettn.slice(0, 8)}…</span>
                    <span className="text-muted">{e.n} belge</span>
                    {e.sentAt && <span className="text-xs text-muted">gönderim {dt(e.sentAt)}</span>}
                    {e.respondedAt && <span className="text-xs text-muted">cevap {dt(e.respondedAt)}</span>}
                    {e.lastError && <span className="text-xs text-bad">{e.lastError}</span>}
                  </div>
                ))}
              </div>
            </Card>
          )}
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
                        {d.kind === "efatura" && d.gibStatus && <div className="mt-1"><Badge tone={GIB[d.gibStatus]?.tone ?? "neutral"}>{GIB[d.gibStatus]?.label ?? d.gibStatus}</Badge></div>}
                        {d.lastError && <div className="mt-1 max-w-56 text-xs text-muted">{d.lastError}{d.status === "error" ? ` (${d.attempts}. deneme)` : ""}</div>}
                        {refunds.filter((r) => r.docId === d.id).map((r) => (
                          <Link key={r.id} href={`/yonetim/mali/iade/${r.id}`} className="mt-1 block text-xs text-brand hover:underline">
                            {r.kind === "tutanak" ? "İade tutanağı" : r.resolvedAt ? `Alıcı iade faturası ${r.no}` : "Alıcı iade faturası bekleniyor"}
                          </Link>
                        ))}</td>
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
