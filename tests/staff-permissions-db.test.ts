import {test,after} from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL="postgres://cabukpos_app:dev-app-pass@localhost:5432/cabukpos_test";
const {schema,getDb,withTenant,closeDb}=await import("@/db");
const {eq}=await import("drizzle-orm");
const {applyDoc}=await import("@/lib/sync/apply");
const {staffCan,STAFF_PERMISSIONS}=await import("@/lib/core/staff-permissions");
const [t]=await getDb().insert(schema.tenants).values({name:"Permissions",vertical:"restoran"}).returning();
after(async()=>{await getDb().delete(schema.tenants).where(eq(schema.tenants.id,t.id));await closeDb();});
const f=await withTenant(t.id,async tx=>{const [store]=await tx.insert(schema.stores).values({tenantId:t.id,name:"A"}).returning();const [device]=await tx.insert(schema.devices).values({tenantId:t.id,storeId:store.id,name:"Kasa",receiptPrefix:"PP",tokenHash:crypto.randomUUID()}).returning();const [s]=await tx.insert(schema.staff).values({tenantId:t.id,name:"Kasiyer",role:"kasiyer",pinHash:"unused",permissions:{comp:true,shift:false}}).returning();const[m]=await tx.insert(schema.staff).values({tenantId:t.id,name:"Müdür",role:"mudur",pinHash:"unused",permissions:{comp:false}}).returning();return{store,device,s,m};});
const ctx={tenantId:t.id,storeId:f.store.id,deviceId:f.device.id,receiptPrefix:"PP"};
const tabId=crypto.randomUUID();
const doc=(staffId:string,ev:unknown)=>({kind:"tab",id:crypto.randomUUID(),tabId,tableId:null,staffId,approvedBy:null,at:new Date().toISOString(),ev});
test("varsayılan rol izinleri korunur; kişi override ve pasif personel rolü geçersiz kılar",()=>{
 for(const permission of Object.keys(STAFF_PERMISSIONS) as (keyof typeof STAFF_PERMISSIONS)[])assert.equal(staffCan({role:"mudur"},permission),true);
 assert.equal(staffCan({role:"kasiyer"},"comp"),false);assert.equal(staffCan(f.s,"comp"),true);assert.equal(staffCan(f.m,"comp"),false);assert.equal(staffCan({...f.s,active:false},"comp"),false);
});
test("katalog rolü aynı kalsa da sunucu ayrıntılı izni uygular ve sonradan kaldırılan izni reddeder",async()=>{
 assert.equal((await applyDoc(ctx,{kind:"shift_open",id:crypto.randomUUID(),staffId:f.s.id,openingCash:0,at:new Date().toISOString()})).ok,false);
 await applyDoc(ctx,doc(f.s.id,{type:"open",guests:0,kind:"paket"}));
 const lineId=crypto.randomUUID();await applyDoc(ctx,doc(f.s.id,{type:"add",lineId,productId:null,name:"Çay",unitPrice:1000,vatRate:10,qtyMilli:1000,options:[],note:null,stationId:null}));
 assert.equal((await applyDoc(ctx,doc(f.s.id,{type:"comp",lineId,reason:"İzinli"}))).ok,true);
 assert.equal((await applyDoc(ctx,doc(f.m.id,{type:"comp",lineId,reason:"İzinsiz"}))).ok,false);
 await withTenant(t.id,tx=>tx.update(schema.staff).set({permissions:{comp:false}}).where(eq(schema.staff.id,f.s.id)));
 assert.equal((await applyDoc(ctx,doc(f.s.id,{type:"comp",lineId,reason:"Eski katalog"}))).ok,false);
});
