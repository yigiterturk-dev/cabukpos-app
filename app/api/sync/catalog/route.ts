// Katalog aşağı: cihaz + açık vardiya + fiş sayacı her seferinde; katalog (kategori, ürün, personel PIN hash'i)
// yalnız içerik özeti ?v= ile farklıysa. Kimlik: cihaz çerezi.
import { billingInfo } from "@/lib/core/billing";
import { and, asc, desc, eq, isNull, or } from "drizzle-orm";
import { getDb, schema, withTenant } from "@/db";
import { getDevice as requireAuthDevice, rotateDeviceToken } from "@/lib/auth/kasa";
import { sha256 } from "@/lib/auth/tokens";
import { isCurrency, isVatRate } from "@/lib/core/money";
import { kasaAgentFor } from "@/lib/agent/registry";
import type { KasaAgent, LanLink } from "@/lib/agent/config";
import { DEFAULT_MODES } from "@/lib/core/fiscal";
import { categoryStationForStore, loadStoreStationRoutes, productStationForStore } from "@/lib/core/station-routing";

export const dynamic = "force-dynamic";

/** Kasa dışı cihaz: ajanın sertifikası varsa (tablet https ile ulaşır) ya da yerel geliştirmede; yoksa null → bugünkü gibi yalnız bulut. */
function lanLink(hub: KasaAgent | null, req: Request): LanLink | null {
  if (!hub) return null;
  const local = ["localhost", "127.0.0.1"].includes(new URL(req.url).hostname);
  return hub.url.startsWith("https://") || local ? { url: hub.url, ticket: hub.ticket } : null;
}
const noStore = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  const device = await requireAuthDevice();
  if (!device) return Response.json({ error: "cihaz" }, { status: 401, headers: noStore });
  await rotateDeviceToken(device); // #8: vadesi geldiyse yeni cihaz jetonu (route handler'da çerez yazılır)
  const d = schema.devices, sh = schema.shifts;
  const [[dv], [store, cats, prods, staff, [shift], [fs]], salon, agent, hub, [tn], priceLists] = await Promise.all([
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
    getDb().select({ taxId: schema.tenants.taxId, currency: schema.tenants.currency }).from(schema.tenants).where(eq(schema.tenants.id, device.tenantId)), // iade tutanağında satıcı VKN + fiş para birimi (#16)
    priceListCatalog(device),
  ]);
  const routes = device.vertical === "restoran"
    ? await withTenant(device.tenantId, (tx) => loadStoreStationRoutes(tx, device.storeId))
    : { stationIds: new Set<string>(), categories: new Map<string, string | null>(), products: new Map<string, string | null>() };
  const categoryStations = new Map(cats.map((c) => [c.id, categoryStationForStore(c.id, c.stationId, routes)]));
  const products = prods.filter((p) => isVatRate(p.vatRate)).map(({ stationId, ...p }) => ({
    ...p,
    // Şube istasyonu: ürün rotası ?? kategori rotası. Seçenek grupları sıralı kimlikler.
    stationId: productStationForStore(p.id, stationId, p.categoryId ? categoryStations.get(p.categoryId) ?? null : null, routes),
    optionGroupIds: salon?.links.filter((l) => l.productId === p.id).map((l) => l.groupId) ?? [],
  }));
  // PIN hash'i yalnız PIN kullanan rollere iner; mutfak/kurye yalnız ekranda gereken kimlik ve rolü alır.
  const staffOut = device.role === "kasa" || device.role === "garson"
    ? staff
    : staff.map(({ id, name, role }) => ({ id, name, role }));
  const catalog = {
    categories: cats.map(({ id, name }) => ({ id, name })), products, staff: staffOut,
    priceLists: priceLists.length ? priceLists : undefined, // #50
    fiscal: { modes: { ...DEFAULT_MODES, ...fs?.modes }, provider: fs?.provider ?? "fake-earsiv", sellerTaxId: tn?.taxId ?? null }, // M8
    ...(salon ? { areas: salon.areas, tables: salon.tables, stations: salon.stations, optionGroups: salon.optionGroups, deliveryZones: salon.deliveryZones } : {}),
  };
  const v = await sha256(JSON.stringify(catalog));
  const [bt] = await getDb().select({ trialEndsAt: schema.tenants.trialEndsAt, paidUntil: schema.tenants.paidUntil }).from(schema.tenants).where(eq(schema.tenants.id, device.tenantId));
  const bi = bt ? billingInfo(bt) : null;
  const since = new URL(req.url).searchParams.get("v");
  return Response.json(
    {
      v,
      device: { id: device.id, name: device.name, receiptPrefix: device.receiptPrefix, tenantName: device.tenantName, vertical: device.vertical, role: device.role, stations: device.stations, storeName: store?.name ?? "", storeAddress: store?.address ?? null, nextReceiptNo: dv?.next ?? 1, currency: isCurrency(tn?.currency) ? tn.currency : "TRY", billing: bi?.warn ? { state: bi.state, daysLeft: bi.daysLeft } : null },
      openShift: shift ? { ...shift, openedAt: shift.openedAt.toISOString() } : null,
      catalog: since === v ? null : catalog,
      agent, // her çekişte yeni bilet (30 gün geçerli)
      lan: lanLink(hub, req),
    },
    { headers: noStore },
  );
}

/** #50: cihazın şubesi ya da tüm şubeler için aktif fiyat listeleri + kalemleri (sort sırasıyla). */
function priceListCatalog(device: { tenantId: string; storeId: string }) {
  const L = schema.priceLists, I = schema.priceListItems;
  return withTenant(device.tenantId, async (tx) => {
    const [lists, items] = await Promise.all([
      tx.select({ id: L.id, name: L.name, kind: L.kind, percent: L.percent, categoryIds: L.categoryIds, days: L.days, startMin: L.startMin, endMin: L.endMin, storeId: L.storeId })
        .from(L).where(and(eq(L.active, true), or(isNull(L.storeId), eq(L.storeId, device.storeId)))).orderBy(asc(L.sort), asc(L.name)),
      tx.select({ listId: I.listId, productId: I.productId, price: I.price }).from(I),
    ]);
    // Katalog yalnızca bu cihazın şubesine uygulanabilir listeleri içerir;
    // kasada tekrar şube filtresi uygulanmaması için kapsamı burada çöz.
    return lists.map((l) => ({ ...l, storeId: null, items: items.filter((i) => i.listId === l.id).map(({ productId, price }) => ({ productId, price })) }));
  });
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
      tx.select({ id: Z.id, name: Z.name, fee: Z.fee, minOrder: Z.minOrder, perKm: Z.perKm, startMin: Z.startMin, endMin: Z.endMin }).from(Z).where(and(eq(Z.storeId, device.storeId), eq(Z.active, true))).orderBy(asc(Z.sort), asc(Z.name)),
    ]);
    const optionGroups = groups.map((g) => ({ ...g, options: opts.filter((o) => o.groupId === g.id).map(({ id, name, delta }) => ({ id, name, delta })) }));
    return { areas, tables, stations, optionGroups, links, deliveryZones };
  });
}
