/**
 * Platform payload → NormalizedOrder.
 *
 * ÖNEMLİ (doğrulama notu): TGO/Uber Eats ile Yemeksepeti'nin gerçek webhook şemalarına
 * partner onayı + portal erişimi sonrası geçilecek. Bu katman bilinen alan adlarını
 * tarayarak savunmacı parse eder; hiçbir zorunlu alan bulunamazsa HATA FIRLATIR
 * (sessiz yanlış sipariş yazmak yerine). Portal erişimi gelince gerçek örnek payload'lar
 * tests/integrations.test.ts'e eklenir.
 */

import type { NormalizedOrder, NormalizedOrderItem, PlatformId } from "./types";

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  }
  return undefined;
}

function num(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
}

/** Items dizisini birden çok olası alan adı + eleman şekli için tarar. */
function extractItems(root: Record<string, unknown>): NormalizedOrderItem[] {
  const candidates = ["items", "products", "lines", "orderItems", "basket", "products"];
  for (const key of candidates) {
    const raw = root[key];
    if (!Array.isArray(raw) || raw.length === 0) continue;

    const items: NormalizedOrderItem[] = [];
    for (const it of raw as Record<string, unknown>[]) {
      const name = pick(it, ["name", "productName", "title", "description"]);
      if (typeof name !== "string" || !name.trim()) continue;
      const qty = num(pick(it, ["quantity", "qty", "count", "amount"])) ?? 1;
      const unitPrice = num(pick(it, ["unitPrice", "price", "unit_amount", "priceWithTax"]));
      const barcode = pick(it, ["barcode", "sku", "plu", "gtin"]);
      items.push({
        name: name.trim().slice(0, 200),
        qty: Number.isFinite(qty) && qty > 0 ? Math.min(999, Math.floor(qty)) : 1,
        unitPrice: typeof unitPrice === "number" && unitPrice >= 0 ? unitPrice : undefined,
        barcode: typeof barcode === "string" && barcode.trim() ? barcode.trim().slice(0, 64) : undefined,
      });
    }
    if (items.length > 0) return items;
  }
  return [];
}

export function parseOrder(platform: PlatformId, payload: unknown): NormalizedOrder {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Gövde JSON nesnesi değil.");
  }
  const root = payload as Record<string, unknown>;

  // Sipariş numarası — idempotensi anahtarı. Olamazsa yazmıyoruz.
  const externalId = pick(root, [
    "orderId", "id", "referenceCode", "orderReference", "orderNumber", "externalId",
  ]);
  if (typeof externalId !== "string" || !externalId.trim()) {
    throw new Error("Sipariş numarası (orderId) bulunamadı.");
  }

  const items = extractItems(root);
  if (items.length === 0) {
    throw new Error("Sipariş kalemi bulunamadı (items boş).");
  }

  const customer =
    typeof root.customer === "object" && root.customer !== null
      ? (root.customer as Record<string, unknown>)
      : {};
  // Müşteri alanları bazı platformlarda kökte düz durur (customerName/phone) — ikisini de tara.
  const nameSources = [customer, root];
  const phoneSources = [customer, root];

  const placedAtRaw = pick(root, ["placedAt", "orderDate", "createdAt", "date"]);
  const placedAt =
    typeof placedAtRaw === "string" && !Number.isNaN(Date.parse(placedAtRaw))
      ? new Date(placedAtRaw).toISOString()
      : undefined;

  return {
    externalId: externalId.slice(0, 120),
    customerName:
      (nameSources.map((src) => pick(src, ["name", "fullName", "customerName"])).find(
        (v) => typeof v === "string" && v.trim()
      ) as string | undefined)?.trim().slice(0, 120) || undefined,
    customerPhone:
      (phoneSources.map((src) => pick(src, ["phone", "phoneNumber", "gsm", "mobile"])).find(
        (v) => typeof v === "string" && v.trim()
      ) as string | undefined)?.trim().slice(0, 24) || undefined,
    note:
      typeof pick(root, ["note", "customerNote", "description", "comment"]) === "string"
        ? String(pick(root, ["note", "customerNote", "description", "comment"])).trim().slice(0, 500) || undefined
        : undefined,
    paymentNote:
      typeof pick(root, ["paymentMethod", "paymentType", "paymentStatus"]) === "string"
        ? String(pick(root, ["paymentMethod", "paymentType", "paymentStatus"])).slice(0, 40)
        : undefined,
    items,
    placedAt,
  };
}
