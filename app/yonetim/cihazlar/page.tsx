import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { Monitor } from "lucide-react";
import { getDb, schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { canUseStore } from "@/lib/core/access";
import { scopedStoreId } from "@/lib/admin/store-scope";
import { newPairing, revokeDevice } from "@/lib/admin/device-actions";
import { RevokeForm } from "@/components/admin/RevokeForms";
import { DeviceForm, NewPairingButton } from "@/components/admin/StaffDeviceForms";
import { DeviceRoleForm } from "@/components/admin/SalonForms";
import { Badge, buttonClass, Card, Empty, PageHeader, Panel, SplitView } from "@/components/ui";

export const dynamic = "force-dynamic";
const dt = (d: Date) => d.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" });

export default async function Cihazlar() {
  const a = await requireAdmin();
  const activeStoreId = await withTenant(a.tenantId, (tx) => scopedStoreId(tx, a.tenantId, a.storeId));
  const rows = (await getDb().select().from(schema.devices).where(eq(schema.devices.tenantId, a.tenantId)).orderBy(asc(schema.devices.createdAt))).filter((r) => canUseStore(a, r.storeId));
  const restoran = a.vertical === "restoran";
  const [stores, stationRows] = await withTenant(a.tenantId, (tx) => Promise.all([
    tx.select({ id: schema.stores.id, name: schema.stores.name }).from(schema.stores),
    tx.select({ id: schema.stations.id, name: schema.stations.name, storeId: schema.stations.storeId }).from(schema.stations).orderBy(asc(schema.stations.sort)),
  ]));
  const storeNames = new Map(stores.map((s) => [s.id, s.name]));
  return (
    <>
      <PageHeader title="Kasa cihazları" desc="Kasa, tablet ve mutfak ekranları. Her cihaz kendi fiş numarasını verir." />
      <SplitView
        panel={<Panel title="Cihaz ekle" desc={activeStoreId ? "Yeni cihaz seçili şubeye atanır. Eşleme kodunu cihazda /kasa adresine yazın." : undefined}>{activeStoreId ? <DeviceForm /> : <div className="space-y-3 text-sm text-muted"><p>Cihaz eklemeden önce bir şube oluşturun.</p><Link href="/yonetim/subeler" className={buttonClass("primary")}>Şube ekle</Link></div>}</Panel>}
        list={<>
      {rows.length === 0 ? <Empty icon={<Monitor aria-hidden className="size-8" />}>Henüz cihaz yok. Formdan kasa tabletini ekleyin, sonra eşleme kodunu tablette &quot;/kasa&quot; adresine yazın.</Empty> : (
        <Card className="divide-y divide-line">
          {rows.map((d) => (
            <div key={d.id} className="flex min-w-0 flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 break-words font-medium">{d.name}{restoran && <span className="ml-2 font-normal text-muted">· {storeNames.get(d.storeId) ?? "Şube bulunamadı"}</span>}</div>
              <span className="shrink-0 font-mono text-sm text-muted">{d.receiptPrefix}</span>
              {d.revokedAt ? <Badge tone="bad">İptal</Badge> : d.pairedAt ? <Badge tone="ok">Eşlendi {dt(d.pairedAt)}</Badge> : <Badge tone="warn">Eşlenmedi</Badge>}
              {d.lastSeenAt && <span className="min-w-0 break-words text-xs text-muted">Son görülme {dt(d.lastSeenAt)}</span>}
              <div className="ml-auto flex shrink-0 flex-wrap items-start gap-4 text-sm">
                <NewPairingButton action={newPairing.bind(null, d.id)} />
                <RevokeForm action={revokeDevice.bind(null, d.id)} ariaLabel={`Cihazı iptal et: ${d.name}`} revoked={Boolean(d.revokedAt)} />
              </div>
              {restoran && !d.revokedAt && <div className="w-full"><DeviceRoleForm deviceId={d.id} role={d.role} stations={d.stations} stationOptions={stationRows.filter((s) => s.storeId === d.storeId).map((s) => ({ value: s.id, label: s.name }))} hasUnavailableStations={d.stations.some((id) => !stationRows.some((s) => s.id === id))} /></div>}
            </div>
          ))}
        </Card>
      )}
        </>}
      />
    </>
  );
}
