import type { Metadata } from "next";
import Link from "next/link";
import { SellerBlock } from "@/components/Legal";
import { planPrice } from "@/lib/billing/plans";
import { formatTL } from "@/lib/core/money";

export const metadata: Metadata = { title: "Mesafeli satış sözleşmesi · ÇabukPOS" };
export const dynamic = "force-dynamic";

export default function MesafeliSatis() {
  const [m, y] = [planPrice("aylik"), planPrice("yillik")];
  return (
    <>
      <h1>Mesafeli satış sözleşmesi</h1>
      <h2>1. Taraflar</h2>
      <p><b>Satıcı:</b></p>
      <SellerBlock />
      <p><b>Alıcı:</b> ÇabukPOS&apos;ta hesap açıp abonelik ödemesi yapan işletme; bilgileri (unvan, adres, vergi bilgisi, e-posta) hesap ve ödeme sırasında verilen bilgilerdir.</p>

      <h2>2. Konu</h2>
      <p>Sözleşmenin konusu, Alıcı&apos;nın elektronik ortamda satın aldığı ÇabukPOS bulut satış noktası yazılım hizmeti aboneliğinin (aylık ya da yıllık) sunulmasına ilişkin tarafların hak ve yükümlülükleridir. Hizmetin kapsamı <Link href="/yasal/kullanim-kosullari">Kullanım koşulları</Link>nda tanımlıdır.</p>

      <h2>3. Bedel ve ödeme</h2>
      <ul>
        <li>Aylık abonelik: {m ? formatTL(m) : "Abonelik sayfasında gösterilen tutar"}; yıllık abonelik: {y ? formatTL(y) : "Abonelik sayfasında gösterilen tutar"}. Fiyatlara KDV dahildir.</li>
        <li>Ödeme, PayTR güvenli ödeme sayfasında kredi/banka kartıyla peşin ve tek çekim alınır. Kart bilgileri Satıcı&apos;ya iletilmez.</li>
        <li><b>Otomatik yenileme ve kayıtlı karttan otomatik çekim yoktur.</b> Her dönem Alıcı&apos;nın ayrı ödemesiyle başlar.</li>
        <li>Ödemeye ilişkin fatura, Alıcı&apos;nın hesabındaki bilgilere göre elektronik ortamda düzenlenir.</li>
      </ul>

      <h2>4. İfa</h2>
      <p>Hizmet, ödemenin ödeme kuruluşunca onaylanmasıyla anında elektronik ortamda ifa edilir: abonelik süresi Alıcı&apos;nın hesabına işlenir. Fiziksel teslimat yoktur. Süre, mevcut dönemin (deneme ya da ücretli) bitişine eklenir.</p>

      <h2>5. Cayma hakkı</h2>
      <p>Alıcı ticari ya da mesleki amaçla hareket eden bir işletme ise 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği uygulanmaz. Alıcı&apos;nın tüketici sayıldığı hallerde; Mesafeli Sözleşmeler Yönetmeliği md. 15/1-ğ uyarınca elektronik ortamda anında ifa edilen hizmetlerde cayma hakkı kullanılamaz. Alıcı ödemeyi onaylarken bunu kabul eder. Bununla birlikte iade esasları <Link href="/yasal/iade-iptal">İptal ve iade</Link> sayfasında düzenlenmiştir.</p>

      <h2>6. Tarafların yükümlülükleri</h2>
      <ul>
        <li>Satıcı, hizmeti Kullanım koşullarına uygun sunmakla yükümlüdür.</li>
        <li>Alıcı, hesap ve fatura bilgilerini doğru vermek ve hizmeti koşullara uygun kullanmakla yükümlüdür.</li>
        <li>Kartın yetkisiz kullanımı nedeniyle banka ödemeyi Satıcı&apos;ya ödemezse ilgili dönem hesaba işlenmez ya da geri alınır.</li>
      </ul>

      <h2>7. Uyuşmazlık</h2>
      <p>Uyuşmazlıklarda Türk hukuku uygulanır. Alıcı tüketici ise, Ticaret Bakanlığınca ilan edilen parasal sınırlar dahilinde Alıcı&apos;nın yerleşim yerindeki tüketici hakem heyetine ya da tüketici mahkemesine başvurabilir. Diğer durumlarda Satıcı&apos;nın merkezinin bulunduğu yer mahkemeleri ve icra daireleri yetkilidir.</p>

      <h2>8. Yürürlük</h2>
      <p>Alıcı, ödeme sayfasında ödemeyi onayladığında bu sözleşmenin ve Kullanım koşullarının tüm hükümlerini okuduğunu ve kabul ettiğini beyan eder. Sözleşme, ödemenin onaylandığı an yürürlüğe girer ve elektronik ortamda saklanır.</p>
    </>
  );
}
