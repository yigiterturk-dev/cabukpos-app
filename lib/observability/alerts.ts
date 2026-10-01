/** Optional operational alert channel. No request leaves the app unless configured. */
export async function dispatchAlert(event: string, detail: Record<string, unknown>): Promise<void> {
  const endpoint = process.env.AGENT_ALERT_WEBHOOK_URL;
  if (!endpoint) return;
  try {
    await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ service: "cabukpos", event, detail, at: new Date().toISOString() }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch { /* alert failure must not break the heartbeat */ }
}
