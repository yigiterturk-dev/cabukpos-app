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
1. Yonetim alt sayfalarına `loading.tsx` + `error.tsx` iskeletleri (#56)
2. Bildirim merkezi iskeleti + Nav zil ikonu (#46)
3. `lib/platform`: Getir/Yemeksepeti adaptör arayüzü + sandbox driver (#28 ilk adım)
4. Kurye akışına durum zaman damgası + gecikme uyarısı (#39 kolay kısmı)

### Müdür ajan (DB/ops)
1. Sentry/APM iskeleti + uptime kontrolü — `lib/observability` (#57)
2. CI restore provası job'ı — `.github/workflows` (#58)
3. Fiscal backlog escalation: 5/gün limitine takılan kiracı için alarm — `app/api/cron`, `vercel.json` (#21)
4. `db/`: `users.emailVerified` + `users.totpSecret` kolon şeması (2FA/e-posta doğrulama ön hazırlığı; auth tarafını lead oturum yazar) (#1, #4 ön hazırlık)

### Lead oturum (koordinatör) — ŞİMDİ YAPIYOR
1. `lib/auth/password.ts`: HIBP sızma şifre kontrolü + sıkı politika (#5)
2. `lib/auth/actions.ts`: başarısız girişte hesap kilitleme (#6)
3. Kök `app/error.tsx` + `app/global-error.tsx` + `app/loading.tsx` (#56)
4. `app/robots.ts` + `app/sitemap.ts` + layout noindex kapısı (#59)
5. İlgili birim testleri (#53 kısmi)

## İnsan müdahalesi bekleyenler (kod değil)

- GitHub secret `BACKUP_DATABASE_URL`, Vercel env `AGENT_ALERT_WEBHOOK_URL`
- PayTR canlı anahtarları, e-Arşiv entegratörü, hukuk/mali müşavir, DNS

## Birleştirme

Hepimiz `iade-tutanak` dalındayız. İki taraf da commit'ini bitirince müdür
main'e merge eder; gate: lint + typecheck + tam test + build.
