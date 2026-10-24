// Franchise raporu: dönem seçimi, şube bazında net ciro, kâr, ciro payı ve sabit bedel hakedişi.
import Link from "next/link";
import { redirect } from "next/navigation";
import { withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { seesAllStores } from "@/lib/core/access";
import { dayCount, istToday, parseRange, type Range } from "@/lib/core/report";
import { franchiseData, type FranchiseData } from "@/lib/admin/franchise";
import { moneyFormatter } from "@/lib/admin/currency";
import { PrintButton } from "@/components/PrintButton";
import { Badge, buttonClass, Card, Empty, PageHeader, TABLE_HEAD } from "@/components/ui";
import { HorizontalScrollRegion } from "@/components/HorizontalScrollRegion";

export const dynamic = "force-dynamic";
const day = (s: string) => s.split("-").reverse().join(".");
const pct = (bps: number | null) => (bps == null ? "—" : `%${(bps / 100).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}`);

function presets(today: string): { key: string; label: string; range: Range }[] {
  const year = today.slice(0, 4), month = Number(today.slice(5, 7));
  const prev = month === 1 ? `${Number(year) - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
  const [py, pm] = prev.split("-").map(Number);
  const prevEnd = new Date(Date.UTC(py, pm, 0)).toISOString().slice(0, 10);
  return [
    { key: "ay", label: "Bu ay", range: { bas: `${today.slice(0, 8)}01`, bit: today } },
    { key: "gecen", label: "Geçen ay", range: { bas: `${prev}-01`, bit: prevEnd } },
    { key: "30", label: "Son 30 gün", range: { bas: istToday(Date.now(), -29), bit: today } },
    { key: "yil", label: "Bu yıl", range: { bas: `${year}-01-01`, bit: today } },
  ];
}
const href = (r: Range) => `/yonetim/franchise?${new URLSearchParams({ bas: r.bas, bit: r.bit })}`;

function Table({ d, money }: { d: FranchiseData; money: (k: number) => string }) {
  const t = d.totals;
  return (
    <>
      <Card className="overflow-hidden lg:hidden">
        <ul aria-label="Franchise şube hakedişleri" className="divide-y divide-line">
          {d.rows.map((r) => (
            <li key={r.storeId} className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="min-w-0 break-words font-semibold text-ink">{r.name}</h3>
                {r.royaltyBps == null && r.monthlyFee == null ? <Badge tone="warn">tanımsız</Badge> : <Badge tone="neutral">{pct(r.royaltyBps)}</Badge>}
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                <div><dt className="text-xs text-muted">Net ciro</dt><dd className="tabular font-medium">{money(r.sales)}</dd></div>
                <div><dt className="text-xs text-muted">Kâr</dt><dd className="tabular">{money(r.profit)}</dd></div>
                <div><dt className="text-xs text-muted">Ciro payı</dt><dd className="tabular">{money(r.royalty)}</dd></div>
                <div><dt className="text-xs text-muted">Sabit bedel</dt><dd className="tabular">{money(r.fixed)}</dd></div>
                <div><dt className="text-xs text-muted">İade / adet</dt><dd className="tabular">{money(r.refunds)} · {r.count}</dd></div>
                <div><dt className="text-xs text-muted">Toplam hakediş</dt><dd className="tabular font-semibold">{money(r.total)}</dd></div>
              </dl>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="hidden p-0 lg:block">
        <HorizontalScrollRegion label="Franchise şube hakedişleri, yatay kaydırılabilir" className="rounded-2xl">
          <table aria-label="Franchise şube hakedişleri" className="w-full min-w-[900px] text-sm">
            <thead className={TABLE_HEAD}>
              <tr>
                <th scope="col" className="p-3 text-left font-medium">Şube</th>
                <th scope="col" className="p-3 text-right font-medium">Net ciro</th>
                <th scope="col" className="p-3 text-right font-medium">İade</th>
                <th scope="col" className="p-3 text-right font-medium">Adet</th>
                <th scope="col" className="p-3 text-right font-medium">Kâr</th>
                <th scope="col" className="p-3 text-right font-medium">Ciro payı</th>
                <th scope="col" className="p-3 text-right font-medium">Ciro payı hakedişi</th>
                <th scope="col" className="p-3 text-right font-medium">Sabit bedel</th>
                <th scope="col" className="p-3 text-right font-medium">Toplam</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {d.rows.map((r) => (
                <tr key={r.storeId}>
                  <td className="p-3 font-medium text-ink"><span className="block max-w-[16rem] truncate" title={r.name}>{r.name}</span></td>
                  <td className="tabular p-3 text-right">{money(r.sales)}</td>
                  <td className="tabular p-3 text-right">{money(r.refunds)}</td>
                  <td className="tabular p-3 text-right">{r.count}</td>
                  <td className="tabular p-3 text-right">{money(r.profit)}</td>
                  <td className="tabular p-3 text-right">{r.royaltyBps == null && r.monthlyFee == null ? <Badge tone="warn">tanımsız</Badge> : pct(r.royaltyBps)}</td>
                  <td className="tabular p-3 text-right">{money(r.royalty)}</td>
                  <td className="tabular p-3 text-right">{money(r.fixed)}</td>
                  <td className="tabular p-3 text-right font-semibold">{money(r.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-line-strong bg-surface-2/60 font-semibold">
                <td className="p-3">Toplam</td>
                <td className="tabular p-3 text-right">{money(t.sales)}</td>
                <td className="tabular p-3 text-right">{money(t.refunds)}</td>
                <td className="tabular p-3 text-right">{t.count}</td>
                <td className="tabular p-3 text-right">{money(t.profit)}</td>
                <td className="p-3" />
                <td className="tabular p-3 text-right">{money(t.royalty)}</td>
                <td className="tabular p-3 text-right">{money(t.fixed)}</td>
                <td className="tabular p-3 text-right">{money(t.total)}</td>
              </tr>
            </tfoot>
          </table>
        </HorizontalScrollRegion>
      </Card>
    </>
  );
}

export default async function Franchise({ searchParams }: { searchParams: Promise<{ bas?: string; bit?: string }> }) {
  const a = await requireAdmin();
  if (!seesAllStores(a)) redirect("/yonetim");
  const sp = await searchParams;
  const today = istToday();
  const range: Range = sp.bas || sp.bit ? parseRange(sp.bas, sp.bit) : { bas: `${today.slice(0, 8)}01`, bit: today };
  const money = await moneyFormatter(a.tenantId);
  const data = await withTenant(a.tenantId, (tx) => franchiseData(tx, range));
  const links = presets(today);
  const missing = data.rows.filter((r) => r.royaltyBps == null && r.monthlyFee == null).length;
  return (
    <>
      <div className="mb-4 hidden print:block">
        <h1 className="text-xl font-bold">{a.tenantName} — Franchise raporu</h1>
        <p className="text-sm">{day(range.bas)} – {day(range.bit)} · {dayCount(range)} gün</p>
      </div>
      <PageHeader
        title="Franchise raporu"
        desc="Satış şubeleri için net ciro üzerinden ciro payı ve gün oranlı sabit bedel. Depo ve franchise koşulu tanımsız şubeler ayrı işaretlenir."
        actions={<div className="flex flex-wrap items-center gap-2"><PrintButton /><a href={`/yonetim/franchise/csv?${new URLSearchParams({ bas: range.bas, bit: range.bit })}`} download className={buttonClass("secondary")}>CSV indir</a></div>}
      />

      <section aria-label="Rapor dönemi" className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface-2/95 p-3 text-sm print:hidden">
        <nav aria-label="Hazır dönemler" className="flex flex-wrap gap-1">
          {links.map((p) => {
            const on = p.range.bas === range.bas && p.range.bit === range.bit;
            return <Link key={p.key} href={href(p.range)} aria-current={on ? "true" : undefined} className={`inline-flex min-h-11 items-center rounded-lg border px-3 outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${on ? "border-brand bg-brand-soft font-medium text-brand" : "border-line bg-surface hover:bg-surface-2"}`}>{p.label}</Link>;
          })}
        </nav>
        <form className="flex min-w-0 flex-wrap items-end gap-2" key={`${range.bas}-${range.bit}`}>
          <label className="flex flex-col gap-1"><span className="text-xs text-muted">Başlangıç</span><input type="date" name="bas" max={today} defaultValue={range.bas} className="min-h-11 rounded-lg border border-line bg-surface px-3 py-2 outline-none focus:border-brand focus:ring-4 focus:ring-brand-ring/50" /></label>
          <label className="flex flex-col gap-1"><span className="text-xs text-muted">Bitiş</span><input type="date" name="bit" max={today} defaultValue={range.bit} className="min-h-11 rounded-lg border border-line bg-surface px-3 py-2 outline-none focus:border-brand focus:ring-4 focus:ring-brand-ring/50" /></label>
          <button type="submit" className={buttonClass("primary")}>Göster</button>
        </form>
        <p className="ml-auto basis-full text-xs text-muted lg:basis-auto">{day(range.bas)} – {day(range.bit)} · {dayCount(range)} gün · sabit bedel ayın gün sayısına oranlanır.</p>
      </section>

      {data.rows.length === 0 ? (
        <Empty>
          Franchise raporu için satış şubesi gerekir.{" "}
          <Link href="/yonetim/subeler" className="font-medium text-brand underline underline-offset-2">Şubeler’den şube ve franchise koşullarını girin</Link>.
        </Empty>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <Card className="p-4"><p className="text-xs text-muted">Toplam net ciro</p><p className="mt-1 text-2xl font-semibold tabular">{money(data.totals.sales)}</p></Card>
            <Card className="p-4"><p className="text-xs text-muted">Toplam hakediş</p><p className="mt-1 text-2xl font-semibold tabular">{money(data.totals.total)}</p><p className="mt-1 text-xs text-muted">ciro payı {money(data.totals.royalty)} · sabit {money(data.totals.fixed)}</p></Card>
            <Card className="p-4"><p className="text-xs text-muted">Tanımsız şube</p><p className={`mt-1 text-2xl font-semibold tabular ${missing ? "text-warn" : ""}`}>{missing}</p><p className="mt-1 text-xs text-muted">{missing ? <Link href="/yonetim/subeler" className="text-brand underline underline-offset-2">Şubeler’den koşul girin</Link> : "tüm şubelerde tanımlı"}</p></Card>
          </div>
          <Table d={data} money={money} />
        </>
      )}
    </>
  );
}
