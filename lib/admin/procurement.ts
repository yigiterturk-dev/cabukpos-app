import { and, eq } from "drizzle-orm";
import { schema, type Tx } from "@/db";
import { recordPurchase } from "./purchase";
import { labelStock } from "./stock-lots";
import { istToday, isValidCalendarDay } from "@/lib/core/report";
import { audit } from "@/lib/audit";
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
export async function receiveProcurement(tx:Tx,tenantId:string,storeId:string,userId:string,id:string,cancel=false){
 const T=schema.procurementOrders;const [row]=await tx.select().from(T).where(and(eq(T.id,id),eq(T.storeId,storeId))).for("update");
 if(!row)throw new Error("Sipariş bulunamadı.");
 const next=cancel?"iptal":"teslim";
 if(row.status===next)return row.purchaseId;
 if(row.status!=="siparis")throw new Error("Kapanmış sipariş değiştirilemez.");
 let purchaseId:string|null=null;
 if(!cancel){
  // Receive at server time, not historical noon: a count earlier today must not hide received goods.
  const result=await recordPurchase(tx,tenantId,userId,{storeId,supplierId:row.supplierId,docNo:`TED-${row.id}`,date:istToday(),note:row.note,lines:row.lines.map(l=>({productId:l.productId,qtyMilli:l.qtyMilli,unitCost:l.unitCost})),receivedNow:true});
  if("error"in result)throw new Error(result.error);purchaseId=result.id;
  for(const l of row.lines)await labelStock(tx,tenantId,storeId,`user:${userId}`,{productId:l.productId,qtyMilli:l.qtyMilli,code:l.lotCode,expiresOn:l.expiresOn,purchaseId:result.id});
 }
 await tx.update(T).set({status:next,purchaseId,receivedAt:cancel?null:new Date()}).where(eq(T.id,id));
 await audit(tx,tenantId,`user:${userId}`,`procurement.${next}`,{id,purchaseId,storeId});return purchaseId;
}
