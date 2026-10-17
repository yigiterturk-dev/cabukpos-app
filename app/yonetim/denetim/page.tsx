import Link from "next/link";
import { count, desc } from "drizzle-orm";
import { ShieldCheck } from "lucide-react";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { Badge, Card, Empty, PageHeader, TABLE_HEAD } from "@/components/ui";
import { HorizontalScrollRegion } from "@/components/HorizontalScrollRegion";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;
const dt = (d: Date) => d.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" });
const actor = (v: string) => v.startsWith("user:") ? `Kullanıcı · ${v.slice(5, 13)}` : v.startsWith("device:") ? `Cihaz · ${v.slice(7, 15)}` : v;

export default async function Denetim({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const a = await requireAdmin();
  const { page } = await searchParams;
  const requestedPage = Number(page);
  const pageNo = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const { rows, total } = await withTenant(a.tenantId, async (tx) => {
    const [{ total }] = await tx.select({ total: count() }).from(schema.auditLog);
    const safePage = Math.min(pageNo, Math.max(1, Math.ceil(total / PAGE_SIZE)));
    const rows = await tx.select({ id: schema.auditLog.id, actor: schema.auditLog.actor, action: schema.auditLog.action, detail: schema.auditLog.detail, at: schema.auditLog.createdAt }).from(schema.auditLog).orderBy(desc(schema.auditLog.createdAt)).limit(PAGE_SIZE).offset((safePage - 1) * PAGE_SIZE);
    return { rows, total };
  });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(pageNo, pageCount);
  const firstItem = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const lastItem = Math.min(currentPage * PAGE_SIZE, total);
  return (
    <>
      <PageHeader title="Denetim kayıtları" desc="İşletmenizdeki son yönetim, cihaz ve sistem işlemleri." />
      {rows.length === 0 ? <Empty icon={<ShieldCheck />}>Henüz denetim kaydı yok.</Empty> : (
        <>
        <p className="mb-3 text-sm text-muted">{firstItem}–{lastItem} / {total} denetim kaydı</p>
        <Card className="overflow-hidden lg:hidden">
          <ul aria-label="Denetim kayıtları" className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className="space-y-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><time dateTime={r.at.toISOString()} className="text-xs text-muted">{dt(r.at)}</time><Badge tone={r.actor.startsWith("device:") ? "brand" : "neutral"}>{actor(r.actor)}</Badge></div>
                <p className="break-words font-medium">{r.action}</p>
                {r.detail ? <details className="text-xs">
                  <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-lg px-2.5 text-brand outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60">Ayrıntıları göster</summary>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-2 p-3 font-mono text-xs text-muted">{JSON.stringify(r.detail, null, 2)}</pre>
                </details> : <span className="text-xs text-muted">Ayrıntı yok</span>}
              </li>
            ))}
          </ul>
        </Card>
        <Card className="hidden p-0 lg:block">
          <HorizontalScrollRegion label="Denetim kayıtları, yatay kaydırılabilir" className="rounded-2xl">
          <table aria-label="Denetim kayıtları" className="w-full min-w-[720px] text-sm">
            <thead className={TABLE_HEAD}><tr><th scope="col" className="px-4 py-2.5 font-medium">Zaman</th><th scope="col" className="px-4 py-2.5 font-medium">Kaynak</th><th scope="col" className="px-4 py-2.5 font-medium">İşlem</th><th scope="col" className="px-4 py-2.5 font-medium">Detay</th></tr></thead>
            <tbody className="divide-y divide-line">{rows.map((r) => (
              <tr key={r.id} className="align-top transition-colors hover:bg-surface-2">
                <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">{dt(r.at)}</td>
                <td className="px-4 py-3"><Badge tone={r.actor.startsWith("device:") ? "brand" : "neutral"}>{actor(r.actor)}</Badge></td>
                <td className="px-4 py-3 font-medium">{r.action}</td>
                <td className="max-w-[520px] px-4 py-3 font-mono text-xs text-muted">
                  {r.detail ? (
                    <details className="max-w-[520px]">
                      <summary className="inline-flex max-w-full min-h-11 cursor-pointer items-center truncate rounded-lg px-2.5 outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60">Ayrıntıları göster</summary>
                      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-2 p-2">{JSON.stringify(r.detail, null, 2)}</pre>
                    </details>
                  ) : "—"}
                </td>
              </tr>
            ))}</tbody>
          </table>
          </HorizontalScrollRegion>
        </Card>
        {pageCount > 1 && <nav aria-label="Denetim kayıtları sayfaları" className="mt-4 flex items-center justify-between gap-3">
          {currentPage > 1 ? <Link href={`/yonetim/denetim?page=${currentPage - 1}`} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm underline outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60">Önceki</Link> : <span />}
          <span className="text-sm text-muted">Sayfa {currentPage} / {pageCount}</span>
          {currentPage < pageCount ? <Link href={`/yonetim/denetim?page=${currentPage + 1}`} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm underline outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60">Sonraki</Link> : <span />}
        </nav>}
        </>
      )}
    </>
  );
}
