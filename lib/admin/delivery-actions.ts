"use server";
// M6 paket servis yönetimi: teslimat bölgeleri, müşteri defteri, platform bağlantıları + ürün kodu eşleme.
// platform_connections RLS dışı kimlik tablosu → her sorguda tenantId koşulu.
import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema, withTenant } from "@/db";
import { requireWriter } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { newDeviceToken } from "@/lib/auth/tokens";
import { parseTL } from "@/lib/core/money";
import type { IncomingOrder } from "@/lib/core/platform";
import { SUPPORTED_PLATFORMS } from "@/lib/platform";
import { ingestOrders } from "@/lib/platform/ingest";
import { applyDoc } from "@/lib/sync/apply";
import { scopedStoreId } from "@/lib/admin/store-scope";

export type DeliveryState = { error?: string; field?: string; savedAt?: number; info?: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function firstStore(tenantId: string) {
  const sid = await withTenant(tenantId, (tx) => scopedStoreId(tx, tenantId));
  if (!sid) throw new Error("Şube yok");
  return sid;
}

/** Boş → 0; aksi TL. */
const money = (v: string) => (v === "" ? 0 : parseTL(v));

// — Teslimat bölgeleri —
export async function saveZone(id: string | null, _: DeliveryState, form: FormData): Promise<DeliveryState> {
  const a = await requireWriter();
  const name = str(form, "name");
  if (name.length < 1 || name.length > 60) return { error: "Bölge adı 1-60 karakter.", field: "name" };
  const fee = money(str(form, "fee"));
  if (fee === null) return { error: "Ücret geçersiz.", field: "fee" };
  const minOrder = money(str(form, "minOrder"));
  if (minOrder === null) return { error: "Asgari tutar geçersiz.", field: "minOrder" };
  if (id && !UUID.test(id)) return { error: "Bölge bulunamadı." };
  const storeId = await firstStore(a.tenantId);
  await withTenant(a.tenantId, async (tx) => {
    const Z = schema.deliveryZones;
    if (id) await tx.update(Z).set({ name, fee, minOrder }).where(eq(Z.id, id));
    else await tx.insert(Z).values({ tenantId: a.tenantId, storeId, name, fee, minOrder, sort: (await tx.select({ id: Z.id }).from(Z)).length });
    await audit(tx, a.tenantId, `user:${a.id}`, id ? "zone.update" : "zone.create", { id, name, fee, minOrder });
  });
  revalidatePath("/yonetim/bolgeler");
  return { savedAt: Date.now() };
}

/** Kayıtlı adresler bölgeye bağlı kalabilsin diye silinmez, pasiflenir. */
export async function toggleZone(id: string, active: boolean) {
  const a = await requireWriter();
  if (!UUID.test(id)) return;
  await withTenant(a.tenantId, async (tx) => {
    await tx.update(schema.deliveryZones).set({ active }).where(eq(schema.deliveryZones.id, id));
    await audit(tx, a.tenantId, `user:${a.id}`, "zone.active", { id, active });
  });
  revalidatePath("/yonetim/bolgeler");
}

// — Müşteriler —
export async function saveCustomer(id: string, _: DeliveryState, form: FormData): Promise<DeliveryState> {
  const a = await requireWriter();
  if (!UUID.test(id)) return { error: "Müşteri bulunamadı." };
  const name = str(form, "name");
  if (name.length < 1 || name.length > 120) return { error: "Ad 1-120 karakter.", field: "name" };
  const note = str(form, "note").slice(0, 300) || null;
  const marketingConsent = form.get("marketingConsent") === "on";
  const result = await withTenant(a.tenantId, async (tx): Promise<DeliveryState | undefined> => {
    const [before] = await tx.select({ marketingConsent: schema.customers.marketingConsent, marketingConsentAt: schema.customers.marketingConsentAt, marketingConsentSource: schema.customers.marketingConsentSource }).from(schema.customers).where(eq(schema.customers.id, id)).limit(1);
    if (!before) return { error: "Müşteri bulunamadı." };
    await tx.update(schema.customers).set({ name, note, marketingConsent, marketingConsentAt: marketingConsent ? new Date() : null, marketingConsentSource: marketingConsent ? "manual" : null }).where(eq(schema.customers.id, id));
    await audit(tx, a.tenantId, `user:${a.id}`, "customer.update", { id, marketingConsentBefore: before.marketingConsent, marketingConsentAfter: marketingConsent, consentChanged: before.marketingConsent !== marketingConsent, consentSourceBefore: before.marketingConsentSource, consentSourceAfter: marketingConsent ? "manual" : null });
  });
  if (result?.error) return result;
  revalidatePath("/yonetim/musteriler");
  return { savedAt: Date.now() };
}

export async function deleteAddress(id: string) {
  const a = await requireWriter();
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
  if (!SUPPORTED_PLATFORMS.includes(platform)) return { error: "Bu platform henüz desteklenmiyor.", field: "platform" };
  const storeId = await firstStore(a.tenantId);
  const [had] = await getDb().select({ id: P.id }).from(P).where(and(eq(P.tenantId, a.tenantId), eq(P.storeId, storeId), eq(P.platform, platform)));
  if (had) return { error: "Bu platform zaten bağlı.", field: "platform" };
  await getDb().insert(P).values({ tenantId: a.tenantId, storeId, platform, webhookSecret: newDeviceToken() });
  await withTenant(a.tenantId, (tx) => audit(tx, a.tenantId, `user:${a.id}`, "platform.connect", { platform }));
  revalidatePath("/yonetim/platformlar");
  return { savedAt: Date.now() };
}

export async function setConnection(id: string, patch: { autoAccept?: boolean; active?: boolean }) {
  const a = await requireWriter();
  if (!UUID.test(id)) return;
  await getDb().update(P).set(patch).where(and(eq(P.id, id), eq(P.tenantId, a.tenantId)));
  await withTenant(a.tenantId, (tx) => audit(tx, a.tenantId, `user:${a.id}`, "platform.update", { id, ...patch }));
  revalidatePath("/yonetim/platformlar");
}

async function ownConnection(tenantId: string, id: string) {
  if (!UUID.test(id)) return null;
  const [c] = await getDb().select().from(P).where(and(eq(P.id, id), eq(P.tenantId, tenantId)));
  return c ?? null;
}

export async function saveCode(connectionId: string, _: DeliveryState, form: FormData): Promise<DeliveryState> {
  const a = await requireWriter();
  const conn = await ownConnection(a.tenantId, connectionId);
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
    await tx.delete(schema.productPlatformCodes).where(eq(schema.productPlatformCodes.id, id));
    await audit(tx, a.tenantId, `user:${a.id}`, "platform.code.delete", { id });
  });
  revalidatePath("/yonetim/platformlar");
}

/** Deneme siparişi: eşlenmiş ilk kod (yoksa ilk ürün, eşlenmemiş) ile sahte platform siparişi — kasada onay kartı düşer. */
export async function sendTestOrder(connectionId: string): Promise<DeliveryState> {
  const a = await requireWriter();
  const conn = await ownConnection(a.tenantId, connectionId);
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
  const r = await ingestOrders({ id: conn.id, tenantId: conn.tenantId, storeId: conn.storeId, platform: conn.platform, credentials: conn.credentials, webhookSecret: conn.webhookSecret, autoAccept: conn.autoAccept }, [order]);
  return { savedAt: Date.now(), info: r.unmapped ? "Sipariş gönderildi (ürün kodu eşlenmemiş, serbest satır düştü)." : "Sipariş gönderildi; kasada Paket sekmesine düştü." };
}

/** Yönetimden tek tıkla platform/paket siparişi onaylama: kasada accept olayıyla aynı akış (15 dk hazırlık). */
export async function acceptPlatformOrder(tabId: string): Promise<void> {
  const a = await requireWriter();
  if (!UUID.test(tabId)) return;
  const storeId = await firstStore(a.tenantId);
  const [device] = await getDb().select({ id: schema.devices.id, receiptPrefix: schema.devices.receiptPrefix }).from(schema.devices)
    .where(and(eq(schema.devices.tenantId, a.tenantId), eq(schema.devices.storeId, storeId), eq(schema.devices.role, "kasa"))).limit(1);
  const [staff] = await withTenant(a.tenantId, (tx) => tx.select({ id: schema.staff.id }).from(schema.staff).where(eq(schema.staff.active, true)).limit(1));
  if (!device || !staff) return;
  const r = await applyDoc({ tenantId: a.tenantId, storeId, deviceId: device.id, receiptPrefix: device.receiptPrefix },
    { kind: "tab", id: crypto.randomUUID(), tabId, tableId: null, at: new Date().toISOString(), staffId: staff.id, approvedBy: null, ev: { type: "accept", prepMin: 15 } });
  if (!r.ok) return;
  await withTenant(a.tenantId, (tx) => audit(tx, a.tenantId, `user:${a.id}`, "platform.accept", { tabId }));
  revalidatePath("/yonetim/platformlar");
}
