import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, MessageCircle, Repeat2, Target, TrendingUp } from "lucide-react";
import { and, desc, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { createCampaignDraft } from "@/lib/admin/growth-actions";
import { salesContact } from "@/lib/billing/plans";
import { GROWTH_SEGMENTS, isGrowthSegment, type GrowthSegment } from "@/lib/growth/segments";
import { buildFeaturePack } from "@/lib/growth/feature-pack";
import { advise } from "@/lib/growth/provider";
import { Badge, buttonClass, Card, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
const dormantSince = sql<Date>`now() - interval '30 days'`;
const maskPhone = (phone: string) => `${phone.slice(0, 4)}••••${phone.slice(-2)}`;
const tl = (k: number) => `${(k / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;

const modules = [
  { icon: Repeat2, title: "Geri kazanım listeleri", text: "30 gündür gelmeyen müşterileri bul, doğru zamanda tekrar davet et." },
  { icon: MessageCircle, title: "Kampanya gönderimi", text: "Hazır mesaj şablonlarıyla WhatsApp, SMS veya e-posta kampanyaları oluştur." },
  { icon: Target, title: "Dönüşüm takibi", text: "Hangi kampanya kaç sipariş ve ne kadar ciro getirdiğini ölç." },
];

export default async function Buyume({ searchParams }: { searchParams: Promise<{ olusturuldu?: string; hata?: string; segment?: string }> }) {
  const a = await requireAdmin();
  if (a.vertical !== "restoran") notFound();
  const sp = await searchParams;
  const contact = salesContact();
  const segment: GrowthSegment = sp.segment && isGrowthSegment(sp.segment) ? sp.segment : "dormant_30";
  const { campaigns, targetCount, targetPreview, avgPackage, featurePack } = await withTenant(a.tenantId, async (tx) => {
    const audienceWhere = segment === "dormant_30"
      ? and(eq(schema.customers.marketingConsent, true), isNotNull(schema.customers.lastOrderAt), lt(schema.customers.lastOrderAt, dormantSince))
      : segment === "active_30"
        ? and(eq(schema.customers.marketingConsent, true), gte(schema.customers.lastOrderAt, dormantSince))
        : eq(schema.customers.marketingConsent, true);
    const [campaigns, targets, preview, average, totalCustomers, consentedCustomers, activeCustomers, dormantCustomers, consentedDormantCustomers, newCustomers, campaignEvents] = await Promise.all([
      tx.select({ id: schema.growthCampaigns.id, name: schema.growthCampaigns.name, message: schema.growthCampaigns.message, audienceCount: schema.growthCampaigns.audienceCount, createdAt: schema.growthCampaigns.createdAt }).from(schema.growthCampaigns).where(eq(schema.growthCampaigns.status, "taslak")).orderBy(desc(schema.growthCampaigns.createdAt)).limit(10),
      tx.select({ n: sql<number>`count(*)::int` }).from(schema.customers).where(audienceWhere),
      tx.select({ name: schema.customers.name, phone: schema.customers.phone, lastOrderAt: schema.customers.lastOrderAt }).from(schema.customers).where(audienceWhere).orderBy(schema.customers.lastOrderAt).limit(8),
      tx.select({ orders: sql<number>`count(*)::int`, gross: sql<number>`coalesce(sum(${schema.sales.total}), 0)::int`, value: sql<number>`coalesce(avg(${schema.sales.total}), 0)::int` }).from(schema.sales).where(and(eq(schema.sales.channel, "paket"), eq(schema.sales.status, "kapandi"), gte(schema.sales.createdAt, sql`now() - interval '90 days'`))),
      tx.select({ n: sql<number>`count(*)::int` }).from(schema.customers),
      tx.select({ n: sql<number>`count(*)::int` }).from(schema.customers).where(eq(schema.customers.marketingConsent, true)),
      tx.select({ n: sql<number>`count(*)::int` }).from(schema.customers).where(gte(schema.customers.lastOrderAt, dormantSince)),
      tx.select({ n: sql<number>`count(*)::int` }).from(schema.customers).where(and(isNotNull(schema.customers.lastOrderAt), lt(schema.customers.lastOrderAt, dormantSince))),
      tx.select({ n: sql<number>`count(*)::int` }).from(schema.customers).where(and(eq(schema.customers.marketingConsent, true), isNotNull(schema.customers.lastOrderAt), lt(schema.customers.lastOrderAt, dormantSince))),
      tx.select({ n: sql<number>`count(*)::int` }).from(schema.customers).where(gte(schema.customers.createdAt, dormantSince)),
      tx.select({ sent: sql<number>`count(*) filter (where ${schema.growthCampaignEvents.type} = 'sent')::int`, delivered: sql<number>`count(*) filter (where ${schema.growthCampaignEvents.type} = 'delivered')::int`, converted: sql<number>`count(*) filter (where ${schema.growthCampaignEvents.type} = 'converted')::int`, revenue: sql<number>`coalesce(sum(${schema.growthCampaignEvents.amount}) filter (where ${schema.growthCampaignEvents.type} = 'converted'), 0)::int` }).from(schema.growthCampaignEvents),
    ]);
    const pack = buildFeaturePack({ generatedAt: new Date().toISOString(), vertical: a.vertical, customer: { total: totalCustomers[0]?.n ?? 0, consented: consentedCustomers[0]?.n ?? 0, active30: activeCustomers[0]?.n ?? 0, dormant30: dormantCustomers[0]?.n ?? 0, consentedDormant30: consentedDormantCustomers[0]?.n ?? 0, new30: newCustomers[0]?.n ?? 0 }, package90: { orders: average[0]?.orders ?? 0, gross: average[0]?.gross ?? 0, avgBasket: average[0]?.value ?? 0 }, campaigns: { drafts: campaigns.length, events: { sent: campaignEvents[0]?.sent ?? 0, delivered: campaignEvents[0]?.delivered ?? 0, converted: campaignEvents[0]?.converted ?? 0, revenue: campaignEvents[0]?.revenue ?? 0 } } });
    return { campaigns, targetCount: targets[0]?.n ?? 0, targetPreview: preview, avgPackage: average[0]?.value ?? 0, featurePack: pack };
  });
  const advice = await advise(featurePack);
  return (
    <>
      <PageHeader
        title="Büyüme Merkezi"
        desc="ÇabukPOS işletmeni çalıştırır; Büyüme Merkezi müşteriyi geri getirir."
        actions={<Badge tone="brand">Ek hizmet · Yakında</Badge>}
      />
      <Card className="mb-6 overflow-hidden border-brand/20 bg-gradient-to-br from-brand-soft via-white to-white p-6 md:p-8">
        <div className="max-w-2xl">
          <div className="mb-3 grid size-11 place-items-center rounded-xl bg-brand text-white"><TrendingUp aria-hidden className="size-6" /></div>
          <h2 className="text-xl font-semibold tracking-tight">Daha çok tekrar siparişi, daha az boşa giden müşteri</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-ink-2">Büyüme Merkezi, ÇabukPOS’taki satış ve müşteri verisini aksiyona çevirir. Müşteri kaydını dışarı taşımadan segmentleri bulur, kampanyayı ölçer ve hangi teklifin işe yaradığını gösterir.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/yonetim/musteriler" className={buttonClass("secondary")}><Target aria-hidden className="size-4" />Müşteri fırsatlarını gör</Link>
            {contact && <a href={`mailto:${contact}`} className={buttonClass("primary")}><MessageCircle aria-hidden className="size-4" />Erken erişim iste</a>}
          </div>
        </div>
      </Card>
      <div className="grid gap-4 md:grid-cols-3">
        {modules.map(({ icon: Icon, title, text }) => <Card key={title} className="p-5"><Icon aria-hidden className="size-5 text-brand" /><h2 className="mt-4 font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-muted">{text}</p></Card>)}
      </div>
      <Card className="mt-6 p-5"><div className="flex flex-wrap items-baseline justify-between gap-2"><div><h2 className="font-semibold">Veri içgörüleri</h2><p className="mt-1 text-sm text-muted">{advice.provider === "laya" ? "Laya’nın doğrulanmış feature-pack analizi." : "Kanıtlı baseline advisor; Laya bağlantısı hazır olduğunda otomatik devralır."}</p></div><Badge tone={advice.provider === "laya" ? "brand" : "neutral"}>{advice.provider === "laya" ? "Laya" : advice.fallback === "remote_error" ? "Fallback" : "Baseline"}</Badge></div><div className="mt-4 grid gap-3 md:grid-cols-3">{advice.insights.map((i) => <div key={i.key} className={`rounded-xl border p-4 ${i.kind === "opportunity" ? "border-brand/30 bg-brand-soft" : i.kind === "warning" ? "border-amber-200 bg-warn-soft" : "border-line bg-surface-2"}`}><div className="text-xs font-semibold uppercase tracking-wide text-muted">{i.kind === "opportunity" ? "Fırsat" : i.kind === "warning" ? "Veri kapısı" : "Gözlem"}</div><h3 className="mt-2 font-medium">{i.title}</h3><p className="mt-1 text-sm leading-5 text-ink-2">{i.body}</p></div>)}</div></Card>
      {sp.olusturuldu && <Card className="mt-6 border-emerald-200 bg-ok-soft p-4 text-sm text-ok" role="status">Kampanya taslağı kaydedildi. Henüz hiçbir mesaj gönderilmedi.</Card>}
      {sp.hata && <Card className="mt-6 border-red-200 bg-bad-soft p-4 text-sm text-bad" role="alert">Kampanya adı en az 2, mesajı en az 5 karakter olmalı.</Card>}
      <Card className="mt-6 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><div><h2 className="font-semibold">İlk kampanya taslağı</h2><p className="mt-1 text-sm text-muted">Seçtiğin segment ve iletişim iznine göre hazırlanır.</p></div><Badge tone="warn">Gönderim kapalı</Badge></div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
          <form action={createCampaignDraft} className="grid gap-3 content-start md:grid-cols-[1fr_2fr_auto] lg:grid-cols-1">
          <input type="hidden" name="segment" value={segment} />
          <label className="text-sm"><span className="mb-1.5 block font-medium">Kampanya adı</span><input name="name" required minLength={2} maxLength={80} placeholder="30 gün geri kazanım" className="min-h-11 w-full rounded-[10px] border border-line px-3 py-2 outline-none focus:border-brand focus:ring-4 focus:ring-brand-ring/50" /></label>
          <label className="text-sm"><span className="mb-1.5 block font-medium">Mesaj taslağı</span><input name="message" required minLength={5} maxLength={500} placeholder="Sizi özledik…" className="min-h-11 w-full rounded-[10px] border border-line px-3 py-2 outline-none focus:border-brand focus:ring-4 focus:ring-brand-ring/50" /></label>
          <button className={buttonClass("primary")}>Taslağı kaydet</button>
          </form>
          <div className="rounded-xl border border-line bg-surface-2 p-4 text-sm">
            <div className="mb-3 flex flex-wrap gap-2">{Object.entries(GROWTH_SEGMENTS).map(([key, value]) => <a key={key} href={`/yonetim/buyume?segment=${key}`} className={`rounded-lg border px-3 py-2 text-xs ${segment === key ? "border-brand bg-brand-soft font-medium text-brand" : "border-line bg-white text-ink-2 hover:bg-surface-3"}`}>{value.label}</a>)}</div>
            <div className="flex flex-wrap items-baseline justify-between gap-2"><b>Hedef önizleme</b><span className="text-muted">{GROWTH_SEGMENTS[segment].label} · {targetCount} kişi</span></div>
            {targetPreview.length > 0 ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{targetPreview.map((c) => <div key={c.phone} className="rounded-lg border border-line bg-white px-3 py-2"><div className="font-medium">{c.name}</div><div className="text-xs text-muted">{maskPhone(c.phone)} · son sipariş {c.lastOrderAt?.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" })}</div></div>)}</div> : <p className="mt-3 text-muted">Henüz izinli ve 30 gündür gelmeyen müşteri yok.</p>}
            <div className="mt-4 border-t border-line pt-3 text-xs text-muted">Gözlenen veri: son 90 gün paket ortalaması <b className="text-ink-2">{tl(avgPackage)}</b>, izinli hedef <b className="text-ink-2">{targetCount}</b>. Henüz kampanya sonucu olmadığı için ek ciro vaadi üretilmiyor; yeterli sonuç birikince Laya kanıtlı bir tahmin aralığı çıkaracak.</div>
          </div>
        </div>
      </Card>
      {campaigns.length > 0 && <Card className="mt-6 overflow-hidden"><div className="border-b border-line px-5 py-4"><h2 className="font-semibold">Taslaklar</h2></div><div className="divide-y divide-line">{campaigns.map((c) => <Link key={c.id} href={`/yonetim/buyume/${c.id}`} className="flex flex-wrap items-baseline gap-3 px-5 py-4 text-sm hover:bg-surface-2"><span className="font-medium">{c.name}</span><span className="text-muted">{c.message}</span><span className="ml-auto text-xs text-muted">Hedef: {c.audienceCount} · {c.createdAt.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" })}</span></Link>)}</div></Card>}
      <div className="mt-6 rounded-[14px] border border-line bg-surface-2 p-4 text-sm text-ink-2"><b>İlk fırsat:</b> Müşteriler ekranındaki 30 gündür gelmeyen müşteri sayısından başlayabilirsin. Tam kampanya ve gönderim özellikleri ayrı Büyüme Merkezi hizmeti olarak açılacak.<ArrowRight aria-hidden className="ml-1 inline size-4" /></div>
    </>
  );
}
