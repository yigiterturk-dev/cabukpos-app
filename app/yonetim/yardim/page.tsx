import Link from "next/link";
import { ArrowRight, BookOpen, CircleCheck, ExternalLink, Printer, WifiOff } from "lucide-react";
import { Card, PageHeader, buttonClass } from "@/components/ui";

export const metadata = { title: "Yardım ve kurulum — ÇabukPOS" };

const steps = [
  ["Personel ekleyin, PIN belirleyin", "Kasiyer ve yöneticileri ekleyin; herkes kendi PIN'iyle giriş yapsın.", "/yonetim/personel"],
  ["Ürünleri ekleyin", "Tek tek ekleyin veya CSV şablonuyla toplu aktarın.", "/yonetim/urunler"],
  ["Kasa tabletini bağlayın", "Cihazlar bölümünden cihazı ekleyip eşleme kodunu tablette /kasa adresine yazın.", "/yonetim/cihazlar"],
  ["İlk satışı yapın", "Kasa ekranında vardiya açın, örnek satış yapın ve fişi kontrol edin.", "/kasa"],
] as const;

const topics = [
  { title: "İlk satış öncesi", text: "Ürün fiyatları, KDV oranları, yazıcı ve kasa cihazı eşleşmesini kontrol edin.", href: "/yonetim/donanim", label: "Donanımı kontrol et" },
  { title: "İnternet kesilirse", text: "Kasa satışları yerel kuyruğa alır. Bağlantı dönünce giden kutusu otomatik eşitlenir; bekleyen sayısını kasadaki banttan izleyin.", href: "/kasa", label: "Kasayı aç" },
  { title: "Bilgi fişi ve mali belge", text: "Bilgi fişi mali belge değildir. Gerçek e-Arşiv veya ÖKC için mali ayarlar, entegratör ve mali müşavir onayı gerekir.", href: "/yonetim/mali", label: "Mali ayarlara git" },
  { title: "Satış sonrası", text: "Gün sonunda vardiyayı kapatın; fark, iade, bekleyen eşitleme ve incelenecek kayıtları raporlardan kontrol edin.", href: "/yonetim/raporlar", label: "Raporları aç" },
];

export default function Yardim() {
  return (
    <>
      <PageHeader title="Yardım ve kurulum" desc="İlk işletmeyi birkaç kısa adımda satışa hazırlayın." actions={<Link href="/kasa" className={buttonClass("primary", "lg")}><ArrowRight aria-hidden className="size-4" />Kasayı aç</Link>} />

      <Card className="mb-6 overflow-hidden border-brand-ring bg-brand-soft/20">
        <div className="border-b border-brand-ring/70 px-5 py-4">
          <h2 className="font-semibold">İlk satış kontrol listesi</h2>
          <p className="mt-1 text-sm text-ink-2">Bu dört adım tamamlandığında işletmeniz günlük satışa hazırdır.</p>
        </div>
        <ol className="grid gap-px bg-brand-ring/60 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(([title, text, href], index) => (
            <li key={title} className="bg-surface p-5">
              <div className="mb-3 flex items-center gap-2 text-brand"><span className="grid size-7 place-items-center rounded-full bg-brand-soft text-sm font-bold">{index + 1}</span><CircleCheck aria-hidden className="size-4" /></div>
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-1.5 min-h-12 text-sm leading-5 text-muted">{text}</p>
              <Link href={href} aria-label={`Aç: ${title}`} className="mt-3 inline-flex min-h-11 items-center gap-1 rounded px-1 text-sm font-medium text-brand outline-none hover:underline focus-visible:ring-4 focus-visible:ring-brand-ring/60">Aç<ArrowRight aria-hidden className="size-3.5" /></Link>
            </li>
          ))}
        </ol>
      </Card>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        {topics.map((topic) => (
          <Card key={topic.title} className="p-5">
            <h2 className="font-semibold">{topic.title}</h2>
            <p className="mt-2 text-sm leading-6 text-ink-2">{topic.text}</p>
            <Link href={topic.href} className="mt-4 inline-flex min-h-11 items-center gap-1 rounded px-1 text-sm font-medium text-brand outline-none hover:underline focus-visible:ring-4 focus-visible:ring-brand-ring/60">{topic.label}<ArrowRight aria-hidden className="size-3.5" /></Link>
          </Card>
        ))}
      </div>

      <Card className="flex flex-wrap items-center gap-4 p-5">
        <span className="grid size-10 place-items-center rounded-xl bg-surface-3 text-muted"><BookOpen aria-hidden className="size-5" /></span>
        <div className="min-w-0 flex-1"><h2 className="font-semibold">Tüm kullanım kılavuzu</h2><p className="mt-1 text-sm text-muted">Kurulum, kasa, çevrimdışı, restoran, market, donanım, mali belgeler, raporlar, abonelik ve güvenlik başlıklarının tamamı adım adım.</p></div>
        <Link href="/yardim" className="inline-flex min-h-11 items-center gap-1 rounded px-1 text-sm font-medium text-brand outline-none hover:underline focus-visible:ring-4 focus-visible:ring-brand-ring/60">Kılavuzu aç<ExternalLink aria-hidden className="size-3.5" /></Link>
      </Card>

      <Card className="mt-4 flex flex-wrap items-center gap-4 p-5">
        <span className="grid size-10 place-items-center rounded-xl bg-surface-3 text-muted"><Printer aria-hidden className="size-5" /></span>
        <div className="min-w-0 flex-1"><h2 className="font-semibold">Donanım notu</h2><p className="mt-1 text-sm text-muted">Termal yazıcı, barkod okuyucu, çekmece ve terazi gerçek cihazla pilot öncesi denenmelidir.</p></div>
        <Link href="/yonetim/donanim" className="inline-flex min-h-11 items-center gap-1 rounded px-1 text-sm font-medium text-brand outline-none hover:underline focus-visible:ring-4 focus-visible:ring-brand-ring/60">Donanım sayfası<ExternalLink aria-hidden className="size-3.5" /></Link>
      </Card>

      <div className="mt-4 flex items-center gap-2 text-xs text-muted"><WifiOff aria-hidden className="size-4" />Çevrimdışı satış ve eşitleme ayrıntıları için pilot provasını gerçek cihazda uygulayın.</div>
    </>
  );
}
