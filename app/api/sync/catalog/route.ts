// Katalog aşağı: cihaz + açık vardiya + fiş sayacı her seferinde; katalog (kategori, ürün, personel PIN hash'i)
// yalnız içerik özeti ?v= ile farklıysa. Kimlik: cihaz çerezi.
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { getDb, schema, withTenant } from "@/db";
import { getDevice } from "@/lib/auth/kasa";
import { sha256 } from "@/lib/auth/tokens";
import { isVatRate } from "@/lib/core/money";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  const device = await getDevice();
  if (!device) return Response.json({ error: "cihaz" }, { status: 401, headers: noStore });
  const d = schema.devices, sh = schema.shifts;
  const [[dv], [store, cats, prods, staff, [shift]]] = await Promise.all([
    getDb().select({ next: d.nextReceiptNo }).from(d).where(eq(d.id, device.id)),
    withTenant(device.tenantId, (tx) =>
      Promise.all([
        tx.select({ name: schema.stores.name, address: schema.stores.address }).from(schema.stores).where(eq(schema.stores.id, device.storeId)).then((r) => r[0]),
        tx.select({ id: schema.categories.id, name: schema.categories.name }).from(schema.categories).orderBy(asc(schema.categories.sort), asc(schema.categories.name)),
        tx.select({ id: schema.products.id, name: schema.products.name, price: schema.products.price, vatRate: schema.products.vatRate, categoryId: schema.products.categoryId, barcodes: schema.products.barcodes, kind: schema.products.kind, plu: schema.products.plu, quick: schema.products.quick })
          .from(schema.products).where(eq(schema.products.active, true)).orderBy(asc(schema.products.sort), asc(schema.products.name)),
        tx.select({ id: schema.staff.id, name: schema.staff.name, role: schema.staff.role, pinHash: schema.staff.pinHash }).from(schema.staff).where(eq(schema.staff.active, true)).orderBy(asc(schema.staff.id)),
        tx.select({ id: sh.id, openedBy: sh.openedBy, openedAt: sh.openedAt, openingCash: sh.openingCash }).from(sh).where(and(eq(sh.deviceId, device.id), isNull(sh.closedAt))).orderBy(desc(sh.openedAt)).limit(1),
      ]),
    ),
  ]);
  const catalog = { categories: cats, products: prods.filter((p) => isVatRate(p.vatRate)), staff };
  const v = await sha256(JSON.stringify(catalog));
  const since = new URL(req.url).searchParams.get("v");
  return Response.json(
    {
      v,
      device: { id: device.id, name: device.name, receiptPrefix: device.receiptPrefix, tenantName: device.tenantName, vertical: device.vertical, storeName: store?.name ?? "", storeAddress: store?.address ?? null, nextReceiptNo: dv?.next ?? 1 },
      openShift: shift ? { ...shift, openedAt: shift.openedAt.toISOString() } : null,
      catalog: since === v ? null : catalog,
    },
    { headers: noStore },
  );
}
