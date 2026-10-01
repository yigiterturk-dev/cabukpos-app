import Link from "next/link";
import { ArrowRight, MessageCircle, Repeat2, Target, TrendingUp } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { salesContact } from "@/lib/billing/plans";
import { Badge, buttonClass, Card, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const modules = [
  { icon: Repeat2, title: "Geri kazanım listeleri", text: "30 gündür gelmeyen müşterileri bul, doğru zamanda tekrar davet et." },
  { icon: MessageCircle, title: "Kampanya gönderimi", text: "Hazır mesaj şablonlarıyla WhatsApp, SMS veya e-posta kampanyaları oluştur." },
  { icon: Target, title: "Dönüşüm takibi", text: "Hangi kampanya kaç sipariş ve ne kadar ciro getirdiğini ölç." },
];

export default async function Buyume() {
  await requireAdmin();
  const contact = salesContact();
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
      <div className="mt-6 rounded-[14px] border border-line bg-surface-2 p-4 text-sm text-ink-2"><b>İlk fırsat:</b> Müşteriler ekranındaki 30 gündür gelmeyen müşteri sayısından başlayabilirsin. Tam kampanya ve gönderim özellikleri ayrı Büyüme Merkezi hizmeti olarak açılacak.<ArrowRight aria-hidden className="ml-1 inline size-4" /></div>
    </>
  );
}
