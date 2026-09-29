import Link from "next/link";
import { asc, desc } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { setStaffActive } from "@/lib/admin/staff-actions";
import { StaffForm } from "@/components/admin/StaffDeviceForms";
import { Badge, Card, Empty, PageHeader, Panel, SplitView, TABLE_HEAD } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Personel({ searchParams }: { searchParams: Promise<{ duzenle?: string }> }) {
  const a = await requireAdmin();
  const { duzenle } = await searchParams;
  const rows = await withTenant(a.tenantId, (tx) => tx.select({ id: schema.staff.id, name: schema.staff.name, role: schema.staff.role, active: schema.staff.active }).from(schema.staff).orderBy(desc(schema.staff.active), asc(schema.staff.name)));
  const editing = rows.find((r) => r.id === duzenle);
  return (
    <>
      <PageHeader title="Personel" desc="Kasada PIN ile giriş yapanlar. PIN kişiye özeldir; iki aktif kişide aynı olamaz." />
      <SplitView
        panel={
          <Panel title={editing ? `Düzenle: ${editing.name}` : "Personel ekle"} tone={editing ? "edit" : undefined} action={editing && <Link href="/yonetim/personel" className="text-sm text-muted hover:text-ink hover:underline">Vazgeç</Link>}>
            <StaffForm key={editing?.id ?? "yeni"} initial={editing} />
          </Panel>
        }
        list={<>
      {rows.length === 0 ? <Empty>Henüz personel yok.</Empty> : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className={TABLE_HEAD}><tr><th className="px-4 py-2.5 font-medium">Ad</th><th className="px-4 py-2.5 font-medium">Rol</th><th className="px-4 py-2.5 font-medium">Durum</th><th className="px-4 py-2.5" /></tr></thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className={r.active ? "" : "opacity-60"}>
                  <td className="px-4 py-2.5 font-medium">{r.name}</td>
                  <td className="px-4 py-2.5">{r.role === "mudur" ? "Müdür" : r.role === "garson" ? "Garson" : r.role === "kurye" ? "Kurye" : "Kasiyer"}</td>
                  <td className="px-4 py-2.5">{r.active ? <Badge tone="ok">Aktif</Badge> : <Badge>Pasif</Badge>}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right">
                    <Link href={`/yonetim/personel?duzenle=${r.id}`} className="mr-3 font-medium text-brand hover:underline">Düzenle</Link>
                    <form action={setStaffActive.bind(null, r.id, !r.active)} className="inline"><button className="text-muted hover:text-ink hover:underline">{r.active ? "Pasifleştir" : "Aktifleştir"}</button></form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
        </>}
      />
    </>
  );
}
