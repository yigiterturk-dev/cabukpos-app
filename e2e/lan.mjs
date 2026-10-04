// e2e/lan.mjs — LAN merkezi: m5 kurulumu (kasa + garson + mutfak, ajan 127.0.0.1) → bulut /api/** kesilir (internet yok) →
// garson siparişi ajan üzerinden mutfağa ve kasaya düşer, kasa mutfak fişini basar → internet gelince olaylar buluta ulaşır.
// Kullanım: npm run build && node --env-file=.env.local e2e/lan.mjs (sunucu :3800)
//
//
import { chromium } from "playwright-core";
import postgres from "postgres";
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
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cabukpos-e2e-lan-"));
const AGENT = path.resolve("public/indir/cabukpos-agent.cjs");
let agentProc = null;
const text = (b) => b.toString("latin1");
const kitchenJobs = () => jobs.filter((j) => !text(j).includes("TOPLAM"));

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
  await admin.getByRole("button", { name: "Restoran" }).click();
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
  step("salon: bölge Salon, masalar M1-M4");

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
  await admin.getByText("Kaydedildi; ajan bir dakika içinde alır.").waitFor();
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
    if (role) await admin.getByRole("button", { name: role, exact: true }).click();
    await admin.fill("input[name=pin]", p);
    await admin.getByRole("button", { name: "Personeli kaydet" }).click();
    await admin.getByRole("cell", { name }).waitFor();
  }
  step("personel: kasiyer, garson, müdür");

  // — Cihazlar: kasa, garson tableti, mutfak ekranı —
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
    return p;
  };
  const setRole = async (i, label) => {
    await admin.goto(`${BASE}/yonetim/cihazlar`);
    await admin.getByRole("group", { name: "Cihaz rolü" }).nth(i).getByRole("button", { name: label }).click();
    await admin.getByRole("button", { name: "Rolü kaydet" }).nth(i).click();
    await admin.getByText("Kaydedildi.").waitFor();
  };
  const kasa = await pair("Kasa 1", "K1");
  await pin(kasa, "4613");
  await kasa.fill("input[name=amount]", "0");
  await kasa.getByRole("button", { name: "Vardiyayı aç" }).click();
  await kasa.getByRole("button", { name: "Salon", exact: true }).waitFor();
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

  // — İnternet yok: bulut uçları kesilir; açık bulut akışı düşsün diye sayfalar yenilenir. Ajan (127.0.0.1) açık. —
  const cut = (r) => r.abort();
  for (const p of [kasa, garson, mutfak]) { await p.route("**/api/**", cut); await p.reload(); }
  await mutfak.getByTestId("link-lan").waitFor({ timeout: 20000 });
  await pin(garson, "5820");
  await garson.getByTestId("link-lan").waitFor({ timeout: 20000 });
  await pin(kasa, "4613");
  step("internet yok: garson ve mutfak 'Yerel ağ' üzerinde");

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
  step("mutfak: bilet LAN'dan geldi → hazırlanıyor → hazır");

  await kasa.getByRole("button", { name: "Salon", exact: true }).click();
  await kasa.locator("[data-status=hazir]", { hasText: "M1" }).waitFor({ timeout: 10000 });
  await waitFor(() => kitchenJobs().length === 1, "kasa mutfak fişini LAN'dan basar");
  step("kasa: M1 'Hazır bekliyor' + tek mutfak fişi (internetsiz)");

  // — İnternet geldi: her cihaz kendi olaylarını buluta iter —
  for (const p of [kasa, garson, mutfak]) await p.unroute("**/api/**", cut);
  const sql = postgres(process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL, { max: 1 });
  try {
    const types = async () => (await sql`select distinct e.type from tab_events e where e.tenant_id = (select tenant_id from users where email = ${`m5-${stamp}@ornek.com`})`).map((r) => r.type);
    await waitFor(async () => { const t = await types(); return ["open", "add", "send", "kitchen"].every((x) => t.includes(x)); }, "olaylar buluta ulaştı", 90000);
  } finally { await sql.end(); }
  step("internet geldi: garson (open/add/send) ve mutfak (kitchen) olayları bulutta");
} finally {
  agentProc?.kill();
  printer.close();
  fs.rmSync(dir, { recursive: true, force: true });
  await browser.close();
}
if (errors.length) throw new Error(`sayfa hataları: ${errors.join(" | ")}`);
console.log("LAN OK");
