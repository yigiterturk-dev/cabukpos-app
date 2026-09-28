// agent/src/scale-io.ts — Teraziden okuma: TCP (ağ terazisi, okuma başına bağlantı) ya da seri port (kalıcı akış).
import net from "node:net";
import fs from "node:fs";
import { execFile } from "node:child_process";
import type { Readable } from "node:stream";
import type { ScaleConfig } from "@/lib/agent/config";
import { parseScale, type ScaleReading } from "./scale";

const REQ: Record<string, number[]> = { enq: [0x05], w: [0x57, 0x0d], yok: [] };
const TIMEOUT = 1500;

/** Akıştan tam bir yanıt (satır sonu / ETX) gelene kadar biriktirir. */
function nextReading(src: Readable, ms = TIMEOUT): Promise<ScaleReading> {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    const done = (e: Error | null, r?: ScaleReading) => { clearTimeout(t); src.off("data", onData); if (e) reject(e); else resolve(r!); };
    const onData = (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]).subarray(-256);
      // Son tam kaydı al (sürekli gönderen terazide en yeni okuma)
      const parts = buf.toString("latin1").split(/[\r\n\x03]/);
      for (let i = parts.length - 2; i >= 0; i--) {
        const r = parseScale(parts[i]);
        if (r) return done(null, r);
      }
    };
    const t = setTimeout(() => done(new Error("Terazi yanıt vermedi")), ms);
    src.on("data", onData);
  });
}

function readTcp(host: string, port: number, req: number[]): Promise<ScaleReading> {
  return new Promise((resolve, reject) => {
    const s = net.connect({ host, port });
    s.once("error", (e) => { s.destroy(); reject(new Error(`Terazi: ${(e as NodeJS.ErrnoException).code ?? e.message}`)); });
    s.once("connect", () => {
      nextReading(s).then(resolve, reject).finally(() => s.destroy());
      if (req.length) s.write(Buffer.from(req));
    });
  });
}

let serial: { key: string; stream: fs.ReadStream; fd: number } | null = null;

async function openSerial(port: string, baud: number) {
  const key = `${port}@${baud}`;
  if (serial?.key === key && !serial.stream.destroyed) return serial;
  serial?.stream.destroy();
  await new Promise<void>((res, rej) => {
    const [cmd, args] = process.platform === "win32" ? ["mode", [`${port}:`, `BAUD=${baud}`, "PARITY=n", "DATA=8", "STOP=1"]] : process.platform === "darwin" ? ["stty", ["-f", port, String(baud), "raw", "-echo"]] : ["stty", ["-F", port, String(baud), "raw", "-echo"]];
    execFile(cmd as string, args as string[], { windowsHide: true, timeout: 5000 }, (e) => (e ? rej(new Error(`Seri port ayarlanamadı: ${port}`)) : res()));
  });
  const fd = fs.openSync(process.platform === "win32" ? `\\\\.\\${port}` : port, "r+");
  const stream = fs.createReadStream("", { fd, autoClose: true });
  stream.on("error", () => { if (serial?.fd === fd) serial = null; });
  serial = { key, stream, fd };
  return serial;
}

export async function readScale(c: ScaleConfig): Promise<ScaleReading> {
  if (c.kind === "yok") throw new Error("Terazi tanımlı değil");
  const req = REQ[c.request];
  if (c.kind === "tcp") return readTcp(c.host, c.port, req);
  const s = await openSerial(c.port, c.baud);
  const p = nextReading(s.stream);
  if (req.length) fs.write(s.fd, Buffer.from(req), () => {});
  return p;
}

/** Kararsız okumada 2 sn boyunca yeniden dener; en son okumayı döner. */
export async function readStable(c: ScaleConfig, wait = 2000): Promise<ScaleReading> {
  const until = Date.now() + wait;
  let r = await readScale(c);
  while (!r.stable && Date.now() < until) {
    await new Promise((x) => setTimeout(x, 250));
    r = await readScale(c);
  }
  return r;
}
