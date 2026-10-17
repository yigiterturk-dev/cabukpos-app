// lib/kiosk.ts — #37: QR menü + self-order kiosko. Sipariş, platform hattıyla aynı tab olaylarına düşer;
// kasiyer paneldeki paket hattından kabul eder (autoAccept açıksa otomatik). Kod menü URL'siyle gider (?k=).
import { timingSafeEqual } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema, withTenant } from "@/db";
import { isVatRate, type Kurus } from "@/lib/core/money";
import { sendByStation, type MappedProduct } from "@/lib/core/platform";
import type { PayIntent, TabEv } from "@/lib/core/tab";
import { upsertCustomer } from "@/lib/sync/apply";
import { categoryStationForStore, loadStoreStationRoutes, productStationForStore } from "@/lib/core/station-routing";

export type MenuItem = { id: string; name: string; price: Kurus; categoryId: string | null; kind: "adet" | "tartili" };
export type MenuData = { tenant: string; vertical: "restoran" | "market"; store: string; categories: { id: string; name: string }[]; products: MenuItem[]; tables: { id: string; name: string }[] };

export async function menuByStore(storeId: string): Promise<MenuData | null> {
  if (!/^[0-9a-f-]{36}$/i.test(storeId)) return null;
  const rows = (await getDb().execute(sql`select public_menu_by_store(${storeId}::uuid) as m`)) as unknown as { m: MenuData | null }[];
  return rows[0]?.m ?? null;
}

export type KioskConn = { id: string; tenantId: string; storeId: string; autoAccept: boolean; webhookSecret: string };

/** Menü sırası için kiosko bağlantısı: aktif kiosko bağlantısı + sırrı. */
export async function kioskConn(storeId: string, secret: string): Promise<KioskConn | null> {
  if (!/^[0-9a-f-]{36}$/i.test(storeId) || !secret) return null;
  const C = schema.platformConnections;
  const rows = await getDb().select({ id: C.id, tenantId: C.tenantId, storeId: C.storeId, autoAccept: C.autoAccept, webhookSecret: C.webhookSecret })
    .from(C).where(and(eq(C.storeId, storeId), eq(C.platform, "kiosk"), eq(C.active, true))).limit(1);
  const c = rows[0];
  if (!c) return null;
  const a = Buffer.from(c.webhookSecret), b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return c;
}

/** Sipariş olayları: open + order + add'ler (+autoAccept ise accept ve istasyon biletleri). Saf. */
export function kioskEvents(
  items: { productId: string; qtyMilli: number; note: string | null }[],
  menu: { get: (id: string) => MappedProduct & { price: Kurus } | undefined },
  info: { name: string; phone: string; note: string | null; payIntent: PayIntent },
  autoAccept: boolean,
  newId: () => string,
  prepMin: number,
): { events: TabEv[]; total: Kurus } {
  const adds: Extract<TabEv, { type: "add" }>[] = [];
  let total: Kurus = 0;
  for (const l of items) {
    const p = menu.get(l.productId);
    if (!p || !isVatRate(p.vatRate)) continue;
    total += Math.round((p.price * l.qtyMilli) / 1000);
    adds.push({ type: "add", lineId: newId(), productId: p.id, name: p.name, unitPrice: p.price, vatRate: p.vatRate, qtyMilli: l.qtyMilli, options: [], note: l.note, stationId: p.stationId ?? null });
  }
  if (!adds.length) return { events: [], total: 0 };
  const events: TabEv[] = [
    { type: "open", guests: 0, kind: "platform" },
    { type: "order", customerId: null, name: info.name, phone: info.phone, address: "", directions: null, zoneId: null, note: info.note, payIntent: info.payIntent, promisedAt: null, source: { platform: "kiosk", externalId: "k-" + newId(), deadline: null } },
    ...adds,
  ];
  if (autoAccept) events.push({ type: "accept", prepMin }, ...sendByStation(adds, newId));
  return { events, total };
}

export type KioskResult = { ok: true; tabId: string } | { ok: false; reason: string };

/** Siparişi tab olayları olarak yazar; kasiyer hattına düşer. */
export async function kioskOrder(conn: KioskConn, input: {
  name: string; phone: string; note: string | null; payIntent: "nakit" | "kart" | "yemek_karti" | "online";
  lines: { productId: string; qtyMilli: number; note: string | null }[];
}): Promise<KioskResult> {
  return withTenant(conn.tenantId, async (tx) => {
    const P = schema.products, K = schema.categories;
    const ids = input.lines.map((l) => l.productId).filter((i) => /^[0-9a-f-]{36}$/i.test(i));
    if (!ids.length) return { ok: false as const, reason: "Sepet boş." };
    const rows = await tx.select({ id: P.id, name: P.name, price: P.price, vatRate: P.vatRate, categoryId: P.categoryId, stationId: P.stationId, catStation: K.stationId })
      .from(P).leftJoin(K, eq(K.id, P.categoryId))
      .where(and(eq(P.tenantId, conn.tenantId), eq(P.active, true), eq(P.sellable, true), inArray(P.id, ids)));
    const routes = await loadStoreStationRoutes(tx, conn.storeId);
    const categoryStations = new Map(rows.filter((p) => p.categoryId).map((p) => [p.categoryId!, categoryStationForStore(p.categoryId!, p.catStation, routes)]));
    const menu = new Map(rows.filter((p) => isVatRate(p.vatRate)).map((p) => [p.id, { id: p.id, name: p.name, vatRate: p.vatRate as MappedProduct["vatRate"], stationId: productStationForStore(p.id, p.stationId, p.categoryId ? categoryStations.get(p.categoryId) ?? null : null, routes), price: p.price }]));
    const { events, total } = kioskEvents(input.lines, menu, { name: input.name, phone: input.phone, note: input.note, payIntent: input.payIntent }, conn.autoAccept, () => crypto.randomUUID(), 20);
    if (!events.length || total <= 0) return { ok: false as const, reason: "Ürünler bulunamadı." };
    const tabId = crypto.randomUUID();
    const base = Date.now();
    await tx.insert(schema.tabEvents).values(events.map((ev, i) => ({
      id: crypto.randomUUID(), tenantId: conn.tenantId, storeId: conn.storeId, tabId, tableId: null, deviceId: null, staffId: null,
      at: new Date(base + i), type: ev.type, payload: ev,
    })));
    const ord = events.find((e): e is Extract<TabEv, { type: "order" }> => e.type === "order")!;
    await upsertCustomer(tx, conn.tenantId, ord);
    return { ok: true as const, tabId };
  });
}

// — Müşteri ekranı: olaylardan sade durum. Saf; test edilir. —

export type KioskStatus = { step: "alindi" | "onaylandi" | "hazirlaniyor" | "yolda" | "tamam" | "iptal"; label: string; prepMin: number | null; etaAt: Date | null; closed: boolean };

export function kioskStatus(events: { type: string; at: string; payload: TabEv }[]): KioskStatus {
  let prepMin: number | null = null, acceptedAt: Date | null = null, sent = false, out = false, closed = false, rejected = false;
  for (const e of events) {
    if (e.type === "accept") { const p = e.payload as Extract<TabEv, { type: "accept" }>; prepMin = p.prepMin; acceptedAt = new Date(e.at); }
    else if (e.type === "send") sent = true;
    else if (e.type === "out") out = true;
    else if (e.type === "paid" || e.type === "delivered") closed = true;
    else if (e.type === "reject" || e.type === "cancel") rejected = true;
  }
  const etaAt = prepMin !== null && acceptedAt ? new Date(acceptedAt.getTime() + prepMin * 60_000) : null;
  const step: KioskStatus["step"] = rejected ? "iptal" : closed ? "tamam" : out ? "yolda" : sent ? "hazirlaniyor" : acceptedAt ? "onaylandi" : "alindi";
  const label = { alindi: "Siparişin alındı, onay bekleniyor.", onaylandi: `Onaylandı${prepMin ? ` — yaklaşık ${prepMin} dk` : ""}.`, hazirlaniyor: "Hazırlanıyor.", yolda: "Hazır — teslim ediliyor.", tamam: "Tamamlandı. Afiyet olsun!", iptal: "Sipariş iptal edildi." }[step];
  return { step, label, prepMin, etaAt, closed: closed || rejected };
}
