import type { Metadata } from "next";

export const metadata: Metadata = { title: "İptal ve iade · ÇabukPOS" };

export default function IadeIptal() {
  return (
    <>
      <h1 id="main-content" tabIndex={-1} className="rounded-sm outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">İptal ve iade koşulları</h1>
      <h2>Deneme</h2>
      <p>14 günlük deneme ücretsizdir ve kart bilgisi istenmez. Deneme bitince ödeme yapılmazsa herhangi bir ücret doğmaz.</p>

      <h2>İptal</h2>
      <ul>
        <li>Abonelik otomatik yenilenmez; yeni dönem için ödeme yapmamanız aboneliği sona erdirmek için yeterlidir. Ayrıca iptal işlemi gerekmez.</li>
        <li>Dönem bitince 7 günlük ek süre sonrasında yönetim paneli salt okunur olur; kasa satışa devam eder, verileriniz silinmez.</li>
        <li>Hesabınızı ve tüm verilerinizi <b>Yönetim → Veri yönetimi</b> sayfasından kendiniz kalıcı olarak silebilirsiniz (işletme sahibi, işletme adı ve şifre onayıyla). Silmeden önce veri kopyanızı aynı sayfadan JSON olarak indirin.</li>
      </ul>

      <h2>İade</h2>
      <ul>
        <li><b>Hatalı ya da mükerrer çekimler</b> tespit edildiğinde tam olarak iade edilir.</li>
        <li>Ödemeden sonraki <b>7 gün içinde</b>, ilgili dönemde kasada hiç satış yapılmamışsa talep üzerine ödeme tam olarak iade edilir.</li>
        <li>Bunun dışında başlamış dönemin bedeli iade edilmez; dönem sonuna kadar hizmet kullanılmaya devam eder.</li>
        <li>Hizmetin Satıcı kaynaklı nedenlerle uzun süre sunulamadığı hallerde, kullanılamayan süreye düşen bedel iade edilir ya da süre uzatılır.</li>
      </ul>

      <h2>Nasıl başvurulur, ne zaman yansır?</h2>
      <p>İade talebinizi hesabınızın e-postasıyla İletişim sayfasındaki adrese iletin. Onaylanan iadeler ödemenin yapıldığı karta, ödeme kuruluşu (PayTR) aracılığıyla yapılır; kartınıza yansıma süresi bankanıza göre genellikle 2–10 iş günüdür.</p>
    </>
  );
}
