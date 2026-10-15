import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Bot, Mic, Sparkles, Utensils } from "lucide-react";

export const metadata: Metadata = {
  title: "ÇabukPOS · Canlı Demolar",
  description: "AI telefon/WhatsApp siparişi ve konuşarak yönet — kayıt olmadan canlı deneyin.",
};

const DEMOS = [
  {
    href: "/demo/ai-siparis",
    icon: Utensils,
    title: "AI Sipariş (telefon / WhatsApp)",
    desc: "Müşteri doğal dille söyler; sistem ürünlere çevirir ve mutfağa düşürür. Yaz ya da mikrofona konuş.",
    tag: "Ses + metin",
  },
  {
    href: "/demo/konusarak-yonet",
    icon: Bot,
    title: "Konuşarak Yönet",
    desc: "“Dün en çok ne sattım, kritik stok var mı, bugün ciro ne?” — sor, cevabı getirsin.",
    tag: "Rapor + stok",
  },
];

export default function DemoHub() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col justify-center px-4 py-12">
      <nav className="mb-10 flex items-center justify-between gap-3" aria-label="ÇabukPOS bağlantıları">
        <Link href="/" className="text-sm font-semibold text-ink-2 hover:text-ink">ÇabukPOS</Link>
        <div className="flex items-center gap-2">
          <Link href="/kasa" className="inline-flex min-h-10 items-center rounded-xl border border-line bg-surface px-3 text-sm font-semibold text-ink-2 outline-none hover:border-line-strong hover:text-ink focus-visible:ring-4 focus-visible:ring-brand-ring/60">Kasayı aç</Link>
          <Link href="/giris" className="inline-flex min-h-10 items-center rounded-xl bg-brand px-3 text-sm font-semibold text-white outline-none hover:bg-brand-hover focus-visible:ring-4 focus-visible:ring-brand-ring/60">Yönetim paneli</Link>
        </div>
      </nav>
      <div className="mb-8 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-ink-2"><Sparkles aria-hidden className="size-3.5 text-brand" />Kayıt yok · kurulum yok</span>
        <h1 className="mt-4 font-display text-4xl font-extrabold tracking-tight">ÇabukPOS&apos;u canlı dene</h1>
        <p className="mx-auto mt-2 max-w-lg text-muted">Piyasadaki diğer POS&apos;ların yapamadığı iki şey: yapay zekâyla sipariş almak ve işletmeyi konuşarak yönetmek. Mikrofonu aç, söyle, çalıştığını gör.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {DEMOS.map((d) => {
          const Icon = d.icon;
          return (
            <Link key={d.href} href={d.href} className="press group flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-rest outline-none transition-[transform,box-shadow,border-color] duration-[var(--dur-base)] ease-[var(--ease-out)] hover:-translate-y-0.5 hover:border-line-strong hover:shadow-raised focus-visible:ring-4 focus-visible:ring-brand-ring/60">
              <div className="flex items-center justify-between">
                <span aria-hidden className="grid size-11 place-items-center rounded-xl bg-brand-soft text-brand [&>svg]:size-6"><Icon /></span>
                <span className="rounded-full bg-surface-3 px-2.5 py-0.5 text-xs font-medium text-ink-2">{d.tag}</span>
              </div>
              <h2 className="mt-4 font-display text-lg font-bold tracking-tight">{d.title}</h2>
              <p className="mt-1 flex-1 text-sm text-muted">{d.desc}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand">Deneyin<ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" /></span>
            </Link>
          );
        })}
      </div>

      <p className="mt-8 flex items-center justify-center gap-2 text-center text-sm text-muted">
        <Mic aria-hidden className="size-4" />Mikrofon desteği tarayıcıda çalışır (Chrome). Yazmak da yeterli.
      </p>
    </main>
  );
}
