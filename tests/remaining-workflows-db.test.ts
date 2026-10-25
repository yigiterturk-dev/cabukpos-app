import {test,after} from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL="postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
const {schema,getDb,withTenant,closeDb}=await import("@/db");
const {eq,inArray}=await import("drizzle-orm");
const {createProcurement,receiveProcurementPart,receiveProcurement,remainingProcurement}=await import("@/lib/admin/procurement");
const {stockLevels}=await import("@/lib/admin/stock");
const {staffAttendance}=await import("@/lib/staff-attendance");
const {clockAttendance}=await import("@/lib/admin/attendance");
const {hashPin}=await import("@/lib/auth/pin");
const {writeStock,labelStock,disposeLot}=await import("@/lib/admin/stock-lots");
const {loadExpirySafety,saleExpiryProblem}=await import("@/lib/stock-expiry");
const {istToday}=await import("@/lib/core/report");
const tenants:string[]=[];
after(async()=>{await getDb().delete(schema.tenants).where(inArray(schema.tenants.id,tenants));await closeDb();});
async function fixture(){const[t]=await getDb().insert(schema.tenants).values({name:"Remaining test",vertical:"restoran"}).returning();tenants.push(t.id);return withTenant(t.id,async tx=>{const stores=await tx.insert(schema.stores).values([{tenantId:t.id,name:"A"},{tenantId:t.id,name:"B"}]).returning();const[p]=await tx.insert(schema.products).values({tenantId:t.id,name:"Pirinç",price:1000,vatRate:1,trackStock:true,kind:"tartili",unit:"kg"}).returning();const[supplier]=await tx.insert(schema.suppliers).values({tenantId:t.id,name:"Gıda"}).returning();const[s]=await tx.insert(schema.staff).values({tenantId:t.id,name:"Kendi PIN",role:"garson",pinHash:await hashPin("849206")}).returning();const[u]=await tx.insert(schema.users).values({tenantId:t.id,email:`${crypto.randomUUID()}@remaining.test`,passwordHash:"unused",name:"Admin",role:"sahip"}).returning();const orderId=crypto.randomUUID();await createProcurement(tx,t.id,stores[0].id,`user:${u.id}`,{id:orderId,supplierId:supplier.id,note:"",lines:[{productId:p.id,qtyMilli:10000,unitCost:1000,lotCode:"ORDER",expiresOn:null}]});return{t,stores,p,s,u,orderId};});}
test("4 kg + 6 kg kısmi teslim; tekrar tek fiş, fazla teslim reddi, ayrı partiler ve tam kapanış",async()=>{
 const f=await fixture(),tid=f.t.id,store=f.stores[0].id;
 const input={id:crypto.randomUUID(),lines:[{productId:f.p.id,qtyMilli:4000,lotCode:"FIRST",expiresOn:"2027-01-01"}],note:"İlk araç"};
 const first=await withTenant(tid,tx=>receiveProcurementPart(tx,tid,store,f.u.id,f.orderId,input));
 assert.equal(await withTenant(tid,tx=>receiveProcurementPart(tx,tid,store,f.u.id,f.orderId,input)),first);
 await withTenant(tid,async tx=>{const[o]=await tx.select().from(schema.procurementOrders);const receipts=await tx.select().from(schema.procurementReceipts);assert.equal(o.status,"kismi");assert.equal(remainingProcurement(o,receipts)[0].remainingMilli,6000);assert.equal((await stockLevels(tx,store))[0].level,4000);});
 await assert.rejects(withTenant(tid,tx=>receiveProcurementPart(tx,tid,store,f.u.id,f.orderId,{...input,id:crypto.randomUUID(),lines:[{...input.lines[0],qtyMilli:7000}]})),/kalanını aşamaz/);
 await assert.rejects(withTenant(tid,tx=>receiveProcurementPart(tx,tid,store,f.u.id,f.orderId,{...input,note:"changed"})),/farklı bilgiler/);
 await withTenant(tid,tx=>receiveProcurementPart(tx,tid,store,f.u.id,f.orderId,{id:crypto.randomUUID(),lines:[{productId:f.p.id,qtyMilli:6000,lotCode:"SECOND",expiresOn:"2027-02-01"}],note:"İkinci araç"}));
 await withTenant(tid,async tx=>{assert.equal((await tx.select().from(schema.purchases)).length,2);assert.equal((await tx.select().from(schema.stockLots)).length,2);assert.equal((await tx.select().from(schema.procurementOrders))[0].status,"teslim");assert.equal((await stockLevels(tx,store))[0].level,10000);});
 assert.equal(await withTenant(tid,tx=>receiveProcurementPart(tx,tid,store,f.u.id,f.orderId,input)),first);
});
test("eşzamanlı iki 6 kg isteğinden biri kabul edilir; kalan iptali önceki stoğu geri almaz",async()=>{
 const f=await fixture(),tid=f.t.id,store=f.stores[0].id;
 const results=await Promise.allSettled([1,2].map(n=>withTenant(tid,tx=>receiveProcurementPart(tx,tid,store,f.u.id,f.orderId,{id:crypto.randomUUID(),lines:[{productId:f.p.id,qtyMilli:6000,lotCode:`A${n}`,expiresOn:null}],note:""}))));
 assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
 await withTenant(tid,tx=>receiveProcurement(tx,tid,store,f.u.id,f.orderId,true));
 await withTenant(tid,async tx=>{assert.equal((await tx.select().from(schema.procurementOrders))[0].status,"kismi_iptal");assert.equal((await stockLevels(tx,store))[0].level,6000);});
 await assert.rejects(withTenant(tid,tx=>receiveProcurementPart(tx,tid,store,f.u.id,f.orderId,{id:crypto.randomUUID(),lines:[{productId:f.p.id,qtyMilli:4000,lotCode:"X",expiresOn:null}],note:""})),/Kapanmış/);
});
test("yanlış PIN giriş kaydı oluşturmaz; kendi PIN’iyle giriş/çıkış, kayıp yanıt tekrarı ve şube sınırı",async()=>{
 const f=await fixture(),device={tenantId:f.t.id,storeId:f.stores[0].id},base={staffId:f.s.id,pin:"849206"};
 await assert.rejects(staffAttendance(device,{...base,pin:"123456",direction:"in",requestId:crypto.randomUUID()}),/doğrulanamadı/);
 const req=crypto.randomUUID(),a=await staffAttendance(device,{...base,direction:"in",requestId:req});assert.equal(a.record!.id,req);
 const status=await staffAttendance(device,{...base,direction:"status"});assert.equal(status.record!.id,req);
 const elsewhere=await staffAttendance({...device,storeId:f.stores[1].id},{...base,direction:"status"});assert.equal(elsewhere.elsewhere,true);assert.equal(elsewhere.record,null);
 await assert.rejects(staffAttendance({...device,storeId:f.stores[1].id},{...base,direction:"out",sessionId:req}),/bulunamadı/);
 await staffAttendance(device,{...base,direction:"out",sessionId:req});
 const replay=await staffAttendance(device,{...base,direction:"in",requestId:req});assert.ok(replay.record!.endsAt);
 assert.equal((await staffAttendance(device,{...base,direction:"status"})).record,null);
 await assert.rejects(clockAttendance({...device,actor:{kind:"staff",id:crypto.randomUUID()}},f.s.id,"in"),/yetkiniz/);
 await withTenant(f.t.id,async tx=>{assert.equal((await tx.select().from(schema.shifts)).length,0);assert.equal((await tx.select().from(schema.attendance)).length,1);assert.equal((await tx.select().from(schema.auditLog).where(eq(schema.auditLog.action,"attendance.in")))[0].actor,`staff:${f.s.id}`);});
});
test("SKT hem satılan üründe hem reçete hammaddesinde kontrol edilir; imha engeli kaldırır",async()=>{
 const f=await fixture(),tid=f.t.id,store=f.stores[0].id;
 await withTenant(tid,async tx=>{
  await writeStock(tx,{tenantId:tid,storeId:store,productId:f.p.id,kind:"alis",qtyMilli:2000,actor:"test"});
  const lot=await labelStock(tx,tid,store,"test",{productId:f.p.id,qtyMilli:2000,code:"EXPIRED",expiresOn:istToday(Date.now(),-1)});
  const[meal]=await tx.insert(schema.products).values({tenantId:tid,name:"Pilav",price:10000,vatRate:10}).returning();await tx.insert(schema.recipeItems).values({tenantId:tid,productId:meal.id,ingredientId:f.p.id,qtyMilli:200});
  assert.match((await saleExpiryProblem(tx,store,[{productId:f.p.id,qtyMilli:1000}]))!,/SKT/);
  assert.match((await saleExpiryProblem(tx,store,[{productId:meal.id,qtyMilli:1000}]))!,/Pirinç/);
  assert.equal((await loadExpirySafety(tx,f.stores[1].id)).lots.length,0);
  await disposeLot(tx,tid,store,"test",lot);assert.equal(await saleExpiryProblem(tx,store,[{productId:meal.id,qtyMilli:1000}]),null);
 });
});
test("başka kiracının siparişi, personeli ve teslim kayıtları kullanılamaz",async()=>{
 const a=await fixture(),b=await fixture();
 await assert.rejects(withTenant(b.t.id,tx=>receiveProcurementPart(tx,b.t.id,b.stores[0].id,b.u.id,a.orderId,{id:crypto.randomUUID(),lines:[{productId:a.p.id,qtyMilli:1000,lotCode:"X",expiresOn:null}],note:""})),/bulunamadı/);
 await assert.rejects(staffAttendance({tenantId:b.t.id,storeId:b.stores[0].id},{staffId:a.s.id,pin:"849206",direction:"status"}),/doğrulanamadı/);
});
test("önceden tamamlanmış mali belge SKT uyarısıyla saklanır; eşitleme tekrarı ikinci satış yazmaz",async()=>{
 const f=await fixture(),tid=f.t.id,storeId=f.stores[0].id;
 const {applyDoc}=await import("@/lib/sync/apply");
 const[device]=await getDb().insert(schema.devices).values({tenantId:tid,storeId,name:"Sync fixture",receiptPrefix:"EXP"}).returning();
 const ctx={tenantId:tid,storeId,deviceId:device.id,receiptPrefix:"EXP"},shiftId=crypto.randomUUID();
 await withTenant(tid,async tx=>{await writeStock(tx,{tenantId:tid,storeId,productId:f.p.id,kind:"alis",qtyMilli:2000,actor:"test"});await labelStock(tx,tid,storeId,"test",{productId:f.p.id,qtyMilli:2000,code:"EXPIRED-SYNC",expiresOn:istToday(Date.now(),-1)});});
 assert.equal((await applyDoc(ctx,{kind:"shift_open",id:shiftId,staffId:f.s.id,at:new Date().toISOString(),openingCash:0})).ok,true);
 const doc={kind:"sale",id:crypto.randomUUID(),shiftId,staffId:f.s.id,receiptSeq:1,at:new Date().toISOString(),lines:[{productId:f.p.id,name:f.p.name,unitPrice:f.p.price,vatRate:1,qtyMilli:1000}],payments:[{method:"nakit",amount:1000}]};
 assert.equal((await applyDoc(ctx,doc)).ok,true);assert.equal((await applyDoc(ctx,doc)).ok,true);
 await withTenant(tid,async tx=>{const rows=await tx.select().from(schema.sales);assert.equal(rows.length,1);assert.match(rows[0].review!,/SKT/);assert.equal((await tx.select().from(schema.payments)).length,1);});
});
