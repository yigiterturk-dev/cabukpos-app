import Link from "next/link";
import { asc } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { bildirimler, type Bildirim } from "@/lib/admin/bildirim";
import { Card, Empty, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const TONE: Record<Bildirim["tone"], { cls: string; label: string }> = {
  bad: { cls: "bg-bad-soft text-bad", label: "Acil" },
  warn: { cls: "bg-warn-soft text-warn", label: "Bekliyor" },
  info: { cls: "bg-surface-3 text-muted", label: "Bilgi" },
};
const saat = (at: string) => new Date(at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
const gun = (at: string) => new Date(at).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });

export default async function Bildirimler() {
  const a = await requireAdmin();
  const [store] = await withTenant(a.tenantId, (tx) => tx.select({ id: schema.stores.id }).from(schema.stores).orderBy(asc(schema.stores.createdAt)).limit(1));
  const liste = store ? await bildirimler(a.tenantId, store.id) : [];
  return (
    <>
      <PageHeader title="Bildirimler" desc="Onay bekleyen siparişler, geciken hazırlıklar, incelenecek satışlar ve mali uyarılar tek yerde. Canlı sorgu — sayfayı yenilemek yeterli." />
      {liste.length === 0 ? (
        <Empty>Her şey yolunda. Bekleyen bildirim yok.</Empty>
      ) : (
        <Card className="divide-y divide-line p-0">
          {liste.map((b) => (
            <Link key={b.id} href={b.href} className="flex items-start gap-3 p-4 outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60">
              <span className={`mt-0.5 rounded px-1.5 py-0.5 text-xs font-medium ${TONE[b.tone].cls}`}>{TONE[b.tone].label}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{b.title}</span>
                {b.desc && <span className="block truncate text-sm text-muted">{b.desc}</span>}
              </span>
              <span className="shrink-0 text-xs text-muted">{gun(b.at)} {saat(b.at)}</span>
            </Link>
          ))}
        </Card>
      )}
    </>
  );
}
