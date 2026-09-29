import { asc, eq } from "drizzle-orm";
import { getDb, schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { newPairing, revokeDevice } from "@/lib/admin/device-actions";
import { DeviceForm, NewPairingButton } from "@/components/admin/StaffDeviceForms";
import { DeviceRoleForm } from "@/components/admin/SalonForms";
import { Badge, Card, Empty, PageHeader, Panel, SplitView } from "@/components/ui";

export const dynamic = "force-dynamic";
const dt = (d: Date) => d.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" });

export default async function Cihazlar() {
  const a = await requireAdmin();
  const rows = await getDb().select().from(schema.devices).where(eq(schema.devices.tenantId, a.tenantId)).orderBy(asc(schema.devices.createdAt));
  const restoran = a.vertical === "restoran";
  const stationOptions = restoran ? (await withTenant(a.tenantId, (tx) => tx.select({ id: schema.stations.id, name: schema.stations.name }).from(schema.stations).orderBy(asc(schema.stations.sort)))).map((s) => ({ value: s.id, label: s.name })) : [];
  return (
    <>
      <PageHeader title="Cihazlar" desc="Kasa, tablet ve mutfak ekranları. Her cihaz kendi fiş numarasını verir." />
      <SplitView
        panel={<Panel title="Cihaz ekle" desc="Ekledikten sonra eşleme kodunu kasa cihazında /kasa adresine yazın."><DeviceForm /></Panel>}
        list={<>
      {rows.length === 0 ? <Empty>Henüz cihaz yok.</Empty> : (
        <Card className="divide-y divide-line">
          {rows.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="font-medium">{d.name}</div>
              <span className="font-mono text-sm text-muted">{d.receiptPrefix}</span>
              {d.revokedAt ? <Badge tone="bad">İptal</Badge> : d.pairedAt ? <Badge tone="ok">Eşlendi {dt(d.pairedAt)}</Badge> : <Badge tone="warn">Eşlenmedi</Badge>}
              {d.lastSeenAt && <span className="text-xs text-muted">Son görülme {dt(d.lastSeenAt)}</span>}
              <div className="ml-auto flex flex-wrap items-start gap-4 text-sm">
                <NewPairingButton action={newPairing.bind(null, d.id)} />
                {!d.revokedAt && <form action={revokeDevice.bind(null, d.id)}><button className="text-bad hover:underline">İptal et</button></form>}
              </div>
              {restoran && !d.revokedAt && <div className="w-full"><DeviceRoleForm deviceId={d.id} role={d.role} stations={d.stations} stationOptions={stationOptions} /></div>}
            </div>
          ))}
        </Card>
      )}
        </>}
      />
    </>
  );
}
