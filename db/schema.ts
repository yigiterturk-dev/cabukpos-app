// db/schema.ts
import { sql } from "drizzle-orm";
import { pgTable, pgEnum, uuid, text, integer, boolean, timestamp, jsonb, uniqueIndex, index, bigserial } from "drizzle-orm/pg-core";

export const vertical = pgEnum("vertical", ["restoran", "market"]);
export const userRole = pgEnum("user_role", ["sahip", "mudur"]);
export const staffRole = pgEnum("staff_role", ["kasiyer", "mudur", "garson", "kurye"]);
export const deviceRole = pgEnum("device_role", ["kasa", "garson", "mutfak", "kurye"]);
export const payMethod = pgEnum("pay_method", ["nakit", "kart", "yemek_karti", "online"]);
export const saleChannel = pgEnum("sale_channel", ["kasa", "masa", "paket", "platform"]);
export const saleStatus = pgEnum("sale_status", ["kapandi", "iptal", "iade"]);
export const productKind = pgEnum("product_kind", ["adet", "tartili"]);
export const stockKind = pgEnum("stock_kind", ["satis", "iade", "alis", "sayim", "fire"]);

const ts = (n: string) => timestamp(n, { withTimezone: true });
const tenantRef = () => uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" });

// — Kimlik tabloları (RLS yok; yalnız lib/auth erişir) —
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  vertical: vertical("vertical").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull().default("sahip"),
  active: boolean("active").notNull().default(true),
  tokenVersion: integer("token_version").notNull().default(0),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const devices = pgTable("devices", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  receiptPrefix: text("receipt_prefix").notNull(),
  nextReceiptNo: integer("next_receipt_no").notNull().default(1),
  tokenHash: text("token_hash").unique(),
  pairingCode: text("pairing_code").unique(),
  pairingExpiresAt: ts("pairing_expires_at"),
  pairedAt: ts("paired_at"),
  revokedAt: ts("revoked_at"),
  lastSeenAt: ts("last_seen_at"),
  role: deviceRole("role").notNull().default("kasa"), // M5: restoran salonunda garson tableti / mutfak ekranı
  stations: uuid("stations").array().notNull().default([]), // mutfak ekranı filtresi; boş = tümü
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("devices_prefix_uq").on(t.tenantId, t.receiptPrefix)]);

/** Yerel ajan (kasadaki PC): yazıcı, çekmece, terazi. RLS dışı kimlik tablosu (devices gibi); her sorguda tenantId koşulu. */
export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  tokenHash: text("token_hash").unique(),
  pairingCode: text("pairing_code").unique(),
  pairingExpiresAt: ts("pairing_expires_at"),
  pairedAt: ts("paired_at"),
  revokedAt: ts("revoked_at"),
  hubKeyEnc: text("hub_key_enc"), // kasa biletlerini imzalar; AUTH_SECRET'tan türetilen anahtarla AES-GCM
  config: jsonb("config").notNull().$type<import("@/lib/agent/config").AgentConfig>(),
  lanIp: text("lan_ip"),
  port: integer("port"),
  httpsPort: integer("https_port"),
  certExpiresAt: ts("cert_expires_at"),
  version: text("version"),
  status: jsonb("status").$type<{ printers: { id: string; ok: boolean | null; error: string | null }[]; failed: number; scale: boolean }>(),
  lastSeenAt: ts("last_seen_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("agents_store_idx").on(t.storeId)]);

/** Deneme sayacı (e-posta, IP, cihaz başına kayan pencere); RLS dışı. */
export const loginAttempts = pgTable("login_attempts", {
  key: text("key").primaryKey(),
  n: integer("n").notNull().default(0),
  since: ts("since").notNull().defaultNow(),
});

// — İş tabloları (RLS: tenant_id = app.tenant_id) —
export const stores = pgTable("stores", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  name: text("name").notNull(),
  address: text("address"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const staff = pgTable("staff", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  name: text("name").notNull(),
  role: staffRole("role").notNull().default("kasiyer"),
  pinHash: text("pin_hash").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  name: text("name").notNull(),
  sort: integer("sort").notNull().default(0),
  stationId: uuid("station_id").references(() => stations.id, { onDelete: "set null" }), // M5: mutfak istasyonu
});

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  price: integer("price").notNull(), // tartılıda kg fiyatı
  vatRate: integer("vat_rate").notNull(),
  barcodes: text("barcodes").array().notNull().default([]),
  kind: productKind("kind").notNull().default("adet"),
  plu: text("plu"), // terazi etiketi ürün kodu (5 hane), yalnız tartılı
  trackStock: boolean("track_stock").notNull().default(false),
  quick: boolean("quick").notNull().default(false), // market kasası hızlı tuşu
  active: boolean("active").notNull().default(true),
  sort: integer("sort").notNull().default(0),
  priceChangedAt: ts("price_changed_at").notNull().defaultNow(),
  labelPrintedAt: ts("label_printed_at"),
  stationId: uuid("station_id").references(() => stations.id, { onDelete: "set null" }), // kategoriyi ezer
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("products_tenant_idx").on(t.tenantId), uniqueIndex("products_plu_uq").on(t.tenantId, t.plu)]);

export const shifts = pgTable("shifts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  storeId: uuid("store_id").notNull().references(() => stores.id),
  deviceId: uuid("device_id").notNull().references(() => devices.id),
  openedBy: uuid("opened_by").notNull().references(() => staff.id),
  openedAt: ts("opened_at").notNull().defaultNow(),
  openingCash: integer("opening_cash").notNull(),
  closedBy: uuid("closed_by").references(() => staff.id),
  closedAt: ts("closed_at"),
  countedCash: integer("counted_cash"),
  expectedCash: integer("expected_cash"),
}, (t) => [index("shifts_device_idx").on(t.deviceId, t.closedAt)]);

export const sales = pgTable("sales", {
  id: uuid("id").primaryKey(), // istemci üretir (idempotent)
  tenantId: tenantRef(),
  storeId: uuid("store_id").notNull().references(() => stores.id),
  deviceId: uuid("device_id").notNull().references(() => devices.id),
  shiftId: uuid("shift_id").notNull().references(() => shifts.id),
  staffId: uuid("staff_id").notNull().references(() => staff.id),
  receiptNo: text("receipt_no").notNull(),
  channel: saleChannel("channel").notNull().default("kasa"),
  status: saleStatus("status").notNull().default("kapandi"),
  total: integer("total").notNull(),
  change: integer("change").notNull().default(0),
  vat: jsonb("vat").notNull().$type<{ rate: number; gross: number; net: number; vat: number }[]>(),
  refundOf: uuid("refund_of"), // iade: asıl satış (FK yok; asıl satış henüz eşitlenmemiş olabilir)
  approvedBy: uuid("approved_by").references(() => staff.id), // iadeyi onaylayan müdür
  tabId: uuid("tab_id"), // M5: masa adisyonundan ödenen parça
  tableId: uuid("table_id"),
  review: text("review"), // eşitlemede kabul edildi ama incelenmeli (fiyat farkı, silinmiş ürün, fiş no çakışması…)
  createdAt: ts("created_at").notNull().defaultNow(), // satış anı (cihaz saati)
  syncedAt: ts("synced_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("sales_receipt_uq").on(t.deviceId, t.receiptNo), index("sales_shift_idx").on(t.shiftId)]);

export const saleLines = pgTable("sale_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  saleId: uuid("sale_id").notNull().references(() => sales.id, { onDelete: "cascade" }),
  productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  unitPrice: integer("unit_price").notNull(),
  vatRate: integer("vat_rate").notNull(),
  qtyMilli: integer("qty_milli").notNull(),
  total: integer("total").notNull(),
  options: jsonb("options").$type<{ id: string; name: string; delta: number }[]>(),
  note: text("note"),
  discount: integer("discount").notNull().default(0), // ikram + adisyon indirimi payı
});

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  saleId: uuid("sale_id").notNull().references(() => sales.id, { onDelete: "cascade" }),
  method: payMethod("method").notNull(),
  amount: integer("amount").notNull(),
});

/** Stok = son sayım (mutlak qty) + sonraki hareketler (işaretli qty). lib/core/stock.ts */
export const stockMovements = pgTable("stock_movements", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  kind: stockKind("kind").notNull(),
  qtyMilli: integer("qty_milli").notNull(),
  at: ts("at").notNull().defaultNow(),
  saleId: uuid("sale_id").references(() => sales.id, { onDelete: "cascade" }),
  actor: text("actor").notNull(),
  note: text("note"),
}, (t) => [index("stock_product_idx").on(t.productId, t.at)]);

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  actor: text("actor").notNull(), // "user:<id>" | "staff:<id>"
  action: text("action").notNull(),
  detail: jsonb("detail"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

// — M5 Restoran salon —
export const areas = pgTable("areas", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sort: integer("sort").notNull().default(0),
});

export const tables = pgTable("tables", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  areaId: uuid("area_id").notNull().references(() => areas.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sort: integer("sort").notNull().default(0),
  active: boolean("active").notNull().default(true),
}, (t) => [index("tables_area_idx").on(t.areaId)]);

export const optionGroups = pgTable("option_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  name: text("name").notNull(),
  min: integer("min").notNull().default(0),
  max: integer("max").notNull().default(1),
  sort: integer("sort").notNull().default(0),
});

export const options = pgTable("options", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  groupId: uuid("group_id").notNull().references(() => optionGroups.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  delta: integer("delta").notNull().default(0), // kuruş, eksi olabilir
  sort: integer("sort").notNull().default(0),
}, (t) => [index("options_group_idx").on(t.groupId)]);

export const productOptionGroups = pgTable("product_option_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  groupId: uuid("group_id").notNull().references(() => optionGroups.id, { onDelete: "cascade" }),
  sort: integer("sort").notNull().default(0),
}, (t) => [uniqueIndex("product_option_groups_uq").on(t.productId, t.groupId)]);

export const stations = pgTable("stations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  printer: text("printer"), // ajandaki yazıcı kimliği; boş = yalnız mutfak ekranı
  sort: integer("sort").notNull().default(0),
});

/** Adisyon olayları: tek kaynak, yalnız eklenir. lib/core/tab.ts katlar. seq = sunucu sırası (akış imleci). */
export const tabEvents = pgTable("tab_events", {
  id: uuid("id").primaryKey(), // istemci üretir (idempotent); ödeme olayında satış kimliği
  seq: bigserial("seq", { mode: "number" }).notNull().unique(),
  tenantId: tenantRef(),
  storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  tabId: uuid("tab_id").notNull(),
  tableId: uuid("table_id"), // M6: paket/platform adisyonu masasız
  deviceId: uuid("device_id").references(() => devices.id), // M6: webhook (sunucu) olayında boş
  staffId: uuid("staff_id").references(() => staff.id),
  approvedBy: uuid("approved_by").references(() => staff.id),
  at: ts("at").notNull(),
  type: text("type").notNull(),
  payload: jsonb("payload").notNull(),
  review: text("review"),
  syncedAt: ts("synced_at").notNull().defaultNow(),
}, (t) => [
  index("tab_events_store_seq_idx").on(t.storeId, t.seq), index("tab_events_tab_idx").on(t.tabId),
  // M6: aynı platform siparişi (webhook tekrarı) ikinci kez yazılmaz
  uniqueIndex("tab_events_platform_order_uq").on(t.storeId, sql`(${t.payload}->'source'->>'externalId')`).where(sql`${t.type} = 'order' and ${t.payload}->'source'->>'externalId' is not null`),
]);

// — M6: paket servis —
export const deliveryZones = pgTable("delivery_zones", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  fee: integer("fee").notNull().default(0), // kuruş
  minOrder: integer("min_order").notNull().default(0),
  sort: integer("sort").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

/** Müşteri defteri: kiracı + normalize telefon benzersiz. Bulut "order" olayından doldurur. */
export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  phone: text("phone").notNull(),
  name: text("name").notNull(),
  note: text("note"),
  lastOrderAt: ts("last_order_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("customers_phone_uq").on(t.tenantId, t.phone)]);

export const customerAddresses = pgTable("customer_addresses", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  label: text("label"),
  address: text("address").notNull(),
  directions: text("directions"),
  zoneId: uuid("zone_id").references(() => deliveryZones.id, { onDelete: "set null" }),
  deleted: boolean("deleted").notNull().default(false),
  lastUsedAt: ts("last_used_at").notNull().defaultNow(),
}, (t) => [index("customer_addresses_customer_idx").on(t.customerId)]);

/** Platform bağlantısı. Webhook kiracıyı bilmeden gelir → RLS dışı kimlik tablosu (devices gibi); her sorguda tenantId koşulu. */
export const platformConnections = pgTable("platform_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(), // mock | yemeksepeti | trendyol …
  credentials: text("credentials"), // şifreli; sahte platformda boş
  webhookSecret: text("webhook_secret").notNull(),
  autoAccept: boolean("auto_accept").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("platform_connections_uq").on(t.storeId, t.platform)]);

export const productPlatformCodes = pgTable("product_platform_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(),
  code: text("code").notNull(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
}, (t) => [uniqueIndex("product_platform_codes_uq").on(t.storeId, t.platform, t.code)]);
