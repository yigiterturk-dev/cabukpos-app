# Personel vardiya planı ve görev takibi

`/yonetim/personel-plan` seçili şubede haftalık çalışma vardiyası ve görev yönetimidir. Personel sayfasından ve yönetim menüsünden açılır. Personel, tür ve durum filtreleri; önceki/sonraki hafta; düzenleme; mola ve çalışma süresi; görev durumları; yazdır/PDF bulunur. İptaller silinmez, durum filtresinden görülür.

Türkiye saati kullanılır. Gece vardiyasının bitişi açıkça ertesi güne girilir. Vardiya en fazla 24 saat, görev aralığı en fazla 31 gün olabilir. Mola vardiyadan kısa olmalıdır. Haftalık toplam, başlangıç günü bu haftaya düşen ve iptal edilmemiş çalışma planlarının tam süresidir; gece vardiyasının sonraki güne taşan süresi bölünmez. Görev süreleri çalışma saati toplamına eklenmez.

Çalışma vardiyası çakışması aynı kiracı/personel için tüm şubelerde kontrol edilir. Bitişik zamanlar kabul edilir; görevler çalışma vardiyası içinde atanabilir. Personel kilitleri tutarlı sırayla alınır; eşzamanlı çakışan kayıtlar birlikte geçmez. İptalden geri alma da çakışma kontrolünden geçer. Bu kontrol uygulama servisindedir; doğrudan SQL yazan ayrı bir servis aynı kuralı kullanmalıdır.

Kaydın revision numarası eskiyse düzenleme ve durum değişimi reddedilir; başkasının güncellemesi ezilmez. Oluşturma isteği aynı kimlikle tekrarlanırsa aynı plan döner. Başarısız form gönderimi taslağı korur. Yeni plan yalnız aktif personele atanır. Her yazmada şube kapsamı ve personelin kiracısı doğrulanır; değişiklikler denetim kaydına yazılır. Server action, yönetici oturumu, CSRF ve abonelik yazma yetkisini mevcut `requireWriter` üzerinden denetler.

Bu planlar kasa vardiyası, fiilî giriş/çıkış, bordro veya ücret kaydı oluşturmaz. Görev durumu yöneticinin manuel kaydıdır; ayrı bir çalışan mobil uygulaması veya bildirim gönderimi eklenmedi.

## Migration incelemesi

`db/releases/2026-10-25-staff-plans.sql`: PostgreSQL 16+, yeni ve başlangıçta boş `staff_plans` tablosu, iki indeks, FK ve kontrol kısıtları. FORCE RLS ve kiracı politikası tabloyla aynı işlemde açılır. Backfill, eski tablo/satır güncellemesi ve silme yok. FK kurulumunda üst tablolarda kısa kilit ihtimali vardır; 3 saniye lock ve 15 saniye statement sınırıyla başarısızlıkta işlem geri alınır.

Yerel PostgreSQL 16.13 üzerinde demo ve test veritabanına iki kez uygulandı; mevcut satış sayısı demo 96, test 0 olarak korundu. İki uygulama toplamı demo 27 ms, test 24 ms sürdü. FORCE RLS etkinliği kontrol edildi. Migration tarayıcısının indeks ve RLS kilit adayları, yeni boş tablo bağlamında değerlendirildi.

Karar: belirtilen küçük yerel koşullarda hazır; canlıya uygulanmadı. Canlı dağıtımdan önce doğrulanmış yedek/geri yükleme, tablo adının/şemanın beklenen durumu ve kilit trafiği kontrol edilmelidir. Sıra: SQL → yeni uygulama → yetki/çakışma smoke testi. Zaman aşımında sebep çözülmeden sınırlar artırılmaz. Eski kod yeni tabloyu kullanmaz; kod geri alınırken plan verilerini silmek gerekmez. Üretimde otomatik tablo silme veya veri kayıplı geri dönüş önerilmez.

## Doğrulama

Saf testler: gece vardiyası, UTC/Türkiye dönüşümü, mola, yanlış tarih, uzun/ters aralık, görev süresi ve yıl değiştiren hafta hesabı.

Veritabanı testleri: aynı isteğin tekrarı, şubeler arası çakışma, bitişik vardiya, vardiya içinde görev, eşzamanlı oluşturma, iptal/geri alma, revision çakışması, görev tamamlama, pasif/yabancı personel, şube müdürü kapsamı, RLS doğrudan yazma ve DB zaman kısıtı.

Sonuç: 531/531 test geçti; ESLint, TypeScript ve diff kontrolü temiz. Tarayıcıda vardiya/görev oluşturma, çakışma hatası ve taslak koruma, gece vardiyasını düzenleme ve görev tamamlama doğrulandı. 390 px mobil ve 1024 px tablet genişliklerinde yatay taşma yok. Yerel demoda 26 Ekim haftasına iki vardiya ve bir tamamlanan görev bırakıldı: `/yonetim/personel-plan?week=2026-10-26`.
