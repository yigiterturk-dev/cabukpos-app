import Link from "next/link";
import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
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
  const { rows, addrs, zones } = await withTenant(a.tenantId, async (tx) => {
    const phone = normalizePhone(q);
    const term = q.trim();
    const where = term ? or(ilike(C.name, `%${term.replace(/[%_]/g, "")}%`), phone ? eq(C.phone, phone) : ilike(C.phone, `%${term.replace(/\D/g, "") || "-"}%`)) : undefined;
    const rows = await tx.select().from(C).where(where).orderBy(desc(C.lastOrderAt)).limit(50);
    const addrs = rows.length ? await tx.select().from(A).where(and(inArray(A.customerId, rows.map((r) => r.id)), eq(A.deleted, false))).orderBy(desc(A.lastUsedAt)) : [];
    const zones = await tx.select({ id: Z.id, name: Z.name }).from(Z);
    return { rows, addrs, zones };
  });
  return (
    <>
      <PageHeader title="Müşteriler" desc="Paket siparişlerinden kendiliğinden oluşur: telefon numarası müşteriyi, yeni adres adres defterini doldurur." />
      <form className="mb-6 flex gap-2"><Input name="q" defaultValue={q} placeholder="Ad ya da telefon" aria-label="Müşteri ara" className="w-72" /><button className="rounded-lg border border-line px-4 text-sm">Ara</button></form>
      {rows.length === 0 ? <Empty>{q ? "Eşleşen müşteri yok." : "Henüz müşteri yok. İlk paket siparişiyle oluşur."}</Empty> : (
        <Card className="divide-y divide-line">
          {rows.map((c) => (
            <div key={c.id} className="p-4">
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="font-medium">{c.name}</span>
                <span className="tabular text-sm text-muted">{formatPhone(c.phone)}</span>
                {c.lastOrderAt && <span className="text-xs text-muted">son sipariş {c.lastOrderAt.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" })}</span>}
                <Link href={id === c.id ? `/yonetim/musteriler?q=${encodeURIComponent(q)}` : `/yonetim/musteriler?q=${encodeURIComponent(q)}&id=${c.id}`} className="ml-auto text-sm text-brand underline">{id === c.id ? "Kapat" : "Düzenle"}</Link>
              </div>
              <ul className="mt-1 space-y-0.5 text-sm text-stone-700">
                {addrs.filter((x) => x.customerId === c.id).map((x) => (
                  <li key={x.id} className="flex items-center gap-2">
                    <span>{x.address}{x.directions ? ` · ${x.directions}` : ""}{x.zoneId ? ` · ${zones.find((z) => z.id === x.zoneId)?.name ?? ""}` : ""}</span>
                    {id === c.id && <form action={deleteAddress.bind(null, x.id)}><button className="text-xs text-red-700 underline">Sil</button></form>}
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
