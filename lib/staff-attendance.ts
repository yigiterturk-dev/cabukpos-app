import {and,eq,isNull} from "drizzle-orm";
import {schema,withTenant} from "@/db";
import {verifyPin} from "@/lib/auth/pin";
import {clockAttendance} from "@/lib/admin/attendance";
type Device={tenantId:string;storeId:string};
export async function staffAttendance(device:Device,input:{staffId:string;pin:string;direction:string;sessionId?:string;requestId?:string}){
 if(!/^[0-9a-f-]{36}$/i.test(input.staffId)||!/^\d{4,6}$/.test(input.pin)||!["status","in","out"].includes(input.direction))throw new Error("Personel ve PIN doğrulanamadı.");
 const[person]=await withTenant(device.tenantId,tx=>tx.select().from(schema.staff).where(and(eq(schema.staff.id,input.staffId),eq(schema.staff.active,true))));
 if(!person||!await verifyPin(input.pin,person.pinHash))throw new Error("Personel ve PIN doğrulanamadı.");
 if(input.direction!=="status"){
  if(input.direction==="in"&&!input.requestId)throw new Error("İşlem kimliği gerekli.");
  const id=await clockAttendance({...device,actor:{kind:"staff",id:person.id}},person.id,input.direction,input.sessionId,input.requestId);
  const[row]=await withTenant(device.tenantId,tx=>tx.select().from(schema.attendance).where(and(eq(schema.attendance.id,id),eq(schema.attendance.staffId,person.id),eq(schema.attendance.storeId,device.storeId))));
  if(!row)throw new Error("Kayıt yenilenemedi. Durumunuzu tekrar kontrol edin.");
  return {name:person.name,record:{id:row.id,startsAt:row.startsAt.toISOString(),endsAt:row.endsAt?.toISOString()??null},elsewhere:false};
 }
 const[row]=await withTenant(device.tenantId,tx=>tx.select().from(schema.attendance).where(and(eq(schema.attendance.staffId,person.id),isNull(schema.attendance.endsAt))));
 return {name:person.name,record:row?.storeId===device.storeId?{id:row.id,startsAt:row.startsAt.toISOString(),endsAt:null}:null,elsewhere:!!row&&row.storeId!==device.storeId};
}
