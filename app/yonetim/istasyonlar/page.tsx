import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb, schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { deleteStation } from "@/lib/admin/salon-actions";
import { agentConfig } from "@/lib/agent/config";
import { CategoryStation, StationForm } from "@/components/admin/SalonForms";
import { Card, Empty, PageHeader, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Istasyonlar() {
  const a = await requireAdmin();
  const [[stations, cats], agents] = await Promise.all([
    withTenant(a.tenantId, (tx) => Promise.all([
      tx.select().from(schema.stations).orderBy(asc(schema.stations.sort), asc(schema.stations.name)),
      tx.select().from(schema.categories).orderBy(asc(schema.categories.sort), asc(schema.categories.name)),
    ])),
    getDb().select({ name: schema.agents.name, config: schema.agents.config }).from(schema.agents).where(and(eq(schema.agents.tenantId, a.tenantId), isNull(schema.agents.revokedAt))),
  ]);
  // Ajan yapılandırmasındaki yazıcılar (mutfak rolü önce). Şube başına tek ajan (M4).
  const printers = agents.flatMap((ag) => {
    const c = agentConfig.safeParse(ag.config);
    return c.success ? c.data.printers.map((p) => ({ value: p.id, label: `${p.name}${p.role === "mutfak" ? "" : ` (${p.role})`}`, role: p.role })) : [];
  }).sort((x, y) => Number(y.role === "mutfak") - Number(x.role === "mutfak")).map(({ value, label }) => ({ value, label }));
  const stationOpts = stations.map((s) => ({ value: s.id, label: s.name }));
  return (
    <>
      <PageHeader title="Mutfak istasyonları" desc="Siparişler istasyona göre ayrılır: mutfak ekranında o istasyonun sütununa düşer, yazıcısı varsa oraya da basılır." />
      <div className="mb-6"><Panel title="İstasyon ekle" desc={printers.length === 0 ? "Mutfak yazıcısı için önce Donanım sayfasında ajana yazıcı ekleyin." : undefined}>
        <StationForm printers={printers} />
      </Panel></div>
      {stations.length === 0 ? <Empty>Henüz istasyon yok. İstasyonsuz siparişler tüm mutfak ekranlarında görünür.</Empty> : (
        <Card className="mb-6 divide-y divide-line">
          {stations.map((s) => (
            <div key={s.id} className="flex flex-wrap items-end gap-3 p-4">
              <StationForm initial={s} printers={printers} />
              <form action={deleteStation.bind(null, s.id)} className="ml-auto"><button className="text-sm text-bad hover:underline">Sil</button></form>
            </div>
          ))}
        </Card>
      )}
      {stations.length > 0 && cats.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-1 font-semibold">Kategori → istasyon</h2>
          <p className="mb-4 text-sm text-muted">Ürün formunda ayrıca istasyon seçilirse o geçerli olur.</p>
          <div className="divide-y divide-line">
            {cats.map((c) => (
              <div key={c.id} className="flex items-center gap-3 py-2">
                <span className="w-48 text-sm font-medium">{c.name}</span>
                <CategoryStation categoryId={c.id} value={c.stationId ?? ""} stations={stationOpts} />
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
