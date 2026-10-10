// lib/brands.ts — Bulut mutfak: marka menüsü (public). Slug'la vitrin; seçki boşsa tüm menü (marka henüz ayarlanmamış vitrin boş kalmasın).
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import type { MenuData } from "./kiosk";

export type BrandMenuData = MenuData & { brand: string };

/** Marka slug kuralı: küçük harf, rakam, tire; 2–40. QR adresinde taşınır. */
export const isBrandSlug = (s: string) => /^[a-z0-9][a-z0-9-]{1,39}$/.test(s);

/** "Pideci No 2" → "pideci-no-2"; Türkçe harfler sadeleşir. */
export function slugify(name: string): string {
  return name.toLocaleLowerCase("tr").replaceAll("ı", "i").replaceAll("ğ", "g").replaceAll("ü", "u").replaceAll("ş", "s").replaceAll("ö", "o").replaceAll("ç", "c")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/g, "");
}

export async function menuByBrand(storeId: string, slug: string): Promise<BrandMenuData | null> {
  if (!/^[0-9a-f-]{36}$/i.test(storeId) || !isBrandSlug(slug)) return null;
  const rows = (await getDb().execute(sql`select public_menu_by_brand(${storeId}::uuid, ${slug}::text) as m`)) as unknown as { m: BrandMenuData | null }[];
  const m = rows[0]?.m ?? null;
  return m?.brand ? m : null; // slug eşleşmez/aktif değilse null → 404
}
