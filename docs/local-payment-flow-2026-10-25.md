# Local ödeme ve açık paket hesabı kontrolü — 25 Ekim 2026

Çalışma yalnız `http://127.0.0.1:3811` ve izole `cabukpos_preview_1792855963497` demo veritabanında yapıldı. Canlı yayın veya gerçek ödeme yoktur.

## Düzeltilen eksik

Paket panosunda teslim edilmiş ama kalan hesabı pozitif bir paket “Teslim ve kapananlar” sütununa düşüyor, ayrıntı düğmesi kilitleniyor ve tahsilata giden yol bulunmuyordu. `DeliveryBoard` artık bu durumda, satış yetkisi olan personele **Açık hesabı tahsil et** düğmesi sunar. İptal/red, tamamen ödenmiş paketler ve platform siparişleri için bu yeni düğme açılmaz. Tahsilat mevcut hesap bölme/ödeme ekranını kullanır; teslim olayı tekrarlanmaz. Açıklama, paranın bu kasanın açık vardiyasına kaydedileceğini belirtir.

Paket hesabı kapanışında “Paketlere dön” yazısı kullanılır. Teslim edilmiş açık hesabı ödeme yapmadan terk etmek de doğrudan paket panosuna döner.

## Gerçek tarayıcı ve sunucu sonucu

Mevcut kullanıcı PIN'leri, açık vardiyalar ve eski satışlar sıfırlanmadı. Ayrı `Yerel Akış Test Kasası` ve `Akış Test Kasiyeri` oluşturuldu. Yalnız bu sahte local personelin PIN'i **246810**. `scripts/prepare-local-register.ts` yalnız localhost ve `cabukpos_preview_<sayı>` DB'sini, `demo@cabukpos.local` hesabını ve `Yerel Demo` işletmesini kabul eder. Aynı fixture yeniden çalıştırıldığında mevcut PIN ve cihaz token'ını değiştirmez.

1. Eşleme ekranından tek kullanımlık test koduyla bağlanıldı; test personelinin mevcut demo PIN'iyle giriş yapıldı.
2. 100 TL açılış nakdiyle yeni test vardiyası açıldı. Boş Masa 3'e iki Adana Kebap eklendi: 570 TL.
3. İki kişiye bölme seçildi. İlk 285 TL pay için 100 TL nakit + 200 TL kart alındı; 15 TL para üstü. `AKIS-000001` sonrasında masa 285 TL açık kaldı.
4. Kalan 285 TL tamamen kartla alındı; `AKIS-000002`, masa kapandı.
5. Önceden teslim edilmiş ama 285 TL açık kalan sahte Demo Ahmet paketinde yeni düğme görüldü ve açıldı. 285 TL kartla `AKIS-000003` üretildi. Hesap kapandı, açık hesap uyarısı ve yeni tahsilat düğmesi kayboldu. “Paketlere dön” doğru panoya döndü.
6. Gün sonu ekranda **3 satış, 855 TL ciro, 85 TL net nakit, 770 TL kart** gösterdi. Beklenen çekmece nakdi 185 TL; sayılan 185 TL ile **fark 0 TL**. Test vardiyası kapatıldı.
7. Sunucu DB'sinde yalnız bu test cihazının kayıtları ayrıca doğrulandı: üç satış, yukarıdaki ödeme toplamları, `expected_cash=counted_cash=18500`, kapalı vardiya ve sıfır `review` uyarısı. Paket teslim olayı hâlâ tek kayıt; ikinci teslim yazılmadı.

HMR derlemesi sırasında ilk açık paket tahsilatının stok kontrolü zaman aşımına uğradı ve satış kaydedilmedi. Derleme tamamlandıktan sonra aynı ödeme tekrarlandı; tek fiş oluştu. SKT kontrolünün hata halinde izin vermeme davranışı korunur.

## Kontroller

- Ödeme, yerel parçalı hesap, vardiya nakdi, teslimat ve hazır akışı: **19/19**.
- Yerel test DB'sinde paket teslimatı, kurye hesabı, adisyon ve satır paylaştırma: **21/21**.
- `npm run qa:static`: ESLint ve TypeScript çıkış 0.
- Gün sonu görsel kanıtı: `/private/tmp/cabukpos-local-flow-close.png`.
- Geliştirme sunucusu ve tamamlanan gün sonu raporu tarayıcıda açık bırakıldı. Üç test satışının ve kapanışın demo geçmişi denemek için korunur.

Bu tur kurye telefonunda yeni bir teslimat tamamlanmadı; o iş kuralları yerel test DB'sindeki testlerle doğrulandı. Üretim derlemesi tekrar çalıştırılmadı; değişen üç bileşen localde derlenip gerçek tarayıcıda kullanıldı, ayrıca tip/lint kontrolünden geçti. Yeni migration, ödeme motoru değişikliği veya yayın yoktur.
