// A fictional prepaid order in the isolated local demo; no provider/device credentials.
import assert from 'node:assert/strict';
import {and,eq} from 'drizzle-orm';
import {getDb,withTenant,closeDb,schema} from '@/db';
import {splitVat} from '@/lib/core/money';
import type {TabEv} from '@/lib/core/tab';
const url=new URL(process.env.DATABASE_URL??'');
assert.ok(['localhost','127.0.0.1'].includes(url.hostname));assert.match(url.pathname,/^\/cabukpos_preview_\d+$/);
const id=(n:number)=>`d38f02${String(n).padStart(2,'0')}-1111-4111-a111-111111111111`;
try{
 const[u]=await getDb().select().from(schema.users).where(eq(schema.users.email,'demo@cabukpos.local'));assert.ok(u);
 const[t]=await getDb().select().from(schema.tenants).where(eq(schema.tenants.id,u.tenantId));assert.equal(t?.name,'Yerel Demo');
 await withTenant(u.tenantId,async tx=>{
  const[store]=await tx.select().from(schema.stores).where(eq(schema.stores.name,'Merkez'));
  const[staff]=await tx.select().from(schema.staff).where(eq(schema.staff.name,'Akış Test Kasiyeri'));
  const[courier]=await tx.select().from(schema.staff).where(and(eq(schema.staff.role,'kurye'),eq(schema.staff.active,true))).limit(1);
  const[p]=await tx.select().from(schema.products).where(eq(schema.products.name,'Adana Kebap'));assert.ok(store&&staff&&courier&&p);
  assert.ok(p.vatRate===1||p.vatRate===10||p.vatRate===20,'Supported VAT rate required');
  const vatRate=p.vatRate;
  if((await tx.select({id:schema.sales.id}).from(schema.sales).where(eq(schema.sales.id,id(3)))).length)return;
  const at=new Date(),tenantId=u.tenantId,deviceId=id(1),shiftId=id(2),saleId=id(3),tabId=id(4),lineId=id(5);
  await tx.insert(schema.devices).values({id:deviceId,tenantId,storeId:store.id,name:'Demo ön ödeme geçmişi',receiptPrefix:'ODMO',revokedAt:at});
  await tx.insert(schema.shifts).values({id:shiftId,tenantId,storeId:store.id,deviceId,openedBy:staff.id,openedAt:at,openingCash:0,closedBy:staff.id,closedAt:at,countedCash:0,expectedCash:0});
  await tx.insert(schema.sales).values({id:saleId,tenantId,storeId:store.id,deviceId,shiftId,staffId:staff.id,receiptNo:'DEMO-ONODEME-1',channel:'paket',total:p.price,vat:[{rate:vatRate,gross:p.price,...splitVat(p.price,vatRate)}],tabId,createdAt:at});
  await tx.insert(schema.saleLines).values({tenantId,saleId,productId:p.id,name:p.name,unitPrice:p.price,vatRate,qtyMilli:1000,total:p.price});
  await tx.insert(schema.payments).values({tenantId,saleId,method:'kart',amount:p.price});
  const evs:TabEv[]=[{type:'open',guests:0,kind:'paket'},
   {type:'order',customerId:null,name:'Ön Ödemeli Demo',phone:'0000000000',address:'Demo adresi · gerçek sipariş değildir',directions:null,zoneId:null,note:'Yerel test · kartla önceden ödendi, hazırlanıp kuryeye verilecek',payIntent:'kart',promisedAt:null,source:null},
   {type:'add',lineId,productId:p.id,name:p.name,unitPrice:p.price,vatRate,qtyMilli:1000,options:[],note:null,stationId:p.stationId},
   {type:'courier',staffId:courier.id},{type:'paid',saleId,lines:[{lineId,qtyMilli:1000,discount:0}],amount:p.price}];
  await tx.insert(schema.tabEvents).values(evs.map((ev,n)=>({id:id(10+n),tenantId,storeId:store.id,deviceId,tabId,tableId:null,staffId:staff.id,at:new Date(at.getTime()+n),type:ev.type,payload:ev})));
 });
 console.log('Local demo: Ön Ödemeli Demo paketi hazır; mevcut kasa vardiyaları ve PIN’ler korunur.');
}finally{await closeDb();}
