import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { scopedStoreId } from "@/lib/admin/store-scope";
import { bookingSettings } from "@/lib/reservations";
import { BookingConfigForm, TableCapacityForm } from "@/components/admin/BookingConfigForms";
import { Card, Empty, PageHeader } from "@/components/ui";
export const dynamic = "force-dynamic";
export default async function BookingSettingsPage() {
  const a = await requireAdmin();
  const storeId = await withTenant(a.tenantId, tx => scopedStoreId(tx, a.tenantId, a.storeId));
  if (!storeId) return <Empty>Önce bir şube oluşturun.</Empty>;
  const config = await bookingSettings({ tenantId: a.tenantId, storeId });
  const tables = await withTenant(a.tenantId, tx => tx.select({ id: schema.tables.id, name: schema.tables.name, seats: schema.tables.seats }).from(schema.tables).innerJoin(schema.areas, eq(schema.areas.id, schema.tables.areaId)).where(and(eq(schema.tables.tenantId, a.tenantId), eq(schema.areas.storeId, storeId))).orderBy(schema.tables.name));
  return <><PageHeader title="Rezervasyon ayarları" desc="Masa kapasitesi, uygun saatler ve müşteri rezervasyon sayfası." /><Link href="/yonetim/rezervasyonlar" className="mb-4 inline-flex min-h-11 items-center text-brand underline">← Rezervasyonlar</Link><Card className="mb-5 p-5"><BookingConfigForm config={config} />{config.token && config.enabled && <p className="mt-4"><Link href={`/rezervasyon/${config.token}`} className="break-all font-semibold text-brand underline">Müşteri rezervasyon sayfasını aç →</Link></p>}</Card><p className="mb-4 text-sm text-muted">Kapasiteleri işletmenize göre ayarlayın. 0, masayı yeni rezervasyona kapatır. Kişi sayısı kapasiteyi aşarsa veya saat çakışırsa rezervasyon alınmaz.</p><div className="grid gap-4 md:grid-cols-2">{tables.map(t => <Card key={t.id} className="p-5"><h2 className="mb-3 font-semibold">{t.name}</h2><TableCapacityForm {...t} /></Card>)}</div></>;
}
