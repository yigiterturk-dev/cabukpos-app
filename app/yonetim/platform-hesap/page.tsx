import { desc, eq } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { scopedStoreId } from "@/lib/admin/store-scope";
import { platformPeriod } from "@/lib/admin/platform-settlement";
import { PLATFORM_NAMES } from "@/lib/core/platform";
import { istToday } from "@/lib/core/report";
import { formatMoney } from "@/lib/core/money";
import { Card, Empty, PageHeader } from "@/components/ui";
import { SettlementForm, SettlementVoidForm } from "@/components/admin/SettlementForm";
export const dynamic="force-dynamic";
export default async function PlatformAccounts(){
 const a=await requireAdmin(); const rows=await withTenant(a.tenantId,async tx=>{const id=await scopedStoreId(tx,a.tenantId,a.storeId);if(!id)return [];const entries=await tx.select().from(schema.platformSettlements).where(eq(schema.platformSettlements.storeId,id)).orderBy(desc(schema.platformSettlements.createdAt)).limit(100);return Promise.all(entries.map(async r=>({...r,stale:(await platformPeriod(tx,id,r.platform,r.fromDay,r.toDay)).fingerprint!==r.fingerprint})));});
 return <><PageHeader title="Platform hakediş hesabı" desc="İadeler düşülür. Kapıda alınan nakit ve kart platformdan beklenecek paraya eklenmez." /><details className="mb-5 rounded-2xl border border-line bg-surface p-5"><summary className="cursor-pointer font-semibold text-brand">+ Dönem hesabı oluştur</summary><div className="pt-4"><SettlementForm day={istToday()} /></div></details><div className="space-y-3">{rows.map(r=><Card key={r.id} className="p-5"><h2 className="font-semibold">{r.voidedAt&&"İPTAL · "}{PLATFORM_NAMES[r.platform]} · {r.fromDay} – {r.toDay}</h2><div className="my-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><p>Net satış: {formatMoney(r.gross)}</p><p>Çevrimiçi: {formatMoney(r.online)}</p><p>Komisyon: {formatMoney(Math.round((r.commissionBase==="gross"?r.gross:r.online)*r.commissionBps/10000))} (%{r.commissionBps/100})</p><p>Kurye: {formatMoney(r.courierCost)}</p><p>Düzeltme: {formatMoney(r.adjustment)}</p><p>Beklenen: <strong>{formatMoney(r.expected)}</strong></p><p>Gelen: {formatMoney(r.actual)}</p><p className={r.actual===r.expected?"text-ok":"text-bad"}>Fark: <strong>{formatMoney(r.actual-r.expected)}</strong></p></div>{r.note&&<p className="break-words text-sm">{r.note}</p>}{r.stale&&!r.voidedAt&&<p role="alert" className="mt-3 text-warn">Bu döneme sonradan satış/iade eşitlendi. Kaydedilen hesap eski veriye dayanıyor; ödeme belgesiyle tekrar karşılaştırın.</p>}{!r.voidedAt&&<SettlementVoidForm id={r.id}/>}</Card>)}{!rows.length&&<Empty>Henüz kayıt yok. Yeni dönem hesabı açın.</Empty>}</div></>;
}
