// Katalog aşağı: cihaz + açık vardiya + fiş sayacı her seferinde; katalog (kategori, ürün, personel PIN hash'i)
// yalnız içerik özeti ?v= ile farklıysa. Kimlik: cihaz çerezi.
import { billingInfo } from "@/lib/core/billing";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { getDb, schema, withTenant } from "@/db";
import { getDevice } from "@/lib/auth/kasa";
import { sha256 } from "@/lib/auth/tokens";
import { isVatRate } from "@/lib/core/money";
import { kasaAgentFor } from "@/lib/agent/registry";
import type { KasaAgent, LanLink } from "@/lib/agent/config";
import { DEFAULT_MODES } from "@/lib/core/fiscal";

export const dynamic = "force-dynamic";

/** Kasa dışı cihaz: ajanın sertifikası varsa (tablet https ile ulaşır) ya da yerel geliştirmede; yoksa null → bugünkü gibi yalnız bulut. */
function lanLink(hub: KasaAgent | null, req: Request): LanLink | null {
  if (!hub) return null;
  const local = ["localhost", "127.0.0.1"].includes(new URL(req.url).hostname);
  return hub.url.startsWith("https://") || local ? { url: hub.url, ticket: hub.ticket } : null;
}
const noStore = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  const device = await getDevice();
  if (!device) return Response.json({ error: "cihaz" }, { status: 401, headers: noStore });
  const d = schema.devices, sh = schema.shifts;
  const [[dv], [store, cats, prods, staff, [shift], [fs]], salon, agent, hub] = await Promise.all([
    getDb().select({ next: d.nextReceiptNo }).from(d).where(eq(d.id, device.id)),
    withTenant(device.tenantId, (tx) =>
      Promise.all([
        tx.select({ name: schema.stores.name, address: schema.stores.address }).from(schema.stores).where(eq(schema.stores.id, device.storeId)).then((r) => r[0]),
        tx.select({ id: schema.categories.id, name: schema.categories.name, stationId: schema.categories.stationId }).from(schema.categories).orderBy(asc(schema.categories.sort), asc(schema.categories.name)),
        tx.select({ id: schema.products.id, name: schema.products.name, price: schema.products.price, vatRate: schema.products.vatRate, categoryId: schema.products.categoryId, barcodes: schema.products.barcodes, kind: schema.products.kind, plu: schema.products.plu, quick: schema.products.quick, stationId: schema.products.stationId })
          .from(schema.products).where(and(eq(schema.products.active, true), eq(schema.products.sellable, true))).orderBy(asc(schema.products.sort), asc(schema.products.name)),
        tx.select({ id: schema.staff.id, name: schema.staff.name, role: schema.staff.role, pinHash: schema.staff.pinHash }).from(schema.staff).where(eq(schema.staff.active, true)).orderBy(asc(schema.staff.id)),
        tx.select({ id: sh.id, openedBy: sh.openedBy, openedAt: sh.openedAt, openingCash: sh.openingCash }).from(sh).where(and(eq(sh.deviceId, device.id), isNull(sh.closedAt))).orderBy(desc(sh.openedAt)).limit(1),
        tx.select({ modes: schema.fiscalSettings.channelModes, provider: schema.fiscalSettings.provider }).from(schema.fiscalSettings),
      ]),
    ),
    device.vertical === "restoran" ? salonCatalog(device) : null,
    device.role === "kasa" ? kasaAgentFor(device) : null, // tablet/mutfak ekranı ajana ulaşamaz (127.0.0.1); yazıcıyı kasa sürer
    device.role !== "kasa" && device.vertical === "restoran" ? kasaAgentFor(device) : null, // LAN merkezi (yalnız adisyon akışı)
  ]);
  const products = prods.filter((p) => isVatRate(p.vatRate)).map(({ stationId, ...p }) => ({
    ...p,
    // İstasyon: ürün ?? kategori. Seçenek grupları sıralı kimlikler.
    stationId: stationId ?? cats.find((c) => c.id === p.categoryId)?.stationId ?? null,
    optionGroupIds: salon?.links.filter((l) => l.productId === p.id).map((l) => l.groupId) ?? [],
  }));
  const catalog = {
    categories: cats.map(({ id, name }) => ({ id, name })), products, staff,
    fiscal: { modes: { ...DEFAULT_MODES, ...fs?.modes }, provider: fs?.provider ?? "fake-earsiv" }, // M8
    ...(salon ? { areas: salon.areas, tables: salon.tables, stations: salon.stations, optionGroups: salon.optionGroups, deliveryZones: salon.deliveryZones } : {}),
  };
  const v = await sha256(JSON.stringify(catalog));
  const [bt] = await getDb().select({ trialEndsAt: schema.tenants.trialEndsAt, paidUntil: schema.tenants.paidUntil }).from(schema.tenants).where(eq(schema.tenants.id, device.tenantId));
  const bi = bt ? billingInfo(bt) : null;
  const since = new URL(req.url).searchParams.get("v");
  return Response.json(
    {
      v,
      device: { id: device.id, name: device.name, receiptPrefix: device.receiptPrefix, tenantName: device.tenantName, vertical: device.vertical, role: device.role, stations: device.stations, storeName: store?.name ?? "", storeAddress: store?.address ?? null, nextReceiptNo: dv?.next ?? 1, billing: bi?.warn ? { state: bi.state, daysLeft: bi.daysLeft } : null },
      openShift: shift ? { ...shift, openedAt: shift.openedAt.toISOString() } : null,
      catalog: since === v ? null : catalog,
      agent, // her çekişte yeni bilet (30 gün geçerli)
      lan: lanLink(hub, req),
    },
    { headers: noStore },
  );
}

/** Restoran: şubenin bölge/masa/istasyonları + kiracının seçenek grupları ve ürün bağları. */
function salonCatalog(device: { tenantId: string; storeId: string }) {
  const A = schema.areas, T = schema.tables, S = schema.stations, G = schema.optionGroups, O = schema.options, L = schema.productOptionGroups, Z = schema.deliveryZones;
  return withTenant(device.tenantId, async (tx) => {
    const [areas, tables, stations, groups, opts, links, deliveryZones] = await Promise.all([
      tx.select({ id: A.id, name: A.name }).from(A).where(eq(A.storeId, device.storeId)).orderBy(asc(A.sort), asc(A.name)),
      tx.select({ id: T.id, areaId: T.areaId, name: T.name }).from(T).innerJoin(A, eq(A.id, T.areaId)).where(and(eq(A.storeId, device.storeId), eq(T.active, true))).orderBy(asc(T.sort), asc(T.name)),
      tx.select({ id: S.id, name: S.name, printer: S.printer }).from(S).where(eq(S.storeId, device.storeId)).orderBy(asc(S.sort), asc(S.name)),
      tx.select({ id: G.id, name: G.name, min: G.min, max: G.max }).from(G).orderBy(asc(G.sort), asc(G.name)),
      tx.select({ id: O.id, groupId: O.groupId, name: O.name, delta: O.delta }).from(O).orderBy(asc(O.sort), asc(O.name)),
      tx.select({ productId: L.productId, groupId: L.groupId }).from(L).orderBy(asc(L.sort)),
      tx.select({ id: Z.id, name: Z.name, fee: Z.fee, minOrder: Z.minOrder }).from(Z).where(and(eq(Z.storeId, device.storeId), eq(Z.active, true))).orderBy(asc(Z.sort), asc(Z.name)),
    ]);
    const optionGroups = groups.map((g) => ({ ...g, options: opts.filter((o) => o.groupId === g.id).map(({ id, name, delta }) => ({ id, name, delta })) }));
    return { areas, tables, stations, optionGroups, links, deliveryZones };
  });
}
