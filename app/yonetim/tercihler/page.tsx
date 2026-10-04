import { PageHeader, Panel, Card } from "@/components/ui";
import { TemaSecimi, SesToggle } from "@/components/admin/Preferences";
import { CurrencySecimi } from "@/components/admin/CurrencySecimi";
import { InstallButton } from "@/components/InstallButton";
import { LangSecimi } from "@/components/admin/LangSecimi";
import { getLang } from "@/lib/admin/lang";
import { requireAdmin } from "@/lib/auth/session";
import { tenantCurrency } from "@/lib/admin/currency";
import { tf } from "@/lib/core/i18n";

export const dynamic = "force-dynamic";

export const metadata = { title: "Tercihler — ÇabukPOS" };

export default async function Tercihler() {
  const lang = await getLang();
  const tt = tf(lang);
  const currency = await tenantCurrency((await requireAdmin()).tenantId);
  return (
    <>
      <PageHeader title={tt("tercihler")} desc={tt("tercihDesc")} />
      <div className="grid max-w-3xl gap-4">
        <Panel title="Para birimi">
          <CurrencySecimi currency={currency} />
          <p className="mt-3 text-sm text-muted">{lang === "en" ? "Applies to admin panels and reports; existing records are not converted." : "Yönetim panellerinde ve raporlarda geçerli; mevcut kayıtlar dönüştürülmez."}</p>
        </Panel>
        <Panel title={tt("dil")}>
          <LangSecimi lang={lang} />
          <p className="mt-3 text-sm text-muted">{tt("dilHint")}</p>
        </Panel>
        <Panel title={tt("tema")}>
          <TemaSecimi />
          <p className="mt-3 text-sm text-muted">{tt("temaHint")}</p>
        </Panel>
        <Panel title={tt("kasaSesi")}>
          <SesToggle />
          <p className="mt-3 text-sm text-muted">{tt("kasaSesiHint")}</p>
        </Panel>
        <Card className="p-4 text-sm text-muted">{lang === "en" ? "Notifications page: pending orders, delays, fiscal document errors and review records — " : "Bildirimler sayfası: bekleyen sipariş, gecikme, mali belge hatası ve inceleme kayıtlarını toplar — "}<b className="text-ink-2">{lang === "en" ? "General → Notifications" : "Genel → Bildirimler"}</b>.</Card>
        <Panel title={tt("uygulamaKur")}>
          <div className="flex flex-wrap items-center gap-3">
            <InstallButton />
            <p className="text-sm text-muted">{tt("uygulamaKurHint")}</p>
          </div>
        </Panel>
      </div>
    </>
  );
}
