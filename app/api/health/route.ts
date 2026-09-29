// Liveness endpoint: process ayakta mı? Veritabanına bağlanmaz.
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ ok: true, service: "cabukpos" }, { headers: { "Cache-Control": "no-store" } });
}
