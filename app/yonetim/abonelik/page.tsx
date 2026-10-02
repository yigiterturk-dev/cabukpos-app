import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { formatTL } from "@/lib/core/money";
import { PERIODS, STATE_LABEL, planBreakdown } from "@/lib/core/billing";
import { unitPrices, salesContact } from "@/lib/billing/plans";
import { getBillingProvider } from "@/lib/billing/provider";
import { paymentsOf, tenantUnits } from "@/lib/billing/service";
import { startCheckout } from "@/lib/billing/actions";
import { Badge, Card, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
const day = (d: Date) => d.toLocaleDateString("tr-TR", { dateStyle: "long", timeZone: "Europe/Istanbul" });
const STATUS: Record<string, string> = { bekliyor: "Bekliyor", odendi: "Ödendi", basarisiz: "Başarısız" };

export default async function Abonelik({ searchParams }: { searchParams: Promise<{ kilit?: string; sonuc?: string }> }) {
  const a = await requireAdmin();
  const sp = await searchParams;
  const b = a.billing, provider = getBillingProvider(), contact = salesContact();
  const pays = await paymentsOf(a.tenantId), units = await tenantUnits(a.tenantId);
  return (
    <>
      <PageHeader title="Abonelik" desc="ÇabukPOS aboneliği. Abonelik bitse de kasa satışa devam eder; yalnız yönetim salt okunur olur." />
      {sp.kilit && b.locked && <Card className="mb-4 border-red-200 bg-bad-soft p-4 text-sm text-bad" role="alert">Abonelik sona erdiği için değişiklik yapılamıyor. Ödeme yapınca yönetim hemen açılır.</Card>}
      {sp.sonuc === "ok" && <Card className="mb-4 border-emerald-200 bg-ok-soft p-4 text-sm text-ok" role="status">Ödeme alındı, teşekkürler.</Card>}
      {sp.sonuc === "isleniyor" && <Card className="mb-4 border-amber-200 bg-warn-soft p-4 text-sm text-warn" role="status">Ödeme işleniyor; banka onayı gelince abonelik birkaç saniye içinde uzar. Sayfayı yenileyebilirsin.</Card>}
      {sp.sonuc === "telefon" && <Card className="mb-4 border-red-200 bg-bad-soft p-4 text-sm text-bad" role="alert">Kartla ödeme için geçerli bir cep telefonu gir.</Card>}
      {sp.sonuc === "hata" && <Card className="mb-4 border-red-200 bg-bad-soft p-4 text-sm text-bad" role="alert">Ödeme tamamlanamadı. Tekrar deneyebilirsin.</Card>}
      <Card className="mb-6 flex flex-wrap items-center gap-3 p-4">
        <Badge tone={b.locked ? "bad" : b.warn ? "warn" : "ok"}><span data-testid="billing-state">{STATE_LABEL[b.state]}</span></Badge>
        <span className="text-sm" data-testid="billing-ends">
          {b.state === "deneme" || b.state === "aktif" ? `Bitiş: ${day(b.endsAt)} (${b.daysLeft} gün)` : `Bitti: ${day(b.endsAt)} · salt okunur: ${day(b.lockAt)}`}
        </span>
        {provider?.test && <Badge tone="warn">TEST ödeme</Badge>}
        <span className="text-sm text-muted" data-testid="billing-units">{units.stores} şube · {units.devices} terminal</span>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        {PERIODS.map((p) => {
          const u = unitPrices(p.key), bd = u ? planBreakdown(u, units) : null;
          return (
            <Card key={p.key} className="p-4">
              <h2 className="font-semibold">{p.label}</h2>
              <div className="my-2 text-2xl font-semibold tabular-nums">{bd ? formatTL(bd.total) : "—"}</div>
              {bd && (bd.extraStores > 0 || bd.extraDevices > 0) && (
                <p className="mb-2 text-xs text-muted" data-testid={`breakdown-${p.key}`}>
                  Taban {formatTL(bd.base)}
                  {bd.extraStores > 0 && ` + ${units.stores - 1} ek şube (${formatTL(bd.extraStores)})`}
                  {bd.extraDevices > 0 && ` + ${units.devices - 1} ek terminal (${formatTL(bd.extraDevices)})`}
                </p>
              )}
              {provider && bd ? (
                <form action={startCheckout}>
                  <input type="hidden" name="period" value={p.key} />
                  {provider.name === "paytr" && <input name="phone" type="tel" required minLength={10} placeholder="Cep telefonu (05…)" autoComplete="tel" className="mb-2 w-full rounded-lg border border-line px-3 py-2 text-sm" />}
                  <button className="w-full rounded-lg bg-brand py-2.5 font-medium text-white">{p.label} öde</button>
                  <p className="mt-2 text-xs text-muted">Ödeyerek <Link href="/yasal/mesafeli-satis" target="_blank" className="underline">Mesafeli satış sözleşmesi</Link>ni ve <Link href="/yasal/iade-iptal" target="_blank" className="underline">İptal ve iade</Link> koşullarını kabul edersiniz. Otomatik yenileme yoktur.</p>
                </form>
              ) : <p className="text-sm text-muted">Online ödeme yakında.{contact ? ` Ödeme için: ${contact}` : ""}</p>}
            </Card>
          );
        })}
      </div>
      {pays.length > 0 && (
        <Card className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-surface-2 text-left text-xs text-muted"><tr>{["Tarih", "Dönem", "Tutar", "Birimler", "Durum", "Dönem sonu"].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">{pays.map((p) => (
              <tr key={p.id}><td className="px-4 py-2.5">{day(p.createdAt)}</td><td className="px-4 py-2.5">{p.period === "yillik" ? "Yıllık" : "Aylık"}</td><td className="px-4 py-2.5 tabular-nums">{formatTL(p.amount)}</td><td className="px-4 py-2.5">{p.stores > 0 || p.devices > 0 ? `${p.stores} şube · ${p.devices} terminal` : "—"}</td><td className="px-4 py-2.5">{STATUS[p.status] ?? p.status}</td><td className="px-4 py-2.5">{p.periodEnd ? day(p.periodEnd) : "—"}</td></tr>
            ))}</tbody>
          </table>
        </Card>
      )}
    </>
  );
}
