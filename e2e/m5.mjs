// e2e/m5.mjs — Restoran salon: üç cihaz (kasa + garson tableti + mutfak ekranı), sahte TCP yazıcı (ajan).
// Yönetim: salon M1-M4, seçenek "Pişirme", istasyon "Izgara" (yazıcılı), ürünler, personel, cihaz rolleri →
// garson M1'e seçenekli Köfte + Ayran, mutfağa gönder → mutfak ekranı hazır → garsonda "Hazır" → yazıcıya tek mutfak fişi →
// kasa M1 hesabı 2'ye eşit böler, iki nakit ödeme → iki fiş, masa boş → gün sonu 2 satış.
// Kullanım: npm run build && node --env-file=.env.local e2e/m5.mjs (sunucu :3800, bkz. m1.mjs)
import { chromium } from "playwright-core";
import { spawn, execFileSync } from "node:child_process";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3800";
const stamp = Date.now();
const step = (m) => console.log("•", m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, what, ms = 15000) => { const until = Date.now() + ms; while (Date.now() < until) { if (await fn()) return; await sleep(200); } throw new Error(`zaman aşımı: ${what}`); };

const jobs = [];
const printer = net.createServer((c) => { const parts = []; c.on("data", (d) => parts.push(d)); c.on("end", () => jobs.push(Buffer.concat(parts))); });
const pport = await new Promise((r) => printer.listen(0, "127.0.0.1", () => r(printer.address().port)));
const agentPort = 17500 + Math.floor(Math.random() * 400) * 2;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cabukpos-e2e-m5-"));
const AGENT = path.resolve("public/indir/cabukpos-agent.cjs");
let agentProc = null;
const text = (b) => b.toString("latin1");
const kitchenJobs = () => jobs.filter((j) => !text(j).includes("TOPLAM"));
const receiptJobs = () => jobs.filter((j) => text(j).includes("TOPLAM"));

const browser = await chromium.launch({ channel: "chrome", headless: true });
// Chrome 142+ yerel ağ erişimi: https (canlı) sayfadan 127.0.0.1 ajanına istek izin ister; headless reddeder → izin ver.
const agentContext = async (opts) => { const c = await browser.newContext(opts); await c.grantPermissions(["local-network-access"], { origin: new URL(BASE).origin }); return c; };
const errors = [];
const page = async (viewport = { width: 1280, height: 900 }) => {
  const p = await (await agentContext({ viewport })).newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  return p;
};
const pin = async (p, digits) => {
  for (const d of digits) await p.getByRole("button", { name: d, exact: true }).click();
  await p.getByRole("button", { name: "Gir" }).click();
};
const choose = async (p, combo, option) => { await combo.click(); await p.getByRole("option", { name: option }).click(); };

try {
  // — Yönetim —
  const admin = await page();
  await admin.goto(`${BASE}/kayit`);
  await admin.fill("input[name=businessName]", "E2E Köfteci");
  await admin.getByText("Restoran", { exact: true }).click();
  await admin.fill("input[name=name]", "Yiğit Test");
  await admin.fill("input[name=email]", `m5-${stamp}@ornek.com`);
  await admin.fill("input[name=password]", "Cabukpos2026x");
  await admin.getByRole("button", { name: "Hesap oluştur" }).click();
  await admin.waitForURL(`${BASE}/yonetim**`);

  await admin.goto(`${BASE}/yonetim/salon`);
  await admin.getByLabel("Bahçe bölümünü kaldır").click();
  await admin.getByLabel("1. bölge adı").fill("Masa");
  await admin.getByLabel("1. bölge masa sayısı").fill("4");
  await admin.getByRole("button", { name: "Salonu kur" }).click();
  await admin.getByText("M4", { exact: true }).waitFor();
  step("salon: bölge Masa, masalar M1-M4");

  // Ajan + yazıcı (istasyon yazıcısı seçilebilsin diye önce)
  await admin.goto(`${BASE}/yonetim/donanim`);
  await admin.fill("input[name=name]", "Kasa PC");
  await admin.getByRole("button", { name: "Ajan ekle" }).click();
  const agentCode = (await admin.getByTestId("agent-code").innerText()).trim();
  execFileSync(process.execPath, [AGENT, "pair", agentCode, "--url", BASE, "--dir", dir, "--port", String(agentPort)], { stdio: "pipe" });
  await admin.reload();
  await admin.getByRole("button", { name: "+ Yazıcı ekle" }).click();
  await admin.getByLabel("Yazıcı adresi").fill(`127.0.0.1:${pport}`);
  await admin.getByRole("button", { name: "Donanımı kaydet" }).click();
  await admin.reload();
  await admin.getByLabel("Yazıcı adresi").first().waitFor();
  let agentLog = "";
  agentProc = spawn(process.execPath, [AGENT, "run", "--dir", dir], { env: { ...process.env, CABUKPOS_HEARTBEAT_MS: "1500" }, stdio: ["ignore", "pipe", "pipe"] });
  agentProc.stdout.on("data", (d) => (agentLog += d));
  agentProc.stderr.on("data", (d) => (agentLog += d));
  await waitFor(() => /Yapılandırma güncellendi: 1 yazıcı/.test(agentLog), "ajan yapılandırması");
  step(`ajan eşlendi ve çalışıyor, yazıcı 127.0.0.1:${pport}`);

  await admin.goto(`${BASE}/yonetim/istasyonlar`);
  await admin.fill("input[name=name]", "Izgara");
  await choose(admin, admin.getByRole("combobox").first(), /Fiş yazıcısı/);
  await admin.getByRole("button", { name: "İstasyon ekle" }).click();
  await admin.getByRole("button", { name: "Kaydet" }).first().waitFor();
  step("istasyon Izgara → ajan yazıcısı");

  await admin.goto(`${BASE}/yonetim/secenekler`);
  await admin.fill("input[name=name]", "Pişirme");
  await admin.fill("input[name=min]", "1");
  await admin.fill("input[name=max]", "1");
  await admin.fill("textarea[name=options]", "Az pişmiş\nİyi pişmiş");
  await admin.getByRole("button", { name: "Grubu kaydet" }).click();
  await admin.getByText("zorunlu, 1 seçim").waitFor();
  step("seçenek grubu Pişirme (zorunlu tek)");

  await admin.goto(`${BASE}/yonetim/urunler`);
  await admin.fill("input[name=name]", "Köfte");
  await admin.fill("input[name=price]", "200");
  await choose(admin, admin.getByRole("combobox").nth(1), "Izgara");
  await admin.getByLabel("Pişirme").check();
  await admin.getByRole("button", { name: "Ürünü kaydet" }).click();
  await admin.getByRole("cell", { name: /^Köfte/ }).waitFor();
  await admin.fill("input[name=name]", "Ayran");
  await admin.fill("input[name=price]", "30");
  await admin.getByRole("button", { name: "Ürünü kaydet" }).click();
  await admin.getByRole("cell", { name: /^Ayran/ }).waitFor();
  step("ürünler: Köfte (Izgara, Pişirme), Ayran (istasyonsuz)");

  await admin.goto(`${BASE}/yonetim/personel`);
  for (const [name, role, p] of [["Ali Kasiyer", null, "4613"], ["Ayşe Garson", "Garson", "5820"], ["Mehmet Müdür", "Müdür", "7391"]]) {
    await admin.fill("input[name=name]", name);
    if (role) await admin.locator("label").filter({ hasText: new RegExp(`^${role}$`) }).click();
    await admin.fill("input[name=pin]", p);
    await admin.getByRole("button", { name: "Personeli kaydet" }).click();
    await admin.getByRole("cell", { name, exact: true }).waitFor();
  }
  step("personel: kasiyer, garson, müdür");

  // — Cihazlar: kasa, garson tableti, mutfak ekranı —
  const pair = async (name, prefix, viewport) => {
    await admin.goto(`${BASE}/yonetim/cihazlar`);
    await admin.fill("input[name=name]", name);
    await admin.fill("input[name=receiptPrefix]", prefix);
    console.log("pair: cihaz ekleniyor");
    await admin.getByRole("button", { name: "Cihaz ekle" }).click();
    const code = (await admin.getByTestId("pairing-code").innerText()).trim();
    console.log("pair: kod alındı", code);
    const p = await page(viewport);
    await p.goto(`${BASE}/kasa/eslestir`);
    await p.fill("input[name=code]", code);
    console.log("pair: eşle tıklanıyor");
    await p.getByRole("button", { name: "Eşle" }).click();
    console.log("pair: /kasa bekleniyor");
    try { await p.waitForURL(`${BASE}/kasa`, { timeout: 15000 }); }
    catch { console.log("pair URL:", p.url()); console.log("pair sayfa:", (await p.locator("h1,h2,[role=alert],p").allTextContents()).map(t=>t.trim()).filter(Boolean).slice(0,6).join(" | ")); throw new Error("pair navigasyon yok"); }
    console.log("pair: tamam");
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
  await kasa.getByRole("button", { name: /^Salon/ }).waitFor();
  await kasa.getByTestId("agent-status").getByText("Yazıcı hazır").waitFor();
  step("kasa: vardiya açık, Salon sekmesi, ajan hazır");

  const garson = await pair("Tablet", "G1", { width: 1024, height: 768 });
  await setRole(1, "Garson tableti");
  const mutfak = await pair("Mutfak", "MT");
  await setRole(2, "Mutfak ekranı");
  // Rol katalogla iner: sayfayı yenile
  await garson.reload();
  await mutfak.reload();
  await mutfak.getByText("Bekleyen sipariş yok.").waitFor();
  await pin(garson, "5820");
  await garson.getByRole("button", { name: "M1, Boş" }).waitFor();
  step("garson tableti vardiyasız salonda, mutfak ekranı PIN'siz açık");

  // — Garson sipariş alır —
  await garson.getByRole("button", { name: "M1, Boş" }).click();
  await garson.getByRole("button", { name: /^Köfte/ }).click();
  const dlg = garson.getByRole("dialog", { name: "Köfte" });
  await dlg.getByRole("button", { name: "Ekle" }).isDisabled().then((d) => { if (!d) throw new Error("zorunlu seçenek seçilmeden Ekle açık"); });
  await dlg.getByRole("button", { name: "Az pişmiş" }).click();
  await dlg.getByRole("button", { name: "Artır" }).click();
  await dlg.getByLabel("Not").fill("soğansız");
  await dlg.getByRole("button", { name: "Ekle" }).click();
  await garson.getByRole("button", { name: /^Ayran/ }).click();
  await garson.getByTestId("tab-remaining").getByText("430,00 ₺").waitFor();
  await garson.getByRole("button", { name: "Mutfağa gönder (2)" }).click();
  await garson.getByText("mutfakta").first().waitFor();
  step("garson: M1 → 2× Köfte (Az pişmiş, soğansız) + Ayran = 430 TL, mutfağa gönderildi");

  // — Mutfak —
  const kofteCard = mutfak.locator("[data-ticket]", { hasText: "Köfte" });
  await kofteCard.waitFor({ timeout: 10000 });
  await mutfak.locator("[data-ticket]", { hasText: "Ayran" }).waitFor();
  if (!(await kofteCard.innerText()).includes("Az pişmiş") || !(await kofteCard.innerText()).includes("soğansız")) throw new Error("mutfak kartında seçenek/not yok");
  await kofteCard.click();
  await mutfak.locator("[data-ticket][data-status=hazirlaniyor]", { hasText: "Köfte" }).waitFor();
  await mutfak.locator("[data-ticket]", { hasText: "Köfte" }).click();
  await mutfak.locator("[data-ticket][data-status=hazir]", { hasText: "Köfte" }).waitFor();
  step("mutfak: Köfte bileti akışla geldi → hazırlanıyor → hazır");

  await garson.getByRole("button", { name: "← Salon" }).click();
  await garson.locator("[data-status=hazir]", { hasText: "M1" }).waitFor({ timeout: 10000 });
  step("garson: M1 'Hazır bekliyor'");

  // Mutfak fişi: yalnız yazıcılı istasyon (Izgara), bir kez
  await waitFor(() => kitchenJobs().length >= 1, "mutfak fişi", 20000);
  await sleep(3000);
  const kj = kitchenJobs();
  if (kj.length !== 1) throw new Error(`mutfak fişi sayısı ${kj.length}`);
  const kt = text(kj[0]);
  if (!kt.includes("M1") || !kt.includes("Az pi") || !kt.includes("Izgara") || kt.includes("Ayran")) throw new Error(`mutfak fişi içeriği: ${kt.slice(0, 200)}`);
  step("yazıcı: tek mutfak fişi (M1, Izgara, Az pişmiş; Ayran yok)");

  // — Kasa hesabı 2'ye eşit böler —
  await kasa.locator("[data-status=hazir]", { hasText: "M1" }).click();
  await kasa.getByRole("button", { name: "Hazır — teslim edildi" }).click();
  await kasa.getByRole("button", { name: "Hesap", exact: true }).click();
  await kasa.getByRole("button", { name: "Eşit böl" }).click();
  for (const n of [1, 2]) {
    await kasa.getByRole("button", { name: "Öde 215,00 ₺" }).click();
    await kasa.getByRole("button", { name: "Tamamı nakit" }).click();
    await kasa.getByRole("button", { name: "Satışı tamamla" }).click();
    if (n === 1) await kasa.getByText("K1-000001").first().waitFor();
  }
  await kasa.getByRole("heading", { name: "M1 kapandı" }).waitFor();
  await waitFor(() => receiptJobs().length === 2, "iki fiş");
  const r1 = text(receiptJobs()[0]), r2 = text(receiptJobs()[1]);
  if (!r1.includes("K1-000001") || !r2.includes("K1-000002") || !r1.includes("Masa") || !r1.includes("215,00")) throw new Error(`masa fişleri: ${r1.slice(0, 200)}`);
  step("kasa: eşit 2 parça × 215 TL nakit → K1-000001, K1-000002 (Masa M1), masa kapandı");

  await kasa.getByRole("button", { name: "Salona dön" }).click();
  await kasa.getByRole("button", { name: "M1, Boş" }).waitFor();
  await garson.getByRole("button", { name: "M1, Boş" }).waitFor({ timeout: 10000 });
  step("kasa ve garsonda M1 boş");

  await kasa.getByRole("button", { name: "Gün sonu" }).click();
  await kasa.getByText("2 satış").waitFor();
  step("gün sonu: 2 satış");
} finally {
  agentProc?.kill();
  printer.close();
  fs.rmSync(dir, { recursive: true, force: true });
  await browser.close();
}
if (errors.length) throw new Error(`sayfa hataları: ${errors.join(" | ")}`);
console.log("M5 OK");
