import { createHash } from "node:crypto";
import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { schema, type Tx } from "@/db";
import { isValidCalendarDay } from "@/lib/core/report";
import { PLATFORM_NAMES } from "@/lib/core/platform";
import { settlementMath } from "@/lib/core/platform-settlement";
import { audit } from "@/lib/audit";
export type SettlementInput = { platform: string; fromDay: string; toDay: string; commissionBps: number; commissionBase: "gross" | "online"; courierCost: number; adjustment: number; actual: number; note: string };
export function validPeriod(from: string, to: string) { return isValidCalendarDay(from) && isValidCalendarDay(to) && from <= to && Date.parse(to) - Date.parse(from) <= 366 * 86400000; }
export async function platformPeriod(tx: Tx, storeId: string, platform: string, from: string, to: string) {
  if (!validPeriod(from, to) || !Object.hasOwn(PLATFORM_NAMES, platform)) throw new Error("Platform ve en fazla bir yıllık tarih aralığı seçin.");
  // Refunds inherit source identity from the original sale. LEFT JOIN keeps payments from multiplying sale totals.
  const rows = await tx.execute<{ id: string; total: number; discount: number; online: number; status: string; change: number }>(sql`
    select s.id, s.total, s.discount, s.status, s.change,
      coalesce((select sum(p.amount) from payments p where p.sale_id=s.id and p.method='online'),0)::int online
    from sales s left join sales original on original.id=s.refund_of and original.tenant_id=s.tenant_id
    where s.store_id=${storeId}::uuid and s.status in ('kapandi','iade')
      and s.created_at >= (${from}::date::timestamp at time zone 'Europe/Istanbul')
      and s.created_at < ((${to}::date+1)::timestamp at time zone 'Europe/Istanbul')
      and exists(select 1 from tab_events e where e.tenant_id=s.tenant_id and e.store_id=s.store_id
        and e.tab_id=coalesce(s.tab_id,original.tab_id) and e.type='order' and e.payload->'source'->>'platform'=${platform}) order by s.id`);
  const gross = rows.reduce((n,r) => n + (r.status === "iade" ? -1 : 1) * (r.total-r.discount),0);
  const online = rows.reduce((n,r) => n + (r.status === "iade" ? -1 : 1) * r.online,0);
  return { gross, online, count: rows.length, fingerprint: createHash("sha256").update(JSON.stringify(rows)).digest("hex") };
}
export async function saveSettlement(tx: Tx, tenantId: string, storeId: string, actor: string, input: SettlementInput) {
  if(!(await tx.select({id:schema.stores.id}).from(schema.stores).where(eq(schema.stores.id,storeId))).length)throw new Error("Şube bulunamadı.");
  const T = schema.platformSettlements;
  if (input.note.length > 1000 || !["gross", "online"].includes(input.commissionBase)) throw new Error("Hesaplama bilgileri geçersiz.");
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${JSON.stringify([tenantId,storeId,input.platform,"settlement"])}))`);
  const [prior] = await tx.select().from(T).where(and(eq(T.storeId,storeId),eq(T.platform,input.platform),isNull(T.voidedAt),lte(T.fromDay,input.toDay),gte(T.toDay,input.fromDay)));
  if (prior) throw new Error("Bu platformda seçilen günleri kapsayan bir hesap zaten var. Önce mevcut kaydı inceleyin.");
  const period = await platformPeriod(tx,storeId,input.platform,input.fromDay,input.toDay);
  const result = settlementMath(period.gross,period.online,input.commissionBps,input.commissionBase,input.courierCost,input.adjustment,input.actual);
  const [row] = await tx.insert(T).values({tenantId,storeId,...input,gross:period.gross,online:period.online,expected:result.expected,fingerprint:period.fingerprint,createdBy:actor}).returning();
  await audit(tx,tenantId,actor,"platform.settlement",{id:row.id,...input,...period,...result});
  return row.id;
}
export async function voidSettlement(tx:Tx,tenantId:string,storeId:string,actor:string,id:string,reason:string){
 if(reason.trim().length<3||reason.length>1000)throw new Error("İptal/düzeltme gerekçesini yazın (3–1000 karakter).");
 const T=schema.platformSettlements;const [row]=await tx.select().from(T).where(and(eq(T.id,id),eq(T.storeId,storeId))).for("update");
 if(!row)throw new Error("Hesap bulunamadı.");if(row.voidedAt)return;
 await tx.update(T).set({voidedAt:new Date()}).where(eq(T.id,id));
 await audit(tx,tenantId,actor,"platform.settlement.void",{id,reason,storeId});
}
