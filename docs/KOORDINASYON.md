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

## Yapıldı (bugün, müdür)

- [x] `700032d` Gerçek restore provası (`npm run db:restore:rehearsal`)
- [x] `f7f410c` Sessiz ajan heartbeat alarmı (5 dk cron)
- [x] `69f1898` Günlük backup workflow'u (secret: `BACKUP_DATABASE_URL` bekliyor)

## Diğer ajanın sırası

- İade tutanağı modülünü bitir (dal adı zaten `iade-tutanak`).
- Platform onay akışının E2E'si (`e2e/`) varsa güncelle.

## İnsan müdahalesi bekleyenler (kod değil)

- GitHub secret `BACKUP_DATABASE_URL`, Vercel env `AGENT_ALERT_WEBHOOK_URL`
- PayTR canlı anahtarları, e-Arşiv entegratörü, hukuk/mali müşavir, DNS

## Birleştirme

Hepimiz `iade-tutanak` dalındayız. İki taraf da commit'ini bitirince müdür
main'e merge eder; gate: lint + typecheck + tam test + build.
