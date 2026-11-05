import Link from "next/link";
import { and, count, desc, eq, gte, ilike, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { seesAllStores } from "@/lib/core/access";
import { deleteAddress } from "@/lib/admin/delivery-actions";
import { formatPhone, normalizePhone } from "@/lib/core/delivery";
import { normalizeSearchText } from "@/lib/core/search";
import { CustomerForm } from "@/components/admin/DeliveryForms";
import { ConfirmActionForm } from "@/components/admin/ConfirmActionForm";
import { buttonClass, Card, Empty, Input, PageHeader } from "@/components/ui";
import { HUBS, visibleChildren } from "../nav-data";
import { navContext } from "../_hub/context";
import { HubBar } from "../_hub/Hub";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;

export default async function Musteriler({ searchParams }: { searchParams: Promise<{ q?: string; id?: string; page?: string }> }) {
  const a = await requireAdmin();
  if (!seesAllStores(a)) redirect("/yonetim");
  const { ctx } = await navContext();
  const { q: rawQuery = "", id, page } = await searchParams;
  const q = rawQuery.slice(0, 80);
  const requestedPage = Number(page);
  const pageNo = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const C = schema.customers, A = schema.customerAddresses, Z = schema.deliveryZones;
  const since = sql<Date>`now() - interval '30 days'`;
  const { rows, addrs, zones, growth, filteredTotal } = await withTenant(a.tenantId, async (tx) => {
    const phone = normalizePhone(q);
    const term = q.trim();
    const literalTerm = term.replace(/[\\%_]/g, (char) => `\\${char}`);
    const normalizedName = normalizeSearchText(term);
    const literalName = normalizedName.replace(/[\\%_]/g, (char) => `\\${char}`);
    const normalizedNameMatch = normalizedName
      ? sql`lower(translate(${C.name}, 'ıİşŞğĞüÜöÖçÇ', 'iiSSGGUUOOCC')) like ${`%${literalName}%`}`
      : undefined;
    const where = term ? or(ilike(C.name, `%${literalTerm}%`), normalizedNameMatch, phone ? eq(C.phone, phone) : ilike(C.phone, `%${term.replace(/\D/g, "") || "-"}%`)) : undefined;
    const [{ filteredTotal }] = await tx.select({ filteredTotal: count() }).from(C).where(where);
    const safePage = Math.min(pageNo, Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE)));
    const rows = await tx.select().from(C).where(where).orderBy(sql`${C.lastOrderAt} desc nulls last`, desc(C.createdAt)).limit(PAGE_SIZE).offset((safePage - 1) * PAGE_SIZE);
    const addrs = rows.length ? await tx.select().from(A).where(and(inArray(A.customerId, rows.map((r) => r.id)), eq(A.deleted, false))).orderBy(desc(A.lastUsedAt)) : [];
    const zones = await tx.select({ id: Z.id, name: Z.name }).from(Z);
    const [total, active, dormant, fresh, consented, reachableDormant] = await Promise.all([
      tx.select({ n: count() }).from(C),
      tx.select({ n: count() }).from(C).where(gte(C.lastOrderAt, since)),
      tx.select({ n: count() }).from(C).where(and(isNotNull(C.lastOrderAt), lt(C.lastOrderAt, since))),
      tx.select({ n: count() }).from(C).where(gte(C.createdAt, since)),
      tx.select({ n: count() }).from(C).where(eq(C.marketingConsent, true)),
      tx.select({ n: count() }).from(C).where(and(eq(C.marketingConsent, true), isNotNull(C.lastOrderAt), lt(C.lastOrderAt, since))),
    ]);
    return { rows, addrs, zones, filteredTotal, growth: { total: total[0]?.n ?? 0, active: active[0]?.n ?? 0, dormant: dormant[0]?.n ?? 0, fresh: fresh[0]?.n ?? 0, consented: consented[0]?.n ?? 0, reachableDormant: reachableDormant[0]?.n ?? 0 } };
  });
  const pageCount = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));
  const currentPage = Math.min(pageNo, pageCount);
  const firstItem = filteredTotal === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const lastItem = Math.min(currentPage * PAGE_SIZE, filteredTotal);
  return (
    <>
      <PageHeader title="Müşteriler" desc="Paket siparişlerinden kendiliğinden oluşur: telefon numarası müşteriyi, yeni adres adres defterini doldurur." />
      <HubBar items={visibleChildren(HUBS.find((h) => h.href === "/yonetim/musteriler")!, ctx).filter((i) => i.href !== "/yonetim/musteriler")} />
      <section aria-label="Müşteri büyüme özeti" className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Toplam müşteri", growth.total, "Telefonu kayıtlı müşteri"],
          ["Son 30 günde aktif", growth.active, "Tekrar sipariş fırsatı"],
          ["Son 30 günde yeni", growth.fresh, "İlk sipariş sonrası takip"],
          ["30 gündür gelmeyen", growth.dormant, "Geri kazanma listesi"],
          ["Kampanyaya uygun", growth.consented, "Açık iletişim izni"],
        ].map(([label, value, hint]) => (
          <div key={label} className="rounded-[14px] border border-line bg-surface p-4 shadow-card">
            <div className="text-sm text-muted">{label}</div>
            <div className="mt-1 text-2xl font-semibold tabular">{value}</div>
            <div className="mt-1 text-xs text-muted">{hint}</div>
          </div>
        ))}
      </section>
      {growth.dormant > 0 && <div className="mb-6 rounded-[14px] border border-brand/20 bg-brand-soft px-4 py-3 text-sm text-ink-2"><b>Bugünün satış fırsatı:</b> {growth.dormant} müşteriyi geri kazanma listesine al. İletişim izni bulunan hedef sayısı şu an <b>{growth.reachableDormant}</b>; kampanya gönderimi açıldığında yalnızca bu grup kullanılacak.</div>}
      <form role="search" className="mb-6 flex flex-wrap gap-2"><Input name="q" defaultValue={q} maxLength={80} placeholder="Ad ya da telefon" aria-label="Müşteri ara" className="min-w-48 flex-1 sm:max-w-sm" /><button className={buttonClass("secondary")}>Ara</button></form>
      {rows.length === 0 ? <Empty action={q.trim() ? <Link href="/yonetim/musteriler" className="inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-3 font-medium text-brand outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60">Aramayı temizle</Link> : undefined}>{q ? "Eşleşen müşteri yok." : "Henüz müşteri yok. İlk paket siparişiyle oluşur."}</Empty> : (
        <>
        <p className="mb-3 text-sm text-muted">{firstItem}–{lastItem} / {filteredTotal} müşteri{q.trim() ? " eşleşmesi" : ""}</p>
        <Card className="divide-y divide-line">
          {rows.map((c) => {
            const phone = normalizePhone(c.phone);
            return (
            <div key={c.id} className="p-4">
              <div className="flex min-w-0 flex-wrap items-baseline gap-3">
                <span className="min-w-0 max-w-full break-words font-medium">{c.name}</span>
                {phone ? <a href={`tel:+${phone}`} aria-label={`Ara ${c.name}, ${formatPhone(c.phone)}`} className="inline-flex min-h-11 items-center tabular text-sm text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">{formatPhone(c.phone)}</a> : <span className="shrink-0 tabular text-sm text-muted">{c.phone}</span>}
                {c.marketingConsent && <span className="rounded-md bg-ok-soft px-2 py-0.5 text-xs text-ok">iletişim izni</span>}
                {c.lastOrderAt && <span className="shrink-0 text-xs text-muted">son sipariş {c.lastOrderAt.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" })}</span>}
                <Link href={id === c.id ? `/yonetim/musteriler?q=${encodeURIComponent(q)}&page=${currentPage}` : `/yonetim/musteriler?q=${encodeURIComponent(q)}&page=${currentPage}&id=${c.id}`} aria-label={id === c.id ? `Kapat müşteri ayrıntılarını: ${c.name}` : `Düzenle: ${c.name}`} className="ml-auto inline-flex min-h-11 shrink-0 items-center rounded-lg px-2 text-sm font-medium text-brand outline-none hover:bg-brand-soft hover:underline focus-visible:ring-4 focus-visible:ring-brand-ring/60">{id === c.id ? "Kapat" : "Düzenle"}</Link>
              </div>
              <ul className="mt-1 space-y-0.5 text-sm text-ink-2">
                    {addrs.filter((x) => x.customerId === c.id).map((x) => (
                  <li key={x.id} className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 flex-1 break-words">{x.address}{x.directions ? ` · ${x.directions}` : ""}{x.zoneId ? ` · ${zones.find((z) => z.id === x.zoneId)?.name ?? ""}` : ""}</span>
                    {id === c.id && <ConfirmActionForm action={deleteAddress.bind(null, x.id)} ariaLabel={`Adresi sil: ${x.address}`} label="Sil" prompt="Bu kayıtlı müşteri adresi silinecek. Devam etmek istiyor musunuz?" className={`${buttonClass("danger", "sm")} shrink-0`} />}
                  </li>
                ))}
              </ul>
              {id === c.id && <div className="mt-3"><CustomerForm initial={c} /></div>}
            </div>
            );
          })}
        </Card>
        {pageCount > 1 && <nav aria-label="Müşteri sonuç sayfaları" className="mt-4 flex items-center justify-between gap-3">
          {currentPage > 1 ? <Link href={`/yonetim/musteriler?q=${encodeURIComponent(q)}&page=${currentPage - 1}`} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm underline outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60">Önceki</Link> : <span />}
          <span className="text-sm text-muted">Sayfa {currentPage} / {pageCount}</span>
          {currentPage < pageCount ? <Link href={`/yonetim/musteriler?q=${encodeURIComponent(q)}&page=${currentPage + 1}`} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm underline outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60">Sonraki</Link> : <span />}
        </nav>}
        </>
      )}
    </>
  );
}
