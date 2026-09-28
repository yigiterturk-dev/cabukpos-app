// lib/agent/crypto.ts — hubKey'in bulutta şifreli saklanması (AES-GCM, anahtar AUTH_SECRET'tan türetilir). Yalnız sunucu.
const enc = new TextEncoder();
const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");

async function key() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET tanımlı değil veya kısa.");
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(`cabukpos-agent-hub:${s}`));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function sealHubKey(hubKey: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), enc.encode(hubKey)));
  return `${b64(iv)}.${b64(ct)}`;
}

export async function openHubKey(sealed: string): Promise<string> {
  const [iv, ct] = sealed.split(".").map((x) => Uint8Array.from(Buffer.from(x, "base64")));
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await key(), ct));
}
