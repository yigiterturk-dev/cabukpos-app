"use client";
import { useState } from "react";
import { useFormAction } from "@/components/useFormAction";
import { inventoryAction, type InventoryState } from "@/lib/admin/inventory-actions";
import { Button, Input } from "@/components/ui";
import { formatPlain } from "@/lib/core/money";
import { formatQty } from "@/lib/core/stock";
import type { StockRow } from "@/lib/admin/stock";
function Feedback({error,savedAt}:{error?:string;savedAt?:number}){return error?<p role="alert" className="text-bad">{error}</p>:savedAt?<p role="status" className="text-ok">Kaydedildi.</p>:null;}
export function LotForm({products,id}:{products:StockRow[];id:string}){
 const {state,pending,onSubmit}=useFormAction(inventoryAction,{} as InventoryState);
 const [product,setProduct]=useState(products[0]?.id??"");
 return <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2"><input name="kind" value="label" type="hidden" /><input type="hidden" name="id" value={state.nextId??id}/><label>Ürün<select name="productId" className="block min-h-11 w-full rounded-xl border border-line bg-surface" value={product} onChange={e=>setProduct(e.target.value)}>{products.map(p=><option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}</select></label><label>Miktar ({products.find(p=>p.id===product)?.unit})<Input name="qty" inputMode="decimal" required /></label><label>Parti kodu<Input name="lotCode" maxLength={80} required /></label><label>Son kullanma tarihi (isteğe bağlı)<Input name="expiresOn" type="date" /></label><p className="text-xs text-muted sm:col-span-2">Mevcut etiketsiz stok partiye ayrılır; toplam stok artmaz. Çıkışlarda önce SKT tarihi en yakın parti düşülür. Süresi geçen ürünleri fiziksel olarak ayırıp imha kaydı oluşturun.</p><Button type="submit" disabled={pending||!products.length}>{pending?"Kaydediliyor…":"Parti etiketi oluştur"}</Button><Feedback {...state}/></form>;
}
export function InventoryStatusForm({id,kind,label}:{id:string;kind:"receive"|"cancel"|"dispose";label:string}){
 const {state,pending,onSubmit}=useFormAction(inventoryAction,{} as InventoryState);
 return <form onSubmit={onSubmit}><input name="kind" type="hidden" value={kind}/><input name="id" type="hidden" value={id}/><Button variant="secondary" type="submit" disabled={pending}>{pending?"İşleniyor…":label}</Button><Feedback {...state}/></form>;
}
export function ProcurementForm({products,suppliers,id}:{products:StockRow[];suppliers:{id:string;name:string}[];id:string}){
 const {state,pending,onSubmit}=useFormAction(inventoryAction,{} as InventoryState);
 return <form onSubmit={onSubmit} className="space-y-4"><input type="hidden" name="kind" value="order"/><input type="hidden" name="id" value={state.nextId??id}/><label className="block">Tedarikçi<select name="supplierId" required className="block min-h-11 w-full rounded-xl border border-line bg-surface"><option value="">Seçin</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><p className="text-sm text-muted">Önerilen miktar minimum seviyeye kadar tamamlar. Almayacağınız ürünün miktarını boş bırakın. Sipariş tedarikçiye otomatik gönderilmez; stoğa yalnız teslim aldığınızda işlenir.</p><fieldset key={state.savedAt??0} disabled={pending} className="space-y-3">{products.map(p=><div key={p.id} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-2 lg:grid-cols-4"><h3 className="font-semibold sm:col-span-2 lg:col-span-4">{p.name} · Stok {formatQty(p.level,p.unit)}</h3><input name="productId" type="hidden" value={p.id}/><label>Miktar ({p.unit})<Input name="qty" defaultValue={p.level<(p.minStock??0)?String(((p.minStock??0)-p.level)/1000):""} inputMode="decimal"/></label><label>Birim fiyat (₺)<Input name="unitCost" defaultValue={formatPlain(p.cost??0)} inputMode="decimal"/></label><label>Parti kodu<Input name="lotCode" maxLength={80} defaultValue={`TED-${id.slice(0,8)}`}/></label><label>SKT<Input name="expiresOn" type="date"/></label></div>)}</fieldset><label className="block">Açıklama<Input name="note" maxLength={1000}/></label><Button type="submit" disabled={pending||!products.length||!suppliers.length}>{pending?"Kaydediliyor…":"Tedarik siparişi oluştur"}</Button><Feedback {...state}/></form>;
}
