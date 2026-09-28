# ÇabukPOS M2 — Çevrimdışı kasa

Spec §4 + §9 (M2): service worker, IndexedDB, katalog/satış eşitleme, idempotent API. Kabul: internet kesikken satış → bağlanınca bulutta tek kayıt.

## Kararlar
- **Kasa istemci uygulaması.** `/kasa` statik kabuk + `KasaApp` (client). Veri IndexedDB'de (Dexie): `meta` (cihaz, katalog, vardiya, fiş sayacı, PIN kilidi), `sales` (yerel fiş/gün sonu için), `outbox` (sıralı belgeler), `rejected`.
- **Kasiyer çevrimdışı PIN.** Personel PIN hash'leri katalogla iner (`no-store`), `verifyPin` tarayıcıda. 5 yanlış → 5 dk kilit (IDB'de). Kasiyer oturumu bellekte; sayfa yenilenince PIN yeniden. Kasiyer çerezi ve PIN sunucu eylemi kalkar.
- **Fiş no cihazda.** Sayaç IDB'de, başlangıç `max(yerel, devices.next_receipt_no)`; bulut her satışta `next_receipt_no = greatest(…, no+1)`. Aynı cihazda aynı no farklı satışla gelirse (IDB silinmişse) `-2` ekiyle kaydedilir, `review` işaretlenir.
- **Tek yazma yolu.** Çevrimiçi de olsa satış, vardiya açma ve gün sonu kapama giden kutusuna yazılır, hemen eşitleme tetiklenir. `POST /api/sync/push` FIFO parti (≤50), belge başına `ok | rejected`. Geçici hata (ağ, 5xx) → artan bekleme (2 s → 5 dk). 401 → cihaz kilitli ekranı.
- **Bulut tamamlanmış satışı reddetmez.** Satır adı/fiyatı/KDV'si istemci anlık görüntüsü; toplamlar sunucuda saf çekirdekle yeniden hesaplanır. Ürün yok/pasif ya da fiyat farklı → kaydet + `sales.review` nedeni. Reddedilen yalnız biçimi bozuk / başka kiracıya ait kimlik taşıyan belge.
- **Vardiya kimliği istemcide.** `shift_open {id, openedBy, openedAt, openingCash}`, `shift_close {id, closedBy, closedAt, countedCash}`; beklenen kasa bulutta, o vardiyanın satışlarından (FIFO sayesinde tamam). Gün sonu raporu kasada yerel satışlardan (`summarizeShift`), yönetimde buluttan.
- **Katalog aşağı.** `GET /api/sync/catalog?v=<özet>`: cihaz + açık vardiya + fiş sayacı her seferinde; katalog (kategori, ürün, personel) yalnız özet (sha256) değiştiyse. Spec'teki artan sayaç yerine içerik özeti: yönetim eylemlerinde sayaç artırmayı unutma riski yok, silmeler de yakalanır. Çekme: açılışta, 60 sn'de bir, çevrimiçi olunca.
- **Service worker** `public/sw.js`: `/kasa` gezinmesi ağ-önce → önbellek; `/_next/static` önbellek-önce. Sayfa ilk çevrimiçi yüklemede kendi JS/CSS/font kaynaklarını Cache API ile önbelleğe koyar (ilk yükleme SW denetiminde değil), eski statik dosyaları budar.
- `app/kasa/fis/[id]` ve `app/kasa/gun-sonu` sunucu sayfaları kalkar; fiş ve gün sonu KasaApp içinde yerel veriden.

## Görevler
1. Şema: `sales.review text`, `sales.synced_at`; `lib/sync/docs.ts` (zod belge şemaları), `lib/sync/apply.ts` (bulutta uygula) + `tests/sync.test.ts`. `lib/kasa/sale.ts` → apply'a taşınır.
2. API: `app/api/sync/catalog/route.ts`, `app/api/sync/push/route.ts` (cihaz çerezi).
3. İstemci çekirdeği: `lib/offline/db.ts` (Dexie), `lib/offline/sync.ts` (çekme/itme, bekleme), `lib/offline/receipt.ts` (saf: fiş no, bekleme süresi, satış belgesi) + birim test.
4. KasaApp: PIN, vardiya aç, satış, fiş görünümü, gün sonu, çevrimdışı göstergesi + bekleyen sayısı.
5. SW + kayıt + manifest.
6. E2E: `e2e/m1.mjs` yeni arayüze uyar; `e2e/m2.mjs`: çevrimiçi satış → offline → sayfa yenile (SW) → PIN → 2 satış (bekleyen 2) → online → bekleyen 0 → yönetim raporunda 3 satış, her biri bir kez; aynı partiyi elle ikinci kez gönder → çift kayıt yok.
7. Kapı: test + lint + tsc + E2E yerel; prod şema (`sales.review`, `synced_at`) sahip URL'siyle push, main, canlı E2E.
