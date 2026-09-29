// e2e/iade.mjs — e-Arşiv'li satışın kısmi iadesi: nihai tüketici → kasada termal İADE TUTANAĞI + bulutta çözülmüş kayıt;
// VKN'li alıcı → fişte "alıcı iade faturası" notu → İncelenecek'te no gir → kapanır; Mali → Belgeler'de A4 tutanak.
// Kullanım: npm run build && node --env-file=.env.local e2e/iade.mjs (sunucu :3800)
import { chromium } from "playwright-core";
import postgres from "postgres";

const BASE = process.env.BASE ?? "http://localhost:3800";
const stamp = Date.now();
const tenant = `E2E Kebapçı ${stamp}`;
const step = (m) => console.log("•", m);
const expect = (got, want, what) => { if (got !== want) throw new Error(`${what}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`); };

// HEADED=1: görünür pencere, yavaş; sonda pencere kapanana kadar açık kalır (tasarım/akış demosu).
const HEADED = !!process.env.HEADED;
const browser = await chromium.launch({ channel: "chrome", headless: !HEADED, slowMo: HEADED ? 350 : 0 });
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
const refundsOf = async (receiptNo) => sql`select r.* from fiscal_refunds r join fiscal_documents d on d.id = r.fiscal_doc_id join sales s on s.id = d.sale_id join tenants t on t.id = s.tenant_id where t.name = ${tenant} and s.receipt_no = ${receiptNo} order by r.created_at`;
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


const localNumber = (kasa, receiptNo) => kasa.evaluate((no) => new Promise((res) => {
  const r = indexedDB.open("cabukpos-kasa");
  r.onsuccess = () => { const g = r.result.transaction("sales").objectStore("sales").getAll(); g.onsuccess = () => res(g.result.find((x) => x.receiptNo === no)?.fiscal?.number ?? null); };
  r.onerror = () => res(null);
}), receiptNo);
const refundOne = async (kasa, no, product) => {
  await kasa.getByRole("button", { name: "İade" }).click();
  await kasa.getByLabel("İade fiş no").fill(no);
  await kasa.getByRole("button", { name: "Fişi bul" }).click();
  await kasa.getByRole("button", { name: `${product} iade artır` }).click();
  await kasa.getByRole("button", { name: "İadeyi onayla" }).click();
  await pin(kasa, "7391");
  await kasa.getByText("İADE FİŞİ").waitFor();
};

try {
  const admin = await page();
  await admin.goto(`${BASE}/kayit`);
  await admin.fill("input[name=businessName]", tenant);
  await admin.getByRole("button", { name: "Restoran" }).click();
  await admin.fill("input[name=name]", "Yiğit Test");
  await admin.fill("input[name=email]", `iade-${stamp}@ornek.com`);
  await admin.fill("input[name=password]", "Cabukpos2026x");
  await admin.getByRole("button", { name: "Hesap oluştur" }).click();
  await admin.waitForURL(`${BASE}/yonetim**`);

  await admin.goto(`${BASE}/yonetim/urunler`);
  for (const [name, price] of [["Adana", "300"], ["Ayran", "50"]]) {
    await admin.fill("input[name=name]", name);
    await admin.fill("input[name=price]", price);
    await admin.getByRole("button", { name: "%10", exact: true }).click();
    await admin.getByRole("button", { name: "Ürünü kaydet" }).click();
    await admin.getByRole("cell", { name, exact: true }).waitFor();
  }
  await admin.goto(`${BASE}/yonetim/personel`);
  for (const [name, role, p] of [["Ayşe Kasiyer", null, "5820"], ["Mehmet Müdür", "Müdür", "7391"]]) {
    await admin.fill("input[name=name]", name);
    if (role) await admin.getByRole("button", { name: role, exact: true }).click();
    await admin.fill("input[name=pin]", p);
    await admin.getByRole("button", { name: "Personeli kaydet" }).click();
    await admin.getByRole("cell", { name }).waitFor();
  }
  await admin.goto(`${BASE}/yonetim/mali`);
  await admin.getByRole("group", { name: "Kasa (hızlı satış)" }).getByRole("button", { name: "e-Arşiv" }).click();
  await admin.fill("input[name=taxId]", "1234567890");
  await admin.fill("input[name=taxOffice]", "Kadıköy");
  await admin.fill("textarea[name=address]", "Moda Cd. 1, Kadıköy / İstanbul");
  await admin.getByRole("button", { name: "Kaydet" }).click();
  await admin.getByText("Kaydedildi.").waitFor();

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
  step("kurulum: 2 ürün, kasa = e-Arşiv, vardiya açık");

  // — 1. satış nihai tüketici → kısmi iade → termal tutanak —
  await kasa.getByRole("button", { name: /^Adana \d/ }).click();
  await kasa.getByRole("button", { name: /^Ayran \d/ }).click();
  await kasa.getByRole("button", { name: "Öde" }).click();
  await kasa.getByRole("button", { name: "Tamamı kart" }).click();
  await kasa.getByRole("button", { name: "Satışı tamamla" }).click();
  await kasa.getByText(/Fiş K1-000001/).waitFor();
  const d1 = await waitDoc("K1-000001", (d) => d.status === "issued", "1. satış kesildi");
  await refundOne(kasa, "k1-1", "Ayran");
  const note = kasa.getByTestId("refund-note");
  for (const t of ["İADE TUTANAĞI", "K1-000002", d1.number, d1.ettn, "Müşteri imza", "Satıcı imza"]) await note.getByText(t, { exact: false }).first().waitFor();
  await kasa.getByRole("button", { name: "Kasaya dön" }).click();
  const r1 = await (async () => { for (let i = 0; i < 60; i++) { const r = await refundsOf("K1-000001"); if (r.length) return r; await new Promise((x) => setTimeout(x, 250)); } throw new Error("bulutta tutanak kaydı yok"); })();
  expect(r1[0].kind, "tutanak", "kayıt türü");
  if (!r1[0].resolved_at) throw new Error("tutanak çözülmüş olmalı");
  expect((await docOf("K1-000001")).status, "issued", "kısmi iadede fatura geçerli");
  step(`kısmi iade (nihai tüketici) → kasada İADE TUTANAĞI (${d1.number}), bulutta tutanak, fatura issued`);

  // — 2. satış VKN'li alıcı → kısmi iade → not + İncelenecek —
  await kasa.getByRole("button", { name: /^Adana \d/ }).click();
  await kasa.getByRole("button", { name: /^Ayran \d/ }).click();
  await kasa.getByRole("button", { name: "Öde" }).click();
  await kasa.getByRole("button", { name: "Tamamı nakit" }).click();
  await kasa.getByRole("button", { name: "Fatura", exact: true }).click();
  await kasa.fill("input[name=buyer-taxId]", "1234567890");
  await kasa.fill("input[name=buyer-name]", "Acme Gıda Ltd");
  await kasa.fill("textarea[name=buyer-address]", "Kızılay, Ankara");
  await kasa.getByRole("button", { name: "Fatura bilgisini kaydet" }).click();
  await kasa.getByTestId("buyer-badge").getByText("Acme Gıda Ltd").waitFor();
  await kasa.getByRole("button", { name: "Satışı tamamla" }).click();
  await kasa.getByText(/Fiş K1-000003/).waitFor();
  const d3 = await waitDoc("K1-000003", (d) => d.status === "issued", "3. fiş kesildi");
  for (let i = 0; !(await localNumber(kasa, "K1-000003")); i++) { if (i > 40) break; await new Promise((r) => setTimeout(r, 250)); }
  await refundOne(kasa, "k1-3", "Ayran");
  await kasa.getByText(`Alıcı iade faturası düzenleyecektir. Fatura: ${d3.number}`).waitFor();
  if (await kasa.getByTestId("refund-note").count()) throw new Error("VKN'li alıcıya tutanak basıldı");
  await kasa.getByRole("button", { name: "Kasaya dön" }).click();
  for (let i = 0; !(await refundsOf("K1-000003")).length; i++) { if (i > 60) throw new Error("bulutta alıcı faturası kaydı yok"); await new Promise((r) => setTimeout(r, 250)); }
  expect((await refundsOf("K1-000003"))[0].kind, "alici_faturasi", "VKN kayıt türü");
  step("kısmi iade (VKN) → fişte 'Alıcı iade faturası düzenleyecektir', bulutta alici_faturasi");

  await admin.goto(`${BASE}/yonetim/raporlar?sekme=inceleme`);
  const bi = admin.getByTestId("buyer-invoices");
  await bi.getByText("Alıcının iade faturası bekleniyor (1)").waitFor();
  await bi.getByLabel("Alıcının fatura no").fill("ACM2026000000042");
  await bi.getByRole("button", { name: "Kaydet" }).click();
  await admin.getByTestId("buyer-invoices").waitFor({ state: "detached" });
  const [r3] = await refundsOf("K1-000003");
  expect(r3.buyer_invoice_no, "ACM2026000000042", "alıcı fatura no");
  if (!r3.resolved_at) throw new Error("alıcı faturası kaydı kapanmadı");
  step("İncelenecek: alıcı faturası no girildi → kayıt kapandı");

  await admin.goto(`${BASE}/yonetim/mali?sekme=belgeler`);
  await admin.getByRole("link", { name: "Alıcı iade faturası ACM2026000000042" }).waitFor();
  await admin.getByRole("link", { name: "İade tutanağı" }).click();
  const a4 = admin.getByTestId("refund-a4");
  for (const t of ["İADE TUTANAĞI", d1.number, "Ayran", "Müşteri imza"]) await a4.getByText(t, { exact: false }).first().waitFor();
  step("Mali → Belgeler: tutanak ve alıcı faturası bağlantıları, A4 tutanak");

  if (errors.length) throw new Error(`sayfa hataları: ${errors.join(" | ")}`);
  console.log("İADE OK");
  if (HEADED) {
    console.log(`Demo hesabı: iade-${stamp}@ornek.com / Cabukpos2026x · kasa PIN 5820 (kasiyer), 7391 (müdür). Pencereyi kapatınca biter.`);
    await new Promise((r) => browser.on("disconnected", r));
  }
} finally {
  await browser.close();
  await sql.end();
}
