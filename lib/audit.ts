import type { Tx } from "@/db";
import { schema } from "@/db";

/** Denetim kaydı; withTenant işlemi içinde çağrılır. actor: "user:<id>" | "staff:<id>". */
export async function audit(tx: Tx, tenantId: string, actor: string, action: string, detail?: unknown) {
  await tx.insert(schema.auditLog).values({ tenantId, actor, action, detail: detail ?? null });
}
