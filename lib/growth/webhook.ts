import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_SKEW_SECONDS = 5 * 60;

/** HMAC-SHA256(hex) of timestamp + "." + raw body; rejects stale/replayed timestamps. */
export function verifyGrowthWebhookSignature(input: {
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
  secret: string;
  nowMs?: number;
}) {
  const timestamp = Number(input.timestamp);
  if (!Number.isSafeInteger(timestamp) || Math.abs(Math.floor((input.nowMs ?? Date.now()) / 1000) - timestamp) > MAX_SKEW_SECONDS) return false;
  if (!input.signature || !/^[a-f0-9]{64}$/i.test(input.signature)) return false;
  const expected = createHmac("sha256", input.secret).update(timestamp + "." + input.rawBody).digest();
  const received = Buffer.from(input.signature, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}
