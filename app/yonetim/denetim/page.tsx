import { desc } from "drizzle-orm";
import { ShieldCheck } from "lucide-react";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { Badge, Card, Empty, PageHeader, TABLE_HEAD } from "@/components/ui";

export const dynamic = "force-dynamic";
const dt = (d: Date) => d.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" });
const actor = (v: string) => v.startsWith("user:") ? `Kullanıcı · ${v.slice(5, 13)}` : v.startsWith("device:") ? `Cihaz · ${v.slice(7, 15)}` : v;

export default async function Denetim() {
  const a = await requireAdmin();
  const rows = await withTenant(a.tenantId, (tx) => tx.select({ id: schema.auditLog.id, actor: schema.auditLog.actor, action: schema.auditLog.action, detail: schema.auditLog.detail, at: schema.auditLog.createdAt }).from(schema.auditLog).orderBy(desc(schema.auditLog.createdAt)).limit(200));
  return (
    <>
      <PageHeader title="Denetim kayıtları" desc="İşletmenizdeki son yönetim, cihaz ve sistem işlemleri." />
      {rows.length === 0 ? <Empty icon={<ShieldCheck />}>Henüz denetim kaydı yok.</Empty> : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className={TABLE_HEAD}><tr><th className="px-4 py-2.5 font-medium">Zaman</th><th className="px-4 py-2.5 font-medium">Kaynak</th><th className="px-4 py-2.5 font-medium">İşlem</th><th className="px-4 py-2.5 font-medium">Detay</th></tr></thead>
            <tbody className="divide-y divide-line">{rows.map((r) => (
              <tr key={r.id} className="align-top transition-colors hover:bg-surface-2">
                <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">{dt(r.at)}</td>
                <td className="px-4 py-3"><Badge tone={r.actor.startsWith("device:") ? "brand" : "neutral"}>{actor(r.actor)}</Badge></td>
                <td className="px-4 py-3 font-medium">{r.action}</td>
                <td className="max-w-[520px] px-4 py-3 font-mono text-xs text-muted">
                  {r.detail ? (
                    <details className="max-w-[520px]">
                      <summary className="inline-flex max-w-full min-h-10 cursor-pointer items-center truncate rounded-lg px-2.5 outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60">{JSON.stringify(r.detail)}</summary>
                      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-2 p-2">{JSON.stringify(r.detail, null, 2)}</pre>
                    </details>
                  ) : "—"}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </Card>
      )}
    </>
  );
}
