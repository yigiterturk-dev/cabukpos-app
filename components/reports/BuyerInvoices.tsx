// VKN'li alıcıya kesilmiş e-Arşiv'in kısmi iadesi: alıcının iade faturası girilene kadar açık (dönemden bağımsız).
import { and, asc, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { schema, withTenant } from "@/db";
import { Card, TABLE_HEAD } from "@/components/ui";
import { HorizontalScrollRegion } from "@/components/HorizontalScrollRegion";
import { BuyerInvoiceForm } from "./BuyerInvoiceForm";

const dt = (d: Date) => d.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" });

export async function BuyerInvoices({ tenantId, money }: { tenantId: string; money: (k: number) => string }) {
  const R = schema.fiscalRefunds, D = schema.fiscalDocuments, RS = alias(schema.sales, "refund_sale");
  const rows = await withTenant(tenantId, (tx) =>
    tx.select({ id: R.id, at: R.createdAt, number: D.number, buyer: D.buyer, refundNo: RS.receiptNo, total: RS.total })
      .from(R).innerJoin(D, eq(D.id, R.fiscalDocId)).innerJoin(RS, eq(RS.id, R.refundSaleId))
      .where(and(eq(R.kind, "alici_faturasi"), isNull(R.resolvedAt))).orderBy(asc(R.createdAt)).limit(100));
  if (rows.length === 0) return null;
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
  return (
    <Card className="mb-5 border-warn/30" data-testid="buyer-invoices">
      <div className="border-b border-line bg-warn-soft px-4 py-3">
        <h2 className="font-semibold text-warn">Alıcının iade faturası bekleniyor ({rows.length})</h2>
        <p className="text-xs text-ink-2">İşletme genelindeki açık iadeler. Firmaya kesilen e-Arşiv faturasının kısmi iadesinde iade faturasını alıcı düzenler; gelen faturanın numarası ve tarihini girin.</p>
      </div>
      <div className="grid gap-3 p-3 lg:hidden">
        {rows.map((r) => (
          <article key={r.id} className="min-w-0 rounded-xl border border-line bg-surface p-3">
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
              <div className="font-medium">İade {r.refundNo}</div>
              <time className="text-xs text-muted">{dt(r.at)}</time>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line pt-2 text-sm">
              <div className="col-span-2 min-w-0"><dt className="text-xs text-muted">Alıcı</dt><dd className="break-words">{r.buyer.name} <span className="text-muted">· {r.buyer.taxId}</span></dd></div>
              <div className="min-w-0"><dt className="text-xs text-muted">Asıl fatura</dt><dd className="break-words font-mono text-xs">{r.number}</dd></div>
              <div className="min-w-0"><dt className="text-xs text-muted">İade tutarı</dt><dd className="tabular-nums">{money(r.total)}</dd></div>
            </dl>
            <div className="mt-3 border-t border-line pt-3"><BuyerInvoiceForm id={r.id} today={today} /></div>
          </article>
        ))}
      </div>
      <HorizontalScrollRegion label="Alıcı iade faturaları, yatay kaydırılabilir" className="hidden lg:block">
      <table aria-label="Alıcı iade faturaları" className="w-full min-w-[820px] text-sm">
        <thead className={TABLE_HEAD}><tr>{["İade", "Alıcı", "Asıl fatura", "Tutar", "Alıcının faturası"].map((h) => <th scope="col" key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">{rows.map((r) => (
          <tr key={r.id} className="align-top">
            <td className="whitespace-nowrap px-4 py-3">{r.refundNo}<div className="text-xs text-muted">{dt(r.at)}</div></td>
            <td className="px-4 py-3">{r.buyer.name}<div className="text-xs text-muted">{r.buyer.taxId}</div></td>
            <td className="px-4 py-3 font-mono text-xs">{r.number}</td>
            <td className="whitespace-nowrap px-4 py-3 tabular-nums">{money(r.total)}</td>
            <td className="px-4 py-3"><BuyerInvoiceForm id={r.id} today={today} /></td>
          </tr>
        ))}</tbody>
      </table>
      </HorizontalScrollRegion>
    </Card>
  );
}
