import type { Metadata } from "next";
import { SellerBlock } from "@/components/Legal";

export const metadata: Metadata = { title: "KVKK aydınlatma metni ve gizlilik · ÇabukPOS" };

export default function Kvkk() {
  return (
    <>
      <h1 id="main-content" tabIndex={-1} className="rounded-sm outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">KVKK aydınlatma metni ve gizlilik politikası</h1>
      <p>6698 sayılı Kişisel Verilerin Korunması Kanunu (“KVKK”) md. 10 uyarınca, kişisel verilerinizin nasıl işlendiğini açıklarız. Veri sorumlusu:</p>
      <SellerBlock />

      <h2>1. İki farklı rolümüz</h2>
      <ul>
        <li><b>Veri sorumlusu olduğumuz veriler:</b> ÇabukPOS hesabı açan işletme yetkililerinin ve bizimle iletişime geçenlerin verileri.</li>
        <li><b>Veri işleyen olduğumuz veriler:</b> İşletmelerin ÇabukPOS&apos;a girdiği kendi müşteri (ad, telefon, adres, fatura bilgisi), personel (ad, PIN&apos;in geri döndürülemez özeti) ve satış verileri. Bu verilerde veri sorumlusu ilgili işletmedir; talepler öncelikle işletmeye yöneltilmelidir. Biz bu verileri yalnız işletmenin talimatıyla ve Hizmet&apos;i sunmak için işleriz.</li>
      </ul>

      <h2>2. İşlenen veriler (veri sorumlusu olarak)</h2>
      <ul>
        <li><b>Kimlik ve iletişim:</b> ad soyad, e-posta, telefon (kartla ödemede).</li>
        <li><b>Müşteri işlem:</b> işletme adı, vergi numarası ve dairesi, adres, abonelik ve ödeme kayıtları. <b>Kart bilgileri bize ulaşmaz</b>; ödeme kuruluşunun (PayTR) güvenli sayfasında işlenir.</li>
        <li><b>İşlem güvenliği:</b> şifrenin geri döndürülemez özeti, IP adresi, oturum ve cihaz eşleme kayıtları, işlem günlükleri.</li>
      </ul>

      <h2>3. Amaçlar ve hukuki sebepler</h2>
      <ul>
        <li>Hesabın açılması, Hizmet&apos;in sunulması, abonelik ve ödeme süreçleri — sözleşmenin kurulması ve ifası (KVKK md. 5/2-c).</li>
        <li>Fatura, vergi ve ticari kayıt yükümlülükleri — hukuki yükümlülük (md. 5/2-ç).</li>
        <li>Güvenlik, kötüye kullanımın önlenmesi, hata ayıklama, hizmet bildirimleri (deneme bitişi, şifre yenileme) — meşru menfaat (md. 5/2-f).</li>
      </ul>
      <p>Pazarlama iletisi gönderilmez; gönderilecekse ayrıca açık izin istenir.</p>

      <h2>4. Aktarım</h2>
      <p>Veriler yalnız Hizmet&apos;in gerektirdiği ölçüde şu hizmet sağlayıcılara aktarılır: barındırma ve veritabanı (Vercel Inc., Neon Inc.), e-posta gönderimi (Resend), ödeme (PayTR Ödeme ve Elektronik Para Kuruluşu A.Ş.), işletmenin seçtiği e-Arşiv entegratörü ve alan adı/ağ hizmetleri (Cloudflare). Barındırma ve e-posta sağlayıcılarının sunucuları yurt dışında bulunabilir; bu aktarım KVKK md. 9&apos;daki güvencelere (standart sözleşme) dayanılarak yapılır. Yetkili kamu kurumlarına kanunen zorunlu hallerde aktarım yapılabilir.</p>

      <h2>5. Toplama yöntemi</h2>
      <p>Veriler kayıt, yönetim paneli ve kasa ekranlarındaki formlar, ödeme sağlayıcısının bildirimi ve sistem günlükleri aracılığıyla elektronik ortamda otomatik yollarla toplanır.</p>

      <h2>6. Saklama süresi</h2>
      <p>Hesap verileri hesap açık kaldıkça saklanır; hesap kapanınca 30 gün içinde silinir ya da anonimleştirilir. Fatura ve mali kayıtlar vergi mevzuatındaki süreler (genellikle 5–10 yıl) boyunca, güvenlik günlükleri en fazla 2 yıl saklanır.</p>

      <h2>7. Çerezler ve tarayıcı depolama</h2>
      <p>Yalnız zorunlu çerezler kullanılır: yönetim oturumu (<code>cz_session</code>) ve kasa cihaz eşlemesi (<code>cz_device</code>). Kasanın internetsiz çalışabilmesi için satışlar ve katalog tarayıcının yerel depolamasında (IndexedDB) tutulur. Reklam veya analiz çerezi kullanılmaz.</p>

      <h2>8. Haklarınız (KVKK md. 11)</h2>
      <p>Verilerinizin işlenip işlenmediğini öğrenme, bilgi talep etme, amacına uygun kullanılıp kullanılmadığını öğrenme, aktarıldığı üçüncü kişileri bilme, eksik/yanlış işlenmişse düzeltilmesini, şartları oluşmuşsa silinmesini ya da yok edilmesini ve bunların aktarılanlara bildirilmesini isteme, münhasıran otomatik analiz sonucu aleyhinize bir sonuca itiraz etme ve kanuna aykırı işleme nedeniyle zararın giderilmesini talep etme haklarına sahipsiniz.</p>
      <p>Başvurularınızı yukarıdaki e-posta ya da KEP adresine, veya yazılı olarak adrese iletebilirsiniz. Başvurular en geç 30 gün içinde ücretsiz sonuçlandırılır.</p>

      <h2>9. Güvenlik</h2>
      <p>Veriler şifreli bağlantı (HTTPS) ile iletilir; işletmelerin verileri veritabanında satır düzeyi güvenlikle birbirinden ayrılır; şifre ve PIN&apos;ler geri döndürülemez biçimde saklanır; erişimler kayıt altına alınır.</p>
    </>
  );
}
