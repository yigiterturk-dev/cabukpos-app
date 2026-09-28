import Link from "next/link";
import { withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { supplierStatement, suppliersWithBalance } from "@/lib/admin/purchase";
import { formatTL } from "@/lib/core/money";
import { PaymentForm, SupplierForm } from "@/components/admin/PurchaseForms";
import { Card, Empty, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
const today = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
const day = (d: string) => d.split("-").reverse().join(".");
const bal = (k: number) => (k > 0 ? `${formatTL(k)} borç` : k < 0 ? `${formatTL(-k)} alacak` : "—");

export default async function Tedarikciler({ searchParams }: { searchParams: Promise<{ id?: string; duzenle?: string }> }) {
  const a = await requireAdmin();
  const { id, duzenle } = await searchParams;
  const { sups, st } = await withTenant(a.tenantId, async (tx) => {
    const sups = await suppliersWithBalance(tx);
    const sel = sups.find((s) => s.id === id);
    return { sups, st: sel ? await supplierStatement(tx, sel.id) : null };
  });
  const sel = sups.find((s) => s.id === id);
  const editing = sups.find((s) => s.id === duzenle);
  return (
    <>
      <PageHeader title="Tedarikçiler" desc="Bakiye = kayıtlı alışlar − ödemeler. Pozitif bakiye tedarikçiye borcunuz." />
      {sel && st ? (
        <Card className="mb-6 p-5">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">{sel.name}{sel.phone && <span className="ml-2 text-sm font-normal text-muted">{sel.phone}</span>}</h2>
            <div className="text-sm">Bakiye <b className="tabular" data-testid="supplier-balance">{bal(st.balance)}</b> · <Link href={`/yonetim/tedarikciler?duzenle=${sel.id}`} className="underline">düzenle</Link> · <Link href="/yonetim/tedarikciler" className="underline">kapat</Link></div>
          </div>
          <PaymentForm supplierId={sel.id} today={today()} />
          {st.rows.length === 0 ? <p className="mt-4 text-sm text-muted">Hareket yok.</p> : (
            <table className="mt-4 w-full text-sm">
              <tbody className="divide-y divide-line">
                {st.rows.map((r) => (
                  <tr key={r.id} className={r.cancelled ? "opacity-60 line-through" : ""}>
                    <td className="tabular p-2 text-muted">{day(r.date)}</td>
                    <td className="p-2">{r.text}{r.cancelled && " (iptal)"}</td>
                    <td className={`tabular p-2 text-right ${r.amount < 0 ? "text-emerald-700" : ""}`}>{r.amount < 0 ? "−" : "+"}{formatTL(Math.abs(r.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      ) : (
        <Card className="mb-6 p-5">
          <h2 className="mb-4 font-semibold">{editing ? `Düzenle: ${editing.name}` : "Tedarikçi ekle"}</h2>
          <SupplierForm key={editing?.id ?? "yeni"} initial={editing && { id: editing.id, name: editing.name, phone: editing.phone, taxNo: editing.taxNo, note: editing.note }} />
        </Card>
      )}
      {sups.length === 0 ? <Empty>Henüz tedarikçi yok.</Empty> : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-muted"><tr><th className="p-3 font-medium">Tedarikçi</th><th className="p-3 font-medium">Telefon</th><th className="p-3 text-right font-medium">Bakiye</th><th className="p-3" /></tr></thead>
            <tbody className="divide-y divide-line">
              {sups.map((s) => (
                <tr key={s.id} data-testid={`supplier-${s.name}`}>
                  <td className="p-3 font-medium">{s.name}</td>
                  <td className="p-3 text-muted">{s.phone ?? ""}</td>
                  <td className={`tabular p-3 text-right ${s.balance > 0 ? "font-medium" : "text-muted"}`}>{bal(s.balance)}</td>
                  <td className="p-3 text-right"><Link href={`/yonetim/tedarikciler?id=${s.id}`} className="text-brand underline">Döküm</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
