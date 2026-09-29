import { sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

/** Anahtar başına kayan pencere sayacı (DB'de, sunucusuz örnekler arasında ortak). Yeni sayıyı döner. */
export async function hit(key: string, windowMinutes = 15): Promise<number> {
  const t = schema.loginAttempts;
  const win = sql.raw(`interval '${Math.max(1, Math.floor(windowMinutes))} minutes'`);
  const [r] = await getDb()
    .insert(t)
    .values({ key, n: 1 })
    .onConflictDoUpdate({
      target: t.key,
      set: {
        n: sql`case when ${t.since} < now() - ${win} then 1 else ${t.n} + 1 end`,
        since: sql`case when ${t.since} < now() - ${win} then now() else ${t.since} end`,
      },
    })
    .returning({ n: t.n });
  return r.n;
}

export async function clientIp(): Promise<string> {
  const { headers } = await import("next/headers"); // dinamik: hit() Next dışında (node testleri) da yüklenebilsin
  return ((await headers()).get("x-forwarded-for") ?? "").split(",")[0].trim() || "yerel";
}
