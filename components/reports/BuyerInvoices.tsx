// VKN'li alıcıya kesilmiş e-Arşiv'in kısmi iadesi: alıcının iade faturası girilene kadar açık (dönemden bağımsız).
import { and, asc, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { schema, withTenant } from "@/db";
import { formatTL } from "@/lib/core/money";
import { Card } from "@/components/ui";
import { BuyerInvoiceForm } from "./BuyerInvoiceForm";

const dt = (d: Date) => d.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" });

export async function BuyerInvoices({ tenantId }: { tenantId: string }) {
  const R = schema.fiscalRefunds, D = schema.fiscalDocuments, RS = alias(schema.sales, "refund_sale");
  const rows = await withTenant(tenantId, (tx) =>
    tx.select({ id: R.id, at: R.createdAt, number: D.number, buyer: D.buyer, refundNo: RS.receiptNo, total: RS.total })
      .from(R).innerJoin(D, eq(D.id, R.fiscalDocId)).innerJoin(RS, eq(RS.id, R.refundSaleId))
      .where(and(eq(R.kind, "alici_faturasi"), isNull(R.resolvedAt))).orderBy(asc(R.createdAt)).limit(100));
  if (rows.length === 0) return null;
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
  return (
    <Card className="mb-5 overflow-x-auto border-warn/30" data-testid="buyer-invoices">
      <div className="border-b border-line bg-warn-soft px-4 py-3">
        <h2 className="font-semibold text-warn">Alıcının iade faturası bekleniyor ({rows.length})</h2>
        <p className="text-xs text-ink-2">Firmaya kesilen e-Arşiv faturasının kısmi iadesinde iade faturasını alıcı düzenler. Gelen faturanın numarası ve tarihini girin.</p>
      </div>
      <table className="w-full text-sm">
        <thead className="border-b border-line bg-surface-2 text-left text-xs text-muted"><tr>{["İade", "Alıcı", "Asıl fatura", "Tutar", "Alıcının faturası"].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">{rows.map((r) => (
          <tr key={r.id} className="align-top">
            <td className="whitespace-nowrap px-4 py-3">{r.refundNo}<div className="text-xs text-muted">{dt(r.at)}</div></td>
            <td className="px-4 py-3">{r.buyer.name}<div className="text-xs text-muted">{r.buyer.taxId}</div></td>
            <td className="px-4 py-3 font-mono text-xs">{r.number}</td>
            <td className="whitespace-nowrap px-4 py-3 tabular-nums">{formatTL(r.total)}</td>
            <td className="px-4 py-3"><BuyerInvoiceForm id={r.id} today={today} /></td>
          </tr>
        ))}</tbody>
      </table>
    </Card>
  );
}
