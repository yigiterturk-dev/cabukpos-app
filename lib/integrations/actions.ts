"use server";

/**
 * Entegrasyon sunucu aksiyonları — yalnız oturumlu işletme kendi kayıtlarına dokunur.
 */

import { requireBusinessId } from "@/lib/data/actions";

import { parseOrder } from "./parse";
import {
  getCredentials,
  ingestOrder,
  recentOrders,
  saveRawOrder,
  upsertCredential,
  markOrderStatus,
} from "./ingest";
import { PLATFORMS, type PlatformId } from "./types";

export async function integrationStatusAction(): Promise<{
  platforms: { id: PlatformId; enabled: boolean; branchRef: string | null }[];
  recent: { id: string; platform: string; status: string; createdAt: string; error: string | null }[];
}> {
  const businessId = await requireBusinessId();
  const creds = await getCredentials(businessId);
  const orders = await recentOrders(businessId, 8);
  return {
    platforms: PLATFORMS.map((id) => {
      const c = creds.find((x) => x.platform === id);
      return { id, enabled: c?.enabled ?? false, branchRef: c?.branchRef ?? null };
    }),
    recent: orders.map((o) => ({
      id: o.id,
      platform: o.platform,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
      error: o.error,
    })),
  };
}

export async function saveCredentialAction(input: {
  platform: PlatformId;
  secret: string;
  branchRef?: string;
  enabled: boolean;
}): Promise<{ ok: boolean }> {
  if (input.secret.trim().length < 8) {
    throw new Error("Secret en az 8 karakter olmalı.");
  }
  const businessId = await requireBusinessId();
  await upsertCredential(businessId, {
    platform: input.platform,
    secret: input.secret.trim(),
    branchRef: input.branchRef?.trim() || undefined,
    enabled: input.enabled,
  });
  return { ok: true };
}

/**
 * Test siparişi — gerçek webhook'a ihtiyaç olmadan hattı uçtan uca dener.
 * Örnek payload parse edilir, HAM kayıt + adisyon aynı yoldan geçer.
 */
export async function sendTestOrderAction(
  platform: PlatformId
): Promise<{ ok: boolean; message: string; matched?: string[] }> {
  const businessId = await requireBusinessId();

  const samplePayload = {
    orderId: `test-${platform}-${Date.now()}`,
    customer: { name: "Test Müşteri", phone: "05551112233" },
    paymentMethod: "online_odeme",
    note: "Entegrasyon test siparişi",
    items: [
      { name: "Test Ürün 1", quantity: 2, unitPrice: 45 },
      { name: "Test Ürün 2", quantity: 1, unitPrice: 60 },
    ],
    orderDate: new Date().toISOString(),
  };

  const parsed = parseOrder(platform, samplePayload);
  const rowId = await saveRawOrder({
    platform,
    externalId: parsed.externalId,
    businessId,
    payload: samplePayload,
  });
  if (!rowId) return { ok: false, message: "Aynı sipariş zaten işlenmiş." };

  try {
    const result = await ingestOrder(businessId, parsed);
    await markOrderStatus(rowId, businessId, "mapped");
    return { ok: true, message: result.message, matched: result.matched };
  } catch (e) {
    const message = e instanceof Error ? e.message : "bilinmeyen hata";
    await markOrderStatus(rowId, businessId, "failed", message);
    return { ok: false, message };
  }
}
