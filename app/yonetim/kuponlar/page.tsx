import { desc } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { createCoupon, setCouponStatus } from "@/lib/admin/loyalty-actions";
import { Badge, buttonClass, Card, Field, Input, PageHeader } from "@/components/ui";
import { Select } from "@/components/Select";
import { moneyFormatter, tenantCurrency } from "@/lib/admin/currency";

export const dynamic = "force-dynamic";

const kindLabel = { yuzde: "Yüzde", tutar: "Tutar", teslimat: "Teslimat bedava" } as const;
const valueLabel = (c: typeof schema.coupons.$inferSelect, money: (k: number) => string) =>
  c.kind === "yuzde" ? `%${c.value}` : c.kind === "tutar" ? money(c.value) : "kargo";

export default async function Kuponlar({ searchParams }: { searchParams: Promise<{ ok?: string; hata?: string }> }) {
  const a = await requireAdmin();
  const money = await moneyFormatter(a.tenantId);
  const currency = await tenantCurrency(a.tenantId);
  const unit = currency === "TRY" ? "₺" : currency;
  const { ok, hata } = await searchParams;
  const rows = await withTenant(a.tenantId, (tx) => tx.select().from(schema.coupons).orderBy(desc(schema.coupons.createdAt)).limit(100));
  return (
    <>
      <PageHeader title="Kuponlar" desc="Kod, sepette indirime dönüşür: yüzde, sabit tutar ya da teslimat bedava. Kullanımlar satış anında kayda geçer; bir satışta bir kupon." />
      {ok && <div className="mb-6 rounded-[14px] border border-ok/30 bg-ok-soft px-4 py-3 text-sm text-ok">Kaydedildi.</div>}
      {hata && <div className="mb-6 rounded-[14px] border border-bad/30 bg-bad-soft px-4 py-3 text-sm text-bad">Eksik ya da geçersiz bilgi — kontrol edip yeniden deneyin.</div>}
      <section aria-label="Yeni kupon" className="mb-8">
        <Card className="p-5">
          <form action={createCoupon} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Kod" hint="Boş bırakılırsa üretilmez — zorunlu; harf/rakam">
              <Input name="code" placeholder="YAZ20" required className="uppercase" />
            </Field>
            <Field label="Tür">
              <Select name="kind" defaultValue="yuzde" options={[
                { value: "yuzde", label: "Yüzde indirim" },
                { value: "tutar", label: "Sabit tutar" },
                { value: "teslimat", label: "Teslimat bedava" },
              ]} />
            </Field>
            <Field label="Değer" hint={`Yüzde: 1-100 · Tutar: ${unit}`}>
              <Input name="value" inputMode="numeric" required />
            </Field>
            <Field label={`Alt sınır (${unit})`} hint="Sepet en az bu kadar olmalı">
              <Input name="minSubtotal" inputMode="decimal" defaultValue="0" />
            </Field>
            <Field label={`Üst sınır (${unit})`} hint="Yalnız yüzde için; boş = sınırsız">
              <Input name="maxDiscount" inputMode="decimal" />
            </Field>
            <Field label="Başlangıç"><Input name="startsAt" type="date" /></Field>
            <Field label="Bitiş"><Input name="endsAt" type="date" /></Field>
            <Field label="Toplam kullanım limiti" hint="Boş = sınırsız">
              <Input name="usageLimit" inputMode="numeric" />
            </Field>
            <Field label="Müşteri başına limit">
              <Input name="perCustomerLimit" inputMode="numeric" defaultValue="1" />
            </Field>
            <Field label="Not"><Input name="note" className="sm:col-span-2" /></Field>
            <button className={`${buttonClass("primary")} self-end`}>Kupon oluştur</button>
          </form>
        </Card>
      </section>
      {rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">Henüz kupon yok. Yukarıdan ilk kuponu oluşturun.</Card>
      ) : (
        <Card className="divide-y divide-line">
          {rows.map((c) => (
            <div key={c.id} className="flex min-w-0 flex-wrap items-center gap-3 p-4">
              <span className="shrink-0 font-mono font-semibold">{c.code}</span>
              <Badge tone={c.status === "acik" ? "ok" : "neutral"}>{c.status === "acik" ? "açık" : "kapalı"}</Badge>
              <span className="min-w-0 flex-1 break-words text-sm">{kindLabel[c.kind]} · {valueLabel(c, money)}</span>
              {c.minSubtotal > 0 && <span className="shrink-0 text-sm text-muted">min {money(c.minSubtotal)}</span>}
              {c.maxDiscount !== null && <span className="shrink-0 text-sm text-muted">üst {money(c.maxDiscount)}</span>}
              {c.endsAt && <span className="shrink-0 text-sm text-muted">bitiş {c.endsAt.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" })}</span>}
              <span className="shrink-0 tabular text-sm text-muted">
                {c.usedCount}{c.usageLimit !== null ? ` / ${c.usageLimit}` : ""} kullanım
              </span>
              <form action={setCouponStatus} className="ml-auto shrink-0">
                <input type="hidden" name="couponId" value={c.id} />
                <input type="hidden" name="status" value={c.status === "acik" ? "kapali" : "acik"} />
                <button className="inline-flex min-h-10 items-center rounded-lg px-2.5 text-sm text-brand outline-none hover:bg-brand-soft hover:underline focus-visible:ring-4 focus-visible:ring-brand-ring/60">{c.status === "acik" ? "Kapat" : "Aç"}</button>
              </form>
            </div>
          ))}
        </Card>
      )}
      <p className="mt-4 text-xs text-muted">Kuponun sepette işlenmesi kasa güncellemesine bağlıdır; bu sayfa yönetim tarafını kapsar.</p>
    </>
  );
}
