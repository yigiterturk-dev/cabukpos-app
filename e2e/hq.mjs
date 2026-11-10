// e2e/hq.mjs — zincir yetkisi provası: depo + şube, franchise koşulları, kullanıcı daveti,
// şube müdürü/HQ kapıları ve açık adisyon sayacı. Kullanım:
//   npm run build && PORT=3800 npm start        (ayrı terminal)
//   BASE=http://localhost:3800 npm run e2e:hq
// Test kiracısını MIGRATE_DATABASE_URL varsa sonunda siler; yoksa veri bırakır (m1 gibi).
import { chromium } from "playwright-core";
import postgres from "postgres";

const BASE = process.env.BASE ?? "http://localhost:3800";
const stamp = Date.now();
const testHeaders = { "x-vercel-forwarded-for": `198.51.100.${(stamp % 250) + 1}` };
const email = `e2e-hq-${stamp}@ornek.com`;
const bmEmail = `e2e-hq-bm-${stamp}@ornek.com`;
const hqEmail = `e2e-hq-merkez-${stamp}@ornek.com`;
const pass = "Cabukpos2026x";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
const sql = process.env.MIGRATE_DATABASE_URL ? postgres(process.env.MIGRATE_DATABASE_URL, { max: 1, onnotice: () => {} }) : null;

const ctx = async () => {
  const c = await browser.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: testHeaders });
  const p = await c.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  p.setDefaultTimeout(45000);
  return p;
};
const choose = async (p, combo, option) => { await combo.click(); await p.getByRole("option", { name: option, exact: true }).click(); };
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const step = (m) => console.log("•", m);
const hubLinks = ["Merkez depo", "Bayilik", "Şubeler", "Panel kullanıcıları"];
const ownerOnlyLinks = ["Merkez depo", "Bayilik", "Panel kullanıcıları"];

try {
  const owner = await ctx();
  await owner.goto(`${BASE}/kayit`);
  await owner.fill("input[name=businessName]", "E2E Zincir");
  await owner.getByText("Restoran", { exact: true }).click();
  await owner.fill("input[name=name]", "E2E Sahip");
  await owner.fill("input[name=email]", email);
  await owner.fill("input[name=password]", pass);
  await owner.getByRole("button", { name: "Hesap oluştur" }).click();
  await owner.waitForURL(`${BASE}/yonetim**`);
  step("kayıt → yönetim");

  await owner.goto(`${BASE}/yonetim/subeler`);
  await owner.fill("input[name=name]", "Merkez Depo");
  await choose(owner, owner.getByRole("combobox").first(), "Merkez depo");
  await owner.getByRole("button", { name: "Şube oluştur" }).click();
  await owner.getByText("Depo", { exact: true }).waitFor();
  await owner.fill("input[name=name]", "Kadıköy");
  await owner.getByRole("button", { name: "Şube oluştur" }).click();
  await owner.getByText("Kadıköy", { exact: true }).waitFor();
  step("depo + satış şubesi");

  const merkez = owner.locator("div.p-4").filter({ has: owner.getByText("Merkez", { exact: true }) }).first();
  await merkez.getByRole("link", { name: "Düzenle" }).click();
  const editForm = owner.locator("form.mt-3").first();
  await editForm.locator('input[name="royalty"]').fill("5");
  await editForm.locator('input[name="monthlyFee"]').fill("1.500,00");
  await editForm.getByRole("button", { name: "Kaydet" }).click();
  await owner.getByText("Kaydedildi.").waitFor();
  step("franchise koşulları (%5 + 1.500,00)");

  await owner.goto(`${BASE}/yonetim/kullanicilar`);
  const createUser = async (name, mail, store) => {
    const codes = owner.locator("code");
    const before = await codes.count() ? await codes.last().innerText() : "";
    await owner.fill("input[name=name]", name);
    await owner.fill("input[name=email]", mail);
    if (store) await choose(owner, owner.getByRole("combobox").nth(1), store);
    await owner.getByRole("button", { name: "Kullanıcı aç" }).click();
    await owner.getByText(mail).waitFor();
    // Yeni davet bağlantısı gelene kadar bekle: önceki kullanıcının bağlantısını yakalama.
    await owner.waitForFunction((old) => {
      const codes = [...document.querySelectorAll("code")];
      const last = codes.at(-1)?.textContent?.trim() ?? "";
      return !!last && last !== old && last.includes("/sifre-yenile?t=");
    }, before);
    const link = (await owner.locator("code").last().innerText()).trim();
    assert(link.includes("/sifre-yenile?t=") && !link.includes("object"), "davet bağlantısı geçersiz");
    assert(link !== before, "yeni davet bağlantısı gelmedi");
    return link;
  };
  let bmLink = await createUser("Şube Müdürü", bmEmail, "Kadıköy");
  const hqLink = await createUser("HQ Müdürü", hqEmail, "Tüm şubeler (HQ)");
  step("davetli şube müdürü + HQ");

  const invitedBranch = owner.locator("div.space-y-3.p-4").filter({ has: owner.getByText(bmEmail, { exact: true }) });
  await invitedBranch.getByRole("button", { name: "Davet gönder", exact: true }).click();
  await invitedBranch.locator("code").waitFor();
  bmLink = (await invitedBranch.locator("code").innerText()).trim();
  assert(bmLink.includes("/sifre-yenile?t=") && !bmLink.includes("object"), "yenilenen davet bağlantısı geçersiz");
  step("mevcut kullanıcıya yeniden davet bağlantısı");

  for (const name of hubLinks) {
    const search = owner.getByRole("textbox", { name: "Menüde ara" });
    await search.fill(name);
    assert((await owner.getByRole("link", { name, exact: true }).count()) > 0, `menüde ${name} yok`);
    await search.fill("");
  }
  await owner.goto(`${BASE}/yonetim/depo`);
  await owner.getByRole("heading", { name: "Merkez depo" }).waitFor();
  await owner.getByText("Depo stoğu").waitFor();
  await owner.goto(`${BASE}/yonetim/franchise`);
  await owner.getByRole("heading", { name: "Bayilik" }).waitFor();
  assert((await owner.getByText("%5").count()) > 0, "franchise oranı görünmüyor");
  step("depo + franchise ekranları");

  const bm = await ctx();
  await bm.goto(bmLink);
  await bm.fill("input[name=password]", pass);
  await bm.getByRole("button", { name: "Şifreyi kaydet" }).click();
  await bm.waitForURL(`${BASE}/yonetim**`);
  await bm.locator('[aria-label="Şubeniz: Kadıköy"]').first().waitFor();
  for (const name of ownerOnlyLinks) {
    const search = bm.getByRole("textbox", { name: "Menüde ara" });
    await search.fill(name);
    assert((await bm.getByRole("link", { name, exact: true }).count()) === 0, `şube müdüründe ${name} görünüyor`);
    await search.fill("");
  }
  for (const path of ["/yonetim/hq", "/yonetim/kullanicilar", "/yonetim/franchise", "/yonetim/subeler", "/yonetim/musteriler", "/yonetim/kuponlar", "/yonetim/mali", "/yonetim/denetim", "/yonetim/veriler"]) {
    await bm.goto(`${BASE}${path}`);
    await bm.waitForURL(`${BASE}/yonetim`);
  }
  await bm.goto(`${BASE}/yonetim/stok`);
  await bm.getByRole("heading", { name: "Stok", level: 1 }).waitFor();
  step("şube müdürü: şube sabit, zincir ekranları kapalı");

  const hq = await ctx();
  await hq.goto(hqLink);
  await hq.fill("input[name=password]", pass);
  await hq.getByRole("button", { name: "Şifreyi kaydet" }).click();
  await hq.waitForURL(`${BASE}/yonetim**`);
  for (const name of hubLinks) {
    const search = hq.getByRole("textbox", { name: "Menüde ara" });
    await search.fill(name);
    assert((await hq.getByRole("link", { name, exact: true }).count()) > 0, `HQ menüsünde ${name} yok`);
    await search.fill("");
  }
  await hq.goto(`${BASE}/yonetim/kullanicilar`);
  await hq.getByText(bmEmail).waitFor();
  await hq.getByRole("combobox").first().click();
  assert((await hq.getByRole("option", { name: "İşletme sahibi" }).count()) === 0, "HQ sahip rolü seçebiliyor");
  await hq.keyboard.press("Escape");
  const newUser = hq.getByRole("region", { name: "Yeni kullanıcı" });
  await newUser.getByRole("combobox").nth(1).click();
  assert((await hq.getByRole("option", { name: "Tüm şubeler (HQ)" }).count()) === 0, "HQ yeni HQ hesabı seçebiliyor");
  await hq.keyboard.press("Escape");
  const ownerRow = hq.locator("div.space-y-3.p-4").filter({ has: hq.getByText(email, { exact: true }) });
  await ownerRow.getByText("Bu hesabı yalnız işletme sahibi yönetebilir.").waitFor();
  assert(await ownerRow.getByRole("button", { name: "Kaydet", exact: true }).count() === 0, "HQ sahibi düzenleyebiliyor");
  assert(await ownerRow.getByRole("button", { name: "Davet gönder", exact: true }).count() === 0, "HQ sahibine davet gönderebiliyor");
  const branchRow = hq.locator("div.space-y-3.p-4").filter({ has: hq.getByText(bmEmail, { exact: true }) });
  await branchRow.getByRole("combobox").first().click();
  assert(await hq.getByRole("option", { name: "Sahip", exact: true }).count() === 0, "HQ şube müdürünü sahip yapabiliyor");
  await hq.keyboard.press("Escape");
  await branchRow.getByRole("combobox").nth(1).click();
  assert(await hq.getByRole("option", { name: "Tüm şubeler (HQ)" }).count() === 0, "HQ şube müdürünü HQ yapabiliyor");
  await hq.keyboard.press("Escape");
  await branchRow.getByRole("button", { name: "Kaydet", exact: true }).click();
  await branchRow.getByText("Erişim güncellendi.").waitFor();
  step("HQ: zincir ekranları açık; sahip/HQ yönetimi kapalı, şube erişimi kaydediliyor");

  if (sql) {
    const [user] = await sql`select tenant_id from users where email = ${email}`;
    assert(user, "kiracı bulunamadı");
    await sql.begin(async (tx) => {
      // Uygulama rolüyle de çalışır: şube ve olay tabloları RLS kapsamındadır.
      await tx`select set_config('app.tenant_id', ${user.tenant_id}, true)`;
      const [store] = await tx`select id from stores where tenant_id = ${user.tenant_id} order by created_at limit 1`;
      assert(store, "şube bulunamadı");
      await tx`insert into tab_events (id, tenant_id, store_id, tab_id, at, type, payload) values (gen_random_uuid(), ${user.tenant_id}, ${store.id}, gen_random_uuid(), now(), 'open', '{"type":"open","guests":2}'::jsonb)`;
    });
    await owner.goto(`${BASE}/yonetim`);
    await owner.locator('[aria-label="1 açık adisyon"]').waitFor();
    step("menüde açık adisyon sayacı 1");
  } else {
    step("MIGRATE_DATABASE_URL yok: adisyon sayacı adımı atlandı");
  }

  assert(errors.length === 0, `sayfa hataları: ${errors.join(" | ")}`);
  console.log("TEMİZ");
} finally {
  await browser.close();
  if (sql) {
    const [row] = await sql`select tenant_id from users where email = ${email}`;
    if (row) await sql`delete from tenants where id = ${row.tenant_id}`;
    await sql.end();
  }
}
