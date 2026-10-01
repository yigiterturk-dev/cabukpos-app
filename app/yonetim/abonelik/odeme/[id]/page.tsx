import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { formatTL } from "@/lib/core/money";
import { getBillingProvider } from "@/lib/billing/provider";
import { paymentOf } from "@/lib/billing/service";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PayTR ödeme formu (iframe). Sonuç sayfaya değil /api/billing/paytr bildirimine gelir.
export default async function PaytrOdeme({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> }) {
  const a = await requireAdmin();
  const [{ id }, { t }] = await Promise.all([params, searchParams]);
  if (getBillingProvider()?.name !== "paytr" || !UUID.test(id) || !t || !/^[\w-]+$/.test(t)) notFound();
  const p = await paymentOf(a.tenantId, id);
  if (!p || p.status !== "bekliyor") notFound();
  return (
    <Card className="mx-auto max-w-2xl p-4">
      <h1 className="mb-3 text-lg font-semibold">ÇabukPOS {p.period === "yillik" ? "yıllık" : "aylık"} abonelik · {formatTL(p.amount)}</h1>
      <iframe id="paytriframe" src={`https://www.paytr.com/odeme/guvenli/${t}`} className="h-[700px] w-full border-0" title="PayTR güvenli ödeme" />
    </Card>
  );
}
