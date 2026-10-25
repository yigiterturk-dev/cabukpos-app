import {test} from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import {kasaDb,recordSaleLocal,openShiftLocal,closeShiftLocal,recordAuditLocal,safeDropLocal} from "@/lib/offline/db";
import {addTabEvents} from "@/lib/offline/tabs";
import {emptyMeta} from "@/lib/offline/state";
test("yerel yetki kontrolü reddedilen işlemlerde satış/olay/giden kutusu üretmez",async()=>{
 const db=kasaDb();await db.delete();await db.open();const m=emptyMeta();
 await db.meta.put({...m,device:{id:"d",name:"D",receiptPrefix:"P",tenantName:"T",vertical:"restoran",storeName:"A",storeAddress:null,nextReceiptNo:1},shift:{id:"h",openedBy:"s",openedAt:new Date().toISOString(),openingCash:0},catalog:{...m.catalog,staff:[{id:"s",name:"S",role:"mudur",permissions:{sale:false,shift:false,comp:false,drawer:false,safeDrop:false}}]}});
 const result=await recordSaleLocal({id:"s",name:"S"},[{productId:null,name:"Çay",unitPrice:1000,vatRate:10,qtyMilli:1000}],[{method:"nakit",amount:1000}],"sale");assert.equal(result.ok,false);
 await assert.rejects(openShiftLocal("s",0),/yetkisi yok/);await assert.rejects(closeShiftLocal("s",0),/yetkisi yok/);await assert.rejects(recordAuditLocal("s",null,"cekmece"),/yetkisi yok/);assert.equal(await safeDropLocal("s",100),null);
 await assert.rejects(addTabEvents([{tabId:"tab",tableId:null,staffId:"s",ev:{type:"comp",lineId:"line",reason:"test"}}]),/yetkisi yok/);
 assert.equal(await db.sales.count(),0);assert.equal(await db.outbox.count(),0);assert.equal(await db.tabEvents.count(),0);await db.delete();
});
