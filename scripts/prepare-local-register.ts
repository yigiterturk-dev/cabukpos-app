// Add a dedicated disposable register/staff to the explicit local demo only.
// Existing register tokens, PINs, shifts and sales are never reset.
import assert from 'node:assert/strict';
import {randomInt} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {getDb,withTenant,closeDb,schema} from '@/db';
import {hashPin,verifyPin} from '@/lib/auth/pin';
const url=new URL(process.env.DATABASE_URL??'');
assert.ok(['localhost','127.0.0.1'].includes(url.hostname),'Local database required');
assert.match(url.pathname,/^\/cabukpos_preview_\d+$/,'Explicit preview database required');
const staffId='d38f0101-1111-4111-a111-111111111111',deviceId='d38f0102-1111-4111-a111-111111111111';
const pin='246810';
try{
 const db=getDb();
 const[user]=await db.select().from(schema.users).where(eq(schema.users.email,'demo@cabukpos.local'));
 assert.ok(user,'Local demo account required');
 const[tenant]=await db.select().from(schema.tenants).where(eq(schema.tenants.id,user.tenantId));
 assert.equal(tenant?.name,'Yerel Demo');
 const device=await withTenant(user.tenantId,async tx=>{
  const[store]=await tx.select().from(schema.stores).where(eq(schema.stores.name,'Merkez'));assert.ok(store);
  const[staff]=await tx.select().from(schema.staff).where(eq(schema.staff.id,staffId));
  if(staff)assert.ok(await verifyPin(pin,staff.pinHash),'Existing test PIN preserved; cannot reset');
  else await tx.insert(schema.staff).values({id:staffId,tenantId:user.tenantId,name:'Akış Test Kasiyeri',role:'kasiyer',pinHash:await hashPin(pin)});
  const[old]=await tx.select().from(schema.devices).where(eq(schema.devices.id,deviceId));
  if(old)return old;
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const code=Array.from({length:8},()=>alphabet[randomInt(alphabet.length)]).join('');
  const[saved]=await tx.insert(schema.devices).values({id:deviceId,tenantId:user.tenantId,storeId:store.id,name:'Yerel Akış Test Kasası',role:'kasa',receiptPrefix:'AKIS',pairingCode:code,pairingExpiresAt:new Date(Date.now()+15*60000)}).returning();
  return saved;
 });
 console.log(JSON.stringify({demoOnly:true,name:device.name,staff:'Akış Test Kasiyeri',pin,paired:!!device.pairedAt,pairingCode:device.pairedAt?null:device.pairingCode}));
}finally{await closeDb();}
