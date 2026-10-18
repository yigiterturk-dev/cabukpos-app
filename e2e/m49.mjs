// e2e/m49.mjs — #49: rezervasyon (yönetim), masa birleştirme (kasa), bahşiş (masa ödemesi).
// Yönetim: salon S1-S2, ürünler Çay/Kahve, personel → rezervasyon ekle + Onayla →
// garson: S1 2× Çay, S2 1× Kahve → kasa: S1'e "Birleştir" (S2 taşınır, S2 boşalır) →
// hesap: 180 + 20 bahşiş = 200 kart → fişte "Bahşiş (dahil)" → gün sonu 1 satış.
// Kullanım: npm run build && node --env-file=.env.local e2e/m49.mjs (sunucu :3800, bkz. m1.mjs)
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
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cabukpos-e2e-m49-"));
const AGENT = path.resolve("public/indir/cabukpos-agent.cjs");
let agentProc = null;
const text = (b) => b.toString("latin1");
const receiptJobs = () => jobs.filter((j) => text(j).includes("TOPLAM"));

const browser = await chromium.launch({ channel: "chrome", headless: true });
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

try {
  // — Yönetim —
  const admin = await page();
  await admin.goto(`${BASE}/kayit`);
  await admin.fill("input[name=businessName]", "E2E Rezervasyon");
  await admin.getByText("Restoran", { exact: true }).click();
  await admin.fill("input[name=name]", "Yiğit Test");
  await admin.fill("input[name=email]", `m49-${stamp}@ornek.com`);
  await admin.fill("input[name=password]", "Cabukpos2026x");
  await admin.getByRole("button", { name: "Hesap oluştur" }).click();
  await admin.waitForURL(`${BASE}/yonetim**`);

  await admin.goto(`${BASE}/yonetim/salon`);
  await admin.getByLabel("Bahçe bölümünü kaldır").click();
  await admin.getByLabel("1. bölge masa sayısı").fill("2");
  await admin.getByRole("button", { name: "Salonu kur" }).click();
  await admin.getByText("S2", { exact: true }).waitFor();
  step("salon: bölge Salon, masalar S1-S2");

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

  await admin.goto(`${BASE}/yonetim/urunler`);
  await admin.fill("input[name=name]", "Çay");
  await admin.fill("input[name=price]", "50");
  await admin.getByRole("button", { name: "Ürünü kaydet" }).click();
  await admin.getByRole("cell", { name: /^Çay/ }).waitFor();
  await admin.fill("input[name=name]", "Kahve");
  await admin.fill("input[name=price]", "80");
  await admin.getByRole("button", { name: "Ürünü kaydet" }).click();
  await admin.getByRole("cell", { name: /^Kahve/ }).waitFor();
  step("ürünler: Çay 50, Kahve 80");

  await admin.goto(`${BASE}/yonetim/personel`);
  for (const [name, role, p] of [["Ali Kasiyer", null, "4613"], ["Ayşe Garson", "Garson", "5820"]]) {
    await admin.fill("input[name=name]", name);
    if (role) await admin.locator("label").filter({ hasText: new RegExp(`^${role}$`) }).click();
    await admin.fill("input[name=pin]", p);
    await admin.getByRole("button", { name: "Personeli kaydet" }).click();
    await admin.getByRole("cell", { name, exact: true }).waitFor();
  }
  step("personel: kasiyer, garson");

  // — Rezervasyon —
  await admin.goto(`${BASE}/yonetim/rezervasyonlar`);
  await admin.getByLabel("İsim").fill("Ali Veli");
  await admin.getByLabel("Telefon").fill("5551112233");
  await admin.getByRole("button", { name: "Rezervasyon ekle" }).click();
  await admin.getByText("Eklendi.").waitFor();
  const row = admin.getByTestId("res-row").first();
  await row.waitFor();
  await row.getByRole("button", { name: "Onayla" }).click();
  await row.getByText("Onaylı").waitFor();
  step("rezervasyon: Ali Veli 4 kişi 19:00 → onaylı");

  // — Cihazlar: kasa + garson tableti —
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
  const kasa = await pair("Kasa 1", "K1");
  await pin(kasa, "4613");
  await kasa.fill("input[name=amount]", "0");
  await kasa.getByRole("button", { name: "Vardiyayı aç" }).click();
  await kasa.getByRole("button", { name: /^Salon/ }).waitFor();
  await kasa.getByTestId("agent-status").getByText("Yazıcı hazır").waitFor().catch(async () => { console.log("AJAN LOG:", agentLog.slice(-300), "ROZET:", await kasa.getByTestId("agent-status").textContent()); throw new Error("kasa ajanı hazır değil"); });
  step("kasa: vardiya açık, ajan hazır");

  const garson = await pair("Tablet", "G1", { width: 1024, height: 768 });
  await admin.goto(`${BASE}/yonetim/cihazlar`);
  await admin.getByRole("group", { name: "Cihaz rolü" }).nth(1).locator("label").filter({ hasText: /^Garson tableti$/ }).click();
  await admin.getByRole("button", { name: "Rolü kaydet" }).nth(1).click();
  await admin.getByText("Kaydedildi.").waitFor();
  await garson.reload();
  await pin(garson, "5820");
  step("garson tableti salonda");

  // — Garson: S1 2× Çay, S2 1× Kahve (mutfağa göndermeden) —
  await garson.getByRole("button", { name: "S1, Boş" }).click();
  await garson.getByRole("button", { name: /^Çay/ }).click();
  await garson.getByRole("button", { name: /^Çay/ }).click();
  await garson.getByTestId("tab-remaining").getByText("100,00 ₺").waitFor();
  await garson.getByRole("button", { name: "← Salon" }).click();
  await garson.getByRole("button", { name: "S2, Boş" }).click();
  await garson.getByRole("button", { name: /^Kahve/ }).click();
  await garson.getByTestId("tab-remaining").getByText("80,00 ₺").waitFor();
  await garson.getByRole("button", { name: "← Salon" }).click();
  step("garson: S1 100 TL, S2 80 TL");

  // — Kasa: S1'e S2'yi birleştir —
  await kasa.getByRole("button", { name: /^S1,/ }).click();
  await kasa.getByTestId("tab-remaining").getByText("100,00 ₺").waitFor();
  await kasa.getByRole("button", { name: "Birleştir" }).click();
  const mergeDlg = kasa.getByRole("dialog", { name: "Masayı birleştir" });
  await mergeDlg.getByRole("button", { name: /^S2/ }).click();
  await kasa.getByRole("button", { name: "S2, Boş" }).waitFor({ timeout: 10000 });
  step("kasa: S2 → S1 birleşti, S2 boş");
  await kasa.getByRole("button", { name: /^S1,/ }).click();
  await kasa.getByTestId("tab-remaining").getByText("180,00 ₺").waitFor();

  // — Bahşişli ödeme: 180 + 20 = 200 kart —
  await kasa.getByRole("button", { name: "Hesap", exact: true }).click();
  await kasa.getByRole("button", { name: "Öde 180,00 ₺" }).click();
  await kasa.getByLabel("Bahşiş tutarı").fill("20");
  await kasa.getByRole("button", { name: "Tamamı kart" }).click();
  await kasa.getByRole("button", { name: "Satışı tamamla" }).click();
  await kasa.getByRole("heading", { name: "S1 kapandı" }).waitFor({ timeout: 15000 }).catch(async () => { console.log("DIALOG:", await kasa.getByRole("dialog").textContent().catch(() => "yok")); throw new Error("ödeme tamamlanmadı"); });
  await kasa.getByRole("heading", { name: "S1 kapandı" }).waitFor();
  await waitFor(() => receiptJobs().length === 1, "fiş");
  const r1 = text(receiptJobs()[0]);
  if (!r1.includes("K1-000001") || !r1.includes("200,00") || !r1.includes("dahil") || !r1.includes("20,00")) throw new Error(`fiş içeriği: ${r1.slice(0, 300)}`);
  step("kasa: 180 + 20 bahşiş = 200 kart → fişte Bahşiş (dahil) 20,00");

  await kasa.getByRole("button", { name: "Salona dön" }).click();
  await kasa.getByRole("button", { name: "S1, Boş" }).waitFor();
  step("kasa: S1 boş");

  await kasa.getByRole("button", { name: "Gün sonu" }).click();
  await kasa.getByText("1 satış").waitFor();
  step("gün sonu: 1 satış");
} finally {
  agentProc?.kill();
  printer.close();
  fs.rmSync(dir, { recursive: true, force: true });
  await browser.close();
}
if (errors.length) throw new Error(`sayfa hataları: ${errors.join(" | ")}`);
console.log("M49 OK");
