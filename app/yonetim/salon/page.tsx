import { asc } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { deleteArea, deleteTable } from "@/lib/admin/salon-actions";
import { AreaForm, SalonSetup, TablesForm } from "@/components/admin/SalonForms";
import { MasaGlyph } from "@/components/MasaGlyph";
import { Card, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Salon() {
  const a = await requireAdmin();
  const [areas, tables] = await withTenant(a.tenantId, (tx) => Promise.all([
    tx.select().from(schema.areas).orderBy(asc(schema.areas.sort), asc(schema.areas.name)),
    tx.select().from(schema.tables).orderBy(asc(schema.tables.sort), asc(schema.tables.name)),
  ]));
  return (
    <>
      <PageHeader title="Salon" desc="Bölgeler ve masalar. Kasa ve garson tabletinde masa planı bu sırayla görünür." />
      <Card className="mb-6 p-4"><AreaForm /></Card>
      {areas.length === 0 ? (
        <Card className="mb-6 p-6">
          <h2 className="mb-1 text-lg font-semibold">Salonunu kur</h2>
          <p className="mb-4 text-sm text-muted">Mekanını bölümlere ayır, masa sayısını gir. Sonra kasada masa planı çıkmaya hazır.</p>
          <SalonSetup />
        </Card>
      ) : areas.map((ar) => {
        const ts = tables.filter((t) => t.areaId === ar.id);
        return (
          <Card key={ar.id} className="mb-4 p-4">
            <div className="mb-3 flex items-center gap-3">
              <h2 className="font-semibold">{ar.name}</h2>
              <span className="text-sm text-muted">{ts.length} masa</span>
              <form action={deleteArea.bind(null, ar.id)} className="ml-auto"><button className="text-sm text-bad hover:underline">Bölgeyi sil</button></form>
            </div>
            <div className="mb-3 flex flex-wrap gap-3">
              {ts.map((t) => (
                <form key={t.id} action={deleteTable.bind(null, t.id)} className="group relative">
                  <div title={`${t.name} — kasa ve garson tabletinde bu planla görünür`}
                    className="flex h-20 w-20 select-none flex-col items-center justify-center gap-1 rounded-xl border-2 border-line bg-surface-2">
                    <MasaGlyph size={26} className="text-muted" />
                    <span className="text-base font-semibold">{t.name}</span>
                  </div>
                  <button aria-label={`${t.name} masasını sil`}
                    className="absolute -right-2 -top-2 hidden h-6 w-6 items-center justify-center rounded-full border border-line bg-surface-3 text-sm leading-none text-muted group-hover:flex hover:text-bad">×</button>
                </form>
              ))}
            </div>
            <TablesForm areaId={ar.id} areaName={ar.name} />
          </Card>
        );
      })}
    </>
  );
}
