import Link from "next/link";
import { count, desc, eq } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { createGiftCard, giftCardCancel, giftCardLoad } from "@/lib/admin/loyalty-actions";
import { ConfirmActionForm } from "@/components/admin/ConfirmActionForm";
import { GiftCardCreateForm, GiftCardLoadForm } from "@/components/admin/GiftCardFormsPending";
import { Badge, buttonClass, Card, PageHeader } from "@/components/ui";
import { moneyFormatter, tenantCurrency } from "@/lib/admin/currency";
import { currencySymbol } from "@/lib/core/money";

export const dynamic = "force-dynamic";

const statusTone = { aktif: "ok", bitti: "neutral", iptal: "bad" } as const;
const statusLabel = { aktif: "aktif", bitti: "bitti", iptal: "iptal" } as const;
const eventLabel: Record<string, string> = { yukleme: "Bakiye yükleme", iptal: "Kart iptali" };
const PAGE_SIZE = 50;
export default async function HediyeKarti({ searchParams }: { searchParams: Promise<{ ok?: string; hata?: string; id?: string; page?: string }> }) {
  const a = await requireAdmin();
  const money = await moneyFormatter(a.tenantId);
  const currency = await tenantCurrency(a.tenantId);
  const unit = currencySymbol(currency);
  const { ok, hata, id, page } = await searchParams;
  const requestedPage = Number(page);
  const pageNo = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const G = schema.giftCards;
  const { rows, events, total } = await withTenant(a.tenantId, async (tx) => {
    const [{ total }] = await tx.select({ total: count() }).from(G);
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const safePage = Math.min(pageNo, pageCount);
    const rows = await tx.select().from(G).orderBy(desc(G.createdAt)).limit(PAGE_SIZE).offset((safePage - 1) * PAGE_SIZE);
    const events = id
      ? await tx.select({ kind: schema.giftCardEvents.kind, amountKurus: schema.giftCardEvents.amountKurus, note: schema.giftCardEvents.note, createdAt: schema.giftCardEvents.createdAt }).from(schema.giftCardEvents).where(eq(schema.giftCardEvents.cardId, id)).orderBy(desc(schema.giftCardEvents.createdAt)).limit(20)
      : [];
    return { rows, events, total };
  });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(pageNo, pageCount);
  const firstItem = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const lastItem = Math.min(currentPage * PAGE_SIZE, total);
  return (
    <>
      <PageHeader title="Hediye kartı" desc="Önceden yüklü bakiye; kod, kasada ödeme yöntemi olarak harcanır. İptal edilen kartın kalan bakiyesi donar." />
      {ok && <div role="status" aria-live="polite" className="mb-6 rounded-[14px] border border-ok/30 bg-ok-soft px-4 py-3 text-sm text-ok">Kaydedildi.</div>}
      {hata && <div role="alert" aria-live="assertive" className="mb-6 rounded-[14px] border border-bad/30 bg-bad-soft px-4 py-3 text-sm text-bad">Eksik ya da geçersiz bilgi — kontrol edip yeniden deneyin.</div>}
      <section aria-label="Yeni hediye kartı" className="mb-8">
        <Card className="p-5">
          <GiftCardCreateForm action={createGiftCard} unit={unit} />
        </Card>
      </section>
      {rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">Henüz hediye kartı yok. Yukarıdan ilk kartı oluşturun.</Card>
      ) : (
        <>
        <p className="mb-3 text-sm text-muted">{firstItem}–{lastItem} / {total} hediye kartı</p>
        <Card className="divide-y divide-line">
          {rows.map((g) => (
            <div key={g.id} className="p-4">
              <div className="flex min-w-0 flex-wrap items-baseline gap-3">
                <span className="shrink-0 font-mono font-semibold">{g.code}</span>
                <Badge tone={statusTone[g.status]}>{statusLabel[g.status]}</Badge>
                <span className="shrink-0 tabular font-semibold">{money(g.balanceKurus)}</span>
                <span className="shrink-0 tabular text-sm text-muted">yüklenen {money(g.initialKurus)}</span>
                {g.expiresAt && <span className="shrink-0 text-sm text-muted">son {g.expiresAt.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" })}</span>}
                {g.note && <span className="min-w-0 flex-1 break-words text-sm text-muted">{g.note}</span>}
                {g.status === "aktif" && <Link href={id === g.id ? "/yonetim/hediyekarti" : `/yonetim/hediyekarti?id=${g.id}`} aria-label={id === g.id ? `${g.code} kart ayrıntılarını kapat` : `Yükle veya iptal et: ${g.code}`} className="ml-auto inline-flex min-h-11 shrink-0 items-center rounded-lg px-2.5 text-sm text-brand underline outline-none hover:bg-brand-soft focus-visible:ring-4 focus-visible:ring-brand-ring/60">{id === g.id ? "Kapat" : "Yükle / İptal"}</Link>}
              </div>
              {id === g.id && g.status === "aktif" && (
                <div className="mt-3">
                  <GiftCardLoadForm action={giftCardLoad} cardId={g.id} unit={unit} />
                  <ConfirmActionForm action={giftCardCancel} fields={{ cardId: g.id }} ariaLabel={`Hediye kartını iptal et: ${g.code}`} label="Kartı iptal et" prompt="Bu hediye kartı iptal edilecek ve kalan bakiye dondurulacak. Devam etmek istiyor musunuz?" className={buttonClass("danger", "sm")} />
                  <section aria-label={`${g.code} kart hareketleri`} className="mt-4">
                    <h3 className="text-sm font-semibold">Son hareketler</h3>
                    {events.length > 0 ? (
                      <ul className="mt-2 space-y-2 text-sm text-ink-2">
                        {events.map((e, i) => (
                          <li key={i} className="flex flex-wrap gap-x-3 gap-y-1">
                            <time className="tabular text-muted" dateTime={e.createdAt.toISOString()}>{e.createdAt.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}</time>
                            <span>{eventLabel[e.kind] ?? e.kind}</span>
                            {e.amountKurus !== 0 && <span className="tabular">{e.amountKurus > 0 ? "+" : "−"}{money(Math.abs(e.amountKurus))}</span>}
                            {e.note && <span className="min-w-0 break-words text-muted">{e.note}</span>}
                          </li>
                        ))}
                      </ul>
                    ) : <p className="mt-1 text-sm text-muted">Henüz bakiye hareketi yok.</p>}
                  </section>
                </div>
              )}
            </div>
          ))}
        </Card>
        {pageCount > 1 && <nav aria-label="Hediye kartı sayfaları" className="mt-4 flex items-center justify-between gap-3">
          {currentPage > 1 ? <Link href={`/yonetim/hediyekarti?page=${currentPage - 1}`} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm underline outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60">Önceki</Link> : <span />}
          <span className="text-sm text-muted">Sayfa {currentPage} / {pageCount}</span>
          {currentPage < pageCount ? <Link href={`/yonetim/hediyekarti?page=${currentPage + 1}`} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm underline outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60">Sonraki</Link> : <span />}
        </nav>}
        </>
      )}
    </>
  );
}
