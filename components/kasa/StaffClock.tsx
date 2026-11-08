"use client";
import {useRef,useState} from "react";
import {Button,Field} from "@/components/ui";
import {PasswordInput} from "@/components/PasswordInput";
type Status={name:string;record:{id:string;startsAt:string;endsAt:string|null}|null;elsewhere:boolean};
const stamp=(s:string)=>new Date(s).toLocaleString("tr-TR",{timeZone:"Europe/Istanbul"});
export function StaffClock({staff,previewOnly=false}:{staff:{id:string;name:string;pin:boolean}[];previewOnly?:boolean}){
 const[staffId,setStaffId]=useState(""),[pin,setPin]=useState(""),[status,setStatus]=useState<Status|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[done,setDone]=useState<Status|null>(null);
 const selected=staff.find(s=>s.id===staffId);
 const request=useRef<string|null>(null),lock=useRef(false);
 const send=async(direction:"status"|"in"|"out",who=staffId)=>{
  if(lock.current||previewOnly)return;lock.current=true;setBusy(true);setError("");
  try{
   if(!navigator.onLine)throw new Error("Giriş / çıkış için internet bağlantısı gerekir.");
   request.current??=crypto.randomUUID();
   const r=await fetch("/api/kasa/attendance",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({staffId:who,pin,direction,requestId:request.current,...(direction==="out"?{sessionId:status?.record?.id}:{} )}),signal:AbortSignal.timeout(12000)});
   const data=await r.json();if(!r.ok)throw new Error(data.error??"İşlem kaydedilemedi.");
   if(direction==="status"){setStatus(data);setDone(null);}else{setDone(data);setStatus(null);setPin("");request.current=null;}
  }catch(e){setError(e instanceof Error?e.message:"İşlem kaydedilemedi.");}finally{setBusy(false);lock.current=false;}
 };
 return <div className="space-y-5">{done?.record&&<div role="status" className="rounded-xl bg-ok-soft p-4 text-ok"><strong>{done.name}: {done.record.endsAt?"Çıkış kaydedildi":"Giriş kaydedildi"}</strong><p>{stamp(done.record.endsAt??done.record.startsAt)}</p></div>}<form onSubmit={e=>{e.preventDefault();void send("status");}} className="space-y-4"><fieldset disabled={busy} className="m-0 border-0 p-0"><legend className="mb-2 text-sm font-medium">Adınız</legend><div className="grid gap-2 sm:grid-cols-2">{staff.map(s=><button key={s.id} type="button" aria-pressed={staffId===s.id} onClick={()=>{setStaffId(s.id);setStatus(null);setDone(null);setPin("");request.current=null;if(!s.pin)void send("status",s.id);}} className={`press min-h-12 rounded-xl border px-3 text-left font-medium ${staffId===s.id?"border-brand bg-brand-soft text-brand":"border-line bg-surface hover:bg-surface-2"}`}>{s.name}</button>)}</div></fieldset>{selected?.pin&&<Field label="Kendi PIN’iniz"><PasswordInput name="pin" value={pin} onChange={e=>{setPin(e.target.value);setStatus(null);}} inputMode="numeric" autoComplete="off" pattern="[0-9]{4,6}" minLength={4} maxLength={6} required disabled={busy}/></Field>}{selected?.pin&&<Button type="submit" variant="secondary" disabled={busy||!staffId||previewOnly}>{busy?"Kontrol ediliyor…":"Durumumu göster"}</Button>}</form>{status&&<section className="space-y-3 rounded-xl border border-line p-4"><h2 className="font-semibold">{status.name}</h2>{status.elsewhere?<p role="alert" className="text-warn">Başka şubede açık girişiniz var. Önce o şubedeki kaydı kapatın.</p>:<><p className="text-sm">{status.record?`Girişiniz: ${stamp(status.record.startsAt)}`:"Açık girişiniz yok."}</p><Button disabled={busy} onClick={()=>void send(status.record?"out":"in")}>{busy?"Kaydediliyor…":status.record?"Çıkışımı kaydet":"Girişimi kaydet"}</Button></>}</section>}{error&&<p role="alert" className="text-bad">{error}</p>}<p className="text-xs text-muted">PIN’i olan personel kendi PIN’iyle doğrulanır. Kasa vardiyası açılmaz veya kapanmaz. PIN cihazda kalıcı olarak saklanmaz.</p>{previewOnly&&<p className="text-xs text-muted">Görsel önizleme: bu ekranda kayıt yapılmaz.</p>}</div>;
}
