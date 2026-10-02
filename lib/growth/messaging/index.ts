// lib/growth/messaging/index.ts — sağlayıcı kaydı. mock/sandbox varsayılan kapalı; canlı SMS/WhatsApp hesabı insan işi.
import { sandboxSmsProvider } from "./sandbox";
import type { MessagingProvider } from "./types";

export const marketingSmsEnabled = () => process.env.MARKETING_SMS_ENABLED === "1";

/** Kapalıysa null döner: hiçbir çağrı ağa çıkmaz. */
export function messagingProvider(): MessagingProvider | null {
  return marketingSmsEnabled() ? sandboxSmsProvider : null;
}

export { growthRefSecret, sendGrowthCampaignPage, type SendPageResult } from "./send";
export { createSandboxSmsProvider, sandboxSmsProvider } from "./sandbox";
export { smsConfig, type MessagingProvider, type MessagingSendResult, type MessagingTarget, type SmsConfig } from "./types";
