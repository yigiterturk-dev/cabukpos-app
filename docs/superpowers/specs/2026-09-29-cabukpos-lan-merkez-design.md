# ÇabukPOS — Dükkân içi LAN merkezi (adisyon olayları)

Tarih: 2026-09-29 · Durum: onaylandı (brainstorming) · Önceki: M4 ajan, M5 salon ("ajan LAN aktarımı sonraya")

## Amaç

İnternet kesilince salon çalışmaya devam etsin: garson siparişi girer, mutfak ekranı ve kasa görür, hesap kapanır.
Bugün kasa kendi satışını çevrimdışı yapıyor ve mutfak yazıcısına kendi basıyor; ama garson ve mutfak cihazları
adisyonları yalnız buluttan (SSE) dinlediği için kesintide kör kalıyor.

## Kararlar

- **Kapsam:** salon tam (A). Tüm adisyon olayları (masa, paket, mutfak, printed…) LAN'dan akar. İnternet varken bulut birincil kalır; LAN yalnız ek yol (C reddedildi).
- **Taşıma:** ajan, bulut SSE ucunun aynısını sunar (`POST /tabs/events`, `GET /tabs/stream`). WebSocket ve yoklama reddedildi; yeni bağımlılık yok.
- **Ajan buluta olay YOLLAMAZ.** Her cihaz kendi giden kutusunu zaten buluta iter; ajan yalnız aktarıcı + arabellek.
- **Çakışma:** v1'de ek kilit yok; mevcut katlama kuralları + bulutta `review`.

## Ajan tarafı (`agent/src`)

Yeni `tabs.ts` — olay arabelleği:
- Bellekte `Map<id, { lanSeq, event }>` + ekleme sırası; diskte `state/tabs.jsonl` (her kabul edilen olay bir satır, ekleme). Açılışta dosya okunur; 24 saatten eski olaylar (olay `at`) atılır ve dosya yeniden yazılır (açılışta + saatte bir).
- `accept(events: TabEvent[]): number` — kimliği yeni olanlara artan `lanSeq` verir, kaç tane eklendiğini döner. `seq` alanı arabellekte her zaman `null` saklanır (bulut sırası ajanı ilgilendirmez).
- `after(lanSeq): { lanSeq: number; event: TabEvent }[]`.
- Sınırlar: tek istekte en çok 500 olay; arabellek en çok 20 000 olay (eskiden atılır).
- Olay biçimi en az doğrulama: `id`, `tabId` uuid; `at` ISO; `ev.type` string. Geçersiz → 400 (tüm parti).

`server.ts` yeni yollar (mevcut bilet + köken kontrolü aynen):
- `POST /tabs/events` gövde `{ events: TabEvent[] }` → `{ accepted: n }`; yeni olay varsa açık akışlara hemen yayın.
- `GET /tabs/stream?after=<lanSeq>&ticket=<bilet>` — `EventSource` başlık gönderemez, bu yolda bilet sorgu parametresiyle de kabul edilir (yalnız bu yol). Yanıt `text/event-stream`; her parti `id: <son lanSeq>` + `data: <TabEvent[] JSON>`. Önce `after`'dan sonraki arabellek, sonra yeni kabul edilenler anında. `Last-Event-ID` başlığı `after`'ı ezer. 25 sn'de bir `: ping` yorumu. 240 sn sonra kapanır (bulut ucuyla aynı), istemci yeniden bağlanır.
- `GET /status` yanıtına `tabs: { buffered, clients }` eklenir.

## Cihaz tarafı (`lib/offline/tabs.ts`, `components/kasa/useTabs.ts`)

- `mergeLanEvents(evs)`: yalnız yerelde **olmayan** kimlikleri ekler, `seq: null` ile. (Buluttan gelmiş seq'li kopyanın üzerine asla yazmaz; bulut yankısı sonradan gelince `mergeServerEvents` seq'li hâli koyar — mevcut davranış.) Giden kutusuna EKLENMEZ (başka cihazın olayı; onu o cihaz buluta iter).
- `createLanStream(agent, onChange, onState)`: `EventSource(${agent.url}/tabs/stream?after=<son lanSeq>&ticket=…)`; `onopen`'da `resendPending(agent)`; mesajda `mergeLanEvents`. Son `lanSeq` bellekte tutulur (sayfa yenilenince 0 → arabelleğin tamamı gelir, birleştirme idempotent). Hata/kapanışta 10 sn sonra yeniden kurulur.
- `pushLan(agent, events)`: `POST /tabs/events` (Bearer bilet), en iyi çaba, hata yutulur.
- `resendPending(agent)`: yerel depoda `seq === null` olan tüm olaylar (kendi + başkasının; idempotent) 500'lük partilerle `pushLan`.
- `useTabs`: `meta.agent` varsa bulut akışına ek olarak LAN akışı; `add()` yeni olayları yerel depo + giden kutusu (mevcut) + `pushLan`.
- Bağlantı durumu: `live` boolean → `"bulut" | "lan" | "yok"` (bulut canlıysa bulut; değilse LAN canlıysa lan). Salon/mutfak başlığındaki gösterge: "Canlı" / "Yerel ağ (internet yok)" / "Bağlantı yok".

## Sınır: tabletler ve DNS

- Kasa PC'si ajana `http://127.0.0.1:17654` ile bağlanır (localhost güvenli bağlam) → DNS'siz çalışır.
- Tabletler için ajan adresi `https://<id>.lan.cabukpos.com:17654` (M4 sertifikası, CF DNS-01). `cabukpos.com` bugün park alanında → CF'ye taşınıp `CF_API_TOKEN` + `CF_ZONE_ID` verilene kadar tabletler yalnız bulutu dinler (bugünkü davranış). Kod hazır bekler; tablette doğrulama DNS sonrası.
- Katalogdaki `agent.url` bugünkü gibi buluttan gelir; tablette 127.0.0.1 adresine bağlanamamak = LAN akışı yok, sessizce.

## Test

Ajan birim (`tests/agent-*.test.ts` kalıbı):
- `accept`: tekilleştirme, artan lanSeq, `seq` null'a çekilir, 500 sınırı, 20 000 taşma.
- Disk: yaz → yeni örnek aynı olayları aynı sırayla yükler; 24 saatten eski atılır.
- Sunucu: bilet yok/yanlış → 401 (hem Bearer hem `?ticket=`); `?ticket=` yalnız `/tabs/stream`'de geçerli; POST → açık akışa olay düşer; `after` ve `Last-Event-ID`.

Tarayıcı saf (`tests/tab.test.ts` kalıbı): `mergeLanEvents` mantığı ayrı saf fonksiyonla (`lanMergePlan(existingIds, incoming)`) — var olan atlanır, yeni `seq: null`.

E2E `e2e/lan.mjs`: yerelde ajan (`127.0.0.1`) + iki tarayıcı bağlamı (kasa, garson rolü), ikisi de ajana bağlı. Playwright `route` ile `/api/tabs/**` ve `/api/sync/**` kesilir (internet yok). Garson masaya ürün ekleyip gönderir → kasa salonunda masa dolu + satır görünür, gösterge "Yerel ağ". Rota açılır → bulutta olay tek kopya (`select count(*) … where id = …` = 1). Regresyon: M5.

## Kapsam dışı

İnternetsiz ajan→bulut aktarımı, LAN'da masa kilidi, satış belgelerinin LAN'dan paylaşımı (her kasa kendi satışını iter), çok ajanlı şube, tabletin 127.0.0.1 dışında HTTP ile bağlanması.
