import Link from "next/link";
import { Download, ShieldCheck } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { seesAllStores } from "@/lib/core/access";
import { veriSayaci } from "@/lib/core/veri";
import { HesapSilFormu } from "@/components/admin/HesapSilFormu";
import { buttonClass, Card, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Veriler() {
  const a = await requireAdmin();
  if (!seesAllStores(a)) redirect("/yonetim");
  const sayac = await veriSayaci(a.tenantId);
  return (
    <>
      <PageHeader title="Veri yönetimi" desc="İşletmenizin taşınabilir veri kopyasını oluşturun, kayıtları görün." />
      <Card className="max-w-2xl p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand"><Download aria-hidden className="size-5" /></span>
          <div>
            <h2 className="font-semibold">İşletme verilerini indir</h2>
            <p className="mt-1 text-sm text-ink-2">Ürünler, satışlar, stok, personel, mali belgeler ve ayarlar JSON dosyası olarak indirilir. Şifre, PIN, cihaz jetonu ve entegrasyon sırları dahil edilmez.</p>
            {a.role === "sahip" ? (
              <Link href="/api/yonetim/veri-export" className={`${buttonClass("primary")} mt-4`}><Download aria-hidden className="size-4" />Veri kopyasını indir</Link>
            ) : <p className="mt-4 text-sm text-muted">Bu işlem yalnız işletme sahibine açıktır.</p>}
          </div>
        </div>
        <div className="mt-5 flex items-start gap-2 rounded-lg bg-ok-soft px-3 py-2.5 text-xs text-ink-2"><ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-ok" />Dosya yalnızca oturumunuz açıkken oluşturulur ve yanıt cache&apos;lenmez.</div>
      </Card>

      <Card className="mt-4 max-w-2xl p-5">
        <h2 className="font-semibold">Sistemde tutulan kayıtlar</h2>
        <p className="mt-1 text-sm text-ink-2">Hesabınız silinirse bu kayıtlar da kalıcı olarak silinir.</p>
        <dl className="mt-4 grid gap-2 sm:grid-cols-2">
          {Object.entries(sayac).map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between rounded-lg border border-line px-3 py-2">
              <dt className="text-sm text-muted">{k}</dt>
              <dd className="font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {a.role === "sahip" && <div className="max-w-2xl"><HesapSilFormu isletmeAdi={a.tenantName} /></div>}
    </>
  );
}
