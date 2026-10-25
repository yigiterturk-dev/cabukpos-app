import {test} from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import {expiryProblem,type ExpirySafety} from "@/lib/core/stock-expiry";
import {istToday} from "@/lib/core/report";
import {checkSaleExpiry} from "@/lib/offline/stock-expiry";
import {kasaDb,recordSaleLocal} from "@/lib/offline/db";
import {emptyMeta} from "@/lib/offline/state";
const safety:ExpirySafety={checkedDay:"2026-01-01",lots:[{productId:"milk",name:"Süt",expiresOn:"2026-10-25"}],recipes:[{productId:"latte",ingredientId:"milk",qtyMilli:200},{optionId:"extra",ingredientId:"milk",qtyMilli:100}]};
test("SKT günün sonuna kadar geçerli; ürün, reçete ve seçenek tüketimi ertesi gün engellenir",()=>{
 for(const l of [{productId:"milk",qtyMilli:1000},{productId:"latte",qtyMilli:1000},{productId:"tea",qtyMilli:1000,options:[{id:"extra"}]}]){assert.equal(expiryProblem([l],safety,"2026-10-25"),null);assert.match(expiryProblem([l],safety,"2026-10-26")!,/Süt/);}
 assert.equal(expiryProblem([{productId:"tea",qtyMilli:1000}],safety,"2026-10-26"),null);
});
test("çevrimdışı gece geçen SKT satışı ve giden kutusunu engeller; eski katalog yenilenmelidir",async()=>{
 const db=kasaDb();await db.delete();await db.open();const m=emptyMeta(),expired={...safety,lots:[{productId:"milk",name:"Süt",expiresOn:istToday(Date.now(),-1)}]};
 await db.meta.put({...m,device:{id:"d",name:"D",receiptPrefix:"X",tenantName:"T",vertical:"market",storeName:"S",storeAddress:null,nextReceiptNo:1},shift:{id:"h",openedBy:"s",openedAt:new Date().toISOString(),openingCash:0},catalog:{...m.catalog,staff:[{id:"s",name:"S",role:"kasiyer"}],expirySafety:expired}});
 const result=await recordSaleLocal({id:"s",name:"S"},[{productId:"milk",name:"Süt",qtyMilli:1000,unitPrice:1000,vatRate:10}],[{method:"nakit",amount:1000}],"sale");assert.equal(result.ok,false);if(!result.ok)assert.match(result.error,/SKT/);assert.equal(await db.outbox.count(),0);assert.equal(await db.sales.count(),0);
 assert.match((await checkSaleExpiry({categories:[],products:[],staff:[]},[{productId:"milk",qtyMilli:1000}]))!,/kataloğu güncelleyin/);await db.delete();
});
test("çevrimiçi kontrol sunucu sonucunu kullanır; bağlantı hatasında satışa sessizce izin vermez",async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(navigator,"onLine"),original=globalThis.fetch;
 Object.defineProperty(navigator,"onLine",{value:true,configurable:true});
 try{
  const catalog=emptyMeta().catalog,line=[{productId:"milk",qtyMilli:1000}];
  globalThis.fetch=async()=>Response.json({ok:true});assert.equal(await checkSaleExpiry(catalog,line),null);
  globalThis.fetch=async()=>Response.json({error:"SKT engeli"},{status:409});assert.equal(await checkSaleExpiry(catalog,line),"SKT engeli");
  globalThis.fetch=async()=>{throw new Error("offline");};assert.match((await checkSaleExpiry(catalog,line))!,/sunucuya ulaşılamadı/);
 }finally{globalThis.fetch=original;if(descriptor)Object.defineProperty(navigator,"onLine",descriptor);else Reflect.deleteProperty(navigator,"onLine");}
});
