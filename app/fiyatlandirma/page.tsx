import Link from "next/link";
import { Check } from "lucide-react";
import { unitPrices, salesContact } from "@/lib/billing/plans";
import { formatTL } from "@/lib/core/money";
import { LegalFooter } from "@/components/Legal";
import { LogoMark, buttonClass } from "@/components/ui";
import { PriceCalculator } from "@/components/PriceCalculator";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Fiyatlandırma — ÇabukPOS",
  description: "Restoran ve market için bulut kasa fiyatları: taban paket, ek şube ve terminal birim fiyatları, 14 gün ücretsiz deneme.",
  alternates: { canonical: "/fiyatlandirma" },
};

const INCLUDED = [
  "Tüm modüller: masa, mutfak, paket servis, barkod, terazi",
  "Çevrimdışı satış — internet gitse de kasa durmaz",
  "Sınırsız ürün, personel ve cihaz eşleme",
  "Stok, reçete, maliyet ve raporlar",
  "e-Arşiv fatura ve bilgi fişi",
  "14 gün ücretsiz deneme, kart bilgisi istenmez",
];

export default function Fiyatlandirma() {
  const aylik = unitPrices("aylik"), yillik = unitPrices("yillik");
  const contact = salesContact();
  return (
    <div className="bg-white">
      <header className="sticky top-0 z-10 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <Link href="/" className="inline-flex items-center gap-2 font-semibold tracking-tight"><LogoMark size="sm" />ÇabukPOS</Link>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <Link href="/giris" className={buttonClass("ghost", "sm")}>Giriş</Link>
            <Link href="/kayit" className={buttonClass("primary", "sm")}>Ücretsiz dene</Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-16">
        <h1 className="text-4xl font-semibold tracking-tight">Fiyatlandırma</h1>
        <p className="mt-3 max-w-2xl text-lg text-ink-2">Taban paket 1 şube ve 1 kasa terminali kapsar; büyürken yalnız eklediğiniz birimler için ödersiniz. Fiyatlara KDV dahildir.</p>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          <div className="space-y-4">
            {([["Aylık", aylik, "her ay"], ["Yıllık", yillik, "yılda bir, peşin"]] as const).map(([label, p, per]) => (
              <div key={label} className={`rounded-2xl border p-7 shadow-card ${label === "Yıllık" ? "border-brand ring-4 ring-brand-ring/40" : "border-line"}`}>
                <h2 className="font-semibold">{label}</h2>
                <div className="mt-3 text-4xl font-semibold tracking-tight tabular">{p ? formatTL(p.base) : "—"}</div>
                <p className="mt-1 text-sm text-muted">{p ? `${per} · 1 şube + 1 terminal dahil` : contact ? `Fiyat için: ${contact}` : "Fiyat yakında açıklanacak"}</p>
                {p?.store != null && <div className="mt-3 text-sm text-ink-2 tabular">Ek şube: {formatTL(p.store)}/ay</div>}
                {p?.device != null && <div className="text-sm text-ink-2 tabular">Ek kasa/terminal: {formatTL(p.device)}/ay</div>}
                {p && <div className="text-xs text-muted">Birim fiyatı girilmeyen bileşen ek ücretsizdir.</div>}
              </div>
            ))}
          </div>
          <PriceCalculator prices={{ aylik, yillik }} />
        </div>

        <section className="mt-14">
          <h2 className="text-2xl font-semibold tracking-tight">Her pakette</h2>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {INCLUDED.map((t) => <li key={t} className="flex items-start gap-2 text-ink-2"><Check aria-hidden className="mt-0.5 size-4 shrink-0 text-ok" />{t}</li>)}
          </ul>
        </section>

        <section className="mt-14 rounded-2xl border border-line bg-surface-2 p-7">
          <h2 className="text-xl font-semibold tracking-tight">Sorularınız mı var?</h2>
          <p className="mt-2 text-ink-2">Çok şubeli işletmeler için özel teklif ve veri aktarımı desteği sunuyoruz.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {contact && <a href={contact.startsWith("http") ? contact : `mailto:${contact}`} className={buttonClass("secondary", "md")}>Bize yazın</a>}
            <Link href="/kayit" className={buttonClass("primary", "md")}>14 gün ücretsiz başla</Link>
          </div>
        </section>

        <p className="mt-8 text-sm text-muted">Deneme bitince ödeme yapmazsanız ücret doğmaz. Faturalama, iptal ve iade koşulları: <Link href="/yasal/iade-iptal" className="underline">İptal ve iade</Link>.</p>
      </main>
      <footer className="border-t border-line py-8">
        <div className="mx-auto max-w-6xl px-4"><LegalFooter /><p className="mt-3 text-center text-xs text-muted">© 2026 ÇabukPOS</p></div>
      </footer>
    </div>
  );
}
