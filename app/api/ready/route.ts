// Readiness endpoint: trafik almaya hazır olmak için veritabanı erişimini de kontrol eder.
import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ ok: true, service: "cabukpos", checks: { database: "ok" } }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, service: "cabukpos", checks: { database: "failed" } }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
