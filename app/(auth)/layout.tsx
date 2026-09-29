import Link from "next/link";
import { ChartColumn, Check, Printer, WifiOff } from "lucide-react";
import { LegalFooter } from "@/components/Legal";
import { LogoMark } from "@/components/ui";

const POINTS = [
  { icon: WifiOff, title: "Çevrimdışı çalışır", text: "Fişler cihazda tutulur, bağlantı gelince buluta eşitlenir." },
  { icon: Printer, title: "Yazıcı, çekmece, terazi", text: "Kasadaki küçük ajan donanımı sürer; kurulum birkaç dakika." },
  { icon: ChartColumn, title: "Her şey tek panelde", text: "Ürün, stok, personel ve raporlar; istediğiniz yerden." },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-white lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden overflow-hidden bg-ink text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 size-96 rounded-full bg-brand/30 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-24 size-96 rounded-full bg-brand/15 blur-3xl" />
        <Link href="/" className="relative inline-flex items-center gap-2.5 text-lg font-semibold tracking-tight">
          <LogoMark />ÇabukPOS
        </Link>
        <div className="relative max-w-md">
          <p className="text-3xl font-semibold leading-tight tracking-tight">İnternet gitse de <span className="text-orange-400">kasa durmaz.</span></p>
          <ul className="mt-10 space-y-6">
            {POINTS.map(({ icon: I, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 text-orange-300"><I aria-hidden className="size-5" /></span>
                <span><span className="block font-medium">{title}</span><span className="mt-0.5 block text-sm text-stone-400">{text}</span></span>
              </li>
            ))}
          </ul>
        </div>
        <ul className="relative flex flex-wrap gap-x-6 gap-y-2 text-sm text-stone-400">
          {["Kart bilgisi istenmez", "Otomatik yenileme yok", "Veriler sizin"].map((t) => (
            <li key={t} className="inline-flex items-center gap-1.5"><Check aria-hidden className="size-4 text-emerald-400" />{t}</li>
          ))}
        </ul>
      </aside>
      <main className="flex flex-col px-4 py-8 sm:px-8">
        <Link href="/" className="inline-flex items-center gap-2 font-semibold tracking-tight lg:hidden">
          <LogoMark size="sm" />ÇabukPOS
        </Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</div>
        <LegalFooter />
      </main>
    </div>
  );
}
