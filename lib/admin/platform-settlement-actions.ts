"use server";
import { revalidatePath } from "next/cache";
import { withTenant } from "@/db";
import { requireWriter } from "@/lib/auth/session";
import { parseMoney } from "@/lib/core/money";
import { scopedStoreId } from "./store-scope";
import { saveSettlement, voidSettlement } from "./platform-settlement";
export async function settlementAction(_: {error?:string;savedAt?:number},f:FormData) {
  const a=await requireWriter(); const str=(k:string)=>String(f.get(k)??"").trim();
  if(str("kind")==="void"){
    try{await withTenant(a.tenantId,async tx=>{const id=await scopedStoreId(tx,a.tenantId,a.storeId);if(!id)throw new Error("Şube bulunamadı.");await voidSettlement(tx,a.tenantId,id,`user:${a.id}`,str("id"),str("reason"));});}
    catch(e){return{error:e instanceof Error?e.message:"Hesap iptal edilemedi."};}
    revalidatePath("/yonetim/platform-hesap");return{savedAt:Date.now()};
  }
  const courierCost=parseMoney(str("courierCost")), actual=parseMoney(str("actual"));
  const rawAdjustment=str("adjustment"), adj=parseMoney(rawAdjustment.replace(/^[-+]/,""));
  const adjustment=adj===null?null:adj*(rawAdjustment.startsWith("-")?-1:1);
  const commissionBps=Math.round(Number(str("commission").replace(",","."))*100);
  if(courierCost===null||actual===null||adjustment===null||!/^\d{1,3}([.,]\d{1,2})?$/.test(str("commission"))) return {error:"Tutar ve oranları kontrol edin."};
  try { await withTenant(a.tenantId,async tx=>{const storeId=await scopedStoreId(tx,a.tenantId,a.storeId); if(!storeId)throw new Error("Şube bulunamadı."); await saveSettlement(tx,a.tenantId,storeId,`user:${a.id}`,{platform:str("platform"),fromDay:str("fromDay"),toDay:str("toDay"),commissionBps,commissionBase:str("commissionBase") as "gross"|"online",courierCost,adjustment,actual,note:str("note")});}); }
  catch(e){return {error:e instanceof Error?e.message:"Hesap kaydedilemedi."};}
  revalidatePath("/yonetim/platform-hesap"); return {savedAt:Date.now()};
}
