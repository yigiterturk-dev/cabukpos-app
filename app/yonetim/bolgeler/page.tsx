import { asc, desc } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { toggleZone } from "@/lib/admin/delivery-actions";
import { ZoneForm } from "@/components/admin/DeliveryForms";
import { Badge, Card, Empty, PageHeader, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Bolgeler() {
  const a = await requireAdmin();
  const Z = schema.deliveryZones;
  const zones = await withTenant(a.tenantId, (tx) => tx.select().from(Z).orderBy(desc(Z.active), asc(Z.sort), asc(Z.name)));
  return (
    <>
      <PageHeader title="Teslimat bölgeleri" desc="Paket siparişte adres bir bölgeye bağlanır: paket ücreti otomatik eklenir, asgari tutarın altında kasada uyarı çıkar." />
      <div className="mb-6"><Panel title="Bölge ekle"><ZoneForm /></Panel></div>
      {zones.length === 0 ? <Empty>Henüz bölge yok. Bölgesiz paket siparişinde ücret eklenmez.</Empty> : (
        <Card className="divide-y divide-line">
          {zones.map((z) => (
            <div key={z.id} className={`flex flex-wrap items-end gap-3 p-4 ${z.active ? "" : "opacity-60"}`}>
              <ZoneForm initial={z} />
              <div className="ml-auto flex shrink-0 flex-wrap items-center gap-3">
                {!z.active && <Badge>Pasif</Badge>}
                <form action={toggleZone.bind(null, z.id, !z.active)}><button className="inline-flex min-h-10 items-center rounded-lg px-2.5 text-sm text-muted outline-none hover:bg-surface-3 hover:text-ink focus-visible:ring-4 focus-visible:ring-brand-ring/60">{z.active ? "Pasifleştir" : "Aktifleştir"}</button></form>
              </div>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
