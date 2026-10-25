// Disposable fixtures on a network-isolated restored database only; no live accounts/providers.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {eq,inArray} from 'drizzle-orm';
import {getDb,withTenant,closeDb,schema} from '@/db';
import {hashPin} from '@/lib/auth/pin';
import {newDeviceToken,sha256} from '@/lib/auth/tokens';
import {createProcurement,receiveProcurementPart,remainingProcurement} from '@/lib/admin/procurement';
import {stockLevels} from '@/lib/admin/stock';
import {writeStock,labelStock,disposeLot} from '@/lib/admin/stock-lots';
import {recordTransfer,changeShipment} from '@/lib/admin/transfer';
import {bookReservation} from '@/lib/reservations';
import {timeToAt} from '@/lib/core/reservation';
import {istToday} from '@/lib/core/report';
import {saveStaffPlan} from '@/lib/admin/staff-plan';
import {saveSettlement} from '@/lib/admin/platform-settlement';
import {applyDoc} from '@/lib/sync/apply';

const url=new URL(process.env.DATABASE_URL??''),base=process.env.BASE;
assert.equal(process.env.RELEASE_REHEARSAL,'isolated');
assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/rehearsal');assert.equal(base,'http://127.0.0.1:3199');
const db=getDb(),tenants=[],rateKeys=[];
const pin='849206',token=newDeviceToken();
try{
 for(let i=0;i<2;i++){const[t]=await db.insert(schema.tenants).values({name:`Isolated release fixture ${randomUUID()}`,vertical:'restoran'}).returning();tenants.push(t.id);}
 const tid=tenants[0];
 const f=await withTenant(tid,async tx=>{
  const stores=await tx.insert(schema.stores).values([{tenantId:tid,name:'Rehearsal A',kind:'depo'},{tenantId:tid,name:'Rehearsal B'}]).returning();
  const[person]=await tx.insert(schema.staff).values({tenantId:tid,name:'Fixture employee',role:'kasiyer',permissions:{comp:true},pinHash:await hashPin(pin)}).returning();
  const[owner]=await tx.insert(schema.users).values({tenantId:tid,name:'Fixture owner',role:'sahip',email:`${randomUUID()}@release.invalid`,passwordHash:'!no-login'}).returning();
  const[device]=await tx.insert(schema.devices).values({tenantId:tid,storeId:stores[0].id,name:'Fixture device',role:'kasa',receiptPrefix:`R${randomUUID().slice(0,6)}`,tokenHash:await sha256(token),tokenRotatedAt:new Date()}).returning();
  const products=await tx.insert(schema.products).values([{tenantId:tid,name:'Fixture rice',price:2500,vatRate:1,trackStock:true,kind:'tartili',unit:'kg',sellable:false},{tenantId:tid,name:'Fixture milk',price:3000,vatRate:10,trackStock:true}]).returning();
  const[supplier]=await tx.insert(schema.suppliers).values({tenantId:tid,name:'Fixture supplier'}).returning();
  const[area]=await tx.insert(schema.areas).values({tenantId:tid,storeId:stores[0].id,name:'Fixture salon'}).returning();
  const[table]=await tx.insert(schema.tables).values({tenantId:tid,areaId:area.id,name:'Fixture table',seats:2}).returning();
  return{stores,person,owner,device,products,supplier,table};
 });
 const storeId=f.stores[0].id,productId=f.products[0].id,orderId=randomUUID(),receiptId=randomUUID();
 const actor={id:f.owner.id,role:'sahip',storeId:null};
 rateKeys.push(`attendance-device:${f.device.id}`,`attendance-pin:${tid}:${f.person.id}`,`stock-check:${f.device.id}`,`onay:${f.device.id}`);
 const part={id:receiptId,note:'First vehicle',lines:[{productId,qtyMilli:4000,lotCode:'FIRST',expiresOn:istToday(Date.now(),30)}]};
 await withTenant(tid,async tx=>{
  await createProcurement(tx,tid,storeId,`user:${actor.id}`,{id:orderId,supplierId:f.supplier.id,note:'Rehearsal',lines:[{productId,qtyMilli:10000,unitCost:2500,lotCode:'ORDER',expiresOn:null}]});
  await receiveProcurementPart(tx,tid,storeId,actor.id,orderId,part);
 });
 const same=await Promise.all([1,2].map(()=>withTenant(tid,tx=>receiveProcurementPart(tx,tid,storeId,actor.id,orderId,part))));assert.equal(same[0],same[1]);
 await withTenant(tid,async tx=>{const[o]=await tx.select().from(schema.procurementOrders).where(eq(schema.procurementOrders.id,orderId));const r=await tx.select().from(schema.procurementReceipts).where(eq(schema.procurementReceipts.orderId,orderId));assert.equal(r.length,1);assert.equal(remainingProcurement(o,r)[0].remainingMilli,6000);});
 await assert.rejects(withTenant(tid,tx=>receiveProcurementPart(tx,tid,storeId,actor.id,orderId,{...part,id:randomUUID(),lines:[{...part.lines[0],qtyMilli:7000}]})),/kalanını aşamaz/);
 await withTenant(tid,tx=>receiveProcurementPart(tx,tid,storeId,actor.id,orderId,{id:randomUUID(),note:'Second vehicle',lines:[{productId,qtyMilli:6000,lotCode:'SECOND',expiresOn:istToday(Date.now(),60)}]}));
 const shipment=await withTenant(tid,tx=>recordTransfer(tx,tid,actor,{fromStoreId:storeId,toStoreId:f.stores[1].id,note:'Rehearsal transfer',lines:[{productId,qty:'2'}]}));assert.ok('id'in shipment);
 await withTenant(tid,async tx=>{assert.equal((await stockLevels(tx,f.stores[1].id)).find(p=>p.id===productId).level,0);assert.ok('id'in await changeShipment(tx,tid,actor,shipment.id,'yolda'));});
 await Promise.all([1,2].map(()=>withTenant(tid,tx=>changeShipment(tx,tid,actor,shipment.id,'teslim'))));
 await withTenant(tid,async tx=>{assert.equal((await stockLevels(tx,storeId)).find(p=>p.id===productId).level,8000);assert.equal((await stockLevels(tx,f.stores[1].id)).find(p=>p.id===productId).level,2000);});
 const booking={id:randomUUID(),name:'Fixture reservation',phone:'0000000000',guests:2,note:'Rehearsal',at:timeToAt(istToday(Date.now(),1),'19:00')};
 const ctx={tenantId:tid,storeId};
 assert.equal((await bookReservation(ctx,booking,'rehearsal')).id,booking.id);
 assert.equal((await bookReservation(ctx,booking,'rehearsal')).id,booking.id);
 await assert.rejects(bookReservation(ctx,{...booking,id:randomUUID()},'rehearsal'),/masa/);
 await saveStaffPlan({...ctx,actor},{id:randomUUID(),revision:null,staffId:f.person.id,kind:'vardiya',title:'Fixture plan',startsAt:booking.at,endsAt:new Date(booking.at.getTime()+2*3600000),breakMinutes:0,note:''});
 await withTenant(tid,tx=>saveSettlement(tx,tid,storeId,`user:${actor.id}`,{platform:'mock',fromDay:istToday(),toDay:istToday(),commissionBps:1000,commissionBase:'gross',courierCost:0,adjustment:0,actual:0,note:'Fixture ledger'}));
 const request=async(path,body,{authenticated=true,origin=base}={})=>{
  const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...(authenticated?{Cookie:`cz_device=${token}`}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});return{status:r.status,body:await r.json()};
 };
 const staff={staffId:f.person.id,pin,direction:'status'},entry=randomUUID();
 assert.equal((await request('/api/kasa/attendance',staff,{authenticated:false})).status,401);
 assert.equal((await request('/api/kasa/attendance',staff,{origin:'https://wrong.invalid'})).status,403);
 assert.equal((await request('/api/kasa/attendance',{...staff,pin:'123456'})).status,400);
 assert.equal((await request('/api/kasa/attendance',{...staff,direction:'in',requestId:entry})).body.record.id,entry);
 assert.equal((await request('/api/kasa/attendance',{...staff,direction:'out',sessionId:entry})).status,200);
 assert.ok((await request('/api/kasa/attendance',{...staff,direction:'in',requestId:entry})).body.record.endsAt);
 const expired=await withTenant(tid,async tx=>{await writeStock(tx,{tenantId:tid,storeId,productId:f.products[1].id,kind:'alis',qtyMilli:2000,actor:'rehearsal'});return labelStock(tx,tid,storeId,'rehearsal',{productId:f.products[1].id,qtyMilli:2000,code:'EXPIRED',expiresOn:istToday(Date.now(),-1)});});
 const check={lines:[{productId:f.products[1].id,qtyMilli:1000}]};
 assert.equal((await request('/api/kasa/stock-check',check,{authenticated:false})).status,401);
 assert.equal((await request('/api/kasa/stock-check',check)).status,409);
 const response=await fetch(base+'/api/sync/catalog',{headers:{Cookie:`cz_device=${token}`},signal:AbortSignal.timeout(20000)});assert.equal(response.status,200);const catalog=await response.json();assert.ok(catalog.catalog.expirySafety.lots.some(l=>l.productId===f.products[1].id));
 await withTenant(tid,tx=>disposeLot(tx,tid,storeId,'rehearsal',expired));assert.equal((await request('/api/kasa/stock-check',check)).status,200);
 const approval=await request('/api/kasa/onay',{staffId:f.person.id,pin});assert.equal(approval.status,200);assert.ok(approval.body.token);
 const deviceCtx={...ctx,deviceId:f.device.id,receiptPrefix:f.device.receiptPrefix},tabId=randomUUID(),lineId=randomUUID();
 const doc=ev=>({kind:'tab',id:randomUUID(),tabId,tableId:null,staffId:f.person.id,approvedBy:null,at:new Date().toISOString(),ev});
 assert.equal((await applyDoc(deviceCtx,doc({type:'open',kind:'paket',guests:0}))).ok,true);
 assert.equal((await applyDoc(deviceCtx,doc({type:'add',lineId,productId,name:'Fixture rice',qtyMilli:1000,unitPrice:2500,vatRate:1,options:[],note:null,stationId:null}))).ok,true);
 const comp=()=>({...doc({type:'comp',lineId,reason:'Rehearsal'}),approvedBy:f.person.id,approvalToken:approval.body.token});
 assert.equal((await applyDoc(deviceCtx,comp())).ok,true);
 await withTenant(tid,tx=>tx.update(schema.staff).set({permissions:{comp:false}}).where(eq(schema.staff.id,f.person.id)));
 assert.equal((await applyDoc(deviceCtx,comp())).ok,false);
 const externalId=`fixture-${randomUUID()}`;
 for(const platform of ['mock','getir'])await withTenant(tid,tx=>tx.insert(schema.tabEvents).values({tenantId:tid,id:randomUUID(),tabId:randomUUID(),tableId:null,storeId,deviceId:f.device.id,staffId:f.person.id,at:new Date(),type:'order',payload:{source:{platform,externalId}}}));
 await assert.rejects(withTenant(tid,tx=>tx.insert(schema.tabEvents).values({tenantId:tid,id:randomUUID(),tabId:randomUUID(),tableId:null,storeId,deviceId:f.device.id,staffId:f.person.id,at:new Date(),type:'order',payload:{source:{platform:'mock',externalId}}})));
 await withTenant(tenants[1],async tx=>{for(const table of [schema.procurementReceipts,schema.stockLots,schema.attendance,schema.reservations,schema.platformSettlements,schema.staffPlans])assert.equal((await tx.select().from(table).where(eq(table.tenantId,tid))).length,0);});
 await assert.rejects(withTenant(tenants[1],tx=>tx.insert(schema.attendance).values({tenantId:tid,storeId,staffId:f.person.id,recordedBy:'rehearsal'})));
 console.log('Release workflows PASS');
}finally{
 if(rateKeys.length)await db.delete(schema.loginAttempts).where(inArray(schema.loginAttempts.key,rateKeys));
 if(tenants.length)await db.delete(schema.tenants).where(inArray(schema.tenants.id,tenants));
 await closeDb();
}
