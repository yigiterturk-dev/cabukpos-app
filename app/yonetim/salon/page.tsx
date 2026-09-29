import { asc } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { deleteArea, deleteTable } from "@/lib/admin/salon-actions";
import { AreaForm, TablesForm } from "@/components/admin/SalonForms";
import { Card, Empty, PageHeader } from "@/components/ui";

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
      {areas.length === 0 ? <Empty>Henüz bölge yok. Önce bir bölge (ör. Salon) ekleyin.</Empty> : areas.map((ar) => {
        const ts = tables.filter((t) => t.areaId === ar.id);
        return (
          <Card key={ar.id} className="mb-4 p-4">
            <div className="mb-3 flex items-center gap-3">
              <h2 className="font-semibold">{ar.name}</h2>
              <span className="text-sm text-muted">{ts.length} masa</span>
              <form action={deleteArea.bind(null, ar.id)} className="ml-auto"><button className="text-sm text-bad hover:underline">Bölgeyi sil</button></form>
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              {ts.map((t) => (
                <form key={t.id} action={deleteTable.bind(null, t.id)} className="flex items-center gap-1 rounded-full border border-line py-1 pl-3 pr-1 text-sm">
                  <span>{t.name}</span>
                  <button aria-label={`${t.name} masasını sil`} className="rounded-full px-2 text-muted hover:bg-surface-3">×</button>
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
