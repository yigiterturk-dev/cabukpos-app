import Link from "next/link";
import { asc, count, sql } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { cookies } from "next/headers";
import { createStore, switchStore, updateStore } from "@/lib/admin/store-actions";
import { STORE_COOKIE } from "@/lib/admin/store-scope";
import { Badge, Card, Field, Input, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Subeler({ searchParams }: { searchParams: Promise<{ ok?: string; hata?: string; id?: string }> }) {
  const a = await requireAdmin();
  const { ok, hata, id } = await searchParams;
  const active = (await cookies()).get(STORE_COOKIE)?.value ?? null;
  const S = schema.stores;
  const { rows, deviceCount, salesCount } = await withTenant(a.tenantId, async (tx) => {
    const rows = await tx.select().from(S).orderBy(asc(S.createdAt));
    const ids = rows.map((r) => r.id);
    const deviceCount = ids.length ? await tx.select({ storeId: schema.devices.storeId, n: count() }).from(schema.devices).groupBy(schema.devices.storeId) : [];
    const since = sql<Date>`now() - interval '30 days'`;
    const salesCount = ids.length ? await tx.select({ storeId: schema.sales.storeId, n: count() }).from(schema.sales).where(sql`${schema.sales.createdAt} >= ${since}`).groupBy(schema.sales.storeId) : [];
    return { rows, deviceCount, salesCount };
  });
  const current = rows.find((r) => r.id === active) ?? rows[0] ?? null;
  return (
    <>
      <PageHeader title="Şubeler" desc="Stok, rapor ve bugün ekranı seçili şubeye bakar. Kasalar şubeye cihaz eşlemesiyle bağlanır; geçiş yalnız yönetim panelini etkiler." />
      {ok && <div className="mb-6 rounded-[14px] border border-ok/30 bg-ok-soft px-4 py-3 text-sm text-ok">Kaydedildi.</div>}
      {hata && <div className="mb-6 rounded-[14px] border border-bad/30 bg-bad-soft px-4 py-3 text-sm text-bad">Eksik ya da geçersiz bilgi — kontrol edip yeniden deneyin.</div>}
      {rows.length === 0 ? (
        <Card className="mb-8 p-8 text-center text-sm text-muted">Henüz şube yok. Aşağıdan ilk şubeyi oluşturun.</Card>
      ) : (
        <Card className="mb-8 divide-y divide-line">
          {rows.map((s) => (
            <div key={s.id} className="p-4">
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="font-medium">{s.name}</span>
                {current?.id === s.id && <Badge tone="brand">seçili</Badge>}
                <span className="tabular text-sm text-muted">{deviceCount.find((d) => d.storeId === s.id)?.n ?? 0} cihaz</span>
                <span className="tabular text-sm text-muted">30 günde {salesCount.find((d) => d.storeId === s.id)?.n ?? 0} satış</span>
                {s.id !== current?.id && (
                  <form action={switchStore} className="ml-auto">
                    <input type="hidden" name="storeId" value={s.id} />
                    <button className="text-sm text-brand underline">Bu şubeye geç</button>
                  </form>
                )}
                <Link href={id === s.id ? "/yonetim/subeler" : `/yonetim/subeler?id=${s.id}`} className={id === s.id ? "text-sm text-muted underline" : "ml-auto text-sm text-brand underline"}>{id === s.id ? "Kapat" : "Düzenle"}</Link>
              </div>
              {s.address && <div className="mt-0.5 text-sm text-muted">{s.address}</div>}
              {id === s.id && (
                <form action={updateStore} className="mt-3 flex flex-wrap items-end gap-3">
                  <input type="hidden" name="storeId" value={s.id} />
                  <Field label="Ad"><Input name="name" defaultValue={s.name} className="w-56" required /></Field>
                  <Field label="Adres"><Input name="address" defaultValue={s.address ?? ""} className="w-72" /></Field>
                  <button className="h-10 rounded-lg bg-brand px-4 text-sm font-semibold text-white">Kaydet</button>
                </form>
              )}
            </div>
          ))}
        </Card>
      )}
      <section aria-label="Yeni şube">
        <Card className="p-5">
          <form action={createStore} className="flex flex-wrap items-end gap-3">
            <Field label="Şube adı"><Input name="name" className="w-56" required /></Field>
            <Field label="Adres"><Input name="address" className="w-72" /></Field>
            <button className="h-10 rounded-lg bg-brand px-4 text-sm font-semibold text-white">Şube oluştur</button>
          </form>
        </Card>
      </section>
    </>
  );
}
