import Link from "next/link";
import { asc } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { deleteOptionGroup } from "@/lib/admin/salon-actions";
import { OptionGroupForm } from "@/components/admin/SalonForms";
import { ConfirmActionForm } from "@/components/admin/ConfirmActionForm";
import { moneyFormatter } from "@/lib/admin/currency";
import { tenantCurrency } from "@/lib/admin/currency";
import { currencySymbol } from "@/lib/core/money";
import { buttonClass, Card, Empty, PageHeader, Panel, SplitView } from "@/components/ui";

export const dynamic = "force-dynamic";
const rule = (min: number, max: number) => (min === 0 ? `isteğe bağlı, en çok ${max}` : min === max ? `zorunlu, ${min} seçim` : `${min}-${max} seçim`);

export default async function Secenekler({ searchParams }: { searchParams: Promise<{ duzenle?: string }> }) {
  const a = await requireAdmin();
  const money = await moneyFormatter(a.tenantId);
  const currencyUnit = currencySymbol(await tenantCurrency(a.tenantId));
  const { duzenle } = await searchParams;
  const [groups, opts] = await withTenant(a.tenantId, (tx) => Promise.all([
    tx.select().from(schema.optionGroups).orderBy(asc(schema.optionGroups.sort), asc(schema.optionGroups.name)),
    tx.select().from(schema.options).orderBy(asc(schema.options.sort)),
  ]));
  const full = groups.map((g) => ({ ...g, options: opts.filter((o) => o.groupId === g.id) }));
  const editing = full.find((g) => g.id === duzenle);
  return (
    <>
      <PageHeader title="Ürün seçenekleri" desc="Pişirme derecesi, ekstralar, porsiyon. Grubu ürün formundan ürüne bağlayın; kasada ürüne dokununca sorulur." />
      <SplitView
        panel={
          <Panel title={editing ? `Düzenle: ${editing.name}` : "Seçenek grubu ekle"} tone={editing ? "edit" : undefined} action={editing && <Link href="/yonetim/secenekler" className="inline-flex min-h-11 items-center rounded px-2 text-sm text-muted outline-none hover:text-ink hover:underline focus-visible:ring-4 focus-visible:ring-brand-ring/60">Vazgeç</Link>}>
            <OptionGroupForm key={editing?.id ?? "yeni"} currencyUnit={currencyUnit} initial={editing && { id: editing.id, name: editing.name, min: editing.min, max: editing.max, options: editing.options.map((o) => ({ name: o.name, delta: o.delta })) }} />
          </Panel>
        }
        list={<>
      {full.length === 0 ? <Empty>Henüz seçenek grubu yok.</Empty> : (
        <Card className="divide-y divide-line">
          {full.map((g) => (
            <div key={g.id} className="flex min-w-0 flex-wrap items-start gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="break-words font-medium">{g.name} <span className="text-sm font-normal text-muted">· {rule(g.min, g.max)}</span></div>
                <div className="mt-1 break-words text-sm text-ink-2">{g.options.map((o) => (o.delta ? `${o.name} (${o.delta > 0 ? "+" : "−"}${money(Math.abs(o.delta))})` : o.name)).join(" · ")}</div>
              </div>
              <div className="ml-auto flex shrink-0 flex-wrap gap-4 text-sm">
                <Link href={`/yonetim/secenekler?duzenle=${g.id}`} aria-label={`Düzenle: ${g.name}`} className={buttonClass("secondary", "sm")}>Düzenle</Link>
                <ConfirmActionForm action={deleteOptionGroup.bind(null, g.id)} ariaLabel={`Sil: ${g.name}`} label="Sil" prompt={`“${g.name}” seçenek grubu silinecek. Bağlı ürün seçeneklerini etkileyebilir. Devam etmek istiyor musunuz?`} className={buttonClass("danger", "sm")} />
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
