import { headers } from "next/headers";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { deleteCode } from "@/lib/admin/delivery-actions";
import { PLATFORM_NAMES } from "@/lib/core/platform";
import { SUPPORTED_PLATFORMS } from "@/lib/platform";
import { CodeForm, ConnectionForm, ConnectionToggles, TestOrderButton } from "@/components/admin/DeliveryForms";
import { Card, Empty, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Platformlar() {
  const a = await requireAdmin();
  const P = schema.platformConnections;
  const conns = await getDb().select().from(P).where(eq(P.tenantId, a.tenantId)).orderBy(asc(P.createdAt));
  const [codes, products] = await withTenant(a.tenantId, (tx) => Promise.all([
    tx.select({ id: schema.productPlatformCodes.id, platform: schema.productPlatformCodes.platform, storeId: schema.productPlatformCodes.storeId, code: schema.productPlatformCodes.code, product: schema.products.name })
      .from(schema.productPlatformCodes).innerJoin(schema.products, eq(schema.products.id, schema.productPlatformCodes.productId)).orderBy(asc(schema.productPlatformCodes.code)),
    tx.select({ value: schema.products.id, label: schema.products.name }).from(schema.products).where(and(eq(schema.products.active, true))).orderBy(asc(schema.products.name)),
  ]));
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const free = SUPPORTED_PLATFORMS.filter((p) => !conns.some((c) => c.platform === p)).map((p) => ({ value: p, label: PLATFORM_NAMES[p] ?? p }));
  return (
    <>
      <PageHeader title="Sipariş platformları" desc="Platform siparişleri kasada Paket sekmesine sesli uyarıyla düşer; kabul/red platforma bildirilir. Yemeksepeti ve Trendyol Go entegratör onayı gelince eklenecek." />
      {free.length > 0 && <Card className="mb-6 p-5"><ConnectionForm platforms={free} /></Card>}
      {conns.length === 0 ? <Empty>Henüz bağlı platform yok. Akışı denemek için Deneme platformunu bağlayın.</Empty> : conns.map((c) => (
        <Card key={c.id} className="mb-6 space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-3"><h2 className="font-semibold">{PLATFORM_NAMES[c.platform] ?? c.platform}</h2><ConnectionToggles id={c.id} autoAccept={c.autoAccept} active={c.active} /></div>
          <div className="space-y-1 text-sm">
            <div>Webhook adresi: <code className="break-all rounded bg-stone-50 px-1">{`${origin}/api/platform/${c.platform}/webhook?c=${c.id}`}</code></div>
            <div>İmza anahtarı (HMAC-SHA256, <code>x-signature</code>): <code className="break-all rounded bg-stone-50 px-1" data-testid="webhook-secret">{c.webhookSecret}</code></div>
          </div>
          {c.platform === "mock" && <TestOrderButton connectionId={c.id} />}
          <div>
            <h3 className="mb-2 text-sm font-semibold">Ürün kodu eşleme</h3>
            <p className="mb-3 text-sm text-muted">Eşlenmeyen kod siparişe platformdaki ad ve fiyatla serbest satır olarak düşer.</p>
            <CodeForm connectionId={c.id} products={products} />
            <ul className="mt-3 divide-y divide-line text-sm">
              {codes.filter((k) => k.platform === c.platform && k.storeId === c.storeId).map((k) => (
                <li key={k.id} className="flex items-center gap-3 py-1.5"><code className="w-40">{k.code}</code><span>{k.product}</span>
                  <form action={deleteCode.bind(null, k.id)} className="ml-auto"><button className="text-xs text-red-700 underline">Sil</button></form></li>
              ))}
            </ul>
          </div>
        </Card>
      ))}
    </>
  );
}
