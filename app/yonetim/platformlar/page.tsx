import { headers } from "next/headers";
import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { scopedStoreId } from "@/lib/admin/store-scope";
import { getDb, schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { acceptPlatformOrder, deleteCode, rejectPlatformOrder } from "@/lib/admin/delivery-actions";
import { PLATFORM_NAMES } from "@/lib/core/platform";
import { CONNECTABLE_PLATFORMS } from "@/lib/platform";
import QRCode from "qrcode";
import { foldTabs, type TabState } from "@/lib/core/tab";
import { initialEvents } from "@/lib/tabs/stream";
import { moneyFormatter } from "@/lib/admin/currency";
import { CodeForm, ConnectionForm, ConnectionToggles, PushCatalogButton, TestOrderButton } from "@/components/admin/DeliveryForms";
import { WebhookCredentials } from "@/components/admin/WebhookCredentials";
import { ConfirmActionForm } from "@/components/admin/ConfirmActionForm";
import { PlatformOrderAction } from "@/components/admin/PlatformOrderAction";
import { Card, Empty, PageHeader, TABLE_HEAD } from "@/components/ui";
import { HorizontalScrollRegion } from "@/components/HorizontalScrollRegion";

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
  t.closed || t.delivery.deliveredAt ? { label: "Teslim", cls: "bg-ok-soft text-ok" }
  : t.delivery.outAt ? { label: "Kuryede", cls: "bg-brand-action text-white" }
  : gecikti(t) ? { label: `Gecikti · hedef ${t.delivery.prepMin} dk`, cls: "bg-warn-soft text-warn" }
  : t.delivery.acceptedAt ? { label: `Hazırlanıyor${t.delivery.prepMin ? ` · ${t.delivery.prepMin} dk` : ""}`, cls: "bg-espresso text-white" }
  : { label: "Onay bekliyor", cls: "bg-warn-soft text-warn" };
const cizelge = (t: TabState) =>
  [t.delivery.acceptedAt ? `kabul ${saat(t.delivery.acceptedAt)}` : "", t.delivery.outAt ? `yolda ${saat(t.delivery.outAt)}` : "", t.delivery.deliveredAt ? `teslim ${saat(t.delivery.deliveredAt)}` : ""].filter(Boolean).join(" · ");

function PaketHatti({ acik, teslim, money }: { acik: TabState[]; teslim: number; money: (k: number) => string }) {
  const gruplar = new Map<string, TabState[]>();
  for (const t of acik) {
    const p = platformEtiket(t);
    gruplar.set(p, [...(gruplar.get(p) ?? []), t]);
  }
  return (
    <Card className="mb-6 p-5" data-testid="paket-hatti">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 id="platform-orders-heading" tabIndex={-1} className="font-semibold">Canlı paket hattı</h2>
        {teslim > 0 && <span className="text-sm text-muted">bugün {teslim} teslim</span>}
        <a href="/yonetim/platformlar" className="ml-auto inline-flex min-h-11 items-center rounded-lg px-2.5 text-sm text-brand outline-none hover:bg-brand-soft hover:underline focus-visible:ring-4 focus-visible:ring-brand-ring/60">Yenile</a>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {gruplar.size === 0 && <span className="text-sm text-muted">Açık paket/platform siparişi yok.</span>}
        {[...gruplar.entries()].map(([p, ts]) => (
          <div key={p} className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2">
            <span className="text-sm font-medium">{p}</span>
            <span className="rounded-full bg-brand-action px-2 py-0.5 text-xs font-semibold text-white">{ts.length}</span>
          </div>
        ))}
      </div>
      {acik.length > 0 && (
        <>
        <div className="overflow-hidden rounded-xl border border-line lg:hidden">
          <ul aria-label="Platform siparişleri" className="divide-y divide-line">
            {acik.map((t) => {
              const dk = dkOnce(t.openedAt), durum = DURUM(t);
              return (
                <li key={t.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="font-semibold">{platformEtiket(t)}{t.order?.source?.externalId ? <span className="text-muted"> #{t.order.source.externalId.slice(-4)}</span> : null}</p><p className="mt-1 break-words text-sm">{t.order?.name ?? "—"}</p>{t.order?.phone && <a href={`tel:${t.order.phone}`} className="inline-flex min-h-11 items-center text-sm text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">{t.order.phone}</a>}</div>
                    <span className={`shrink-0 rounded px-2 py-1 text-xs font-medium ${durum.cls}`}>{durum.label}</span>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                    <div><dt className="text-xs text-muted">Sipariş</dt><dd>{t.lines.filter((l) => !l.voided).length} ürün</dd></div>
                    <div><dt className="text-xs text-muted">Tutar</dt><dd className="tabular font-semibold">{money(t.total)}</dd></div>
                    <div><dt className="text-xs text-muted">Bekleme</dt><dd>{dk} dk</dd></div>
                    <div><dt className="text-xs text-muted">Zaman çizelgesi</dt><dd className="break-words text-xs text-muted">{cizelge(t) || "Henüz işlem yok"}</dd></div>
                  </dl>
                  {!t.closed && !t.delivery.acceptedAt && !t.delivery.rejected && !t.delivery.cancelled && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2">
                      <PlatformOrderAction action={acceptPlatformOrder.bind(null, t.id)} label="Onayla" pendingLabel="Onaylanıyor…" className="inline-flex min-h-11 items-center rounded-lg border border-brand/25 bg-brand-soft px-3 text-sm font-medium text-brand outline-none hover:bg-brand-action/10 focus-visible:ring-4 focus-visible:ring-brand-ring/60" />
                      <details className="relative">
                        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-lg border border-bad/20 px-3 text-sm text-bad outline-none hover:bg-bad-soft focus-visible:ring-4 focus-visible:ring-bad/20">Reddet</summary>
                        <div className="mt-1"><PlatformOrderAction action={rejectPlatformOrder.bind(null, t.id, "yönetim reddi")} label="Reddi onayla" pendingLabel="Reddediliyor…" className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 text-xs font-medium text-bad outline-none hover:bg-bad-soft focus-visible:ring-4 focus-visible:ring-bad/20" /></div>
                      </details>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
        <HorizontalScrollRegion label="Platform siparişleri, yatay kaydırılabilir" className="hidden rounded-xl border border-line lg:block">
          <table aria-label="Platform siparişleri" className="w-full min-w-[860px] text-sm">
            <thead className={TABLE_HEAD}>
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">Platform</th><th scope="col" className="px-4 py-2.5 font-medium">Müşteri</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Sipariş</th><th scope="col" className="px-4 py-2.5 font-medium">Tutar</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Durum</th><th scope="col" className="px-4 py-2.5 font-medium">Süre</th><th scope="col" className="px-4 py-2.5 font-medium">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {acik.map((t) => {
                const dk = dkOnce(t.openedAt);
                return (
                  <tr key={t.id} className="transition-colors hover:bg-surface-2">
                    <td className="px-4 py-2.5 font-medium">{platformEtiket(t)}{t.order?.source?.externalId ? <span className="text-muted"> #{t.order.source.externalId.slice(-4)}</span> : null}</td>
                    <td className="max-w-[14rem] px-4 py-2.5"><span className="block truncate" title={t.order?.name ?? "—"}>{t.order?.name ?? "—"}</span><span className="block text-xs text-muted">{t.order?.phone ?? ""}</span></td>
                    <td className="px-4 py-2.5 text-muted">{t.lines.filter((l) => !l.voided).length} ürün</td>
                    <td className="px-4 py-2.5 tabular font-semibold">{money(t.total)}</td>
                    <td className="px-4 py-2.5"><span className={`rounded px-1.5 py-0.5 text-xs font-medium ${DURUM(t).cls}`}>{DURUM(t).label}</span><span className="block text-[11px] text-muted">{cizelge(t)}</span></td>
                    <td className="px-4 py-2.5 text-muted">{dk} dk</td>
                    <td className="px-4 py-2.5">
                      {!t.closed && !t.delivery.acceptedAt && !t.delivery.rejected && !t.delivery.cancelled ? (
                        <div className="flex items-center gap-3">
                          <PlatformOrderAction action={acceptPlatformOrder.bind(null, t.id)} label="Onayla" pendingLabel="Onaylanıyor…" className="inline-flex min-h-11 items-center rounded-lg border border-brand/25 bg-brand-soft px-3 text-sm font-medium text-brand outline-none hover:bg-brand-action/10 focus-visible:ring-4 focus-visible:ring-brand-ring/60" />
                          {/* Reddet: yanlış basmaya karşı iki adım (details açılır, onay butonu çıkar) */}
                          <details className="relative">
                            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-lg border border-bad/20 px-3 text-sm text-bad outline-none hover:bg-bad-soft focus-visible:ring-4 focus-visible:ring-bad/20">Reddet</summary>
                            <div className="mt-1"><PlatformOrderAction action={rejectPlatformOrder.bind(null, t.id, "yönetim reddi")} label="Reddi onayla" pendingLabel="Reddediliyor…" className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 text-xs font-medium text-bad outline-none hover:bg-bad-soft focus-visible:ring-4 focus-visible:ring-bad/20" /></div>
                          </details>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </HorizontalScrollRegion>
        </>
      )}
      <p className="mt-3 text-sm text-muted">Onay, kurye ve teslim kasada <strong>Paket</strong> sekmesinden yapılır; bu ekran canlı izleme. Yeni sipariş kasaya sesli uyarıyla düşer.</p>
    </Card>
  );
}

export default async function Platformlar() {
  const a = await requireAdmin();
  const money = await moneyFormatter(a.tenantId);
  const P = schema.platformConnections;
  const conns = await getDb().select().from(P).where(eq(P.tenantId, a.tenantId)).orderBy(asc(P.createdAt));
  const [storeId, stores] = await withTenant(a.tenantId, (tx) => Promise.all([
    scopedStoreId(tx, a.tenantId),
    tx.select({ id: schema.stores.id, name: schema.stores.name }).from(schema.stores),
  ]));
  const storeNames = new Map(stores.map((s) => [s.id, s.name]));
  const [codes, products] = await withTenant(a.tenantId, (tx) => Promise.all([
    tx.select({ id: schema.productPlatformCodes.id, platform: schema.productPlatformCodes.platform, storeId: schema.productPlatformCodes.storeId, code: schema.productPlatformCodes.code, product: schema.products.name })
      .from(schema.productPlatformCodes).innerJoin(schema.products, eq(schema.products.id, schema.productPlatformCodes.productId)).orderBy(asc(schema.productPlatformCodes.code)),
    tx.select({ value: schema.products.id, label: schema.products.name }).from(schema.products).where(and(eq(schema.products.active, true))).orderBy(asc(schema.products.name)),
  ]));
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const hat = storeId ? [...foldTabs(await initialEvents({ tenantId: a.tenantId, storeId })).values()].filter((t) => t.kind !== "masa") : [];
  const acik = hat.filter((t) => !t.closed);
  const teslim = hat.filter((t) => {
    const at = t.closedAt ?? t.delivery.deliveredAt;
    return at && bugunMu(at);
  }).length;
  const free = CONNECTABLE_PLATFORMS.filter((p) => !conns.some((c) => c.storeId === storeId && c.platform === p)).map((p) => ({ value: p, label: PLATFORM_NAMES[p] ?? p }));
  return (
    <>
      <PageHeader title="Sipariş platformları" desc="Platform siparişleri kasada Paket sekmesine sesli uyarıyla düşer; kabul/red platforma bildirilir. Yemeksepeti ve Trendyol Go entegratör onayı gelince eklenecek." />
      <PaketHatti acik={acik} teslim={teslim} money={money} />
      {free.length > 0 && <Card className="mb-6 p-5">{storeId ? <ConnectionForm platforms={free} /> : <p className="text-sm text-muted">Platform bağlamak için önce <Link href="/yonetim/subeler" className="font-medium text-brand underline">bir şube oluşturun</Link>.</p>}</Card>}
      {conns.length === 0 ? <Empty>Henüz bağlı platform yok. Akışı denemek için Deneme platformunu bağlayın.</Empty> : await Promise.all(conns.map(async (c) => {
        const menuUrl = c.platform === "kiosk" ? `${origin}/menu/${c.storeId}?k=${c.webhookSecret}` : null;
        const qr = menuUrl ? await QRCode.toString(menuUrl, { type: "svg", margin: 1, width: 148 }) : null;
        return (
        <Card key={c.id} className="mb-6 space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-3"><h2 className="min-w-0 break-words font-semibold">{PLATFORM_NAMES[c.platform] ?? c.platform}<span className="ml-2 font-normal text-muted">· {storeNames.get(c.storeId) ?? "Şube bulunamadı"}</span></h2><div className="min-w-0 flex-1"><ConnectionToggles key={`${c.id}-${c.autoAccept}-${c.active}`} id={c.id} autoAccept={c.autoAccept} active={c.active} /></div></div>
          {c.platform === "kiosk" ? (
            <div className="flex flex-wrap items-center gap-5">
              {qr && <div className="size-[148px] shrink-0 rounded-xl border border-line bg-surface p-1" data-testid="kiosk-qr" dangerouslySetInnerHTML={{ __html: qr }} />}
              <div className="space-y-1 text-sm">
                <p><b>QR menü:</b> masalara koyacağın kod bu; telefonla açan müşteri kendi siparişini verir.</p>
                <p>Menü adresi: <code className="break-all rounded bg-surface-2 px-1">{menuUrl}</code></p>
                <p className="text-muted">Siparişler yukarıdaki hatta “Kiosk / QR” olarak düşer; otomatik kabulü yukarıdan açabilirsin. Kod sızdırılırsa bağlantıyı kapat, yenisini aç.</p>
              </div>
            </div>
          ) : (
          <>
          <WebhookCredentials url={`${origin}/api/platform/${c.platform}/webhook?t=${c.webhookToken}`} secret={c.webhookSecret} />
          {c.platform === "mock" && <TestOrderButton connectionId={c.id} />}
          {c.platform !== "kiosk" && <PushCatalogButton connectionId={c.id} />}
          <div>
            <h3 className="mb-2 text-sm font-semibold">Ürün kodu eşleme</h3>
            <p className="mb-3 text-sm text-muted">Eşlenmeyen kod siparişe platformdaki ad ve fiyatla serbest satır olarak düşer.</p>
            {products.length > 0 ? <CodeForm connectionId={c.id} products={products} /> : <p className="rounded-lg border border-line bg-surface-2 p-3 text-sm text-muted">Kod eşlemek için en az bir aktif ürün gerekli. <Link href="/yonetim/urunler" className="font-medium text-brand underline underline-offset-2">Ürün ekleyin veya satışa açın</Link>.</p>}
            <ul className="mt-3 divide-y divide-line text-sm">
              {codes.filter((k) => k.platform === c.platform && k.storeId === c.storeId).map((k) => (
                <li key={k.id} className="flex min-w-0 items-center gap-3 py-1.5"><code className="w-40 shrink-0 truncate" title={k.code}>{k.code}</code><span className="min-w-0 flex-1 truncate" title={k.product}>{k.product}</span>
                <ConfirmActionForm action={deleteCode.bind(null, k.id)} ariaLabel={`Sil: ${k.code} ürün kodu eşlemesi`} label="Sil" prompt={`“${k.code}” ürün kodu eşlemesi silinecek; bu kodla gelen siparişler ürüne otomatik bağlanmayacak. Devam etmek istiyor musunuz?`} className="ml-auto shrink-0 inline-flex min-h-11 items-center rounded-lg px-2.5 text-xs text-bad underline outline-none hover:bg-bad-soft focus-visible:ring-4 focus-visible:ring-bad/20" /></li>
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
