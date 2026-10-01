import Link from "next/link";
import { and, count, desc, eq, gte, ilike, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { deleteAddress } from "@/lib/admin/delivery-actions";
import { formatPhone, normalizePhone } from "@/lib/core/delivery";
import { CustomerForm } from "@/components/admin/DeliveryForms";
import { Card, Empty, Input, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Musteriler({ searchParams }: { searchParams: Promise<{ q?: string; id?: string }> }) {
  const a = await requireAdmin();
  const { q = "", id } = await searchParams;
  const C = schema.customers, A = schema.customerAddresses, Z = schema.deliveryZones;
  const since = sql<Date>`now() - interval '30 days'`;
  const { rows, addrs, zones, growth } = await withTenant(a.tenantId, async (tx) => {
    const phone = normalizePhone(q);
    const term = q.trim();
    const where = term ? or(ilike(C.name, `%${term.replace(/[%_]/g, "")}%`), phone ? eq(C.phone, phone) : ilike(C.phone, `%${term.replace(/\D/g, "") || "-"}%`)) : undefined;
    const rows = await tx.select().from(C).where(where).orderBy(desc(C.lastOrderAt)).limit(50);
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
    return { rows, addrs, zones, growth: { total: total[0]?.n ?? 0, active: active[0]?.n ?? 0, dormant: dormant[0]?.n ?? 0, fresh: fresh[0]?.n ?? 0, consented: consented[0]?.n ?? 0, reachableDormant: reachableDormant[0]?.n ?? 0 } };
  });
  return (
    <>
      <PageHeader title="Müşteriler" desc="Paket siparişlerinden kendiliğinden oluşur: telefon numarası müşteriyi, yeni adres adres defterini doldurur." />
      <section aria-label="Müşteri büyüme özeti" className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Toplam müşteri", growth.total, "Telefonu kayıtlı müşteri"],
          ["Son 30 günde aktif", growth.active, "Tekrar sipariş fırsatı"],
          ["Son 30 günde yeni", growth.fresh, "İlk sipariş sonrası takip"],
          ["30 gündür gelmeyen", growth.dormant, "Geri kazanma listesi"],
          ["Kampanyaya uygun", growth.consented, "Açık iletişim izni"],
        ].map(([label, value, hint]) => (
          <div key={label} className="rounded-[14px] border border-line bg-white p-4 shadow-card">
            <div className="text-sm text-muted">{label}</div>
            <div className="mt-1 text-2xl font-semibold tabular">{value}</div>
            <div className="mt-1 text-xs text-muted">{hint}</div>
          </div>
        ))}
      </section>
      {growth.dormant > 0 && <div className="mb-6 rounded-[14px] border border-brand/20 bg-brand-soft px-4 py-3 text-sm text-ink-2"><b>Bugünün satış fırsatı:</b> {growth.dormant} müşteriyi geri kazanma listesine al. İletişim izni bulunan hedef sayısı şu an <b>{growth.reachableDormant}</b>; kampanya gönderimi açıldığında yalnızca bu grup kullanılacak.</div>}
      <form className="mb-6 flex gap-2"><Input name="q" defaultValue={q} placeholder="Ad ya da telefon" aria-label="Müşteri ara" className="w-72" /><button className="rounded-lg border border-line px-4 text-sm">Ara</button></form>
      {rows.length === 0 ? <Empty>{q ? "Eşleşen müşteri yok." : "Henüz müşteri yok. İlk paket siparişiyle oluşur."}</Empty> : (
        <Card className="divide-y divide-line">
          {rows.map((c) => (
            <div key={c.id} className="p-4">
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="font-medium">{c.name}</span>
                <span className="tabular text-sm text-muted">{formatPhone(c.phone)}</span>
                {c.marketingConsent && <span className="rounded-md bg-ok-soft px-2 py-0.5 text-xs text-ok">iletişim izni</span>}
                {c.lastOrderAt && <span className="text-xs text-muted">son sipariş {c.lastOrderAt.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" })}</span>}
                <Link href={id === c.id ? `/yonetim/musteriler?q=${encodeURIComponent(q)}` : `/yonetim/musteriler?q=${encodeURIComponent(q)}&id=${c.id}`} className="ml-auto text-sm text-brand underline">{id === c.id ? "Kapat" : "Düzenle"}</Link>
              </div>
              <ul className="mt-1 space-y-0.5 text-sm text-ink-2">
                {addrs.filter((x) => x.customerId === c.id).map((x) => (
                  <li key={x.id} className="flex items-center gap-2">
                    <span>{x.address}{x.directions ? ` · ${x.directions}` : ""}{x.zoneId ? ` · ${zones.find((z) => z.id === x.zoneId)?.name ?? ""}` : ""}</span>
                    {id === c.id && <form action={deleteAddress.bind(null, x.id)}><button className="text-xs text-bad underline">Sil</button></form>}
                  </li>
                ))}
              </ul>
              {id === c.id && <div className="mt-3"><CustomerForm initial={c} /></div>}
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
