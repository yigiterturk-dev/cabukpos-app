// Günlük abonelik posta akışı (Vercel Cron): bitiş öncesi hatırlatma + gecikme aşamaları (dunning).
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { billingInfo, reminderDue } from "@/lib/core/billing";
import { dunningIcerik, dunningStage } from "@/lib/billing/dunning";
import { dueSubscriptionInvoices, issueSubscriptionInvoice } from "@/lib/billing/invoice";
import { hit } from "@/lib/ratelimit";
import { appUrl, esc, mailReady, sendEmail } from "@/lib/mail";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("yetkisiz", { status: 401 });
  // #14: kesilememiş abonelik e-Arşiv faturaları (posta anahtarından bağımsız).
  const invs = await dueSubscriptionInvoices();
  let invoices = 0;
  for (const i of invs) if (await issueSubscriptionInvoice(i.id)) invoices++;
  if (!mailReady()) return Response.json({ invoices, skipped: "mail" });
  const T = schema.tenants, U = schema.users;
  const rows = await getDb().select({ id: T.id, name: T.name, trialEndsAt: T.trialEndsAt, paidUntil: T.paidUntil, remindedEnd: T.billingRemindedEnd }).from(T);
  let sent = 0;
  for (const t of rows) {
    if (!reminderDue(t)) continue;
    const i = billingInfo(t);
    const owners = await getDb().select({ email: U.email }).from(U).where(and(eq(U.tenantId, t.id), eq(U.role, "sahip"), eq(U.active, true)));
    const url = `${appUrl()}/yonetim/abonelik`;
    const what = i.state === "deneme" ? "deneme süren" : "aboneliğin";
    const ok = await sendEmail({
      to: owners.map((o) => o.email),
      subject: `ÇabukPOS ${what} ${i.daysLeft} gün sonra bitiyor`,
      text: `${t.name} için ÇabukPOS ${what} ${i.daysLeft} gün sonra bitiyor. Kasa satışa devam eder; yönetimi açık tutmak için:\n${url}\n`,
      html: `<p>${esc(t.name)} için ÇabukPOS ${what} <b>${i.daysLeft} gün</b> sonra bitiyor. Kasa satışa devam eder; yönetimi açık tutmak için:</p><p><a href="${url}">${url}</a></p>`,
    });
    if (ok) { await getDb().update(T).set({ billingRemindedEnd: i.endsAt }).where(eq(T.id, t.id)); sent++; }
  }
  // Gecikme aşamaları (bitiş sonrası): gün tarihden türetilir; hit() aynı aşamayı günde bir kez gönderir.
  for (const t of rows) {
    const stage = dunningStage(billingInfo(t));
    if (!stage) continue;
    if ((await hit(`dunning:${t.id}:${stage}`, 1440)) > 1) continue;
    const owners = await getDb().select({ email: U.email }).from(U).where(and(eq(U.tenantId, t.id), eq(U.role, "sahip"), eq(U.active, true)));
    const url = `${appUrl()}/yonetim/abonelik`;
    const c = dunningIcerik(stage);
    const ok = await sendEmail({
      to: owners.map((o) => o.email),
      subject: `ÇabukPOS: ${c.baslik}`,
      text: `${t.name} — ${c.kisa} ${c.kalin}\n${url}\n`,
      html: `<p><b>${esc(t.name)}</b> — ${esc(c.kisa)}</p><p>${esc(c.kalin)}</p><p><a href="${url}">${url}</a></p>`,
    });
    if (ok) sent++;
  }
  return Response.json({ invoices, sent });
}
