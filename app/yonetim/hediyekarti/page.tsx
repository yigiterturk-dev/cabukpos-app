import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { createGiftCard, giftCardCancel, giftCardLoad } from "@/lib/admin/loyalty-actions";
import { Badge, buttonClass, Card, Field, Input, PageHeader } from "@/components/ui";
import { moneyFormatter, tenantCurrency } from "@/lib/admin/currency";
import { currencySymbol } from "@/lib/core/money";

export const dynamic = "force-dynamic";

const statusTone = { aktif: "ok", bitti: "neutral", iptal: "bad" } as const;
const statusLabel = { aktif: "aktif", bitti: "bitti", iptal: "iptal" } as const;
export default async function HediyeKarti({ searchParams }: { searchParams: Promise<{ ok?: string; hata?: string; id?: string }> }) {
  const a = await requireAdmin();
  const money = await moneyFormatter(a.tenantId);
  const currency = await tenantCurrency(a.tenantId);
  const unit = currencySymbol(currency);
  const { ok, hata, id } = await searchParams;
  const G = schema.giftCards;
  const { rows, events } = await withTenant(a.tenantId, async (tx) => {
    const rows = await tx.select().from(G).orderBy(desc(G.createdAt)).limit(100);
    const events = id
      ? await tx.select({ kind: schema.giftCardEvents.kind, amountKurus: schema.giftCardEvents.amountKurus, note: schema.giftCardEvents.note, createdAt: schema.giftCardEvents.createdAt }).from(schema.giftCardEvents).where(eq(schema.giftCardEvents.cardId, id)).orderBy(desc(schema.giftCardEvents.createdAt)).limit(20)
      : [];
    return { rows, events };
  });
  return (
    <>
      <PageHeader title="Hediye kartı" desc="Önceden yüklü bakiye; kod, kasada ödeme yöntemi olarak harcanır. İptal edilen kartın kalan bakiyesi donar." />
      {ok && <div className="mb-6 rounded-[14px] border border-ok/30 bg-ok-soft px-4 py-3 text-sm text-ok">Kaydedildi.</div>}
      {hata && <div className="mb-6 rounded-[14px] border border-bad/30 bg-bad-soft px-4 py-3 text-sm text-bad">Eksik ya da geçersiz bilgi — kontrol edip yeniden deneyin.</div>}
      <section aria-label="Yeni hediye kartı" className="mb-8">
        <Card className="p-5">
          <form action={createGiftCard} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
            <Field label={`Yüklenecek tutar (${unit})`}><Input name="initial" inputMode="decimal" required /></Field>
            <Field label="Kod" hint="Boş bırakılırsa HK-XXXXXX üretilir"><Input name="code" className="uppercase" /></Field>
            <Field label="Son kullanma" hint="Boş = süresiz"><Input name="expiresAt" type="date" /></Field>
            <Field label="Not"><Input name="note" /></Field>
            <button className={buttonClass("primary")}>Kart oluştur</button>
          </form>
        </Card>
      </section>
      {rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">Henüz hediye kartı yok. Yukarıdan ilk kartı oluşturun.</Card>
      ) : (
        <Card className="divide-y divide-line">
          {rows.map((g) => (
            <div key={g.id} className="p-4">
              <div className="flex min-w-0 flex-wrap items-baseline gap-3">
                <span className="shrink-0 font-mono font-semibold">{g.code}</span>
                <Badge tone={statusTone[g.status]}>{statusLabel[g.status]}</Badge>
                <span className="shrink-0 tabular font-semibold">{money(g.balanceKurus)}</span>
                <span className="shrink-0 tabular text-sm text-muted">yüklenen {money(g.initialKurus)}</span>
                {g.expiresAt && <span className="shrink-0 text-sm text-muted">son {g.expiresAt.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" })}</span>}
                {g.note && <span className="min-w-0 flex-1 break-words text-sm text-muted">{g.note}</span>}
                {g.status === "aktif" && <Link href={id === g.id ? "/yonetim/hediyekarti" : `/yonetim/hediyekarti?id=${g.id}`} className="ml-auto inline-flex min-h-10 shrink-0 items-center rounded-lg px-2.5 text-sm text-brand underline outline-none hover:bg-brand-soft focus-visible:ring-4 focus-visible:ring-brand-ring/60">{id === g.id ? "Kapat" : "Yükle / İptal"}</Link>}
              </div>
              {id === g.id && g.status === "aktif" && (
                <div className="mt-3">
                  <form action={giftCardLoad} className="mb-4 flex flex-wrap items-end gap-3">
                    <input type="hidden" name="cardId" value={g.id} />
                    <Field label={`Bakiye yükle (${unit})`}><Input name="amount" inputMode="decimal" className="w-32" required /></Field>
                    <button className={buttonClass("primary")}>Yükle</button>
                  </form>
                  <form action={giftCardCancel}>
                    <input type="hidden" name="cardId" value={g.id} />
                    <button className={buttonClass("danger", "sm")}>Kartı iptal et</button>
                  </form>
                  {events.length > 0 && (
                    <ul className="mt-4 space-y-1 text-sm text-ink-2">
                      {events.map((e, i) => (
                        <li key={i} className="flex flex-wrap gap-2">
                          <span className="tabular w-20 text-muted">{e.createdAt.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" })}</span>
                          <span>{e.kind}</span>
                          <span className="tabular">{e.amountKurus ? `${e.amountKurus > 0 ? "+" : ""}${money(Math.abs(e.amountKurus))}` : ""}</span>
                          <span className="min-w-0 break-words text-muted">{e.note ?? ""}</span>
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
    </>
  );
}
