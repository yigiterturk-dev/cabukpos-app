// lib/help.ts — Kullanıcı kılavuzu / yardım merkezi içeriği.
// Tek kaynak: /yardim sayfası ve uygulama içi "Yardım" bağlantısı buradan beslenir.
// Metinler uygulamadaki gerçek akışları anlatır; pazarlama vaadi içermez.
export type HelpStep = string;
export type HelpTopic = {
  id: string;
  icon: HelpIcon;
  title: string;
  summary: string;
  steps: HelpStep[];
  tip?: string;
};

export type HelpIcon =
  | "baslangic"
  | "kasa"
  | "cevrimdisi"
  | "restoran"
  | "market"
  | "donanim"
  | "mali"
  | "rapor"
  | "abonelik"
  | "guvenlik";

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: "baslangic",
    icon: "baslangic",
    title: "İlk kurulum",
    summary: "ÇabukPOS'u satışa hazır hale getiren dört adım.",
    steps: [
      "Yönetim → Ürünler'den ürünleri tek tek ekleyin ya da CSV şablonuyla toplu aktarın (Türkçe/İngilizce başlıklar, tırnaklı TL fiyat desteklenir).",
      "Yönetim → Personel'den kasiyer ve müdür personelini, PIN'leriyle oluşturun. Kolay PIN'ler reddedilir.",
      "Yönetim → Cihazlar'dan kasayı ekleyip çıkan eşleme kodunu girin; cihazın şubesini ve işlem önekini seçin.",
      "Yönetim → Donanım'dan yazıcı, para çekmecesi ve teraziyi tanımlayın; deneme fişi basın.",
    ],
    tip: "Panelde Bugün ekranındaki \"İlk kurulumu tamamlayın\" kartı kalan adımları gösterir.",
  },
  {
    id: "kasa",
    icon: "kasa",
    title: "Kasa kullanımı",
    summary: "Vardiya açma, satış, ödeme ve gün sonu.",
    steps: [
      "Kasa ekranında personel PIN'i girilir; vardiya açılış tutarıyla başlar.",
      "Ürünler eklenir; nakit dışı ödemelerde karma ödeme ve para üstü desteklenir.",
      "Ödeme diyaloğundan bahşiş eklenebilir ve satış anında e-Arşiv faturası kesilebilir.",
      "Satış sonrası fiş otomatik yazıcıdan basılır; nakit satışta çekmece açılır.",
      "Vardiya sonunda Gün sonu ekranından sayım yapılır; fark raporlanır.",
    ],
    tip: "Vardiyasız tek satış için Hızlı satış sekmesini kullanın; gün sonu kapanışı kasiyeri düşürür.",
  },
  {
    id: "cevrimdisi",
    icon: "cevrimdisi",
    title: "Çevrimdışı çalışma",
    summary: "İnternet kesilse de satış devam eder; bağlantı dönünce eşitlenir.",
    steps: [
      "İnternet kesildiğinde kasa yalnız cihazda çalışır; satış, fiş ve vardiya yerelde tutulur.",
      "Üst şeritte bekleyen belge sayısı görünür; sekme kapansa bile giden kutusu korunur.",
      "Bağlantı döndüğünde belgeler tek kez, sırayla ve idempotent biçimde buluta yazılır.",
      "Kabul edilmeyen belgeler \"reddedilen belgeler\" listesine ve Denetim kaydına düşer.",
    ],
    tip: "Kasa sekmesini yenilemek bekleyen satışları silmez; sayfayı kapatmadan bekleyin.",
  },
  {
    id: "restoran",
    icon: "restoran",
    title: "Restoran: masa, mutfak, paket",
    summary: "Salon adisyonu, mutfak fişi ve kurye teslim akışı.",
    steps: [
      "Kasa → Salon'dan masa açılır; ürünler adisyona eklenir, seçenekler (boy, ekstra) seçilir.",
      "Adisyon gönderilince mutfak fişi istasyona yazılır; mutfak ekranı PIN'siz açılır.",
      "Hesap bölme (eşit/seç), ikram, indirim ve iptal müdür PIN'i ile yapılır.",
      "Paket siparişler kabul/red edilir, kurye atanır; \"Kuryeye verildi\" teslim ve satışı oluşturur.",
      "Kurye cihazı yalnız kurye rolüyle giriş yapar; üzerindeki nakit Gün sonu'ndan kapatılır.",
    ],
    tip: "Rezervasyonlar ve masa birleştirme Kasa → Salon ekranından yönetilir.",
  },
  {
    id: "market",
    icon: "market",
    title: "Market: barkod, terazi, etiket",
    summary: "Okutma, tartılı ürün, raf etiketi ve stok.",
    steps: [
      "Barkod okuyucuyla ürün okutulur; terazi etiketindeki PLU ve gram çözülür.",
      "Tartılı ürün elle de girilebilir; kg/adet birimleri ayrı izlenir.",
      "Yönetim → Raf etiketi'nden A4 (3×8) EAN-13 etiketleri yazdırılır.",
      "Stok sayımı ve fire, Yönetim → Sayım & zayi'den; alışlar Alışlar'dan girilir.",
    ],
    tip: "Reçeteli üründe stoktan hammadde düşer; maliyet Kârlılık sekmesinde görünür.",
  },
  {
    id: "donanim",
    icon: "donanim",
    title: "Donanım ve yerel ajan",
    summary: "Yazıcı, çekmece ve teraziyi kasaya bağlama.",
    steps: [
      "Windows'a Node.js LTS kurun; Yönetim → Donanım'dan ajan ekleyip eşleme kodunu çalıştırın.",
      "Kurulum betiği ajanı indirir, eşler ve oturum açılışına ekler.",
      "Donanım'dan yazıcıyı (ağ/paylaşım/CUPS/dosya), teraziyi ve marka profilini tanımlayın.",
      "Chrome ilk seferde \"yerel ağdaki cihazlara erişim\" izni sorarsa İzin ver demelidir.",
    ],
    tip: "Türkçe karakter bozuk çıkarsa yazıcı profilinden \"Türkçesiz\" seçin (PC857 desteklemeyen modeller).",
  },
  {
    id: "mali",
    icon: "mali",
    title: "Mali belgeler",
    summary: "Bilgi fişi, e-Arşiv fatura ve ÖKC.",
    steps: [
      "Her satış için bilgi fişi basılır (yasal mali belge değildir).",
      "Ödemede \"Fatura\" seçilirse e-Arşiv fatura kesilir; fişte numara, ETTN ve QR yer alır.",
      "Belgeler Yönetim → Mali'den görüntülenir, yeniden denenir ve e-postayla gönderilir.",
      "Kısmi iadede İADE TUTANAĞI düzenlenir; VKN'li alıcıda iade faturası notu basılır.",
    ],
    tip: "Gerçek e-Arşiv/ÖKC entegratörü hesabı bağlanana kadar mali kesim yerel/sahte sağlayıcıyla kapalıdır.",
  },
  {
    id: "rapor",
    icon: "rapor",
    title: "Raporlar ve veriler",
    summary: "Satış, personel, kârlılık, müşteri raporları ve dışa aktarım.",
    steps: [
      "Yönetim → Raporlar'da Özet, Yoğunluk, Ürünler, Personel, Vardiyalar, Kârlılık ve Müşteriler sekmeleri bulunur.",
      "Tarih çubuğuyla aralık seçilir; CSV (Excel uyumlu) ve Yazdır/PDF düğmeleri kullanılır.",
      "Raporlar → Özet'ten günlük/haftalık e-posta özeti açılır; aylık konsolide rapor yazdırılabilir.",
      "Yönetim → Veriler'den tüm işletme verisi JSON olarak indirilir (sırlar hariç).",
    ],
    tip: "Şubeler sayfasından şube değiştirince Bugün, rapor ve stok o şubeye bakar.",
  },
  {
    id: "abonelik",
    icon: "abonelik",
    title: "Abonelik ve faturalama",
    summary: "Deneme, plan, ödeme ve iptal.",
    steps: [
      "Yeni işletme 14 gün denemeyle başlar; yönetim yazma işlemleri plan aktif olana dek kısıtlıdır.",
      "Kasa hiçbir zaman kilitlenmez; yalnız panel yazma işlemleri aboneliğe bağlıdır.",
      "Yönetim → Abonelik'ten plan seçilir, kartla ödeme yapılır; fatura Mali'de görünür.",
      "İptal ve iade talebi aynı sayfadan oluşturulur; koşullar İptal ve iade sayfasındadır.",
    ],
  },
  {
    id: "guvenlik",
    icon: "guvenlik",
    title: "Güvenlik ve hesap",
    summary: "2FA, oturumlar, e-posta doğrulama ve şifre.",
    steps: [
      "Yönetim → Güvenlik'ten iki adımlı doğrulama (2FA) kurulur; girişte kod sorulur.",
      "Aynı sayfada aktif oturumlar listelenir; diğer cihazlardan çıkış yapılabilir.",
      "Hassas işlemler (PIN/rol değişimi, anahtar üretme, cihaz iptali) hesap şifresi ister.",
      "E-posta doğrulanmamışsa panelde banner görünür; şifre sıfırlama e-postayla yapılır.",
    ],
    tip: "Şifre en az 10 karakter olmalı, harf ve rakam içermeli, sızmış şifreler kabul edilmez.",
  },
];

export const HELP_BY_ID: Record<string, HelpTopic> = Object.fromEntries(HELP_TOPICS.map((t) => [t.id, t]));
