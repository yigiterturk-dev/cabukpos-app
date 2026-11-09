import Link from "next/link";
import { asc, count, desc, eq, sql } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { seesAllStores } from "@/lib/core/access";
import { adjustPoints, saveLoyaltySettings } from "@/lib/admin/loyalty-actions";
import { LoyaltySettingsForm, PointsAdjustForm } from "@/components/admin/LoyaltyFormsPending";
import { ActionResult } from "@/components/admin/ActionResult";
import { moneyFormatter, tenantCurrency } from "@/lib/admin/currency";
import { currencySymbol } from "@/lib/core/money";
import { Card, Empty, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;
const eventLabel: Record<string, string> = { duzeltme: "Elle puan düzeltme", kazanma: "Puan kazanımı", harcama: "Puan harcama" };

export default async function Sadakat({ searchParams }: { searchParams: Promise<{ ok?: string; hata?: string; id?: string; page?: string }> }) {
  const a = await requireAdmin();
  if (!seesAllStores(a)) redirect("/yonetim");
  const money = await moneyFormatter(a.tenantId);
  const currency = await tenantCurrency(a.tenantId);
  const unit = currencySymbol(currency);
  const { ok, hata, id, page } = await searchParams;
  const requestedPage = Number(page);
  const pageNo = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const S = schema.loyaltySettings, E = schema.loyaltyEvents, C = schema.customers;
  const { settings, rows, events, total } = await withTenant(a.tenantId, async (tx) => {
    const [settings] = await tx.select().from(S).where(eq(S.tenantId, a.tenantId)).limit(1);
    const balance = sql<number>`coalesce(sum(${E.points}), 0)::int`.as("points");
    const customersWithPoints = tx
      .select({ customerId: C.id, name: C.name, phone: C.phone, points: balance })
      .from(C)
      .leftJoin(E, eq(E.customerId, C.id))
      .groupBy(C.id, C.name, C.phone)
      .having(sql`coalesce(sum(${E.points}), 0) <> 0`)
      .as("customers_with_points");
    const [{ total }] = await tx.select({ total: count() }).from(customersWithPoints);
    const safePage = Math.min(pageNo, Math.max(1, Math.ceil(total / PAGE_SIZE)));
    const rows = await tx.select().from(customersWithPoints).orderBy(desc(customersWithPoints.points), asc(customersWithPoints.name)).limit(PAGE_SIZE).offset((safePage - 1) * PAGE_SIZE);
    const events = id
      ? await tx.select({ kind: E.kind, points: E.points, note: E.note, createdAt: E.createdAt }).from(E).where(eq(E.customerId, id)).orderBy(desc(E.createdAt)).limit(20)
      : [];
    return { settings, rows, events, total };
  });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(pageNo, pageCount);
  const firstItem = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const lastItem = Math.min(currentPage * PAGE_SIZE, total);
  return (
    <>
      <PageHeader title="Puan programı" desc="Müşteri harcaması puan kazanır; puan, sonraki satışta indirim olarak harcanır. Satış anı kazanım/harcanma kasa güncellemesine bağlıdır." />
      {ok && <ActionResult kind="success">Kaydedildi.</ActionResult>}
      {hata && <ActionResult kind="error">Eksik ya da geçersiz bilgi — kontrol edip yeniden deneyin.</ActionResult>}
      <section aria-label="Puan programı ayarları" className="mb-8">
        <Card className="p-5">
          <LoyaltySettingsForm action={saveLoyaltySettings} settings={settings ?? null} unit={unit} />
        </Card>
      </section>
      {rows.length === 0 ? (
        <Empty>Puanı olan müşteri yok. Satışlarda puan kazanan müşteriler burada listelenir. <Link href="/kasa" className="font-medium text-brand underline underline-offset-2">Puan toplamak için kasada satış yapın</Link>.</Empty>
      ) : (
        <>
        <p className="mb-3 text-sm text-muted">{firstItem}–{lastItem} / {total} puan bakiyesi olan müşteri</p>
        <Card className="divide-y divide-line">
          {rows.map((r) => (
            <div key={r.customerId} className="p-4">
              <div className="flex min-w-0 flex-wrap items-baseline gap-3">
                <span className="min-w-0 break-words font-medium">{r.name}</span>
                <span className="shrink-0 tabular text-sm text-muted">{r.phone}</span>
                <span className="ml-auto shrink-0 tabular font-semibold text-brand">{r.points} puan</span>
                <Link href={id === r.customerId ? `/yonetim/sadakat?page=${currentPage}` : `/yonetim/sadakat?page=${currentPage}&id=${r.customerId}`} className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-2.5 text-sm text-brand underline outline-none hover:bg-brand-soft focus-visible:ring-4 focus-visible:ring-brand-ring/60">{id === r.customerId ? "Kapat" : "Puan işlemi"}</Link>
              </div>
              {id === r.customerId && (
                <div className="mt-3">
                  <PointsAdjustForm action={adjustPoints} customerId={r.customerId} />
                  {events.length > 0 ? (
                    <ul aria-label={`${r.name} puan hareketleri`} className="mt-2 space-y-2 text-sm text-ink-2">
                      {events.map((e, i) => (
                        <li key={i} className="flex flex-wrap gap-2">
                          <time className="tabular text-muted" dateTime={e.createdAt.toISOString()}>{e.createdAt.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}</time>
                          <span className={e.points >= 0 ? "text-ok" : "text-bad"}>{e.points >= 0 ? "+" : ""}{e.points}</span>
                          <span className="min-w-0 break-words">{eventLabel[e.kind] ?? e.kind}{e.note ? ` · ${e.note}` : ""}</span>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-2 text-sm text-muted">Henüz puan hareketi yok.</p>}
                </div>
              )}
            </div>
          ))}
        </Card>
        {pageCount > 1 && <nav aria-label="Sadakat müşterileri sayfaları" className="mt-4 flex items-center justify-between gap-3">
          {currentPage > 1 ? <Link href={`/yonetim/sadakat?page=${currentPage - 1}`} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm underline outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60">Önceki</Link> : <span />}
          <span className="text-sm text-muted">Sayfa {currentPage} / {pageCount}</span>
          {currentPage < pageCount ? <Link href={`/yonetim/sadakat?page=${currentPage + 1}`} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm underline outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60">Sonraki</Link> : <span />}
        </nav>}
        </>
      )}
      <p className="mt-4 text-xs text-muted">1 puan şu an {money(settings?.kurusPerRedeem ?? 100)} indirim demek. Kasa güncellemesi gelene kadar puan yalnız buradan elle düzeltilebilir.</p>
    </>
  );
}
