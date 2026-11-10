// e2e/m2.mjs — Çevrimdışı kasa: çevrimiçi satış → internet kesilir → sayfa yenilenir (service worker) → PIN →
// 2 satış (bekleyen 2) → internet gelir → bekleyen 0 → bulutta 3 satış, her fiş bir kez; aynı parti elle
// yeniden gönderilir → çift kayıt yok.
// Kullanım: node --env-file=.env.local e2e/m2.mjs (sunucu :3800, bkz. m1.mjs). Canlı: BASE=https://… node e2e/m2.mjs
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:3800";
const stamp = Date.now();
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
const page = async () => {
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  return p;
};
const step = (m) => console.log("•", m);
const pin = async (p, digits) => {
  // PIN opsiyonel: PIN tuslari yoksa "Kim giriyor?/Onaylayan" listesindeki ilk kisiye dokun.
  // Katalog eslemeden hemen sonra gelebilir; kisa sure bekle, gerekirse bir kez yenile.
  let reloaded = false;
  for (let i = 0; i < 40; i++) {
    if (await p.getByRole("button", { name: digits[0], exact: true }).count()) {
      for (const d of digits) await p.getByRole("button", { name: d, exact: true }).click();
      await p.getByRole("button", { name: "Gir" }).click();
      return;
    }
    const label = p.getByText(/Kim giriyor\?|Onaylayan/);
    if (await label.count()) {
      const person = label.locator("xpath=..").getByRole("button").first();
      if (await person.count()) { await person.click(); return; }
    }
    if (!reloaded && (await p.getByText(/İlk kasa PIN/).count())) {
      reloaded = true;
      await p.reload({ waitUntil: "networkidle" }).catch(() => {});
    }
    await p.waitForTimeout(500);
  }
  const body = (await p.locator("body").innerText()).slice(0, 300).replace(/\n/g, " | ");
  throw new Error("PIN/personel ekrani gelmedi: " + body);
};
const sell = async (p, method) => {
  await p.getByRole("button", { name: /^Çay \d/ }).click();
  await p.getByRole("button", { name: "Öde" }).click();
  await p.getByRole("button", { name: method }).click();
  await p.getByRole("button", { name: "Satışı tamamla" }).click();
};
/** IndexedDB'den ham okuma (Dexie'siz). */
const idb = (p, store) =>
  p.evaluate((store) => new Promise((ok, fail) => {
    const r = indexedDB.open("cabukpos-kasa");
    r.onerror = () => fail(r.error);
    r.onsuccess = () => { const q = r.result.transaction(store).objectStore(store).getAll(); q.onsuccess = () => ok(q.result); q.onerror = () => fail(q.error); };
  }), store);

const admin = await page();
await admin.goto(`${BASE}/kayit`);
await admin.fill("input[name=businessName]", "E2E Çaycı");
await admin.getByText("Restoran", { exact: true }).click();
await admin.fill("input[name=name]", "Yiğit Test");
await admin.fill("input[name=email]", `m2-${stamp}@ornek.com`);
await admin.fill("input[name=password]", "Cabukpos2026x");
await admin.getByRole("button", { name: "Hesap oluştur" }).click();
await admin.waitForURL(`${BASE}/yonetim**`);
await admin.goto(`${BASE}/yonetim/urunler`); await admin.getByRole("button", { name: "Ürün ekle" }).first().click();
await admin.fill("input[name=name]", "Çay");
await admin.fill("input[name=price]", "15");
await admin.locator("label").filter({ hasText: /^%10$/ }).click();
await admin.getByRole("button", { name: "Ürünü kaydet" }).click();
await admin.getByRole("cell", { name: "Çay", exact: true }).waitFor();
await admin.goto(`${BASE}/yonetim/personel`); await admin.getByRole("button", { name: "Personel ekle" }).first().click();
await admin.fill("input[name=name]", "Ayşe Kasiyer");
await admin.fill("input[name=pin]", "5820");
await admin.getByRole("button", { name: "Personeli kaydet" }).click();
await admin.getByRole("cell", { name: "Ayşe Kasiyer", exact: true }).waitFor();
await admin.goto(`${BASE}/yonetim/cihazlar`);
await admin.fill("input[name=name]", "Kasa 1");
await admin.fill("input[name=receiptPrefix]", "K1");
await admin.getByRole("button", { name: "Cihaz ekle" }).click();
const code = (await admin.getByTestId("pairing-code").innerText()).trim();
step("işletme, ürün, personel, cihaz");

const kasa = await page();
const ctx = kasa.context();
await kasa.goto(`${BASE}/kasa/eslestir`);
await kasa.fill("input[name=code]", code);
await kasa.getByRole("button", { name: "Eşle" }).click();
await kasa.waitForURL(`${BASE}/kasa`);
await pin(kasa, "5820");
await kasa.fill("input[name=amount]", "100");
await kasa.getByRole("button", { name: "Vardiyayı aç" }).click();
await sell(kasa, "Tamamı nakit");
await kasa.getByText(/Fiş K1-000001/).waitFor();
await kasa.getByTestId("sync-pending").waitFor({ state: "detached" });
step("çevrimiçi satış K1-000001 eşitlendi");

await kasa.evaluate(() => navigator.serviceWorker.ready);
await kasa.waitForFunction(async () => (await (await caches.open("cabukpos-kasa-v1")).keys()).some((r) => r.url.includes("/_next/static/")));
await ctx.setOffline(true);
await kasa.reload();
await kasa.getByRole("button", { name: "Gir" }).waitFor();
await kasa.getByTestId("sync-status").getByText("Çevrimdışı").waitFor();
step("internet kesik: sayfa service worker'dan yeniden açıldı");

await pin(kasa, "5820");
await sell(kasa, "Tamamı nakit");
await kasa.getByText(/Fiş K1-000002/).waitFor();
await sell(kasa, "Tamamı kart");
await kasa.getByText(/Fiş K1-000003/).waitFor();
await kasa.getByTestId("sync-pending").getByText("2 bekleyen").waitFor();
await kasa.getByRole("button", { name: "Fişi yazdır" }).click();
await kasa.getByText("K1-000003").first().waitFor();
await kasa.getByRole("button", { name: "Kasaya dön" }).click();
const outbox = await idb(kasa, "outbox");
if (outbox.length !== 2) throw new Error(`giden kutusu ${outbox.length}`);
step("çevrimdışı 2 satış (fiş yerelden yazdırılabilir), 2 bekleyen");

await ctx.setOffline(false);
await kasa.getByTestId("sync-pending").waitFor({ state: "detached", timeout: 20_000 });
await kasa.getByTestId("sync-status").getByText("Çevrimiçi").waitFor();
step("internet geldi: bekleyen 0");

const [meta] = await idb(kasa, "meta");
const shiftId = meta.shift.id;
const deviceId = meta.device.id;
const again = await kasa.evaluate(async ({ deviceId, docs }) => (await fetch("/api/sync/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceId, docs }) })).json(), { deviceId, docs: outbox.map((o) => o.doc) });
if (!again.results.every((r) => r.ok)) throw new Error(`tekrar gönderim: ${JSON.stringify(again)}`);
step("aynı parti ikinci kez gönderildi → ok (idempotent)");

await admin.goto(`${BASE}/yonetim/raporlar/${shiftId}`);
await admin.getByText("3 satış").waitFor();
await admin.getByText("₺45,00").first().waitFor();
const body = await admin.locator("main").innerText();
for (const no of ["K1-000001", "K1-000002", "K1-000003"]) {
  const n = body.split(no).length - 1;
  if (n !== 1) throw new Error(`${no} raporda ${n} kez`);
}
if ((await idb(kasa, "rejected")).length) throw new Error("reddedilen belge var");
step("bulut: 3 satış, 45 TL, her fiş bir kez");

await browser.close();
if (errors.length) throw new Error(`sayfa hataları: ${errors.join(" | ")}`);
console.log("M2 OK");
