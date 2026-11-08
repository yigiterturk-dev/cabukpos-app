// e2e/m6.mjs — Paket, kurye, platform siparişi: üç cihaz (kasa + mutfak ekranı + kurye telefonu), sahte platform webhook'u.
// Yönetim: bölge Merkez (15 TL, asgari 100), Lahmacun 60 TL (platform kodu LAH), kasiyer + kurye, Deneme platformu (otomatik kabul kapalı) →
// kasa yeni paket (0532…, Merkez, 2× Lahmacun = 135) → mutfak hazır → kurye ata → kurye yola çıktım, nakit teslim → hesap kapat (kasiyer PIN'i, sayılan 135) →
// /api/musteri aynı müşteri → imzalı webhook iki kez (LAH + bilinmeyen kod) → tek onay bekleyen kart → Kabul → audit platform.accept →
// mutfak hazır → "Kuryeye verildi" → online satış (kanal platform).
// Kullanım: npm run build && node --env-file=.env.local e2e/m6.mjs (sunucu :3800, bkz. m1.mjs)
import { chromium } from "playwright-core";
import { createHmac } from "node:crypto";
import postgres from "postgres";

const BASE = process.env.BASE ?? "http://localhost:3800";
const stamp = Date.now();
const tenant = `E2E Pideci ${stamp}`;
const step = (m) => console.log("•", m);

const browser = await chromium.launch({ channel: "chrome", headless: true });
const sql = postgres(process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL, { max: 1 });
const errors = [];
const page = async (viewport = { width: 1280, height: 900 }) => {
  const p = await (await browser.newContext({ viewport })).newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  return p;
};
const pin = async (p, digits) => {
  try { await p.getByRole("button", { name: "Gir" }).waitFor({ timeout: 8000 }); }
  catch { console.log("pin döküm:", p.url(), "|", (await p.locator("h1,h2,[role=alert],p:visible").allTextContents()).map(t=>t.trim()).filter(Boolean).slice(0,8).join(" | ")); throw new Error("Gir yok"); }
  for (const d of digits) await p.getByRole("button", { name: d, exact: true }).click({ force: true });
  await p.getByRole("button", { name: "Gir" }).click({ force: true });
};
const choose = async (p, combo, option) => { await combo.click(); await p.getByRole("option", { name: option }).click(); };
const ready = async (mutfak, text) => {
  const card = mutfak.locator("[data-ticket]:not([data-status=hazir])", { hasText: text });
  await card.waitFor({ timeout: 10000 });
  await card.click();
  await mutfak.locator("[data-ticket][data-status=hazirlaniyor]", { hasText: text }).click();
  await mutfak.locator("[data-ticket][data-status=hazir]", { hasText: text }).first().waitFor();
};

try {
  // — Yönetim —
  const admin = await page();
  await admin.goto(`${BASE}/kayit`);
  await admin.fill("input[name=businessName]", tenant);
  await admin.getByText("Restoran", { exact: true }).click();
  await admin.fill("input[name=name]", "Yiğit Test");
  await admin.fill("input[name=email]", `m6-${stamp}@ornek.com`);
  await admin.fill("input[name=password]", "Cabukpos2026x");
  await admin.getByRole("button", { name: "Hesap oluştur" }).click();
  await admin.waitForURL(`${BASE}/yonetim**`);

  await admin.goto(`${BASE}/yonetim/bolgeler`);
  await admin.fill("input[name=name]", "Merkez");
  await admin.fill("input[name=fee]", "15");
  await admin.fill("input[name=minOrder]", "100");
  await admin.getByRole("button", { name: "Bölge ekle" }).click();
  await admin.getByRole("button", { name: "Pasifleştir" }).waitFor();
  step("bölge Merkez: ücret 15, asgari 100");

  await admin.goto(`${BASE}/yonetim/urunler`); await admin.getByRole("button", { name: "Ürün ekle" }).first().click();
  await admin.fill("input[name=name]", "Lahmacun");
  await admin.fill("input[name=price]", "60");
  await admin.getByRole("button", { name: "Ürünü kaydet" }).click();
  await admin.getByRole("cell", { name: /^Lahmacun/ }).waitFor();

  await admin.goto(`${BASE}/yonetim/personel`); await admin.getByRole("button", { name: "Personel ekle" }).first().click();
  for (const [name, role, p] of [["Ali Kasiyer", null, "4613"], ["Kemal Kurye", "Kurye", "6284"]]) {
    await admin.fill("input[name=name]", name);
    if (role) await admin.locator("label").filter({ hasText: new RegExp(`^${role}$`) }).click();
    await admin.fill("input[name=pin]", p);
    await admin.getByRole("button", { name: "Personeli kaydet" }).click();
    await admin.getByRole("cell", { name, exact: true }).waitFor();
  }
  step("ürün Lahmacun 60 TL; personel: kasiyer, kurye");

  await admin.goto(`${BASE}/yonetim/platformlar`);
  await admin.getByRole("button", { name: "Bağla" }).click();
  const secretEl = admin.getByTestId("webhook-secret");
  await secretEl.waitFor();
  const secret = (await secretEl.innerText()).trim();
  const hook = (await admin.locator("code", { hasText: "/webhook?t=" }).innerText()).trim().replace(/^https?:\/\/[^/]+/, BASE);
  await admin.fill("input[name=code]", "LAH");
  await choose(admin, admin.locator("form", { has: admin.locator("input[name=code]") }).getByRole("combobox"), "Lahmacun");
  await admin.getByRole("button", { name: "Eşle" }).click();
  await admin.locator("li", { hasText: "LAH" }).getByText("Lahmacun").waitFor();
  step("Deneme platformu bağlandı (otomatik kabul kapalı), LAH → Lahmacun");

  // — Cihazlar: kasa, mutfak ekranı, kurye telefonu —
  const pair = async (name, prefix, viewport) => {
    await admin.goto(`${BASE}/yonetim/cihazlar`);
    await admin.fill("input[name=name]", name);
    await admin.fill("input[name=receiptPrefix]", prefix);
    await admin.getByRole("button", { name: "Cihaz ekle" }).click();
    const code = (await admin.getByTestId("pairing-code").innerText()).trim();
    const p = await page(viewport);
    await p.goto(`${BASE}/kasa/eslestir`);
    await p.fill("input[name=code]", code);
    await p.getByRole("button", { name: "Eşle" }).click();
    await p.waitForURL(`${BASE}/kasa`);
    await p.waitForTimeout(2500);
    console.log("pair sonrası URL:", p.url(), "| Gir var:", await p.getByRole("button", { name: "Gir" }).count(), "| görünür butonlar:", (await p.locator("button:visible").allTextContents()).map(t=>t.trim()).filter(Boolean).slice(0,8).join(" | "));
    return p;
  };
  const setRole = async (i, label) => {
    await admin.goto(`${BASE}/yonetim/cihazlar`);
    await admin.getByRole("group", { name: "Cihaz rolü" }).nth(i).locator("label").filter({ hasText: new RegExp(`^${label}$`) }).click();
    await admin.getByRole("button", { name: "Rolü kaydet" }).nth(i).click();
    await admin.getByText("Kaydedildi.").waitFor();
  };
  const kasa = await pair("Kasa 1", "K1");
  await pin(kasa, "4613");
  await kasa.fill("input[name=amount]", "0");
  await kasa.getByRole("button", { name: "Vardiyayı aç" }).click();
  await kasa.getByRole("button", { name: "Paket", exact: true }).click();
  await kasa.getByRole("heading", { name: "Paket siparişleri" }).waitFor();
  const mutfak = await pair("Mutfak", "MT");
  await setRole(1, "Mutfak ekranı");
  // Rol, eşlemeden ÖNCE set edilir: pad, açılış kataloğunda yalnız kurye personelini görsün (yarış yok).
  await admin.goto(`${BASE}/yonetim/cihazlar`);
  await admin.fill("input[name=name]", "Kurye tel");
  await admin.fill("input[name=receiptPrefix]", "KR");
  await admin.getByRole("button", { name: "Cihaz ekle" }).click();
  const kuryeCode = (await admin.getByTestId("pairing-code").innerText()).trim();
  await setRole(2, "Kurye telefonu");
  const kurye = await page({ width: 390, height: 844 });
  await kurye.goto(`${BASE}/kasa/eslestir`);
  await kurye.fill("input[name=code]", kuryeCode);
  await kurye.getByRole("button", { name: "Eşle" }).click();
  await kurye.waitForURL(`${BASE}/kasa`);
  await mutfak.reload();
  await mutfak.getByText("Bekleyen sipariş yok.").waitFor();
  await kurye.reload();
  await pin(kurye, "4613");
  // Hidrasyon yarışı: tıklar hidrasyondan önceye düşerse hata metni çıkmaz → bir kez daha dene (2 hatalı deneme < kilit)
  if (!(await kurye.getByText("PIN hatalı", { exact: false }).isVisible().catch(() => false))) await pin(kurye, "4613");
  await kurye.getByText("PIN hatalı", { exact: false }).waitFor();
  await pin(kurye, "6284");
  try { await kurye.getByText("Üzerinizde sipariş yok.").waitFor({ timeout: 8000 }); }
  catch { console.log("kurye döküm:", kurye.url(), "|", (await kurye.locator("h1,h2,[role=alert],p:visible,button:visible").allTextContents()).map(t=>t.trim()).filter(Boolean).slice(0,10).join(" | ")); throw new Error("kurye ekranı yok"); }
  step("kasa Paket sekmesi; mutfak ekranı; kurye telefonu yalnız kurye PIN'iyle, vardiya kendiliğinden açık");

  // — Kasa: yeni paket —
  await kasa.getByRole("button", { name: "+ Yeni paket" }).click();
  await kasa.fill("input[name=phone]", "0532 123 45 67");
  await kasa.getByRole("button", { name: "Müşteriyi bul" }).click();
  await kasa.getByTestId("customer-status").getByText("Yeni müşteri").waitFor();
  await kasa.getByLabel("Ad soyad").fill("Ayşe Yılmaz");
  await kasa.getByLabel("Adres", { exact: true }).fill("Atatürk Cad. No 12 D 3");
  await kasa.locator("label").filter({ hasText: "Merkez" }).click();
  await kasa.getByRole("button", { name: "Siparişe geç" }).click();
  await kasa.getByRole("button", { name: /^Lahmacun/ }).click();
  await kasa.getByText("Asgari tutar 100,00 ₺ altında").waitFor();
  await kasa.getByRole("button", { name: /^Lahmacun/ }).click();
  await kasa.getByTestId("tab-remaining").getByText("135,00 ₺").waitFor();
  await kasa.getByRole("button", { name: /^Mutfağa gönder/ }).click();
  await kasa.getByText("mutfakta").first().waitFor();
  await kasa.getByRole("button", { name: "← Paket" }).click();
  step("kasa: paket Ayşe, Merkez, 2× Lahmacun + 15 paket ücreti = 135 (asgari uyarısı 1 adette), mutfağa");

  await ready(mutfak, "Lahmacun");
  const card = kasa.getByTestId("delivery-card").filter({ hasText: "Paket" });
  await kasa.getByRole("region", { name: "Hazır" }).getByTestId("delivery-card").waitFor({ timeout: 10000 });
  await card.getByRole("button", { name: "Kurye ata" }).click();
  await kasa.getByRole("dialog", { name: "Kurye ata" }).getByRole("button", { name: "Kemal Kurye" }).click();
  await card.getByText("Kurye: Kemal Kurye").waitFor();
  step("mutfak hazır → kasa kurye atadı");

  // — Kurye —
  await kurye.getByTestId("courier-card").waitFor({ timeout: 10000 });
  await kurye.getByRole("button", { name: "Yola çıktım (1)" }).click();
  await kurye.getByRole("button", { name: "Teslim ettim" }).click();
  await kurye.getByRole("dialog", { name: "Nasıl ödendi?" }).getByRole("button", { name: "Nakit" }).click();
  await kurye.getByText("Üzerinizde sipariş yok.").waitFor();
  await kurye.getByTestId("courier-cash").getByText("135,00 ₺").waitFor();
  await kasa.getByRole("region", { name: "Son 12 saatte kapanan" }).getByTestId("delivery-card").waitFor({ timeout: 10000 });
  step("kurye: yola çıktı, nakit teslim; üzerindeki nakit 135; kasada 'Bugün kapanan'");

  await kurye.getByRole("button", { name: "Hesap kapat (kasiyer onayı)" }).click();
  await pin(kurye, "6284");
  await kurye.getByText("PIN hatalı", { exact: false }).waitFor();
  await pin(kurye, "4613");
  try { await kurye.fill("input[name=amount]", "135", { timeout: 8000 }); }
  catch { console.log("guns sonu döküm:", kurye.url(), "|", (await kurye.locator("h1,h2,[role=alert],p:visible").allTextContents()).map(t=>t.trim()).filter(Boolean).slice(0,8).join(" | ")); throw new Error("tutar alanı yok"); }
  await kurye.getByRole("button", { name: "Gün sonunu kapat" }).click();
  await kurye.getByRole("heading", { name: "Vardiya kapandı" }).waitFor();
  step("kurye hesap kapattı: kurye PIN'i reddedildi, kasiyer PIN'i, sayılan 135");

  const lookup = await kasa.evaluate(async () => (await fetch("/api/musteri?tel=905321234567")).json());
  if (lookup.customer?.name !== "Ayşe Yılmaz" || lookup.addresses.length !== 1 || lookup.recent.length !== 1) throw new Error(`müşteri defteri: ${JSON.stringify(lookup).slice(0, 300)}`);
  step("/api/musteri: Ayşe Yılmaz, 1 adres, 1 son sipariş");

  // — Platform siparişi —
  const ext = `E2E-${stamp}`;
  const body = JSON.stringify({ orders: [{ externalId: ext, customer: { name: "Can Demir", phone: "05329876543" }, address: "Cumhuriyet Mah. 5", payIntent: "online",
    lines: [{ code: "LAH", name: "Lahmacun (platform)", unitPrice: 6500, qtyMilli: 1000, note: null }, { code: "AYR-B", name: "Büyük Ayran", unitPrice: 4000, qtyMilli: 1000, note: null }] }] });
  const sig = createHmac("sha256", secret).update(body).digest("hex");
  for (const s of [sig, sig, "bozuk"]) {
    const r = await fetch(hook, { method: "POST", headers: { "content-type": "application/json", "x-signature": s }, body });
    if (r.status !== (s === "bozuk" ? 401 : 200)) throw new Error(`webhook ${r.status}`);
  }
  await kasa.getByTestId("waiting-count").getByText("1 onay bekliyor").waitFor({ timeout: 10000 });
  const pcard = kasa.getByRole("region", { name: "Onay bekliyor" }).getByTestId("delivery-card");
  if ((await pcard.count()) !== 1) throw new Error("onay bekleyen kart sayısı");
  await pcard.getByText("105,00 ₺").waitFor();
  step("webhook iki kez (+ bozuk imza 401) → tek onay bekleyen kart, 105 TL (LAH eşlendi, bilinmeyen kod serbest satır)");

  await pcard.getByRole("button", { name: "Kabul" }).click();
  await kasa.getByRole("dialog", { name: "Hazırlama süresi" }).getByRole("button", { name: "20 dk" }).click();
  await kasa.getByTestId("waiting-count").waitFor({ state: "detached" });
  let audit = 0;
  for (let i = 0; i < 50 && !audit; i++) {
    [{ n: audit }] = await sql`select count(*)::int n from audit_log where action = 'platform.accept' and detail->>'externalId' = ${ext}`;
    if (!audit) await new Promise((r) => setTimeout(r, 200));
  }
  if (audit !== 1) throw new Error(`audit platform.accept: ${audit}`);
  step("Kabul (20 dk) → audit platform.accept");

  await ready(mutfak, "Büyük Ayran");
  const hcard = kasa.getByRole("region", { name: "Hazır" }).getByTestId("delivery-card");
  await hcard.getByRole("button", { name: "Kuryeye verildi" }).click();
  await kasa.getByRole("region", { name: "Son 12 saatte kapanan" }).getByTestId("delivery-card").nth(1).waitFor({ timeout: 10000 });
  step("mutfak hazır → Kuryeye verildi → kapandı");

  let sales = [];
  for (let i = 0; i < 50 && sales.length < 2; i++) {
    sales = await sql`select s.channel, s.total, s.review, p.method from sales s join stores st on st.id = s.store_id join tenants t on t.id = st.tenant_id
      join payments p on p.sale_id = s.id where t.name = ${tenant} order by s.created_at`;
    if (sales.length < 2) await new Promise((r) => setTimeout(r, 300));
  }
  const got = sales.map((s) => `${s.channel}/${s.method}/${s.total}/${s.review ?? "-"}`).join(", ");
  if (got !== "paket/nakit/13500/-, platform/online/10500/-") throw new Error(`satışlar: ${got}`);
  step(`bulut satışları: ${got}`);

  // — Otomatik kabul: toggle açıkken webhook → onay beklemeden Hazırlanıyor + mutfağa bilet + audit —
  await admin.goto(`${BASE}/yonetim/platformlar`);
  const togg = admin.getByRole("checkbox", { name: /Otomatik kabul/ });
  await togg.check({ force: true }).catch(() => {}); // RSC yeniden çizimi tık sırasında elementi değiştirebilir
  for (let i = 0; i < 25 && !(await togg.isChecked()); i++) await new Promise((r) => setTimeout(r, 200));
  if (!(await togg.isChecked())) throw new Error("otomatik kabul togglesi açılmadı");
  step("otomatik kabul togglesi açıldı");
  // Kaydın DB'ye düşmesini bekle (webhook connection SELECT'i eski autoAccept'i okumasın)
  let upd = 0;
  for (let i = 0; i < 50 && !upd; i++) { [{ n: upd }] = await sql`select count(*)::int n from audit_log where action = 'platform.update' and created_at > now() - interval '1 minute'`; if (!upd) await new Promise((r) => setTimeout(r, 200)); }

  const ext2 = `E2E-A-${stamp}`;
  const body2 = JSON.stringify({ orders: [{ externalId: ext2, customer: { name: "Deniz Ak", phone: "05330001122" }, address: "İstiklal Cad. 9", payIntent: "online",
    lines: [{ code: "LAH", name: "Lahmacun (oto)", unitPrice: 6000, qtyMilli: 2000, note: null }] }] });
  const sig2 = createHmac("sha256", secret).update(body2).digest("hex");
  const r2 = await fetch(hook, { method: "POST", headers: { "content-type": "application/json", "x-signature": sig2 }, body: body2 });
  if (r2.status !== 200) throw new Error(`oto kabul webhook ${r2.status}`); console.log("webhook2:", JSON.stringify(await r2.json()));
  if (await kasa.getByTestId("waiting-count").count()) throw new Error("oto kabullü sipariş onay bekleyenlere düştü");
  const otoKart = kasa.getByRole("region", { name: "Hazırlanıyor" }).getByTestId("delivery-card");
  try { await otoKart.first().waitFor({ timeout: 12000 }); }
  catch {
    console.log("PANO-1 regions:", (await kasa.getByRole("region").allTextContents()).map((t) => t.trim().replace(/\s+/g, " ").slice(0, 60)).join(" || ") || "(yok)");
    if (await kasa.getByRole("button", { name: "Gir" }).count()) {
      await pin(kasa, "4613");
      await kasa.getByRole("button", { name: "Paket", exact: true }).click();
      await kasa.getByRole("region", { name: "Hazırlanıyor" }).waitFor({ timeout: 10000 });
    }
    await otoKart.first().waitFor({ timeout: 10000 });
  }
  await mutfak.locator("[data-ticket]:not([data-status=hazir])", { hasText: "Lahmacun" }).waitFor({ timeout: 15000 }); // eşlenen satır bilette ürün adıyla görünür
  let audit2 = 0;
  for (let i = 0; i < 50 && !audit2; i++) {
    [{ n: audit2 }] = await sql`select count(*)::int n from audit_log where action = 'platform.accept' and detail->>'externalId' = ${ext2}`;
    if (!audit2) await new Promise((r) => setTimeout(r, 200));
  }
  if (audit2 !== 1) throw new Error(`oto kabul audit: ${audit2}`);
  step("otomatik kabul: webhook → doğrudan Hazırlanıyor, mutfağa bilet, audit platform.accept");
} finally {
  await browser.close();
  await sql.end();
}
if (errors.length) throw new Error(`sayfa hataları: ${errors.join(" | ")}`);
console.log("M6 OK");
