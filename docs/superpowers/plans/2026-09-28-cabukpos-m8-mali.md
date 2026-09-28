# ÇabukPOS M8 — Mali belge katmanı (bilgi fişi + sahte e-Arşiv)

Spec: `docs/superpowers/specs/2026-09-28-cabukpos-m8-mali-design.md` (onaylandı 2026-09-28). Dal `m8-mali` (main bce4c84 üstünde).

## Görevler

### 1. Saf çekirdek + test
- `lib/core/fiscal.ts`:
  - `FISCAL_CHANNELS = ["kasa","masa","paket","platform"]`, `type DocMode = "info" | "earsiv"`, `type ChannelModes = Record<Channel, DocMode>`, `DEFAULT_MODES` (hepsi `info`).
  - `validateTaxId(s) → "vkn" | "tckn" | null`: 10 hane VKN algoritması (her hane `(d + 10 - i) % 10`, `* 2^(9-i) % 9`, 9 ise 9; toplam son hane kontrolü); 11 hane TCKN (ilk hane ≠ 0, 10. ve 11. hane kuralları); `11111111111` → `"tckn"` (nihai tüketici).
  - `NIHAI_TUKETICI = { taxId: "11111111111", name: "Nihai Tüketici" }`.
  - `docModeFor(channel, modes, invoiceRequested) → DocMode` (istek varsa `earsiv`).
  - `formatNumber(series, year, n)` → `CBP2026000000001` (seri `^[A-Z0-9]{3}$`, n 1..999_999_999).
  - `nextRetryDue(attempts, lastTry: Date) → Date | null` (1 → +1 dk, 2 → +5, 3 → +15, 4 → +60, ≥5 → null).
  - `buyerSchema` (zod): `taxId` (validateTaxId), `name` 1..200, `email` isteğe bağlı e-posta, `address` 0..500; VKN ise adres zorunlu (`superRefine`).
  - `newFiscalToken()` → 24 karakter base64url (`crypto.getRandomValues`, istemci+sunucu ortak).
- `lib/fiscal/provider.ts`: `IssueInput`, `IssueResult`, `CancelResult`, `FiscalProvider` (spec'teki imza); `getProvider(name, opts: { fakeFail: boolean })` kayıt defteri.
- `lib/fiscal/fake.ts`: `fakeEarsiv(opts)`; `issue` → `fakeFail` ise `{ok:false, error:"Sahte sağlayıcı: hata simülasyonu", retryable:true}`, değilse `{ok:true, ettn: randomUUID(), number: input.number}`; `cancel` → `issuedAt` 7 günden eskiyse `{ok:false, error:"İptal süresi geçti"}`.
- Testler: `tests/fiscal.test.ts` (algoritmayla geçerli bir VKN örneği üretip sabitle + son hanesi değiştirilmiş geçersiz hâli; TCKN `10000000146` geçerli, `10000000147` geçersiz; nihai tüketici; docModeFor 4 kanal × istek; formatNumber; nextRetryDue sınırları; buyerSchema VKN adres zorunluluğu; sahte sürücü üç durum).

### 2. Şema + RLS + SECURITY DEFINER
- `db/schema.ts`:
  - `tenants` ekleri: `taxId text null`, `taxOffice text null`, `address text null`.
  - `fiscalDocStatus` enum (`pending, issued, error, cancelled, cancel_rejected`).
  - `fiscalSettings` (tenant pk → tenants cascade, `provider text default 'fake-earsiv'`, `series text default 'CBP'`, `counter int default 0`, `channelModes jsonb default DEFAULT_MODES`, `fakeFail bool default false`, `updatedAt`).
  - `fiscalDocuments` (spec alanları; `saleId` unique → sales cascade; `token` unique; index `(tenant_id, status)`).
- `db/rls.sql`: listeye `fiscal_settings`, `fiscal_documents`; ardından
  - `fiscal_doc_by_token(p_token text)` `security definer set search_path = public`, `returns jsonb`: belge + `sale_lines` (ad, miktar, birim fiyat, KDV, toplam) + `sales.vat/total/created_at/receipt_no` + tenant adı/vergi no/daire/adres + mağaza adı/adresi; yoksa null. `grant execute … to cabukpos_app`.
  - `fiscal_pending_tenants()` `returns setof uuid`: `status in ('pending','error') and attempts < 5` olan belgelerin kiracıları (distinct).
- `npm run db:push:test && npm run db:rls:test`.
- `tests/fiscal-db.test.ts` (yalnız şema kısmı): uygulama rolüyle başka kiracının belgesini göremez; `fiscal_doc_by_token` kiracı bağlamı olmadan çalışır.

### 3. Sunucu: kesim, yeniden deneme, iptal, e-posta
- `lib/fiscal/issue.ts`:
  - `issueOne(tenantId, saleId) → { status, number?, ettn?, token }`: `withTenant` içinde `select … for update skip locked` (`pending|error`, kilit alınamazsa mevcut durumu döndür); ayar + satış + satırlar + tenant vergi bilgisi → `IssueInput`; `counter` `update … returning` ile artar, numara `formatNumber`; sürücü `issue`; başarı → `issued`, `ettn`, `number`, `issuedAt`; hata → `attempts+1`, `lastError`, `status='error'`, `retryable:false` ise `attempts = 5`. Hata durumunda `counter` artışı geri alınmalı: sürücü çağrısı işlem içinde yapılır, hatada `counter` eski değere yazılır (aynı işlem).
  - `processDue(tenantId, limit = 5)`: `nextRetryDue` vadesi gelmiş `pending|error` belgeler (`attempts < 5`, en eski önce) → `issueOne`; sonra bekleyen iptaller (`cancelOne`) ve gönderilmemiş e-postalar.
  - `cancelOne(tenantId, docId)` ve `onRefund(tx, tenantId, refundSaleId, refundOf)`: iade eşitlemesinde çağrılır; asıl belge `issued` ve iadeler toplamı (bu dahil) = asıl toplam → belgeye `lastError='iptal bekliyor'` işareti (durum `issued` kalır), iptali `processDue`/push sonrası `after()` `cancelOne` ile yapar → `cancelled` ya da sağlayıcı reddinde `cancel_rejected`; kısmi → hemen `cancel_rejected`, `lastError='kısmi iade'`.
  - `sendMail(doc)`: `RESEND_API_KEY` + `MAIL_FROM` varsa `fetch("https://api.resend.com/emails")` (bağımlılık yok), konu "e-Arşiv faturanız — <işletme>", gövde bağlantı `${APP_URL}/f/${token}`; başarı → `emailSentAt`. Yoksa sessizce atlar.
- `lib/sync/docs.ts`: `sale` belgesine isteğe bağlı `fiscal: z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{24}$/), buyer: buyerSchema.nullable() }).optional()`.
- `lib/sync/apply.ts`:
  - `applySale`: `write` sonrası `docModeFor(channel, settings.channelModes, !!doc.fiscal?.buyer)`; `earsiv` ise `fiscalDocuments` insert (`onConflictDoNothing`), alıcı `doc.fiscal?.buyer ?? NIHAI_TUKETICI`, `token = doc.fiscal?.token ?? newFiscalToken()`. Kiracının vergi bilgisi eksikse belge yine açılır, `issueOne` `retryable:false` hata verir ("İşletme vergi bilgisi eksik").
  - `applyRefund`: `write` sonrası `onRefund`.
- `app/api/sync/push/route.ts`: yanıt döndükten sonra değil, döngü bitince `await processDue(device.tenantId).catch(() => {})` (Vercel'de yanıt sonrası iş garanti değil → `after()` kullan: `import { after } from "next/server"`).
- `app/api/fiscal/issue/route.ts` (POST, cihaz kimliği): `{ saleId }` → `issueOne`; yanıt `{ status, number, ettn, token }`.
- `app/api/cron/fiscal/route.ts` (GET): `authorization: Bearer ${CRON_SECRET}` değilse 401; sahip bağlantısı gerekmez — `fiscal_pending_tenants()` definer; her kiracı `processDue(t, 20)`. `vercel.json`: `{"crons":[{"path":"/api/cron/fiscal","schedule":"0 3 * * *"}]}`.
- `tests/fiscal-db.test.ts` ekleri: kanal `paket=earsiv` → paket satışı `pending` → `issueOne` → `issued`, numara `CBP<yıl>000000001`; kasa satışı `fiscal.buyer` ile → belge; `info` kanal + istek yok → belge yok; aynı satış iki kez eşitlenir → tek belge; `fakeFail` → `error`, `attempts=1`, counter artmamış; ikinci deneme vadesi gelmeden `processDue` atlar; `retryable:false` (vergi bilgisi yok) → `attempts=5`; tam iade → `cancelled`; kısmi iade → `cancel_rejected`; 8 günlük satış iadesi → `cancel_rejected`; eşzamanlı iki `issueOne` → tek numara.

### 4. Kasa: fatura formu, fişte ETTN/QR
- Katalog (`app/api/sync/catalog/route.ts`): `fiscal: { modes: ChannelModes, provider }` (ayar yoksa `DEFAULT_MODES`).
- `lib/offline/db.ts` `recordSaleLocal(…, fiscal?: { buyer: Buyer | null })`: kanal modu `earsiv` ya da `buyer` varsa `token = newFiscalToken()`; satış belgesine `fiscal`; `LocalSale.fiscal = { token, buyer, number: null, ettn: null }`. Kanal: tab yoksa `kasa`, tab'da `tab.kind`.
- `components/kasa/InvoiceForm.tsx`: VKN/TCKN, ad/unvan, e-posta, adres; `buyerSchema` ile anlık doğrulama; "Nihai tüketici" hızlı düğmesi; kaydet → üst bileşene `Buyer`.
- `SaleScreen` / `BillScreen` ödeme adımında "Fatura" düğmesi (seçiliyken alıcı adı rozet) → `onSale(saleId, payments, cart, buyer)`.
- `KasaApp.afterSale`: `sale.fiscal` varsa önce `sync.current?.kick()` beklenir (en çok 3 sn, `Promise.race`), sonra `POST /api/fiscal/issue` (kalan süreyle); `issued` → yerel satışa `number/ettn` yazılır; sonra baskı.
- `lib/core/receipt.ts` `ReceiptSale.fiscal?: { token, number, ettn, email }`: `number` varsa "e-ARŞİV FATURA", numara, ETTN (iki satıra bölünür), QR (`${appUrl}/f/${token}`); yoksa "Faturanız e-postayla gönderilecek" (e-posta varsa) ya da "Faturanız: <url>". `EscPos.qr(data)` ekle (GS ( k model 2, boyut 6, hata M, sakla + bas). Ekrandaki fiş aynı bilgiyi gösterir (QR `qrcode-svg` yerine basit: bağlantı metni + `lib/core/qr.ts` yok → ekranda yalnız bağlantı).
- `tests/escpos.test.ts`: `qr()` bayt dizisi; `tests/receipt` (varsa) e-Arşiv bloğu.

### 5. Yönetim: mali ayarlar + mali belgeler + gün sonu
- `/yonetim/mali` iki sekme:
  - **Ayarlar:** işletme vergi no (validateTaxId VKN/TCKN), vergi dairesi, adres, seri, kanal başına bölümlü düğme `Bilgi fişi | e-Arşiv` (restoranda 4 kanal, markette yalnız `kasa`), sahte sağlayıcıda "Hata simülasyonu" anahtarı + "TEST sağlayıcısı" uyarısı. Vergi bilgisi boşken e-Arşiv seçimi kaydedilmez (alan hatası).
  - **Belgeler:** tablo (tarih, fiş no, alıcı, tutar, durum rozeti, numara, e-posta işareti), durum süzgeci (bölümlü düğme), satır eylemleri: Yeniden dene (`issueOne`), E-postayı gönder, Sayfayı aç; üstte sayaçlar (hata, iade faturası gerekli).
- Eylemler `lib/admin/fiscal-actions.ts` (müdür yetkisi, audit_log).
- Nav'a "Mali".
- Gün sonu (`lib/kasa/shift-report.ts` + `renderShiftReport`): vardiyadaki `error` belge sayısı → "Kesilemeyen e-Arşiv: N" (0'da yok).

### 6. Herkese açık fatura sayfası
- `app/f/[token]/page.tsx` (sunucu, `dynamic`): `fiscal_doc_by_token` (getDb, kiracı bağlamı yok); yoksa `notFound()` (loading.tsx YOK — soft 404 tuzağı); `robots: { index: false }`. Görünüm: satıcı, alıcı, tarih, numara/ETTN, satırlar, KDV dökümü, toplam; `pending|error` → "Faturanız hazırlanıyor"; `cancelled` → "İPTAL EDİLDİ" bandı; sahte sağlayıcı → "TEST — mali değeri yoktur" bandı; "Yazdır" düğmesi (`window.print`, yazdırma CSS'i). Beyaz zemin.
- Token tahmin koruması: 24 karakter rastgele; `lib/ratelimit.ts` ile IP başına dakikada 30.

### 7. E2E + ilerleme notu
- `e2e/m8.mjs` (m7 kalıbı, `BASE` + `MIGRATE_DATABASE_URL`): spec'teki senaryo — ayar (vergi bilgisi, paket = e-Arşiv) → paket satışı → `issued`, numara, fişte ETTN → `/f/<token>` 200 + TEST bandı → hata simülasyonu açık, kasa satışı + Fatura (VKN) → fişte "e-postayla" → `error` → simülasyon kapalı, yönetimde Yeniden dene → `issued` → tam iade → `cancelled` → gün sonu sayacı yok. Çıktı son satırı `M8 OK`.
- Regresyon: `e2e/m1.mjs`, `e2e/m6.mjs`; `npm test` hepsi yeşil; `tsc --noEmit`, `eslint`.
- `docs/PROGRESS.md` M8 bölümü; prod adımları (şema → db-rls → relrowsecurity `fiscal_settings, fiscal_documents` → main → canlı E2E M8) `scripts/prod-push.sh`'a (git exclude'da) eklenir; `CRON_SECRET`, `APP_URL`, isteğe bağlı `RESEND_API_KEY`/`MAIL_FROM` Vercel env'e — Yiğit `!` ile.
