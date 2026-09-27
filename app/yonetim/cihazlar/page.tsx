import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { newPairing, revokeDevice } from "@/lib/admin/device-actions";
import { DeviceForm, NewPairingButton } from "@/components/admin/StaffDeviceForms";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
const dt = (d: Date) => d.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" });

export default async function Cihazlar() {
  const a = await requireAdmin();
  const rows = await getDb().select().from(schema.devices).where(eq(schema.devices.tenantId, a.tenantId)).orderBy(asc(schema.devices.createdAt));
  return (
    <>
      <PageHeader title="Cihazlar" desc="Kasa, tablet ve mutfak ekranları. Her cihaz kendi fiş numarasını verir." />
      <Card className="mb-6 p-5"><DeviceForm /></Card>
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
                {!d.revokedAt && <form action={revokeDevice.bind(null, d.id)}><button className="text-red-700 underline">İptal et</button></form>}
              </div>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
