// Merkez depo: HQ alışlarının girdiği, satış yapmayan şube. Depo stoğu, girişler ve şubelere dağıtım.
import Link from "next/link";
import { redirect } from "next/navigation";
import { alias } from "drizzle-orm/pg-core";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { seesAllStores } from "@/lib/core/access";
import { stockLevels } from "@/lib/admin/stock";
import { moneyFormatter } from "@/lib/admin/currency";
import { formatQty, stockUnitOf } from "@/lib/core/stock";
import { Badge, buttonClass, Card, Empty, PageHeader, TABLE_HEAD } from "@/components/ui";
import { HorizontalScrollRegion } from "@/components/HorizontalScrollRegion";

export const dynamic = "force-dynamic";
const day = (d: string) => d.split("-").reverse().join(".");

export default async function Depo({ searchParams }: { searchParams: Promise<{ depo?: string }> }) {
  const a = await requireAdmin();
  if (!seesAllStores(a)) redirect("/yonetim");
  const sp = await searchParams;
  const money = await moneyFormatter(a.tenantId);
  const { depots, active, rows, purchases, transfers } = await withTenant(a.tenantId, async (tx) => {
    const depots = await tx.select({ id: schema.stores.id, name: schema.stores.name }).from(schema.stores).where(eq(schema.stores.kind, "depo")).orderBy(schema.stores.name);
    const active = depots.find((d) => d.id === sp.depo) ?? depots[0] ?? null;
    if (!active) return { depots, active: null, rows: [], purchases: [], transfers: [] };

    const rows = await stockLevels(tx, active.id);
    const Pu = schema.purchases, P = schema.products;
    const purchases = await tx.select({ id: Pu.id, date: Pu.date, docNo: Pu.docNo, total: Pu.total, supplier: schema.suppliers.name })
      .from(Pu).leftJoin(schema.suppliers, eq(schema.suppliers.id, Pu.supplierId))
      .where(and(eq(Pu.storeId, active.id), eq(Pu.status, "kayitli"))).orderBy(desc(Pu.date), desc(Pu.createdAt)).limit(10);

    const T = schema.stockTransfers, TL = schema.stockTransferLines, TO = alias(schema.stores, "to_store");
    const transfers = await tx.select({ id: T.id, toName: TO.name, note: T.note, createdAt: T.createdAt })
      .from(T).innerJoin(TO, eq(TO.id, T.toStoreId))
      .where(or(eq(T.fromStoreId, active.id), eq(T.toStoreId, active.id)))
      .orderBy(desc(T.createdAt)).limit(10);
    const ids = transfers.map((t) => t.id);
    const lines = ids.length ? await tx.select({ transferId: TL.transferId, name: P.name, qtyMilli: TL.qtyMilli, kind: P.kind, unit: P.unit, sellable: P.sellable }).from(TL).innerJoin(P, eq(P.id, TL.productId)).where(inArray(TL.transferId, ids)) : [];
    const byTransfer = new Map<string, string[]>();
    for (const l of lines) {
      const unit = stockUnitOf(l);
      byTransfer.set(l.transferId, [...(byTransfer.get(l.transferId) ?? []), `${l.name} ${formatQty(l.qtyMilli, unit)}`]);
    }
    return { depots, active, rows, purchases, transfers: transfers.map((t) => ({ ...t, lines: (byTransfer.get(t.id) ?? []).join(", ") })) };
  });

  if (!active) {
    return (
      <>
        <PageHeader title="Merkez depo" desc="Depo, satış yapmayan şube türüdür: HQ alışı depoya girer, buradan şubelere dağıtılır." />
        <Empty>
          Henüz depo yok.{" "}
          <Link href="/yonetim/subeler" className="font-medium text-brand underline underline-offset-2">Şubeler’den “Merkez depo” türünde bir kayıt oluşturun</Link>.
        </Empty>
      </>
    );
  }

  const totalValue = rows.reduce((s, r) => s + (r.cost != null && r.level > 0 ? Math.round((r.cost * r.level) / 1000) : 0), 0);
  const critical = rows.filter((r) => r.minStock !== null && r.level < r.minStock);
  return (
    <>
      <PageHeader
        title="Merkez depo"
        desc="Satış yapmayan şube: alışlar depoya girer, şubelere transferle dağıtılır. Kasa cihazı bağlanmaz."
        actions={<div className="flex flex-wrap gap-2"><Link href={`/yonetim/alislar?store=${active.id}`} className={buttonClass("primary", "sm")}>Depoya alış</Link><Link href={`/yonetim/transferler?from=${active.id}`} className={buttonClass("secondary", "sm")}>Şubelere dağıt</Link></div>}
      />

      {depots.length > 1 && (
        <nav aria-label="Depo seçimi" className="mb-5 flex flex-wrap gap-2">
          {depots.map((d) => (
            <Link key={d.id} href={`/yonetim/depo?depo=${d.id}`} className={`inline-flex min-h-11 items-center rounded-lg border px-3 text-sm outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${d.id === active.id ? "border-brand bg-brand-soft font-medium text-brand" : "border-line text-ink-2 hover:bg-surface-2"}`}>
              {d.name}
            </Link>
          ))}
        </nav>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card className="p-4"><p className="text-xs text-muted">Stok kalemi</p><p className="mt-1 text-2xl font-semibold tabular">{rows.length}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted">Stok değeri (maliyetle)</p><p className="mt-1 text-2xl font-semibold tabular">{money(totalValue)}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted">Kritik eşik altı</p><p className={`mt-1 text-2xl font-semibold tabular ${critical.length ? "text-bad" : ""}`}>{critical.length}</p></Card>
      </div>

      <section aria-label="Depo stoğu" className="mb-8">
        <h2 className="mb-3 font-semibold">Depo stoğu</h2>
        {rows.length === 0 ? <Empty>Depoda stok takipli ürün yok. Depoya alış girerek başlayın.</Empty> : (
          <Card className="overflow-hidden">
            <HorizontalScrollRegion label="Depo stoğu, yatay kaydırılabilir" className="rounded-2xl">
              <table aria-label="Depo stoğu" className="w-full min-w-[640px] text-sm">
                <thead className={TABLE_HEAD}><tr><th scope="col" className="p-3 font-medium">Ürün</th><th scope="col" className="p-3 text-right font-medium">Mevcut</th><th scope="col" className="p-3 text-right font-medium">Eşik</th><th scope="col" className="p-3 text-right font-medium">Değer</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => (
                    <tr key={r.id} className={r.level === 0 ? "text-muted" : ""}>
                      <td className="p-3"><span className="block max-w-[26rem] truncate" title={r.name}>{r.name}</span>{r.sellable && <span className="text-xs text-muted">satılabilir</span>}</td>
                      <td className="tabular p-3 text-right">{formatQty(r.level, r.unit)} {r.unit === "adet" ? "" : r.unit}</td>
                      <td className="tabular p-3 text-right">{r.minStock === null ? "—" : formatQty(r.minStock, r.unit)}</td>
                      <td className="tabular p-3 text-right">{r.cost == null || r.level <= 0 ? "—" : money(Math.round((r.cost * r.level) / 1000))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </HorizontalScrollRegion>
          </Card>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-label="Depoya son alışlar">
          <h2 className="mb-3 font-semibold">Son alışlar</h2>
          {purchases.length === 0 ? <Card className="p-5 text-sm text-muted">Depoya henüz alış girilmedi.</Card> : (
            <Card className="divide-y divide-line">
              {purchases.map((p) => (
                <div key={p.id} className="flex min-w-0 items-baseline gap-3 p-4">
                  <span className="min-w-0 flex-1 break-words text-sm">{p.supplier ?? "Tedarikçisiz"}{p.docNo ? ` · ${p.docNo}` : ""}</span>
                  <span className="shrink-0 text-xs text-muted">{day(p.date)}</span>
                  <span className="shrink-0 tabular text-sm font-medium">{money(p.total)}</span>
                </div>
              ))}
            </Card>
          )}
        </section>

        <section aria-label="Depo transferleri">
          <h2 className="mb-3 font-semibold">Son transferler</h2>
          {transfers.length === 0 ? <Card className="p-5 text-sm text-muted">Depodan henüz transfer yapılmadı.</Card> : (
            <Card className="divide-y divide-line">
              {transfers.map((t) => (
                <div key={t.id} className="space-y-1 p-4">
                  <div className="flex items-baseline gap-2"><Badge tone="neutral">{t.toName}</Badge><span className="ml-auto shrink-0 text-xs text-muted">{t.createdAt.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" })}</span></div>
                  <p className="break-words text-sm text-muted">{t.lines || "Kalem yok"}</p>
                  {t.note && <p className="break-words text-xs text-muted">{t.note}</p>}
                </div>
              ))}
            </Card>
          )}
        </section>
      </div>
    </>
  );
}
