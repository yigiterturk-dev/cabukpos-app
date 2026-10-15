// Eşitlemede kabul edilen ama işaretlenen belgeler + reddedilenler (audit_log sync.red) (fiyat farkı, silinmiş ürün, fiş no çakışması, fazla iade, platform hatası…).
import Link from "next/link";
import { and, desc, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { moneyFormatter } from "@/lib/admin/currency";
import { rangeBounds, type Range } from "@/lib/core/report";
import { Card, Empty, TABLE_HEAD } from "@/components/ui";
import { BuyerInvoices } from "./BuyerInvoices";

const dt = (d: Date) => d.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" });
const TAB_TYPE: Record<string, string> = {
  open: "Açılış", add: "Ekleme", send: "Mutfağa gönderim", void: "İptal", comp: "İkram", discount: "İndirim", move: "Taşıma", bill: "Hesap", paid: "Ödeme", close: "Kapatma",
  cancel: "İptal", order: "Platform siparişi", accept: "Kabul", reject: "Red", courier: "Kurye", out: "Yola çıktı", delivered: "Teslim", handover: "Hesap teslimi", kitchen: "Mutfak", printed: "Baskı",
};

type Row = { key: string; at: Date; kind: string; ref: string; amount: number | null; staff: string | null; review: string; shiftId: string | null };

export async function ReviewTab({ tenantId, range }: { tenantId: string; range: Range }) {
  const money = await moneyFormatter(tenantId);
  const { from, to } = rangeBounds(range);
  const S = schema.sales, E = schema.tabEvents, st = schema.staff;
  const rows: Row[] = await withTenant(tenantId, async (tx) => {
    const sales = await tx.select({ id: S.id, at: S.createdAt, status: S.status, receiptNo: S.receiptNo, total: S.total, review: S.review, staff: st.name, shiftId: S.shiftId })
      .from(S).leftJoin(st, eq(st.id, S.staffId)).where(and(isNotNull(S.review), gte(S.createdAt, from), lt(S.createdAt, to))).orderBy(desc(S.createdAt)).limit(200);
    const events = await tx.select({ id: E.id, at: E.at, type: E.type, review: E.review, staff: st.name })
      .from(E).leftJoin(st, eq(st.id, E.staffId)).where(and(isNotNull(E.review), gte(E.at, from), lt(E.at, to))).orderBy(desc(E.at)).limit(200);
    const A = schema.auditLog;
    const rejected = await tx.select({ id: A.id, at: A.createdAt, detail: A.detail, device: schema.devices.name })
      .from(A).leftJoin(schema.devices, sql`${A.actor} = 'device:' || ${schema.devices.id}::text`)
      .where(and(eq(A.action, "sync.red"), gte(A.createdAt, from), lt(A.createdAt, to))).orderBy(desc(A.createdAt)).limit(200);
    return [
      ...rejected.map((r) => { const d = (r.detail ?? {}) as { kind?: string; error?: string }; return { key: r.id, at: r.at, kind: `Reddedildi · ${d.kind ?? "belge"}`, ref: "—", amount: null, staff: r.device ? `Cihaz: ${r.device}` : null, review: d.error ?? "—", shiftId: null }; }),
      ...sales.map((s) => ({ key: s.id, at: s.at, kind: s.status === "iade" ? "İade" : "Satış", ref: s.receiptNo, amount: s.total, staff: s.staff, review: s.review!, shiftId: s.shiftId })),
      ...events.map((e) => ({ key: e.id, at: e.at, kind: `Adisyon · ${TAB_TYPE[e.type] ?? e.type}`, ref: "—", amount: null, staff: e.staff, review: e.review!, shiftId: null })),
    ].sort((a, b) => b.at.getTime() - a.at.getTime());
  });
  const pending = <BuyerInvoices tenantId={tenantId} money={money} />;
  if (rows.length === 0) return <>{pending}<Empty>Bu dönemde incelenecek kayıt yok.</Empty></>;
  return (
    <>
    {pending}
    <Card className="overflow-x-auto" data-testid="review-list">
      <table className="w-full min-w-[760px] text-sm">
        <thead className={TABLE_HEAD}><tr>{["Tarih", "Tür", "Fiş", "Tutar", "Personel", "Neden"].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">{rows.map((r) => (
          <tr key={r.key}>
            <td className="whitespace-nowrap px-4 py-2.5">{dt(r.at)}</td>
            <td className="px-4 py-2.5">{r.kind}</td>
            <td className="px-4 py-2.5">{r.shiftId ? <Link href={`/yonetim/raporlar/${r.shiftId}`} className="rounded px-1 underline outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">{r.ref}</Link> : r.ref}</td>
            <td className="px-4 py-2.5 tabular-nums">{r.amount === null ? "—" : money(r.amount)}</td>
            <td className="px-4 py-2.5">{r.staff ?? "—"}</td>
            <td className="px-4 py-2.5 text-warn">{r.review}</td>
          </tr>
        ))}</tbody>
      </table>
    </Card>
    </>
  );
}
