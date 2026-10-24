// e2e/m7.mjs — Stok, reçete, alış, tedarikçi, kârlılık (restoran).
// Hammaddeler Un (kg, kritik 9 kg) + Kıyma (kg) → tedarikçi → alış (un 10 kg × 20, kıyma 5 kg × 400 = 2.200) →
// ara ürün Harç (kıyma 600 g + un 400 g, parti 1 kg → 248 TL/kg) → üretim 2 parti → Lahmacun reçetesi (harç 100 g + un 150 g = 27,80)
// + seçenek Ekstra kıyma (kıyma 30 g) → kasa 3× Lahmacun (1'i ekstra) → stok: un 8,750, kıyma 3,770, harç 1,700 →
// kârlılık maliyet 95,40 → un kritik (raporlar kartı) → tedarikçi ödemesi 1.000 → bakiye 1.200 borç.
// Kullanım: npm run build && node --env-file=.env.local e2e/m7.mjs (sunucu :3800, bkz. m1.mjs)
import { chromium } from "playwright-core";
import postgres from "postgres";

const BASE = process.env.BASE ?? "http://localhost:3800";
const stamp = Date.now();
const tenant = `E2E Lahmacuncu ${stamp}`;
const step = (m) => console.log("•", m);
const expect = (got, want, what) => { if (got !== want) throw new Error(`${what}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`); };

const browser = await chromium.launch({ channel: "chrome", headless: true });
const sql = postgres(process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL, { max: 1 });
const errors = [];
const page = async () => {
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  return p;
};
const pin = async (p, digits) => {
  for (const d of digits) await p.getByRole("button", { name: d, exact: true }).click();
  await p.getByRole("button", { name: "Gir" }).click();
};
const choose = async (p, combo, option) => { await combo.click(); await p.getByRole("option", { name: option, exact: true }).click(); };

try {
  const admin = await page();
  await admin.goto(`${BASE}/kayit`);
  await admin.fill("input[name=businessName]", tenant);
  await admin.getByText("Restoran", { exact: true }).click();
  await admin.fill("input[name=name]", "Yiğit Test");
  await admin.fill("input[name=email]", `m7-${stamp}@ornek.com`);
  await admin.fill("input[name=password]", "Cabukpos2026x");
  await admin.getByRole("button", { name: "Hesap oluştur" }).click();
  await admin.waitForURL(`${BASE}/yonetim**`);

  // — Hammaddeler, ara ürün, seçenek, ürün —
  await admin.goto(`${BASE}/yonetim/urunler`);
  const raw = async (name, extra) => {
    await admin.fill("input[name=name]", name);
    await admin.locator("label").filter({ hasText: "Hayır (hammadde" }).click();
    await admin.locator("label").filter({ hasText: /^Kg$/ }).click();
    await extra?.();
    await admin.getByRole("button", { name: "Ürünü kaydet" }).click();
    await admin.getByText("Kaydedildi.").waitFor();
    await admin.goto(`${BASE}/yonetim/urunler`);
  };
  await raw("Un", () => admin.fill("input[name=minStock]", "9"));
  await raw("Kıyma");
  await raw("Harç", () => admin.fill("input[name=yieldMilli]", "1"));
  await admin.goto(`${BASE}/yonetim/urunler?tur=hammadde`);
  for (const n of ["Un", "Kıyma", "Harç"]) await admin.getByRole("cell", { name: new RegExp(`^${n}`) }).waitFor();
  step("hammaddeler Un (kritik 9 kg), Kıyma; ara ürün Harç (parti 1 kg)");

  await admin.goto(`${BASE}/yonetim/secenekler`);
  await admin.fill("input[name=name]", "Ekstra");
  await admin.fill("input[name=min]", "0");
  await admin.fill("input[name=max]", "1");
  await admin.fill("textarea[name=options]", "Ekstra kıyma +20");
  await admin.getByRole("button", { name: "Grubu kaydet" }).click();
  await admin.getByText("isteğe bağlı, en çok 1").waitFor();
  await admin.goto(`${BASE}/yonetim/urunler`);
  await admin.fill("input[name=name]", "Lahmacun");
  await admin.fill("input[name=price]", "120");
  await admin.getByLabel("Ekstra").check();
  await admin.getByRole("button", { name: "Ürünü kaydet" }).click();
  await admin.getByRole("cell", { name: /^Lahmacun/ }).waitFor();
  step("seçenek Ekstra kıyma (+20), Lahmacun 120 TL");

  // — Tedarikçi + alış —
  await admin.goto(`${BASE}/yonetim/tedarikciler`);
  await admin.fill("input[name=name]", "Toptancı");
  await admin.getByRole("button", { name: "Tedarikçiyi kaydet" }).click();
  await admin.getByTestId("supplier-Toptancı").waitFor();

  await admin.goto(`${BASE}/yonetim/alislar`);
  await choose(admin, admin.getByRole("combobox").first(), "Toptancı");
  await admin.fill("input[name=docNo]", "F-1");
  await admin.getByRole("button", { name: "+ Kalem" }).click();
  const rows = admin.getByTestId("purchase-row");
  for (const [i, name, q, c] of [[0, "Un", "10", "20"], [1, "Kıyma", "5", "400"]]) {
    await choose(admin, rows.nth(i).getByRole("combobox"), name);
    await rows.nth(i).getByLabel("Miktar").fill(q);
    await rows.nth(i).getByLabel("Birim fiyat").fill(c);
  }
  expect((await admin.getByTestId("purchase-total").innerText()).trim(), "₺2.200,00", "alış toplamı");
  await admin.getByRole("button", { name: "Alışı kaydet" }).click();
  await admin.getByTestId("purchase").first().waitFor();
  step("alış F-1: un 10 kg × 20 + kıyma 5 kg × 400 = 2.200 TL");

  // — Reçeteler + üretim —
  const recipe = async (link, items) => {
    await admin.goto(`${BASE}/yonetim/receteler`);
    await admin.getByRole("link", { name: new RegExp(`^${link}`) }).click();
    await admin.getByRole("heading", { name: new RegExp(link) }).waitFor();
    for (let i = 1; i < items.length; i++) await admin.getByRole("button", { name: "+ Malzeme" }).click();
    const r = admin.getByTestId("recipe-row");
    for (const [i, [name, q]] of items.entries()) {
      await choose(admin, r.nth(i).getByRole("combobox"), name);
      await r.nth(i).getByLabel("Miktar").fill(q);
    }
    const cost = (await admin.getByTestId("recipe-cost").innerText()).replace(/\s+/g, " ");
    await admin.getByRole("button", { name: "Reçeteyi kaydet" }).click();
    await admin.getByText("Kaydedildi.").waitFor();
    return cost;
  };
  const harc = await recipe("Harç", [["Kıyma", "600"], ["Un", "400"]]);
  if (!harc.includes("kg başına ₺248,00")) throw new Error(`harç maliyeti: ${harc}`);
  await admin.goto(`${BASE}/yonetim/uretim`);
  await choose(admin, admin.getByRole("combobox").first(), "Harç");
  await admin.fill("input[name=batches]", "2");
  await admin.getByRole("button", { name: "Üretimi kaydet" }).click();
  await admin.getByText("Kaydedildi; stok ve maliyet güncellendi.").waitFor();
  const lah = await recipe("Lahmacun", [["Harç (ara ürün)", "100"], ["Un", "150"]]);
  if (!lah.includes("Maliyet ₺27,80") || !lah.includes("marj %74.5")) throw new Error(`lahmacun maliyeti: ${lah}`);
  await recipe("Ekstra kıyma", [["Kıyma", "30"]]);
  step("harç 248 TL/kg; üretim 2 parti; lahmacun maliyet 27,80, marj %74.5; ekstra kıyma 30 g");

  // — Kasa: M1 masası, 3× Lahmacun (1'i ekstra) — seçenekler adisyonda (hızlı satışta seçenek yok) —
  await admin.goto(`${BASE}/yonetim/salon`);
  await admin.getByLabel("Bahçe bölümünü kaldır").click();
  await admin.getByLabel("1. bölge adı").fill("Masa");
  await admin.getByLabel("1. bölge masa sayısı").fill("1");
  await admin.getByRole("button", { name: "Salonu kur" }).click();
  await admin.getByText("M1", { exact: true }).waitFor();
  await admin.goto(`${BASE}/yonetim/personel`);
  await admin.fill("input[name=name]", "Ali Kasiyer");
  await admin.fill("input[name=pin]", "4613");
  await admin.getByRole("button", { name: "Personeli kaydet" }).click();
  await admin.getByRole("cell", { name: "Ali Kasiyer", exact: true }).waitFor();
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
  await pin(kasa, "4613");
  await kasa.fill("input[name=amount]", "0");
  await kasa.getByRole("button", { name: "Vardiyayı aç" }).click();
  await kasa.getByRole("button", { name: "M1, Boş" }).click();
  if (await kasa.getByRole("button", { name: /^(Un|Kıyma|Harç)\b/ }).count()) throw new Error("hammadde kasada görünüyor");
  const dlg = kasa.getByRole("dialog", { name: "Lahmacun" });
  await kasa.getByRole("button", { name: /Lahmacun 120,00/ }).first().click();
  await dlg.getByRole("button", { name: "Artır" }).click();
  await dlg.getByRole("button", { name: "Ekle" }).click();
  await kasa.getByRole("button", { name: /Lahmacun 120,00/ }).first().click();
  await dlg.getByRole("button", { name: /Ekstra kıyma/ }).click();
  await dlg.getByRole("button", { name: "Ekle" }).click();
  await kasa.getByTestId("tab-remaining").getByText("380,00 ₺").waitFor();
  const send = kasa.getByRole("button", { name: /^Mutfağa gönder/ });
  if (await send.count()) await send.click();
  await kasa.getByRole("button", { name: "Hesap al / böl", exact: true }).click();
  await kasa.getByRole("button", { name: "Öde 380,00 ₺" }).click();
  await kasa.getByRole("button", { name: "Tamamı nakit" }).click();
  await kasa.getByRole("button", { name: "Satışı tamamla" }).click();
  await kasa.getByRole("heading", { name: "M1 kapandı" }).waitFor();
  let n = 0;
  for (let i = 0; i < 60 && n < 3; i++) {
    [{ n }] = await sql`select count(*)::int n from stock_movements m join tenants t on t.id = m.tenant_id where t.name = ${tenant} and m.kind = 'recete'`;
    if (n < 3) await new Promise((r) => setTimeout(r, 300));
  }
  expect(n, 3, "reçete hareketleri (harç, un, kıyma)");
  step("kasa M1: hammaddeler yok; 2× Lahmacun + 1× Ekstra kıyma = 380 TL ödendi, eşitlendi");

  // — Stok, kârlılık, kritik uyarı —
  await admin.goto(`${BASE}/yonetim/stok`);
  const level = async (name) => (await admin.getByTestId(`stok-${name}`).getByTestId("stok-level").innerText()).trim();
  expect(await level("Un"), "8,750 kg", "un (10 − 0,8 − 0,45)");
  expect(await level("Kıyma"), "3,770 kg", "kıyma (5 − 1,2 − 0,03)");
  expect(await level("Harç"), "1,700 kg", "harç (2 − 0,3)");
  await admin.getByTestId("stok-Un").getByTestId("stok-kritik").waitFor();
  expect(await admin.getByTestId("stok-Kıyma").getByTestId("stok-kritik").count(), 0, "kıyma kritik değil");
  step("stok: un 8,750 (kritik), kıyma 3,770, harç 1,700");

  await admin.goto(`${BASE}/yonetim/raporlar`);
  await admin.getByTestId("critical-card").getByText("Un", { exact: true }).waitFor();
  await admin.goto(`${BASE}/yonetim/raporlar?sekme=karlilik`);
  const row = admin.getByTestId("profit-Lahmacun");
  expect((await row.getByTestId("profit-cost").innerText()).trim(), "₺95,40", "lahmacun maliyeti (2 × 27,80 + 39,80)");
  expect((await row.getByTestId("profit-margin").innerText()).trim(), "%72.4", "lahmacun marjı");
  step("raporlar: kritik kart Un; kârlılık maliyet 95,40, marj %72.4");

  await admin.goto(`${BASE}/yonetim/tedarikciler`);
  await admin.getByTestId("supplier-Toptancı").getByRole("link", { name: "Döküm" }).click();
  expect((await admin.getByTestId("supplier-balance").innerText()).trim(), "₺2.200,00 borç", "bakiye");
  await admin.fill("input[name=amount]", "1000");
  await admin.getByRole("button", { name: "Ödeme ekle" }).click();
  await admin.getByText("Ödeme eklendi.").waitFor();
  await admin.reload();
  expect((await admin.getByTestId("supplier-balance").innerText()).trim(), "₺1.200,00 borç", "ödeme sonrası bakiye");
  step("tedarikçi ödemesi 1.000 → bakiye 1.200 borç");
} finally {
  await browser.close();
  await sql.end();
}
if (errors.length) throw new Error(`sayfa hataları: ${errors.join(" | ")}`);
console.log("M7 OK");
