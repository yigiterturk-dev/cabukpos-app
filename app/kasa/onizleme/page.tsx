"use client";
// TASARIM ÖNİZLEMESİ (yalnız geliştirme): DB/eşleme gerekmeden tüm kasa ekranlarını sahte veriyle render eder.
// Üretimde boş sayfa döner. Gerçek iş mantığı yok; tüm eylemler no-op.
import { useState } from "react";
import { Bike, ChefHat, LayoutGrid, Receipt, Users, Wallet, Zap } from "lucide-react";
import type { Area, KasaProduct, Meta, Table } from "@/lib/offline/state";
import type { Delivery, TabLine, TabState, Ticket } from "@/lib/core/tab";
import type { NewTabEvent } from "@/lib/offline/tabs";
import { kasaFmt } from "@/components/kasa/kasa-format";
import { SaleScreen, PayDialog, type OnSale, type OnPay, type PrintView } from "@/components/kasa/SaleScreen";
import { SalonScreen } from "@/components/kasa/SalonScreen";
import { TabScreen } from "@/components/kasa/TabScreen";
import { KitchenScreen } from "@/components/kasa/KitchenScreen";
import { DeliveryBoard } from "@/components/kasa/DeliveryBoard";
import { RefundScreen } from "@/components/kasa/RefundScreen";
import { NewDelivery } from "@/components/kasa/NewDelivery";
import { CourierScreen } from "@/components/kasa/CourierScreen";
import { PinPad } from "@/components/kasa/PinPad";
import { KasaPreviewProvider } from "@/components/kasa/KasaPreviewContext";
import { ActionTile, Button, Kbd, StatCard } from "@/components/ui";

const cats = [
  { id: "c1", name: "Ana yemek" },
  { id: "c2", name: "Tatlılar" },
  { id: "c3", name: "İçecek" },
  { id: "c4", name: "Başlangıç" },
];
// Önizleme SSR ve istemci arasında aynı zamanı kullanmalı; aksi halde Next hydration uyarısı verir.
const PREVIEW_NOW = Date.parse("2026-10-13T12:00:00+03:00");
const mkP = (id: string, name: string, price: number, categoryId: string, kind: KasaProduct["kind"] = "adet", quick = true): KasaProduct =>
  ({ id, name, price, vatRate: 10, categoryId, barcodes: [`8690000${id}`], kind, plu: null, quick });

const marketProducts: KasaProduct[] = [
  mkP("m1", "Ekmek", 1000, "c4"), mkP("m2", "Süt 1L", 3250, "c4"), mkP("m3", "Yumurta 10'lu", 6800, "c4"),
  mkP("m4", "Domates (kg)", 2490, "c4", "tartili"), mkP("m5", "Su 0,5L", 1250, "c3"),
  mkP("m6", "Kola 330ml", 4000, "c3"), mkP("m7", "Çikolata", 2500, "c2"), mkP("m8", "Bisküvi", 1800, "c2"),
];
const restProducts: KasaProduct[] = [
  mkP("r1", "Adana Kebap", 32000, "c1"), mkP("r2", "Mercimek Çorba", 8500, "c1"), mkP("r3", "Karışık Pide", 26000, "c1"),
  mkP("r4", "Künefe", 14000, "c2"), mkP("r5", "Ayran", 2500, "c3"), mkP("r6", "Şalgam", 3000, "c3"),
  mkP("r7", "Baklava (kg)", 48000, "c2", "tartili"), mkP("r8", "Çoban Salata", 11000, "c4"),
];

const areas: Area[] = [{ id: "a1", name: "Salon" }, { id: "a2", name: "Teras" }];
const tables: Table[] = [
  { id: "t1", areaId: "a1", name: "M1" }, { id: "t2", areaId: "a1", name: "M2" }, { id: "t3", areaId: "a1", name: "M3" },
  { id: "t4", areaId: "a1", name: "M4" }, { id: "t5", areaId: "a1", name: "M5" }, { id: "t6", areaId: "a2", name: "T1" },
];

const meta: Meta = {
  key: "state", v: "mock",
  device: { id: "d1", name: "Kasa 1", receiptPrefix: "K1", tenantName: "Demo Restoran", vertical: "restoran", role: "kasa", stations: ["st1"], storeName: "Merkez", storeAddress: "Bağdat Cad. No:12, İstanbul", nextReceiptNo: 2, billing: null },
  catalog: {
    categories: cats, products: restProducts,
    staff: [
      { id: "s1", name: "Ayşe Garson", role: "garson", pinHash: "" },
      { id: "s2", name: "Mehmet Kasiyer", role: "kasiyer", pinHash: "" },
      { id: "s3", name: "Ali Kurye", role: "kurye", pinHash: "" },
    ],
    areas, tables,
    stations: [{ id: "st1", name: "Mutfak", printer: "kitchen" }],
    optionGroups: [],
    deliveryZones: [{ id: "z1", name: "Merkez", fee: 1500, minOrder: 10000, perKm: null, startMin: null, endMin: null }],
    priceLists: [],
  },
  shift: { id: "sh1", openedBy: "s2", openedAt: new Date(PREVIEW_NOW - 3 * 3600_000).toISOString(), openingCash: 50000 },
  lastClosed: null, nextSeq: 2, pinFails: 0, pinLockUntil: 0, agent: null, lan: null, drops: [],
};

const ISO = new Date(PREVIEW_NOW - 32 * 60_000).toISOString();
const DELIVERY: Delivery = { courierId: null, acceptedAt: null, prepMin: null, rejected: null, cancelled: null, outAt: null, deliveredAt: null, method: null, handedOver: false };
const line = (lineId: string, productId: string, name: string, unitPrice: number, qtyMilli: number): TabLine =>
  ({ type: "add", lineId, productId, name, unitPrice, vatRate: 10, qtyMilli, options: [], note: null, stationId: "st1", addedAt: ISO, staffId: "s1", sent: true, voided: false, comped: false, paidMilli: 0, paidDiscount: 0 });

const masaTab: TabState = {
  id: "tab1", tableId: "t1", kind: "masa", order: null, delivery: { ...DELIVERY }, openedAt: ISO, lastAt: ISO, guests: 2, staffId: "s1",
  lines: [line("l1", "r1", "Adana Kebap", 32000, 1000), line("l2", "r5", "Ayran", 2500, 2000)],
  tickets: [{ id: "k1", stationId: "st1", lineIds: ["l1"], at: ISO, staffId: "s1", status: "hazirlaniyor", readyAt: null, printed: true } as Ticket],
  discount: null, billRequested: false, closeRequested: false, mergedAway: false, gross: 34500, discountAmount: 0, total: 34500, paid: 0, remaining: 34500, closed: false, closedAt: null,
};
const masaTab2: TabState = { ...masaTab, id: "tab1b", tableId: "t3", lines: [line("l3", "r4", "Künefe", 14000, 1000)], tickets: [], gross: 14000, total: 14000, remaining: 14000 };
const paketTab: TabState = {
  id: "tab2", tableId: null, kind: "paket",
  order: { customerId: null, name: "Ayşe Yılmaz", phone: "05321234567", address: "Bağdat Cad. No:8", directions: "Yeşil kapı", zoneId: "z1", note: "Zili çalmayın", payIntent: "nakit", promisedAt: null, source: null },
  delivery: { ...DELIVERY, acceptedAt: ISO, courierId: "s3", outAt: ISO },
  openedAt: ISO, lastAt: ISO, guests: 0, staffId: "s2",
  lines: [line("l4", "r4", "Künefe", 14000, 1000), line("l5", "r2", "Mercimek Çorba", 8500, 1000)],
  tickets: [], discount: null, billRequested: false, closeRequested: false, mergedAway: false, gross: 22500, discountAmount: 0, total: 22500, paid: 0, remaining: 22500, closed: false, closedAt: null,
};
const platformTab: TabState = {
  ...paketTab, id: "tab3", kind: "platform", delivery: { ...DELIVERY },
  order: { customerId: null, name: "Mert K.", phone: "05329876543", address: "Nispetiye Cad. 5", directions: null, zoneId: "z1", note: null, payIntent: "online", promisedAt: null, source: { platform: "yemeksepeti", externalId: "#4821", deadline: new Date(PREVIEW_NOW + 3 * 60_000).toISOString() } },
};

const tablaTabs = (): Map<string, TabState> => new Map([masaTab, masaTab2, paketTab, platformTab].map((t) => [t.id, t]));
const noAdd = async (_: NewTabEvent[]) => { void _; };
const okSale: OnSale = async (saleId) => ({ ok: true, saleId, receiptNo: "K1-000001", change: 1500 });
const okPay: OnPay = async (saleId) => ({ ok: true, saleId, receiptNo: "K1-000001", change: 1500 });
const noop = () => {};

export default function OnizlemePage() {
  const { TL } = kasaFmt(null);
  const [pay, setPay] = useState(false);
  const [now] = useState(PREVIEW_NOW);
  const [tabs] = useState(tablaTabs);

  if (process.env.NODE_ENV === "production") {
    return <main className="grid flex-1 place-items-center p-8 text-muted">Tasarım önizlemesi yalnız geliştirme ortamında açılır.</main>;
  }

  const frame = (label: string, node: React.ReactNode, h = 560) => (
    <section aria-label={label} className="space-y-2">
      <h2 className="font-display text-lg font-bold tracking-tight">{label}</h2>
      <div className="transform-gpu min-w-0 overflow-y-auto overflow-x-hidden rounded-2xl border border-line bg-canvas" style={{ height: `min(${h}px, calc(100vh - 8rem))` }}>{node}</div>
    </section>
  );

  return (
    <KasaPreviewProvider>
    <main className="mx-auto w-full max-w-[1400px] space-y-10 px-4 py-8">
      <div className="rounded-2xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
        Tasarım önizlemesi · <b>sahte veri</b>, DB/eşleme gerekmez · gerçek bileşenler, eylemler çalışmaz.
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-bold tracking-tight">Özet karoları · hızlı geçiş · kısayol</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Ciro (KDV dahil)" value={TL(1845000)} tone="brand" icon={<Wallet />} hint="0 iade" />
          <StatCard label="Satış" value="42" tone="ok" icon={<Receipt />} hint={`nakit ${TL(620000)} · kart ${TL(1225000)}`} />
          <StatCard label="Açık adisyon" value="6" tone="info" icon={<Users />} />
          <StatCard label="Hazır bekleyen" value="3" tone="warn" icon={<ChefHat />} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <ActionTile icon={<Zap />} title="Hızlı satış" desc="Barkod okut ya da ürün seç" tone="brand" />
          <ActionTile icon={<LayoutGrid />} title="Salon" desc="Masa ve adisyonları yönet" />
          <ActionTile icon={<Bike />} title="Paket" desc="Paket ve platform siparişleri" />
        </div>
        <p className="text-sm text-muted">Kısayol: <Kbd>F2</Kbd> ara · <Kbd>Enter</Kbd> ekle</p>
      </section>

      {frame("Satış ekranı — market", <SaleScreen categories={cats} products={marketProducts} market onPay={okSale} onReceipt={noop} prints={{} as Record<string, PrintView>} autoFocusSearch={false} />, 640)}
      {frame("Satış ekranı — restoran", <SaleScreen categories={cats} products={restProducts} market={false} onPay={okSale} onReceipt={noop} prints={{} as Record<string, PrintView>} autoFocusSearch={false} />, 640)}
      {frame("Salon (masa planı)", <SalonScreen areas={areas} tables={tables} tabs={tabs} now={now} onOpen={noop} callsEnabled={false} />, 480)}
      {frame("Adisyon (masa detayı)", <TabScreen meta={meta} onMeta={noop} table={tables[0]} title="M1" tabs={[masaTab]} allTabs={tabs} waiter={{ id: "s1", name: "Ayşe Garson", role: "garson" }} canPay add={noAdd} now={now} onBill={noop} onBack={noop} />, 640)}
      {frame("Mutfak ekranı", <KitchenScreen meta={meta} tabs={tabs} now={now} add={noAdd} />, 480)}
      {frame("Paket panosu", <DeliveryBoard loaded meta={meta} onMeta={noop} tabs={tabs} now={now} add={noAdd} waiter={{ id: "s2", name: "Mehmet Kasiyer", role: "kasiyer" }} onNew={noop} onOpen={noop} onBill={noop} onHandover={async () => {}} />, 560)}
      {frame("Kurye ekranı", <CourierScreen meta={meta} courier={{ id: "s3", name: "Ali Kurye" }} tabs={tabs} now={now} add={noAdd} onDeliver={async () => {}} onCloseShift={noop} />, 480)}
      {frame("İade", <RefundScreen meta={meta} cashier={{ id: "s2", name: "Mehmet Kasiyer" }} online onMeta={noop} onDone={noop} onBack={noop} autoFocusLookup={false} />, 480)}
      {frame("Yeni paket sipariş", <NewDelivery meta={meta} staffId="s2" add={noAdd} onCreated={noop} onBack={noop} autoFocusPhone={false} />, 560)}
      {frame("PIN girişi", <div className="grid h-full place-items-center p-6"><PinPad meta={meta} onOk={noop} onMeta={noop} previewOnly /></div>, 420)}

      <section className="space-y-2">
        <h2 className="font-display text-lg font-bold tracking-tight">Ödeme diyaloğu</h2>
        <Button type="button" size="lg" onClick={() => setPay(true)}>Ödeme penceresini aç ({TL(38500)})</Button>
      </section>

      {pay && <PayDialog total={38500} onPay={okPay} onClose={() => setPay(false)} onDone={() => setPay(false)} />}
    </main>
    </KasaPreviewProvider>
  );
}
