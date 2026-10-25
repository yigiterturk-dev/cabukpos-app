import assert from 'node:assert/strict';
import {eq,inArray} from 'drizzle-orm';
import {schema,getDb,withTenant,closeDb} from '@/db';
import {hashPin} from '@/lib/auth/pin';
import {newDeviceToken,sha256} from '@/lib/auth/tokens';
import {writeStock,labelStock,disposeLot} from '@/lib/admin/stock-lots';
import {istToday} from '@/lib/core/report';
const url=new URL(process.env.DATABASE_URL!),base='http://127.0.0.1:3811';
assert.ok(['localhost','127.0.0.1'].includes(url.hostname));assert.equal(url.pathname,'/cabukpos_preview_1792855963497');
assert.equal(new URL(process.env.APP_URL!).origin,base);
const[t]=await getDb().insert(schema.tenants).values({name:'LOCAL-HTTP-REMAINING-FIXTURE',vertical:'restoran'}).returning();
let deviceId='',pinKey='';
try{
 const token=newDeviceToken(),pin='849206';
 const f=await withTenant(t.id,async tx=>{
  const[store]=await tx.insert(schema.stores).values({tenantId:t.id,name:'Fixture store'}).returning();
  const[staff]=await tx.insert(schema.staff).values({tenantId:t.id,name:'Fixture person',pinHash:await hashPin(pin),role:'garson'}).returning();
  const[device]=await tx.insert(schema.devices).values({tenantId:t.id,storeId:store.id,name:'Fixture device',role:'kasa',receiptPrefix:'FIXHTTP',tokenHash:await sha256(token),tokenRotatedAt:new Date()}).returning();deviceId=device.id;pinKey=`attendance-pin:${t.id}:${staff.id}`;
  const[p]=await tx.insert(schema.products).values({tenantId:t.id,name:'Fixture milk',price:1000,vatRate:10,trackStock:true}).returning();
  await writeStock(tx,{tenantId:t.id,storeId:store.id,productId:p.id,kind:'alis',qtyMilli:2000,actor:'test'});
  const lotId=await labelStock(tx,t.id,store.id,'test',{productId:p.id,qtyMilli:2000,code:'HTTP-EXPIRED',expiresOn:istToday(Date.now(),-1)});
  return{store,staff,p,lotId};
 });
 const request=async(path:string,body:unknown,options:{auth?:boolean;origin?:string}={})=>{
  const r=await fetch(`${base}${path}`,{method:'POST',headers:{'Content-Type':'application/json',Origin:options.origin??base,...(options.auth===false?{}:{Cookie:`cz_device=${token}`})},body:JSON.stringify(body),signal:AbortSignal.timeout(45000)});return{status:r.status,body:await r.json()};
 };
 const auth={staffId:f.staff.id,pin,direction:'status'};
 assert.equal((await request('/api/kasa/attendance',auth,{auth:false})).status,401);
 assert.equal((await request('/api/kasa/attendance',auth,{origin:'https://wrong.example'})).status,403);
 assert.equal((await request('/api/kasa/attendance',{...auth,pin:'123456'})).status,400);
 assert.equal((await request('/api/kasa/attendance',auth)).body.record,null);
 const id=crypto.randomUUID(),first=await request('/api/kasa/attendance',{...auth,direction:'in',requestId:id});assert.equal(first.status,200);assert.equal(first.body.record.id,id);
 const replay=await request('/api/kasa/attendance',{...auth,direction:'in',requestId:id});assert.equal(replay.status,200);assert.equal(replay.body.record.id,id);
 const out=await request('/api/kasa/attendance',{...auth,direction:'out',sessionId:id});assert.equal(out.status,200);assert.ok(out.body.record.endsAt);
 const closed=await request('/api/kasa/attendance',{...auth,direction:'in',requestId:id});assert.equal(closed.status,200);assert.ok(closed.body.record.endsAt);
 const line={lines:[{productId:f.p.id,qtyMilli:1000}]};
 assert.equal((await request('/api/kasa/stock-check',line,{auth:false})).status,401);
 assert.equal((await request('/api/kasa/stock-check',line,{origin:'https://wrong.example'})).status,403);
 const blocked=await request('/api/kasa/stock-check',line);assert.equal(blocked.status,409);assert.match(blocked.body.error,/SKT/);
 const catalog=await fetch(`${base}/api/sync/catalog`,{headers:{Cookie:`cz_device=${token}`},signal:AbortSignal.timeout(45000)});assert.equal(catalog.status,200);const cat=await catalog.json();assert.ok(cat.catalog.expirySafety.lots.some((l:{productId:string})=>l.productId===f.p.id));
 await withTenant(t.id,tx=>disposeLot(tx,t.id,f.store.id,'test',f.lotId));
 assert.equal((await request('/api/kasa/stock-check',line)).status,200);
 console.log({attendance:'PIN, origin, auth, entry/exit and retry passed',stock:'auth, origin, expiry block, catalog and disposal recovery passed'});
}finally{
 await getDb().delete(schema.tenants).where(eq(schema.tenants.id,t.id));
 if(deviceId)await getDb().delete(schema.loginAttempts).where(inArray(schema.loginAttempts.key,[`attendance-device:${deviceId}`,`stock-check:${deviceId}`,pinKey]));
 await closeDb();
}
