import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import { schema, type Tx } from "@/db";
import { stockLevels } from "./stock";
import { audit } from "@/lib/audit";
import { isValidCalendarDay, istToday } from "@/lib/core/report";
type Move = typeof schema.stockMovements.$inferInsert;
const L=schema.stockLots,E=schema.stockLotEvents;
async function adjustLot(tx:Tx,lot:typeof L.$inferSelect,delta:number,actor:string,note:string,movementId:string|null=null){
 if(!delta)return;
 await tx.update(L).set({remaining:sql`${L.remaining}+${delta}`}).where(eq(L.id,lot.id));
 await tx.insert(E).values({tenantId:lot.tenantId,lotId:lot.id,qtyMilli:delta,actor,note,movementId});
 lot.remaining+=delta;
}
/** Product locks serialize all physical writers. Allocation follows effective aggregate change,
 * so a backdated movement hidden behind a newer count cannot consume current lots. */
export async function writeStock(tx:Tx,input:Move|Move[]){
 const moves=Array.isArray(input)?input:[input];if(!moves.length)return;
 const ids=[...new Set(moves.map(m=>m.productId))].sort();
 await tx.select({id:schema.products.id}).from(schema.products).where(inArray(schema.products.id,ids)).orderBy(schema.products.id).for("update");
 const stores=[...new Set(moves.map(m=>m.storeId))];
 const levels=new Map<string,number>();
 for(const store of stores)for(const p of await stockLevels(tx,store))levels.set(`${store}:${p.id}`,p.level);
 for(const move of moves){
  const [written]=await tx.insert(schema.stockMovements).values(move).returning();
  const key=`${move.storeId}:${move.productId}`,before=levels.get(key)??0;
  const after=(await stockLevels(tx,move.storeId)).find(p=>p.id===move.productId)?.level??0;levels.set(key,after);
  const lots=await tx.select().from(L).where(and(eq(L.storeId,move.storeId),eq(L.productId,move.productId),gt(L.remaining,0))).orderBy(sql`case when ${L.purchaseId} = ${move.purchaseId??null}::uuid then 0 else 1 end`,sql`${L.expiresOn} asc nulls last`,asc(L.createdAt),asc(L.id)).for("update");
  const total=lots.reduce((n,l)=>n+l.remaining,0);
  // Counts trim tracked lots; ordinary withdrawals consume FEFO before unlabelled stock.
  let consume=move.kind==="sayim"?Math.max(0,total-Math.max(0,after)):Math.max(Math.max(0,before-after),total-Math.max(0,after));
  for(const lot of lots){const qty=Math.min(consume,lot.remaining);await adjustLot(tx,lot,-qty,move.actor,"Stok hareketi · FEFO",written.id);consume-=qty;if(!consume)break;}
 }
}
/** Label existing unlabelled physical stock. This never adds aggregate stock. */
export async function labelStock(tx:Tx,tenantId:string,storeId:string,actor:string,input:{id?:string;purchaseId?:string;productId:string;qtyMilli:number;code:string;expiresOn:string|null}){
 if(!(await tx.select({id:schema.stores.id}).from(schema.stores).where(eq(schema.stores.id,storeId))).length)throw new Error("Şube bulunamadı.");
 if(!Number.isSafeInteger(input.qtyMilli)||input.qtyMilli<=0||input.qtyMilli>2147483647||input.code.trim().length<1||input.code.length>80||input.expiresOn&&!isValidCalendarDay(input.expiresOn))throw new Error("Parti, miktar ve SKT bilgilerini kontrol edin.");
 const [p]=await tx.select().from(schema.products).where(eq(schema.products.id,input.productId)).for("update");
 if(!p?.trackStock)throw new Error("Stok takipli ürün seçin.");
 if(input.id){
  if(!/^[0-9a-f-]{36}$/i.test(input.id))throw new Error("Kayıt kimliği geçersiz.");
  const [prior]=await tx.select().from(L).where(eq(L.id,input.id));
  if(prior){
   const events=await tx.select().from(E).where(and(eq(E.lotId,prior.id),eq(E.note,"Mevcut stoka parti etiketi")));
   if(prior.storeId!==storeId||prior.productId!==input.productId||prior.code!==input.code.trim()||prior.expiresOn!==input.expiresOn||events.reduce((n,e)=>n+e.qtyMilli,0)!==input.qtyMilli)throw new Error("Bu kayıt kimliği başka bir parti için kullanılmış.");
   return prior.id;
  }
 }
 const level=(await stockLevels(tx,storeId)).find(p=>p.id===input.productId)?.level??0;
 const existing=await tx.select().from(L).where(and(eq(L.storeId,storeId),eq(L.productId,input.productId)));
 if(existing.reduce((n,l)=>n+l.remaining,0)+input.qtyMilli>level)throw new Error("Etiketsiz stok yetersiz. Önce teslim alın veya sayım yapın.");
 const [lot]=await tx.insert(L).values({...(input.id?{id:input.id}:{}),tenantId,storeId,productId:input.productId,code:input.code.trim(),expiresOn:input.expiresOn,purchaseId:input.purchaseId,remaining:0}).returning();
 await adjustLot(tx,lot,input.qtyMilli,actor,"Mevcut stoka parti etiketi");
 await audit(tx,tenantId,actor,"stock.lot.label",{id:lot.id,...input});return lot.id;
}
export async function disposeLot(tx:Tx,tenantId:string,storeId:string,actor:string,id:string){
 const [hint]=await tx.select().from(L).where(and(eq(L.id,id),eq(L.storeId,storeId)));if(!hint)throw new Error("Parti bulunamadı.");
 await tx.select().from(schema.products).where(eq(schema.products.id,hint.productId)).for("update");
 const [lot]=await tx.select().from(L).where(eq(L.id,id)).for("update");if(!lot.remaining)return;
 const qty=lot.remaining;
 const [move]=await tx.insert(schema.stockMovements).values({tenantId,storeId,productId:lot.productId,kind:"fire",qtyMilli:-qty,actor,note:`Parti imhası: ${lot.code}`}).returning();
 await adjustLot(tx,lot,-qty,actor,"Parti imhası",move.id);
 await audit(tx,tenantId,actor,"stock.lot.dispose",{id,qtyMilli:qty,expired:!!lot.expiresOn&&lot.expiresOn<istToday()});
}
/** Carry the dispatched lot identity/SKT across receipt or restore it on cancellation.
 * Called only while the shipment header is locked, after its positive stock movement. */
export async function restoreShipmentLots(tx:Tx,tenantId:string,transferId:string,storeId:string,actor:string){
 const source=await tx.select({lot:L,qty:E.qtyMilli}).from(E).innerJoin(L,eq(L.id,E.lotId)).innerJoin(schema.stockMovements,eq(schema.stockMovements.id,E.movementId)).where(and(eq(schema.stockMovements.transferId,transferId),sql`${schema.stockMovements.qtyMilli}<0`,sql`${E.qtyMilli}<0`));
 for(const {lot,qty} of source){
  await labelStock(tx,tenantId,storeId,actor,{productId:lot.productId,qtyMilli:-qty,code:lot.code,expiresOn:lot.expiresOn});
 }
}
