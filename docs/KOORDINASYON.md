# Koordinasyon — ÇabukPOS (2026-10-02)

Aynı repoda paralel çalışan ajanlar alan sahipliği buradan takip eder.
Kural: Başkasının alanındaki dosyaya dokunma; işin bitince commit + buraya satır ekle.

## Durum güncellemesi (2026-10-02)

Müdürlük bu panele (DB/ops ajanı) devredildi: **diğer ajan müdür**, bu panel işçi.
Görev dağılımını müdür belirler; bu panel `db/`, `scripts/`, cron, gözlemlenebilirlik
ve yedekleme alanında emre amade. İletişim: bu dosyaya not bırak, insan aktarır.

## Alan sahipliği

| Alan | Sahip | Kapsam |
|---|---|---|
| İade tutanağı + platform/paket hattı | **Diğer ajan** (yonetim paneli) | `app/yonetim/platformlar`, `lib/admin/delivery-actions.ts`, `lib/platform`, iade tutanağı modülü |
| DB, yedekleme, gözlemlenebilirlik, cron | **Müdür ajan** (bu panel) | `scripts/`, `lib/observability`, `app/api/cron`, `vercel.json`, `db/`, `.github/workflows`, `docs/OPERATIONS.md` |
| Launch checklist + birleştirme | **Müdür ajan** | `docs/LAUNCH-CHECKLIST.md`, main'e merge kararı/gate |
| Kimlik sertleştirme + kök app özel dosyaları + auth testleri | **Lead oturum** (insanın atadığı koordinatör) | `lib/auth`, `lib/site.ts`, `app/error.tsx`, `app/loading.tsx`, `app/robots.ts`, `app/sitemap.ts`, `tests/` |

## Yapıldı (bugün, müdür)

- [x] `700032d` Gerçek restore provası (`npm run db:restore:rehearsal`)
- [x] `f7f410c` Sessiz ajan heartbeat alarmı (5 dk cron)
- [x] `69f1898` Günlük backup workflow'u (secret: `BACKUP_DATABASE_URL` bekliyor)

## Görev dağılımı (2026-10-02, 61 maddelik açık-rapor taramasından)

Kural: kendi alanınla sınırlı çalış, her görevi bitirince commit + buraya `[x]` satırı bırak. Bitirdiğin görevin kapattığı açık-rapor maddesini parantezde yaz.

### Ajan-1 (yonetim paneli) — iade tutanağı bittikten sonra sırayla
1. [x] Yonetim alt sayfalarına `loading.tsx` + `error.tsx` iskeletleri (#56) — `f99c9fd`
2. [x] Bildirim merkezi iskeleti + Nav zil ikonu (#46) — `/yonetim/bildirimler` (canlı kaynaklar: onay bekleyen sipariş, geciken hazırlık, inceleme/mali uyarı) + Nav'da sayaç rozeti
3. [x] `lib/platform`: Getir/Yemeksepeti adaptör arayüzü + sandbox driver (#28 ilk adım) — `b1d9482`; env kapalı varsayılan (`GETIR_ENABLED`, `YS_ENABLED`), canlı anahtar insan işi
4. [x] Kurye akışına durum zaman damgası + gecikme uyarısı (#39 kolay kısmı) — paket hattında kabul/yolda/teslim saatleri + "Gecikti" rozeti (prepMin aşımı)
5. [x] #33 sadakat/hediye kartı/kupon (şema+UI): 6 RLS'li tablo + `lib/loyalty.ts` + `/yonetim/sadakat|kuponlar|hediyekarti` + Nav "Sadakat" grubu + testler; satış anı entegrasyonu (kazanç/harcanma/hediye kartı ödemesi) kasa tarafında ayrı iş — dev DB'ye db:push uygulandı
6. [x] #44 şube UI + kapsam: `/yonetim/subeler` + `cz_sube` çerezi + `lib/admin/store-scope.ts`; bugün/raporlar/stok/platformlar + ilgili aksiyonlar seçili şubeye bakıyor; `delivery-actions` platform kabulü cihazı şubeye göre seçiyor (sıradaki: #37 QR menü/kiosko)
7. [x] #15 abonelik iptal/iade akışı: iade talep→onay kayıtları + 7 gün satışsız koşul yardımcısı + abonelik sayfası iade/iptal UI + testler (`billing-refund`); para iadesi PayTR canlı anahtar bekliyor (sıradaki: #37 QR menü/kiosko)
8. [x] #37 QR menü + kiosko + müşteri ekranı: `/menu/<şube>` (definer fn `public_menu_by_store`), `/api/kiosk` (sır doğrulamalı, rate limitli, tab olaylarına yazar), `/menu/<şube>/s/<tab>` durum ekranı, panelde kiosko bağlantısı + QR; `qrcode` bağımlılığı eklendi (sıradaki: #22 panel offline)
9. [x] #22 panel offline + Background Sync: SW artık `/yonetim` gezinmelerini de ağ-önce/önbellek-sonra tutuyor (`cabukpos-yonetim-v1`; çevrimdışında son kopya → panel girişi), panele `PanelOffline` bandı + SW kaydı/warm eklendi; kasada `registerOutboxSync` (çevrimdışı+kuyruk dolu → SyncManager) + SW `sync` olayı sayfaya `sync-now` mesajı → eşitleme motoru çalışır — `d33e9e3` (sıradaki: #34 pazarlama sağlayıcı)

### Müdür ajan (DB/ops)
1. Sentry/APM iskeleti + uptime kontrolü — `lib/observability` (#57)
2. [x] CI restore provası job'ı — `.github/workflows` (#58) — `ba57d7a`
3. [x] Fiscal backlog escalation: 5/gün limitine takılan kiracı için alarm — `app/api/cron`, `vercel.json` (#21) — `6b79dfd`
4. [x] `db/`: `users.emailVerified` + `users.totpSecret` kolon şeması (2FA/e-posta doğrulama ön hazırlığı; auth tarafını lead oturum yazar) (#1, #4 ön hazırlık) — `54e160a`; ⚠️ yayında `db:push` gerekir

### Lead oturum (koordinatör) — ŞİMDİ YAPIYOR
1. [x] `lib/auth/password.ts`: HIBP sızma şifre kontrolü + sıkı politika (#5) — `31d8e06`
2. [x] `lib/auth/actions.ts`: başarısız girişte hesap kilitleme (#6) — `31d8e06`
3. [x] Kök `app/error.tsx` + `app/global-error.tsx` + `app/loading.tsx` (#56) — `31d8e06`
4. [x] `app/robots.ts` + `app/sitemap.ts` + layout noindex kapısı (#59) — `31d8e06`
5. [x] İlgili birim testleri (#53 kısmi) — `31d8e06`

## İnsan müdahalesi bekleyenler (kod değil)

- GitHub secret `BACKUP_DATABASE_URL`, Vercel env `AGENT_ALERT_WEBHOOK_URL`
- PayTR canlı anahtarları, e-Arşiv entegratörü, hukuk/mali müşavir, DNS

## İş kuyruğu (loop) — 2026-10-02

Tam açık listesi: **`docs/ACIK-RAPORU.md`** (61 madde, P0→P2 sıralı).
Kural: rapordan kendi alanına düşen ilk açık `[ ]`'i al → yap → commit → raporda `[x]` + sha → sıradaki.

- **Ajan-1 sıradaki:** #34 pazarlama sağlayıcı → #20 muhasebe export
- **Müdür sıradaki:** #57 Sentry/APM iskeleti + uptime → #40 kohort/RFM rapor → #43 konsolide rapor
- **Lead sıradaki:** #11+#12 PayTR otomatik yenileme + dunning → #1 2FA → #4 e-posta doğrulama
- **İnsan bekleyen:** PayTR canlı anahtar + **kart saklama (Direct API) sözleşmesi** (#11 için), e-Arşiv/ÖKC entegratör hesabı, SMS/WhatsApp hesabı, Getir/YS API erişimi
- **Müdür notu (#11 bağımlılığı):** `tenants` tablosuna `cardToken text` + `cardMark text` kolonu ekle (#11 otomatik yenileme bunu bekliyor); Lead sonra cron'da tokenli yenileme yazar

## Birleştirme

Hepimiz `iade-tutanak` dalındayız. İki taraf da commit'ini bitirince müdür
main'e merge eder; gate: lint + typecheck + tam test + build.
