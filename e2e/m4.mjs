// e2e/m4.mjs — Yerel ajan: sahte TCP yazıcı + sahte TCP terazi. Yönetimde ajan ekle → ajanı eşle/çalıştır (tek dosya paket) →
// yazıcı + terazi tanımla → kasa: "Teraziden al" 0,750 kg, nakit satış → fiş + çekmece darbesi yazıcıya; yazıcı kapalıyken satış
// yine kaydolur, "Yazdırılamadı" → yazıcı açılınca "Yeniden dene" → fiş basılır; kasiyer çekmeceyi müdür PIN'iyle açar.
// Kullanım: npm run build && node --env-file=.env.local e2e/m4.mjs (sunucu :3800, bkz. m1.mjs)
import { chromium } from "playwright-core";
import { spawn, execFileSync } from "node:child_process";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3800";
const stamp = Date.now();
const step = (m) => console.log("•", m);
const expect = (got, want, what) => { if (got !== want) throw new Error(`${what}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DRAWER = Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]);
const CUT = Buffer.from([0x1d, 0x56, 0x42, 0x03]);

// — Sahte donanım —
const jobs = [];
const printerHandler = (c) => { const parts = []; c.on("data", (d) => parts.push(d)); c.on("end", () => jobs.push(Buffer.concat(parts))); };
let printer = net.createServer(printerHandler);
const listen = (s, port = 0) => new Promise((r) => s.listen(port, "127.0.0.1", () => r(s.address().port)));
const pport = await listen(printer);
const scale = net.createServer((c) => c.on("data", (d) => { if (d[0] === 0x05) c.write("ST,GS,+  0.750kg\r\n"); }));
const sport = await listen(scale);
const agentPort = 17000 + Math.floor(Math.random() * 500) * 2;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cabukpos-e2e-agent-"));
const AGENT = path.resolve("public/indir/cabukpos-agent.cjs");
let agentProc = null;
const waitFor = async (fn, what, ms = 15000) => { const until = Date.now() + ms; while (Date.now() < until) { if (await fn()) return; await sleep(200); } throw new Error(`zaman aşımı: ${what}`); };

const browser = await chromium.launch({ channel: "chrome", headless: true });
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

try {
  // — Yönetim —
  const admin = await page();
  await admin.goto(`${BASE}/kayit`);
  await admin.fill("input[name=businessName]", "E2E Manav");
  await admin.getByRole("button", { name: "Market" }).click();
  await admin.fill("input[name=name]", "Yiğit Test");
  await admin.fill("input[name=email]", `m4-${stamp}@ornek.com`);
  await admin.fill("input[name=password]", "Cabukpos2026x");
  await admin.getByRole("button", { name: "Hesap oluştur" }).click();
  await admin.waitForURL(`${BASE}/yonetim**`);

  await admin.goto(`${BASE}/yonetim/urunler`);
  await admin.fill("input[name=name]", "Ekmek");
  await admin.fill("input[name=price]", "10");
  await admin.getByRole("button", { name: "%1", exact: true }).click();
  await admin.getByLabel("Kasada hızlı tuş").check();
  await admin.getByRole("button", { name: "Ürünü kaydet" }).click();
  await admin.getByRole("cell", { name: /^Ekmek/ }).waitFor();
  await admin.fill("input[name=name]", "Domates");
  await admin.getByRole("button", { name: "Tartılı (kg)" }).click();
  await admin.fill("input[name=price]", "80");
  await admin.getByRole("button", { name: "%1", exact: true }).click();
  await admin.getByLabel("Kasada hızlı tuş").check();
  await admin.getByRole("button", { name: "Ürünü kaydet" }).click();
  await admin.getByRole("cell", { name: /^Domates/ }).waitFor();

  await admin.goto(`${BASE}/yonetim/personel`);
  await admin.fill("input[name=name]", "Ayşe Kasiyer");
  await admin.fill("input[name=pin]", "5820");
  await admin.getByRole("button", { name: "Personeli kaydet" }).click();
  await admin.getByRole("cell", { name: "Ayşe Kasiyer" }).waitFor();
  await admin.fill("input[name=name]", "Mehmet Müdür");
  await admin.getByRole("button", { name: "Müdür", exact: true }).click();
  await admin.fill("input[name=pin]", "7391");
  await admin.getByRole("button", { name: "Personeli kaydet" }).click();
  await admin.getByRole("cell", { name: "Mehmet Müdür" }).waitFor();
  step("işletme, ürünler (Ekmek, Domates tartılı), personel");

  // — Donanım: ajan ekle, eşle, yapılandır, çalıştır —
  await admin.goto(`${BASE}/yonetim/donanim`);
  await admin.fill("input[name=name]", "Kasa PC");
  await admin.getByRole("button", { name: "Ajan ekle" }).click();
  const agentCode = (await admin.getByTestId("agent-code").innerText()).trim();
  execFileSync(process.execPath, [AGENT, "pair", agentCode, "--url", BASE, "--dir", dir, "--port", String(agentPort)], { stdio: "pipe" });
  await admin.reload();
  await admin.getByText("Çevrimdışı").first().waitFor();
  await admin.getByRole("button", { name: "+ Yazıcı ekle" }).click();
  await admin.getByLabel("Yazıcı adresi").fill(`127.0.0.1:${pport}`);
  await admin.getByRole("button", { name: "Ağ (IP)" }).click();
  await admin.getByLabel("Terazi IP").fill("127.0.0.1");
  await admin.getByLabel("Terazi port").fill(String(sport));
  await admin.getByRole("button", { name: "Donanımı kaydet" }).click();
  await admin.getByText("Kaydedildi; ajan bir dakika içinde alır.").waitFor();
  step(`ajan eşlendi (${agentCode}), yazıcı 127.0.0.1:${pport} + terazi :${sport} tanımlandı`);

  let agentLog = "";
  agentProc = spawn(process.execPath, [AGENT, "run", "--dir", dir], { env: { ...process.env, CABUKPOS_HEARTBEAT_MS: "1500" }, stdio: ["ignore", "pipe", "pipe"] });
  agentProc.stdout.on("data", (d) => (agentLog += d));
  agentProc.stderr.on("data", (d) => (agentLog += d));
  await waitFor(() => /Yapılandırma güncellendi: 1 yazıcı, terazi tcp/.test(agentLog), "ajan yapılandırması");
  await admin.reload();
  await admin.getByText("Çevrimiçi").waitFor();
  step("ajan çalışıyor, yapılandırmayı aldı, yönetimde çevrimiçi");

  // — Kasa —
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
  await kasa.fill("input[name=amount]", "100");
  await kasa.getByRole("button", { name: "Vardiyayı aç" }).click();
  await kasa.getByTestId("agent-status").getByText("Yazıcı hazır").waitFor();
  step("kasa: ajan rozeti 'Yazıcı hazır'");

  await kasa.getByRole("button", { name: /^Domates/ }).click();
  await kasa.getByRole("button", { name: "Teraziden al" }).click();
  await kasa.waitForFunction(() => document.querySelector("#weigh-kg")?.value === "0,750", null, { timeout: 8000 }).catch(async () => {
    throw new Error(`teraziden okunamadı: ${await kasa.getByRole("dialog").innerText()}`);
  });
  await kasa.getByRole("button", { name: "Sepete ekle" }).click();
  await kasa.getByRole("button", { name: /^Ekmek/ }).click();
  await kasa.getByRole("button", { name: "Öde" }).click();
  await kasa.getByRole("button", { name: "Tamamı nakit" }).click();
  await kasa.getByRole("button", { name: "Satışı tamamla" }).click();
  await kasa.getByTestId("print-state").getByText("Fiş yazdırıldı.").waitFor();
  const j1 = jobs.at(-1);
  if (!j1.subarray(0, 5).equals(DRAWER)) throw new Error("nakit satışta çekmece darbesi yok");
  if (!j1.subarray(-4).equals(CUT)) throw new Error("fiş kesilmedi");
  const t1 = j1.toString("latin1");
  if (!t1.includes("K1-000001") || !t1.includes("TOPLAM") || !t1.includes("70,00 TL")) throw new Error(`fiş içeriği: ${t1.slice(0, 300)}`);
  step("terazi 0,750 kg + Ekmek, nakit 70 TL → fiş (K1-000001, TOPLAM, kes) + çekmece darbesi");

  // Yazıcı kapalı: satış kaydolur, fiş başarısız, sonra yeniden dene
  await new Promise((r) => printer.close(r));
  await kasa.getByRole("button", { name: /^Ekmek/ }).click();
  await kasa.getByRole("button", { name: "Öde" }).click();
  await kasa.getByRole("button", { name: "Tamamı kart" }).click();
  await kasa.getByRole("button", { name: "Satışı tamamla" }).click();
  await kasa.getByText(/Fiş K1-000002/).waitFor();
  await kasa.getByTestId("print-state").getByText(/Yazdırılamadı/).waitFor({ timeout: 30000 });
  await kasa.getByTestId("agent-status").getByText(/Yazıcı hatası/).waitFor();
  step("yazıcı kapalı: satış K1-000002 kaydedildi, 'Yazdırılamadı' + rozet 'Yazıcı hatası'");
  printer = net.createServer(printerHandler);
  await listen(printer, pport);
  const before = jobs.length;
  await kasa.getByRole("button", { name: "Yeniden dene" }).click();
  await kasa.getByTestId("print-state").getByText("Fiş yazdırıldı.").waitFor();
  expect(jobs.length, before + 1, "yeniden deneme işi");
  const t2 = jobs.at(-1).toString("latin1");
  if (!t2.includes("K1-000002")) throw new Error("yeniden denenen fiş yanlış");
  if (jobs.at(-1).subarray(0, 5).equals(DRAWER)) throw new Error("kartlı satışta çekmece açıldı");
  step("yazıcı açıldı → 'Yeniden dene' → K1-000002 basıldı (çekmecesiz)");

  // Fiş ekranından yazdır (ajan)
  await kasa.getByRole("button", { name: "Fişi yazdır" }).click();
  await kasa.getByRole("button", { name: "Yazdır", exact: true }).click();
  await kasa.getByText("Yazıcıya gönderildi.").waitFor();
  expect(jobs.length, before + 2, "fiş ekranından yazdırma");
  step("fiş ekranı 'Yazdır' → ajan");

  await kasa.getByRole("button", { name: "Kasaya dön" }).click();

  // Kasiyer çekmeceyi müdür PIN'iyle açar
  await kasa.getByRole("button", { name: "Çekmece" }).click();
  await kasa.getByRole("heading", { name: "Müdür onayı" }).waitFor();
  await pin(kasa, "7391");
  await waitFor(() => jobs.length === before + 3, "çekmece darbesi");
  if (!jobs.at(-1).equals(DRAWER)) throw new Error("çekmece işi yalnız darbe olmalı");
  step("kasiyer 'Çekmece' → müdür PIN'i → darbe");

  await admin.goto(`${BASE}/yonetim/donanim`);
  await admin.getByText("hazır").first().waitFor();
} finally {
  agentProc?.kill();
  printer.close();
  scale.close();
  fs.rmSync(dir, { recursive: true, force: true });
  await browser.close();
}
if (errors.length) throw new Error(`sayfa hataları: ${errors.join(" | ")}`);
console.log("M4 OK");
