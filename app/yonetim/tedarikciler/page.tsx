import Link from "next/link";
import { withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { supplierStatement, suppliersWithBalance } from "@/lib/admin/purchase";
import { moneyFormatter } from "@/lib/admin/currency";
import { PaymentForm, SupplierForm } from "@/components/admin/PurchaseForms";
import { HorizontalScrollRegion } from "@/components/HorizontalScrollRegion";
import { Card, Empty, PageHeader, Panel, SplitView } from "@/components/ui";

export const dynamic = "force-dynamic";
const today = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
const day = (d: string) => d.split("-").reverse().join(".");
const telHref = (phone: string) => "tel:" + (phone.trim().startsWith("+") ? "+" : "") + [...phone].filter((char) => char >= "0" && char <= "9").join("");
export default async function Tedarikciler({ searchParams }: { searchParams: Promise<{ id?: string; duzenle?: string }> }) {
  const a = await requireAdmin();
  const money = await moneyFormatter(a.tenantId);
  const bal = (k: number) => (k > 0 ? `${money(k)} borç` : k < 0 ? `${money(-k)} alacak` : "—");
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
      <SplitView wide
        panel={sel && st ? (
        <Card className="p-5">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">{sel.name}{sel.phone && <span className="ml-2 text-sm font-normal text-muted">{sel.phone}</span>}</h2>
            <div className="flex flex-wrap items-center gap-1 text-sm">Bakiye <b className={`tabular ${st.balance > 0 ? "text-warn" : st.balance < 0 ? "text-ok" : ""}`} data-testid="supplier-balance">{bal(st.balance)}</b><span aria-hidden>·</span><Link href={`/yonetim/tedarikciler?duzenle=${sel.id}`} className="inline-flex min-h-11 items-center rounded-lg px-2.5 underline outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60">düzenle</Link><span aria-hidden>·</span><Link href="/yonetim/tedarikciler" className="inline-flex min-h-11 items-center rounded-lg px-2.5 underline outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60">kapat</Link></div>
          </div>
          <PaymentForm supplierId={sel.id} today={today()} />
          {st.rows.length === 0 ? <p className="mt-4 text-sm text-muted">Hareket yok.</p> : (
            <div className="mt-4 min-w-0">
            <table aria-label="Tedarikçi hesap hareketleri" className="w-full table-fixed text-sm">
              <tbody className="divide-y divide-line">
                {st.rows.map((r) => (
                  <tr key={r.id} className={r.cancelled ? "opacity-60 line-through" : ""}>
                    <td className="w-16 break-words p-2 align-top text-xs tabular text-muted">{day(r.date)}</td>
                    <td className="break-words p-2 align-top">{r.text}{r.cancelled && " (iptal)"}</td>
                    <td className={`w-28 break-words p-2 align-top text-right tabular ${r.amount < 0 ? "text-ok" : ""}`}>{r.amount < 0 ? "−" : "+"}{money(Math.abs(r.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </Card>
      ) : (
        <Panel title={editing ? `Düzenle: ${editing.name}` : "Tedarikçi ekle"} tone={editing ? "edit" : undefined}>
          <SupplierForm key={editing?.id ?? "yeni"} initial={editing && { id: editing.id, name: editing.name, phone: editing.phone, taxNo: editing.taxNo, note: editing.note }} />
        </Panel>
      )}
        list={<>
      {sups.length === 0 ? <Empty>Henüz tedarikçi yok.</Empty> : (
        <>
        <Card className="overflow-hidden lg:hidden">
          <ul aria-label="Tedarikçi listesi" className="divide-y divide-line">
            {sups.map((s) => (
              <li key={s.id} className={`space-y-3 p-4 ${s.id === id ? "bg-brand-soft/45" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="break-words font-medium">{s.name}</p>{s.phone && <a href={telHref(s.phone)} aria-label={`Ara ${s.name}, ${s.phone}`} className="mt-1 inline-flex min-h-11 items-center text-sm text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">{s.phone}</a>}</div>
                  <p className={`shrink-0 text-right text-sm ${s.balance > 0 ? "font-medium text-warn" : s.balance < 0 ? "font-medium text-ok" : "text-muted"}`}><span className="sr-only">Bakiye: </span>{bal(s.balance)}</p>
                </div>
                <div className="border-t border-line pt-2"><Link href={`/yonetim/tedarikciler?id=${s.id}`} className="inline-flex min-h-11 items-center rounded-lg px-3 font-medium text-brand outline-none hover:bg-brand-soft hover:underline focus-visible:ring-4 focus-visible:ring-brand-ring/60">Döküm</Link></div>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="hidden p-0 lg:block">
          <HorizontalScrollRegion label="Tedarikçi listesi, yatay kaydırılabilir" className="rounded-2xl">
          <table aria-label="Tedarikçi listesi" className="w-full min-w-[600px] text-sm">
            <thead className="border-b border-line bg-surface-2 text-left text-xs text-muted"><tr><th scope="col" className="px-4 py-2.5 font-medium">Tedarikçi</th><th scope="col" className="px-4 py-2.5 font-medium">Telefon</th><th scope="col" className="px-4 py-2.5 text-right font-medium">Bakiye</th><th scope="col" className="sticky right-0 z-20 bg-surface-2 px-4 py-2.5 text-right font-medium shadow-[-8px_0_12px_-12px_rgb(40_24_8/0.45)]">Aksiyonlar</th></tr></thead>
            <tbody className="divide-y divide-line">
              {sups.map((s) => (
                <tr key={s.id} data-testid={`supplier-${s.name}`} className={`${s.id === id ? "bg-brand-soft/45" : "hover:bg-surface-2"}`}>
                  <td className="max-w-[16rem] px-4 py-2.5 font-medium"><span className="block truncate" title={s.name}>{s.name}</span></td>
                  <td className="px-4 py-2.5 text-muted">{s.phone ?? ""}</td>
                  <td className={`tabular px-4 py-2.5 text-right ${s.balance > 0 ? "font-medium text-warn" : s.balance < 0 ? "font-medium text-ok" : "text-muted"}`}>{bal(s.balance)}</td>
                  <td className={`sticky right-0 px-4 py-2.5 text-right shadow-[-8px_0_12px_-12px_rgb(40_24_8/0.35)] ${s.id === id ? "bg-brand-soft/90" : "bg-surface"}`}><Link href={`/yonetim/tedarikciler?id=${s.id}`} className="inline-flex min-h-11 items-center rounded-lg px-2 font-medium text-brand outline-none hover:bg-brand-soft hover:underline focus-visible:ring-4 focus-visible:ring-brand-ring/60">Döküm</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
          </HorizontalScrollRegion>
        </Card>
        </>
      )}
        </>}
      />
    </>
  );
}
