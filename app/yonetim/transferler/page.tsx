// HQ: şubeler arası stok transferi — kaynak şubeden düşer, hedef şubeye ekler.
import Link from "next/link";
import { SHIPMENT_LABELS } from "@/lib/admin/transfer";
import { desc, eq, inArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { stockLevels } from "@/lib/admin/stock";
import { formatQty } from "@/lib/core/stock";
import { TransferForm, type TransferProduct } from "@/components/admin/TransferForm";
import { Select } from "@/components/Select";
import { Button, Card, Empty, Field, PageHeader, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";

const dt = new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" });
const qtyLabel = (qty: number, unit: TransferProduct["unit"]) => `${formatQty(qty, unit)}${unit === "adet" ? " adet" : ""}`;

type RecentLine = { transferId: string; productId: string; name: string; qtyMilli: number; unit: TransferProduct["unit"] };
type RecentTransfer = { status: string; id: string; fromName: string; toName: string; note: string | null; createdAt: Date; lines: RecentLine[] };

export default async function Transferler({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const a = await requireAdmin();
  const sp = await searchParams;
  const { stores, from, to, products, transfers } = await withTenant(a.tenantId, async (tx) => {
    const allStores = await tx.select({ id: schema.stores.id, name: schema.stores.name, kind: schema.stores.kind }).from(schema.stores).orderBy(schema.stores.name);
    const stores = a.storeId ? allStores.filter((s) => s.kind === "sube") : allStores;
    const from = a.storeId ? (stores.find((s) => s.id === a.storeId) ?? null) : (stores.find((s) => s.id === sp.from) ?? stores[0] ?? null);
    const to = stores.find((s) => s.id === sp.to && s.id !== from?.id) ?? stores.find((s) => s.id !== from?.id) ?? null;
    if (!from || !to) return { stores, from, to, products: [] as TransferProduct[], transfers: [] as RecentTransfer[] };

    const products = (await stockLevels(tx, from.id)).map((r) => ({
      id: r.id,
      label: `${r.name} · ${qtyLabel(r.level, r.unit)}`,
      unit: r.unit,
      level: r.level,
    }));

    const T = schema.stockTransfers, TL = schema.stockTransferLines, P = schema.products;
    const F = alias(schema.stores, "from_store"), TO = alias(schema.stores, "to_store");
    const recent = await tx.select({
      id: T.id, fromName: F.name, toName: TO.name, note: T.note, createdAt: T.createdAt, status: T.status,
    }).from(T)
      .innerJoin(F, eq(F.id, T.fromStoreId))
      .innerJoin(TO, eq(TO.id, T.toStoreId))
      .where(a.storeId ? or(eq(T.fromStoreId, a.storeId), eq(T.toStoreId, a.storeId)) : undefined)
      .orderBy(desc(T.createdAt))
      .limit(20);
    const ids = recent.map((r) => r.id);
    const lines = ids.length ? await tx.select({ transferId: TL.transferId, productId: P.id, name: P.name, qtyMilli: TL.qtyMilli, kind: P.kind, unit: P.unit, sellable: P.sellable })
      .from(TL).innerJoin(P, eq(P.id, TL.productId)).where(inArray(TL.transferId, ids)) : [];
    const byTransfer = new Map<string, RecentLine[]>();
    for (const l of lines) {
      const unit = l.sellable ? (l.kind === "tartili" ? "kg" : "adet") : l.unit;
      byTransfer.set(l.transferId, [...(byTransfer.get(l.transferId) ?? []), { transferId: l.transferId, productId: l.productId, name: l.name, qtyMilli: l.qtyMilli, unit }]);
    }
    return { stores, from, to, products, transfers: recent.map((r) => ({ ...r, lines: byTransfer.get(r.id) ?? [] })) as RecentTransfer[] };
  });

  return (
    <>
      <PageHeader
        title="Şubeler arası transfer"
        desc="Kaynak stok gönderimde düşer; hedef stok teslim alma onayında artar. Sevkiyatı açıp yola çıktı, teslim veya iptal işlemini yapın."
        actions={<Link href="/yonetim/hq" className="text-sm text-brand hover:underline">Zincir merkezi →</Link>}
      />
      {stores.length < 2 ? (
        <Empty>
          Transfer için en az iki şube gerekir.{" "}
          <Link href="/yonetim/subeler" className="font-medium text-brand underline underline-offset-2">Şube ekleyin</Link>.
        </Empty>
      ) : (
        <>
          <Card className="mb-6 p-4">
            <form method="get" className="flex flex-wrap items-end gap-3">
              {a.storeId ? (
                <div className="w-52"><Field label="Kaynak şube" hint="Şubeniz sabit"><div className="flex min-h-11 items-center rounded-lg border border-line bg-surface-2 px-3 text-sm">{from?.name ?? "Şube"}</div></Field></div>
              ) : (
                <div className="w-52"><Field label="Kaynak şube"><Select name="from" defaultValue={from?.id ?? ""} options={stores.map((s) => ({ value: s.id, label: s.kind === "depo" ? `${s.name} · depo` : s.name }))} /></Field></div>
              )}
              <div className="w-52"><Field label="Hedef şube"><Select name="to" defaultValue={to?.id ?? ""} options={stores.map((s) => ({ value: s.id, label: s.kind === "depo" ? `${s.name} · depo` : s.name }))} /></Field></div>
              <Button type="submit" variant="secondary">Stokları getir</Button>
              <p className="basis-full text-xs text-muted">Ürün listesi ve kaynak stoklar seçilen kaynak şubeye göre gelir.</p>
            </form>
          </Card>

          <section aria-label="Yeni transfer" className="mb-8">
            <Panel title={`Yeni transfer · ${from?.name ?? ""} → ${to?.name ?? ""}`} desc="Tek transferde en fazla 20 ürün gönderin. Bir üründe stok yetersizse hiçbir ürün aktarılmaz.">
              {products.length === 0 ? (
                <p className="text-sm text-muted">
                  Kaynak şubede stok takipli ürün yok.{" "}
                  <Link href="/yonetim/urunler" className="font-medium text-brand underline underline-offset-2">Ürünler’de stok takibini açın</Link>.
                </p>
              ) : (
                <TransferForm key={`${from!.id}:${to!.id}`} fromStoreId={from!.id} toStoreId={to!.id} products={products} />
              )}
            </Panel>
          </section>

          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Son transferler</h2>
          {transfers.length === 0 ? (
            <Card className="p-6 text-sm text-muted">Henüz transfer yok. İlk transferi yukarıdaki formdan yapın.</Card>
          ) : (
            <Card className="divide-y divide-line">
              {transfers.map((t) => (
                <div key={t.id} className="p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="min-w-0 break-words font-medium text-ink"><Link href={`/yonetim/transferler/${t.id}`} className="hover:text-brand hover:underline">{t.fromName} → {t.toName}</Link></h3>
                    <time dateTime={t.createdAt.toISOString()} className="shrink-0 text-xs tabular text-muted">{dt.format(t.createdAt)}</time>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-brand">{SHIPMENT_LABELS[t.status] ?? t.status}</p><ul className="mt-1 space-y-0.5 text-sm">
                    {t.lines.map((l) => (
                      <li key={`${t.id}-${l.productId}`} className="flex flex-wrap justify-between gap-2">
                        <span className="min-w-0 break-words">{l.name}</span>
                        <span className="shrink-0 tabular text-ink-2">{qtyLabel(l.qtyMilli, l.unit)}</span>
                      </li>
                    ))}
                  </ul>
                  {t.note && <p className="mt-1 break-words text-xs text-muted">{t.note}</p>}
                  <Link href={`/yonetim/transferler/${t.id}`} className="mt-3 inline-flex min-h-11 items-center text-sm text-brand underline underline-offset-2">Detay / Yazdır</Link>
                </div>
              ))}
            </Card>
          )}
        </>
      )}
    </>
  );
}
