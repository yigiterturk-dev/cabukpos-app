// app/yonetim/guvenlik/page.tsx — Hesap güvenliği: 2FA (TOTP) kurulum/kapatma + aktif oturumlar (#9).
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { activeSessions, requireAdmin, sonGorulme, uaLabel } from "@/lib/auth/session";
import { emailDogrulamaGonderAction } from "@/lib/auth/actions";
import { Button } from "@/components/ui";
import { MfaAc, MfaKapat } from "@/components/admin/MfaForms";
import { OturumKapatFormlari } from "@/components/admin/SessionForms";

export default async function GuvenlikPage() {
  const a = await requireAdmin();
  const [u] = await getDb().select({ totpSecret: schema.users.totpSecret }).from(schema.users).where(eq(schema.users.id, a.id));
  const acik = Boolean(u?.totpSecret);
  const oturumlar = await activeSessions(a.id);
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header>
        <h1 className="text-lg font-semibold">Güvenlik</h1>
        <p className="text-sm text-muted">Hesabınızın ek koruması.</p>
      </header>
      <section className="rounded-[14px] border border-line bg-surface p-5">
        <h2 className="mb-1 font-medium">E-posta doğrulama</h2>
        <p className="mb-4 text-sm text-muted" role="status">{a.emailVerified ? "E-postanız doğrulanmış." : "E-postanız doğrulanmadı — hesap kurtarma ve bildirimler için doğrulayın."}</p>
        {!a.emailVerified && (
          <form action={emailDogrulamaGonderAction}>
            <Button type="submit">Doğrulama e-postası gönder</Button>
          </form>
        )}
      </section>
      <section className="rounded-[14px] border border-line bg-surface p-5">
        <h2 className="mb-1 font-medium">İki adımlı doğrulama (2FA)</h2>
        <p className="mb-4 text-sm text-muted" role="status">
          {acik ? "Açık — girişte kimlik doğrulayıcı kodu isteniyor." : "Kapalı — şifreniz tek başına yeterli."}
        </p>
        {acik ? <MfaKapat /> : <MfaAc />}
      </section>
      <section className="rounded-[14px] border border-line bg-surface p-5" data-testid="sessions">
        <h2 className="mb-1 font-medium">Aktif oturumlar</h2>
        <p className="mb-4 text-sm text-muted">Hesabınızın açık kaldığı cihazlar. Şüpheli bir oturum görürseniz şifrenizi değiştirin.</p>
        {oturumlar.length > 0 && (
          <ul className="mb-5 divide-y divide-line rounded-[10px] border border-line">
            {oturumlar.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <div className="font-medium">{uaLabel(o.ua)} {o.current && <span className="ml-1 rounded-full bg-ok-soft px-2 py-0.5 text-xs font-semibold text-ok">bu cihaz</span>}</div>
                  <div className="text-xs text-muted">{[o.ip, sonGorulme(o.lastSeenAt)].filter(Boolean).join(" · ")}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <OturumKapatFormlari />
      </section>
    </div>
  );
}
