import Link from "next/link";
import { Box, ChartColumn, Check, Printer, Receipt, Router, TabletSmartphone, Users, WifiOff, type LucideIcon } from "lucide-react";
import { LegalFooter } from "@/components/Legal";
import { LogoMark, buttonClass } from "@/components/ui";
import { planPrice, salesContact } from "@/lib/billing/plans";
import { formatTL } from "@/lib/core/money";

export const dynamic = "force-dynamic";

const VERTICALS = [
  { title: "Restoran", lead: "Salondan mutfağa, paketten kuryeye tek ekran.", items: ["Masa planı, adisyon, hesap bölme, ikram", "Garson telefonu ve mutfak ekranı, istasyon yazıcısı", "Paket servis, teslimat bölgeleri, kurye ekranı", "Reçeteyle otomatik stok düşümü ve porsiyon maliyeti", "Yemeksepeti / Trendyol Go siparişleri (yakında)"] },
  { title: "Market", lead: "Barkodu okut, tart, öde. Kuyruk birikmez.", items: ["Barkodla hızlı kasa, bölünmüş ödeme", "Terazi etiketi (ağırlık barkodu) okuma", "A4 raf etiketi basımı", "Alış fişi, tedarikçi bakiyesi, stok sayımı", "Fiş numarasıyla iade, müdür onayı"] },
];

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: WifiOff, title: "İnternet gitse de satış sürer", text: "Kasa satışları cihazda tutar, bağlantı gelince buluta eşitler. Hiçbir fiş kaybolmaz." },
  { icon: Printer, title: "Yazıcı, çekmece, terazi", text: "Kasadaki bilgisayara kurulan küçük ajan termal yazıcıyı, para çekmecesini ve teraziyi sürer." },
  { icon: Router, title: "İnternetsiz salon", text: "Masa siparişleri dükkân içi ağ üzerinden garsondan mutfağa gider; internet şart değil." },
  { icon: ChartColumn, title: "Raporlar", text: "Günlük ciro, saat yoğunluğu, ürün ve personel performansı, kârlılık. CSV olarak indirin." },
  { icon: Box, title: "Stok ve maliyet", text: "Son alış fiyatından maliyet, kritik stok uyarısı, ara ürün ve üretim." },
  { icon: Users, title: "Personel ve yetki", text: "Kasiyer, garson, müdür rolleri; PIN ile giriş, iade ve indirimde müdür onayı." },
  { icon: TabletSmartphone, title: "Sınırsız cihaz", text: "Kasa, garson telefonu, mutfak ekranı ve kurye telefonu; hepsi tek kodla eşlenir, ek ücret yok." },
  { icon: Receipt, title: "Bilgi fişi ve e-Arşiv", text: "Fişte e-Arşiv numarası ve karekod. Entegratör bağlantısı hazırlanıyor (yakında)." },
];

const STEPS = [
  { n: "1", title: "Hesap açın", text: "İşletme adı ve türü; 1 dakika. Kart bilgisi istenmez." },
  { n: "2", title: "Ürünleri girin", text: "Kategori, fiyat, KDV. Market için barkod, restoran için masa planı." },
  { n: "3", title: "Cihazı eşleyin", text: "Tablet ya da bilgisayarda kasayı açın, yönetimdeki kodu yazın, satışa başlayın." },
];

const FAQ = [
  { q: "İnternet kesilirse ne olur?", a: "Kasa satışa devam eder; fişler cihazda saklanır ve bağlantı gelince otomatik gönderilir. Yönetim paneli ve raporlar internet ister." },
  { q: "Hangi cihazlarda çalışır?", a: "Chrome olan her bilgisayar, tablet ve Android POS cihazında. Yazıcı, çekmece ve terazi için kasadaki Windows ya da Mac bilgisayara ajan kurulur." },
  { q: "ÇabukPOS yazar kasanın (ÖKC) yerine geçer mi?", a: "Hayır. ÇabukPOS'un bastığı bilgi fişi mali belge değildir; ÖKC'ye tutar girilir ya da e-Arşiv entegratörü üzerinden fatura kesilir. ÖKC entegrasyonu için üretici ortaklığı üzerinde çalışıyoruz." },
  { q: "Verilerim kimde?", a: "Veriler sizindir. İşletmeler birbirinden veritabanı düzeyinde ayrılır; raporlarınızı istediğiniz an CSV olarak indirebilirsiniz." },
  { q: "Abonelik bitince ne olur?", a: "7 gün ek süre verilir, sonra yönetim salt okunur olur. Kasa satışa devam eder, veriler silinmez. Otomatik yenileme ve karttan otomatik çekim yoktur." },
];

function KasaMock() {
  const lines: [string, string, string][] = [["Adana Dürüm", "2", "360,00"], ["Ayran", "2", "60,00"], ["Künefe", "1", "140,00"]];
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-md select-none">
      <div className="rounded-2xl border border-line bg-white p-4 shadow-pop">
        <div className="mb-3 flex items-center justify-between text-xs">
          <span className="font-semibold">Masa 4 · Salon</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-soft px-2 py-0.5 font-medium text-warn"><span className="size-1.5 rounded-full bg-warn" />Çevrimdışı · 3 bekleyen</span>
        </div>
        <ul className="divide-y divide-line text-sm">
          {lines.map(([n, q, p]) => <li key={n} className="flex justify-between py-2"><span>{q} × {n}</span><span className="tabular">{p} ₺</span></li>)}
        </ul>
        <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3"><span className="text-sm text-muted">Toplam</span><span className="tabular text-2xl font-semibold">560,00 ₺</span></div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-sm font-medium">
          <span className="rounded-lg border border-line py-2.5 text-center">Nakit</span>
          <span className="rounded-lg border border-line py-2.5 text-center">Kart</span>
          <span className="rounded-lg bg-brand py-2.5 text-center text-white">Öde</span>
        </div>
      </div>
      <div className="absolute -bottom-5 -left-8 hidden rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-pop sm:block">
        <div className="font-semibold">Mutfak · Izgara</div>
        <div className="text-muted">2 × Adana Dürüm · 4 dk</div>
      </div>
      <div className="absolute -right-2 -top-4 rounded-xl bg-ok px-3 py-2 text-xs font-medium text-white shadow-pop sm:-right-6">Fiş yazdırıldı</div>
    </div>
  );
}

export default function Home() {
  const monthly = planPrice("aylik"), yearly = planPrice("yillik"), contact = salesContact();
  return (
    <div className="bg-white">
      <header className="sticky top-0 z-10 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <Link href="/" className="inline-flex items-center gap-2 font-semibold tracking-tight"><LogoMark size="sm" />ÇabukPOS</Link>
          <nav aria-label="Ana" className="hidden gap-5 text-sm text-ink-2 md:flex">
            <a href="#ozellikler" className="hover:text-ink">Özellikler</a>
            <a href="#fiyat" className="hover:text-ink">Fiyat</a>
            <a href="#sss" className="hover:text-ink">Sorular</a>
          </nav>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <Link href="/kasa" className={`${buttonClass("ghost", "sm")} hidden sm:inline-flex`}>Kasayı aç</Link>
            <Link href="/giris" className={buttonClass("ghost", "sm")}>Giriş</Link>
            <Link href="/kayit" className={buttonClass("primary", "sm")}>Ücretsiz dene</Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-14 md:grid-cols-[1.1fr_1fr] md:pt-20">
          <div>
            <p className="mb-4 inline-flex rounded-full bg-brand-soft px-3 py-1 text-xs font-medium text-brand">Restoran ve market için bulut kasa</p>
            <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">İnternet gitse de <span className="text-brand">kasa durmaz.</span></h1>
            <p className="mt-5 max-w-xl text-lg text-ink-2">Masa, mutfak, paket servis, barkod ve terazi; stok, reçete ve raporlar. Tablette, bilgisayarda ya da POS cihazında, kurulum derdi olmadan.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/kayit" className={buttonClass("primary", "lg")}>14 gün ücretsiz deneyin</Link>
              <a href="#ozellikler" className={buttonClass("secondary", "lg")}>Neler var?</a>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-2">
              {["Kart bilgisi istenmez", "Otomatik yenileme yok", "Veriler sizin"].map((t) => <li key={t} className="inline-flex items-center gap-1.5"><Check aria-hidden className="size-4 text-ok" />{t}</li>)}
            </ul>
          </div>
          <KasaMock />
        </section>

        <section className="border-y border-line bg-surface-2">
          <div className="mx-auto grid max-w-6xl gap-4 px-4 py-16 md:grid-cols-2">
            {VERTICALS.map((v) => (
              <div key={v.title} className="rounded-2xl border border-line bg-white p-7">
                <h2 className="text-2xl font-semibold tracking-tight">{v.title}</h2>
                <p className="mt-1 text-ink-2">{v.lead}</p>
                <ul className="mt-5 space-y-2.5 text-[15px]">
                  {v.items.map((i) => <li key={i} className="flex gap-2.5"><Check aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" /><span>{i}</span></li>)}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section id="ozellikler" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
          <h2 className="max-w-2xl text-3xl font-semibold tracking-tight">Dükkânın gerçek hâli için yapıldı: yoğun saat, kopan internet, yazıcı sırası.</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <div key={f.title} className={`rounded-2xl border border-line p-6 ${i === 0 ? "bg-brand text-white sm:col-span-2 lg:col-span-1 lg:row-span-2" : "bg-white"}`}>
                <div className={`mb-4 inline-flex rounded-xl p-2.5 ${i === 0 ? "bg-white/15" : "bg-brand-soft text-brand"}`}><f.icon aria-hidden className="size-5" /></div>
                <h3 className={`font-semibold ${i === 0 ? "text-2xl" : "text-lg"}`}>{f.title}</h3>
                <p className={`mt-2 ${i === 0 ? "text-orange-50" : "text-ink-2"}`}>{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-ink text-white">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <h2 className="text-3xl font-semibold tracking-tight">Üç adımda satışa başlayın</h2>
            <ol className="mt-10 grid gap-8 md:grid-cols-3">
              {STEPS.map((s) => (
                <li key={s.n}>
                  <div className="text-5xl font-semibold text-orange-400">{s.n}</div>
                  <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
                  <p className="mt-1 text-stone-300">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="fiyat" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
          <h2 className="text-3xl font-semibold tracking-tight">Tek paket, her şey dahil</h2>
          <p className="mt-2 text-ink-2">Tüm modüller, sınırsız ürün ve cihaz. Fiyatlara KDV dahildir.</p>
          <div className="mt-8 grid max-w-3xl gap-4 sm:grid-cols-2">
            {([["Aylık", monthly, "her ay"], ["Yıllık", yearly, "yılda bir"]] as const).map(([label, price, per]) => (
              <div key={label} className={`rounded-2xl border p-7 shadow-card ${label === "Yıllık" ? "border-brand ring-4 ring-brand-ring/40" : "border-line"}`}>
                <h3 className="font-semibold">{label}</h3>
                <div className="mt-3 text-4xl font-semibold tracking-tight tabular">{price ? formatTL(price) : "—"}</div>
                <p className="mt-1 text-sm text-muted">{price ? `${per}, peşin` : contact ? `Fiyat için: ${contact}` : "Fiyat yakında açıklanacak"}</p>
                <Link href="/kayit" className={`${buttonClass(label === "Yıllık" ? "primary" : "secondary", "md")} mt-6 w-full`}>14 gün ücretsiz başla</Link>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted">Deneme bitince ödeme yapmazsanız ücret doğmaz. Ayrıntı: <Link href="/yasal/iade-iptal" className="underline">İptal ve iade</Link>.</p>
          <Link href="/fiyatlandirma" className="mt-4 inline-block text-sm font-medium text-brand hover:underline">Şube ve terminal sayınıza göre hesaplayın →</Link>
        </section>

        <section id="sss" className="border-t border-line bg-surface-2">
          <div className="mx-auto max-w-3xl scroll-mt-20 px-4 py-20">
            <h2 className="text-3xl font-semibold tracking-tight">Sık sorulanlar</h2>
            <div className="mt-8 divide-y divide-line rounded-2xl border border-line bg-white">
              {FAQ.map((f) => (
                <details key={f.q} className="group px-6 py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">{f.q}<span className="text-muted transition-transform group-open:rotate-45" aria-hidden>+</span></summary>
                  <p className="mt-2 text-ink-2">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-20 text-center">
          <h2 className="text-3xl font-semibold tracking-tight">Bugün kurun, bu akşamki yoğunlukta kullanın.</h2>
          <Link href="/kayit" className={`${buttonClass("primary", "lg")} mt-6`}>Ücretsiz hesap açın</Link>
        </section>
      </main>

      <footer className="border-t border-line py-8">
        <div className="mx-auto max-w-6xl px-4">
          <LegalFooter />
          <p className="mt-3 text-center text-xs text-muted">© 2026 ÇabukPOS</p>
        </div>
      </footer>
    </div>
  );
}
