// db/schema.ts
import { pgTable, pgEnum, uuid, text, integer, boolean, timestamp, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";

export const vertical = pgEnum("vertical", ["restoran", "market"]);
export const userRole = pgEnum("user_role", ["sahip", "mudur"]);
export const staffRole = pgEnum("staff_role", ["kasiyer", "mudur"]);
export const payMethod = pgEnum("pay_method", ["nakit", "kart", "yemek_karti"]);
export const saleChannel = pgEnum("sale_channel", ["kasa", "masa", "paket", "platform"]);
export const saleStatus = pgEnum("sale_status", ["kapandi", "iptal"]);

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
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("devices_prefix_uq").on(t.tenantId, t.receiptPrefix)]);

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
});

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  price: integer("price").notNull(),
  vatRate: integer("vat_rate").notNull(),
  barcodes: text("barcodes").array().notNull().default([]),
  active: boolean("active").notNull().default(true),
  sort: integer("sort").notNull().default(0),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("products_tenant_idx").on(t.tenantId)]);

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
});

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  saleId: uuid("sale_id").notNull().references(() => sales.id, { onDelete: "cascade" }),
  method: payMethod("method").notNull(),
  amount: integer("amount").notNull(),
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantRef(),
  actor: text("actor").notNull(), // "user:<id>" | "staff:<id>"
  action: text("action").notNull(),
  detail: jsonb("detail"),
  createdAt: ts("created_at").notNull().defaultNow(),
});
