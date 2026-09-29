import Link from "next/link";
import { asc } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { deleteOptionGroup } from "@/lib/admin/salon-actions";
import { OptionGroupForm } from "@/components/admin/SalonForms";
import { formatTL } from "@/lib/core/money";
import { Card, Empty, PageHeader, Panel, SplitView } from "@/components/ui";

export const dynamic = "force-dynamic";
const rule = (min: number, max: number) => (min === 0 ? `isteğe bağlı, en çok ${max}` : min === max ? `zorunlu, ${min} seçim` : `${min}-${max} seçim`);

export default async function Secenekler({ searchParams }: { searchParams: Promise<{ duzenle?: string }> }) {
  const a = await requireAdmin();
  const { duzenle } = await searchParams;
  const [groups, opts] = await withTenant(a.tenantId, (tx) => Promise.all([
    tx.select().from(schema.optionGroups).orderBy(asc(schema.optionGroups.sort), asc(schema.optionGroups.name)),
    tx.select().from(schema.options).orderBy(asc(schema.options.sort)),
  ]));
  const full = groups.map((g) => ({ ...g, options: opts.filter((o) => o.groupId === g.id) }));
  const editing = full.find((g) => g.id === duzenle);
  return (
    <>
      <PageHeader title="Seçenekler" desc="Pişirme derecesi, ekstralar, porsiyon. Grubu ürün formundan ürüne bağlayın; kasada ürüne dokununca sorulur." />
      <SplitView
        panel={
          <Panel title={editing ? `Düzenle: ${editing.name}` : "Seçenek grubu ekle"} tone={editing ? "edit" : undefined} action={editing && <Link href="/yonetim/secenekler" className="text-sm text-muted hover:text-ink hover:underline">Vazgeç</Link>}>
            <OptionGroupForm key={editing?.id ?? "yeni"} initial={editing && { id: editing.id, name: editing.name, min: editing.min, max: editing.max, options: editing.options.map((o) => ({ name: o.name, delta: o.delta })) }} />
          </Panel>
        }
        list={<>
      {full.length === 0 ? <Empty>Henüz seçenek grubu yok.</Empty> : (
        <Card className="divide-y divide-line">
          {full.map((g) => (
            <div key={g.id} className="flex flex-wrap items-start gap-3 p-4">
              <div>
                <div className="font-medium">{g.name} <span className="text-sm font-normal text-muted">· {rule(g.min, g.max)}</span></div>
                <div className="mt-1 text-sm text-ink-2">{g.options.map((o) => (o.delta ? `${o.name} (${o.delta > 0 ? "+" : "−"}${formatTL(Math.abs(o.delta))})` : o.name)).join(" · ")}</div>
              </div>
              <div className="ml-auto flex gap-4 text-sm">
                <Link href={`/yonetim/secenekler?duzenle=${g.id}`} className="font-medium text-brand hover:underline">Düzenle</Link>
                <form action={deleteOptionGroup.bind(null, g.id)}><button className="text-bad hover:underline">Sil</button></form>
              </div>
            </div>
          ))}
        </Card>
      )}
        </>}
      />
    </>
  );
}
