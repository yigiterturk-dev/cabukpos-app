// app/(auth)/dogrula/page.tsx — E-posta doğrulama bağlantısının düştüğü sayfa.
import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { checkDogrula } from "@/lib/auth/verify-email";
import { audit } from "@/lib/audit";

export const metadata: Metadata = { robots: { index: false } };

export default async function Dogrula({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  const sonuc = t
    ? await checkDogrula(t, async (id) => (await getDb().select({ email: schema.users.email, active: schema.users.active, emailVerifiedAt: schema.users.emailVerifiedAt }).from(schema.users).where(eq(schema.users.id, id)))[0] ?? null)
    : ({ durum: "bozuk", userId: null } as const);
  let durum = sonuc.durum;
  if (durum === "ok" && sonuc.userId) {
    const [u] = await getDb().select({ tenantId: schema.users.tenantId }).from(schema.users).where(eq(schema.users.id, sonuc.userId));
    if (u) {
      await getDb().transaction(async (tx) => {
        await tx.update(schema.users).set({ emailVerifiedAt: new Date() }).where(and(eq(schema.users.id, sonuc.userId!), isNull(schema.users.emailVerifiedAt)));
        await tx.execute(sql`select set_config('app.tenant_id', ${u.tenantId}, true)`);
        await audit(tx, u.tenantId, `user:${sonuc.userId}`, "user.email_verified");
      });
    } else durum = "bozuk";
  }
  const icerik =
    durum === "ok"
      ? { baslik: "E-postanız doğrulandı", metin: "Hesabınız artık doğrulanmış.", href: "/yonetim", yazi: "Panele dön" }
      : durum === "zaten"
        ? { baslik: "Zaten doğrulanmış", metin: "Bu e-posta daha önce doğrulanmıştı.", href: "/yonetim", yazi: "Panele dön" }
        : { baslik: "Doğrulama başarısız", metin: "Bağlantı geçersiz ya da süresi dolmuş.", href: "/yonetim/guvenlik", yazi: "Yeni doğrulama e-postası isteyin" };
  return (
    <>
      <h1 id="main-content" tabIndex={-1} className="mb-6 rounded-sm text-3xl font-semibold tracking-tight outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">{icerik.baslik}</h1>
      <p className="text-sm">
        {icerik.metin} <Link href={icerik.href} className="text-brand underline">{icerik.yazi}</Link>.
      </p>
    </>
  );
}
