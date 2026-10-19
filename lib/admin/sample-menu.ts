"use server";
// Örnek menü yükleme: kategori + ürün setini tek işlemde ekler. Yalnız ürün listesi boşken; mevcut veriye dokunmaz.
import { revalidatePath } from "next/cache";
import { count } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireWriter } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { ORNEK_MENULER } from "@/lib/core/ornek-menu";

export async function ornekMenuYukle(): Promise<{ ok: boolean; error?: string }> {
  const a = await requireWriter();
  const r = await withTenant(a.tenantId, async (tx) => {
    const [existing] = await tx.select({ v: count() }).from(schema.products);
    if (Number(existing?.v ?? 0) > 0) return { ok: false, error: "Ürün listeniz boş değil; örnek menü yalnız boş işletmeye yüklenir." };
    const menu = ORNEK_MENULER[a.vertical];
    for (const [i, k] of menu.kategoriler.entries()) {
      const [cat] = await tx.insert(schema.categories).values({ tenantId: a.tenantId, name: k.name, sort: i }).returning({ id: schema.categories.id });
      await tx.insert(schema.products).values(k.urunler.map((u, j) => ({
        tenantId: a.tenantId, categoryId: cat.id, name: u.name, price: u.price, vatRate: u.vatRate,
        kind: u.kind ?? "adet", quick: u.quick ?? false, sort: j,
      })));
    }
    await audit(tx, a.tenantId, `user:${a.id}`, "catalog.sample", { vertical: a.vertical });
    return { ok: true as const };
  });
  if (r.ok) { revalidatePath("/yonetim/urunler"); revalidatePath("/yonetim"); }
  return r;
}
