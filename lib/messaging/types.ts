import type { CampaignChannel } from "@/lib/types";

export type OutboundMessage = {
  /** E.164 normalize edilmiş alıcı numarası (+905321234567). */
  to: string;
  text: string;
  channel: CampaignChannel;
};

export type SendResult =
  | { ok: true; providerMessageId?: string }
  | { ok: false; error: string; retryable: boolean };

export interface MessageProvider {
  readonly name: string;
  /** Bu sağlayıcının gerçekten gönderebildiği kanallar. */
  supports(channel: CampaignChannel): boolean;
  send(msg: OutboundMessage): Promise<SendResult>;
}
