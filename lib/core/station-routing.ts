import { eq } from "drizzle-orm";
import { schema, type Tx } from "@/db";

export type StoreStationRoutes = {
  stationIds: Set<string>;
  categories: Map<string, string | null>;
  products: Map<string, string | null>;
};

/** Load explicit per-store routes and validate legacy routes against this store. */
export async function loadStoreStationRoutes(tx: Tx, storeId: string): Promise<StoreStationRoutes> {
  const [stations, categories, products] = await Promise.all([
    tx.select({ id: schema.stations.id }).from(schema.stations).where(eq(schema.stations.storeId, storeId)),
    tx.select({ categoryId: schema.categoryStationRoutes.categoryId, stationId: schema.categoryStationRoutes.stationId })
      .from(schema.categoryStationRoutes).where(eq(schema.categoryStationRoutes.storeId, storeId)),
    tx.select({ productId: schema.productStationRoutes.productId, stationId: schema.productStationRoutes.stationId })
      .from(schema.productStationRoutes).where(eq(schema.productStationRoutes.storeId, storeId)),
  ]);
  return {
    stationIds: new Set(stations.map((s) => s.id)),
    categories: new Map(categories.map((r) => [r.categoryId, r.stationId])),
    products: new Map(products.map((r) => [r.productId, r.stationId])),
  };
}

export function categoryStationForStore(categoryId: string, legacyStationId: string | null, routes: StoreStationRoutes): string | null {
  if (routes.categories.has(categoryId)) return routes.categories.get(categoryId) ?? null;
  return legacyStationId && routes.stationIds.has(legacyStationId) ? legacyStationId : null;
}

export function productStationForStore(
  productId: string,
  legacyStationId: string | null,
  categoryStationId: string | null,
  routes: StoreStationRoutes,
): string | null {
  const productStation = routes.products.has(productId)
    ? routes.products.get(productId) ?? null
    : legacyStationId && routes.stationIds.has(legacyStationId) ? legacyStationId : null;
  return productStation ?? categoryStationId;
}
