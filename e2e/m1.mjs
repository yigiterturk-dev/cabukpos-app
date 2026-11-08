// e2e/m1.mjs — Kayıt → ürün/personel/cihaz → eşleme → PIN → vardiya → karma ödemeli satış → fiş → ikinci satış
// (M2: kasa cihazda çalışır, eşitleme arka planda; gün sonundan sonra bekleyen 0 olunca yönetime bakılır)
// → gün sonu (beklenen/fark) → yönetim raporu; ikinci işletme ilk işletmenin ürününü görmez.
// Kullanım: node --env-file=.env.local e2e/m1.mjs (sunucu :3800: npm run build && PORT=3800 npm start)
// Kayıt sınırı IP başına saatte 5 (her koşu 2 kayıt): gerekirse yerel DB'de delete from login_attempts where key like 'signup:%'
// Uzak DB (Neon) boşta askıya alınır: koşu öncesi "select 1" ile ısıtın — soğuk başlangıç ilk aksiyonları 30-60 sn geciktirir.
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:3800";
const stamp = Date.now();
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
const page = async (w = 1280) => {
  const p = await (await browser.newContext({ viewport: { width: w, height: 900 } })).newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  p.setDefaultTimeout(45000); // uzak DB gecikmesine karşı yalancı kırmızıyı azalt
  return p;
};
const step = (m) => console.log("•", m);

const admin = await page();
await admin.goto(`${BASE}/kayit`);
await admin.fill("input[name=businessName]", "E2E Dönerci");
await admin.getByText("Restoran", { exact: true }).click();
await admin.fill("input[name=name]", "Yiğit Test");
await admin.fill("input[name=email]", `m1-${stamp}@ornek.com`);
await admin.fill("input[name=password]", "Cabukpos2026x");
await admin.getByRole("button", { name: "Hesap oluştur" }).click();
await admin.waitForURL(`${BASE}/yonetim**`);
step("kayıt → yönetim");

await admin.goto(`${BASE}/yonetim/urunler`); await admin.getByRole("button", { name: "Kategoriler" }).click();
await admin.fill("input[name=categoryName]", "Ana yemek");
await admin.getByRole("button", { name: "Kategori ekle" }).click();
await admin.getByText("Ana yemek").first().waitFor();
await admin.getByRole("button", { name: "Pencereyi kapat" }).click(); await admin.getByRole("button", { name: "Ürün ekle" }).first().click();
for (const [name, price, vat] of [["Döner", "180,00", "10"], ["Ayran", "25", "10"], ["Su", "10", "20"]]) {
  await admin.fill("input[name=name]", name);
  await admin.fill("input[name=price]", price);
  await admin.locator("label").filter({ hasText: new RegExp(`^%${vat}$`) }).click();
  await admin.getByRole("button", { name: "Ürünü kaydet" }).click();
  await admin.getByRole("cell", { name, exact: true }).waitFor();
}
await admin.fill("input[name=name]", "Hatalı");
await admin.fill("input[name=price]", "abc");
// Sunucu doğrulaması transport kuyruğunda gecikebiliyor (uzak DB günü): yanıt gelmezse kaydı yeniden dene.
for (let i = 0; i < 3; i++) {
  await admin.getByRole("button", { name: "Ürünü kaydet" }).click();
  if (await admin.getByText("Fiyat geçersiz (ör. 25,00).").isVisible({ timeout: 20000 }).catch(() => false)) break;
}
await admin.getByText("Fiyat geçersiz (ör. 25,00).").waitFor();
step("3 ürün eklendi; geçersiz fiyat reddedildi");

await admin.goto(`${BASE}/yonetim/personel`); await admin.getByRole("button", { name: "Personel ekle" }).first().click();
await admin.fill("input[name=name]", "Ali Kasiyer");
await admin.fill("input[name=pin]", "1234");
await admin.getByRole("button", { name: "Personeli kaydet" }).click();
await admin.getByText("Bu PIN kolay tahmin edilir; başka bir PIN seçin.").waitFor();
await admin.fill("input[name=pin]", "4826");
await admin.getByRole("button", { name: "Personeli kaydet" }).click();
await admin.getByRole("cell", { name: "Ali Kasiyer", exact: true }).waitFor();
await admin.goto(`${BASE}/yonetim/cihazlar`);
await admin.fill("input[name=name]", "Kasa 1");
await admin.fill("input[name=receiptPrefix]", "K1");
await admin.getByRole("button", { name: "Cihaz ekle" }).click();
const code = (await admin.getByTestId("pairing-code").innerText()).trim();
if (!/^[A-Z2-9]{8}$/.test(code)) throw new Error(`eşleme kodu: ${code}`);
step(`personel (kolay PIN reddedildi) + cihaz, eşleme kodu ${code}`);

const kasa = await page(1280);
await kasa.goto(`${BASE}/kasa`);
await kasa.getByText("Eşleme koduyla bağla").click();
await kasa.waitForURL(`${BASE}/kasa/eslestir`);
await kasa.fill("input[name=code]", "YANLIS22");
await kasa.getByRole("button", { name: "Eşle" }).click();
await kasa.getByText("Kod geçersiz ya da süresi dolmuş.").waitFor();
await kasa.fill("input[name=code]", code.toLowerCase());
await kasa.getByRole("button", { name: "Eşle" }).click();
await kasa.waitForURL(`${BASE}/kasa`);
for (const d of "4827") await kasa.getByRole("button", { name: d, exact: true }).click();
await kasa.getByRole("button", { name: "Gir" }).click();
await kasa.getByText("PIN hatalı.").waitFor();
for (const d of "4826") await kasa.getByRole("button", { name: d, exact: true }).click();
await kasa.getByRole("button", { name: "Gir" }).click();
await kasa.fill("input[name=amount]", "500");
await kasa.getByRole("button", { name: "Vardiyayı aç" }).click();
await kasa.getByText("Ali Kasiyer").waitFor();
step("kasa: yanlış kod/PIN reddedildi; eşlendi, PIN ile girildi, vardiya açıldı (500 TL)");

await kasa.getByRole("button", { name: /^Döner \d/ }).click();
await kasa.getByRole("button", { name: /^Döner \d/ }).click();
await kasa.getByRole("button", { name: /^Ayran \d/ }).click();
await kasa.getByTestId("cart-total").getByText("385,00 ₺").waitFor();
await kasa.getByRole("button", { name: "Öde" }).click();
await kasa.getByRole("button", { name: "Kart ekle" }).click();
await kasa.fill("input[name=amount-kart]", "200");
await kasa.fill("input[name=amount-nakit]", "150");
await kasa.getByText("Eksik ödeme: 35,00 ₺").waitFor();
await kasa.fill("input[name=amount-nakit]", "200");
await kasa.getByText("Para üstü 15,00 ₺").waitFor();
await kasa.getByRole("button", { name: "Satışı tamamla" }).click();
await kasa.getByText(/Fiş K1-000001 · Para üstü 15,00 ₺/).waitFor();
await kasa.getByRole("button", { name: "Fişi yazdır" }).click();
for (const t of ["E2E Dönerci", "K1-000001", "Ali Kasiyer", "385,00 ₺", "Kart", "Nakit", "15,00 ₺", "Bilgi fişidir, mali değeri yoktur."]) await kasa.getByText(t).first().waitFor();
await kasa.getByRole("button", { name: "Kasaya dön" }).click();
step("karma ödemeli satış (kart 200 + nakit 200, üstü 15) + bilgi fişi");

await kasa.getByRole("button", { name: /^Su \d/ }).click();
await kasa.getByRole("button", { name: "Öde" }).click();
await kasa.getByRole("button", { name: "Tamamı nakit" }).click();
await kasa.getByRole("button", { name: "Satışı tamamla" }).click();
await kasa.getByText(/Fiş K1-000002/).waitFor();
step("ikinci satış: K1-000002");

await kasa.getByRole("button", { name: "Gün sonu" }).click();
for (const t of ["2 satış", "395,00 ₺", "Beklenen kasa", "695,00 ₺"]) await kasa.getByText(t).first().waitFor();
await kasa.fill("input[name=amount]", "690");
await kasa.getByRole("button", { name: "Gün sonunu kapat" }).click();
await kasa.getByText("-5,00 ₺").waitFor();
await kasa.getByRole("button", { name: "← Kasa" }).click();
await kasa.getByRole("button", { name: "Gir" }).waitFor();
await kasa.getByTestId("sync-pending").waitFor({ state: "detached" });
step("gün sonu: beklenen 695, sayılan 690, fark -5; kasiyer oturumu kapandı");

await admin.goto(`${BASE}/yonetim/raporlar?sekme=vardiyalar`);
await admin.getByText("₺395,00").locator("visible=true").first().waitFor();
await admin.getByText("−₺5,00").locator("visible=true").first().waitFor();
step("yönetim raporunda vardiya");

const other = await page();
await other.goto(`${BASE}/kayit`);
await other.fill("input[name=businessName]", "E2E Market");
await other.getByText("Market", { exact: true }).click();
await other.fill("input[name=name]", "Başka Sahip");
await other.fill("input[name=email]", `m1b-${stamp}@ornek.com`);
await other.fill("input[name=password]", "Cabukpos2026y");
await other.getByRole("button", { name: "Hesap oluştur" }).click();
await other.waitForURL(`${BASE}/yonetim**`);
await other.goto(`${BASE}/yonetim/urunler`);
if ((await other.getByRole("cell", { name: "Döner", exact: true }).count()) !== 0) throw new Error("kiracı sızıntısı");
const anon = await page();
await anon.goto(`${BASE}/yonetim/urunler`);
await anon.waitForURL(`${BASE}/giris`);
step("ikinci işletme ilk işletmenin ürününü görmüyor; girişsiz yönetim → giriş");

await browser.close();
if (errors.length) throw new Error(`sayfa hataları: ${errors.join(" | ")}`);
console.log("M1 OK");
