// e2e/m8.mjs — Mali belge (sahte e-Arşiv). Ayar: vergi bilgisi + kasa = e-Arşiv → satış (nihai tüketici) → fişte e-Arşiv no + ETTN →
// /f/<token> 200 + TEST bandı → hata simülasyonu açık, satış + "Fatura" (VKN, e-posta) → fişte "e-postayla" → error, 1. deneme →
// simülasyon kapalı, yönetimde Yeniden dene → issued → tam iade → cancelled → gün sonunda "Kesilemeyen e-Arşiv" yok.
// (Paket kanalı modu tests/fiscal-db.test.ts'te.) Kullanım: npm run build && node --env-file=.env.local e2e/m8.mjs (sunucu :3800)
import { chromium } from "playwright-core";
import postgres from "postgres";

const BASE = process.env.BASE ?? "http://localhost:3800";
const stamp = Date.now();
const testIp = `198.51.100.${(stamp % 250) + 1}`;
const tenant = `E2E Kebapçı ${stamp}`;
const step = (m) => console.log("•", m);
const expect = (got, want, what) => { if (got !== want) throw new Error(`${what}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`); };
const year = new Date().getFullYear();

const browser = await chromium.launch({ channel: "chrome", headless: true });
const sql = postgres(process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL, { max: 1 });
const errors = [];
const page = async () => {
const p = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: { "x-vercel-forwarded-for": testIp } })).newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  return p;
};
const pin = async (p, digits) => {
  for (const d of digits) await p.getByRole("button", { name: d, exact: true }).click();
  await p.getByRole("button", { name: "Gir" }).click();
};
const docOf = async (receiptNo) => (await sql`select d.* from fiscal_documents d join sales s on s.id = d.sale_id join tenants t on t.id = s.tenant_id where t.name = ${tenant} and s.receipt_no = ${receiptNo}`)[0];
const waitDoc = async (receiptNo, pred, what, ms = 15000) => {
  const end = Date.now() + ms;
  for (;;) {
    const d = await docOf(receiptNo);
    if (d && pred(d)) return d;
    if (Date.now() > end) throw new Error(`${what}: ${JSON.stringify(d && { status: d.status, attempts: d.attempts, lastError: d.last_error })}`);
    await new Promise((r) => setTimeout(r, 300));
  }
};

try {
  const admin = await page();
  await admin.goto(`${BASE}/kayit`);
  await admin.fill("input[name=businessName]", tenant);
  await admin.getByText("Restoran", { exact: true }).click();
  await admin.fill("input[name=name]", "Yiğit Test");
  await admin.fill("input[name=email]", `m8-${stamp}@ornek.com`);
  await admin.fill("input[name=password]", "Cabukpos2026x");
  await admin.getByRole("button", { name: "Hesap oluştur" }).click();
  await admin.waitForURL(`${BASE}/yonetim**`);

  await admin.goto(`${BASE}/yonetim/urunler`);
  await admin.fill("input[name=name]", "Adana");
  await admin.fill("input[name=price]", "300");
  await admin.locator("label").filter({ hasText: /^%10$/ }).click();
  await admin.getByRole("button", { name: "Ürünü kaydet" }).click();
  await admin.getByRole("cell", { name: "Adana", exact: true }).waitFor();
  await admin.goto(`${BASE}/yonetim/personel`);
  for (const [name, role, p] of [["Ayşe Kasiyer", null, "5820"], ["Mehmet Müdür", "Müdür", "7391"]]) {
    await admin.fill("input[name=name]", name);
    if (role) await admin.locator("label").filter({ hasText: new RegExp(`^${role}$`) }).click();
    await admin.fill("input[name=pin]", p);
    await admin.getByRole("button", { name: "Personeli kaydet" }).click();
    await admin.getByRole("cell", { name, exact: true }).waitFor();
  }

  // — Mali ayar: e-Arşiv vergi bilgisi olmadan kaydedilmez —
  await admin.goto(`${BASE}/yonetim/mali`);
  await admin.getByText("TEST sağlayıcısı").waitFor();
  await admin.getByRole("group", { name: "Kasa (hızlı satış)" }).locator("label").filter({ hasText: "e-Arşiv" }).click();
  await admin.getByRole("button", { name: "Kaydet" }).click();
  expect(await admin.locator("input[name=taxId]").evaluate((el) => el.checkValidity()), false, "taxId HTML5 zorunlu");
  await admin.fill("input[name=taxOffice]", "Kadıköy");
  await admin.fill("textarea[name=address]", "Moda Cd. 1, Kadıköy / İstanbul");
  await admin.fill("input[name=taxId]", "1234567891");
  await admin.getByRole("button", { name: "Kaydet" }).click();
  await admin.getByText(/Vergi no geçersiz/).waitFor();
  await admin.fill("input[name=taxId]", "1234567890");
  await admin.getByRole("button", { name: "Kaydet" }).click();
  await admin.getByText("Kaydedildi.").waitFor();
  step("mali ayar: vergi no zorunlu + geçersiz VKN reddedildi; kasa = e-Arşiv, TEST sağlayıcısı");

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

  // — 1. satış: nihai tüketici, hemen kesilir —
  await kasa.getByRole("button", { name: /^Adana \d/ }).click();
  await kasa.getByRole("button", { name: "Öde" }).click();
  await kasa.getByRole("button", { name: "Tamamı kart" }).click();
  await kasa.getByRole("button", { name: "Satışı tamamla" }).click();
  await kasa.getByText(/Fiş K1-000001/).waitFor();
  const d1 = await waitDoc("K1-000001", (d) => d.status === "issued", "1. satış kesildi");
  expect(d1.number, `CBP${year}000000001`, "1. numara");
  expect(d1.buyer.taxId, "11111111111", "nihai tüketici");
  // Kasa numarayı yerel satışa yazınca fiş e-Arşiv olur (yavaş ağda kesimden biraz sonra)
  const localNumber = () => kasa.evaluate(() => new Promise((res) => {
    const r = indexedDB.open("cabukpos-kasa");
    r.onsuccess = () => { const g = r.result.transaction("sales").objectStore("sales").getAll(); g.onsuccess = () => res(g.result.find((x) => x.receiptNo === "K1-000001")?.fiscal?.number ?? null); };
    r.onerror = () => res(null);
  }));
  for (let i = 0; !(await localNumber()); i++) { if (i > 40) throw new Error("kasa yerel satışına e-Arşiv no yazılmadı"); await new Promise((r) => setTimeout(r, 250)); }
  await kasa.getByRole("button", { name: "Fişi yazdır" }).click();
  const rf = kasa.getByTestId("receipt-fiscal");
  for (const t of ["e-ARŞİV FATURA", d1.number, d1.ettn, "TEST — mali değeri yoktur"]) await rf.getByText(t, { exact: false }).first().waitFor();
  if (await kasa.getByText("Bilgi fişidir, mali değeri yoktur.").count()) throw new Error("e-Arşiv fişinde bilgi fişi notu");
  await kasa.getByRole("button", { name: "Kasaya dön" }).click();
  step(`satış 1 → ${d1.number}, fişte e-Arşiv no + ETTN + TEST`);

  const pub = await page();
  const res = await pub.goto(`${BASE}/f/${d1.token}`);
  expect(res.status(), 200, "fatura sayfası");
  await pub.getByTestId("test-band").waitFor();
  expect((await pub.getByTestId("fiscal-number").innerText()).trim(), d1.number, "sayfada numara");
  for (const t of ["E2E Kebapçı", "Moda Cd. 1", "Nihai Tüketici", "Adana", "₺300,00"]) await pub.getByText(t, { exact: false }).locator("visible=true").first().waitFor();
  const robots = await pub.locator('meta[name="robots"]').getAttribute("content");
  if (!robots?.includes("noindex")) throw new Error(`robots: ${robots}`);
  expect((await pub.goto(`${BASE}/f/${"x".repeat(24)}`)).status(), 404, "bilinmeyen token");
  step("/f/<token> 200, TEST bandı, noindex; bilinmeyen token 404");

  // — Hata simülasyonu: 2. satış "Fatura" (VKN) → kesilemez —
  await admin.goto(`${BASE}/yonetim/mali`);
  await admin.getByLabel(/Hata simülasyonu/).check();
  await admin.getByRole("button", { name: "Kaydet" }).click();
  await admin.getByText("Kaydedildi.").waitFor();
  await kasa.getByRole("button", { name: /^Adana \d/ }).click();
  await kasa.getByRole("button", { name: "Öde" }).click();
  await kasa.getByRole("button", { name: "Tamamı nakit" }).click();
  await kasa.getByRole("button", { name: "Fatura", exact: true }).click();
  await kasa.fill("input[name=buyer-taxId]", "1234567890");
  await kasa.fill("input[name=buyer-name]", "Acme Gıda Ltd");
  await kasa.fill("input[name=buyer-email]", "muhasebe@acme.test");
  await kasa.getByRole("button", { name: "Fatura bilgisini kaydet" }).click();
  await kasa.getByText("VKN'de adres zorunlu").waitFor();
  await kasa.fill("textarea[name=buyer-address]", "Kızılay, Ankara");
  await kasa.getByRole("button", { name: "Fatura bilgisini kaydet" }).click();
  await kasa.getByTestId("buyer-badge").getByText("Acme Gıda Ltd").waitFor();
  await kasa.getByRole("button", { name: "Satışı tamamla" }).click();
  await kasa.getByText(/Fiş K1-000002/).waitFor();
  const d2 = await waitDoc("K1-000002", (d) => d.status === "error", "2. satış hata");
  expect(d2.attempts, 1, "1. deneme");
  expect(d2.buyer.name, "Acme Gıda Ltd", "alıcı");
  await new Promise((r) => setTimeout(r, 1000));
  await kasa.getByRole("button", { name: "Fişi yazdır" }).click();
  await kasa.getByTestId("receipt-fiscal").getByText("Faturanız e-postayla gönderilecek.").waitFor();
  await kasa.getByText("Bilgi fişidir, mali değeri yoktur.").waitFor();
  await kasa.getByRole("button", { name: "Kasaya dön" }).click();
  step("hata simülasyonu: satış 2 (Fatura, VKN adres zorunlu) → error, 1. deneme; fişte 'e-postayla'");

  // — Yönetim: sayaç, yeniden dene —
  await admin.getByLabel(/Hata simülasyonu/).uncheck();
  await admin.getByRole("button", { name: "Kaydet" }).click();
  await admin.getByText("Kaydedildi.").waitFor();
  await admin.goto(`${BASE}/yonetim/mali?sekme=belgeler`);
  await admin.getByText("1 hata").waitFor();
  const row = admin.getByTestId("fiscal-row").filter({ hasText: "K1-000002" });
  await row.getByText("Sahte sağlayıcı: hata simülasyonu").waitFor();
  await row.getByRole("button", { name: "Yeniden dene" }).click();
  await row.getByText(`Kesildi: CBP${year}000000002`).waitFor();
  const d2b = await waitDoc("K1-000002", (d) => d.status === "issued", "yeniden dene");
  expect(d2b.number, `CBP${year}000000002`, "2. numara (hata numara yakmadı)");
  step(`yönetim: '1 hata' → Yeniden dene → ${d2b.number}`);

  // — Tam iade → iptal —
  await kasa.getByRole("button", { name: "İade" }).click();
  await kasa.getByLabel("Fiş numarası").fill("k1-2");
  await kasa.getByRole("button", { name: "Fişi bul" }).click();
  await kasa.getByRole("button", { name: "Adana iade artır" }).click();
  await kasa.getByRole("button", { name: "İadeyi onayla" }).click();
  await pin(kasa, "7391");
  await kasa.getByText("İADE FİŞİ").waitFor();
  await kasa.getByRole("button", { name: "Kasaya dön" }).click();
  await waitDoc("K1-000002", (d) => d.status === "cancelled", "tam iade → iptal");
  await pub.goto(`${BASE}/f/${d2.token}`);
  await pub.getByText("İPTAL EDİLDİ").waitFor();
  step("tam iade → cancelled, sayfada İPTAL EDİLDİ");

  await kasa.getByRole("button", { name: "Gün sonu" }).click();
  await kasa.getByText("2 satış").first().waitFor();
  if (await kasa.getByText("Kesilemeyen e-Arşiv").count()) throw new Error("gün sonunda kesilemeyen e-Arşiv sayacı");
  step("gün sonu: kesilemeyen e-Arşiv satırı yok");

  if (errors.length) throw new Error(`sayfa hataları: ${errors.join(" | ")}`);
  console.log("M8 OK");
} finally {
  await browser.close();
  await sql.end();
}
