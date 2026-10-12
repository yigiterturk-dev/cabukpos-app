import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { approveCampaign, sendCampaignPageAction } from "@/lib/admin/growth-actions";
import { campaignMetrics } from "@/lib/growth/metrics";
import { marketingSmsEnabled } from "@/lib/growth/messaging";
import { Badge, Card, PageHeader, buttonClass } from "@/components/ui";

export const dynamic = "force-dynamic";
const tl = (k: number) => `${(k / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;
const pct = (n: number | null) => n === null ? "—" : `${(n * 100).toFixed(1).replace(".", ",")}%`;

const HATA: Record<string, string> = {
  saglayici: "SMS sağlayıcısı yapılandırılmadı (MARKETING_SMS_ENABLED). Canlı hesap açılınca gönderim açılır.",
  campaign_not_found: "Kampanya bulunamadı.",
  not_approved: "Önce işletme sahibi onayı gerekli.",
  provider_error: "Sağlayıcı hatası: gönderim yarıda kaldı, tekrar deneyin.",
};

export default async function CampaignDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const a = await requireAdmin();
  if (a.vertical !== "restoran") notFound();
  const { id } = await params;
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) as string | undefined;
  const data = await withTenant(a.tenantId, async (tx) => {
    const [campaign] = await tx.select({ id: schema.growthCampaigns.id, name: schema.growthCampaigns.name, segment: schema.growthCampaigns.segment, message: schema.growthCampaigns.message, audienceCount: schema.growthCampaigns.audienceCount, approvedAt: schema.growthCampaigns.approvedAt, createdAt: schema.growthCampaigns.createdAt }).from(schema.growthCampaigns).where(and(eq(schema.growthCampaigns.id, id), eq(schema.growthCampaigns.tenantId, a.tenantId))).limit(1);
    if (!campaign) return null;
    const events = await tx.select({ type: schema.growthCampaignEvents.type, amount: schema.growthCampaignEvents.amount }).from(schema.growthCampaignEvents).where(and(eq(schema.growthCampaignEvents.campaignId, id), eq(schema.growthCampaignEvents.tenantId, a.tenantId))).orderBy(desc(schema.growthCampaignEvents.at));
    return { campaign, metrics: campaignMetrics(events.map((e) => ({ type: e.type, amount: e.amount }))) };
  });
  if (!data) notFound();
  const { campaign, metrics } = data;
  const cards = [
    ["Gönderildi", metrics.sent], ["Ulaştı", metrics.delivered], ["Dönüşüm", metrics.converted], ["Ek ciro", tl(metrics.revenue)],
  ];
  return (
    <>
      <PageHeader title={campaign.name} desc={`Segment: ${campaign.segment} · Hedef: ${campaign.audienceCount} kişi`} actions={<Link href="/yonetim/buyume" className={buttonClass("secondary")}>← Büyüme Merkezi</Link>} />
      {one("gonderildi") !== undefined && (
        <div data-testid="send-ok" className="mb-6 rounded-[14px] border border-ok/25 bg-ok-soft p-3 text-sm text-ok print:hidden">
          {one("gonderildi")} mesaj gönderildi{one("basarisiz") ? `, ${one("basarisiz")} başarısız` : ""}{Number(one("kalan")) > 0 ? ` · ${one("kalan")} kişi kaldı — tekrar Gönder ile sürdürün` : " · hedef liste tamamlandı"}.
        </div>
      )}
      {one("hata") && (
        <div data-testid="send-error" className="mb-6 rounded-[14px] border border-bad/25 bg-bad-soft p-3 text-sm text-bad print:hidden">
          {HATA[one("hata") ?? ""] ?? "Gönderim tamamlanamadı."}
        </div>
      )}
      <Card className="mb-6 p-5"><div className="flex flex-wrap items-center gap-3"><Badge tone={campaign.approvedAt ? "ok" : "warn"}>{campaign.approvedAt ? "İşletme sahibi onayladı" : "Onay bekliyor"}</Badge><span className="text-sm text-muted">Onay olmadan hedef listesi açılmaz ve hiçbir mesaj gönderilemez.</span>{!campaign.approvedAt && a.role === "sahip" && <form action={approveCampaign}><input type="hidden" name="campaignId" value={campaign.id} /><button className={buttonClass("primary")}>Hedef kitleyi onayla</button></form>}
        {campaign.approvedAt && a.role === "sahip" && marketingSmsEnabled() && (
          <form action={sendCampaignPageAction}><input type="hidden" name="campaignId" value={campaign.id} /><button className={buttonClass("primary")} data-testid="send-campaign">Gönder (SMS)</button></form>
        )}
        {campaign.approvedAt && a.role === "sahip" && !marketingSmsEnabled() && <span className="text-xs text-muted">Gönderim için SMS hesabı bağlanınca “Gönder” burada görünür.</span>}
      </div><p className="mt-4 max-w-2xl text-sm leading-6">{campaign.message}</p></Card>
      <section aria-label="Kampanya ölçümleri" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label, value]) => <Card key={String(label)} className="p-4"><div className="text-sm text-muted">{label}</div><div className="mt-1 text-2xl font-semibold tabular">{value}</div></Card>)}</section>
      <Card className="mt-6 p-5"><h2 className="font-semibold">Kanıtlı oranlar</h2><div className="mt-3 grid gap-3 text-sm sm:grid-cols-3"><div><span className="text-muted">Ulaşma oranı</span><b className="ml-2">{pct(metrics.deliveryRate)}</b></div><div><span className="text-muted">Dönüşüm oranı</span><b className="ml-2">{pct(metrics.conversionRate)}</b></div><div><span className="text-muted">Opt-out oranı</span><b className="ml-2">{pct(metrics.optOutRate)}</b></div></div>{metrics.sent === 0 && <p className="mt-4 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">Henüz sonuç olayı yok. Veri birikmeden tahmin üretilmez.</p>}</Card>
    </>
  );
}
