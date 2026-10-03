import { PageHeader, Panel, Card } from "@/components/ui";
import { TemaSecimi, SesToggle } from "@/components/admin/Preferences";

export const dynamic = "force-dynamic";

export const metadata = { title: "Tercihler — ÇabukPOS" };

export default function Tercihler() {
  return (
    <>
      <PageHeader title="Tercihler" desc="Görünüm ve uyarı ayarları bu cihazda saklanır; cihaz başına ayrı geçerlidir." />
      <div className="grid max-w-3xl gap-4">
        <Panel title="Tema">
          <TemaSecimi />
          <p className="mt-3 text-sm text-muted">Sistem seçiliyken işletim sisteminin koyu moduna uyar. Yazdırma her zaman açık kâğıtta yapılır.</p>
        </Panel>
        <Panel title="Kasa uyarı sesi">
          <SesToggle />
          <p className="mt-3 text-sm text-muted">Kapalıyken yeni platform siparişi ve hazırlık uyarıları sessiz gelir; ekrandaki rozetler aynen çalışır.</p>
        </Panel>
        <Card className="p-4 text-sm text-muted">Bildirimler sayfası: bekleyen sipariş, gecikme, mali belge hatası ve inceleme kayıtlarını toplar — <b className="text-ink-2">Genel → Bildirimler</b>.</Card>
      </div>
    </>
  );
}
