"use server";
// Raf etiketi: basıldı işareti. Kuyruk = etiketi hiç basılmamış ya da basıldıktan sonra fiyatı değişmiş ürünler.
import { inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";

const UUID = /^[0-9a-f-]{36}$/i;

export async function markLabelsPrinted(ids: string[]) {
  const a = await requireAdmin();
  const ok = Array.isArray(ids) ? ids.filter((i) => typeof i === "string" && UUID.test(i)).slice(0, 1000) : [];
  if (!ok.length) return;
  await withTenant(a.tenantId, async (tx) => {
    await tx.update(schema.products).set({ labelPrintedAt: new Date() }).where(inArray(schema.products.id, ok));
    await audit(tx, a.tenantId, `user:${a.id}`, "labels.printed", { count: ok.length });
  });
  revalidatePath("/yonetim/etiketler");
}
