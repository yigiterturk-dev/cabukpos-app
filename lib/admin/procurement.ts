import { and, eq } from "drizzle-orm";
import { schema, type Tx } from "@/db";
import { recordPurchase } from "./purchase";
import { labelStock } from "./stock-lots";
import { istToday, isValidCalendarDay } from "@/lib/core/report";
import { audit } from "@/lib/audit";
import { stockUnitOf } from "@/lib/core/stock";
type Line = typeof schema.procurementOrders.$inferInsert.lines[number];
export async function createProcurement(tx:Tx,tenantId:string,storeId:string,actor:string,input:{id:string;supplierId:string;note:string;lines:Line[]}){
 if(!(await tx.select({id:schema.stores.id}).from(schema.stores).where(eq(schema.stores.id,storeId))).length)throw new Error("Şube bulunamadı.");
 if(!/^[0-9a-f-]{36}$/i.test(input.id)||!input.lines.length||input.lines.length>100||input.note.length>1000)throw new Error("Sipariş bilgilerini kontrol edin.");
 if(new Set(input.lines.map(l=>l.productId)).size!==input.lines.length)throw new Error("Aynı ürünü bir kez ekleyin.");
 for(const l of input.lines)if(!Number.isSafeInteger(l.qtyMilli)||l.qtyMilli<=0||l.qtyMilli>100000000||!Number.isSafeInteger(l.unitCost)||l.unitCost<0||l.unitCost>100000000||!l.lotCode.trim()||l.lotCode.length>80||l.expiresOn&&!isValidCalendarDay(l.expiresOn))throw new Error("Miktar, fiyat, parti ve SKT bilgilerini kontrol edin.");
 const total=input.lines.reduce((n,l)=>n+Math.round(l.qtyMilli*l.unitCost/1000),0);
 if(!Number.isSafeInteger(total)||total>2147483647)throw new Error("Sipariş toplamı sınırı aşıldı. Siparişi daha küçük parçalara bölün.");
 const [supplier]=await tx.select().from(schema.suppliers).where(eq(schema.suppliers.id,input.supplierId));if(!supplier)throw new Error("Tedarikçi bulunamadı.");
 for(const l of input.lines){const [p]=await tx.select().from(schema.products).where(eq(schema.products.id,l.productId));if(!p?.trackStock)throw new Error("Stok takipli ürün seçin.");}
 const T=schema.procurementOrders;
 await tx.insert(T).values({tenantId,storeId,...input,createdBy:actor}).onConflictDoNothing();
 const [row]=await tx.select().from(T).where(and(eq(T.id,input.id),eq(T.storeId,storeId)));
 const canonical=(lines:Line[])=>JSON.stringify(lines.map(l=>[l.productId,l.qtyMilli,l.unitCost,l.lotCode,l.expiresOn]));
 if(!row||row.supplierId!==input.supplierId||canonical(row.lines)!==canonical(input.lines)||row.note!==input.note)throw new Error("Sipariş başka bilgilerle kaydedilmiş.");
 return row.id;
}
type Order=typeof schema.procurementOrders.$inferSelect;
type ReceiptLine=typeof schema.procurementReceipts.$inferInsert.lines[number];
export function remainingProcurement(order:Order,receipts:{lines:ReceiptLine[]}[]){
 const delivered=new Map<string,number>();
 for(const r of receipts)for(const l of r.lines)delivered.set(l.productId,(delivered.get(l.productId)??0)+l.qtyMilli);
 // Historical orders were received before the receipts table existed.
 if(!receipts.length&&order.status==="teslim")for(const l of order.lines)delivered.set(l.productId,l.qtyMilli);
 return order.lines.map(l=>({...l,receivedMilli:delivered.get(l.productId)??0,remainingMilli:Math.max(0,l.qtyMilli-(delivered.get(l.productId)??0))}));
}
export async function receiveProcurementPart(tx:Tx,tenantId:string,storeId:string,userId:string,orderId:string,input:{id:string;lines:ReceiptLine[];note:string}){
 const T=schema.procurementOrders,R=schema.procurementReceipts;
 if(!/^[0-9a-f-]{36}$/i.test(input.id)||!input.lines.length||input.lines.length>100||input.note.length>1000)throw new Error("Teslim bilgilerini kontrol edin.");
 const [row]=await tx.select().from(T).where(and(eq(T.id,orderId),eq(T.storeId,storeId))).for("update");
 if(!row)throw new Error("Sipariş bulunamadı.");
 const [prior]=await tx.select().from(R).where(eq(R.id,input.id));
 const canonical=(lines:ReceiptLine[])=>JSON.stringify([...lines].sort((a,b)=>a.productId.localeCompare(b.productId)).map(l=>[l.productId,l.qtyMilli,l.lotCode,l.expiresOn]));
 if(prior){if(prior.orderId!==orderId||prior.storeId!==storeId||canonical(prior.lines)!==canonical(input.lines)||prior.note!==input.note)throw new Error("Teslim kimliği farklı bilgilerle kullanılmış.");return prior.purchaseId;}
 if(!["siparis","kismi"].includes(row.status))throw new Error("Kapanmış sipariş teslim alınamaz.");
 if(new Set(input.lines.map(l=>l.productId)).size!==input.lines.length)throw new Error("Aynı ürünü bir kez belirtin.");
 const receipts=await tx.select().from(R).where(eq(R.orderId,orderId));
 const remaining=remainingProcurement(row,receipts);
 for(const l of input.lines){
  const original=remaining.find(x=>x.productId===l.productId);
  if(!original||!Number.isSafeInteger(l.qtyMilli)||l.qtyMilli<=0||l.qtyMilli>original.remainingMilli)throw new Error("Teslim miktarı siparişin kalanını aşamaz.");
  if(!l.lotCode.trim()||l.lotCode.length>80||l.expiresOn&&!isValidCalendarDay(l.expiresOn))throw new Error("Parti ve SKT bilgisini kontrol edin.");
  const [product]=await tx.select().from(schema.products).where(eq(schema.products.id,l.productId));
  if(!product?.trackStock||stockUnitOf(product)==="adet"&&l.qtyMilli%1000)throw new Error("Ürünün stok birimine uygun miktar girin.");
 }
 const result=await recordPurchase(tx,tenantId,userId,{storeId,supplierId:row.supplierId,docNo:`TED-${orderId.slice(0,8)}-${input.id.slice(0,8)}`,date:istToday(),note:input.note||row.note,lines:input.lines.map(l=>({productId:l.productId,qtyMilli:l.qtyMilli,unitCost:row.lines.find(x=>x.productId===l.productId)!.unitCost})),receivedNow:true});
 if("error"in result)throw new Error(result.error);
 for(const l of input.lines)await labelStock(tx,tenantId,storeId,`user:${userId}`,{productId:l.productId,qtyMilli:l.qtyMilli,code:l.lotCode,expiresOn:l.expiresOn,purchaseId:result.id});
 await tx.insert(R).values({tenantId,storeId,orderId,id:input.id,purchaseId:result.id,lines:input.lines,note:input.note,createdBy:`user:${userId}`});
 const complete=remaining.every(l=>l.remainingMilli===(input.lines.find(x=>x.productId===l.productId)?.qtyMilli??0));
 await tx.update(T).set({status:complete?"teslim":"kismi",purchaseId:result.id,receivedAt:complete?new Date():null}).where(eq(T.id,orderId));
 await audit(tx,tenantId,`user:${userId}`,"procurement.receive",{id:orderId,receiptId:input.id,purchaseId:result.id,complete,lines:input.lines});
 return result.id;
}
/** Legacy whole-receipt caller stays idempotent; partial forms use a separate receipt UUID. */
export async function receiveProcurement(tx:Tx,tenantId:string,storeId:string,userId:string,id:string,cancel=false){
 const T=schema.procurementOrders;const [row]=await tx.select().from(T).where(and(eq(T.id,id),eq(T.storeId,storeId))).for("update");
 if(!row)throw new Error("Sipariş bulunamadı.");
 if(cancel){
  if(["iptal","kismi_iptal"].includes(row.status))return row.purchaseId;
  if(!["siparis","kismi"].includes(row.status))throw new Error("Kapanmış sipariş değiştirilemez.");
  await tx.update(T).set({status:row.status==="kismi"?"kismi_iptal":"iptal"}).where(eq(T.id,id));
  await audit(tx,tenantId,`user:${userId}`,"procurement.cancel.remaining",{id,storeId});return row.purchaseId;
 }
 if(row.status==="teslim")return row.purchaseId;
 const receipts=await tx.select().from(schema.procurementReceipts).where(eq(schema.procurementReceipts.orderId,id));
 const lines=remainingProcurement(row,receipts).filter(l=>l.remainingMilli>0).map(l=>({productId:l.productId,qtyMilli:l.remainingMilli,lotCode:l.lotCode,expiresOn:l.expiresOn}));
 return receiveProcurementPart(tx,tenantId,storeId,userId,id,{id,lines,note:""});
}
