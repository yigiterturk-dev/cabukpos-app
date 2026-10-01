# Nocturn güvenlik incelemesi

Tarih: 2026-10-01

Nocturn Audit başlangıçta 27 bulgu üretti. Kod ve operasyon kontrollerinden sonra
9 kayıt kaldı; bunların 7'si güvenli uygulama kanıtıyla `resolved`, 2'si ürünün
bilinçli davranışı nedeniyle `false-positive` olarak remediation ledger'a işlendi.
Ledger: `.nocturn/decisions.json`.

## Uygulanan düzeltmeler

- Reset sonrası `tokenVersion` artırılarak eski yönetim oturumları düşürülüyor.
- Backup çıktısı `pg_restore --list` ile oluşturulduğu anda doğrulanıyor.
- Ajan hata heartbeat'leri isteğe bağlı `AGENT_ALERT_WEBHOOK_URL` kanalına bildirilir.
- PayTR callback'i IP rate limit'i ve imza doğrulamasıyla korunur.
- Kasa cihazı gerektiren uçlar ortak `requireAuthDevice` işaretiyle görünür ve
  cihaz/tenant sahipliği sorguda korunur.
- Export dosya adı İstanbul saatine göre üretilir.
- PayTR harici iframe-resizer script'i kaldırıldı; ödeme iframe'i sabit yükseklikle
  çalışır, üçüncü taraf script tedarik zinciri riski azalır.
- Tarayıcıya özel ajan/LAN çağrıları `use client` sınırıyla ayrılır.
- Platform webhook'ları tenant audit log'a yazılır.
- Rate-limit IP kaynağı production'da Vercel'in trusted header'ını, yerelde
  doğrulanmış son forwarded adresi kullanır.
- Drizzle rapor sorguları kullanıcı girdisinden bağımsız sabit şema nesneleriyle
  ve aggregate sorgusuyla çalışır.

## Bilinçli açık uçlar

- `/api/ready` anonimdir; liveness/readiness kontrolü deployment platformunun
  trafiğe karar verebilmesi için kimliksiz kalmalıdır ve yalnızca DB hazır bilgisini
  döndürür.
- `.env.local` yerelde bulunur fakat git tarafından izlenmez; secret sızıntısı
  değildir.
- `execFile`/`spawn` kullanımları yalnızca sabit komutlar, argument array ve timeout
  ile donanım/backup işlemleridir; `shell: true` veya kullanıcı komutu yoktur.

## Doğrulama

- `npm test`: 148/148
- `npm run qa:static`: başarılı
- `npm run build`: başarılı
- Nocturn Audit: 0 kritik, 0 high; remediation ledger'da 0 açık kayıt
