# ÇabukPOS M4 — Yerel ajan

Spec §2 (yerel ajan, HTTPS sorunu), §5 (terazi), §7 (bilgi fişi ajanla), §8 (yazıcı hatası satışı durdurmaz, çekmece yetkili işlem), §9 (M4). Kabul: sahte yazıcı + sahte teraziyle E2E (`e2e/m4.mjs` → "M4 OK"), M1–M3 E2E hâlâ geçer. Gerçek cihazı Yiğit dener.

Dal: `m4-ajan`, main'den (= `m3-market` f52296c).

## Kararlar
- **Ajan aptal taşıyıcıdır.** Fiş ESC/POS baytlarını kasa (tarayıcı) üretir: `lib/core/escpos.ts` saf, testli; ajan baytı yazıcıya iletir. Fiş düzeni tek yerde (uygulama deposu) kalır, ajan güncellemesi nadir olur.
- **Ajan = `agent/` klasörü, aynı depo.** TypeScript, yalnız Node yerleşikleri (http/https/net/fs/child_process/crypto). `esbuild` ile tek dosya `agent/dist/cabukpos-agent.cjs`. Windows'ta servis yerine **oturum açılışında zamanlanmış görev** (`schtasks /sc onlogon`): paylaşılan USB yazıcıya kullanıcı oturumundan erişim sorunsuz; `install`/`uninstall` komutları.
- **Yazıcı taşıyıcıları.** `ag` (host:9100, TCP), `paylasim` (Windows paylaşılan yazıcı: `copy /b dosya \\localhost\<ad>`), `cups` (`lp -d <ad> -o raw`), `dosya` (`/dev/usb/lp0`). Genişlik 58/80 mm (32/48 karakter), kod sayfası: PC857 (`ESC t 13`, XPrinter/Epson uyumlu), ayarlanabilir; desteklemeyen yazıcı için ASCII'ye çeviri (`ç→c`).
- **Çekmece.** Yazıcı darbesi `ESC p 0 25 250`. Nakit ödemede kendiliğinden açılır. Elle açma: müdür rolü ya da müdür PIN'i; yeni eşitleme belgesi `audit {action:"cekmece"}` → `audit_log`.
- **Terazi.** Seri port (Windows `\\.\COMn` + `mode`, Linux `stty`) ya da TCP (ağ terazisi). İstek baytı ayarlanabilir (varsayılan ENQ 0x05; boş = sürekli gönderen terazi). Yanıt çözümü saf ve testli: ilk ondalık sayı + birim (kg/g), `US`/`?` → kararsız. Kararsız okumada 2 sn içinde tekrar dener. Tartı diyaloğunda "Teraziden al".
- **Kuyruk.** Yazıcı hatası satışı durdurmaz. Ajan işi 3 kez (1, 3, 9 sn) dener; olmazsa `failed` listesine; kasada fiş ekranında "Yazdırılamadı — yeniden dene" + başlıkta ajan durumu. Kasa ajana ulaşamazsa tarayıcı yazdırmaya düşer.
- **Kasa → ajan kimliği: bilet.** Cihaz jetonu httpOnly çerezde, JS okuyamaz. Katalog yanıtı `agent: {url, ticket}` verir; bilet = `base64url(json{d:deviceId,t:tenantId,exp}) + "." + HMAC-SHA256(hubKey)`; 30 gün geçerli (çevrimdışı dayanıklılık), her katalog çekişinde yenilenir. `hubKey` ajana eşlemede bir kez verilir, bulutta şifresiz değil **AES-GCM ile `AUTH_SECRET`'tan türetilmiş anahtarla** saklanır (bilet imzalamak için bulutun okuması şart). İptal edilen cihazlar heartbeat'le ajana iner (`revoked: deviceId[]`).
- **Ajan ↔ bulut.** Yönetimde "Donanım" (`/yonetim/donanim`): ajan ekle → 8 haneli eşleme kodu (cihazlarla aynı üretici, 15 dk). Ajan `pair <kod> [--url]` → `POST /api/agent/pair` → `{agentId, token, hubKey}`; `cabukpos-agent.json`'a yazar. `POST /api/agent/heartbeat` (Bearer ajan jetonu, 60 sn) → `{config, revoked}`; ajan `lanIp, port, version, printers durum, failed sayısı` bildirir. Yapılandırma (yazıcılar, terazi, otomatik fiş) yönetimden düzenlenir, ajan son yapılandırmayı dosyada tutar (internetsiz açılış).
- **Kasa hangi ajanı kullanır.** Şube başına bir ajan (v1). Katalog yanıtındaki URL: sertifikası varsa `https://<id>.lan.cabukpos.com:<port>`, yoksa `http://127.0.0.1:<port>` (tarayıcılar localhost'u güvenli sayar → https sayfadan karışık içerik engeli yok; kasa ile ajan aynı PC'de iken sertifikasız çalışır). Tablet/ikinci kasa sertifika ister.
- **Sertifika (DNS-01).** Özel anahtar ajanda kalır: ajan ACME (Let's Encrypt) istemcisidir; DNS kayıtlarını buluta yazdırır: `POST /api/agent/dns {type:"A", value:lanIp}` ve `{type:"TXT", value}` — bulut yalnız o ajanın kendi adlarına (`<id>.lan` ve `_acme-challenge.<id>.lan`) yazar. `DnsProvider` arayüzü + Cloudflare sürücüsü; `CF_API_TOKEN`/`CF_ZONE_ID` yoksa 501 → ajan yalnız 127.0.0.1'de http. ACME istemcisi `acme-client` (esbuild ile pakete girer). **Yiğit işi:** cabukpos.com DNS'i Cloudflare'e + token. 60 gün kala yenileme.
- **LAN merkezi (WebSocket yayını)** M5'e kaydı: M4'te onu kullanan ekran yok (masa/mutfak M5). M4'te ajan HTTP API'si: `GET /status`, `POST /print`, `POST /drawer`, `GET /scale`; CORS (yalnız uygulama kökeni) + `Access-Control-Allow-Private-Network: true`.
- **Fiyat kodlu terazi etiketi** gerçek terazi görülünce (M3 notu); M4'te değil.

## Görevler

### 1. ESC/POS çekirdeği (saf) + test
- `lib/core/escpos.ts`: `class EscPos` (init, align, bold, size, text, line, cols(sol, sağ, genişlik), feed, cut, drawer, bytes()); `encodeText(s, codepage)` PC857 tablosu (ÇçĞğİıÖöŞşÜü + Türk lirası yok → "TL"), `ascii` çevirisi.
- `lib/core/receipt.ts`: `renderReceipt(sale, device, opts{width, codepage, weighed}) → Uint8Array` — ekrandaki fişin aynısı (başlık, iade başlığı, tarih/saat, fiş no, satırlar, KDV tablosu, toplam, ödemeler, para üstü, "Bilgi fişidir…"), sonda kes. Saat dilimi Europe/Istanbul.
- `tests/escpos.test.ts`: "ş" → 0x9F (PC857), ascii modunda "s"; `cols("Ekmek","12,50 ₺",32)` tam 32; fiş baytı `ESC @` ile başlar, `GS V` ile biter, "TOPLAM" ve fiş no içerir; 58 mm'de hiçbir satır 32'yi aşmaz; çekmece baytı `1B 70 00 19 FA`.

### 2. Ajan çekirdeği (saf) + test
- `agent/src/scale.ts`: `parseScale(buf) → {grams, stable} | null` (`ST,GS,+  0.750kg`, `  1.234 kg`, `750 g`, `US,...` kararsız, çöp → null).
- `lib/agent/ticket.ts` (bulut + ajan ortak): `signTicket(hubKey, {d,t,exp})`, `verifyTicket(hubKey, ticket, now) → {d,t} | null` (WebCrypto HMAC, sabit zamanlı karşılaştırma).
- `agent/src/queue.ts`: `createQueue(send, {delays})`: sırayla gönderir, 3 deneme, `failed` listesi, `retry(id)`.
- Testler: `tests/agent-scale.test.ts`, `tests/ticket.test.ts` (süresi geçmiş/yanlış anahtar/bozuk → null), `tests/agent-queue.test.ts` (sahte gönderici: 2 hata + başarı → done; 3 hata → failed; retry).

### 3. Ajan süreci
- `agent/src/config.ts` (dosya: `%APPDATA%\cabukpos\cabukpos-agent.json` / `~/.config/cabukpos/…`; `--config` ile değişir), `printers.ts` (4 taşıyıcı), `scale-io.ts` (seri/TCP okuma, 1500 ms zaman aşımı), `cloud.ts` (pair, heartbeat, dns), `server.ts` (HTTP; bilet doğrulama; CORS/PNA; gövde ≤ 256 KB), `main.ts` (komutlar: `pair`, `run`, `install`, `uninstall`, `test-print <yazıcı>`).
- `POST /print {printer?: "fis"|"mutfak"|<id>, data: base64}` → `{jobId}`; `GET /status` → `{version, printers:[{id,name,role,ok,lastError}], failed:[…], scale: bool}`; `POST /print/retry {jobId}`; `POST /drawer`; `GET /scale` → `{grams, stable}`.
- `tests/agent-server.test.ts`: sahte TCP yazıcı (net.Server) + sahte TCP terazi; biletsiz 401; `/print` → yazıcı baytları alır; yazıcı kapalıyken iş `failed`e düşer, yazıcı açılınca `retry` başarılı; `/scale` 750 g döner.
- `package.json`: `agent:build` (esbuild → `agent/dist/cabukpos-agent.cjs`), `agent:dev`.

### 4. Bulut: ajan kaydı + API
- Şema: `agents {id, tenant_id, store_id, name, token_hash unique, pairing_code unique, pairing_expires_at, paired_at, revoked_at, hub_key_enc, config jsonb, lan_ip, port, version, status jsonb, cert_expires_at, last_seen_at, created_at}` (RLS dışı kimlik tablosu, `devices` gibi; yönetim erişimi `tenant_id` filtreli `lib/admin`'den).
- `lib/agent/config.ts`: zod şema (yazıcılar: id, ad, rol fis|mutfak|etiket, taşıyıcı, adres, genişlik 58|80, kod sayfası pc857|ascii, çekmece; terazi: yok | seri{port, baud} | tcp{host, port}, istek baytı; otomatikFiş bool). `lib/agent/crypto.ts`: hubKey AES-GCM şifreleme.
- `POST /api/agent/pair`, `POST /api/agent/heartbeat`, `POST /api/agent/dns` (ajan jetonu; kiracı ad kısıtı; sağlayıcı yoksa 501); `lib/agent/dns.ts` (`DnsProvider`, Cloudflare).
- `/yonetim/donanim`: ajan listesi (çevrimiçi = son 3 dk, yazıcı durumları, son hata), ekle/eşleme kodu, iptal, yapılandırma formu (yazıcı ekle/sil, terazi, otomatik fiş), indirme notu (kurulum adımları). Nav'a "Donanım". Mevcut `components/Select.tsx` (native select yasak).
- Katalog yanıtına `agent: {url, ticket} | null` (cihazın şubesindeki eşli, iptal edilmemiş ajan; yapılandırmadan `autoPrint`, `drawer`, `scale` bayrakları da).
- `tests/agent-db.test.ts`: eşleme kodu tek kullanımlık + süreli; iptal edilen ajan jetonu 401; heartbeat revoked listesi yalnız kendi kiracısı; DNS adı kısıtı (başka ajanın adı reddedilir).

### 5. Kasa entegrasyonu
- `lib/offline/agent.ts`: `agentClient(meta)` → `status()`, `print(bytes, role)`, `drawer()`, `scale()`; 2 sn zaman aşımı; ulaşılamazsa `null`.
- `Meta.agent` (katalogla gelir, `reconcile`'da güncellenir) + testi `tests/offline.test.ts`'e.
- Satış sonrası: `autoPrint` ise fiş ajana; nakit ödemede çekmece; hata → fiş ekranında uyarı + "Yeniden dene". Fiş ekranında "Yazdır" önce ajana, olmazsa `window.print()`.
- Başlıkta ajan rozeti (Yazıcı hazır / Yazıcı hatası / Ajan yok; ajan tanımlı değilse rozet yok) + "Çekmece" düğmesi (müdür değilse müdür PIN'i → `audit` belgesi).
- Tartı diyaloğu: `scale` varsa "Teraziden al" (kararsızsa "Tartı dengelenmedi").
- Gün sonu raporu da ajana yazdırılabilir (`renderShiftReport`).
- Eşitleme: `audit` belgesi → `audit_log` (`staff:<id>`, `detail {deviceId, approvedBy}`); test `tests/sync.test.ts`'e.

### 6. Sertifika (ACME DNS-01)
- `agent/src/cert.ts`: `acme-client` ile `<id>.lan.cabukpos.com`; TXT'yi buluta yazdırır, doğrular, sertifikayı + anahtarı yapılandırma klasörüne yazar; açılışta ve günde bir kez 30 günden az kaldıysa yeniler. Sertifika varsa sunucu LAN IP'sinde https (aynı port), yoksa yalnız 127.0.0.1 http. Heartbeat `certExpiresAt` bildirir → katalog URL'si buna göre.
- Test: sağlayıcı yok → 501 → ajan http'de kalır (agent-server testinde).

### 7. E2E + kapanış
- `e2e/m4.mjs`: sahte TCP yazıcı + sahte TCP terazi başlat → yönetimde kayıt, ürün (adet + tartılı), cihaz eşleme, Donanım'da ajan ekle, yazıcı (`ag` 127.0.0.1:<port>, otomatik fiş) + terazi (tcp) yapılandır → ajanı `pair` + `run` (çocuk süreç, ayrı config) → kasa: rozet "Yazıcı hazır", tartılı ürün "Teraziden al" 0,750 kg, nakit satış → sahte yazıcı fiş baytlarını (`TOPLAM`, fiş no, `GS V`) ve çekmece darbesini alır; yazıcı kapatılır → satış yine kaydolur, "Yazdırılamadı" görünür, yazıcı açılır → "Yeniden dene" → bayt gelir → "M4 OK".
- Kapı: `npm test`, eslint, tsc, `npm run build`, `agent:build`, E2E M1–M4.
- `docs/PROGRESS.md` + `docs/AGENT.md` (kurulum: Node LTS kur → dosyayı indir → `node cabukpos-agent.cjs pair KOD` → `install`).
