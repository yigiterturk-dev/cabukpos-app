import {expiryProblem,type ExpiryLine} from "@/lib/core/stock-expiry";
import {istToday} from "@/lib/core/report";
import type {Catalog} from "./state";
/** Online checks current server stock; offline checks dated lots from the last catalog. */
export async function checkSaleExpiry(catalog:Catalog,lines:ExpiryLine[]):Promise<string|null>{
 if(typeof navigator!=="undefined"&&navigator.onLine){
  try{
   const r=await fetch("/api/kasa/stock-check",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({lines:lines.map(l=>({productId:l.productId,qtyMilli:l.qtyMilli,options:l.options?.map(o=>({id:o.id}))}))}),signal:AbortSignal.timeout(10000)});
   const body=await r.json();return r.ok&&body.ok?null:body.error??"Stok kontrolü tamamlanamadı.";
  }catch{return "Stok kontrolü için sunucuya ulaşılamadı. Bağlantıyı kontrol edip tekrar deneyin.";}
 }
 if(!catalog.expirySafety)return "SKT kontrolü için önce internet bağlantısıyla kataloğu güncelleyin.";
 if(istToday()<catalog.expirySafety.checkedDay)return "Cihazın tarihini kontrol edin; SKT kontrolü tamamlanamadı.";
 return expiryProblem(lines,catalog.expirySafety);
}
