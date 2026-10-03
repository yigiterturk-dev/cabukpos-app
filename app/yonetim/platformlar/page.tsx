import { headers } from "next/headers";
import { and, asc, eq } from "drizzle-orm";
import { scopedStoreId } from "@/lib/admin/store-scope";
import { getDb, schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { acceptPlatformOrder, deleteCode } from "@/lib/admin/delivery-actions";
import { PLATFORM_NAMES } from "@/lib/core/platform";
import { CONNECTABLE_PLATFORMS } from "@/lib/platform";
import QRCode from "qrcode";
import { foldTabs, type TabState } from "@/lib/core/tab";
import { initialEvents } from "@/lib/tabs/stream";
import { formatTL } from "@/lib/core/money";
import { CodeForm, ConnectionForm, ConnectionToggles, PushCatalogButton, TestOrderButton } from "@/components/admin/DeliveryForms";
import { Card, Empty, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const platformEtiket = (t: TabState) => {
  const p = t.order?.source?.platform;
  return (p && PLATFORM_NAMES[p.toLowerCase()]) ?? p ?? (t.kind === "paket" ? "Telefon" : "Platform");
};
const dkOnce = (at: string) => Math.max(0, Math.round((Date.now() - new Date(at).getTime()) / 60_000));
const bugunMu = (at: string) => new Date(at).toDateString() === new Date().toDateString();
const saat = (at: string) => new Date(at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
const gecikti = (t: TabState) => Boolean(t.delivery.acceptedAt && t.delivery.prepMin && !t.delivery.outAt && Date.now() - new Date(t.delivery.acceptedAt).getTime() > t.delivery.prepMin * 60_000);
const DURUM = (t: TabState): { label: string; cls: string } =>
  t.closed || t.delivery.deliveredAt ? { label: "Teslim", cls: "bg-ok text-white" }
  : t.delivery.outAt ? { label: "Kuryede", cls: "bg-brand text-white" }
  : gecikti(t) ? { label: `Gecikti · hedef ${t.delivery.prepMin} dk`, cls: "bg-amber-500 text-white" }
  : t.delivery.acceptedAt ? { label: `Hazırlanıyor${t.delivery.prepMin ? ` · ${t.delivery.prepMin} dk` : ""}`, cls: "bg-ink text-white" }
  : { label: "Onay bekliyor", cls: "bg-amber-500 text-white" };
const cizelge = (t: TabState) =>
  [t.delivery.acceptedAt ? `kabul ${saat(t.delivery.acceptedAt)}` : "", t.delivery.outAt ? `yolda ${saat(t.delivery.outAt)}` : "", t.delivery.deliveredAt ? `teslim ${saat(t.delivery.deliveredAt)}` : ""].filter(Boolean).join(" · ");

function PaketHatti({ acik, teslim }: { acik: TabState[]; teslim: number }) {
  const gruplar = new Map<string, TabState[]>();
  for (const t of acik) {
    const p = platformEtiket(t);
    gruplar.set(p, [...(gruplar.get(p) ?? []), t]);
  }
  return (
    <Card className="mb-6 p-5" data-testid="paket-hatti">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="font-semibold">Canlı paket hattı</h2>
        {teslim > 0 && <span className="text-sm text-muted">bugün {teslim} teslim</span>}
        <a href="/yonetim/platformlar" className="ml-auto text-sm text-brand hover:underline">Yenile</a>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {gruplar.size === 0 && <span className="text-sm text-muted">Açık paket/platform siparişi yok.</span>}
        {[...gruplar.entries()].map(([p, ts]) => (
          <div key={p} className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2">
            <span className="text-sm font-medium">{p}</span>
            <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-white">{ts.length}</span>
          </div>
        ))}
      </div>
      {acik.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line bg-surface-3 text-left text-muted">
              <th className="px-3 py-2 font-medium">Platform</th><th className="px-3 py-2 font-medium">Müşteri</th>
              <th className="px-3 py-2 font-medium">Sipariş</th><th className="px-3 py-2 font-medium">Tutar</th>
              <th className="px-3 py-2 font-medium">Durum</th><th className="px-3 py-2 font-medium">Süre</th><th className="px-3 py-2 font-medium">İşlem</th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {acik.map((t) => {
                const dk = dkOnce(t.openedAt);
                return (
                  <tr key={t.id}>
                    <td className="px-3 py-2 font-medium">{platformEtiket(t)}{t.order?.source?.externalId ? <span className="text-muted"> #{t.order.source.externalId.slice(-4)}</span> : null}</td>
                    <td className="px-3 py-2">{t.order?.name ?? "—"}<span className="block text-xs text-muted">{t.order?.phone ?? ""}</span></td>
                    <td className="px-3 py-2 text-muted">{t.lines.filter((l) => !l.voided).length} ürün</td>
                    <td className="px-3 py-2 tabular font-semibold">{formatTL(t.total)}</td>
                    <td className="px-3 py-2"><span className={`rounded px-1.5 py-0.5 text-xs font-medium ${DURUM(t).cls}`}>{DURUM(t).label}</span><span className="block text-[11px] text-muted">{cizelge(t)}</span></td>
                    <td className="px-3 py-2 text-muted">{dk} dk</td>
                    <td className="px-3 py-2">
                      {!t.closed && !t.delivery.acceptedAt && !t.delivery.rejected && !t.delivery.cancelled ? (
                        <form action={acceptPlatformOrder.bind(null, t.id)}>
                          <button className="text-sm font-medium text-brand hover:underline">Onayla</button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-sm text-muted">Onay, kurye ve teslim kasada <strong>Paket</strong> sekmesinden yapılır; bu ekran canlı izleme. Yeni sipariş kasaya sesli uyarıyla düşer.</p>
    </Card>
  );
}

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
  const storeId = await withTenant(a.tenantId, (tx) => scopedStoreId(tx, a.tenantId));
  const hat = storeId ? [...foldTabs(await initialEvents({ tenantId: a.tenantId, storeId })).values()].filter((t) => t.kind !== "masa") : [];
  const acik = hat.filter((t) => !t.closed);
  const teslim = hat.filter((t) => {
    const at = t.closedAt ?? t.delivery.deliveredAt;
    return at && bugunMu(at);
  }).length;
  const free = CONNECTABLE_PLATFORMS.filter((p) => !conns.some((c) => c.platform === p)).map((p) => ({ value: p, label: PLATFORM_NAMES[p] ?? p }));
  return (
    <>
      <PageHeader title="Sipariş platformları" desc="Platform siparişleri kasada Paket sekmesine sesli uyarıyla düşer; kabul/red platforma bildirilir. Yemeksepeti ve Trendyol Go entegratör onayı gelince eklenecek." />
      <PaketHatti acik={acik} teslim={teslim} />
      {free.length > 0 && <Card className="mb-6 p-5"><ConnectionForm platforms={free} /></Card>}
      {conns.length === 0 ? <Empty>Henüz bağlı platform yok. Akışı denemek için Deneme platformunu bağlayın.</Empty> : await Promise.all(conns.map(async (c) => {
        const menuUrl = c.platform === "kiosk" ? `${origin}/menu/${c.storeId}?k=${c.webhookSecret}` : null;
        const qr = menuUrl ? await QRCode.toString(menuUrl, { type: "svg", margin: 1, width: 148 }) : null;
        return (
        <Card key={c.id} className="mb-6 space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-3"><h2 className="font-semibold">{PLATFORM_NAMES[c.platform] ?? c.platform}</h2><ConnectionToggles id={c.id} autoAccept={c.autoAccept} active={c.active} /></div>
          {c.platform === "kiosk" ? (
            <div className="flex flex-wrap items-center gap-5">
              {qr && <div className="size-[148px] shrink-0 rounded-xl border border-line bg-white p-1" data-testid="kiosk-qr" dangerouslySetInnerHTML={{ __html: qr }} />}
              <div className="space-y-1 text-sm">
                <p><b>QR menü:</b> masalara koyacağın kod bu; telefonla açan müşteri kendi siparişini verir.</p>
                <p>Menü adresi: <code className="break-all rounded bg-surface-2 px-1">{menuUrl}</code></p>
                <p className="text-muted">Siparişler yukarıdaki hatta “Kiosk / QR” olarak düşer; otomatik kabulü yukarıdan açabilirsin. Kod sızdırılırsa bağlantıyı kapat, yenisini aç.</p>
              </div>
            </div>
          ) : (
          <>
          <div className="space-y-1 text-sm">
            <div>Webhook adresi: <code className="break-all rounded bg-surface-2 px-1">{`${origin}/api/platform/${c.platform}/webhook?t=${c.webhookToken}`}</code></div>
            <div>İmza anahtarı (HMAC-SHA256, <code>x-signature</code>): <code className="break-all rounded bg-surface-2 px-1" data-testid="webhook-secret">{c.webhookSecret}</code></div>
          </div>
          {c.platform === "mock" && <TestOrderButton connectionId={c.id} />}
          {c.platform !== "kiosk" && <PushCatalogButton connectionId={c.id} />}
          <div>
            <h3 className="mb-2 text-sm font-semibold">Ürün kodu eşleme</h3>
            <p className="mb-3 text-sm text-muted">Eşlenmeyen kod siparişe platformdaki ad ve fiyatla serbest satır olarak düşer.</p>
            <CodeForm connectionId={c.id} products={products} />
            <ul className="mt-3 divide-y divide-line text-sm">
              {codes.filter((k) => k.platform === c.platform && k.storeId === c.storeId).map((k) => (
                <li key={k.id} className="flex items-center gap-3 py-1.5"><code className="w-40">{k.code}</code><span>{k.product}</span>
                  <form action={deleteCode.bind(null, k.id)} className="ml-auto"><button className="text-xs text-bad underline">Sil</button></form></li>
              ))}
            </ul>
          </div>
          </>
          )}
        </Card>
        );
      }))}
    </>
  );
}
