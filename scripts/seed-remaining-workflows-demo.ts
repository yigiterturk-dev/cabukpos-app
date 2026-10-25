import assert from 'node:assert/strict';
import {and,eq} from 'drizzle-orm';
import {schema,getDb,withTenant,closeDb} from '@/db';
import {createProcurement,receiveProcurementPart} from '@/lib/admin/procurement';
const tid='caa8f1f4-b280-4d99-a265-e0a3e6b93859',url=new URL(process.env.DATABASE_URL!);
assert.ok(['localhost','127.0.0.1'].includes(url.hostname));assert.equal(url.pathname,'/cabukpos_preview_1792855963497');
try{
 const[t]=await getDb().select().from(schema.tenants).where(eq(schema.tenants.id,tid));assert.equal(t.name,'Yerel Demo');
 await withTenant(tid,async tx=>{
  const[store]=await tx.select().from(schema.stores).where(eq(schema.stores.name,'Merkez'));
  const[u]=await tx.select().from(schema.users).where(and(eq(schema.users.tenantId,tid),eq(schema.users.email,'demo@cabukpos.local')));assert.ok(store&&u);
  const orderId='d38f0001-1111-4111-a111-111111111111',receiptId='d38f0002-1111-4111-a111-111111111111',productId='d38e0002-1111-4111-a111-111111111111';
  await createProcurement(tx,tid,store.id,`user:${u.id}`,{id:orderId,supplierId:'d38e0003-1111-4111-a111-111111111111',note:'YEREL DEMO · 10 kg sipariş, 4 kg ilk teslim; 6 kg bekliyor.',lines:[{productId,qtyMilli:10000,unitCost:2500,lotCode:'PIRINC-KISMI',expiresOn:'2026-12-01'}]});
  await receiveProcurementPart(tx,tid,store.id,u.id,orderId,{id:receiptId,note:'İlk araç · 4 kg',lines:[{productId,qtyMilli:4000,lotCode:'PIRINC-KISMI-1',expiresOn:'2026-12-01'}]});
  console.log('Yerel demo: 4/10 kg teslim alındı, 6 kg bekliyor. PIN ve kasa vardiyası korunur.');
 });
}finally{await closeDb();}
