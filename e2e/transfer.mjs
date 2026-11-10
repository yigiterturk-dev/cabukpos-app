// Yerel prova: çok ürünlü transfer, hata halinde atomiklik, satır düzenleme ve mobil form.
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import postgres from "postgres";

const BASE = process.env.BASE ?? "http://localhost:3800";
const stamp = Date.now();
const testHeaders = { "x-vercel-forwarded-for": `198.51.100.${(stamp % 250) + 1}` };
const email = `e2e-transfer-${stamp}@ornek.com`;
const receiverEmail = `receiver-${email}`;
const unrelatedEmail = `unrelated-${email}`;
const sql = postgres(process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: testHeaders });
const page = await context.newPage();
page.setDefaultTimeout(45000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const step = (message) => console.log("•", message);
try {
  await page.goto(`${BASE}/kayit`);
  await page.fill("input[name=businessName]", "E2E Transfer");
  await page.getByText("Market", { exact: true }).click();
  await page.fill("input[name=name]", "Transfer Sahibi");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "Cabukpos2026x");
  await page.getByRole("button", { name: "Hesap oluştur" }).click();
  await page.waitForURL(`${BASE}/yonetim**`);
  const [user] = await sql`select tenant_id, password_hash from users where email = ${email}`;
  const fixture = await sql.begin(async (tx) => {
    await tx`select set_config('app.tenant_id', ${user.tenant_id}, true)`;
    const [to] = await tx`select id from stores where tenant_id = ${user.tenant_id} order by created_at limit 1`;
    const [from] = await tx`insert into stores (tenant_id, name, kind) values (${user.tenant_id}, 'Transfer Deposu', 'depo') returning id`;
    const [unrelated] = await tx`insert into stores (tenant_id, name) values (${user.tenant_id}, 'Başka Şube') returning id`;
    await tx`insert into users (tenant_id, name, email, password_hash, role, store_id) values
      (${user.tenant_id}, 'Teslim Alan', ${receiverEmail}, ${user.password_hash}, 'mudur', ${to.id}),
      (${user.tenant_id}, 'İlgisiz Müdür', ${unrelatedEmail}, ${user.password_hash}, 'mudur', ${unrelated.id})`;
    const [flour] = await tx`insert into products (tenant_id, name, price, vat_rate, track_stock, kind) values (${user.tenant_id}, 'Transfer Un', 5000, 1, true, 'tartili') returning id`;
    const [cups] = await tx`insert into products (tenant_id, name, price, vat_rate, track_stock) values (${user.tenant_id}, 'Transfer Bardak', 1000, 20, true) returning id`;
    await tx`insert into stock_movements (tenant_id, store_id, product_id, kind, qty_milli, actor) values
      (${user.tenant_id}, ${from.id}, ${flour.id}, 'sayim', 10000, 'e2e'),
      (${user.tenant_id}, ${from.id}, ${cups.id}, 'sayim', 8000, 'e2e')`;
    return { to: to.id, from: from.id, flour: flour.id, cups: cups.id };
  });
  await page.goto(`${BASE}/yonetim/transferler?from=${fixture.from}&to=${fixture.to}`);
  const form = page.getByRole("region", { name: "Yeni transfer" }).locator("form");
  const choose = async (i, name) => {
    await form.getByRole("combobox").nth(i).click();
    await page.getByRole("option", { name: new RegExp(`^${name} ·`) }).click();
  };
  await choose(0, "Transfer Un");
  await form.getByRole("textbox", { name: "Miktar 1", exact: true }).fill("2,5");
  await form.getByRole("button", { name: "Ürün ekle", exact: true }).click();
  await form.getByRole("combobox").nth(1).click();
  assert.equal(await page.getByRole("option", { name: /^Transfer Un ·/ }).count(), 0);
  await page.getByRole("option", { name: /^Transfer Bardak ·/ }).click();
  await form.getByRole("button", { name: "2. ürünü kaldır", exact: true }).click();
  assert.equal(await form.locator("input[name=qty]").first().inputValue(), "2,5");
  await form.getByRole("button", { name: "Ürün ekle", exact: true }).click();
  await choose(1, "Transfer Bardak");
  await form.getByRole("textbox", { name: "Miktar 2", exact: true }).fill("99");
  await form.getByRole("button", { name: "Transfer et", exact: true }).click();
  await form.getByRole("alert").filter({ hasText: "Transfer Bardak: kaynakta yalnız" }).waitFor();
  await page.waitForFunction(() => document.activeElement === document.querySelectorAll('input[name="qty"]')[1]);
  assert.equal(await form.locator("input[name=qty]").first().inputValue(), "2,5");
  const count = await sql.begin(async (tx) => {
    await tx`select set_config('app.tenant_id', ${user.tenant_id}, true)`;
    return tx`select id from stock_transfers where tenant_id = ${user.tenant_id}`;
  });
  assert.equal(count.length, 0, "hatalı fiş kısmi transfer yazmamalı");
  step("iki kalem, satır ekle/kaldır, tekrarlı ürün engeli ve yetersiz stokta atomiklik");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "masaüstünde yatay taşma");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "mobilde yatay taşma");
  await page.screenshot({ path: "/tmp/cabukpos-transfer-mobile.png", fullPage: true });
  await form.getByRole("textbox", { name: "Miktar 2", exact: true }).fill("3");
  await form.getByRole("button", { name: "Transfer et", exact: true }).click();
  await form.getByRole("status").filter({ hasText: "Transfer kaydedildi" }).waitFor();
  assert.equal(await form.locator("input[name=qty]").count(), 1, "başarılı fişten sonra form sıfırlanmalı");
  assert.equal(await form.locator("input[name=qty]").inputValue(), "");
  await page.getByText("Transfer Un", { exact: true }).waitFor();
  await page.getByText("Transfer Bardak", { exact: true }).waitFor();
  await choose(0, "Transfer Un");
  await form.getByRole("textbox", { name: "Miktar 1", exact: true }).fill("99");
  await form.getByRole("button", { name: "Transfer et", exact: true }).click();
  await form.getByRole("alert").filter({ hasText: "Transfer Un: kaynakta yalnız" }).waitFor();
  assert.equal(await form.locator("input[name=qty]").inputValue(), "99", "önceki başarılı fişten sonraki hata da girdiyi korumalı");
  await page.getByRole("link", { name: "Detay / Yazdır", exact: true }).click();
  const detail = page.getByRole("article", { name: "Transfer dökümü" });
  await detail.getByRole("heading", { name: "Stok transferi", exact: true }).waitFor();

  // Sevkiyat yaşam döngüsü: hedef stok yalnız "Teslim aldım" ile artar.
  await page.getByRole("button", { name: "Teslim aldım · stoğa işle", exact: true }).click();
  await page.getByText(/Durum: Teslim alındı/).waitFor();
  const saved = await sql.begin(async (tx) => {
    await tx`select set_config('app.tenant_id', ${user.tenant_id}, true)`;
    const transfers = await tx`select id from stock_transfers where tenant_id = ${user.tenant_id}`;
    const lines = await tx`select id from stock_transfer_lines where tenant_id = ${user.tenant_id}`;
    const levels = await tx`select product_id, store_id, sum(qty_milli)::int as level from stock_movements where tenant_id = ${user.tenant_id} group by product_id, store_id`;
    return { transfers, lines, levels };
  });
  assert.equal(saved.transfers.length, 1);
  assert.equal(saved.lines.length, 2);
  for (const [store, product, expected] of [[fixture.from, fixture.flour, 7500], [fixture.from, fixture.cups, 5000], [fixture.to, fixture.flour, 2500], [fixture.to, fixture.cups, 3000]]) {
    assert.equal(saved.levels.find((l) => l.store_id === store && l.product_id === product)?.level, expected);
  }
  await detail.getByRole("rowheader", { name: "Transfer Un", exact: true }).waitFor();
  await detail.getByRole("cell", { name: "2,500 kg", exact: true }).waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "mobil dökümde yatay taşma");
  const csvUrl = `${BASE}/yonetim/transferler/${saved.transfers[0].id}/csv`;
  const csv = await context.request.get(csvUrl);
  assert.equal(csv.status(), 200);
  assert.match(csv.headers()["content-type"], /text\/csv/);
  assert.equal(csv.headers()["cache-control"], "no-store");
  const body = await csv.body();
  assert.equal(body.subarray(0, 3).toString("hex"), "efbbbf");
  assert.ok(body.toString().includes(";Transfer Un;2,5;kg;"));
  const downloadPromise = page.waitForEvent("download");
  await detail.getByRole("link", { name: "CSV indir", exact: true }).click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), `cabukpos-transfer-${saved.transfers[0].id}.csv`);
  assert.equal(await download.failure(), null);
  await page.setViewportSize({ width: 794, height: 1123 });
  await page.emulateMedia({ media: "print" });
  assert.equal(await detail.getByRole("button", { name: "Yazdır / PDF", exact: true }).isVisible(), false);
  assert.equal(await page.locator("aside").isVisible(), false);
  await page.screenshot({ path: "/tmp/cabukpos-transfer-print.png", fullPage: true });
  await page.emulateMedia({ media: "screen" });
  const loginAs = async (mail) => {
    const ctx = await browser.newContext({ extraHTTPHeaders: testHeaders });
    const p = await ctx.newPage();
    p.setDefaultTimeout(45000);
    p.on("pageerror", (error) => errors.push(error.message));
    await p.goto(`${BASE}/giris`);
    await p.fill("input[name=email]", mail);
    await p.fill("input[name=password]", "Cabukpos2026x");
    await p.getByRole("button", { name: "Giriş yap", exact: true }).click();
    await p.waitForURL(`${BASE}/yonetim**`);
    return { ctx, p };
  };
  const receiving = await loginAs(receiverEmail);
  assert.equal((await receiving.p.goto(page.url())).status(), 200);
  await receiving.p.getByRole("article", { name: "Transfer dökümü" }).waitFor();
  assert.equal((await receiving.ctx.request.get(csvUrl)).status(), 200);
  const denied = await loginAs(unrelatedEmail);
  // Next notFound() akışlı HTML yanıtında 200 dönebilir; veri ve ekran kapısını denetle.
  await denied.p.goto(page.url());
  await denied.p.getByRole("heading", { name: "Sayfa bulunamadı", exact: true }).waitFor();
  assert.equal(await denied.p.getByRole("article", { name: "Transfer dökümü" }).count(), 0);
  assert.equal(await denied.p.getByText("Transfer Un", { exact: true }).count(), 0);
  assert.equal((await denied.ctx.request.get(csvUrl)).status(), 404);
  const anonymous = await browser.newContext({ extraHTTPHeaders: testHeaders });
  const anonymousCsv = await anonymous.request.get(csvUrl, { maxRedirects: 0 });
  assert.ok([401, 307, 308].includes(anonymousCsv.status()), "oturumsuz CSV indirilmemeli");
  assert.deepEqual(errors, []);
  step("mobil kayıt, iki ürünün stokları, transfer geçmişi ve formun sıfırlanması");
  step("döküm/CSV, yazdırma görünümü, hedef şube erişimi ve ilgisiz şube/oturumsuz ret");
  console.log("TRANSFER TEMİZ");
} finally {
  await browser.close();
  const [user] = await sql`select tenant_id from users where email = ${email}`;
  if (user) await sql`delete from tenants where id = ${user.tenant_id}`;
  await sql.end();
}
