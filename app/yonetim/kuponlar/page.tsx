import Link from "next/link";
import { count, desc, ilike } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { createCoupon, setCouponStatus } from "@/lib/admin/loyalty-actions";
import { CouponCreateForm } from "@/components/admin/CouponCreatePending";
import { Badge, buttonClass, Card, Input, PageHeader } from "@/components/ui";
import { moneyFormatter, tenantCurrency } from "@/lib/admin/currency";
import { currencySymbol } from "@/lib/core/money";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;

const kindLabel = { yuzde: "Yüzde", tutar: "Tutar", teslimat: "Teslimat bedava" } as const;
const valueLabel = (c: typeof schema.coupons.$inferSelect, money: (k: number) => string) =>
  c.kind === "yuzde" ? `%${c.value}` : c.kind === "tutar" ? money(c.value) : "kargo";

export default async function Kuponlar({ searchParams }: { searchParams: Promise<{ ok?: string; hata?: string; q?: string; page?: string }> }) {
  const a = await requireAdmin();
  const money = await moneyFormatter(a.tenantId);
  const currency = await tenantCurrency(a.tenantId);
  const unit = currencySymbol(currency);
  const { ok, hata, q = "", page } = await searchParams;
  const term = q.trim().slice(0, 40);
  const literalTerm = term.replace(/[\\%_]/g, (char) => `\\${char}`);
  const requestedPage = Number(page);
  const pageNo = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const { rows, total } = await withTenant(a.tenantId, async (tx) => {
    const where = term ? ilike(schema.coupons.code, `%${literalTerm}%`) : undefined;
    const [{ total }] = await tx.select({ total: count() }).from(schema.coupons).where(where);
    const safePage = Math.min(pageNo, Math.max(1, Math.ceil(total / PAGE_SIZE)));
    const rows = await tx.select().from(schema.coupons).where(where).orderBy(desc(schema.coupons.createdAt)).limit(PAGE_SIZE).offset((safePage - 1) * PAGE_SIZE);
    return { rows, total };
  });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(pageNo, pageCount);
  const firstItem = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const lastItem = Math.min(currentPage * PAGE_SIZE, total);
  return (
    <>
      <PageHeader title="Kuponlar" desc="Kod, sepette indirime dönüşür: yüzde, sabit tutar ya da teslimat bedava. Kullanımlar satış anında kayda geçer; bir satışta bir kupon." />
      {ok && <div role="status" aria-live="polite" className="mb-6 rounded-[14px] border border-ok/30 bg-ok-soft px-4 py-3 text-sm text-ok">Kaydedildi.</div>}
      {hata && <div role="alert" aria-live="assertive" className="mb-6 rounded-[14px] border border-bad/30 bg-bad-soft px-4 py-3 text-sm text-bad">Eksik ya da geçersiz bilgi — kontrol edip yeniden deneyin.</div>}
      <section aria-label="Yeni kupon" className="mb-8">
        <Card className="p-5">
          <CouponCreateForm action={createCoupon} unit={unit} />
        </Card>
      </section>
      <form className="mb-4 flex flex-wrap gap-2">
        <Input name="q" defaultValue={term} placeholder="Kupon kodu ara" aria-label="Kupon kodu ara" className="min-w-48 flex-1 sm:max-w-sm" />
        <button className={buttonClass("secondary")}>Ara</button>
        {term && <Link href="/yonetim/kuponlar" className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm underline outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60">Aramayı temizle</Link>}
      </form>
      {rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">{term ? "Bu kodla eşleşen kupon yok." : "Henüz kupon yok. Yukarıdan ilk kuponu oluşturun."}</Card>
      ) : (
        <>
        <p className="mb-3 text-sm text-muted">{firstItem}–{lastItem} / {total} kupon{term ? " eşleşmesi" : ""}</p>
        <Card className="divide-y divide-line">
          {rows.map((c) => (
            <div key={c.id} className="flex min-w-0 flex-wrap items-center gap-3 p-4">
              <span className="shrink-0 font-mono font-semibold">{c.code}</span>
              <Badge tone={c.status === "acik" ? "ok" : "neutral"}>{c.status === "acik" ? "açık" : "kapalı"}</Badge>
              <span className="min-w-0 flex-1 break-words text-sm">{kindLabel[c.kind]} · {valueLabel(c, money)}</span>
              {c.minSubtotal > 0 && <span className="shrink-0 text-sm text-muted">min {money(c.minSubtotal)}</span>}
              {c.maxDiscount !== null && <span className="shrink-0 text-sm text-muted">üst {money(c.maxDiscount)}</span>}
              {c.endsAt && <span className="shrink-0 text-sm text-muted">bitiş {c.endsAt.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" })}</span>}
              <span className="shrink-0 tabular text-sm text-muted">
                {c.usedCount}{c.usageLimit !== null ? ` / ${c.usageLimit}` : ""} kullanım
              </span>
              <form action={setCouponStatus} className="ml-auto shrink-0">
                <input type="hidden" name="couponId" value={c.id} />
                <input type="hidden" name="status" value={c.status === "acik" ? "kapali" : "acik"} />
                <input type="hidden" name="q" value={term} />
                <input type="hidden" name="page" value={currentPage} />
                <button className="inline-flex min-h-11 items-center rounded-lg px-2.5 text-sm text-brand outline-none hover:bg-brand-soft hover:underline focus-visible:ring-4 focus-visible:ring-brand-ring/60">{c.status === "acik" ? "Kapat" : "Aç"}</button>
              </form>
            </div>
          ))}
        </Card>
        {pageCount > 1 && <nav aria-label="Kupon sonuç sayfaları" className="mt-4 flex items-center justify-between gap-3">
          {currentPage > 1 ? <Link href={`/yonetim/kuponlar?q=${encodeURIComponent(term)}&page=${currentPage - 1}`} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm underline outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60">Önceki</Link> : <span />}
          <span className="text-sm text-muted">Sayfa {currentPage} / {pageCount}</span>
          {currentPage < pageCount ? <Link href={`/yonetim/kuponlar?q=${encodeURIComponent(term)}&page=${currentPage + 1}`} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm underline outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60">Sonraki</Link> : <span />}
        </nav>}
        </>
      )}
      <p className="mt-4 text-xs text-muted">Kuponun sepette işlenmesi kasa güncellemesine bağlıdır; bu sayfa yönetim tarafını kapsar.</p>
    </>
  );
}
