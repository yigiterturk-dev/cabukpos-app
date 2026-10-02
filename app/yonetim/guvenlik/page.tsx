// app/yonetim/guvenlik/page.tsx — Hesap güvenliği: 2FA (TOTP) kurulum/kapatma.
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { MfaAc, MfaKapat } from "@/components/admin/MfaForms";

export default async function GuvenlikPage() {
  const a = await requireAdmin();
  const [u] = await getDb().select({ totpSecret: schema.users.totpSecret }).from(schema.users).where(eq(schema.users.id, a.id));
  const acik = Boolean(u?.totpSecret);
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header>
        <h1 className="text-lg font-semibold">Güvenlik</h1>
        <p className="text-sm text-muted">Hesabınızın ek koruması.</p>
      </header>
      <section className="rounded-[14px] border border-line bg-surface p-5">
        <h2 className="mb-1 font-medium">İki adımlı doğrulama (2FA)</h2>
        <p className="mb-4 text-sm text-muted" role="status">
          {acik ? "Açık — girişte kimlik doğrulayıcı kodu isteniyor." : "Kapalı — şifreniz tek başına yeterli."}
        </p>
        {acik ? <MfaKapat /> : <MfaAc />}
      </section>
    </div>
  );
}
