"use server";
// M6 paket servis yönetimi: teslimat bölgeleri, müşteri defteri, platform bağlantıları + ürün kodu eşleme.
// platform_connections RLS dışı kimlik tablosu → her sorguda tenantId koşulu.
import { and, asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema, withTenant } from "@/db";
import { requireWriter } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { parseTL } from "@/lib/core/money";
import { AUTO_PREP_MIN, type IncomingOrder } from "@/lib/core/platform";
import { CONNECTABLE_PLATFORMS } from "@/lib/platform";
import { ingestOrders } from "@/lib/platform/ingest";
import { provisionConnection } from "@/lib/platform/provision";
import { pushStoreCatalog } from "@/lib/platform/outbound";
import { encodePlatformApi, readPlatformApi } from "@/lib/platform/credentials";
import { applyDoc, tabEventsOf } from "@/lib/sync/apply";
import { foldTabs } from "@/lib/core/tab";
import { scopedStoreId } from "@/lib/admin/store-scope";
import { canManageStores, canUseStore } from "@/lib/core/access";

export type DeliveryState = { error?: string; field?: string; savedAt?: number; info?: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_KURUS = 2_147_483_647;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function firstStore(tenantId: string, actorStoreId: string | null) {
  const sid = await withTenant(tenantId, (tx) => scopedStoreId(tx, tenantId, actorStoreId));
  if (!sid) throw new Error("Şube yok");
  return sid;
}

/** Boş → 0; aksi TL. */
const money = (v: string) => (v === "" ? 0 : parseTL(v));

/** #52: "09:30" → dakika; boşsa null (sınırsız); geçersizse undefined. */
const parseWindow = (v: string): number | null | undefined => {
  if (v === "") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(v);
  if (!m) return undefined;
  const h = +m[1], min = +m[2];
  return h > 23 || min > 59 ? undefined : h * 60 + min;
};

// — Teslimat bölgeleri —
export async function saveZone(id: string | null, _: DeliveryState, form: FormData): Promise<DeliveryState> {
  const a = await requireWriter();
  const name = str(form, "name");
  if (name.length < 1 || name.length > 60) return { error: "Bölge adı 1-60 karakter.", field: "name" };
  const fee = money(str(form, "fee"));
  if (fee === null || fee > MAX_KURUS) return { error: "Ücret geçersiz; 0–21.474.836,47 arasında olmalı.", field: "fee" };
  const minOrder = money(str(form, "minOrder"));
  if (minOrder === null || minOrder > MAX_KURUS) return { error: "Asgari tutar geçersiz; 0–21.474.836,47 arasında olmalı.", field: "minOrder" };
  // #52: mesafe + servis penceresi (boş = özelliği kullanma). Boş string meşru "yok" değeridir; yalnız DOLU ama çözümlenemeyen girdi hatalıdır.
  const perKmRaw = str(form, "perKm");
  const perKm = perKmRaw === "" ? null : parseTL(perKmRaw);
  if (perKmRaw !== "" && (perKm === null || perKm > MAX_KURUS)) return { error: "Km başı ücret geçersiz; 0–21.474.836,47 arasında olmalı.", field: "perKm" };
  const startMin = parseWindow(str(form, "start"));
  if (startMin === undefined) return { error: "Başlangıç saati geçersiz.", field: "start" };
  const endMin = parseWindow(str(form, "end"));
  if (endMin === undefined) return { error: "Bitiş saati geçersiz.", field: "end" };
  if ((startMin === null) !== (endMin === null)) return { error: "Saat aralığı için başlangıç ve bitişi birlikte girin ya da ikisini de boş bırakın.", field: startMin === null ? "start" : "end" };
  if (startMin !== null && endMin !== null && startMin === endMin) return { error: "Başlangıç ve bitiş aynı olamaz.", field: "end" };
  if (id && !UUID.test(id)) return { error: "Bölge bulunamadı." };
  let storeId: string;
  try { storeId = await firstStore(a.tenantId, a.storeId); }
  catch { return { error: "Önce bir şube oluşturun." }; }
  const err = await withTenant(a.tenantId, async (tx) => {
    const Z = schema.deliveryZones;
    if (id) {
      const [row] = await tx.update(Z).set({ name, fee, minOrder, perKm, startMin, endMin }).where(and(eq(Z.id, id), eq(Z.storeId, storeId))).returning({ id: Z.id });
      if (!row) return "Bölge seçili şubede bulunamadı.";
    } else await tx.insert(Z).values({ tenantId: a.tenantId, storeId, name, fee, minOrder, perKm, startMin, endMin, sort: (await tx.select({ id: Z.id }).from(Z).where(eq(Z.storeId, storeId))).length });
    await audit(tx, a.tenantId, `user:${a.id}`, id ? "zone.update" : "zone.create", { id, name, fee, minOrder, perKm, startMin, endMin });
    return null;
  });
  if (err) return { error: err };
  revalidatePath("/yonetim/bolgeler");
  return { savedAt: Date.now() };
}

/** Kayıtlı adresler bölgeye bağlı kalabilsin diye silinmez, pasiflenir. */
export async function toggleZone(id: string, active: boolean) {
  const a = await requireWriter();
  if (!UUID.test(id)) return;
  let storeId: string;
  try { storeId = await firstStore(a.tenantId, a.storeId); }
  catch { return; }
  await withTenant(a.tenantId, async (tx) => {
    const [row] = await tx.update(schema.deliveryZones).set({ active }).where(and(eq(schema.deliveryZones.id, id), eq(schema.deliveryZones.storeId, storeId))).returning({ id: schema.deliveryZones.id });
    if (!row) return;
    await audit(tx, a.tenantId, `user:${a.id}`, "zone.active", { id, active });
  });
  revalidatePath("/yonetim/bolgeler");
}

// — Müşteriler —
export async function saveCustomer(id: string, _: DeliveryState, form: FormData): Promise<DeliveryState> {
  const a = await requireWriter();
  if (!canManageStores(a)) return { error: "Müşteri kayıtları yalnız sahip ve zincir merkezinde düzenlenir." };
  if (!UUID.test(id)) return { error: "Müşteri bulunamadı." };
  const name = str(form, "name");
  if (name.length < 1 || name.length > 120) return { error: "Ad 1-120 karakter.", field: "name" };
  const note = str(form, "note").slice(0, 300) || null;
  const marketingConsent = form.get("marketingConsent") === "on";
  const result = await withTenant(a.tenantId, async (tx): Promise<DeliveryState | undefined> => {
    const [before] = await tx.select({ marketingConsent: schema.customers.marketingConsent, marketingConsentAt: schema.customers.marketingConsentAt, marketingConsentSource: schema.customers.marketingConsentSource }).from(schema.customers).where(eq(schema.customers.id, id)).limit(1);
    if (!before) return { error: "Müşteri bulunamadı." };
    const consentChanged = before.marketingConsent !== marketingConsent;
    const marketingConsentAt = marketingConsent ? (consentChanged ? new Date() : before.marketingConsentAt) : null;
    const marketingConsentSource = marketingConsent ? (consentChanged ? "manual" : before.marketingConsentSource) : null;
    await tx.update(schema.customers).set({
      name,
      note,
      marketingConsent,
      marketingConsentAt,
      marketingConsentSource,
    }).where(eq(schema.customers.id, id));
    await audit(tx, a.tenantId, `user:${a.id}`, "customer.update", { id, marketingConsentBefore: before.marketingConsent, marketingConsentAfter: marketingConsent, consentChanged, consentSourceBefore: before.marketingConsentSource, consentSourceAfter: marketingConsentSource });
  });
  if (result?.error) return result;
  revalidatePath("/yonetim/musteriler");
  return { savedAt: Date.now() };
}

export async function deleteAddress(id: string) {
  const a = await requireWriter();
  if (!canManageStores(a)) return;
  if (!UUID.test(id)) return;
  await withTenant(a.tenantId, async (tx) => {
    await tx.update(schema.customerAddresses).set({ deleted: true }).where(eq(schema.customerAddresses.id, id));
    await audit(tx, a.tenantId, `user:${a.id}`, "customer.address.delete", { id });
  });
  revalidatePath("/yonetim/musteriler");
}

// — Platformlar —
const P = schema.platformConnections;

export async function createConnection(_: DeliveryState, form: FormData): Promise<DeliveryState> {
  const a = await requireWriter();
  const platform = str(form, "platform");
  if (!CONNECTABLE_PLATFORMS.includes(platform)) return { error: "Bu platform henüz desteklenmiyor.", field: "platform" };
  const storeId = await firstStore(a.tenantId, a.storeId);
  const connection = await provisionConnection(a.tenantId, storeId, platform, `user:${a.id}`);
  if (!connection) return { error: "Bu platform zaten bağlı.", field: "platform" };
  revalidatePath("/yonetim/platformlar");
  return { savedAt: Date.now() };
}

export async function setConnection(id: string, patch: { autoAccept?: boolean; active?: boolean }) {
  const a = await requireWriter();
  if (!UUID.test(id)) return;
  await getDb().update(P).set(patch).where(and(eq(P.id, id), eq(P.tenantId, a.tenantId), a.storeId ? eq(P.storeId, a.storeId) : undefined));
  await withTenant(a.tenantId, (tx) => audit(tx, a.tenantId, `user:${a.id}`, "platform.update", { id, ...patch }));
  revalidatePath("/yonetim/platformlar");
}

/** Pazaryeri BYOK: şube bağlantısına kendi API adresi + anahtarı (AES-256-GCM şifreli).
 *  Boş bırakılan alan kayıtlı değeri korur; ikisi de yoksa hata. */
export async function saveConnectionCredentials(connectionId: string, _: DeliveryState, form: FormData): Promise<DeliveryState> {
  const a = await requireWriter();
  const conn = await ownConnection(a, connectionId);
  if (!conn) return { error: "Bağlantı bulunamadı." };
  if (conn.platform === "mock" || conn.platform === "kiosk") return { error: "Bu platform API anahtarı kullanmaz." };
  if (conn.platform === "trendyol_yemek") return { error: "Trendyol Yemek anahtarları sunucu ortamında tanımlıdır." };
  const base = str(form, "apiBase");
  const key = str(form, "apiKey");
  if (base.length > 2048) return { error: "API adresi en çok 2.048 karakter.", field: "apiBase" };
  if (key.length > 4096) return { error: "API anahtarı çok uzun.", field: "apiKey" };
  if (base && !/^https:\/\//i.test(base)) return { error: "API adresi https:// ile başlamalı.", field: "apiBase" };
  const existing = readPlatformApi(conn);
  const nextBase = base || existing?.base || "";
  const nextKey = key || existing?.key || "";
  if (!nextBase) return { error: "API adresi gerekli.", field: "apiBase" };
  if (!nextKey) return { error: "API anahtarı gerekli.", field: "apiKey" };
  const encoded = encodePlatformApi({ base: nextBase, key: nextKey });
  if (encoded === null) return { error: "Sunucu anahtarı (AUTH_SECRET) yapılandırılmamış; anahtar saklanamaz." };
  await getDb().update(P).set({ credentials: encoded }).where(and(eq(P.id, connectionId), eq(P.tenantId, a.tenantId)));
  await withTenant(a.tenantId, (tx) => audit(tx, a.tenantId, `user:${a.id}`, "platform.credentials", { id: connectionId, platform: conn.platform, base: nextBase, keySet: true }));
  revalidatePath("/yonetim/platformlar");
  return { savedAt: Date.now() };
}

export async function clearConnectionCredentials(connectionId: string) {
  const a = await requireWriter();
  const conn = await ownConnection(a, connectionId);
  if (!conn) return;
  await getDb().update(P).set({ credentials: null }).where(and(eq(P.id, connectionId), eq(P.tenantId, a.tenantId)));
  await withTenant(a.tenantId, (tx) => audit(tx, a.tenantId, `user:${a.id}`, "platform.credentials.clear", { id: connectionId, platform: conn.platform }));
  revalidatePath("/yonetim/platformlar");
}

async function ownConnection(a: { tenantId: string; storeId: string | null; role: "sahip" | "mudur" }, id: string) {
  if (!UUID.test(id)) return null;
  const [c] = await getDb().select().from(P).where(and(eq(P.id, id), eq(P.tenantId, a.tenantId)));
  return c && canUseStore(a, c.storeId) ? c : null;
}

export async function saveCode(connectionId: string, _: DeliveryState, form: FormData): Promise<DeliveryState> {
  const a = await requireWriter();
  const conn = await ownConnection(a, connectionId);
  if (!conn) return { error: "Bağlantı bulunamadı." };
  const code = str(form, "code");
  const productId = str(form, "productId");
  if (code.length < 1 || code.length > 60) return { error: "Platform kodu 1-60 karakter.", field: "code" };
  if (!UUID.test(productId)) return { error: "Ürün seçin.", field: "productId" };
  const C = schema.productPlatformCodes;
  const err = await withTenant(a.tenantId, async (tx) => {
    const [p] = await tx.select({ id: schema.products.id }).from(schema.products).where(eq(schema.products.id, productId));
    if (!p) return "Ürün bulunamadı.";
    await tx.insert(C).values({ tenantId: a.tenantId, storeId: conn.storeId, platform: conn.platform, code, productId })
      .onConflictDoUpdate({ target: [C.storeId, C.platform, C.code], set: { productId } });
    await audit(tx, a.tenantId, `user:${a.id}`, "platform.code", { platform: conn.platform, code, productId });
    return null;
  });
  if (err) return { error: err, field: "productId" };
  revalidatePath("/yonetim/platformlar");
  return { savedAt: Date.now() };
}

export async function deleteCode(id: string) {
  const a = await requireWriter();
  if (!UUID.test(id)) return;
  await withTenant(a.tenantId, async (tx) => {
    const C = schema.productPlatformCodes;
    if (a.storeId) {
      const [row] = await tx.select({ id: C.id }).from(C).where(and(eq(C.id, id), eq(C.storeId, a.storeId)));
      if (!row) return;
    }
    await tx.delete(C).where(eq(C.id, id));
    await audit(tx, a.tenantId, `user:${a.id}`, "platform.code.delete", { id });
  });
  revalidatePath("/yonetim/platformlar");
}

/** Deneme siparişi: eşlenmiş ilk kod (yoksa ilk ürün, eşlenmemiş) ile sahte platform siparişi — kasada onay kartı düşer. */
export async function sendTestOrder(connectionId: string): Promise<DeliveryState> {
  const a = await requireWriter();
  const conn = await ownConnection(a, connectionId);
  if (!conn || conn.platform !== "mock") return { error: "Deneme siparişi yalnız Deneme platformunda." };
  const pick = await withTenant(a.tenantId, async (tx) => {
    const C = schema.productPlatformCodes, Pr = schema.products;
    const [m] = await tx.select({ code: C.code, name: Pr.name, price: Pr.price }).from(C).innerJoin(Pr, eq(Pr.id, C.productId)).where(and(eq(C.storeId, conn.storeId), eq(C.platform, conn.platform))).limit(1);
    if (m) return m;
    const [p] = await tx.select({ name: Pr.name, price: Pr.price }).from(Pr).where(eq(Pr.active, true)).orderBy(asc(Pr.name)).limit(1);
    return p ? { code: `DENEME-${p.name.slice(0, 20)}`, ...p } : null;
  });
  if (!pick) return { error: "Önce ürün ekleyin." };
  const n = Math.floor(Math.random() * 9000) + 1000;
  const order: IncomingOrder = {
    externalId: `DENEME-${Date.now()}`, customer: { name: `Deneme Müşteri ${n}`, phone: `0555000${n}` }, address: "Deneme Mah. Örnek Sok. No: 1", directions: null,
    note: "Deneme siparişi", payIntent: "online", deadline: new Date(Date.now() + 5 * 60_000).toISOString(),
    lines: [{ code: pick.code, name: pick.name, unitPrice: pick.price, qtyMilli: 1000, note: null }],
  };
  const r = await ingestOrders(conn, [order]);
  return { savedAt: Date.now(), info: r.unmapped ? "Sipariş gönderildi (ürün kodu eşlenmemiş, serbest satır düştü)." : "Sipariş gönderildi; kasada Paket sekmesine düştü." };
}

/** #29: Eşlenmiş ürünleri (ad/fiyat/stok) platforma gönderir. */
export async function pushCatalog(connectionId: string): Promise<DeliveryState> {
  const a = await requireWriter();
  const conn = await ownConnection(a, connectionId);
  if (!conn) return { error: "Bağlantı bulunamadı." };
  const r = await pushStoreCatalog(a.tenantId, conn.storeId, conn.platform, `user:${a.id}`);
  if ("error" in r) {
    const msg: Record<typeof r.error, string> = {
      not_connected: "Bağlantı kapalı ya da yok.",
      unsupported: "Bu platform henüz geri push desteklemiyor (kiosk/ys).",
      no_items: "Gönderilecek ürün yok: önce ürün kodu eşleyin.",
    };
    return { error: msg[r.error] };
  }
  revalidatePath("/yonetim/platformlar");
  return { savedAt: Date.now(), info: `${r.ok}/${r.total} ürün gönderildi${r.failed ? `, ${r.failed} başarısız` : ""}.` };
}

/** Yönetimden tek tıkla platform/paket siparişi onaylama: kasada accept olayıyla aynı akış (oto-kabulle aynı hazırlık süresi). */
export async function acceptPlatformOrder(tabId: string): Promise<void> {
  const a = await requireWriter();
  if (!UUID.test(tabId)) return;
  const [tab] = await withTenant(a.tenantId, (tx) => tx.select({ storeId: schema.tabEvents.storeId }).from(schema.tabEvents).where(eq(schema.tabEvents.tabId, tabId)).limit(1));
  if (!tab || !canUseStore(a, tab.storeId)) return;
  const storeId = tab.storeId;
  const [device] = await getDb().select({ id: schema.devices.id, receiptPrefix: schema.devices.receiptPrefix }).from(schema.devices)
    .where(and(eq(schema.devices.tenantId, a.tenantId), eq(schema.devices.storeId, storeId), eq(schema.devices.role, "kasa"))).limit(1);
  const [staff] = await withTenant(a.tenantId, (tx) => tx.select({ id: schema.staff.id }).from(schema.staff).where(eq(schema.staff.active, true)).orderBy(sql`case when ${schema.staff.role} = 'mudur' then 0 else 1 end`).limit(1)); // audit temiz olsun: önce müdür
  if (!device || !staff) return;
  const r = await applyDoc({ tenantId: a.tenantId, storeId, deviceId: device.id, receiptPrefix: device.receiptPrefix },
    { kind: "tab", id: crypto.randomUUID(), tabId, tableId: null, at: new Date().toISOString(), staffId: staff.id, approvedBy: null, ev: { type: "accept", prepMin: AUTO_PREP_MIN } });
  if (!r.ok) return;
  await withTenant(a.tenantId, (tx) => audit(tx, a.tenantId, `user:${a.id}`, "platform.accept", { tabId }));
  revalidatePath("/yonetim/platformlar");
}

/** Yönetimden reddetme: yalnız onay bekleyen platform siparişi; kasadaki red akışıyla aynı (platforma bildirilir). */
export async function rejectPlatformOrder(tabId: string, reason: string): Promise<void> {
  const a = await requireWriter();
  if (!UUID.test(tabId)) return;
  const [tab] = await withTenant(a.tenantId, (tx) => tx.select({ storeId: schema.tabEvents.storeId }).from(schema.tabEvents).where(eq(schema.tabEvents.tabId, tabId)).limit(1));
  if (!tab || !canUseStore(a, tab.storeId)) return;
  const storeId = tab.storeId;
  const state = foldTabs(await withTenant(a.tenantId, (tx) => tabEventsOf(tx, tabId))).get(tabId);
  if (!state || state.closed || state.delivery.acceptedAt || state.delivery.rejected) return; // yalnız onay bekliyorken
  const [device] = await getDb().select({ id: schema.devices.id, receiptPrefix: schema.devices.receiptPrefix }).from(schema.devices)
    .where(and(eq(schema.devices.tenantId, a.tenantId), eq(schema.devices.storeId, storeId), eq(schema.devices.role, "kasa"))).limit(1);
  const [staff] = await withTenant(a.tenantId, (tx) => tx.select({ id: schema.staff.id }).from(schema.staff).where(eq(schema.staff.active, true)).orderBy(sql`case when ${schema.staff.role} = 'mudur' then 0 else 1 end`).limit(1)); // audit temiz olsun: önce müdür
  if (!device || !staff) return;
  const r = await applyDoc({ tenantId: a.tenantId, storeId, deviceId: device.id, receiptPrefix: device.receiptPrefix },
    { kind: "tab", id: crypto.randomUUID(), tabId, tableId: null, at: new Date().toISOString(), staffId: staff.id, approvedBy: null, ev: { type: "reject", reason: reason.slice(0, 200) || "yönetim reddi" } });
  if (!r.ok) return;
  await withTenant(a.tenantId, (tx) => audit(tx, a.tenantId, `user:${a.id}`, "platform.admin.reject", { tabId }));
  revalidatePath("/yonetim/platformlar");
}
