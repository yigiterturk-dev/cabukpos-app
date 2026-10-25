import {test,after} from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL="postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
const {getDb,withTenant,closeDb,schema}=await import("@/db");
const {eq,inArray}=await import("drizzle-orm");
const {writeStock,labelStock,disposeLot}=await import("@/lib/admin/stock-lots");
const {stockLevels}=await import("@/lib/admin/stock");
const {createProcurement,receiveProcurement}=await import("@/lib/admin/procurement");
const {clockAttendance}=await import("@/lib/admin/attendance");
const {saveSettlement,platformPeriod}=await import("@/lib/admin/platform-settlement");
const {settlementMath}=await import("@/lib/core/platform-settlement");
const tenants:string[]=[];
after(async()=>{if(tenants.length)await getDb().delete(schema.tenants).where(inArray(schema.tenants.id,tenants));await closeDb();});
async function fixture(){const [t]=await getDb().insert(schema.tenants).values({name:"Completion",vertical:"restoran"}).returning();tenants.push(t.id);return withTenant(t.id,async tx=>{const stores=await tx.insert(schema.stores).values([{tenantId:t.id,name:"A"},{tenantId:t.id,name:"B"}]).returning();const[p]=await tx.insert(schema.products).values({tenantId:t.id,name:"Un",price:10000,vatRate:1,kind:"tartili",unit:"kg",sellable:false,trackStock:true,minStock:10000}).returning();const[supplier]=await tx.insert(schema.suppliers).values({tenantId:t.id,name:"Gıda"}).returning();const[s]=await tx.insert(schema.staff).values({tenantId:t.id,name:"Ali",pinHash:"unused",role:"kasiyer"}).returning();const[u]=await tx.insert(schema.users).values({tenantId:t.id,email:`${crypto.randomUUID()}@completion.test`,passwordHash:"unused",name:"Admin",role:"sahip"}).returning();return{t,stores,p,supplier,s,actor:{id:u.id,role:"sahip" as const,storeId:null}};});}
test("parti etiketi toplam stoku artırmaz; FEFO, sayım ve geçmiş hareket korunur",async()=>{
 const f=await fixture(),tid=f.t.id,storeId=f.stores[0].id,base={tenantId:tid,storeId,productId:f.p.id,actor:"test"};
 await withTenant(tid,async tx=>{
  await writeStock(tx,{...base,kind:"alis",qtyMilli:10000,at:new Date("2026-01-01")});
  await labelStock(tx,tid,storeId,"test",{productId:f.p.id,qtyMilli:4000,code:"later",expiresOn:"2027-02-01"});
  await labelStock(tx,tid,storeId,"test",{productId:f.p.id,qtyMilli:3000,code:"early",expiresOn:"2027-01-01"});
  assert.equal((await stockLevels(tx,storeId))[0].level,10000);
  await assert.rejects(labelStock(tx,tid,storeId,"test",{productId:f.p.id,qtyMilli:4000,code:"too much",expiresOn:null}),/yetersiz/);
  await writeStock(tx,{...base,kind:"recete",qtyMilli:-4000,at:new Date("2026-02-01")});
  let lots=await tx.select().from(schema.stockLots);assert.equal(lots.find(l=>l.code==="early")!.remaining,0);assert.equal(lots.find(l=>l.code==="later")!.remaining,3000);
  await writeStock(tx,{...base,kind:"sayim",qtyMilli:2000,at:new Date("2026-03-01")});
  await writeStock(tx,{...base,kind:"satis",qtyMilli:-1000,at:new Date("2026-02-02")});
  lots=await tx.select().from(schema.stockLots);assert.equal(lots.reduce((n,l)=>n+l.remaining,0),2000);
  assert.equal((await stockLevels(tx,storeId))[0].level,2000);
  await disposeLot(tx,tid,storeId,"test",lots.find(l=>l.remaining)!.id);
  assert.equal((await stockLevels(tx,storeId))[0].level,0);
 });
});
test("tedarik siparişi teslimden önce stoğu değiştirmez; eşzamanlı teslim bir alış/parti üretir",async()=>{
 const f=await fixture(),storeId=f.stores[0].id,id=crypto.randomUUID(),input={id,supplierId:f.supplier.id,note:"test",lines:[{productId:f.p.id,qtyMilli:5000,unitCost:2500,lotCode:"TED1",expiresOn:"2027-01-01"}]};
 await withTenant(f.t.id,async tx=>{await createProcurement(tx,f.t.id,storeId,"test",input);await createProcurement(tx,f.t.id,storeId,"test",input);assert.equal((await stockLevels(tx,storeId))[0].level,0);});
 const results=await Promise.all([1,2].map(()=>withTenant(f.t.id,tx=>receiveProcurement(tx,f.t.id,storeId,f.actor.id,id))));assert.equal(results[0],results[1]);
 await withTenant(f.t.id,async tx=>{assert.equal((await tx.select().from(schema.purchases)).length,1);assert.equal((await stockLevels(tx,storeId))[0].level,5000);assert.equal((await tx.select().from(schema.stockLots))[0].remaining,5000);});
});
test("giriş/çıkış tekrarlanabilir; ikinci şubede açık giriş ve eski çıkış yeni oturumu kapatamaz",async()=>{
 const f=await fixture(),ctx={tenantId:f.t.id,storeId:f.stores[0].id,actor:f.actor};
 const ids=await Promise.all([clockAttendance(ctx,f.s.id,"in"),clockAttendance(ctx,f.s.id,"in")]);assert.equal(ids[0],ids[1]);
 await assert.rejects(clockAttendance({...ctx,storeId:f.stores[1].id},f.s.id,"in"),/başka şubede/);
 await clockAttendance(ctx,f.s.id,"out",ids[0]);const fresh=await clockAttendance(ctx,f.s.id,"in");assert.notEqual(fresh,ids[0]);
 await clockAttendance(ctx,f.s.id,"out",ids[0]);
 await withTenant(f.t.id,async tx=>assert.equal((await tx.select().from(schema.attendance)).find(r=>r.id===fresh)!.endsAt,null));
 await assert.rejects(clockAttendance({...ctx,actor:{...f.actor,role:"mudur",storeId:f.stores[1].id}},f.s.id,"out",fresh),/yetkiniz/);
});
test("hakediş çevrimiçi tahsilattan komisyon/gideri düşer ve dönem çakışmasını engeller",async()=>{
 assert.deepEqual(settlementMath(100000,70000,1000,"gross",5000,-1000,53000),{commission:10000,expected:54000,difference:-1000});
 assert.equal(settlementMath(100000,70000,1000,"online",5000,0,58000).expected,58000);
 const f=await fixture(),storeId=f.stores[0].id;
 await withTenant(f.t.id,async tx=>{const period=await platformPeriod(tx,storeId,"mock","2026-01-01","2026-01-07");assert.equal(period.gross,0);await saveSettlement(tx,f.t.id,storeId,"test",{platform:"mock",fromDay:"2026-01-01",toDay:"2026-01-07",commissionBps:1000,commissionBase:"gross",courierCost:0,adjustment:0,actual:0,note:""});await assert.rejects(saveSettlement(tx,f.t.id,storeId,"test",{platform:"mock",fromDay:"2026-01-07",toDay:"2026-01-08",commissionBps:0,commissionBase:"online",courierCost:0,adjustment:0,actual:0,note:""}),/zaten var/);});
});
test("yeni iş tablolarında kiracılar birbirinin verisini okuyamaz",async()=>{const a=await fixture(),b=await fixture();await clockAttendance({tenantId:a.t.id,storeId:a.stores[0].id,actor:a.actor},a.s.id,"in");await withTenant(b.t.id,async tx=>assert.equal((await tx.select().from(schema.attendance).where(eq(schema.attendance.tenantId,a.t.id))).length,0));});
test("platform dökümü indirim, karma tahsilat, iadeyi özgün platforma bağlama ve geç eşitlemeyi kapsar",async()=>{
 const f=await fixture(),tid=f.t.id,storeId=f.stores[0].id;
 await withTenant(tid,async tx=>{
  const[d]=await tx.insert(schema.devices).values({tenantId:tid,storeId,name:"Test",receiptPrefix:"SET",tokenHash:crypto.randomUUID()}).returning();
  const[h]=await tx.insert(schema.shifts).values({tenantId:tid,storeId,deviceId:d.id,openedBy:f.s.id,openingCash:0}).returning();
  const tabId=crypto.randomUUID(),original=crypto.randomUUID(),refund=crypto.randomUUID();
  await tx.insert(schema.tabEvents).values({id:crypto.randomUUID(),tenantId:tid,storeId,deviceId:d.id,tabId,tableId:null,staffId:f.s.id,at:new Date(),type:"order",payload:{source:{platform:"mock"}}});
  const base={tenantId:tid,storeId,deviceId:d.id,shiftId:h.id,staffId:f.s.id,vat:[],createdAt:new Date("2026-01-03T12:00:00+03:00")};
  await tx.insert(schema.sales).values([{...base,id:original,receiptNo:"SET-1",channel:"platform",status:"kapandi",total:10000,discount:1000,change:1000,tabId},{...base,id:refund,receiptNo:"SET-2",channel:"kasa",status:"iade",total:2000,discount:200,change:0,refundOf:original}]);
  await tx.insert(schema.payments).values([{tenantId:tid,saleId:original,method:"online",amount:6000},{tenantId:tid,saleId:original,method:"nakit",amount:4000},{tenantId:tid,saleId:refund,method:"online",amount:1200},{tenantId:tid,saleId:refund,method:"nakit",amount:600}]);
  const a=await platformPeriod(tx,storeId,"mock","2026-01-01","2026-01-07");assert.equal(a.gross,7200);assert.equal(a.online,4800);assert.equal(a.count,2);
  assert.equal((await platformPeriod(tx,storeId,"getir","2026-01-01","2026-01-07")).gross,0);
  const id=await saveSettlement(tx,tid,storeId,"test",{platform:"mock",fromDay:"2026-01-01",toDay:"2026-01-07",commissionBps:1000,commissionBase:"gross",courierCost:0,adjustment:0,actual:4080,note:""});
  const[row]=await tx.select().from(schema.platformSettlements).where(eq(schema.platformSettlements.id,id));assert.equal(row.expected,4080);
  await tx.update(schema.payments).set({amount:5900}).where(eq(schema.payments.saleId,original));
  const b=await platformPeriod(tx,storeId,"mock","2026-01-01","2026-01-07");assert.notEqual(a.fingerprint,b.fingerprint);
 });
});
test("sevk edilen partinin SKT ve miktarı teslimde hedefe taşınır",async()=>{
 const f=await fixture(),tid=f.t.id,fromStoreId=f.stores[0].id,toStoreId=f.stores[1].id;
 const {recordTransfer,changeShipment}=await import("@/lib/admin/transfer");
 await withTenant(tid,async tx=>{await writeStock(tx,{tenantId:tid,storeId:fromStoreId,productId:f.p.id,kind:"alis",qtyMilli:5000,actor:"test"});await labelStock(tx,tid,fromStoreId,"test",{productId:f.p.id,qtyMilli:5000,code:"A1",expiresOn:"2027-01-01"});});
 const shipment=await withTenant(tid,tx=>recordTransfer(tx,tid,f.actor,{fromStoreId,toStoreId,note:null,lines:[{productId:f.p.id,qty:"2"}]}));assert.ok("id"in shipment);
 await withTenant(tid,async tx=>{assert.equal((await tx.select().from(schema.stockLots).where(eq(schema.stockLots.storeId,fromStoreId)))[0].remaining,3000);assert.equal((await tx.select().from(schema.stockLots).where(eq(schema.stockLots.storeId,toStoreId))).length,0);});
 await withTenant(tid,tx=>changeShipment(tx,tid,f.actor,shipment.id,"teslim"));
 await withTenant(tid,async tx=>{const[l]=await tx.select().from(schema.stockLots).where(eq(schema.stockLots.storeId,toStoreId));assert.equal(l.remaining,2000);assert.equal(l.code,"A1");assert.equal(l.expiresOn,"2027-01-01");});
});
test("alış iptali kendi partisini düşer; tüketilen partinin alışını iptal etmek durumu değiştirmez",async()=>{
 const f=await fixture(),tid=f.t.id,storeId=f.stores[0].id;
 const {cancelPurchase}=await import("@/lib/admin/purchase");
 const receive=async(code:string,expiresOn:string)=>withTenant(tid,async tx=>{const id=crypto.randomUUID();await createProcurement(tx,tid,storeId,"test",{id,supplierId:f.supplier.id,note:"",lines:[{productId:f.p.id,qtyMilli:5000,unitCost:1000,lotCode:code,expiresOn}]});return (await receiveProcurement(tx,tid,storeId,f.actor.id,id))!;});
 const later=await receive("LATE","2030-01-01"),early=await receive("EARLY","2027-01-01");
 await withTenant(tid,async tx=>{
  assert.equal(await cancelPurchase(tx,f.actor.id,later),null);
  let lots=await tx.select().from(schema.stockLots);assert.equal(lots.find(l=>l.code==="LATE")!.remaining,0);assert.equal(lots.find(l=>l.code==="EARLY")!.remaining,5000);
  await writeStock(tx,{tenantId:tid,storeId,productId:f.p.id,kind:"recete",qtyMilli:-1000,actor:"test"});
  assert.match((await cancelPurchase(tx,f.actor.id,early))!,/tüketim/);
  const[p]=await tx.select().from(schema.purchases).where(eq(schema.purchases.id,early));assert.equal(p.status,"kayitli");
  lots=await tx.select().from(schema.stockLots);assert.equal(lots.find(l=>l.code==="EARLY")!.remaining,4000);assert.equal((await stockLevels(tx,storeId))[0].level,4000);
  await assert.rejects(createProcurement(tx,tid,storeId,"test",{id:crypto.randomUUID(),supplierId:f.supplier.id,note:"",lines:[{productId:f.p.id,qtyMilli:100000000,unitCost:100000000,lotCode:"huge",expiresOn:null}]}),/toplamı sınırı/);
 });
});
