// lib/mail.ts — Resend (bağımlılıksız). Yapılandırma yoksa false; çağıran atlar.
export const mailReady = () => !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM && process.env.APP_URL);
export const appUrl = () => (process.env.APP_URL ?? "").replace(/\/$/, "");
export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export async function sendEmail(m: { to: string[]; subject: string; text: string; html: string }): Promise<boolean> {
  if (!mailReady() || !m.to.length) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: process.env.MAIL_FROM, ...m }),
  }).catch(() => null);
  return !!res?.ok;
}
