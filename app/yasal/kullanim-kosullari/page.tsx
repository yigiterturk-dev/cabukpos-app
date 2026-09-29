import type { Metadata } from "next";
import Link from "next/link";
import { SellerBlock } from "@/components/Legal";

export const metadata: Metadata = { title: "Kullanım koşulları · ÇabukPOS" };

export default function KullanimKosullari() {
  return (
    <>
      <h1>Kullanım koşulları</h1>
      <p>Bu koşullar ÇabukPOS bulut satış noktası hizmetinin (“Hizmet”) kullanımını düzenler. Hesap oluşturan işletme (“Kullanıcı”) bu koşulları kabul etmiş sayılır. Hizmeti sunan:</p>
      <SellerBlock />

      <h2>1. Hizmet</h2>
      <p>ÇabukPOS; restoran ve marketler için web tabanlı kasa, adisyon, mutfak ekranı, paket servis, stok, reçete, raporlama ve ilgili yönetim araçlarını sunar. Kasa ekranı internet kesintisinde çalışmaya devam eder ve bağlantı gelince verileri eşitler. Yazıcı, para çekmecesi ve terazi için kasadaki bilgisayara kurulan ÇabukPOS ajanı kullanılır.</p>

      <h2>2. Hesap ve güvenlik</h2>
      <ul>
        <li>Kayıtta verilen bilgilerin doğru olması ve güncel tutulması Kullanıcı&apos;nın sorumluluğundadır.</li>
        <li>Yönetim şifresi, personel PIN&apos;leri ve cihaz eşleme kodları gizli tutulmalıdır. Hesap üzerinden yapılan işlemler Kullanıcı&apos;ya aittir.</li>
        <li>Yetkisiz kullanım fark edilirse derhal bize bildirilmelidir.</li>
      </ul>

      <h2>3. Deneme, ücret ve abonelik</h2>
      <ul>
        <li>Yeni hesaplar 14 gün ücretsiz deneme ile açılır.</li>
        <li>Ücretli dönem aylık ya da yıllık olarak peşin ödenir; fiyatlar KDV dahildir ve Abonelik sayfasında gösterilir. <b>Otomatik yenileme yoktur</b>: dönem bitince yeniden ödeme yapılmazsa abonelik uzamaz.</li>
        <li>Deneme ya da ücretli dönem bittikten sonra 7 gün ek süre tanınır. Ek süre de bitince yönetim paneli salt okunur olur; <b>kasa satışa devam eder</b> ve veriler silinmez. Ödeme yapılınca yönetim hemen açılır.</li>
        <li>İptal ve iade esasları <Link href="/yasal/iade-iptal">İptal ve iade</Link> sayfasındadır.</li>
      </ul>

      <h2>4. Mali mevzuat</h2>
      <p>ÇabukPOS&apos;un bastığı <b>bilgi fişi mali belge değildir</b>. ÖKC (yazar kasa) kullanımı, e-Arşiv/e-Fatura düzenleme ve vergi mevzuatından doğan diğer yükümlülükler Kullanıcı&apos;ya aittir. e-Arşiv özelliği, Kullanıcı&apos;nın anlaştığı özel entegratör aracılığıyla çalışır; belgelerin içeriği Kullanıcı&apos;nın girdiği ürün, fiyat ve KDV bilgilerine dayanır.</p>

      <h2>5. Veriler</h2>
      <ul>
        <li>Kullanıcı&apos;nın Hizmet&apos;e girdiği satış, ürün, müşteri ve personel verileri Kullanıcı&apos;ya aittir. Bu verilerde Kullanıcı veri sorumlusu, ÇabukPOS veri işleyendir; ayrıntı <Link href="/yasal/kvkk">KVKK ve gizlilik</Link> metnindedir.</li>
        <li>Raporlar CSV olarak dışa aktarılabilir. Hesap kapatılırsa veriler, yasal saklama yükümlülükleri dışında, 30 gün sonra silinir.</li>
        <li>Kullanıcı, izin verdiği ajans ya da entegrasyonların (ör. ajans anahtarı) verilere erişiminden sorumludur ve bu izinleri dilediği an iptal edebilir.</li>
      </ul>

      <h2>6. Kabul edilebilir kullanım</h2>
      <p>Hizmet hukuka aykırı amaçlarla, başkalarının haklarını ihlal edecek şekilde ya da sistemin güvenliğini ve işleyişini bozacak biçimde (yetkisiz erişim denemesi, aşırı otomatik istek, tersine mühendislikle kötüye kullanım vb.) kullanılamaz. Aykırılıkta hesap askıya alınabilir.</p>

      <h2>7. Hizmet düzeyi ve sorumluluk</h2>
      <ul>
        <li>Hizmet&apos;in kesintisiz ve hatasız çalışması için makul özen gösterilir; ancak bakım, altyapı sağlayıcı kesintileri ve mücbir sebepler nedeniyle kesinti olabilir. Kasanın çevrimdışı çalışması bu riski azaltmak içindir.</li>
        <li>Dolaylı zararlar, kâr kaybı ve veri girişi hatalarından doğan sonuçlardan sorumluluk kabul edilmez. Her durumda toplam sorumluluk, zarara yol açan olaydan önceki 12 ayda Kullanıcı&apos;nın ödediği abonelik bedeliyle sınırlıdır. Kanunen sınırlanamayan sorumluluklar saklıdır.</li>
      </ul>

      <h2>8. Değişiklik ve fesih</h2>
      <p>Koşullar güncellenebilir; önemli değişiklikler yürürlükten önce e-posta ya da panel üzerinden duyurulur. Kullanıcı hesabını dilediği an kapatabilir. Koşullara aykırılıkta ÇabukPOS hesabı bildirimle askıya alabilir ya da kapatabilir.</p>

      <h2>9. Uygulanacak hukuk</h2>
      <p>Bu koşullara Türkiye Cumhuriyeti hukuku uygulanır. Uyuşmazlıklarda, tüketici sıfatı taşıyanlar için kanuni tüketici hakem heyetleri ve tüketici mahkemeleri; diğer durumlarda Satıcı&apos;nın merkezinin bulunduğu yer mahkemeleri ve icra daireleri yetkilidir.</p>
    </>
  );
}
