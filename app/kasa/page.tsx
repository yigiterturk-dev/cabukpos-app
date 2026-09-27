import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { schema, withTenant } from "@/db";
import { getCashier, getDevice } from "@/lib/auth/kasa";
import { pinLogout } from "@/lib/kasa/actions";
import { isVatRate } from "@/lib/core/money";
import { OpenShiftForm, PinPad } from "@/components/kasa/KasaForms";
import { SaleScreen, type KasaProduct } from "@/components/kasa/SaleScreen";

export const dynamic = "force-dynamic";

function Center({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <main className="grid flex-1 place-items-center px-4 py-8">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-2xl font-semibold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-center text-sm text-muted">{sub}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}

export default async function Kasa() {
  const device = await getDevice();
  if (!device) redirect("/kasa/eslestir");
  const cashier = await getCashier(device);
  if (!cashier) return <Center title={device.tenantName} sub={`${device.name} · PIN ile girin`}><PinPad /></Center>;

  const [shift, cats, prods] = await withTenant(device.tenantId, (tx) =>
    Promise.all([
      tx.select({ id: schema.shifts.id }).from(schema.shifts).where(and(eq(schema.shifts.deviceId, device.id), isNull(schema.shifts.closedAt))).then((r) => r[0]),
      tx.select({ id: schema.categories.id, name: schema.categories.name }).from(schema.categories).orderBy(asc(schema.categories.sort), asc(schema.categories.name)),
      tx.select().from(schema.products).where(eq(schema.products.active, true)).orderBy(asc(schema.products.sort), asc(schema.products.name)),
    ]),
  );

  return (
    <>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-2 text-sm">
        <span className="font-semibold">{device.tenantName}</span>
        <span className="text-muted">{device.name}</span>
        <span className="font-medium">{cashier.name}</span>
        <div className="ml-auto flex items-center gap-4">
          {shift && <Link href="/kasa/gun-sonu" className="underline">Gün sonu</Link>}
          <form action={pinLogout}><button className="text-muted underline">Kasiyer değiştir</button></form>
        </div>
      </header>
      {shift ? (
        <SaleScreen categories={cats} products={prods.filter((p): p is typeof p & { vatRate: KasaProduct["vatRate"] } => isVatRate(p.vatRate)).map((p) => ({ id: p.id, name: p.name, price: p.price, vatRate: p.vatRate, categoryId: p.categoryId, barcodes: p.barcodes }))} />
      ) : (
        <Center title="Vardiya kapalı" sub="Satışa başlamak için kasadaki nakdi girip vardiyayı açın."><OpenShiftForm /></Center>
      )}
    </>
  );
}
