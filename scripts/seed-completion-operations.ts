import assert from 'node:assert/strict';
import {eq,and} from 'drizzle-orm';
import {schema,getDb,withTenant,closeDb} from "@/db";
import {platformPeriod,saveSettlement,voidSettlement} from "@/lib/admin/platform-settlement";
import {recordTransfer} from "@/lib/admin/transfer";
import {labelStock} from "@/lib/admin/stock-lots";
import {istToday} from "@/lib/core/report";
const url=new URL(process.env.DATABASE_URL!);assert.ok(['127.0.0.1','localhost'].includes(url.hostname));assert.equal(url.pathname,'/cabukpos_preview_1792855963497');
const tid='caa8f1f4-b280-4d99-a265-e0a3e6b93859';
try{const[t]=await getDb().select().from(schema.tenants).where(eq(schema.tenants.id,tid));assert.equal(t.name,'Yerel Demo');
await withTenant(tid,async tx=>{
 const[store]=await tx.select().from(schema.stores).where(eq(schema.stores.name,'Merkez'));const[u]=await tx.select().from(schema.users).where(eq(schema.users.email,'demo@cabukpos.local'));
 const fromDay="2026-10-24",toDay=istToday();
 const id=(n:number)=>`d38e${String(n).padStart(4,"0")}-1111-4111-a111-111111111111`;
 const[person]=await tx.select().from(schema.staff).where(eq(schema.staff.name,'Demo Kasiyer'));
 assert.ok(person);
 await tx.insert(schema.devices).values({id:id(6),tenantId:tid,storeId:store.id,name:'Demo platform geçmişi',role:'kasa',receiptPrefix:'PSX',revokedAt:new Date()}).onConflictDoNothing();
 const at=new Date('2026-10-24T13:00:00+03:00');
 await tx.insert(schema.shifts).values({id:id(7),tenantId:tid,storeId:store.id,deviceId:id(6),openedBy:person.id,openingCash:0,openedAt:at,closedBy:person.id,closedAt:at,countedCash:24000,expectedCash:24000}).onConflictDoNothing();
 const tabId=id(8),saleId=id(9),refundId=id(10),lineId=id(11);
 const saleBase={tenantId:tid,storeId:store.id,deviceId:id(6),shiftId:id(7),staffId:person.id,channel:'platform' as const,vat:[],createdAt:at};
 await tx.insert(schema.sales).values([{...saleBase,id:saleId,receiptNo:'DEMO-PSX-1',status:'kapandi',total:100000,change:5000,tabId},{...saleBase,id:refundId,receiptNo:'DEMO-PSX-2',status:'iade',total:20000,change:0,refundOf:saleId}]).onConflictDoNothing();
 await tx.insert(schema.payments).values([{id:id(12),tenantId:tid,saleId,method:'online',amount:70000},{id:id(13),tenantId:tid,saleId,method:'nakit',amount:35000},{id:id(14),tenantId:tid,saleId:refundId,method:'online',amount:14000},{id:id(15),tenantId:tid,saleId:refundId,method:'nakit',amount:6000}]).onConflictDoNothing();
 const evs=[{type:'open',guests:0,kind:'platform'},{type:'order',name:'Yerel Demo',phone:'',address:'Demo adres',directions:null,note:'YEREL DEMO · geçmiş hesap örneği',customerId:null,zoneId:null,payIntent:'online',promisedAt:null,source:{platform:'mock',externalId:'DEMO-HAKEDIS-1'}},{type:'add',lineId,productId:null,name:'Demo platform hesabı',unitPrice:100000,vatRate:10,qtyMilli:1000,options:[],note:null,stationId:null},{type:'accept',prepMin:20},{type:'paid',saleId,lines:[{lineId,qtyMilli:1000}],amount:100000}];
 for(const [i,ev]of evs.entries())await tx.insert(schema.tabEvents).values({id:id(20+i),tenantId:tid,storeId:store.id,deviceId:id(6),staffId:person.id,tabId,tableId:null,at:new Date(at.getTime()+i),type:ev.type,payload:ev}).onConflictDoNothing();
 const period=await platformPeriod(tx,store.id,'mock',fromDay,toDay);
 const existing=await tx.select().from(schema.platformSettlements).where(and(eq(schema.platformSettlements.storeId,store.id),eq(schema.platformSettlements.platform,'mock')));
 for(const row of existing)if(!row.voidedAt&&row.gross===0&&row.note==='YEREL DEMO · %10 örnek oran, banka hareketi değildir.')await voidSettlement(tx,tid,store.id,`user:${u.id}`,row.id,'Yerel örnek dönemi genişletildi');
 if(!existing.some(r=>!r.voidedAt&&r.gross!==0)){await saveSettlement(tx,tid,store.id,`user:${u.id}`,{platform:'mock',fromDay,toDay,commissionBps:1000,commissionBase:'gross',courierCost:0,adjustment:0,actual:Math.max(0,period.online-Math.round(period.gross/10)-3500),note:'YEREL DEMO · %10 örnek oran, banka hareketi değildir.'});}
 const depot='d38e0001-1111-4111-a111-111111111111',product='d38e0002-1111-4111-a111-111111111111';
 const old=await tx.select().from(schema.stockTransfers).where(eq(schema.stockTransfers.note,'Yerel demo · teslim onaylı sevkiyat'));
 if(!old.length){await labelStock(tx,tid,depot,`user:${u.id}`,{id:'d38e0005-1111-4111-a111-111111111111',productId:product,qtyMilli:20000,code:'DEPO-PIRINC-01',expiresOn:'2026-12-01'});const shipment=await recordTransfer(tx,tid,{id:u.id,role:'sahip',storeId:null},{fromStoreId:depot,toStoreId:store.id,note:'Yerel demo · teslim onaylı sevkiyat',lines:[{productId:product,qty:'2'}]});if('error'in shipment)throw Error(shipment.error);console.log({shipment:shipment.id});}
 console.log({platformPeriod:{gross:period.gross,online:period.online}});
});}finally{await closeDb();}
