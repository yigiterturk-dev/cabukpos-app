import { requireAdmin } from "@/lib/auth/session";
import { listKeys } from "@/lib/integrations/keys";
import { revokeIntegrationKey } from "@/lib/admin/integration-actions";
import { RevokeForm } from "@/components/admin/RevokeForms";
import { IntegrationKeyForm } from "@/components/admin/IntegrationKeyForm";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
const dt = (d: Date) => d.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" });

export default async function Entegrasyonlar() {
  const a = await requireAdmin();
  const owner = a.role === "sahip";
  const rows = await listKeys(a.tenantId);
  return (
    <>
      <PageHeader title="Entegrasyonlar" desc="Ajansınıza salt okunur erişim verin: günlük sipariş, ciro ve iade özeti. Platform siparişleri dahil değildir." />
      {owner ? <>
        <Card className="mb-6 p-5"><IntegrationKeyForm /></Card>
        <Card className="mb-6 border-brand/20 bg-brand-soft p-5"><h2 className="font-semibold">Büyüme Merkezi / Laya erişimi</h2><p className="mt-1 mb-4 text-sm text-ink-2">Bu anahtar yalnız PII&apos;siz toplu büyüme özellik paketini okur; günlük satış API&apos;sine erişmez.</p><IntegrationKeyForm scope="growth" /></Card>
      </> : <Card className="mb-6 p-4 text-sm text-muted">Anahtarları yalnız işletme sahibi yönetebilir.</Card>}
      {rows.length === 0 ? <Empty>Henüz erişim anahtarı yok.</Empty> : (
        <Card className="divide-y divide-line">
          {rows.map((k) => (
            <div key={k.id} data-testid="key-row" className="flex flex-wrap items-center gap-3 p-4">
              <div className="font-medium">{k.name}</div>
              <Badge tone="neutral">{k.scope === "growth" ? "Büyüme" : "Günlük satış"}</Badge>
              <span className="font-mono text-sm text-muted">{k.prefix}…</span>
              {k.revokedAt ? <Badge tone="bad">İptal</Badge> : <Badge tone="ok">Etkin</Badge>}
              <span className="text-xs text-muted">Oluşturma {dt(k.createdAt)}{k.lastUsedAt ? ` · son kullanım ${dt(k.lastUsedAt)}` : " · hiç kullanılmadı"}</span>
              {owner && !k.revokedAt && (
                <div className="ml-auto"><RevokeForm action={revokeIntegrationKey.bind(null, k.id)} ariaLabel={`Entegrasyon anahtarını iptal et: ${k.name}`} /></div>
              )}
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
