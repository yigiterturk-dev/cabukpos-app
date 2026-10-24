import { withTenant } from "@/db";
import { requireApiAdmin } from "@/lib/auth/api";
import { transferDocument } from "@/lib/admin/transfer-document";
import { transferCsv } from "@/lib/core/transfer-document";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireApiAdmin(req);
  if (!gate.ok) return gate.res;
  const { id } = await params;
  const doc = await withTenant(gate.admin.tenantId, (tx) => transferDocument(tx, gate.admin, id));
  if (!doc) return new Response("Transfer bulunamadı.", { status: 404, headers: { "cache-control": "no-store" } });
  return new Response(transferCsv(doc), { headers: {
    "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="cabukpos-transfer-${doc.id}.csv"`,
    "cache-control": "no-store", "x-content-type-options": "nosniff",
  } });
}
