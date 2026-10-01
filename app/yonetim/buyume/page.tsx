import Link from "next/link";
import { ArrowRight, MessageCircle, Repeat2, Target, TrendingUp } from "lucide-react";
import { desc, eq } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { createCampaignDraft } from "@/lib/admin/growth-actions";
import { salesContact } from "@/lib/billing/plans";
import { Badge, buttonClass, Card, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const modules = [
  { icon: Repeat2, title: "Geri kazanım listeleri", text: "30 gündür gelmeyen müşterileri bul, doğru zamanda tekrar davet et." },
  { icon: MessageCircle, title: "Kampanya gönderimi", text: "Hazır mesaj şablonlarıyla WhatsApp, SMS veya e-posta kampanyaları oluştur." },
  { icon: Target, title: "Dönüşüm takibi", text: "Hangi kampanya kaç sipariş ve ne kadar ciro getirdiğini ölç." },
];

export default async function Buyume({ searchParams }: { searchParams: Promise<{ olusturuldu?: string; hata?: string }> }) {
  const a = await requireAdmin();
  const sp = await searchParams;
  const contact = salesContact();
  const campaigns = await withTenant(a.tenantId, (tx) => tx.select({ id: schema.growthCampaigns.id, name: schema.growthCampaigns.name, message: schema.growthCampaigns.message, audienceCount: schema.growthCampaigns.audienceCount, createdAt: schema.growthCampaigns.createdAt }).from(schema.growthCampaigns).where(eq(schema.growthCampaigns.status, "taslak")).orderBy(desc(schema.growthCampaigns.createdAt)).limit(10));
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
      {sp.olusturuldu && <Card className="mt-6 border-emerald-200 bg-ok-soft p-4 text-sm text-ok" role="status">Kampanya taslağı kaydedildi. Henüz hiçbir mesaj gönderilmedi.</Card>}
      {sp.hata && <Card className="mt-6 border-red-200 bg-bad-soft p-4 text-sm text-bad" role="alert">Kampanya adı en az 2, mesajı en az 5 karakter olmalı.</Card>}
      <Card className="mt-6 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><div><h2 className="font-semibold">İlk kampanya taslağı</h2><p className="mt-1 text-sm text-muted">30 gündür gelmeyen ve iletişim izni bulunan müşteriler için hazırlanır.</p></div><Badge tone="warn">Gönderim kapalı</Badge></div>
        <form action={createCampaignDraft} className="mt-4 grid gap-3 md:grid-cols-[1fr_2fr_auto] md:items-end">
          <label className="text-sm"><span className="mb-1.5 block font-medium">Kampanya adı</span><input name="name" required minLength={2} maxLength={80} placeholder="30 gün geri kazanım" className="min-h-11 w-full rounded-[10px] border border-line px-3 py-2 outline-none focus:border-brand focus:ring-4 focus:ring-brand-ring/50" /></label>
          <label className="text-sm"><span className="mb-1.5 block font-medium">Mesaj taslağı</span><input name="message" required minLength={5} maxLength={500} placeholder="Sizi özledik…" className="min-h-11 w-full rounded-[10px] border border-line px-3 py-2 outline-none focus:border-brand focus:ring-4 focus:ring-brand-ring/50" /></label>
          <button className={buttonClass("primary")}>Taslağı kaydet</button>
        </form>
      </Card>
      {campaigns.length > 0 && <Card className="mt-6 overflow-hidden"><div className="border-b border-line px-5 py-4"><h2 className="font-semibold">Taslaklar</h2></div><div className="divide-y divide-line">{campaigns.map((c) => <div key={c.id} className="flex flex-wrap items-baseline gap-3 px-5 py-4 text-sm"><span className="font-medium">{c.name}</span><span className="text-muted">{c.message}</span><span className="ml-auto text-xs text-muted">Hedef: {c.audienceCount} · {c.createdAt.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" })}</span></div>)}</div></Card>}
      <div className="mt-6 rounded-[14px] border border-line bg-surface-2 p-4 text-sm text-ink-2"><b>İlk fırsat:</b> Müşteriler ekranındaki 30 gündür gelmeyen müşteri sayısından başlayabilirsin. Tam kampanya ve gönderim özellikleri ayrı Büyüme Merkezi hizmeti olarak açılacak.<ArrowRight aria-hidden className="ml-1 inline size-4" /></div>
    </>
  );
}
