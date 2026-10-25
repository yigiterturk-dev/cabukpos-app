import Link from "next/link";
import { asc, desc } from "drizzle-orm";
import { UserPlus } from "lucide-react";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { StaffActiveForm, StaffForm } from "@/components/admin/StaffDeviceForms";
import { Badge, Card, Empty, TABLE_HEAD, buttonClass } from "@/components/ui";
import { ListWorkspace } from "@/components/admin/ListWorkspace";
import { HorizontalScrollRegion } from "@/components/HorizontalScrollRegion";

export const dynamic = "force-dynamic";

export default async function Personel({ searchParams }: { searchParams: Promise<{ duzenle?: string }> }) {
  const a = await requireAdmin();
  const { duzenle } = await searchParams;
  const rows = await withTenant(a.tenantId, (tx) => tx.select({ id: schema.staff.id, name: schema.staff.name, role: schema.staff.role, permissions: schema.staff.permissions, active: schema.staff.active }).from(schema.staff).orderBy(desc(schema.staff.active), asc(schema.staff.name)));
  const editing = rows.find((r) => r.id === duzenle);
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2"><Link href="/yonetim/personel-plan" className={buttonClass("secondary")}>Vardiya planı ve görev takibi →</Link><Link href="/yonetim/devam" className={buttonClass("secondary")}>Gerçek giriş / çıkış →</Link></div>
      <ListWorkspace key={editing?.id ?? "new"} title="Personel" description="Kasada PIN ile giriş yapanlar. PIN kişiye özeldir; iki aktif kişide aynı olamaz." editing={Boolean(editing)} closeHref="/yonetim/personel" panels={[
        { id: "staff", label: "Personel ekle", title: editing ? `Düzenle: ${editing.name}` : "Personel ekle", content: <StaffForm key={editing?.id ?? "yeni"} initial={editing} /> },
      ]}>
      {rows.length === 0 ? <Empty icon={<UserPlus aria-hidden className="size-8" />}>Henüz personel yok. Formdan ilk personeli ekleyin ve kasiyere PIN verin — kasa vardiyası bu PIN ile açılır.</Empty> : (
        <>
        <Card className="overflow-hidden lg:hidden">
          <ul aria-label="Personel listesi" className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className={`space-y-3 p-4 ${r.id === duzenle ? "bg-brand-soft/45" : ""} ${r.active ? "" : "opacity-70"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="break-words font-medium">{r.name}</p><p className="mt-1 text-sm text-muted">{r.role === "mudur" ? "Müdür" : r.role === "garson" ? "Garson" : r.role === "kurye" ? "Kurye" : "Kasiyer"}</p></div>
                  {r.active ? <Badge tone="ok">Aktif</Badge> : <Badge>Pasif</Badge>}
                </div>
                <div className="flex flex-wrap items-center gap-1 border-t border-line pt-2">
                  <Link href={`/yonetim/personel?duzenle=${r.id}`} aria-label={`Düzenle: ${r.name}`} className="inline-flex min-h-11 items-center rounded-lg px-3 font-medium text-brand outline-none hover:bg-brand-soft hover:underline focus-visible:ring-4 focus-visible:ring-brand-ring/60">Düzenle</Link>
                  <StaffActiveForm id={r.id} active={r.active} name={r.name} className="inline-flex" />
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="hidden p-0 lg:block">
          <HorizontalScrollRegion label="Personel listesi, yatay kaydırılabilir" className="rounded-2xl">
          <table aria-label="Personel listesi" className="w-full min-w-[620px] text-sm">
            <thead className={TABLE_HEAD}><tr><th scope="col" className="px-4 py-2.5 font-medium">Ad</th><th scope="col" className="px-4 py-2.5 font-medium">Rol</th><th scope="col" className="px-4 py-2.5 font-medium">Durum</th><th scope="col" className="px-4 py-2.5 text-right font-medium">Aksiyonlar</th></tr></thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className={`${r.id === duzenle ? "bg-brand-soft/45" : "hover:bg-surface-2"} ${r.active ? "" : "opacity-60"}`}>
                  <td className="max-w-[18rem] px-4 py-2.5 font-medium"><span className="block truncate" title={r.name}>{r.name}</span></td>
                  <td className="px-4 py-2.5">{r.role === "mudur" ? "Müdür" : r.role === "garson" ? "Garson" : r.role === "kurye" ? "Kurye" : "Kasiyer"}</td>
                  <td className="px-4 py-2.5">{r.active ? <Badge tone="ok">Aktif</Badge> : <Badge>Pasif</Badge>}</td>
                  <td className={`whitespace-nowrap px-4 py-2.5 text-right ${r.id === duzenle ? "bg-brand-soft/90" : "bg-surface"}`}>
                    <Link href={`/yonetim/personel?duzenle=${r.id}`} aria-label={`Düzenle: ${r.name}`} className="mr-1 inline-flex min-h-11 items-center rounded-lg px-2 font-medium text-brand outline-none hover:bg-brand-soft hover:underline focus-visible:ring-4 focus-visible:ring-brand-ring/60">Düzenle</Link>
                    <StaffActiveForm id={r.id} active={r.active} name={r.name} className="inline" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </HorizontalScrollRegion>
        </Card>
        </>
      )}
      </ListWorkspace>
    </>
  );
}
