"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { DeliveryBoard } from "@/components/kasa/DeliveryBoard";
import { KasaPreviewProvider } from "@/components/kasa/KasaPreviewContext";
import { BillScreen } from "@/components/kasa/BillScreen";
import { Dialog, Button } from "@/components/ui";
import { emptyMeta, type Meta } from "@/lib/offline/state";
import { foldTabs, type TabEv, type TabEvent } from "@/lib/core/tab";
import { paidLinesOf } from "@/lib/core/split";
import { totals } from "@/lib/core/cart";
import { settle } from "@/lib/core/payment";
import { kasaFmt } from "@/components/kasa/kasa-format";
import { KitchenScreen } from "@/components/kasa/KitchenScreen";

const NOW = Date.parse("2026-10-24T13:00:00+03:00");
const meta: Meta = { ...emptyMeta(), catalog: { categories: [], products: [], staff: [{ id: "manager", name: "Demo Yönetici", role: "mudur" }, { id: "courier-a", name: "Demo Deniz", role: "kurye" }, { id: "courier-b", name: "Demo Ekin", role: "kurye" }], tables: Array.from({ length: 14 }, (_, i) => ({ id: `kitchen-table-${i}`, areaId: "salon", name: `Örnek masa ${i + 1}` })), stations: [{ id: "izgara", name: "Izgara", printer: null }, { id: "bar", name: "İçecek", printer: null }] } };
function fixtures() {
  const result: TabEvent[] = [];
  const names = ["Demo Elif", "Demo Can", "Demo Ada", "Demo Ege", "Demo Selin", "Demo Bora", "Demo Defne", "Demo Ali"];
  names.forEach((name, i) => {
    const id = `order-${i}`;
    const platform = i === 0 || i === 6;
    const evs: TabEv[] = [{ type: "open", guests: 0, kind: platform ? "platform" : "paket" }, { type: "order", name, customerId: null, phone: `000010000${i}`, address: `Örnek Mahallesi, Demo Sokak No: ${i + 1}`, zoneId: null, directions: "Örnek adres — teslimat için kullanmayın", note: i === 3 ? "Zili çalmayın" : null, payIntent: platform ? "online" : i % 2 ? "nakit" : "kart", promisedAt: null, source: platform ? { platform: i === 0 ? "yemeksepeti" : "trendyol", externalId: `DEMO-${4800 + i}`, deadline: new Date(NOW + 3 * 60000).toISOString() } : null }, { type: "add", lineId: `${id}-food`, productId: null, name: "Adana kebap", unitPrice: 28000, vatRate: 10, qtyMilli: 1000, stationId: null, options: [], note: null }, { type: "add", lineId: `${id}-drink`, productId: null, name: "Ayran", unitPrice: 3500, vatRate: 10, qtyMilli: 1000, stationId: null, options: [], note: null }];
    if (i > 0) evs.push({ type: "accept", prepMin: 20 }, { type: "send", ticketId: `${id}-ticket`, lineIds: [`${id}-food`, `${id}-drink`], stationId: null });
    if (i > 1 && i < 7) evs.push({ type: "kitchen", ticketId: `${id}-ticket`, status: "hazir" });
    if (i > 2 && i < 6) evs.push({ type: "courier", staffId: i % 2 ? "courier-a" : "courier-b" });
    if (i > 2 && i < 6) evs.push({ type: "out" });
    if (i === 4 || i === 5) evs.push({ type: "delivered", method: i === 4 ? "kart" : "nakit" }, { type: "paid", saleId: `sale-${i}`, amount: 31500, lines: [{ lineId: `${id}-food`, qtyMilli: 1000, discount: 0 }, { lineId: `${id}-drink`, qtyMilli: 1000, discount: 0 }] });
    if (i === 7) evs.push({ type: "cancel", reason: "Örnek iptal" });
    evs.forEach((ev, k) => result.push({ id: `${id}-${k}`, tabId: id, tableId: null, staffId: "manager", approvedBy: null, seq: result.length + 1, at: new Date(NOW - (60 - i * 3) * 60000 + k * 60000).toISOString(), ev }));
  });
  for (let i = 0; i < 14; i++) {
    const id = `kitchen-${i}`, stationId = i % 3 ? "izgara" : "bar";
    const evs: TabEv[] = [{ type: "open", kind: "masa", guests: 2 }, { type: "add", lineId: `${id}-food`, productId: null, name: i % 3 ? "Köfte" : "Ayran", unitPrice: i % 3 ? 24000 : 3500, vatRate: 10, qtyMilli: 1000 + i % 3 * 1000, stationId, options: [], note: i % 5 === 0 ? i % 3 ? "Acısız hazırlayın" : "Buzsuz servis edin" : null }, { type: "send", ticketId: `${id}-ticket`, lineIds: [`${id}-food`], stationId }];
    if (i % 4 !== 0) evs.push({ type: "kitchen", ticketId: `${id}-ticket`, status: i % 4 === 2 ? "hazir" : "hazirlaniyor" });
    evs.forEach((ev, k) => result.push({ id: `${id}-${k}`, tabId: id, tableId: `kitchen-table-${i}`, staffId: "manager", approvedBy: null, seq: result.length + 1, at: new Date(NOW - (10 - i / 2) * 60000 + k * 1000).toISOString(), ev }));
  }
  return result;
}
export default function DispatchPreview() {
  const [events, setEvents] = useState(fixtures);
  const [selected, setSelected] = useState<string | null>(null);
  const [bill, setBill] = useState<string | null>(null);
  const [section, setSection] = useState<"dispatch" | "kitchen">("dispatch");
  const tabs = useMemo(() => foldTabs(events), [events]);
  const { TL } = kasaFmt(meta);
  const append = async (list: { tabId: string; ev: TabEv }[]) => {
    setEvents(old => [...old, ...list.map((e, i): TabEvent => ({ id: crypto.randomUUID(), tabId: e.tabId, tableId: null, at: new Date(NOW + old.length + i).toISOString(), staffId: "manager", approvedBy: null, seq: old.length + i + 1, ev: e.ev }))]);
  };
  if (process.env.NODE_ENV === "production") return <p className="p-8">Önizleme yalnız geliştirme ortamında açılır.</p>;
  const t = selected ? tabs.get(selected) : null;
  const billing = bill ? tabs.get(bill) : null;
  return <KasaPreviewProvider><main className="min-h-screen bg-canvas">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-5 py-3 text-sm"><p><strong>ÇabukPOS · Sevkiyat önizlemesi</strong><span className="ml-2 text-muted">Örnek veriler · işlemler yalnız bu sayfada çalışır</span></p><Link href="/kasa" className="inline-flex min-h-11 items-center font-medium text-brand underline">Gerçek kasaya dön</Link></div>
    <nav aria-label="Deneme ekranları" className="flex flex-wrap gap-2 border-b border-line px-4 py-3"><Button variant="secondary" aria-pressed={!bill && section === "dispatch"} onClick={() => { setBill(null); setSection("dispatch"); }}>Paket ve kurye</Button><Button variant="secondary" aria-pressed={!bill && section === "kitchen"} onClick={() => { setBill(null); setSection("kitchen"); }}>Mutfak denemesi</Button><Button variant="secondary" aria-pressed={!!bill} onClick={() => { setSection("dispatch"); setBill("order-2"); }}>Ürün paylaşımı denemesi</Button></nav>
    {billing ? <BillScreen tab={billing} tableName={billing.order?.name ?? "Demo"} onBack={() => setBill(null)} onReceipt={() => {}} onPay={async (part, id, payments) => { const s = settle(totals(part).total, payments); if (!s.ok) return s; await append([{ tabId: billing.id, ev: { type: "paid", saleId: id, amount: totals(part).total, lines: paidLinesOf(part) } }]); return { ok: true, saleId: id, receiptNo: `DEMO-${events.length}`, change: s.change }; }} /> : section === "kitchen" ? <KitchenScreen meta={meta} tabs={tabs} now={NOW} loaded add={append} /> : <DeliveryBoard meta={meta} onMeta={() => {}} tabs={tabs} now={NOW} loaded add={append} waiter={{ id: "manager", name: "Demo Yönetici", role: "mudur" }} onNew={() => setSelected("new")} onOpen={setSelected} onBill={setBill} onHandover={async tab => { await append([{ tabId: tab.id, ev: { type: "handover" } }]); }} />}
    {selected && <Dialog label="Örnek sipariş" title={t?.order?.name ?? "Yeni paket"} onClose={() => setSelected(null)} footer={<Button variant="secondary" onClick={() => setSelected(null)}>Kapat</Button>}><p className="mb-3 text-sm text-muted">{t?.order?.address ?? "Yeni sipariş oluşturma gerçek kasada kullanılabilir."}</p>{t && <ul className="space-y-2 text-sm">{t.lines.map(l => <li key={l.lineId}>{l.name} · {TL(l.unitPrice)}</li>)}</ul>}</Dialog>}
  </main></KasaPreviewProvider>;
}
