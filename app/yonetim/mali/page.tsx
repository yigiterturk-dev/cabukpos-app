import Link from "next/link";
import { headers } from "next/headers";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { seesAllStores } from "@/lib/core/access";
import { DEFAULT_MODES, FISCAL_CHANNELS } from "@/lib/core/fiscal";
import { moneyFormatter } from "@/lib/admin/currency";
import { FiscalRowActions, FiscalSettingsForm, OkcZReportForm } from "@/components/admin/FiscalForms";
import { EnvelopeQueryForm } from "@/components/admin/EnvelopeQueryForm";
import { queryEnvelopes } from "@/lib/admin/fiscal-actions";
import { currentIstMonth } from "@/lib/admin/accounting";
import { Badge, buttonClass, Card, Empty, PageHeader, TABLE_HEAD } from "@/components/ui";
import { HorizontalScrollRegion } from "@/components/HorizontalScrollRegion";
import { Select } from "@/components/Select";
import { fakeProvidersBlocked } from "@/lib/fake-providers";

export const dynamic = "force-dynamic";
const DOC_PAGE_SIZE = 50;

const STATUS: Record<string, { label: string; tone: "neutral" | "ok" | "warn" | "bad" | "brand" }> = {
  pending: { label: "Bekliyor", tone: "neutral" }, issued: { label: "Kesildi", tone: "ok" }, error: { label: "Hata", tone: "bad" },
  cancelled: { label: "İptal", tone: "neutral" }, cancel_rejected: { label: "İptal reddedildi", tone: "warn" },
};
const FILTERS = [["", "Tümü"], ["oncelik", "İşlem gerekli"], ["error", "Hata"], ["pending", "Bekliyor"], ["issued", "Kesildi"], ["cancel_rejected", "İptal reddedildi"], ["cancelled", "İptal"]] as const;
const GIB: Record<string, { label: string; tone: "neutral" | "ok" | "warn" | "bad" | "brand" }> = {
  hazir: { label: "Zarf bekliyor", tone: "neutral" }, zarf: { label: "Zarf bekliyor", tone: "neutral" }, gonderildi: { label: "GİB'de", tone: "brand" }, iletildi: { label: "Alıcıya iletildi", tone: "brand" },
  kabul: { label: "Kabul edildi", tone: "ok" }, red: { label: "Reddedildi", tone: "bad" },
};
const dt = (d: Date) => d.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" });
const seg = (on: boolean) => `inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${on ? "border-brand bg-brand-soft font-medium text-brand" : "border-line text-ink-2 hover:bg-surface-2"}`;

export default async function Mali({ searchParams }: { searchParams: Promise<{ sekme?: string; durum?: string; page?: string }> }) {
  const a = await requireAdmin();
  if (!seesAllStores(a)) redirect("/yonetim");
  const money = await moneyFormatter(a.tenantId);
  const q = await searchParams;
  const requestedPage = Number(q.page);
  const pageNo = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const tab = q.sekme === "belgeler" ? "belgeler" : q.sekme === "muhasebe" ? "muhasebe" : "ayarlar";
  const { year, month } = currentIstMonth();
  const durum = FILTERS.some(([v]) => v === q.durum) ? q.durum ?? "" : "";
  const D = schema.fiscalDocuments;
  const [[t], [fs, counts, documentResult]] = await Promise.all([
    getDb().select({ taxId: schema.tenants.taxId, taxOffice: schema.tenants.taxOffice, address: schema.tenants.address }).from(schema.tenants).where(eq(schema.tenants.id, a.tenantId)),
    withTenant(a.tenantId, (tx) => Promise.all([
      tx.select().from(schema.fiscalSettings).then((r) => r[0]),
      tx.select({ status: D.status, n: sql<number>`count(*)::int` }).from(D).groupBy(D.status),
      tab === "belgeler"
        ? (async () => {
            const where = durum === "oncelik"
              ? inArray(D.status, ["error", "cancel_rejected"])
              : durum ? and(eq(D.status, durum as (typeof schema.fiscalDocStatus.enumValues)[number])) : undefined;
            const [{ total }] = await tx.select({ total: count() }).from(D).where(where);
            const safePage = Math.min(pageNo, Math.max(1, Math.ceil(total / DOC_PAGE_SIZE)));
            const rows = await tx.select({ id: D.id, status: D.status, number: D.number, buyer: D.buyer, token: D.token, lastError: D.lastError, attempts: D.attempts, emailSentAt: D.emailSentAt, createdAt: D.createdAt, receiptNo: schema.sales.receiptNo, total: schema.sales.total, kind: D.kind, gibStatus: D.gibStatus })
              .from(D).innerJoin(schema.sales, eq(schema.sales.id, D.saleId)).where(where).orderBy(desc(D.createdAt)).limit(DOC_PAGE_SIZE).offset((safePage - 1) * DOC_PAGE_SIZE);
            return { rows, total };
          })()
        : Promise.resolve({ rows: [], total: 0 }),
    ])),
  ]);
  const docs = documentResult.rows;
  const docTotal = documentResult.total;
  const docPageCount = Math.max(1, Math.ceil(docTotal / DOC_PAGE_SIZE));
  const currentDocPage = Math.min(pageNo, docPageCount);
  const firstDoc = docTotal === 0 ? 0 : (currentDocPage - 1) * DOC_PAGE_SIZE + 1;
  const lastDoc = Math.min(currentDocPage * DOC_PAGE_SIZE, docTotal);
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
      <PageHeader title="Mali belgeler" desc="Bilgi fişi ya da e-Arşiv fatura. Kesilemeyen belgeler otomatik yeniden denenir; tam iade edilen faturalar iptal edilir, kısmi iadede iade tutanağı düzenlenir." />
      <div className="-mx-1 mb-5 flex flex-wrap items-center gap-2 px-1">
        <Link href="/yonetim/mali" aria-current={tab === "ayarlar" ? "page" : undefined} className={seg(tab === "ayarlar")}>Ayarlar</Link>
        <Link href="/yonetim/mali?sekme=belgeler" aria-current={tab === "belgeler" ? "page" : undefined} className={seg(tab === "belgeler")}>Belgeler</Link>
        <Link href="/yonetim/mali?sekme=muhasebe" aria-current={tab === "muhasebe" ? "page" : undefined} className={seg(tab === "muhasebe")}>Muhasebe</Link>
        {n("error") > 0 && <Link href="/yonetim/mali?sekme=belgeler&durum=error"><Badge tone="bad">{n("error")} hata</Badge></Link>}
        {n("cancel_rejected") > 0 && <Link href="/yonetim/mali?sekme=belgeler&durum=cancel_rejected"><Badge tone="warn">{n("cancel_rejected")} iptal reddedildi</Badge></Link>}
      </div>
      {tab === "muhasebe" ? (
        <Card className="max-w-xl p-5">
          <h2 className="font-semibold">Muhasebe programına aktar</h2>
          <p className="mt-1 text-sm text-muted">Ayın yevmiye fişleri: gün sonu POS satışları, e-Arşiv cari satışları, iadeler ve alımlar. Alım satırlarında KDV ayrıştırması fişte bulunmadığından genel toplam 153’e yazılır; mizanı muhasebeciniz eşler. e-Defter çıktısı entegratör ön verisidir, GİB imzası kapsamaz.</p>
          <form method="get" action="/api/yonetim/muhasebe" className="mt-4 flex flex-wrap items-end gap-3">
            <label className="text-sm"><span className="block text-xs text-muted">Ay</span>
              <input type="month" name="aylik" required defaultValue={`${year}-${String(month).padStart(2, "0")}`} className="min-h-11 rounded-[10px] border border-line bg-surface px-3 py-2 text-base outline-none focus:border-brand focus:ring-4 focus:ring-brand-ring/50 lg:text-sm" />
            </label>
            <label className="text-sm"><span className="block text-xs text-muted">Format</span>
              <Select ariaLabel="Muhasebe dışa aktarma formatı" name="format" defaultValue="parasut" options={[
                { value: "parasut", label: "Paraşüt" },
                { value: "logo", label: "Logo" },
                { value: "mikro", label: "Mikro" },
                { value: "edefter", label: "e-Defter yevmiye (ön veri)" },
              ]} />
            </label>
            <button className={buttonClass("primary")}>İndir</button>
          </form>
        </Card>
      ) : tab === "ayarlar" ? (
        <>
          <Card className="p-5">
            <FiscalSettingsForm fake={fake} blockEarsiv={blockEarsiv} channels={a.vertical === "market" ? ["kasa"] : FISCAL_CHANNELS}
              initial={{ taxId: t?.taxId ?? "", taxOffice: t?.taxOffice ?? "", address: t?.address ?? "", series: fs?.series ?? "CBP", modes: { ...DEFAULT_MODES, ...fs?.channelModes }, fakeFail: fs?.fakeFail ?? false }}
              okc={fs?.okcProvider ? { provider: fs.okcProvider, serial: fs.okcSerial ?? "", hasKey: Boolean(fs.okcApiKey), apiUrl: fs.okcApiUrl } : null} />
          </Card>
          {fs?.okcProvider && (
            <Card className="mt-5 p-5">
              <OkcZReportForm />
            </Card>
          )}
        </>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-1" role="group" aria-label="Durum">
            {FILTERS.map(([v, l]) => <Link key={v} href={`/yonetim/mali?sekme=belgeler${v ? `&durum=${v}` : ""}`} aria-current={durum === v ? "page" : undefined} className={seg(durum === v)}>{l}</Link>)}
          </div>
          {envelopes.length > 0 && (
            <Card className="mb-4 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-semibold">En yeni 20 e-Fatura zarfı</h2>
                <span className="text-sm text-muted">VKN&apos;li alıcılara kesilen belgeler zarfla GİB&apos;e gider; alıcı cevabı (kabul/red) otomatik sorgulanır.</span>
                <EnvelopeQueryForm action={queryEnvelopes} />
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
          {docs.length === 0 ? <Empty action={<Link href={durum ? "/yonetim/mali?sekme=belgeler" : "/yonetim/mali"} className="inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-3 font-medium text-brand outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60">{durum ? "Tüm belgeleri göster" : "Mali ayarlara git"}</Link>}>{durum ? `${FILTERS.find(([v]) => v === durum)?.[1] ?? "Bu durumda"}: belge yok.` : "Belge yok. Mali ayarlar ve ilk satıştan sonra belgeler burada görünür."}</Empty> : (
            <>
            <p className="mb-3 text-sm text-muted">{firstDoc}–{lastDoc} / {docTotal} mali belge</p>
            <Card className="overflow-hidden lg:hidden">
              <ul aria-label="Mali belgeler" className="divide-y divide-line">
                {docs.map((d) => (
                  <li key={d.id} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><p className="break-words font-medium">{d.buyer.name}</p><p className="mt-1 text-xs text-muted">Fiş {d.receiptNo} · {dt(d.createdAt)}</p></div>
                      <p className="shrink-0 tabular-nums font-semibold">{money(d.total)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2"><Badge tone={STATUS[d.status].tone}>{STATUS[d.status].label}</Badge>{d.kind === "efatura" && d.gibStatus && <Badge tone={GIB[d.gibStatus]?.tone ?? "neutral"}>{GIB[d.gibStatus]?.label ?? d.gibStatus}</Badge>}</div>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                      <div><dt className="text-xs text-muted">VKN / TCKN</dt><dd className="break-words">{d.buyer.taxId || "—"}</dd></div>
                      <div><dt className="text-xs text-muted">E-posta</dt><dd>{!d.buyer.email ? "—" : d.emailSentAt ? "Gönderildi" : "Gönderilmedi"}</dd></div>
                      <div className="col-span-2"><dt className="text-xs text-muted">Belge numarası</dt><dd className="break-all font-mono text-xs">{d.number ?? "—"}</dd></div>
                    </dl>
                    {d.lastError && <p className="break-words rounded-lg bg-bad-soft p-3 text-sm text-bad">{d.lastError}{d.status === "error" ? ` (${d.attempts}. deneme)` : ""}</p>}
                    {refunds.filter((r) => r.docId === d.id).map((r) => (
                      <Link key={r.id} href={`/yonetim/mali/iade/${r.id}`} className="inline-flex min-h-11 w-fit items-center rounded px-1 text-sm text-brand underline-offset-2 outline-none hover:underline focus-visible:ring-4 focus-visible:ring-brand-ring/60">
                        {r.kind === "tutanak" ? "İade tutanağı" : r.resolvedAt ? `Alıcı iade faturası ${r.no}` : "Alıcı iade faturası bekleniyor"}
                      </Link>
                    ))}
                    <div className="border-t border-line pt-2"><FiscalRowActions id={d.id} status={d.status} canMail={!!d.buyer.email} url={`${origin}/f/${d.token}`} /></div>
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="hidden p-0 lg:block">
              <HorizontalScrollRegion label="Mali belgeler, yatay kaydırılabilir" className="rounded-2xl">
              <table aria-label="Mali belgeler" className="w-full min-w-[960px] text-sm">
                <thead className={TABLE_HEAD}><tr><th scope="col" className="px-4 py-2.5 font-medium">Tarih</th><th scope="col" className="px-4 py-2.5 font-medium">Fiş no</th><th scope="col" className="px-4 py-2.5 font-medium">Alıcı</th><th scope="col" className="px-4 py-2.5 text-right font-medium">Tutar</th><th scope="col" className="px-4 py-2.5 font-medium">Durum</th><th scope="col" className="px-4 py-2.5 font-medium">Numara</th><th scope="col" className="px-4 py-2.5 font-medium">E-posta</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {docs.map((d) => (
                    <tr key={d.id} className="align-top transition-colors hover:bg-surface-2" data-testid="fiscal-row">
                      <td className="whitespace-nowrap px-4 py-3">{dt(d.createdAt)}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono">{d.receiptNo}</td>
                      <td className="px-4 py-3">{d.buyer.name}<div className="text-xs text-muted">{d.buyer.taxId}</div></td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{money(d.total)}</td>
                      <td className="px-4 py-3"><Badge tone={STATUS[d.status].tone}>{STATUS[d.status].label}</Badge>
                        {d.kind === "efatura" && d.gibStatus && <div className="mt-1"><Badge tone={GIB[d.gibStatus]?.tone ?? "neutral"}>{GIB[d.gibStatus]?.label ?? d.gibStatus}</Badge></div>}
                        {d.lastError && <div className="mt-1 max-w-56 text-xs text-muted">{d.lastError}{d.status === "error" ? ` (${d.attempts}. deneme)` : ""}</div>}
                        {refunds.filter((r) => r.docId === d.id).map((r) => (
                          <Link key={r.id} href={`/yonetim/mali/iade/${r.id}`} className="mt-1 inline-flex min-h-11 w-fit items-center rounded px-1 text-xs text-brand outline-none hover:underline focus-visible:ring-4 focus-visible:ring-brand-ring/60">
                            {r.kind === "tutanak" ? "İade tutanağı" : r.resolvedAt ? `Alıcı iade faturası ${r.no}` : "Alıcı iade faturası bekleniyor"}
                          </Link>
                        ))}</td>
                      <td className="px-4 py-3 font-mono text-xs">{d.number ?? "—"}
                        <div className="mt-2"><FiscalRowActions id={d.id} status={d.status} canMail={!!d.buyer.email} url={`${origin}/f/${d.token}`} /></div></td>
                      <td className="px-4 py-3 text-xs">{!d.buyer.email ? "—" : d.emailSentAt ? "Gönderildi" : "Gönderilmedi"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </HorizontalScrollRegion>
            </Card>
            {docPageCount > 1 && <nav aria-label="Mali belgeler sayfaları" className="mt-4 flex items-center justify-between gap-3">
              {currentDocPage > 1 ? <Link href={`/yonetim/mali?sekme=belgeler${durum ? `&durum=${durum}` : ""}&page=${currentDocPage - 1}`} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm underline outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60">Önceki</Link> : <span />}
              <span className="text-sm text-muted">Sayfa {currentDocPage} / {docPageCount}</span>
              {currentDocPage < docPageCount ? <Link href={`/yonetim/mali?sekme=belgeler${durum ? `&durum=${durum}` : ""}&page=${currentDocPage + 1}`} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm underline outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60">Sonraki</Link> : <span />}
            </nav>}
            </>
          )}
        </>
      )}
    </>
  );
}
