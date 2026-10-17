// Eşitlemede kabul edilen ama işaretlenen belgeler + reddedilenler (audit_log sync.red) (fiyat farkı, silinmiş ürün, fiş no çakışması, fazla iade, platform hatası…).
import Link from "next/link";
import { and, count, desc, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { moneyFormatter } from "@/lib/admin/currency";
import { rangeBounds, type Range } from "@/lib/core/report";
import { Card, Empty, TABLE_HEAD } from "@/components/ui";
import { HorizontalScrollRegion } from "@/components/HorizontalScrollRegion";
import { BuyerInvoices } from "./BuyerInvoices";
import { reportHref } from "./RangeBar";

const dt = (d: Date) => d.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" });
const TAB_TYPE: Record<string, string> = {
  open: "Açılış", add: "Ekleme", send: "Mutfağa gönderim", void: "İptal", comp: "İkram", discount: "İndirim", move: "Taşıma", bill: "Hesap", paid: "Ödeme", close: "Kapatma",
  cancel: "İptal", order: "Platform siparişi", accept: "Kabul", reject: "Red", courier: "Kurye", out: "Yola çıktı", delivered: "Teslim", handover: "Hesap teslimi", kitchen: "Mutfak", printed: "Baskı",
};

const PAGE_SIZE = 50;

export async function ReviewTab({ tenantId, storeId, range, page = 1 }: { tenantId: string; storeId: string | null; range: Range; page?: number }) {
  const money = await moneyFormatter(tenantId);
  const { from, to } = rangeBounds(range);
  const S = schema.sales, E = schema.tabEvents, st = schema.staff;
  const { rows, total, safePage, pageCount } = await withTenant(tenantId, async (tx) => {
    const A = schema.auditLog;
    const deviceStore = storeId ? eq(schema.devices.storeId, storeId) : sql`false`;
    const [{ total: salesCount }] = await tx.select({ total: count() }).from(S).where(and(isNotNull(S.review), gte(S.createdAt, from), lt(S.createdAt, to), storeId ? eq(S.storeId, storeId) : sql`false`));
    const [{ total: eventsCount }] = await tx.select({ total: count() }).from(E).where(and(isNotNull(E.review), gte(E.at, from), lt(E.at, to), storeId ? eq(E.storeId, storeId) : sql`false`));
    const [{ total: rejectedCount }] = await tx.select({ total: count() }).from(A).innerJoin(schema.devices, sql`${A.actor} = 'device:' || ${schema.devices.id}::text`).where(and(eq(A.action, "sync.red"), gte(A.createdAt, from), lt(A.createdAt, to), deviceStore));
    const total = salesCount + eventsCount + rejectedCount;
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const safePage = Math.min(Math.max(1, Math.floor(page)), pageCount);
    const limit = safePage * PAGE_SIZE;
    const salesPage = await tx.select({ id: S.id, at: S.createdAt, status: S.status, receiptNo: S.receiptNo, total: S.total, review: S.review, staff: st.name, shiftId: S.shiftId })
      .from(S).leftJoin(st, eq(st.id, S.staffId)).where(and(isNotNull(S.review), gte(S.createdAt, from), lt(S.createdAt, to), storeId ? eq(S.storeId, storeId) : sql`false`)).orderBy(desc(S.createdAt), desc(S.id)).limit(limit);
    const eventsPage = await tx.select({ id: E.id, at: E.at, type: E.type, review: E.review, staff: st.name })
      .from(E).leftJoin(st, eq(st.id, E.staffId)).where(and(isNotNull(E.review), gte(E.at, from), lt(E.at, to), storeId ? eq(E.storeId, storeId) : sql`false`)).orderBy(desc(E.at), desc(E.id)).limit(limit);
    const rejectedPage = await tx.select({ id: A.id, at: A.createdAt, detail: A.detail, device: schema.devices.name })
      .from(A).leftJoin(schema.devices, sql`${A.actor} = 'device:' || ${schema.devices.id}::text`)
      .where(and(eq(A.action, "sync.red"), gte(A.createdAt, from), lt(A.createdAt, to), deviceStore)).orderBy(desc(A.createdAt), desc(A.id)).limit(limit);
    const merged = [
      ...rejectedPage.map((r) => { const d = (r.detail ?? {}) as { kind?: string; error?: string }; return { key: r.id, at: r.at, kind: `Reddedildi · ${d.kind ?? "belge"}`, ref: "—", amount: null, staff: r.device ? `Cihaz: ${r.device}` : null, review: d.error ?? "—", shiftId: null }; }),
      ...salesPage.map((s) => ({ key: s.id, at: s.at, kind: s.status === "iade" ? "İade" : "Satış", ref: s.receiptNo, amount: s.total, staff: s.staff, review: s.review!, shiftId: s.shiftId })),
      ...eventsPage.map((e) => ({ key: e.id, at: e.at, kind: `Adisyon · ${TAB_TYPE[e.type] ?? e.type}`, ref: "—", amount: null, staff: e.staff, review: e.review!, shiftId: null })),
    ].sort((a, b) => b.at.getTime() - a.at.getTime() || b.key.localeCompare(a.key));
    return { rows: merged.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE), total, safePage, pageCount };
  });
  const pending = <BuyerInvoices tenantId={tenantId} money={money} />;
  if (rows.length === 0) return <>{pending}<Empty>Bu dönemde incelenecek kayıt yok.</Empty></>;
  return (
    <>
    {pending}
    <div className="grid gap-3 lg:hidden" data-testid="review-list-mobile">
      {rows.map((r) => (
        <Card key={r.key} className="min-w-0 p-4">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <h2 className="font-semibold">{r.kind}</h2>
            <time className="text-sm tabular text-muted">{dt(r.at)}</time>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-3 text-sm">
            <div className="min-w-0"><dt className="text-xs text-muted">Fiş</dt><dd className="break-words">{r.shiftId ? <Link href={`/yonetim/raporlar/${r.shiftId}`} className="rounded underline outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">{r.ref}</Link> : r.ref}</dd></div>
            <div className="min-w-0"><dt className="text-xs text-muted">Tutar</dt><dd className="break-words tabular-nums">{r.amount === null ? "—" : money(r.amount)}</dd></div>
            <div className="min-w-0"><dt className="text-xs text-muted">Personel</dt><dd className="break-words">{r.staff ?? "—"}</dd></div>
            <div className="col-span-2 min-w-0"><dt className="text-xs text-muted">İnceleme nedeni</dt><dd className="break-words text-warn">{r.review}</dd></div>
          </dl>
        </Card>
      ))}
    </div>
    <Card className="hidden p-0 lg:block" data-testid="review-list">
      <HorizontalScrollRegion label="İnceleme kayıtları, yatay kaydırılabilir" className="rounded-2xl">
      <table aria-label="İnceleme kayıtları" className="w-full min-w-[760px] text-sm">
        <thead className={TABLE_HEAD}><tr>{["Tarih", "Tür", "Fiş", "Tutar", "Personel", "Neden"].map((h) => <th scope="col" key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
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
      </HorizontalScrollRegion>
    </Card>
    {pageCount > 1 && <nav aria-label="İnceleme kayıtları sayfaları" className="mt-4 flex items-center justify-between gap-3">
      <span className="text-sm text-muted">{(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, total)} / {total} kayıt</span>
      <div className="flex gap-2">
        <ReviewPageLink href={safePage > 1 ? reportHref("inceleme", range, { page: String(safePage - 1) }) : undefined} label="Önceki" />
        <ReviewPageLink href={safePage < pageCount ? reportHref("inceleme", range, { page: String(safePage + 1) }) : undefined} label="Sonraki" />
      </div>
    </nav>}
    </>
  );
}

function ReviewPageLink({ href, label }: { href?: string; label: string }) {
  return href ? <Link href={href} className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 py-2 text-sm outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60">{label}</Link>
    : <span aria-disabled="true" className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 py-2 text-sm text-muted opacity-50">{label}</span>;
}
