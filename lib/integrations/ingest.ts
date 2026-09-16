/**
 * Entegrasyon veri katmanı (server-only).
 *
 * Akış: platform webhook → route (secret doğrular) → saveRawOrder (idempotent)
 * → ingestOrder (ürün eşleme + cari + adisyon) → markStatus.
 *
 * HAM payload ASLA atlanmaz: eşleme bozulsa bile sipariş kayıtlı kalır,
 * /entegrasyonlar'dan görülebilir (denetim + hata ayıklama).
 */

import { and, desc, eq } from "drizzle-orm";

import { db, schema } from "@/db";
import * as data from "@/lib/data";
import { withTenant } from "@/db/tenant";
import type { NormalizedOrder, PlatformId } from "./types";

type ServiceRow = typeof schema.services.$inferSelect;
type StaffRow = typeof schema.staff.$inferSelect;
type CustomerRow = typeof schema.customers.$inferSelect;
type OrderRow = typeof schema.integrationOrders.$inferSelect;

// ---- Ham sipariş kaydı ----

export async function saveRawOrder(input: {
  platform: PlatformId;
  externalId: string;
  businessId: string;
  payload: unknown;
}): Promise<string | null> {
  const id = "ior-" + crypto.randomUUID();
  const rows = await withTenant(input.businessId, () => [
    db
      .insert(schema.integrationOrders)
      .values({
        id,
        platform: input.platform,
        externalId: input.externalId,
        businessId: input.businessId,
        status: "received",
        payload: input.payload as never,
      })
      // Aynı platform siparişi iki kez gelirse (retry) sessizce geç — idempotensi.
      .onConflictDoNothing({
        target: [schema.integrationOrders.platform, schema.integrationOrders.externalId],
      })
      .returning({ id: schema.integrationOrders.id }),
  ]);
  const inserted = rows[0] as { id?: string }[];
  return inserted[0]?.id ?? null;
}

export async function markOrderStatus(
  id: string,
  businessId: string,
  status: "mapped" | "failed",
  error?: string
): Promise<void> {
  await withTenant(businessId, () => [
    db
      .update(schema.integrationOrders)
      .set({ status, error: error ?? null })
      .where(
        and(eq(schema.integrationOrders.id, id), eq(schema.integrationOrders.businessId, businessId))
      ),
  ]);
}

export async function recentOrders(businessId: string, limit = 10): Promise<OrderRow[]> {
  const rows = await withTenant(businessId, () => [
    db
      .select()
      .from(schema.integrationOrders)
      .where(eq(schema.integrationOrders.businessId, businessId))
      .orderBy(desc(schema.integrationOrders.createdAt))
      .limit(limit),
  ]);
  return rows[0] as unknown as OrderRow[];
}

// ---- Kimlik bilgileri ----

export async function findEnabledCredential(
  platform: PlatformId,
  secret: string
): Promise<string | null> {
  // Webhook oturumsuz gelir — bilinçli kiracılar-arası sorgu (owner bağlantısı).
  // Yalnızca enabled + secret eşleşmesi işletme döner; başkasının sırrı işletme açamaz.
  const rows = await db
    .select({ businessId: schema.integrationCredentials.businessId })
    .from(schema.integrationCredentials)
    .where(
      and(
        eq(schema.integrationCredentials.platform, platform),
        eq(schema.integrationCredentials.secret, secret),
        eq(schema.integrationCredentials.enabled, true)
      )
    )
    .limit(1);
  return rows[0]?.businessId ?? null;
}

export async function getCredentials(businessId: string) {
  const rows = await withTenant(businessId, () => [
    db
      .select({
        platform: schema.integrationCredentials.platform,
        enabled: schema.integrationCredentials.enabled,
        branchRef: schema.integrationCredentials.branchRef,
      })
      .from(schema.integrationCredentials)
      .where(eq(schema.integrationCredentials.businessId, businessId)),
  ]);
  return rows[0] as { platform: string; enabled: boolean; branchRef: string | null }[];
}

export async function upsertCredential(
  businessId: string,
  input: { platform: PlatformId; secret: string; branchRef?: string; enabled: boolean }
): Promise<void> {
  await withTenant(businessId, () => [
    db
      .insert(schema.integrationCredentials)
      .values({
        platform: input.platform,
        businessId,
        secret: input.secret,
        branchRef: input.branchRef ?? null,
        enabled: input.enabled,
      })
      .onConflictDoUpdate({
        target: [schema.integrationCredentials.platform, schema.integrationCredentials.businessId],
        set: { secret: input.secret, branchRef: input.branchRef ?? null, enabled: input.enabled },
      }),
  ]);
}

// ---- Siparişi adisyona yaz ----

export interface IngestResult {
  ok: boolean;
  createdAppointments: number;
  matched: string[];
  message: string;
}

export async function ingestOrder(
  businessId: string,
  order: NormalizedOrder
): Promise<IngestResult> {
  const [staffRows, svcRows, custRows] = await withTenant(businessId, () => [
    db.select().from(schema.staff).where(eq(schema.staff.businessId, businessId)),
    db.select().from(schema.services).where(eq(schema.services.businessId, businessId)),
    db.select().from(schema.customers).where(eq(schema.customers.businessId, businessId)),
  ]);

  const staffList = staffRows as unknown as StaffRow[];
  const services = (svcRows as unknown as ServiceRow[]).map((s) => ({
    id: s.id,
    name: s.name,
    barcode: s.barcode ?? undefined,
  }));
  const customers = custRows as unknown as CustomerRow[];

  const staffId = staffList.find((s) => s.active !== false)?.id;
  if (!staffId) {
    throw new Error("Kayıtlı personel yok — önce personel ekleyin.");
  }

  // Cari: telefon (rakamsal karşılaştırma) → ad → genel "Online Sipariş"
  const digits = (s?: string) => s?.replace(/\D/g, "");
  let customerId = order.customerPhone
    ? customers.find(
        (c) => c.phone && digits(c.phone) && digits(c.phone) === digits(order.customerPhone)
      )?.id
    : undefined;
  customerId ??= order.customerName
    ? customers.find((c) => c.name.toLocaleLowerCase("tr") === order.customerName!.toLocaleLowerCase("tr"))
        ?.id
    : undefined;

  if (!customerId) {
    const created = await data.addCustomer(businessId, {
      name: order.customerName?.trim() || "Online Sipariş",
      phone: order.customerPhone || "—",
    });
    customerId = created.id;
  }

  const placed = order.placedAt ? new Date(order.placedAt) : new Date();
  const date = placed.toISOString().slice(0, 10);
  const start = `${String(placed.getHours()).padStart(2, "0")}:${String(placed.getMinutes()).padStart(2, "0")}`;

  const matched: string[] = [];
  let created = 0;

  for (const item of order.items) {
    // Ürün eşleme: barkod birebir → ad (TR küçük harf)
    let svcId: string | undefined = item.barcode
      ? services.find((s) => (s.barcode ?? "").toLowerCase() === item.barcode!.toLowerCase())?.id
      : undefined;
    if (!svcId) {
      svcId = services.find(
        (s) => s.name.toLocaleLowerCase("tr") === item.name.toLocaleLowerCase("tr")
      )?.id;
    }
    if (!svcId) {
      // Menüde yoksa ürünü oluştur — adisyon tam kalsın; kullanıcı sonra birleştirebilir.
      const createdSvc = await data.addService(businessId, {
        id: "svc-int-" + crypto.randomUUID().slice(0, 8),
        name: item.name,
        durationMin: 5,
        price: item.unitPrice ?? 0,
        commissionRate: 0,
        active: true,
        barcode: item.barcode,
      });
      services.push({ id: createdSvc.id, name: createdSvc.name, barcode: createdSvc.barcode });
      svcId = createdSvc.id;
    }

    for (let i = 0; i < item.qty; i++) {
      await data.addAppointment(businessId, {
        date,
        start,
        staffId,
        customerId,
        serviceId: svcId,
        status: "bekliyor", // KDS'de açık sipariş olarak görünür
        source: "online",
      });
      created++;
    }
    matched.push(`${item.name} ×${item.qty}`);
  }

  return {
    ok: true,
    createdAppointments: created,
    matched,
    message: `${created} kalem adisyona yazıldı.`,
  };
}
