// e2e/m9a.mjs — Raporlar. Kasa: Adana×2 + Ayran → Adana azalt (silme 300) → satış 350 kart →
// Ayran ekle + azaltarak sil (50) → Adana ekle + Temizle (300) → Ayran iadesi (müdür PIN) → Özet brüt 300, 1 fiş →
// Personel: Ayşe silinen 3 · 650, iade 1 · 50, olay listesinde "Sepet boşaltıldı" → CSV (BOM + ;) → Vardiyalar sekmesi → İncelenecek (reddedilen belge).
// Kullanım: npm run build && node --env-file=.env.local e2e/m9a.mjs (sunucu :3800)
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:3800";
const stamp = Date.now();
const testIp = `198.51.100.${(stamp % 250) + 1}`;
const tenant = `E2E Kebapçı ${stamp}`;
const step = (m) => console.log("•", m);
const expect = (got, want, what) => { if (got !== want) throw new Error(`${what}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`); };

const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
const page = async () => {
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: { "x-vercel-forwarded-for": testIp } })).newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  return p;
};
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
const text = async (loc) => (await loc.innerText()).trim();

try {
  const admin = await page();
  await admin.goto(`${BASE}/kayit`);
  await admin.fill("input[name=businessName]", tenant);
  await admin.getByText("Restoran", { exact: true }).click();
  await admin.fill("input[name=name]", "Yiğit Test");
  await admin.fill("input[name=email]", `m9a-${stamp}@ornek.com`);
  await admin.fill("input[name=password]", "Cabukpos2026x");
  await admin.getByRole("button", { name: "Hesap oluştur" }).click();
  await admin.waitForURL(`${BASE}/yonetim**`);

  await admin.goto(`${BASE}/yonetim/urunler`); await admin.getByRole("button", { name: "Ürün ekle" }).first().click();
  for (const [name, price] of [["Adana", "300"], ["Ayran", "50"]]) {
    await admin.fill("input[name=name]", name);
    await admin.fill("input[name=price]", price);
    await admin.locator("label").filter({ hasText: /^%10$/ }).click();
    await admin.getByRole("button", { name: "Ürünü kaydet" }).click();
    await admin.getByRole("cell", { name, exact: true }).waitFor();
  }
  await admin.goto(`${BASE}/yonetim/personel`); await admin.getByRole("button", { name: "Personel ekle" }).first().click();
  for (const [name, role, p] of [["Ayşe Kasiyer", null, "5820"], ["Mehmet Müdür", "Müdür", "7391"]]) {
    await admin.fill("input[name=name]", name);
    if (role) await admin.locator("label").filter({ hasText: new RegExp(`^${role}$`) }).click();
    await admin.fill("input[name=pin]", p);
    await admin.getByRole("button", { name: "Personeli kaydet" }).click();
    await admin.getByRole("cell", { name, exact: true }).waitFor();
  }
  await admin.goto(`${BASE}/yonetim/cihazlar`);
  await admin.fill("input[name=name]", "Kasa 1");
  await admin.fill("input[name=receiptPrefix]", "K1");
  await admin.getByRole("button", { name: "Cihaz ekle" }).click();
  const code = (await admin.getByTestId("pairing-code").innerText()).trim();
  const kasa = await page();
  await kasa.goto(`${BASE}/kasa/eslestir`);
  await kasa.fill("input[name=code]", code);
  await kasa.getByRole("button", { name: "Eşle" }).click();
  await kasa.waitForURL(`${BASE}/kasa`);
  await pin(kasa, "5820");
  await kasa.fill("input[name=amount]", "0");
  await kasa.getByRole("button", { name: "Vardiyayı aç" }).click();

  const adana = kasa.getByRole("button", { name: /^Adana \d/ }), ayran = kasa.getByRole("button", { name: /^Ayran \d/ });
  await adana.click(); await adana.click(); await ayran.click();
  await kasa.getByRole("button", { name: "Adana azalt" }).click();
  await kasa.getByRole("button", { name: "Öde" }).click();
  await kasa.getByRole("button", { name: "Tamamı kart" }).click();
  await kasa.getByRole("button", { name: "Satışı tamamla" }).click();
  await kasa.getByText(/Fiş K1-000001/).waitFor();
  step("satış K1-000001: Adana×1 + Ayran = 350 (1 Adana azaltıldı)");

  await ayran.click();
  await kasa.getByRole("button", { name: "Ayran azalt" }).click();
  await adana.click();
  await kasa.getByRole("button", { name: "Temizle" }).click();
  step("Ayran ekle + azaltarak sil (50), Adana ekle + Temizle (300)");

  await kasa.getByRole("button", { name: "İade" }).click();
  await kasa.getByLabel("Fiş numarası").fill("k1-1");
  await kasa.getByRole("button", { name: "Fişi bul" }).click();
  await kasa.getByRole("button", { name: "Ayran iade artır" }).click();
  await kasa.getByRole("button", { name: "İadeyi onayla" }).click();
  await pin(kasa, "7391");
  await kasa.getByText("İADE FİŞİ").waitFor();
  await kasa.getByRole("button", { name: "Kasaya dön" }).click();
  await kasa.getByTestId("sync-pending").waitFor({ state: "detached", timeout: 20000 });
  step("Ayran iadesi (müdür PIN), eşitlendi");

  await admin.goto(`${BASE}/yonetim/raporlar`);
  expect(await text(admin.getByTestId("sum-gross")), "₺300,00", "özet brüt (350 − 50)");
  expect(await text(admin.getByTestId("sum-count")), "1", "fiş sayısı");
  step("Özet: brüt 300, 1 fiş");

  await admin.goto(`${BASE}/yonetim/raporlar?sekme=personel`);
  const ayse = admin.getByTestId("staff-Ayşe Kasiyer");
  await ayse.waitFor();
  expect(await text(ayse.getByTestId("staff-removed")), "3 · ₺650,00", "sepetten silme");
  expect(await text(ayse.getByTestId("staff-refund")), "1 · ₺50,00", "iade");
  await ayse.getByRole("link", { name: "Ayşe Kasiyer", exact: true }).click();
  const ev = admin.getByTestId("staff-events");
  await ev.getByText(/Sepet boşaltıldı: Adana × 1/).locator("visible=true").first().waitFor();
  await ev.getByText("İade K1-000002").locator("visible=true").first().waitFor();
  step("Personel: silme 3 · 650, iade 1 · 50, olay listesi");

  const url = new URL(admin.url());
  const csvResult = await admin.evaluate(async (csvUrl) => {
    const res = await fetch(csvUrl);
    return { status: res.status, bytes: Array.from(new Uint8Array(await (await res.blob()).arrayBuffer())) };
  }, `${BASE}/yonetim/raporlar/csv?sekme=personel&bas=${url.searchParams.get("bas")}&bit=${url.searchParams.get("bit")}`);
  expect(csvResult.status, 200, "CSV durum");
  const csvBytes = Buffer.from(csvResult.bytes);
  if (!csvBytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) throw new Error(`CSV BOM eksik: ${JSON.stringify(csvBytes.subarray(0, 8))}`);
  const csv = csvBytes.toString("utf8");
  if (!csv.startsWith("﻿Personel;")) throw new Error(`CSV başı: ${JSON.stringify(csv.slice(0, 30))}`);
  if (!/Ayşe Kasiyer;350,00;1;1;50,00;.*;3;650,00\r\n/.test(csv)) throw new Error(`CSV satırı: ${csv}`);
  const anon = await (await browser.newContext()).request.get(`${BASE}/yonetim/raporlar/csv?sekme=personel`, { maxRedirects: 0 });
  expect(anon.status(), 307, "oturumsuz CSV → giriş");
  if (!anon.headers().location?.includes("/giris")) throw new Error(`oturumsuz CSV yönü: ${anon.headers().location}`);
  step("CSV: BOM + ; + Ayşe satırı; oturumsuz → /giris");

  await admin.goto(`${BASE}/yonetim/raporlar?sekme=vardiyalar`);
  await admin.getByText("Açık").locator("visible=true").first().waitFor();
  step("Vardiyalar sekmesi");

  // İncelenecek: biçimi bozuk belge reddedilir → yönetimde "Reddedildi" satırı
  const cat = await kasa.evaluate(async (catalogUrl) => {
    const res = await fetch(catalogUrl);
    return await res.json();
  }, `${BASE}/api/sync/catalog`);
  const bad = { id: "00000000-0000-4000-8000-000000000001", kind: "sale" };
  const pr = await kasa.evaluate(async ({ pushUrl, deviceId, document }) => {
    const res = await fetch(pushUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deviceId, docs: [document] }) });
    return await res.json();
  }, { pushUrl: `${BASE}/api/sync/push`, deviceId: cat.device.id, document: bad });
  if (pr.results?.[0]?.ok !== false) throw new Error(`bozuk belge reddedilmedi: ${JSON.stringify(pr)}`);
  await admin.goto(`${BASE}/yonetim/raporlar?sekme=inceleme`);
  await admin.getByTestId("review-list").getByText("Reddedildi · sale").waitFor();
  step("İncelenecek sekmesi: reddedilen belge listede");

  if (errors.length) throw new Error(`sayfa hataları: ${errors.join(" | ")}`);
  console.log("M9a OK");
} finally {
  await browser.close();
}
