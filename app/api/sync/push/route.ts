// Giden kutusu yukarı: FIFO parti, belge başına sonuç. Aynı belge tekrar gelirse ikinci kayıt oluşmaz.
import { after } from "next/server";
import { getDevice } from "@/lib/auth/kasa";
import { issueOne, processDue } from "@/lib/fiscal/issue";
import { okcReceiptFor } from "@/lib/fiscal/okc";
import { applyDoc } from "@/lib/sync/apply";
import { withTenant } from "@/db";
import { audit } from "@/lib/audit";
import { PUSH_BATCH, type DocResult } from "@/lib/sync/docs";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const device = await getDevice();
  if (!device) return Response.json({ error: "cihaz" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { deviceId?: unknown; docs?: unknown } | null;
  if (!body || !Array.isArray(body.docs) || body.docs.length > PUSH_BATCH) return Response.json({ error: "parti" }, { status: 400 });
  // Tarayıcı başka cihaz olarak yeniden eşlendiyse eski cihazın belgeleri yeni cihaza yazılmasın.
  if (body.deviceId !== device.id) return Response.json({ error: "eşleme değişti" }, { status: 409 });
  const ctx = { tenantId: device.tenantId, storeId: device.storeId, deviceId: device.id, receiptPrefix: device.receiptPrefix };
  const results: DocResult[] = [];
  for (const doc of body.docs) results.push(await applyDoc(ctx, doc));
  // Reddedilen belge cihazda kalır; yönetimde görünsün diye kaydı (Raporlar → İncelenecek).
  const bad = results.flatMap((r, i) => (r.ok ? [] : [{ docId: r.id, kind: (body.docs as { kind?: unknown }[])[i]?.kind ?? null, error: r.error }]));
  if (bad.length) await withTenant(device.tenantId, async (tx) => { for (const b of bad) await audit(tx, device.tenantId, `device:${device.id}`, "sync.red", b); }).catch(() => {});
  // M8: vadesi gelmiş e-Arşiv kesimleri/iptalleri yanıttan sonra (satışı geciktirmez)
  // Bu partide eşitlenen satışların e-Arşivi hemen (kasanın 3 sn beklemesi yavaş ağda kaçabilir); sonra vadesi gelenler.
  const sold = body.docs.flatMap((d, i) => (results[i]?.ok && (d as { kind?: unknown }).kind === "sale" ? [results[i].id] : []));
  after(async () => {
    for (const id of sold) {
      await issueOne(device.tenantId, id).catch(() => null);
      await okcReceiptFor(device.tenantId, id).catch(() => null); // #18: mali fiş künyesi (satışı geciktirmez)
    }
    await processDue(device.tenantId).catch(() => {});
  });
  return Response.json({ results }, { headers: { "Cache-Control": "no-store" } });
}
