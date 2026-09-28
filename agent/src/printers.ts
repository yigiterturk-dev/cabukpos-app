// agent/src/printers.ts — Yazıcı taşıyıcıları: ağ (TCP 9100), Windows paylaşımı, CUPS, aygıt dosyası.
import net from "node:net";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import type { PrinterConfig } from "@/lib/agent/config";

const TIMEOUT = 4000;

function sendTcp(address: string, data: Uint8Array): Promise<void> {
  const [host, port = "9100"] = address.split(":");
  return new Promise((resolve, reject) => {
    const s = net.connect({ host, port: Number(port) });
    const fail = (e: Error) => { s.destroy(); reject(e); };
    s.setTimeout(TIMEOUT, () => fail(new Error(`${address} yanıt vermiyor`)));
    s.once("error", (e) => fail(new Error(`${address}: ${(e as NodeJS.ErrnoException).code ?? e.message}`)));
    s.once("connect", () => s.end(Buffer.from(data)));
    s.once("close", (hadError) => { if (!hadError) resolve(); });
  });
}

function run(cmd: string, args: string[], input?: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = execFile(cmd, args, { timeout: 15000, windowsHide: true }, (e, _o, err) => (e ? reject(new Error(String(err || e.message).trim().slice(0, 200))) : resolve()));
    if (input) p.stdin?.end(Buffer.from(input));
  });
}

async function sendShare(name: string, data: Uint8Array) {
  const f = path.join(os.tmpdir(), `cabukpos-${process.pid}-${Date.now()}.bin`);
  await fs.writeFile(f, data);
  try {
    await run("cmd", ["/c", "copy", "/b", f, `\\\\localhost\\${name}`]);
  } finally {
    await fs.rm(f, { force: true });
  }
}

export async function sendToPrinter(p: PrinterConfig, data: Uint8Array): Promise<void> {
  switch (p.transport) {
    case "ag": return sendTcp(p.address, data);
    case "paylasim":
      if (process.platform !== "win32") throw new Error("Paylaşılan yazıcı yalnız Windows'ta");
      return sendShare(p.address, data);
    case "cups": return run("lp", ["-d", p.address, "-o", "raw"], data);
    case "dosya": return fs.appendFile(p.address, data);
  }
}
