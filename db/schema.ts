// db/schema.ts
import { sql } from "drizzle-orm";
import type { Buyer, ChannelModes } from "../lib/core/fiscal";
import { DEFAULT_MODES } from "../lib/core/fiscal";
import type { RemovedLine } from "../lib/core/cart";
import { pgTable, pgEnum, uuid, text, integer, boolean, timestamp, jsonb, uniqueIndex, index, bigserial, check, date } from "drizzle-orm/pg-core";

export const vertical = pgEnum("vertical", ["restoran", "market"]);
export const userRole = pgEnum("user_role", ["sahip", "mudur"]);
export const staffRole = pgEnum("staff_role", ["kasiyer", "mudur", "garson", "kurye"]);
export const deviceRole = pgEnum("device_role", ["kasa", "garson", "mutfak", "kurye"]);
export const payMethod = pgEnum("pay_method", ["nakit", "kart", "yemek_karti", "online"]);
export const saleChannel = pgEnum("sale_channel", ["kasa", "masa", "paket", "platform"]);
export const saleStatus = pgEnum("sale_status", ["kapandi", "iptal", "iade"]);
export const productKind = pgEnum("product_kind", ["adet", "tartili"]);
export const stockKind = pgEnum("stock_kind", ["satis", "iade", "alis", "sayim", "fire", "recete", "uretim"]);
export const stockUnit = pgEnum("stock_unit", ["adet", "kg", "lt"]);
export const purchaseStatus = pgEnum("purchase_status", ["kayitli", "iptal"]);
export const fiscalDocStatus = pgEnum("fiscal_doc_status", ["pending", "issued", "error", "cancelled", "cancel_rejected"]);
export const supplierPayMethod = pgEnum("supplier_pay_method", ["nakit", "havale", "kart"]);
export const growthCampaignStatus = pgEnum("growth_campaign_status", ["taslak", "arsiv"]);
export const growthCampaignEventType = pgEnum("growth_campaign_event_type", ["sent", "delivered", "converted", "opt_out", "failed"]);

const ts = (n: string) => timestamp(n, { withTimezone: true });
const tenantRef = () => uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" });

// — Kimlik tabloları (RLS yok; yalnız lib/auth erişir) —
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  vertical: vertical("vertical").notNull(),
  taxId: text("tax_id"), // M8: e-Arşiv satıcı bilgisi
  taxOffice: text("tax_office"),
  address: text("address"),
  trialEndsAt: ts("trial_ends_at").notNull().default(sql`now() + interval '14 days'`), // M9b: mevcut işletmeler yayından 14 gün
  paidUntil: ts("paid_until"),
  billingRemindedEnd: ts("billing_reminded_end"), // hatırlatma gönderilen bitiş (aynı bitişe bir kez)
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
  emailVerifiedAt: ts("email_verified_at"), // e-posta doğrulama zamanı
  totpSecret: text("totp_secret"), // 2FA TOTP anahtarı
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
  sellable: boolean("sellable").notNull().default(true), // M7: false = hammadde / ara ürün, kasa kataloğuna inmez
  unit: stockUnit("unit").notNull().default("adet"), // stok birimi; satılan üründe kind'den türer (tartılı → kg)
  cost: integer("cost"), // kuruş / 1 birim (son alış ya da üretim)
  costAt: ts("cost_at"),
  minStock: integer("min_stock"), // qtyMilli, kritik sınır
  yieldMilli: integer("yield_milli"), // ara ürün: bir parti
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
}, (t) => [uniqueIndex("sales_receipt_uq").on(t.deviceId, t.receiptNo), index("sales_shift_idx").on(t.shiftId), index("sales_at_idx").on(t.tenantId, t.storeId, t.createdAt)]);

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
  cost: integer("cost"), // M7: eşitleme anında donan satır maliyeti (pozitif); null = maliyet eksik
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
  purchaseId: uuid("purchase_id").references(() => purchases.id, { onDelete: "cascade" }),
  productionId: uuid("production_id").references(() => productions.id, { onDelete: "cascade" }),
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
  marketingConsent: boolean("marketing_consent").notNull().default(false),
  marketingConsentAt: ts("marketing_consent_at"),
  marketingConsentSource: text("marketing_consent_source"),
  lastOrderAt: ts("last_order_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("customers_phone_uq").on(t.tenantId, t.phone),
  index("customers_growth_audience_idx").on(t.tenantId, t.marketingConsent, t.lastOrderAt, t.id),
  index("customers_growth_created_idx").on(t.tenantId, t.createdAt),
]);

/** Büyüme Merkezi: gönderim yapmayan, tenant içi kampanya taslakları. */
export const growthCampaigns = pgTable("growth_campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  name: text("name").notNull(),
  segment: text("segment").notNull().default("dormant_30"),
  message: text("message").notNull(),
  channel: text("channel").notNull().default("manual"),
  status: growthCampaignStatus("status").notNull().default("taslak"),
  audienceCount: integer("audience_count").notNull().default(0),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
  approvedAt: ts("approved_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("growth_campaigns_tenant_idx").on(t.tenantId, t.createdAt)]);

/** Sağlayıcıdaki HMAC alıcısını tenant içindeki müşteriye bağlar; dışarıya müşteri kimliği çıkmaz. */
export const growthRecipientRefs = pgTable("growth_recipient_refs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  recipientRef: text("recipient_ref").notNull(),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("growth_recipient_refs_uq").on(t.tenantId, t.recipientRef),
  index("growth_recipient_refs_customer_idx").on(t.tenantId, t.customerId),
]);

/** Büyüme Merkezi ölçüm günlüğü: sağlayıcı olayları ve dönüşümler; iletişim göndermez. */
export const growthCampaignEvents = pgTable("growth_campaign_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  campaignId: uuid("campaign_id").notNull().references(() => growthCampaigns.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
  type: growthCampaignEventType("type").notNull(),
  externalId: text("external_id"),
  recipientRef: text("recipient_ref"),
  amount: integer("amount").notNull().default(0),
  at: ts("at").notNull().defaultNow(),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("growth_campaign_events_campaign_idx").on(t.tenantId, t.campaignId, t.at), uniqueIndex("growth_campaign_events_external_uq").on(t.campaignId, t.externalId)]);

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

// ---- M7: reçete, tedarikçi, alış, üretim ----

/** Kalem 1 birim ürün/seçenek için; ara üründe bir parti (products.yield_milli) için. lib/core/recipe.ts */
export const recipeItems = pgTable("recipe_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }),
  optionId: uuid("option_id").references(() => options.id, { onDelete: "cascade" }),
  ingredientId: uuid("ingredient_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  qtyMilli: integer("qty_milli").notNull(),
}, (t) => [
  index("recipe_items_product_idx").on(t.productId),
  index("recipe_items_option_idx").on(t.optionId),
  check("recipe_items_owner_ck", sql`(${t.productId} is null) <> (${t.optionId} is null)`),
  check("recipe_items_qty_ck", sql`${t.qtyMilli} > 0`),
]);

export const suppliers = pgTable("suppliers", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  name: text("name").notNull(),
  phone: text("phone"),
  taxNo: text("tax_no"),
  note: text("note"),
  active: boolean("active").notNull().default(true),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("suppliers_tenant_idx").on(t.tenantId)]);

/** Tutarlar KDV dahil kuruş. İptal = ters alis hareketleri, maliyet geri alınmaz. */
export const purchases = pgTable("purchases", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
  docNo: text("doc_no"),
  date: date("date", { mode: "string" }).notNull(),
  total: integer("total").notNull(),
  note: text("note"),
  status: purchaseStatus("status").notNull().default("kayitli"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("purchases_tenant_date_idx").on(t.tenantId, t.date), index("purchases_supplier_idx").on(t.supplierId)]);

export const purchaseLines = pgTable("purchase_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  purchaseId: uuid("purchase_id").notNull().references(() => purchases.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  qtyMilli: integer("qty_milli").notNull(),
  unitCost: integer("unit_cost").notNull(),
  total: integer("total").notNull(),
}, (t) => [index("purchase_lines_purchase_idx").on(t.purchaseId)]);

export const supplierPayments = pgTable("supplier_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  supplierId: uuid("supplier_id").notNull().references(() => suppliers.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  method: supplierPayMethod("method").notNull(),
  date: date("date", { mode: "string" }).notNull(),
  note: text("note"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("supplier_payments_supplier_idx").on(t.supplierId)]);

export const productions = pgTable("productions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  batchesMilli: integer("batches_milli").notNull(),
  note: text("note"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("productions_tenant_idx").on(t.tenantId, t.createdAt)]);

// — M8: mali belge —
export const fiscalSettings = pgTable("fiscal_settings", {
  tenantId: uuid("tenant_id").primaryKey().references(() => tenants.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("fake-earsiv"),
  series: text("series").notNull().default("CBP"),
  counter: integer("counter").notNull().default(0),
  channelModes: jsonb("channel_modes").notNull().$type<ChannelModes>().default(DEFAULT_MODES),
  fakeFail: boolean("fake_fail").notNull().default(false),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const fiscalDocuments = pgTable("fiscal_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  saleId: uuid("sale_id").notNull().unique().references(() => sales.id, { onDelete: "cascade" }),
  kind: text("kind").notNull().default("earsiv"),
  status: fiscalDocStatus("status").notNull().default("pending"),
  buyer: jsonb("buyer").notNull().$type<Buyer>(),
  ettn: uuid("ettn"),
  number: text("number"),
  url: text("url"),
  token: text("token").notNull().unique(),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  lastTryAt: ts("last_try_at"),
  cancelPending: boolean("cancel_pending").notNull().default(false),
  emailSentAt: ts("email_sent_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
  issuedAt: ts("issued_at"),
}, (t) => [index("fiscal_documents_status_idx").on(t.tenantId, t.status)]);

// — İade tutanağı / alıcı iade faturası: e-Arşiv'li satışın kısmi iadesi (ya da iptali reddedilen tam iade). —
export const fiscalRefunds = pgTable("fiscal_refunds", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  refundSaleId: uuid("refund_sale_id").notNull().unique().references(() => sales.id, { onDelete: "cascade" }),
  fiscalDocId: uuid("fiscal_doc_id").notNull().references(() => fiscalDocuments.id, { onDelete: "cascade" }),
  kind: text("kind").notNull().$type<"tutanak" | "alici_faturasi">(),
  buyerInvoiceNo: text("buyer_invoice_no"),
  buyerInvoiceDate: date("buyer_invoice_date"),
  resolvedAt: ts("resolved_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("fiscal_refunds_open_idx").on(t.tenantId, t.resolvedAt)]);

// — M9a: kasa olayı (sepetten silme / sepeti boşaltma). Değişmez; kimlik istemcide. —
export const registerEvents = pgTable("register_events", {
  id: uuid("id").primaryKey(),
  tenantId: tenantRef(),
  storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  deviceId: uuid("device_id").notNull().references(() => devices.id),
  shiftId: uuid("shift_id").notNull().references(() => shifts.id),
  staffId: uuid("staff_id").notNull().references(() => staff.id),
  at: ts("at").notNull(),
  type: text("type").notNull(), // line_removed | cart_cleared
  lines: jsonb("lines").notNull().$type<RemovedLine[]>(),
  total: integer("total").notNull(),
  syncedAt: ts("synced_at").notNull().defaultNow(),
}, (t) => [index("register_events_at_idx").on(t.tenantId, t.storeId, t.at)]);

// — M9b: abonelik ödemeleri. RLS yok (sağlayıcı geri bildirimi kiracı bağlamsız gelir); yalnız lib/billing erişir. —
export const billingPayments = pgTable("billing_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  provider: text("provider").notNull(),
  period: text("period").notNull(), // aylik | yillik
  amount: integer("amount").notNull(), // kuruş, KDV dahil; taban + ek şube/terminal (ödeme anı fotoğrafı)
  stores: integer("stores").notNull().default(0), // ödeme anındaki şube sayısı
  devices: integer("devices").notNull().default(0), // ödeme anındaki aktif terminal sayısı
  status: text("status").notNull().default("bekliyor"), // bekliyor | odendi | basarisiz
  providerRef: text("provider_ref"),
  periodEnd: ts("period_end"),
  createdAt: ts("created_at").notNull().defaultNow(),
  paidAt: ts("paid_at"),
}, (t) => [index("billing_payments_tenant_idx").on(t.tenantId, t.createdAt)]);

// — #14: SaaS'ın kendi abonelik e-Arşiv faturaları (satıcı ÇabukPOS, alıcı kiracı). RLS yok (geri bildirim kiracı bağlamsız); yalnız lib/billing erişir. —
export const billingInvoices = pgTable("billing_invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  paymentId: uuid("payment_id").notNull().unique().references(() => billingPayments.id, { onDelete: "cascade" }),
  tenantId: tenantRef(),
  provider: text("provider").notNull().default("fake-earsiv"),
  status: text("status").notNull().default("pending"), // pending | issued | error
  buyer: jsonb("buyer").notNull(), // Buyer (core/fiscal)
  token: text("token").notNull().unique(),
  ettn: text("ettn"),
  number: text("number"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  lastTryAt: ts("last_try_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
  issuedAt: ts("issued_at"),
});

// — #14: SaaS e-Arşiv sayaç (yıl başına sıra; numara yalnız başarılı kesimde yanar). —
export const billingInvoiceCounters = pgTable("billing_invoice_counters", {
  year: integer("year").primaryKey(),
  counter: integer("counter").notNull().default(0),
});

// — M9c: ajans erişim anahtarları. RLS yok (anahtar kiracı bilinmeden hash ile aranır, devices gibi); yalnız lib/integrations/keys erişir, her sorguda tenantId. —
export const integrationKeys = pgTable("integration_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  name: text("name").notNull(),
  scope: text("scope").notNull().default("stats"), // stats | growth
  prefix: text("prefix").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  createdAt: ts("created_at").notNull().defaultNow(),
  lastUsedAt: ts("last_used_at"),
  revokedAt: ts("revoked_at"),
}, (t) => [index("integration_keys_tenant_idx").on(t.tenantId)]);
