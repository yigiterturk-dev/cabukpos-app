// Kullanıcılar: işletme sahibi + zincir merkezi (HQ) hesap açar, şube müdürü atar.
// Şube müdürü hesabı users.storeId ile tek şubeye kilitlidir; kapsam lib/core/access.ts.
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb, schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { canManageUser, canManageUsers } from "@/lib/core/access";
import { createUser, sendUserInviteAction, updateUserAccess } from "@/lib/admin/user-actions";
import { CreateUserForm, InviteUserForm, UserAccessForm } from "@/components/admin/UserForms";
import { Badge, Card, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const ROLE_LABEL = (role: "sahip" | "mudur", storeId: string | null) =>
  role === "sahip" ? "İşletme sahibi" : storeId ? "Şube müdürü" : "Zincir merkezi";

export default async function Kullanicilar() {
  const a = await requireAdmin();
  if (!canManageUsers(a)) redirect("/yonetim");
  const U = schema.users;
  const [rows, stores] = await Promise.all([
    getDb().select({ id: U.id, name: U.name, email: U.email, role: U.role, storeId: U.storeId, active: U.active, emailVerifiedAt: U.emailVerifiedAt, createdAt: U.createdAt })
      .from(U).where(eq(U.tenantId, a.tenantId)).orderBy(asc(U.createdAt)),
    withTenant(a.tenantId, (tx) => tx.select({ id: schema.stores.id, name: schema.stores.name }).from(schema.stores).orderBy(asc(schema.stores.name))),
  ]);
  const storeName = new Map(stores.map((s) => [s.id, s.name]));
  return (
    <>
      <PageHeader
        title="Kullanıcılar"
        desc="Panel hesapları: işletme sahibi tüm şubelere, zincir merkezi tüm şubelere, şube müdürü yalnız kendi şubesine erişir. Şube müdürü kullanıcı açamaz."
      />

      <section aria-label="Yeni kullanıcı" className="mb-8">
        <Card>
          <CreateUserForm action={createUser} roleOwner={a.role === "sahip"} stores={stores} />
        </Card>
      </section>

      {rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">Henüz panel kullanıcısı yok.</Card>
      ) : (
        <Card className="divide-y divide-line">
          {rows.map((u) => (
            <div key={u.id} className="space-y-3 p-4">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="min-w-0 break-words font-medium">{u.name}</span>
                {u.id === a.id && <Badge tone="brand">siz</Badge>}
                <span className="min-w-0 break-all text-sm text-muted">{u.email}</span>
                <span className="ml-auto flex shrink-0 flex-wrap items-center gap-1.5">
                  <Badge tone={u.role === "sahip" ? "brand" : "neutral"}>{ROLE_LABEL(u.role, u.storeId)}</Badge>
                  {u.storeId && <Badge tone="neutral">{storeName.get(u.storeId) ?? "Silinmiş şube"}</Badge>}
                  {!u.active && <Badge tone="bad">pasif</Badge>}
                  {!u.emailVerifiedAt && u.active && <Badge tone="warn">e-posta doğrulanmadı</Badge>}
                </span>
              </div>
              <div className="flex min-w-0 flex-wrap items-start gap-x-6 gap-y-3">
                {u.id === a.id || canManageUser(a, u) ? (
                  <UserAccessForm action={updateUserAccess} user={{ id: u.id, role: u.role, storeId: u.storeId, active: u.active }} stores={stores} self={u.id === a.id} roleOwner={a.role === "sahip"} />
                ) : <p className="text-xs text-muted">Bu hesabı yalnız işletme sahibi yönetebilir.</p>}
                {u.active && canManageUser(a, u) && <InviteUserForm action={sendUserInviteAction} userId={u.id} />}
              </div>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
