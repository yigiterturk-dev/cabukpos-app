// lib/growth/messaging/index.ts — sağlayıcı kaydı. Kapalıyken hiçbir çağrı ağa çıkmaz.
// MARKETING_SMS_PROVIDER: http (genel sözleşme) | netgsm | iletimerkezi.
import { sandboxSmsProvider } from "./sandbox";
import { createNetgsmProvider } from "./netgsm";
import { createIletimerkeziProvider } from "./iletimerkezi";
import type { MessagingProvider } from "./types";

export const marketingSmsEnabled = () => process.env.MARKETING_SMS_ENABLED === "1";
export const marketingSmsProviderName = () => (process.env.MARKETING_SMS_PROVIDER?.trim().toLowerCase() || "http");

/** Kapalıysa null döner: hiçbir çağrı ağa çıkmaz. */
export function messagingProvider(): MessagingProvider | null {
  if (!marketingSmsEnabled()) return null;
  const name = marketingSmsProviderName();
  if (name === "netgsm") return createNetgsmProvider(true, null);
  if (name === "iletimerkezi") return createIletimerkeziProvider(true, null);
  if (name === "http" || name === "generic") return sandboxSmsProvider;
  return {
    id: name,
    async send() { throw new Error(`Bilinmeyen SMS sağlayıcısı: ${name}`); },
  };
}

export { growthRefSecret, sendGrowthCampaignPage, type SendPageResult } from "./send";
export { createSandboxSmsProvider, sandboxSmsProvider } from "./sandbox";
export { createNetgsmProvider } from "./netgsm";
export { createIletimerkeziProvider } from "./iletimerkezi";
export {
  smsConfig, netgsmConfig, iletimerkeziConfig, normalizeTrPhone,
  type MessagingProvider, type MessagingSendResult, type MessagingTarget,
  type SmsConfig, type NetgsmConfig, type IletimerkeziConfig,
} from "./types";
