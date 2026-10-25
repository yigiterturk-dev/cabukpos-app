"use server";
import { revalidatePath } from "next/cache";
import { schema, withTenant } from "@/db";
import { eq } from "drizzle-orm";
import { requireWriter } from "@/lib/auth/session";
import { scopedStoreId } from "./store-scope";
import { labelStock, disposeLot } from "./stock-lots";
import { createProcurement, receiveProcurement, receiveProcurementPart } from "./procurement";
import { parseQty, stockUnitOf } from "@/lib/core/stock";
import { parseMoney } from "@/lib/core/money";
export type InventoryState={error?:string;savedAt?:number;nextId?:string};
export async function inventoryAction(previous:InventoryState,f:FormData):Promise<InventoryState>{
 const a=await requireWriter(),str=(k:string)=>String(f.get(k)??"").trim();
 try{await withTenant(a.tenantId,async tx=>{
  const storeId=await scopedStoreId(tx,a.tenantId,a.storeId);if(!storeId)throw new Error("Şube bulunamadı.");
  const kind=str("kind");
  if(kind==="receive"||kind==="cancel"){await receiveProcurement(tx,a.tenantId,storeId,a.id,str("id"),kind==="cancel");return;}
  if(kind==="dispose"){await disposeLot(tx,a.tenantId,storeId,`user:${a.id}`,str("id"));return;}
  if(!["label","order","receive-part"].includes(kind))throw new Error("İşlem geçersiz.");
  const ids=f.getAll("productId").map(String),quantities=f.getAll("qty").map(String),costs=f.getAll("unitCost").map(String),codes=f.getAll("lotCode").map(String),expiry=f.getAll("expiresOn").map(String);
  const lines=[];
  for(let i=0;i<ids.length;i++){
   if(!quantities[i]?.trim())continue;
   const [p]=await tx.select().from(schema.products).where(eq(schema.products.id,ids[i]));if(!p?.trackStock)throw new Error("Ürün bulunamadı.");
   const qtyMilli=parseQty(quantities[i],stockUnitOf(p)),unitCost=kind==="order"?parseMoney(costs[i]??""):0;
   if(qtyMilli===null||unitCost===null)throw new Error(`${p.name}: miktar ve fiyatı kontrol edin.`);
   lines.push({productId:p.id,qtyMilli,unitCost,lotCode:codes[i]?.trim()??"",expiresOn:expiry[i]||null});
  }
  if(kind==="receive-part"){
   await receiveProcurementPart(tx,a.tenantId,storeId,a.id,str("orderId"),{id:str("id"),lines:lines.map(({productId,qtyMilli,lotCode,expiresOn})=>({productId,qtyMilli,lotCode,expiresOn})),note:str("note")});
  }else if(kind==="label"){
   if(lines.length!==1)throw new Error("Bir ürün seçin.");const l=lines[0];
   await labelStock(tx,a.tenantId,storeId,`user:${a.id}`,{id:str("id"),productId:l.productId,qtyMilli:l.qtyMilli,code:l.lotCode,expiresOn:l.expiresOn});
  }else await createProcurement(tx,a.tenantId,storeId,`user:${a.id}`,{id:str("id"),supplierId:str("supplierId"),note:str("note"),lines});
 });}catch(e){return{...previous,error:e instanceof Error?e.message:"İşlem kaydedilemedi."};}
 for(const p of ["/yonetim/partiler","/yonetim/tedarik","/yonetim/stok","/yonetim/alislar"])revalidatePath(p);
 return{savedAt:Date.now(),nextId:crypto.randomUUID()};
}
