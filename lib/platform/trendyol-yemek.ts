// lib/platform/trendyol-yemek.ts — Uber Eats Trendyol Go / Yemek gerçek adaptörü.
// Uçlar ve başlıklar resmî dokümandan (developers.tgoapps.com) alındı; uydurma uç yok.
// Siparişler polling ile çekilir (dokümanda POS'a webhook yok): GET .../packages.
// Kapalıyken (TRENDYOL_YEMEK_ENABLED!=1) ağa çıkmaz.
import type { IncomingOrder } from "@/lib/core/platform";
import type { PayIntent } from "@/lib/core/tab";
import type { Conn, OrderSource, PlatformOrderStatus } from "./types";

const TIMEOUT_MS = 10_000;

type Config = { base: string; supplierId: string; storeId: string; key: string; secret: string; agent: string; executor: string };

/** Zorunlu alanlar yoksa Türkçe hata; istek atılmaz. */
export function yemekConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const need = ["TRENDYOL_YEMEK_SUPPLIER_ID", "TRENDYOL_YEMEK_STORE_ID", "TRENDYOL_YEMEK_API_KEY", "TRENDYOL_YEMEK_API_SECRET", "TRENDYOL_YEMEK_AGENT", "TRENDYOL_YEMEK_EXECUTOR"] as const;
  const missing = need.filter((k) => !env[k]?.trim());
  if (missing.length) throw new Error(`Trendyol Yemek yapılandırması eksik: ${missing.join(", ")}`);
  return {
    base: (env.TRENDYOL_YEMEK_API_BASE?.trim() || "https://api.tgoapis.com").replace(/\/+$/, ""),
    supplierId: env.TRENDYOL_YEMEK_SUPPLIER_ID!.trim(),
    storeId: env.TRENDYOL_YEMEK_STORE_ID!.trim(),
    key: env.TRENDYOL_YEMEK_API_KEY!.trim(),
    secret: env.TRENDYOL_YEMEK_API_SECRET!.trim(),
    agent: env.TRENDYOL_YEMEK_AGENT!.trim(),
    executor: env.TRENDYOL_YEMEK_EXECUTOR!.trim(),
  };
}

/** TRENDYOL_YEMEK_READ_ONLY=1: yalnız GET; kabul/yola çıkış/iptal Trendyol'a gitmez, yalnız ÇabukPOS'ta kalır. */
export const yemekReadOnly = (env: NodeJS.ProcessEnv = process.env) => env.TRENDYOL_YEMEK_READ_ONLY === "1";

export type YemekDeps = { fetch?: typeof fetch; timeoutMs?: number };

export type YemekPackage = {
  id: string;
  code: string | null;
  status: string;
  deliveryType: string | null;
  isStorePickup: boolean;
  createdAt: string | null;
  customer: { name: string; phone: string };
  address: string;
  note: string | null;
  payIntent: PayIntent;
  totalMinor: number;
  lines: { id: string | null; productId: number | null; name: string; quantity: number; priceMinor: number; note: string | null }[];
  raw: unknown;
};

const payIntentOf = (raw: string | null): PayIntent => {
  if (!raw) return "online";
  if (raw === "PAY_WITH_CARD") return "kart";
  if (raw === "PAY_WITH_MEAL_CARD") return "yemek_karti";
  if (raw === "PAY_WITH_ON_DELIVERY") return "nakit";
  return "online";
};

function lineQty(l: Record<string, unknown>): number {
  if (Array.isArray(l.items)) return (l.items as Record<string, unknown>[]).filter((i) => i.isCancelled !== true).length;
  return Number(l.quantity ?? 1);
}

/** Seçenekler / çıkarılanlar mutfak fişinde görünsün diye satır notuna yazılır. */
function lineNote(l: Record<string, unknown>): string | null {
  const names = (v: unknown) => (Array.isArray(v) ? v.map((m) => String((m as Record<string, unknown>)?.name ?? "")).filter(Boolean) : []);
  const parts = [
    ...names(l.modifierProducts),
    ...names(l.extraIngredients).map((n) => `+${n}`),
    ...names(l.removedIngredients).map((n) => `-${n}`),
    ...(typeof l.note === "string" && l.note.trim() ? [l.note.trim()] : []),
  ];
  return parts.length ? parts.join(", ") : null;
}

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/** Doküman modeli: { page, size, totalPages, totalElements, content: [...] }. Alanlar savunmalı okunur. */
export function parsePackages(json: unknown): YemekPackage[] {
  const content = (json as { content?: unknown })?.content;
  if (!Array.isArray(content)) return [];
  return content.flatMap((p: Record<string, unknown>) => {
    const id = String(p.id ?? p.packageId ?? "");
    if (!id) return [];
    const customer = (p.customer ?? {}) as Record<string, unknown>;
    const address = (p.address ?? {}) as Record<string, unknown>;
    const payment = (p.payment ?? {}) as Record<string, unknown>;
    const lines = Array.isArray(p.lines) ? (p.lines as Record<string, unknown>[]) : [];
    const total = Number(p.totalPrice ?? p.amount ?? payment.amount ?? 0);
    return [{
      id,
      code: [p.orderNumber, p.orderCode, p.code].find((v) => typeof v === "string" && v) as string | undefined ?? null,
      // Canlı API alanı packageStatus; doküman örneği status.
      status: String(p.packageStatus ?? p.status ?? ""),
      deliveryType: typeof p.deliveryType === "string" ? p.deliveryType : null,
      isStorePickup: p.storePickupSelected === true || p.isStorePickup === true,
      createdAt: typeof (p.packageCreationDate ?? p.createdDate) === "number" ? new Date(Number(p.packageCreationDate ?? p.createdDate)).toISOString() : null,
      customer: {
        name: `${customer.firstName ?? customer.customerFirstName ?? ""} ${customer.lastName ?? customer.customerLastName ?? ""}`.trim(),
        phone: digits(customer.phone ?? address.phone),
      },
      address: String(address.address1 ?? address.addressText ?? address.addressDescription ?? ""),
      note: typeof p.customerNote === "string" && p.customerNote.trim() ? p.customerNote.trim() : typeof customer.note === "string" ? String(customer.note) : null,
      payIntent: payIntentOf(typeof payment.paymentType === "string" ? payment.paymentType : null),
      totalMinor: Number.isFinite(total) ? Math.round(total * 100) : 0,
      lines: lines.map((l) => ({
        id: l.lineItemId ? String(l.lineItemId) : null,
        productId: Number.isFinite(Number(l.productId)) ? Number(l.productId) : null,
        name: String(l.name ?? l.productName ?? ""),
        // Canlı API'de quantity yok: her adet items[] içinde, iptal edilenler sayılmaz.
        quantity: lineQty(l),
        // unitSellingPrice = seçenekler dahil birim fiyat (canlı veride toplamla birebir tutar).
        priceMinor: Math.round(Number(l.unitSellingPrice ?? l.price ?? 0) * 100),
        note: lineNote(l),
      })),
      raw: p,
    }];
  });
}

/** Paket → ortak sipariş. Gel-al siparişler kurye gerektirmez ama yine adisyona düşer. */
export function toIncomingOrder(p: YemekPackage): IncomingOrder {
  return {
    externalId: p.id,
    customer: { name: p.customer.name || "Trendyol Yemek müşterisi", phone: p.customer.phone },
    address: p.address,
    directions: null,
    note: p.note,
    payIntent: p.payIntent,
    deadline: null,
    lines: p.lines.filter((l) => l.quantity > 0).map((l) => ({
      code: l.productId === null ? l.id ?? "" : String(l.productId),
      name: l.name,
      unitPrice: l.priceMinor,
      qtyMilli: Math.round(l.quantity * 1000),
      note: l.note,
    })),
    raw: p.raw,
    history: historyOf(p),
  };
}

const ENDED: Record<string, { status: "delivered" | "cancelled"; label: string }> = {
  DELIVERED: { status: "delivered", label: "Trendyol: teslim edildi" },
  CANCELLED: { status: "cancelled", label: "Trendyol: iptal" },
  UNSUPPLIED: { status: "cancelled", label: "Trendyol: tedarik edilemedi" },
};

/** Bitmiş paket → kapalı geçmiş kaydı (zamanlar Trendyol'daki asıl zamanlar). */
function historyOf(p: YemekPackage): IncomingOrder["history"] {
  const e = ENDED[p.status.toUpperCase()];
  if (!e) return null;
  const raw = (p.raw ?? {}) as Record<string, unknown>;
  const at = p.createdAt ?? new Date().toISOString();
  const mod = Number(raw.packageModificationDate ?? raw.lastModifiedDate);
  const endedAt = Number.isFinite(mod) && mod > 0 ? new Date(mod).toISOString() : at;
  const ci = (raw.cancelInfo ?? null) as Record<string, unknown> | null;
  const why = ci && typeof ci === "object" ? [ci.reasonCode, ci.reason, ci.reasonDescription, ci.description].find((v) => typeof v === "string" && v) : null;
  return { status: e.status, at, endedAt: endedAt < at ? at : endedAt, reason: why ? `${e.label} — ${String(why)}` : e.label };
}

export function createYemekClient(deps: YemekDeps = {}) {
  const doFetch = deps.fetch ?? fetch;
  const timeout = deps.timeoutMs ?? TIMEOUT_MS;

  async function call<T>(method: "GET" | "PUT" | "POST", url: string, body?: unknown): Promise<T> {
    const cfg = yemekConfig();
    // Salt okuma: gerçek restoranın siparişi test ortamından asla değiştirilmez.
    if (method !== "GET" && yemekReadOnly()) throw new Error("Trendyol Yemek salt okuma modunda; yazma isteği gönderilmedi.");
    const res = await doFetch(`${cfg.base}${url}`, {
      method,
      headers: {
        authorization: `Basic ${Buffer.from(`${cfg.key}:${cfg.secret}`).toString("base64")}`,
        "x-agentname": cfg.agent,
        "x-executor-user": cfg.executor,
        accept: "application/json",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Trendyol Yemek HTTP ${res.status}: ${text.replace(/\s+/g, " ").slice(0, 200)}`);
    return (text ? JSON.parse(text) : {}) as T;
  }

  const supplier = () => yemekConfig().supplierId;

  return {
    /** Doküman: packageStatuses virgülle çoklu statü kabul eder (ör. "Cancelled,Picking"). */
    fetchPackages(statuses?: string, page = 0) {
      const cfg = yemekConfig();
      const qs = new URLSearchParams({ storeId: cfg.storeId, page: String(page), size: "50" });
      if (statuses) qs.set("packageStatuses", statuses);
      return call<unknown>("GET", `/integrator/order/meal/suppliers/${supplier()}/packages?${qs.toString()}`);
    },
    /** Kabul: PUT .../packages/picked {packageId, preparationTime} */
    accept(packageId: string, prepMin: number) {
      return call<void>("PUT", `/integrator/order/meal/suppliers/${supplier()}/packages/picked`, { packageId: Number(packageId), preparationTime: prepMin });
    },
    /** Yola çıkış: PUT .../packages/{packageId}/manual-shipped */
    ship(packageId: string) {
      return call<void>("PUT", `/integrator/order/meal/suppliers/${supplier()}/packages/${encodeURIComponent(packageId)}/manual-shipped`);
    },
    /** İptal: PUT .../packages/unsupplied (itemIdList verilmezse paketin tamamı) */
    cancel(packageId: string, itemIds?: string[]) {
      return call<void>("PUT", `/integrator/order/meal/suppliers/${supplier()}/packages/unsupplied`, { packageId: Number(packageId), ...(itemIds?.length ? { itemIdList: itemIds.map(Number) } : {}) });
    },
    /** Yalnız STAGE: POST /integrator/meal-test-order/orders/meal */
    createTestOrder(body: unknown) {
      return call<{ orderNumber?: string }>("POST", "/integrator/meal-test-order/orders/meal", body);
    },
  };
}

const unsupported = (what: string) => Promise.reject(new Error(`Trendyol Yemek: ${what} ucu doğrulanmadı; istek gönderilmedi.`));

export function createYemekSource(enabled: boolean): OrderSource {
  const client = () => createYemekClient();
  return {
    id: "trendyol_yemek",
    parseWebhook() {
      return { error: "Trendyol Yemek siparişleri polling ile alınır.", status: 400 };
    },
    async accept(_conn: Conn, externalId: string, prepMin: number) {
      if (!enabled) throw new Error("Trendyol Yemek bağlantısı kapalı.");
      if (yemekReadOnly()) return;
      await client().accept(externalId, prepMin);
    },
    async reject(_conn: Conn, externalId: string) {
      if (!enabled) throw new Error("Trendyol Yemek bağlantısı kapalı.");
      if (yemekReadOnly()) return;
      await client().cancel(externalId);
    },
    async pushStatus(_conn: Conn, externalId: string, status: PlatformOrderStatus) {
      if (!enabled) throw new Error("Trendyol Yemek bağlantısı kapalı.");
      if (yemekReadOnly()) return;
      if (status === "picked") return client().ship(externalId);
      return unsupported(status === "delivered" ? "teslim" : "iptal");
    },
  };
}

export const trendyolYemekSource = createYemekSource(process.env.TRENDYOL_YEMEK_ENABLED === "1");
