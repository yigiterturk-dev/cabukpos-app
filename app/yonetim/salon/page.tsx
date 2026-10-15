import { asc } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { deleteArea, deleteTable } from "@/lib/admin/salon-actions";
import { AreaForm, SalonSetup, TablesForm } from "@/components/admin/SalonForms";
import { MasaGlyph } from "@/components/MasaGlyph";
import { buttonClass, Card, PageHeader } from "@/components/ui";

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
            <div className="mb-3 flex min-w-0 flex-wrap items-center gap-3">
              <h2 className="min-w-0 break-words font-semibold">{ar.name}</h2>
              <span className="shrink-0 text-sm text-muted">{ts.length} masa</span>
              <form action={deleteArea.bind(null, ar.id)} className="ml-auto shrink-0"><button className={buttonClass("danger", "sm")}>Bölgeyi sil</button></form>
            </div>
            <div className="mb-3 flex flex-wrap gap-3">
              {ts.map((t) => (
                <form key={t.id} action={deleteTable.bind(null, t.id)} className="group relative">
                  <div title={`${t.name} — kasa ve garson tabletinde bu planla görünür`}
                    className="flex h-20 w-20 select-none flex-col items-center justify-center gap-1 rounded-xl border-2 border-line bg-surface-2">
                    <MasaGlyph size={26} className="text-muted" />
                    <span className="max-w-full truncate px-1 text-base font-semibold" title={t.name}>{t.name}</span>
                  </div>
                  <button aria-label={`${t.name} masasını sil`}
                    className="absolute -right-2 -top-2 grid size-10 place-items-center rounded-full border border-bad/25 bg-surface text-base leading-none text-bad outline-none transition-opacity hover:bg-bad-soft focus-visible:ring-4 focus-visible:ring-bad/20 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">×</button>
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
