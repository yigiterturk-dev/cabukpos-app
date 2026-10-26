# Ön ödemeli paket — 25–26 Ekim 2026

Başlangıç `50ef91f`. Kullanıcının istediği çalışma local eksikleri tamamlamaktır; canlı yayın veya VPS işlemi yapılmadı.

## Sorun ve düzeltme

Tahsilatla kapanmış, henüz teslim edilmemiş ve kurye atanmış pakette `closed` mali durumunu teslimatın da tamamlanması gibi kullanan yollar vardı. Böyle bir paket kurye iş yükünden düşebiliyor, hazır işleminden dışlanıyor, zamanla yerel temizlikte silinebiliyordu. Ayrıca kısmen ödenmiş ürüne ait mutfak bileti “Hazır” kapsamından çıkıyordu.

- `isDeliveryPending` fiziksel teslimin bekleyip beklemediğini ortak olarak hesaplar. Mali `closed`, satış ve ödeme tutarları değiştirilmez. Masa, teslim/iptal/red edilmiş ve birleştirilmiş işler aktif teslimat sayılmaz. Hiç kuryeye atanmadan tamamen ödenen gel-al paketi yeniden açılmaz.
- Kurye ataması geçmişi mevcut olaylar katlanırken `delivery.everAssigned` olarak türetilir; yeni DB sütunu veya olay şeması yoktur. Ön ödemeli paketten kurye kaldırılınca paket yeni kurye bekleyen iş olarak kalır. Başka kurye seçmek mümkündür.
- Hazır işlemi ödenmiş ürünlerin de fiziksel mutfak biletlerini kapsar. Sunucu yalnız teslim bekleyen, mali olarak kapanmış paket için mutfağa gönderime izin verir; tamamlanmış işlere sonradan gönderim hâlâ inceleme uyarısı üretir. Diğer kapalı hesap değişikliklerinin denetimi korunur.
- Kurye iş yükü ve paket panosunun 12 saatlik görünümü ortak teslim durumunu kullanır. Yerel 24 saatlik temizlik teslim bekleyen paketin olaylarını silmez.
- Paket kartında kısmi ödeme için alınan/kalan tutar, tam ödeme için “Önceden ödendi” ve “Tekrar tahsil etmeyin” gösterilir. Kurye kartı ve teslim penceresinde de önceden alınmış ödeme hatırlatılır. Mali olarak kapanmış karttan boş bir düzenleme ekranına yönlenme engellenir; hazır, kurye değiştirme ve yola çıkarma işlemleri panoda kalır.

## Kanıt

`tests/prepaid-delivery.test.ts` ilk çalışmada hazırlık, iş yükü ve yerel kayıt koruma için üç hatayı tekrar üretti. Düzeltme sonrası kısmi/tam ön ödeme, gel-al/teslim istisnaları, yerel temizlik ve kurye kaldırma testleri geçti.

`tests/delivery-db.test.ts` uygulama DB rolüyle kart ön ödemesi → hazır → yolda → teslim akışını doğrular. Tek satış ve sıfır ek tahsilat kalır; hazırlık/yol/teslim olaylarında inceleme uyarısı oluşmaz. Teslimden sonra yeniden mutfağa gönderimin kapalı hesap uyarısı korunur.

Son kodun tüm testleri **566/566**, `npm run qa:static` çıkış 0. Son salt etiket düzeltmesi ayrıca ESLint'ten geçti. Loglar `/private/tmp/cabukpos-prepaid-full-tests.log`, `/private/tmp/cabukpos-prepaid-static.log`.

## Local ekran denemesi

`http://127.0.0.1:3811`, izole `cabukpos_preview_1792855963497` DB'si. `scripts/seed-prepaid-delivery-demo.ts` yalnız localhost preview DB'sini, sahte demo hesabını ve `Yerel Demo` işletmesini kabul eder. Aynı fixture yeniden çalıştırılınca kayıt çoğaltılmaz. Mevcut PIN'ler, kasalar ve geçmiş satışlar sıfırlanmaz; ayrı iptal edilmiş demo cihazına ait kapanmış geçmiş vardiyada tek kart ön ödemesi oluşturulur. Sağlayıcı çağrısı yoktur.

“Ön Ödemeli Demo” 285 TL kartla önceden ödenmiş, Demo Kurye'ye atanmış bir pakettir. Gerçek tarayıcıda **Hazır** ve **Yola çıkar** düğmeleriyle ilerletildi. Sunucuda kalan 0 TL, tek satış, hazır mutfak bileti, `yolda` durumu ve hazırlık/sevkiyat olaylarında sıfır inceleme uyarısı doğrulandı. Görsel kanıt `/private/tmp/cabukpos-prepaid-delivery.png`.

Paket ekranı bu isimle filtrelenmiş olarak açık bırakıldı. Akış Test Kasiyeri'nin mevcut demo PIN'i `246810`; bu tur açılan sıfır nakitli test vardiyası denemeye devam etmek için açıktır. Önceki 855 TL'lik satış/kapanış kayıtları korunur. Kurye telefonunda teslim düğmesi bu tur kullanılmadı; son teslim adımı yukarıdaki DB testiyle doğrulandı.

Yeni migration veya yayın yoktur. Yerel önbellek koruması test edildi; sunucunun ilk SSE bağlantısında son 24 saatte olayı bulunan adisyonları seçen mevcut başlangıç penceresi bu tur değiştirilmedi. Yepyeni/önbelleksiz cihazda bu süreden eski ve hiç güncellenmemiş işler için tarihsel sorgu kapsamı ayrı bir konudur.
