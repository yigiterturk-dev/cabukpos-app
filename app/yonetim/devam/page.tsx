import Link from "next/link";
import { and, desc, eq, gte, isNull, or } from "drizzle-orm";
import { withTenant, schema } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { scopedStoreId } from "@/lib/admin/store-scope";
import { AttendanceForm } from "@/components/admin/AttendanceForm";
import { Card, Empty, PageHeader, buttonClass } from "@/components/ui";
export const dynamic = "force-dynamic";
const stamp = (d: Date) => d.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" });
export default async function AttendancePage() {
  const a = await requireAdmin();
  const now=new Date().getTime();
  const data = await withTenant(a.tenantId, async tx => {
    const storeId = await scopedStoreId(tx, a.tenantId, a.storeId);
    if (!storeId) return null;
    const staff = await tx.select().from(schema.staff).orderBy(schema.staff.name);
    const rows = await tx.select().from(schema.attendance).where(and(eq(schema.attendance.storeId, storeId), or(isNull(schema.attendance.endsAt), gte(schema.attendance.startsAt, new Date(now - 31 * 86400000))))).orderBy(desc(schema.attendance.startsAt));
    return { staff, rows };
  });
  if (!data) return <Empty>Şube bulunamadı.</Empty>;
  return <><PageHeader title="Personel giriş / çıkış" desc="Yönetici tarafından kaydedilen fiilî devam. Saatler sunucudan alınır; kasa vardiyasını etkilemez." /><Link className={buttonClass("secondary")} href="/yonetim/personel-plan">Çalışma planı →</Link><div className="my-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{data.staff.filter(s => s.active || data.rows.some(r => r.staffId === s.id && !r.endsAt)).map(s => { const open = data.rows.find(r => r.staffId === s.id && !r.endsAt); return <Card key={s.id} className="p-4"><h2 className="mb-2 font-semibold">{s.name}</h2><p className="mb-3 text-sm text-muted">{open ? `Giriş: ${stamp(open.startsAt)}` : "Şubede açık giriş yok"}</p><AttendanceForm key={open?.id ?? s.id} staffId={s.id} sessionId={open?.id} /></Card>; })}</div><h2 className="mb-3 text-lg font-semibold">Son 31 gün ve açık girişler</h2><div className="space-y-2">{data.rows.map(r => <Card key={r.id} className="flex flex-wrap justify-between gap-3 p-4"><span>{data.staff.find(s => s.id === r.staffId)?.name ?? "Eski personel"}</span><span>{stamp(r.startsAt)} → {r.endsAt ? stamp(r.endsAt) : "Devam ediyor"}</span><strong>{Math.floor(((r.endsAt?.getTime() ?? now) - r.startsAt.getTime()) / 60000)} dk{!r.endsAt && " (geçen süre)"}</strong></Card>)}{!data.rows.length && <Empty>Henüz giriş kaydı yok.</Empty>}</div></>;
}
