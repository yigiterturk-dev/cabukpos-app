import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { adjustPoints, saveLoyaltySettings } from "@/lib/admin/loyalty-actions";
import { formatTL } from "@/lib/core/money";
import { buttonClass, Card, Empty, Field, Input, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const tl = (kurus: number) => (kurus / 100).toFixed(kurus % 100 === 0 ? 0 : 2);

export default async function Sadakat({ searchParams }: { searchParams: Promise<{ ok?: string; hata?: string; id?: string }> }) {
  const a = await requireAdmin();
  const { ok, hata, id } = await searchParams;
  const S = schema.loyaltySettings, E = schema.loyaltyEvents, C = schema.customers;
  const { settings, rows, events } = await withTenant(a.tenantId, async (tx) => {
    const [settings] = await tx.select().from(S).where(eq(S.tenantId, a.tenantId)).limit(1);
    const balance = sql<number>`coalesce(sum(${E.points}), 0)::int`;
    const rows = await tx
      .select({ customerId: C.id, name: C.name, phone: C.phone, points: balance })
      .from(C)
      .leftJoin(E, eq(E.customerId, C.id))
      .groupBy(C.id, C.name, C.phone)
      .having(sql`coalesce(sum(${E.points}), 0) <> 0`)
      .orderBy(desc(balance))
      .limit(100);
    const events = id
      ? await tx.select({ kind: E.kind, points: E.points, note: E.note, createdAt: E.createdAt }).from(E).where(eq(E.customerId, id)).orderBy(desc(E.createdAt)).limit(20)
      : [];
    return { settings, rows, events };
  });
  return (
    <>
      <PageHeader title="Sadakat puanı" desc="Müşteri harcaması puan kazanır; puan, sonraki satışta indirim olarak harcanır. Satış anı kazanım/harcanma kasa güncellemesine bağlıdır." />
      {ok && <div className="mb-6 rounded-[14px] border border-ok/30 bg-ok-soft px-4 py-3 text-sm text-ok">Kaydedildi.</div>}
      {hata && <div className="mb-6 rounded-[14px] border border-bad/30 bg-bad-soft px-4 py-3 text-sm text-bad">Eksik ya da geçersiz bilgi — kontrol edip yeniden deneyin.</div>}
      <section aria-label="Puan programı ayarları" className="mb-8">
        <Card className="p-5">
          <form action={saveLoyaltySettings} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
            <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2 lg:col-span-4">
              <input type="checkbox" name="enabled" defaultChecked={settings?.enabled ?? false} className="size-4 accent-brand" />
              Puan programı açık
            </label>
            <Field label="1 puan için gereken harcama (₺)" hint="Her bu kadar harcamaya 1 puan">
              <Input name="kurusPerPoint" inputMode="decimal" defaultValue={tl(settings?.kurusPerPoint ?? 10000)} required />
            </Field>
            <Field label="1 puanın indirimi (₺)" hint="Puan başına düşülecek tutar">
              <Input name="kurusPerRedeem" inputMode="decimal" defaultValue={tl(settings?.kurusPerRedeem ?? 100)} required />
            </Field>
            <Field label="En az harcanabilir puan" hint="Bu puanın altında indirim yapılmaz">
              <Input name="minRedeemPoints" inputMode="numeric" defaultValue={settings?.minRedeemPoints ?? 10} required />
            </Field>
            <button className={buttonClass("primary")}>Ayarları kaydet</button>
          </form>
        </Card>
      </section>
      {rows.length === 0 ? (
        <Empty>Puanı olan müşteri yok. Satışlarda puan kazanan müşteriler burada listelenir.</Empty>
      ) : (
        <Card className="divide-y divide-line">
          {rows.map((r) => (
            <div key={r.customerId} className="p-4">
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="font-medium">{r.name}</span>
                <span className="tabular text-sm text-muted">{r.phone}</span>
                <span className="tabular ml-auto font-semibold text-brand">{r.points} puan</span>
                <Link href={id === r.customerId ? "/yonetim/sadakat" : `/yonetim/sadakat?id=${r.customerId}`} className="text-sm text-brand underline">{id === r.customerId ? "Kapat" : "Puan işlemi"}</Link>
              </div>
              {id === r.customerId && (
                <div className="mt-3">
                  <form action={adjustPoints} className="mb-4 flex flex-wrap items-end gap-3">
                    <input type="hidden" name="customerId" value={r.customerId} />
                    <Field label="Puan ekle / düş (− ile)"><Input name="points" inputMode="numeric" className="w-32" required /></Field>
                    <Field label="Not"><Input name="note" className="w-64" /></Field>
                    <button className={buttonClass("primary")}>Uygula</button>
                  </form>
                  {events.length > 0 && (
                    <ul className="space-y-1 text-sm text-ink-2">
                      {events.map((e, i) => (
                        <li key={i} className="flex flex-wrap gap-2">
                          <span className="tabular w-20 text-muted">{e.createdAt.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" })}</span>
                          <span className={e.points >= 0 ? "text-ok" : "text-bad"}>{e.points >= 0 ? "+" : ""}{e.points}</span>
                          <span>{e.kind}{e.note ? ` · ${e.note}` : ""}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
      <p className="mt-4 text-xs text-muted">1 puan şu an {formatTL(settings?.kurusPerRedeem ?? 100)} indirim demek. Kasa güncellemesi gelene kadar puan yalnız buradan elle düzeltilebilir.</p>
    </>
  );
}
