import Link from "next/link";
import { randomUUID } from "node:crypto";
import { withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { scopedStoreId } from "@/lib/admin/store-scope";
import { listStaffPlans } from "@/lib/admin/staff-plan";
import { isValidCalendarDay, istToday } from "@/lib/core/report";
import { PLAN_KINDS, PLAN_STATUSES, isPlanKind, isPlanStatus, planDayOffset, planLocal, planMinutes, planWeekStart } from "@/lib/core/staff-plan";
import { StaffPlanForm, StaffPlanStatusForm } from "@/components/admin/StaffPlanForms";
import { Badge, Card, Empty, Input, PageHeader, StatCard, buttonClass } from "@/components/ui";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";
type Query = { week?: string; staff?: string; kind?: string; status?: string; edit?: string };
const time = (at: Date) => at.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
const selectClass = "min-h-11 min-w-0 max-w-full rounded-xl border border-line bg-surface px-3 text-sm";

export default async function StaffPlanning({ searchParams }: { searchParams: Promise<Query> }) {
  const a = await requireAdmin(), q = await searchParams;
  const today = istToday();
  const min = planDayOffset(today, -366), max = planDayOffset(today, 366);
  const week = planWeekStart(q.week && isValidCalendarDay(q.week) && q.week >= min && q.week <= max ? q.week : today);
  const storeId = await withTenant(a.tenantId, tx => scopedStoreId(tx, a.tenantId, a.storeId));
  if (!storeId) return <Empty>Önce bir şube oluşturun.</Empty>;
  let data;
  try { data = await listStaffPlans({ tenantId: a.tenantId, storeId, actor: a }, week); }
  catch { return <><PageHeader title="Vardiya planı" /><p role="alert">Planlar yüklenemedi. Sayfayı yenileyin.</p></>; }
  const kind = q.kind && isPlanKind(q.kind) ? q.kind : "";
  const status = q.status && isPlanStatus(q.status) ? q.status : "";
  const person = data.staff.find(s => s.id === q.staff);
  const rows = data.rows.filter(r => !person || r.staffId === person.id).filter(r => !kind || r.kind === kind).filter(r => status ? r.status === status : r.status !== "iptal");
  const editing = data.rows.find(r => r.id === q.edit);
  const link = (day: string, edit?: string) => `/yonetim/personel-plan?${new URLSearchParams({ week: day, ...(person ? { staff: person.id } : {}), ...(kind ? { kind } : {}), ...(status ? { status } : {}), ...(edit ? { edit } : {}) })}`;
  const hours = rows.filter(r => r.kind === "vardiya" && r.status !== "iptal").reduce((n, r) => n + planMinutes(r.startsAt, r.endsAt, r.breakMinutes), 0);
  const initial = editing ? { ...editing, startsAt: planLocal(editing.startsAt), endsAt: planLocal(editing.endsAt) } : undefined;
  return <>
    <PageHeader title="Vardiya planı" desc="Çalışma vardiyaları ve personele atanan görevler." actions={<PrintButton />} />
    <div className="mb-5 flex flex-wrap gap-2 print:hidden"><Link className={buttonClass("secondary")} href={link(planDayOffset(week, -7))}>← Önceki hafta</Link><Link className={buttonClass("secondary")} href={link(planWeekStart(today))}>Bu hafta</Link><Link className={buttonClass("secondary")} href={link(planDayOffset(week, 7))}>Sonraki hafta →</Link><Link className={buttonClass("ghost")} href="/yonetim/personel">Personel ve PIN ayarları</Link></div>
    <form method="get" className="mb-5 flex flex-wrap items-end gap-3 print:hidden"><label className="grid min-w-0 max-w-full gap-1 text-sm">Hafta<Input type="date" name="week" defaultValue={week} min={min} max={max} /></label><label className="grid min-w-0 max-w-full gap-1 text-sm">Personel<select className={selectClass} name="staff" defaultValue={person?.id ?? ""}><option value="">Tüm personel</option>{data.staff.map(s => <option key={s.id} value={s.id}>{s.name}{s.active ? "" : " (pasif)"}</option>)}</select></label><label className="grid min-w-0 max-w-full gap-1 text-sm">Tür<select className={selectClass} name="kind" defaultValue={kind}><option value="">Vardiya ve görev</option>{Object.entries(PLAN_KINDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="grid min-w-0 max-w-full gap-1 text-sm">Durum<select className={selectClass} name="status" defaultValue={status}><option value="">İptal dışındakiler</option>{Object.entries(PLAN_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button className={buttonClass("secondary")}>Göster</button></form>
    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4"><StatCard label="Çalışma planı" value={String(rows.filter(r => r.kind === "vardiya").length)} /><StatCard label="Planlanan çalışma" value={`${Math.floor(hours / 60)} sa ${hours % 60} dk`} /><StatCard label="Açık görev" value={String(rows.filter(r => r.kind === "gorev" && !["tamamlandi", "iptal"].includes(r.status)).length)} /><StatCard label="Tamamlanan görev" value={String(rows.filter(r => r.kind === "gorev" && r.status === "tamamlandi").length)} /></div>
    <details key={editing?.id ?? "new"} open={!!editing} className="mb-5 rounded-2xl border border-line bg-surface p-5 print:hidden"><summary className="min-h-11 cursor-pointer font-semibold text-brand">{editing ? `Planı düzenle: ${editing.title}` : "+ Vardiya veya görev ekle"}</summary><div className="pt-4"><StaffPlanForm key={editing?.id ?? "new"} staff={data.staff} creationId={randomUUID()} day={today >= week && today < planDayOffset(week, 7) ? today : week} initial={initial} />{editing && <Link href={link(week)} className="mt-3 inline-flex min-h-11 items-center text-sm text-brand underline">Düzenlemeyi kapat</Link>}</div></details>
    <p className="mb-4 text-xs text-muted">{week} – {planDayOffset(week, 6)} · Başlangıç gününe göre listelenir. Mola çalışma süresinden düşülür. Kayıtlar kasa vardiyasından ve fiilî devam takibinden ayrıdır.</p>
    <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 7 }, (_, i) => planDayOffset(week, i)).map(day => {
      const plans = rows.filter(r => planLocal(r.startsAt).slice(0, 10) === day);
      return <Card key={day} className="min-w-0 p-4"><h2 className="mb-3 font-semibold">{new Date(`${day}T12:00:00+03:00`).toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Istanbul" })}</h2>{!plans.length ? <p className="py-4 text-sm text-muted">Plan yok.</p> : <ul className="space-y-4">{plans.map(r => <li key={r.id} className="min-w-0 rounded-xl border border-line bg-surface-2 p-3"><div className="mb-2 flex flex-wrap gap-2"><Badge tone={r.kind === "vardiya" ? "brand" : "neutral"}>{PLAN_KINDS[r.kind as keyof typeof PLAN_KINDS]}</Badge><Badge tone={r.status === "tamamlandi" ? "ok" : r.status === "iptal" ? "bad" : r.status === "suruyor" ? "warn" : "neutral"}>{PLAN_STATUSES[r.status as keyof typeof PLAN_STATUSES]}</Badge></div><h3 className="break-words font-semibold">{r.title}</h3><p className="mt-1 break-words text-sm">{data.staff.find(s => s.id === r.staffId)?.name ?? "Eski personel"}</p><p className="mt-1 text-sm text-muted">{time(r.startsAt)} → {planLocal(r.endsAt).slice(0, 10) !== day ? `${planLocal(r.endsAt).slice(0, 10)} ` : ""}{time(r.endsAt)}{r.kind === "vardiya" ? ` · ${r.breakMinutes} dk mola` : ""}</p>{r.note && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted">{r.note}</p>}<div className="print:hidden"><StaffPlanStatusForm key={`${r.id}:${r.revision}`} id={r.id} revision={r.revision} status={r.status} title={r.title} /><Link href={link(week, r.id)} className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-brand underline">Düzenle</Link></div></li>)}</ul>}</Card>;
    })}</div>
  </>;
}
