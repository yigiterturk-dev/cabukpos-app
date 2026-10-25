import { randomUUID } from "node:crypto";
import Link from "next/link";
import { and, eq, gt, sql } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { scopedStoreId } from "@/lib/admin/store-scope";
import { stockLevels } from "@/lib/admin/stock";
import { istToday } from "@/lib/core/report";
import { formatQty, stockUnitOf } from "@/lib/core/stock";
import { LotForm, InventoryStatusForm } from "@/components/admin/InventoryForms";
import { Card, Empty, PageHeader, buttonClass } from "@/components/ui";
export const dynamic="force-dynamic";
export default async function LotsPage(){
 const a=await requireAdmin();const data=await withTenant(a.tenantId,async tx=>{const id=await scopedStoreId(tx,a.tenantId,a.storeId);if(!id)return null;return{products:await stockLevels(tx,id),lots:await tx.select({lot:schema.stockLots,product:schema.products}).from(schema.stockLots).innerJoin(schema.products,eq(schema.products.id,schema.stockLots.productId)).where(and(eq(schema.stockLots.storeId,id),gt(schema.stockLots.remaining,0))).orderBy(sql`${schema.stockLots.expiresOn} asc nulls last`,schema.stockLots.createdAt)};});if(!data)return <Empty>Şube bulunamadı.</Empty>;
 const today=istToday(),soon=istToday(new Date().getTime(),7);
 return <><PageHeader title="Parti ve son kullanma tarihi" desc="Parti miktarları mevcut stoğun izlenebilir bölümüdür. Etiketsiz iadeler yeniden etiketlenebilir."/><div className="mb-4 flex flex-wrap gap-2"><Link className={buttonClass("secondary")} href="/yonetim/tedarik">Tedarik siparişleri →</Link><Link className={buttonClass("ghost")} href="/yonetim/stok">Stok →</Link></div><details className="mb-5 rounded-2xl border border-line bg-surface p-5"><summary className="cursor-pointer font-semibold text-brand">+ Mevcut stoğu partiye ayır</summary><div className="pt-4"><LotForm products={data.products} id={randomUUID()}/></div></details><div className="space-y-3">{data.lots.map(({lot:l,product:p})=><Card key={l.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><h2 className="font-semibold">{p.name} · {l.code}</h2><p>{formatQty(l.remaining,stockUnitOf(p))} · SKT: {l.expiresOn??"Belirtilmedi"}</p>{l.expiresOn&&l.expiresOn<today?<p className="text-bad">Süresi geçti · kullanımdan ayırın</p>:l.expiresOn&&l.expiresOn<=soon?<p className="text-warn">7 gün içinde doluyor</p>:null}</div><details><summary className="cursor-pointer text-sm text-bad">İmha işlemi</summary><p className="my-2 text-xs">Kalan partinin tamamı stoktan düşer.</p><InventoryStatusForm id={l.id} kind="dispose" label="Partinin tamamını imha et"/></details></Card>)}{!data.lots.length&&<Empty>Takip edilen açık parti yok.</Empty>}</div></>;
}
