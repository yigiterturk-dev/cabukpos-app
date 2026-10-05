import type { Metadata } from "next";
import Link from "next/link";
import { LegalFooter } from "@/components/Legal";
import { LogoMark } from "@/components/ui";
import { HELP_TOPICS, type HelpIcon } from "@/lib/help";
import {
  ArrowRight, BookOpen, Boxes, CloudOff, CreditCard, Keyboard, Receipt,
  ChartColumn, ShieldCheck, UtensilsCrossed, Plug, CircleHelp, type LucideIcon,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Yardım merkezi · ÇabukPOS",
  description: "ÇabukPOS kullanım kılavuzu: kurulum, kasa, çevrimdışı, restoran, market, donanım, mali belgeler, raporlar, abonelik ve güvenlik.",
};

const ICONS: Record<HelpIcon, LucideIcon> = {
  baslangic: BookOpen,
  kasa: Keyboard,
  cevrimdisi: CloudOff,
  restoran: UtensilsCrossed,
  market: Boxes,
  donanim: Plug,
  mali: Receipt,
  rapor: ChartColumn,
  abonelik: CreditCard,
  guvenlik: ShieldCheck,
};

export default function Yardim() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <header className="flex flex-wrap items-center gap-3">
        <Link href="/" className="inline-flex items-center gap-2 font-semibold tracking-tight"><LogoMark size="sm" />ÇabukPOS</Link>
        <Link href="/giris" className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-medium text-ink-2 outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60">Panele git<ArrowRight aria-hidden className="size-4" /></Link>
      </header>

      <section className="mt-8">
        <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-brand"><CircleHelp aria-hidden className="size-4" />Yardım merkezi</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-ink">ÇabukPOS kullanım kılavuzu</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-2">
          Kurulumdan gün sonuna, çevrimdışı satıştan mali belgelere kadar her adım. Aradığınızı aşağıdaki başlıklardan bulabilir; destek için
          <Link href="/yasal/iletisim" className="ml-1 font-medium text-brand underline">iletişim</Link> sayfasını kullanabilirsiniz.
        </p>
        <nav aria-label="Başlıklar" className="mt-5 flex flex-wrap gap-2">
          {HELP_TOPICS.map((t) => (
            <a key={t.id} href={`#${t.id}`} className="inline-flex min-h-9 items-center rounded-full border border-line bg-surface px-3 text-sm text-ink-2 outline-none hover:border-line-strong hover:text-ink focus-visible:ring-4 focus-visible:ring-brand-ring/60">{t.title}</a>
          ))}
        </nav>
      </section>

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        {HELP_TOPICS.map((t) => {
          const Icon = ICONS[t.icon];
          return (
            <section key={t.id} id={t.id} className="scroll-mt-6 rounded-[18px] border border-line bg-surface p-5 shadow-card">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand"><Icon aria-hidden className="size-5" /></span>
                <div className="min-w-0">
                  <h2 className="font-semibold text-ink">{t.title}</h2>
                  <p className="mt-0.5 text-sm text-muted">{t.summary}</p>
                </div>
              </div>
              <ol className="mt-3 space-y-2 text-sm text-ink-2">
                {t.steps.map((s, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-soft text-[11px] font-semibold text-brand">{i + 1}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
              {t.tip && <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-2"><b>İpucu:</b> {t.tip}</p>}
            </section>
          );
        })}
      </div>

      <LegalFooter className="mt-10 border-t border-line pt-6" />
      <p className="mt-3 text-center text-xs text-muted">© 2026 ÇabukPOS</p>
    </main>
  );
}
