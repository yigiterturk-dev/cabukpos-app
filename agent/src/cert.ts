// agent/src/cert.ts — <ajan-id>.lan.cabukpos.com için Let's Encrypt sertifikası (DNS-01). Özel anahtar ajanda kalır;
// DNS kayıtlarını (A = LAN IP, TXT = ACME) bulut yazar, yalnız bu ajanın adlarına. Bulutta DNS sağlayıcısı yoksa 501 → atlanır.
import fs from "node:fs";
import path from "node:path";
import * as acme from "acme-client";
import { setDns } from "./cloud";

export type Tls = { key: string; cert: string; expiresAt: Date };
const RENEW_MS = 30 * 86_400_000;

export function loadCert(dir: string): Tls | null {
  try {
    const cert = fs.readFileSync(path.join(dir, "lan.crt"), "utf8");
    const key = fs.readFileSync(path.join(dir, "lan.key"), "utf8");
    return { key, cert, expiresAt: acme.crypto.readCertificateInfo(cert).notAfter };
  } catch {
    return null;
  }
}

/** Sertifika yoksa ya da 30 günden az kaldıysa alır. Bulut DNS'i desteklemiyorsa null (http/localhost'ta kalınır). */
export async function ensureCert(dir: string, s: { cloudUrl: string; token: string }, ip: string | null, log: (m: string) => void): Promise<Tls | null> {
  const have = loadCert(dir);
  if (ip) {
    try { await setDns(s.cloudUrl, s.token, { type: "A", value: ip }); } catch (e) {
      if ((e as { status?: number }).status === 501) return have; // bulutta DNS sağlayıcısı yok
      log(`DNS A kaydı yazılamadı: ${(e as Error).message}`);
    }
  }
  if (have && have.expiresAt.getTime() - Date.now() > RENEW_MS) return have;
  try {
    const accountFile = path.join(dir, "acme-account.key");
    const accountKey = fs.existsSync(accountFile) ? fs.readFileSync(accountFile) : await acme.crypto.createPrivateKey();
    fs.writeFileSync(accountFile, accountKey, { mode: 0o600 });
    const client = new acme.Client({ directoryUrl: process.env.ACME_DIRECTORY ?? acme.directory.letsencrypt.production, accountKey });
    // Ad bulutta ajan kimliğinden belirlenir; TXT temizleme çağrısı adı döner.
    const { name } = await setDns(s.cloudUrl, s.token, { type: "TXT", value: null });
    const [key, csr] = await acme.crypto.createCsr({ commonName: name });
    const cert = await client.auto({
      csr,
      termsOfServiceAgreed: true,
      challengePriority: ["dns-01"],
      challengeCreateFn: async (_a, _c, keyAuthorization) => { await setDns(s.cloudUrl, s.token, { type: "TXT", value: keyAuthorization }); },
      challengeRemoveFn: async () => { await setDns(s.cloudUrl, s.token, { type: "TXT", value: null }); },
    });
    fs.writeFileSync(path.join(dir, "lan.key"), key, { mode: 0o600 });
    fs.writeFileSync(path.join(dir, "lan.crt"), cert);
    log(`Sertifika alındı: ${name}`);
    return loadCert(dir);
  } catch (e) {
    if ((e as { status?: number }).status === 501) return have;
    log(`Sertifika alınamadı: ${(e as Error).message}`);
    return have;
  }
}
