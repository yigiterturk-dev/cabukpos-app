import { desc } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { createCoupon, setCouponStatus } from "@/lib/admin/loyalty-actions";
import { Badge, Card, Field, Input, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const kindLabel = { yuzde: "Yüzde", tutar: "Tutar", teslimat: "Teslimat bedava" } as const;
const valueLabel = (c: typeof schema.coupons.$inferSelect) =>
  c.kind === "yuzde" ? `%${c.value}` : c.kind === "tutar" ? `${(c.value / 100).toLocaleString("tr-TR")} ₺` : "kargo";

export default async function Kuponlar({ searchParams }: { searchParams: Promise<{ ok?: string; hata?: string }> }) {
  const a = await requireAdmin();
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
              <select name="kind" className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm">
                <option value="yuzde">Yüzde indirim</option>
                <option value="tutar">Sabit tutar</option>
                <option value="teslimat">Teslimat bedava</option>
              </select>
            </Field>
            <Field label="Değer" hint="Yüzde: 1-100 · Tutar: ₺">
              <Input name="value" inputMode="numeric" required />
            </Field>
            <Field label="Alt sınır (₺)" hint="Sepet en az bu kadar olmalı">
              <Input name="minSubtotal" inputMode="decimal" defaultValue="0" />
            </Field>
            <Field label="Üst sınır (₺)" hint="Yalnız yüzde için; boş = sınırsız">
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
            <button className="h-10 self-end rounded-lg bg-brand px-4 text-sm font-semibold text-white">Kupon oluştur</button>
          </form>
        </Card>
      </section>
      {rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">Henüz kupon yok. Yukarıdan ilk kuponu oluşturun.</Card>
      ) : (
        <Card className="divide-y divide-line">
          {rows.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 p-4">
              <span className="font-mono font-semibold">{c.code}</span>
              <Badge tone={c.status === "acik" ? "ok" : "neutral"}>{c.status === "acik" ? "açık" : "kapalı"}</Badge>
              <span className="text-sm">{kindLabel[c.kind]} · {valueLabel(c)}</span>
              {c.minSubtotal > 0 && <span className="text-sm text-muted">min {(c.minSubtotal / 100).toLocaleString("tr-TR")} ₺</span>}
              {c.maxDiscount !== null && <span className="text-sm text-muted">üst {(c.maxDiscount / 100).toLocaleString("tr-TR")} ₺</span>}
              {c.endsAt && <span className="text-sm text-muted">bitiş {c.endsAt.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" })}</span>}
              <span className="tabular text-sm text-muted">
                {c.usedCount}{c.usageLimit !== null ? ` / ${c.usageLimit}` : ""} kullanım
              </span>
              <form action={setCouponStatus} className="ml-auto">
                <input type="hidden" name="couponId" value={c.id} />
                <input type="hidden" name="status" value={c.status === "acik" ? "kapali" : "acik"} />
                <button className="text-sm text-brand underline">{c.status === "acik" ? "Kapat" : "Aç"}</button>
              </form>
            </div>
          ))}
        </Card>
      )}
      <p className="mt-4 text-xs text-muted">Kuponun sepette işlenmesi kasa güncellemesine bağlıdır; bu sayfa yönetim tarafını kapsar.</p>
    </>
  );
}
