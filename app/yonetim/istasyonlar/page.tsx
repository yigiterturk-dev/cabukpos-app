import Link from "next/link";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { scopedStoreId } from "@/lib/admin/store-scope";
import { deleteStation } from "@/lib/admin/salon-actions";
import { agentConfig } from "@/lib/agent/config";
import { CategoryStation, StationForm } from "@/components/admin/SalonForms";
import { ConfirmActionForm } from "@/components/admin/ConfirmActionForm";
import { categoryStationForStore, loadStoreStationRoutes } from "@/lib/core/station-routing";
import { buttonClass, Card, Empty, PageHeader, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Istasyonlar() {
  const a = await requireAdmin();
  const storeId = await withTenant(a.tenantId, (tx) => scopedStoreId(tx, a.tenantId, a.storeId));
  const [[stations, cats], agents] = await Promise.all([
    withTenant(a.tenantId, (tx) => Promise.all([
      tx.select().from(schema.stations).where(storeId ? eq(schema.stations.storeId, storeId) : sql`false`).orderBy(asc(schema.stations.sort), asc(schema.stations.name)),
      tx.select().from(schema.categories).orderBy(asc(schema.categories.sort), asc(schema.categories.name)),
    ])),
    getDb().select({ name: schema.agents.name, config: schema.agents.config }).from(schema.agents).where(and(eq(schema.agents.tenantId, a.tenantId), storeId ? eq(schema.agents.storeId, storeId) : sql`false`, isNull(schema.agents.revokedAt))),
  ]);
  const routes = storeId
    ? await withTenant(a.tenantId, (tx) => loadStoreStationRoutes(tx, storeId))
    : { stationIds: new Set<string>(), categories: new Map<string, string | null>(), products: new Map<string, string | null>() };
  // Ajan yapılandırmasındaki yazıcılar (mutfak rolü önce). Şube başına tek ajan (M4).
  const printers = agents.flatMap((ag) => {
    const c = agentConfig.safeParse(ag.config);
    return c.success ? c.data.printers.map((p) => ({ value: p.id, label: `${p.name}${p.role === "mutfak" ? "" : ` (${p.role})`}`, role: p.role })) : [];
  }).sort((x, y) => Number(y.role === "mutfak") - Number(x.role === "mutfak")).map(({ value, label }) => ({ value, label }));
  const stationOpts = stations.map((s) => ({ value: s.id, label: s.name }));
  return (
    <>
      <PageHeader title="Mutfak istasyonları" desc="Siparişler istasyona göre ayrılır: mutfak ekranında o istasyonun sütununa düşer, yazıcısı varsa oraya da basılır." />
      {!storeId ? <Card className="mb-6 p-6">
        <h2 className="mb-1 text-lg font-semibold">Önce şube oluşturun</h2>
        <p className="mb-4 text-sm text-muted">Mutfak istasyonları şubeye ve o şubenin yazıcılarına bağlıdır.</p>
        <Link href="/yonetim/subeler" className={buttonClass("primary", "md")}>Şube ekle</Link>
      </Card> : <div className="mb-6"><Panel title="İstasyon ekle" desc={printers.length === 0 ? "Mutfak yazıcısı için önce Donanım sayfasında ajana yazıcı ekleyin." : undefined}>
        <StationForm printers={printers} />
      </Panel></div>}
      {storeId && (stations.length === 0 ? <Empty>Henüz istasyon yok. İstasyonsuz siparişler tüm mutfak ekranlarında görünür.</Empty> : (
        <Card className="mb-6 divide-y divide-line">
          {stations.map((s) => (
            <div key={s.id} className="flex flex-wrap items-end gap-3 p-4">
              <StationForm initial={s} printers={printers} />
              <ConfirmActionForm action={deleteStation.bind(null, s.id)} ariaLabel={`İstasyonu sil: ${s.name}`} label="Sil" prompt={`“${s.name}” istasyonu silinecek. Ürün ve kategori yönlendirmelerini kontrol edin. Devam etmek istiyor musunuz?`} className={`${buttonClass("danger", "sm")} ml-auto shrink-0`} />
            </div>
          ))}
        </Card>
      ))}
      {storeId && stations.length > 0 && cats.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-1 font-semibold">Kategori → istasyon</h2>
          <p className="mb-4 text-sm text-muted">Bu şubenin kategori yönlendirmesi. Ürün formunda ayrıca istasyon seçilirse bu kategori ayarını ezer.</p>
          <div className="divide-y divide-line">
            {cats.map((c) => (
              <div key={c.id} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1 break-words text-sm font-medium">{c.name}</span>
                <CategoryStation
                  categoryId={c.id}
                  categoryName={c.name}
                  value={categoryStationForStore(c.id, c.stationId, routes) ?? ""}
                  currentIsOtherBranch={!routes.categories.has(c.id) && !!c.stationId && !routes.stationIds.has(c.stationId)}
                  stations={stationOpts}
                />
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
