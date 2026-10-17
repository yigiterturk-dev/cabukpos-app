import Link from "next/link";
import { withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { scopedStoreId } from "@/lib/admin/store-scope";
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
  const storeId = await withTenant(a.tenantId, (tx) => scopedStoreId(tx, a.tenantId));
  const liste = storeId ? await bildirimler(a.tenantId, storeId) : [];
  const sirali = [...liste].sort((x, y) => {
    const oncelik = { bad: 0, warn: 1, info: 2 } as const;
    return oncelik[x.tone] - oncelik[y.tone] || new Date(y.at).getTime() - new Date(x.at).getTime();
  });
  const sayilar = {
    bad: liste.filter((b) => b.tone === "bad").length,
    warn: liste.filter((b) => b.tone === "warn").length,
    info: liste.filter((b) => b.tone === "info").length,
  };
  return (
    <>
      <PageHeader title="Bildirimler" desc="Onay bekleyen siparişler, geciken hazırlıklar, incelenecek satışlar ve mali uyarılar tek yerde. Canlı sorgu — sayfayı yenilemek yeterli." />
      {liste.length === 0 ? (
        <Empty>Her şey yolunda. Bekleyen bildirim yok.</Empty>
      ) : (
        <>
          <div role="group" aria-label="Bildirim özeti" className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-3 text-sm">
            <span className="mr-1 font-medium text-ink">Öncelik</span>
            <span className="rounded-full bg-bad-soft px-2.5 py-1 text-xs font-medium text-bad">{sayilar.bad} acil</span>
            <span className="rounded-full bg-warn-soft px-2.5 py-1 text-xs font-medium text-warn">{sayilar.warn} bekliyor</span>
            <span className="rounded-full bg-surface-3 px-2.5 py-1 text-xs font-medium text-muted">{sayilar.info} bilgi</span>
          </div>
          <Card className="divide-y divide-line p-0">
          {sirali.map((b) => (
            <Link key={b.id} href={b.href} data-testid={`notification-${b.id}`} className={`flex items-start gap-3 p-4 outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${b.tone === "bad" ? "bg-bad-soft/25" : ""}`}>
              <span className={`mt-0.5 rounded px-1.5 py-0.5 text-xs font-medium ${TONE[b.tone].cls}`}>{TONE[b.tone].label}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{b.title}</span>
                {b.desc && <span className="block truncate text-sm text-muted" title={b.desc}>{b.desc}</span>}
              </span>
              <span className="shrink-0 text-xs text-muted">{gun(b.at)} {saat(b.at)}</span>
            </Link>
          ))}
          </Card>
        </>
      )}
    </>
  );
}
