// agent/src/main.ts — ÇabukPOS yerel ajanı. Komutlar: pair <kod> [--url], run, install, uninstall, test-print [yazıcı], test-scale, test-drawer [yazıcı].
// Seçenekler: --dir <klasör> (varsayılan %APPDATA%\cabukpos | ~/.config/cabukpos), --port <n>.
import { execFile } from "node:child_process";
import path from "node:path";
import { AGENT_PORT } from "@/lib/agent/config";
import { EscPos } from "@/lib/core/escpos";
import { heartbeat, pair } from "./cloud";
import { ensureCert } from "./cert";
import { createHub, VERSION } from "./server";
import { defaultDir, lanIp, loadState, saveState, type AgentState } from "./state";
import { sendToPrinter } from "./printers";
import { readStable } from "./scale-io";

const args = process.argv.slice(2);
const opt = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const dir = opt("dir") ?? defaultDir();
const log = (m: string) => console.log(`${new Date().toISOString()} ${m}`);
const die = (m: string): never => { console.error(m); process.exit(1); };
const need = () => loadState(dir) ?? die(`Ajan eşlenmemiş. Önce: cabukpos-agent pair <KOD>  (klasör: ${dir})`);

async function cmdPair(code: string | undefined) {
  if (!code) die("Kullanım: cabukpos-agent pair <EŞLEME KODU> [--url https://app.cabukpos.com]");
  const cloudUrl = (opt("url") ?? "https://cabukpos-app.vercel.app").replace(/\/$/, "");
  const r = await pair(cloudUrl, code!.trim().toUpperCase()).catch((e: Error) => die(`Eşleme başarısız: ${e.message}`));
  const port = Number(opt("port") ?? AGENT_PORT);
  saveState(dir, { cloudUrl, agentId: r.agentId, tenantId: r.tenantId, token: r.token, hubKey: r.hubKey, port, config: null, revoked: [] });
  console.log(`Eşlendi (${r.agentId}). Başlatmak için: cabukpos-agent run  — Windows'ta açılışta çalışsın: cabukpos-agent install`);
}

async function cmdRun() {
  let s: AgentState = need();
  const hub = createHub({ hubKey: s.hubKey, tenantId: s.tenantId, origin: new URL(s.cloudUrl).origin, config: () => s.config, revoked: () => s.revoked, tabsFile: path.join(dir, "tabs.jsonl") });
  await hub.listenLocal(s.port).catch((e: Error) => die(`127.0.0.1:${s.port} açılamadı: ${e.message}`));
  log(`ÇabukPOS ajanı ${VERSION} — http://127.0.0.1:${s.port}`);

  let tls: Awaited<ReturnType<typeof ensureCert>> = null;
  let tlsServer: { close: () => void } | null = null;
  let lastCertCheck = 0;
  async function certTick() {
    if (Date.now() - lastCertCheck < 86_400_000) return;
    lastCertCheck = Date.now();
    const next = await ensureCert(dir, s, lanIp(), log);
    if (next && next.cert !== tls?.cert) {
      tlsServer?.close();
      tls = next;
      tlsServer = await hub.listenTls(s.port + 1, next).catch((e: Error) => { log(`https açılamadı: ${e.message}`); return null; });
      if (tlsServer) log(`LAN https :${s.port + 1} (sertifika ${next.expiresAt.toISOString().slice(0, 10)} tarihine kadar)`);
    }
  }

  let failures = 0;
  async function tick() {
    const st = hub.statusBody();
    try {
      const r = await heartbeat(s.cloudUrl, s.token, {
        version: VERSION, lanIp: lanIp(), port: s.port, httpsPort: tlsServer ? s.port + 1 : null, certExpiresAt: tls?.expiresAt.toISOString() ?? null,
        printers: st.printers.map((p) => ({ id: p.id, ok: p.ok, error: p.error?.slice(0, 200) ?? null })), failed: st.failed.length, scale: st.scale,
      });
      if (JSON.stringify(r.config) !== JSON.stringify(s.config) || JSON.stringify(r.revoked) !== JSON.stringify(s.revoked)) {
        s = { ...s, config: r.config, revoked: r.revoked };
        saveState(dir, s);
        log(`Yapılandırma güncellendi: ${r.config.printers.length} yazıcı, terazi ${r.config.scale.kind}`);
      }
      if (failures) log("Buluta yeniden bağlandı");
      failures = 0;
      await certTick();
    } catch (e) {
      if ((e as { status?: number }).status === 401) die("Ajan eşlemesi iptal edilmiş. Yönetimden yeni kod alıp yeniden eşleyin.");
      if (!failures++) log(`Bulut erişilemiyor (${(e as Error).message}); son yapılandırmayla çalışılıyor`);
    }
  }
  await tick();
  setInterval(() => void tick(), Number(process.env.CABUKPOS_HEARTBEAT_MS ?? 60_000));
}

function pickPrinter(s: AgentState, sel: string | undefined) {
  const p = s.config?.printers.find((x) => x.id === sel || x.name === sel) ?? s.config?.printers[0];
  if (!p) die("Tanımlı yazıcı yok (yönetim → Donanım).");
  return p!;
}

async function cmdTestPrint(sel: string | undefined) {
  const s = need();
  const p = pickPrinter(s, sel);
  const e = new EscPos(p.codepage, p.width).align("center").bold(true).line("ÇabukPOS deneme").bold(false).line("Türkçe: ĞÜŞİÖÇ ğüşıöç").line(new Date().toLocaleString("tr-TR")).feed(3).cut();
  await sendToPrinter(p, e.bytes()).then(() => console.log(`Gönderildi: ${p.name}`), (x: Error) => die(`Yazdırılamadı: ${x.message}`));
}

async function cmdTestScale() {
  const s = need();
  const c = s.config?.scale;
  if (!c || c.kind === "yok") die("Terazi tanımlı değil (yönetim → Donanım).");
  console.log(`Terazi okunuyor (${c!.kind})…`);
  const r = await readStable(c!).catch((x: Error) => die(`Terazi okunamadı: ${x.message}`));
  console.log(`Okuma: ${(r!.grams / 1000).toFixed(3)} kg · ${r!.stable ? "kararlı" : "KARARSIZ (US)"}`);
}

async function cmdTestDrawer(sel: string | undefined) {
  const s = need();
  const p = pickPrinter(s, sel);
  // ESC p 0 — 2 numaralı pin, 250 ms aç / 250 ms kapat (genel standart; çekmece yazıcının RJ11 çıkışındadır)
  await sendToPrinter(p, Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa])).then(
    () => console.log(`Çekmece sinyali gönderildi: ${p.name}`),
    (x: Error) => die(`Gönderilemedi: ${x.message}`),
  );
}

const TASK = "CabukPOS Ajan";
function cmdInstall(remove: boolean) {
  if (process.platform !== "win32") die("Otomatik başlatma yalnız Windows'ta; Mac/Linux'ta 'run' komutunu servis yöneticinize ekleyin.");
  const a = remove ? ["/delete", "/tn", TASK, "/f"] : ["/create", "/tn", TASK, "/sc", "onlogon", "/rl", "limited", "/f", "/tr", `"${process.execPath}" "${process.argv[1]}" run --dir "${dir}"`];
  execFile("schtasks", a, { windowsHide: true }, (err, _o, e) => {
    if (err) die(String(e || err.message));
    console.log(remove ? "Kaldırıldı." : "Oturum açılışında başlayacak. Şimdi başlatılıyor…");
    if (!remove) execFile("schtasks", ["/run", "/tn", TASK], { windowsHide: true }, () => {});
  });
}

const cmd = args[0];
if (cmd === "pair") void cmdPair(args[1]);
else if (cmd === "run") void cmdRun();
else if (cmd === "test-print") void cmdTestPrint(args[1]);
else if (cmd === "test-scale") void cmdTestScale();
else if (cmd === "test-drawer") void cmdTestDrawer(args[1]);
else if (cmd === "install" || cmd === "uninstall") cmdInstall(cmd === "uninstall");
else console.log(`ÇabukPOS ajanı ${VERSION}\nKomutlar: pair <KOD> [--url URL] · run · install · uninstall · test-print [yazıcı] · test-scale · test-drawer [yazıcı]\nSeçenekler: --dir <klasör> --port <n>`);
