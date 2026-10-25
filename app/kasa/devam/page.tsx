import Link from "next/link";
import {and,eq} from "drizzle-orm";
import {schema,withTenant} from "@/db";
import {getDevice} from "@/lib/auth/kasa";
import {StaffClock} from "@/components/kasa/StaffClock";
import {buttonClass} from "@/components/ui";
export const dynamic="force-dynamic";
export default async function StaffClockPage(){
 const device=await getDevice();
 if(!device)return <main className="mx-auto max-w-lg space-y-4 p-6"><h1 className="text-2xl font-bold">Personel giriş / çıkış</h1><p>Bu sayfa işletmeye eşlenmiş kasa, garson veya kurye cihazından kullanılır.</p><Link href="/kasa" className={buttonClass("secondary")}>Kasa girişine dön</Link></main>;
 const staff=await withTenant(device.tenantId,tx=>tx.select({id:schema.staff.id,name:schema.staff.name}).from(schema.staff).where(and(eq(schema.staff.tenantId,device.tenantId),eq(schema.staff.active,true))).orderBy(schema.staff.name));
 return <main className="min-h-screen bg-canvas px-4 py-8"><section className="mx-auto max-w-lg rounded-2xl border border-line bg-surface p-5"><p className="mb-2 text-sm text-muted">{device.tenantName} · {device.name}</p><h1 className="mb-5 text-2xl font-bold">Personel giriş / çıkış</h1><StaffClock staff={staff}/><Link href="/kasa" className="mt-5 inline-flex min-h-11 items-center text-sm text-brand underline">Kasaya dön</Link></section></main>;
}
