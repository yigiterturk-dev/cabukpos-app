/** Opsiyonel operasyonel alarm hattı. Yapılandırılmadan hiçbir istek çıkmaz; alarm hatası asla çağıranı bozmaz.
 *  Öncelik: AGENT_ALERT_WEBHOOK_URL (Slack/Discord/ops). Webhook yok ya da başarısızsa e-posta yedeği:
 *  ALERT_EMAIL + RESEND_API_KEY + MAIL_FROM üçlüsü gerekir (Resend, bağımlılıksız). */
export async function dispatchAlert(event: string, detail: Record<string, unknown>): Promise<void> {
  const endpoint = process.env.AGENT_ALERT_WEBHOOK_URL;
  if (endpoint) {
    let ok = false;
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ service: "cabukpos", event, detail, at: new Date().toISOString() }),
        signal: AbortSignal.timeout(5_000),
      });
      ok = res.ok;
    } catch { /* aşağıdaki e-posta yedeğine düşer */ }
    if (ok) return;
  }
  await alertEmail(event, detail);
}

/** Webhook yok/başarısız → e-posta alarmı. Üçlü yapılandırılmamışsa sessizce atlar. */
export async function alertEmail(event: string, detail: Record<string, unknown>): Promise<void> {
  const to = process.env.ALERT_EMAIL;
  if (!to || !process.env.RESEND_API_KEY || !process.env.MAIL_FROM) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: process.env.MAIL_FROM,
        to: [to],
        subject: `[ÇabukPOS] ${event}`,
        text: `${event}\n${new Date().toISOString()}\n\n${JSON.stringify(detail, null, 2)}\n`,
      }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch { /* alert failure must not break the caller */ }
}
