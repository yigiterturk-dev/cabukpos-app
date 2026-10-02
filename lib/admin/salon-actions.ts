"use server";
// M5 restoran salonu: bölge + masa, mutfak istasyonları, seçenek grupları, cihaz rolü.
// Seçenekler ada göre güncellenir (kimlik korunur): çevrimdışı kasadaki eski kimlikli satış fiyat kontrolünden geçsin.
import { and, asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema, withTenant } from "@/db";
import { requireWriter } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { expandTableNames, parseOptionLines } from "./salon";

export type SalonState = { error?: string; field?: string; savedAt?: number };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

// — Hızlı kurulum: yeni işletme bölge adı + masa sayısıyla salonunu tek seferde kurar —
export async function salonSetup(_: SalonState, form: FormData): Promise<SalonState> {
  const a = await requireWriter();
  const zones = form.getAll("zone").map((v) => String(v).trim());
  const counts = form.getAll("count").map((v) => Number(v));
  const list = zones.map((name, i) => ({ name, count: counts[i] })).filter((z) => z.name !== "" || Number.isFinite(z.count) && z.count > 0);
  if (!list.length) return { error: "En az bir bölüm yazın (ör. Salon — 8 masa).", field: "zone" };
  if (list.some((z) => z.name.length < 1 || z.name.length > 40)) return { error: "Bölge adı 1-40 karakter olmalı.", field: "zone" };
  if (list.some((z) => !Number.isInteger(z.count) || z.count < 1 || z.count > 80)) return { error: "Masa sayısı 1-80 arasında olmalı.", field: "count" };
  const used = new Set<string>();
  const prefixOf = (name: string) => {
    for (const ch of name.toUpperCase()) if (/[A-ZÇĞİÖŞÜ0-9]/.test(ch) && !used.has(ch)) { used.add(ch); return ch; }
    const fb = "SBTMEKBAPÇGŞİÜÖZY0123456789".split("").find((c) => !used.has(c));
    used.add(fb!);
    return fb!;
  };
  await withTenant(a.tenantId, async (tx) => {
    const storeId = (await tx.select({ id: schema.stores.id }).from(schema.stores).orderBy(asc(schema.stores.createdAt)).limit(1))[0]?.id;
    if (!storeId) return;
    for (const [i, z] of list.entries()) {
      const [area] = await tx.insert(schema.areas).values({ tenantId: a.tenantId, storeId, name: z.name, sort: i }).returning({ id: schema.areas.id });
      const names = expandTableNames(`${prefixOf(z.name)}1-${z.count}`);
      if (names) await tx.insert(schema.tables).values(names.map((name, k) => ({ tenantId: a.tenantId, areaId: area.id, name, sort: k })));
      await audit(tx, a.tenantId, `user:${a.id}`, "salon.setup", { area: area.id, name: z.name, count: z.count });
    }
  });
  revalidatePath("/yonetim/salon");
  return { savedAt: Date.now() };
}

async function firstStore(tenantId: string) {
  const [s] = await withTenant(tenantId, (tx) => tx.select({ id: schema.stores.id }).from(schema.stores).orderBy(asc(schema.stores.createdAt)).limit(1));
  return s.id;
}

// — Bölge + masa —
export async function saveArea(_: SalonState, form: FormData): Promise<SalonState> {
  const a = await requireWriter();
  const name = str(form, "name");
  if (name.length < 1 || name.length > 40) return { error: "Bölge adı 1-40 karakter.", field: "name" };
  const storeId = await firstStore(a.tenantId);
  await withTenant(a.tenantId, async (tx) => {
    const n = (await tx.select({ id: schema.areas.id }).from(schema.areas)).length;
    await tx.insert(schema.areas).values({ tenantId: a.tenantId, storeId, name, sort: n });
    await audit(tx, a.tenantId, `user:${a.id}`, "area.create", { name });
  });
  revalidatePath("/yonetim/salon");
  return { savedAt: Date.now() };
}

export async function deleteArea(id: string) {
  const a = await requireWriter();
  if (!UUID.test(id)) return;
  await withTenant(a.tenantId, async (tx) => {
    await tx.delete(schema.areas).where(eq(schema.areas.id, id));
    await audit(tx, a.tenantId, `user:${a.id}`, "area.delete", { id });
  });
  revalidatePath("/yonetim/salon");
}

export async function addTables(areaId: string, _: SalonState, form: FormData): Promise<SalonState> {
  const a = await requireWriter();
  if (!UUID.test(areaId)) return { error: "Bölge bulunamadı." };
  const names = expandTableNames(str(form, "names"));
  if (!names) return { error: "Masa adları geçersiz (ör. M1-M12 ya da Bahçe 1, Bahçe 2).", field: "names" };
  const err = await withTenant(a.tenantId, async (tx) => {
    const [area] = await tx.select({ id: schema.areas.id }).from(schema.areas).where(eq(schema.areas.id, areaId));
    if (!area) return "Bölge bulunamadı.";
    const had = await tx.select({ name: schema.tables.name }).from(schema.tables).where(eq(schema.tables.areaId, areaId));
    const fresh = names.filter((n) => !had.some((h) => h.name === n));
    if (fresh.length) await tx.insert(schema.tables).values(fresh.map((name, i) => ({ tenantId: a.tenantId, areaId, name, sort: had.length + i })));
    await audit(tx, a.tenantId, `user:${a.id}`, "table.create", { areaId, names: fresh });
    return null;
  });
  if (err) return { error: err };
  revalidatePath("/yonetim/salon");
  return { savedAt: Date.now() };
}

export async function deleteTable(id: string) {
  const a = await requireWriter();
  if (!UUID.test(id)) return;
  await withTenant(a.tenantId, async (tx) => {
    await tx.delete(schema.tables).where(eq(schema.tables.id, id));
    await audit(tx, a.tenantId, `user:${a.id}`, "table.delete", { id });
  });
  revalidatePath("/yonetim/salon");
}

// — İstasyonlar —
export async function saveStation(id: string | null, _: SalonState, form: FormData): Promise<SalonState> {
  const a = await requireWriter();
  if (id && !UUID.test(id)) return { error: "İstasyon bulunamadı." };
  const name = str(form, "name");
  const printer = str(form, "printer") || null;
  if (name.length < 1 || name.length > 40) return { error: "İstasyon adı 1-40 karakter.", field: "name" };
  if (printer && !/^[a-z0-9-]{1,12}$/i.test(printer)) return { error: "Yazıcı geçersiz.", field: "printer" };
  const storeId = await firstStore(a.tenantId);
  await withTenant(a.tenantId, async (tx) => {
    if (id) await tx.update(schema.stations).set({ name, printer }).where(eq(schema.stations.id, id));
    else await tx.insert(schema.stations).values({ tenantId: a.tenantId, storeId, name, printer });
    await audit(tx, a.tenantId, `user:${a.id}`, id ? "station.update" : "station.create", { id, name, printer });
  });
  revalidatePath("/yonetim/istasyonlar");
  return { savedAt: Date.now() };
}

export async function deleteStation(id: string) {
  const a = await requireWriter();
  if (!UUID.test(id)) return;
  await withTenant(a.tenantId, async (tx) => {
    await tx.delete(schema.stations).where(eq(schema.stations.id, id));
    await audit(tx, a.tenantId, `user:${a.id}`, "station.delete", { id });
  });
  revalidatePath("/yonetim/istasyonlar");
}

export async function setCategoryStation(categoryId: string, stationId: string) {
  const a = await requireWriter();
  if (!UUID.test(categoryId) || (stationId && !UUID.test(stationId))) return;
  await withTenant(a.tenantId, async (tx) => {
    if (stationId) {
      const [s] = await tx.select({ id: schema.stations.id }).from(schema.stations).where(eq(schema.stations.id, stationId));
      if (!s) return;
    }
    await tx.update(schema.categories).set({ stationId: stationId || null }).where(eq(schema.categories.id, categoryId));
    await audit(tx, a.tenantId, `user:${a.id}`, "category.station", { categoryId, stationId: stationId || null });
  });
  revalidatePath("/yonetim/istasyonlar");
}

// — Seçenek grupları —
export async function saveOptionGroup(id: string | null, _: SalonState, form: FormData): Promise<SalonState> {
  const a = await requireWriter();
  if (id && !UUID.test(id)) return { error: "Grup bulunamadı." };
  const name = str(form, "name");
  const min = Number(str(form, "min") || 0), max = Number(str(form, "max") || 1);
  if (name.length < 1 || name.length > 40) return { error: "Grup adı 1-40 karakter.", field: "name" };
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < 1 || max > 30 || min > max) return { error: "En az / en çok geçersiz (0 ≤ en az ≤ en çok).", field: "max" };
  const opts = parseOptionLines(str(form, "options"));
  if (typeof opts === "string") return { error: opts, field: "options" };
  const err = await withTenant(a.tenantId, async (tx) => {
    const G = schema.optionGroups, O = schema.options;
    let gid = id;
    if (gid) {
      const [row] = await tx.update(G).set({ name, min, max }).where(eq(G.id, gid)).returning({ id: G.id });
      if (!row) return "Grup bulunamadı.";
    } else {
      gid = (await tx.insert(G).values({ tenantId: a.tenantId, name, min, max }).returning({ id: G.id }))[0].id;
    }
    const had = await tx.select().from(O).where(eq(O.groupId, gid));
    const gone = had.filter((h) => !opts.some((o) => o.name === h.name)).map((h) => h.id);
    if (gone.length) await tx.delete(O).where(inArray(O.id, gone));
    for (const [i, o] of opts.entries()) {
      const h = had.find((x) => x.name === o.name);
      if (h) await tx.update(O).set({ delta: o.delta, sort: i }).where(eq(O.id, h.id));
      else await tx.insert(O).values({ tenantId: a.tenantId, groupId: gid, name: o.name, delta: o.delta, sort: i });
    }
    await audit(tx, a.tenantId, `user:${a.id}`, id ? "option_group.update" : "option_group.create", { id: gid, name, min, max, options: opts });
    return null;
  });
  if (err) return { error: err };
  revalidatePath("/yonetim/secenekler");
  return { savedAt: Date.now() };
}

export async function deleteOptionGroup(id: string) {
  const a = await requireWriter();
  if (!UUID.test(id)) return;
  await withTenant(a.tenantId, async (tx) => {
    await tx.delete(schema.optionGroups).where(eq(schema.optionGroups.id, id));
    await audit(tx, a.tenantId, `user:${a.id}`, "option_group.delete", { id });
  });
  revalidatePath("/yonetim/secenekler");
}

// — Cihaz rolü (devices RLS dışı → tenantId koşulu) —
export async function setDeviceRole(deviceId: string, _: SalonState, form: FormData): Promise<SalonState> {
  const a = await requireWriter();
  if (!UUID.test(deviceId)) return { error: "Cihaz bulunamadı." };
  const role = str(form, "role");
  if (role !== "kasa" && role !== "garson" && role !== "mutfak" && role !== "kurye") return { error: "Rol geçersiz." };
  const wanted = form.getAll("stations").map(String).filter((s) => UUID.test(s));
  const stations = role === "mutfak" && wanted.length
    ? (await withTenant(a.tenantId, (tx) => tx.select({ id: schema.stations.id }).from(schema.stations).where(inArray(schema.stations.id, wanted)))).map((s) => s.id)
    : [];
  const [row] = await getDb().update(schema.devices).set({ role, stations }).where(and(eq(schema.devices.id, deviceId), eq(schema.devices.tenantId, a.tenantId))).returning({ id: schema.devices.id });
  if (!row) return { error: "Cihaz bulunamadı." };
  await withTenant(a.tenantId, (tx) => audit(tx, a.tenantId, `user:${a.id}`, "device.role", { id: deviceId, role, stations }));
  revalidatePath("/yonetim/cihazlar");
  return { savedAt: Date.now() };
}
