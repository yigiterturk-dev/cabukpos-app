import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { formatTL } from "@/lib/core/money";
import { getBillingProvider } from "@/lib/billing/provider";
import { paymentOf } from "@/lib/billing/service";
import { fakeResult } from "@/lib/billing/actions";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TestOdeme({ params }: { params: Promise<{ id: string }> }) {
  const a = await requireAdmin();
  const { id } = await params;
  if (getBillingProvider()?.name !== "fake" || !UUID.test(id)) notFound();
  const p = await paymentOf(a.tenantId, id);
  if (!p || p.status !== "bekliyor") notFound();
  return (
    <Card className="mx-auto max-w-md p-6">
      <div className="mb-4 rounded bg-amber-100 px-2 py-1 text-center text-xs font-semibold text-warn">TEST ÖDEME — gerçek para çekilmez</div>
      <h1 className="text-lg font-semibold">ÇabukPOS {p.period === "yillik" ? "yıllık" : "aylık"} abonelik</h1>
      <div className="my-4 text-3xl font-semibold tabular-nums">{formatTL(p.amount)}</div>
      <form action={fakeResult} className="flex gap-2">
        <input type="hidden" name="id" value={p.id} />
        <button name="ok" value="0" className="flex-1 rounded-lg border border-line py-2.5">Başarısız</button>
        <button name="ok" value="1" className="flex-[2] rounded-lg bg-brand py-2.5 font-medium text-white">Ödemeyi onayla</button>
      </form>
    </Card>
  );
}
