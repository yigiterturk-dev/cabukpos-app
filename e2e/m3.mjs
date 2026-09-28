// e2e/m3.mjs — Market kasası: barkodlu + tartılı (PLU) ürün, alış → çarpanlı okutma + terazi etiketi → satış →
// fiş no ile iade (kasiyer, müdür PIN onayı) → çevrimdışı satış (barkod + elle tartım) → eşitleme → stok 10−3+1−1 = 7 →
// sayım 20 → fiyat değişince raf etiketi kuyruğu → gün sonu beklenen kasa iadeyi düşer.
// Kullanım: node --env-file=.env.local e2e/m3.mjs (sunucu :3800, bkz. m1.mjs). Canlı: BASE=https://… node e2e/m3.mjs
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
const expect = (got, want, what) => { if (got !== want) throw new Error(`${what}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`); };
const pin = async (p, digits) => {
  for (const d of digits) await p.getByRole("button", { name: d, exact: true }).click();
  await p.getByRole("button", { name: "Gir" }).click();
};
const scan = async (p, code) => {
  await p.getByLabel("Ürün ara ya da barkod okut").fill(code);
  await p.getByLabel("Ürün ara ya da barkod okut").press("Enter");
};
const total = async (p) => (await p.getByTestId("cart-total").innerText()).replace(/\s+/g, " ");
const payCash = async (p) => {
  await p.getByRole("button", { name: "Öde" }).click();
  await p.getByRole("button", { name: "Tamamı nakit" }).click();
  await p.getByRole("button", { name: "Satışı tamamla" }).click();
};
const stock = async (a, name) => {
  await a.goto(`${BASE}/yonetim/stok`);
  return (await a.getByTestId(`stok-${name}`).getByTestId("stok-level").innerText()).trim();
};

// — Yönetim: market işletmesi, ürünler, alış, personel, cihaz —
const admin = await page();
await admin.goto(`${BASE}/kayit`);
await admin.fill("input[name=businessName]", "E2E Bakkal");
await admin.getByRole("button", { name: "Market" }).click();
await admin.fill("input[name=name]", "Yiğit Test");
await admin.fill("input[name=email]", `m3-${stamp}@ornek.com`);
await admin.fill("input[name=password]", "Cabukpos2026x");
await admin.getByRole("button", { name: "Hesap oluştur" }).click();
await admin.waitForURL(`${BASE}/yonetim**`);

await admin.goto(`${BASE}/yonetim/urunler`);
await admin.fill("input[name=name]", "Süt");
await admin.fill("input[name=price]", "35");
await admin.getByRole("button", { name: "%1", exact: true }).click();
await admin.fill("textarea[name=barcodes]", "8690000000012");
await admin.getByLabel("Stok takibi").check();
await admin.getByLabel("Kasada hızlı tuş").check();
await admin.getByRole("button", { name: "Ürünü kaydet" }).click();
await admin.getByRole("cell", { name: /^Süt/ }).waitFor();
await admin.fill("input[name=name]", "Domates");
await admin.getByRole("button", { name: "Tartılı (kg)" }).click();
await admin.fill("input[name=price]", "80");
await admin.getByRole("button", { name: "%1", exact: true }).click();
await admin.fill("input[name=plu]", "12345");
await admin.getByLabel("Stok takibi").check();
await admin.getByRole("button", { name: "Ürünü kaydet" }).click();
await admin.getByRole("cell", { name: /^Domates/ }).waitFor();
step("ürünler: Süt (barkod, stok, hızlı tuş), Domates (tartılı, PLU 12345)");

await admin.goto(`${BASE}/yonetim/alislar`); // M7: alış fişiyle
await admin.getByTestId("purchase-row").getByRole("combobox").click();
await admin.getByRole("option", { name: "Süt" }).click();
await admin.getByLabel("Miktar").fill("10");
await admin.getByLabel("Birim fiyat").fill("25");
await admin.getByRole("button", { name: "Alışı kaydet" }).click();
await admin.getByTestId("purchase").first().waitFor();
expect(await stock(admin, "Süt"), "10", "alış sonrası stok");
step("alış 10 → stok 10");

await admin.goto(`${BASE}/yonetim/personel`);
await admin.fill("input[name=name]", "Ayşe Kasiyer");
await admin.fill("input[name=pin]", "5820");
await admin.getByRole("button", { name: "Personeli kaydet" }).click();
await admin.getByRole("cell", { name: "Ayşe Kasiyer" }).waitFor();
await admin.fill("input[name=name]", "Mehmet Müdür");
await admin.getByRole("button", { name: "Müdür", exact: true }).click();
await admin.fill("input[name=pin]", "7391");
await admin.getByRole("button", { name: "Personeli kaydet" }).click();
await admin.getByRole("cell", { name: "Mehmet Müdür" }).waitFor();
await admin.goto(`${BASE}/yonetim/cihazlar`);
await admin.fill("input[name=name]", "Kasa 1");
await admin.fill("input[name=receiptPrefix]", "K1");
await admin.getByRole("button", { name: "Cihaz ekle" }).click();
const code = (await admin.getByTestId("pairing-code").innerText()).trim();
step("personel (kasiyer + müdür), cihaz");

// — Kasa —
const kasa = await page();
const ctx = kasa.context();
await kasa.goto(`${BASE}/kasa/eslestir`);
await kasa.fill("input[name=code]", code);
await kasa.getByRole("button", { name: "Eşle" }).click();
await kasa.waitForURL(`${BASE}/kasa`);
await pin(kasa, "5820");
await kasa.fill("input[name=amount]", "100");
await kasa.getByRole("button", { name: "Vardiyayı aç" }).click();
await kasa.getByRole("button", { name: /^Süt 35/ }).waitFor();
if (await kasa.getByRole("button", { name: /^Domates/ }).count()) throw new Error("hızlı tuş olmayan ürün ızgarada");
step("market ızgarası yalnız hızlı tuş");

await scan(kasa, "3*8690000000012");
expect(await kasa.getByTestId("cart-qty").innerText(), "3", "çarpanlı okutma");
await scan(kasa, "2712345007504");
await kasa.getByText("0,750 kg × 80,00 ₺/kg").waitFor();
expect(await total(kasa), "TOPLAM 165,00 ₺", "sepet toplamı");
await scan(kasa, "8690000000099");
await kasa.getByRole("alert").getByText(/Barkod bulunamadı/).waitFor();
await payCash(kasa);
await kasa.getByText(/Fiş K1-000001/).waitFor();
step("3*barkod + terazi etiketi (0,750 kg) → 165 TL, K1-000001");

await kasa.getByRole("button", { name: "İade" }).click();
await kasa.getByLabel("İade fiş no").fill("k1-1");
await kasa.getByRole("button", { name: "Fişi bul" }).click();
await kasa.getByRole("button", { name: "Süt iade artır" }).click();
expect((await kasa.getByTestId("refund-total").innerText()).trim(), "35,00 ₺", "iade toplamı");
await kasa.getByRole("button", { name: "İadeyi onayla" }).click();
await kasa.getByRole("heading", { name: "Müdür onayı" }).waitFor();
await pin(kasa, "5820"); // kasiyerin kendi PIN'i onay değildir
await kasa.getByText("PIN hatalı.").waitFor();
await pin(kasa, "7391");
await kasa.getByText("İADE FİŞİ").waitFor();
await kasa.getByText("K1-000001").waitFor();
await kasa.getByRole("button", { name: "Kasaya dön" }).click();
await kasa.getByTestId("sync-pending").waitFor({ state: "detached" });
step("iade 1 Süt, müdür PIN'i ile (kasiyer PIN'i reddedildi), iade fişi K1-000002");

await ctx.setOffline(true);
await kasa.getByTestId("sync-status").getByText("Çevrimdışı").waitFor();
await scan(kasa, "8690000000012");
await scan(kasa, "Domates");
await kasa.getByLabel("Ağırlık (kg)").fill("0,5");
await kasa.getByRole("button", { name: "Sepete ekle" }).click();
expect(await total(kasa), "TOPLAM 75,00 ₺", "çevrimdışı sepet");
await payCash(kasa);
await kasa.getByText(/Fiş K1-000003/).waitFor();
await kasa.getByTestId("sync-pending").getByText("1 bekleyen").waitFor();
await ctx.setOffline(false);
await kasa.getByTestId("sync-pending").waitFor({ state: "detached", timeout: 20_000 });
step("çevrimdışı: barkod + elle tartım 0,5 kg → 75 TL; internet gelince eşitlendi");

expect(await stock(admin, "Süt"), "7", "satış/iade sonrası Süt");
expect(await stock(admin, "Domates"), "−1,250 kg", "Domates (alışsız, eksi)");
await admin.getByTestId("stok-Süt").getByRole("link", { name: "Hareket" }).click();
await admin.getByRole("button", { name: "Sayım (=)" }).click();
await admin.fill("input[name=qty]", "20");
await admin.getByRole("button", { name: "Kaydet" }).click();
await admin.getByText("Kaydedildi.").waitFor();
expect(await stock(admin, "Süt"), "20", "sayım sonrası");
step("stok: Süt 7, Domates −1,250 kg; sayım → 20");

await admin.goto(`${BASE}/yonetim/etiketler`);
await admin.getByRole("link", { name: "Fiyatı değişenler (2)" }).waitFor();
await admin.getByRole("button", { name: "Basıldı olarak işaretle" }).click();
await admin.getByText("Basılacak etiket yok.").waitFor();
await admin.goto(`${BASE}/yonetim/urunler`);
await admin.getByRole("row", { name: /Süt/ }).getByRole("link", { name: "Düzenle" }).click();
await admin.getByRole("heading", { name: "Düzenle: Süt" }).waitFor();
await admin.fill("input[name=price]", "36");
await admin.getByRole("button", { name: "Ürünü kaydet" }).click();
await admin.getByRole("cell", { name: "36,00 ₺" }).waitFor();
await admin.goto(`${BASE}/yonetim/etiketler`);
await admin.getByRole("link", { name: "Fiyatı değişenler (1)" }).waitFor();
await admin.getByLabel("Süt etiketi").waitFor();
step("raf etiketi: basıldı → kuyruk boş; fiyat değişti → Süt yeniden kuyrukta");

await kasa.getByRole("button", { name: "Gün sonu" }).click();
await kasa.getByText("1 iade · -35,00 ₺").waitFor();
// 100 açılış + 165 + 75 nakit satış − 35 nakit iade
await kasa.getByText("305,00 ₺").first().waitFor();
const [meta] = await kasa.evaluate(() => new Promise((ok) => { const r = indexedDB.open("cabukpos-kasa"); r.onsuccess = () => { const q = r.result.transaction("meta").objectStore("meta").getAll(); q.onsuccess = () => ok(q.result); }; }));
const shiftId = meta.shift.id;
await kasa.fill("input[name=amount]", "305");
await kasa.getByRole("button", { name: "Gün sonunu kapat" }).click();
await kasa.getByRole("heading", { name: "Vardiya kapandı" }).waitFor();
await kasa.getByTestId("sync-pending").waitFor({ state: "detached", timeout: 20_000 });
await admin.goto(`${BASE}/yonetim/raporlar/${shiftId}`);
await admin.getByText("2 satış").waitFor();
await admin.getByText("1 iade · -35,00 ₺").waitFor();
await admin.getByText("305,00 ₺").first().waitFor();
step("gün sonu: beklenen 305 TL (iade düşülmüş), bulutta aynı");

await browser.close();
if (errors.length) throw new Error(`sayfa hataları: ${errors.join(" | ")}`);
console.log("M3 OK");
