import { createHmac } from "node:crypto";

export function recipientRef(secret: string, normalizedPhone: string) {
  return "hmac-sha256:" + createHmac("sha256", secret).update(normalizedPhone).digest("hex");
}

export function encodeAudienceCursor(customerId: string) {
  return Buffer.from(customerId, "utf8").toString("base64url");
}

export function decodeAudienceCursor(cursor: string | undefined) {
  if (!cursor) return null;
  try {
    const id = Buffer.from(cursor, "base64url").toString("utf8");
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id : null;
  } catch {
    return null;
  }
}
