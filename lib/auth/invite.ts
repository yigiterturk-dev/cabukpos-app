// lib/auth/invite.ts — 3 günlük reset jetonu; şifre veya erişim değişince geçersizleşir.
import { appUrl } from "@/lib/mail";
import { INVITE_SECONDS, resetToken, type ResetAccount } from "./reset";

export const inviteLink = async (u: ResetAccount) =>
  `${appUrl()}/sifre-yenile?t=${await resetToken(u, INVITE_SECONDS)}`;
