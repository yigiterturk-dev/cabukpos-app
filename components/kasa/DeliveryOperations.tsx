"use client";
import { useEffect, useState } from "react";
import { Bike, CheckCheck, Download, Search, Wallet } from "lucide-react";
import { Button, Dialog, StatCard } from "@/components/ui";
import { HorizontalScrollRegion } from "@/components/HorizontalScrollRegion";
import { courierSummary, deliveryChannel, deliveryStageLabels, deliveryTimes, dispatchCsv, dispatchFilter } from "@/lib/core/dispatch";
import { deliveryStatus, type TabState } from "@/lib/core/tab";
import { istToday } from "@/lib/core/report";
import { formatPhone, intentLabel, phoneHref } from "@/lib/core/delivery";
import { qtyText } from "@/lib/core/receipt";
import type { Meta } from "@/lib/offline/state";
import { kasaFmt } from "./kasa-format";
import { CourierMap } from "./CourierMap";
import { dispatchPrintHtml } from "@/lib/ui/print-dispatch";

const field = "min-h-12 min-w-0 rounded-xl border border-line bg-surface px-3 text-sm outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60";
const time = (at: string) => new Date(at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });

export function DeliveryOperations({ meta, tabs, now, view, onOpen, preview = false }: { meta: Meta; tabs: Map<string, TabState>; now: number; view: "orders" | "couriers"; onOpen: (id: string) => void; preview?: boolean }) {
  const { TL } = kasaFmt(meta);
  const today = istToday(now);
  const [day, setDay] = useState(today);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [courierId, setCourierId] = useState("");
  const [selected, setSelected] = useState<TabState | null>(null);
  const [retry, setRetry] = useState(0);
  const [printError, setPrintError] = useState("");
  const [history, setHistory] = useState<{ day: string; tabs: TabState[]; error?: string } | null>(null);
  useEffect(() => {
    if (preview) return;
    const controller = new AbortController();
    fetch(`/api/delivery/history?day=${day}`, { cache: "no-store", signal: controller.signal }).then(async res => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Geçmiş yüklenemedi.");
      if (!controller.signal.aborted) setHistory({ day, tabs: data.tabs });
    }).catch(error => { if (!controller.signal.aborted) setHistory({ day, tabs: [], error: error instanceof Error ? error.message : "Geçmiş yüklenemedi." }); });
    return () => controller.abort();
  }, [day, retry, preview]);
  const all = new Map<string, TabState>();
  if (history?.day === day) for (const t of history.tabs) all.set(t.id, t);
  // Local pending events take precedence over the server's older synchronized state.
  for (const t of tabs.values()) all.set(t.id, t);
  const couriers = meta.catalog.staff.filter(s => s.role === "kurye");
  const summary = courierSummary(all.values(), couriers, day, now);
  const rows = dispatchFilter(all.values(), { day, query, status, courierId });
  const done = rows.filter(t => deliveryStatus(t) === "teslim");
  const pending = !preview && history?.day !== day;
  const historyError = history?.day === day ? history.error : null;
  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([dispatchCsv(rows, summary)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `paket-kurye-${day}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section aria-label={view === "couriers" ? "Kurye operasyonu" : "Sipariş geçmişi"} className="min-w-0 space-y-5">
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-surface p-4">
      <label className="grid gap-1 text-xs font-medium text-muted">Rapor günü<input type="date" value={day} max={today} min={istToday(now, -366)} onChange={e => { if (e.target.value) setDay(e.target.value); }} className={field} /></label>
      <Button variant="secondary" onClick={() => setDay(istToday(Date.parse(`${day}T12:00:00+03:00`), -1))} disabled={day <= istToday(now, -366)}>Önceki gün</Button>
      <Button variant="secondary" onClick={() => setDay(today)} disabled={day === today}>Bugün</Button>
      <Button variant="secondary" onClick={() => setRetry(n => n + 1)} disabled={pending || preview}>Yenile</Button>
      <Button variant="secondary" className="sm:ml-auto" disabled={!rows.length || pending || !!historyError} onClick={exportCsv}><Download aria-hidden className="size-4" />CSV indir</Button>
      <Button variant="secondary" disabled={!rows.length || pending || !!historyError} onClick={() => {
        setPrintError("");
        const popup = window.open("", "_blank", "width=1100,height=760");
        if (!popup) { setPrintError("Yazdırma penceresi açılamadı. Bu site için açılır pencereye izin verin veya CSV indirin."); return; }
        popup.opener = null;
        popup.document.open(); popup.document.write(dispatchPrintHtml(rows, summary, day, meta.device?.currency)); popup.document.close();
        popup.onload = () => { popup.focus(); popup.print(); };
      }}>Raporu yazdır / PDF</Button>
    </div>
    {printError && <p role="alert" className="text-sm text-warn">{printError}</p>}
    {preview ? <p className="text-xs text-muted">Etkileşimli örnek veriler · gerçek müşteri veya konum içermez.</p> : pending ? <p role="status" className="text-sm text-muted">Seçilen günün bulut kayıtları yükleniyor…</p> : historyError ? <div role="alert" className="rounded-xl border border-warn/30 bg-warn-soft p-3 text-sm text-warn">{historyError} Yalnız bu cihazda kalan kayıtlar gösteriliyor; rapor eksik olabilir. <button onClick={() => setRetry(n => n + 1)} className="min-h-11 underline">Tekrar dene</button></div> : <p className="text-xs text-muted">{day} · bulut geçmişi ve bu cihazın henüz eşitlenmemiş kayıtları</p>}
    {view === "couriers" && <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Aktif kurye işi" value={String(summary.reduce((s, c) => s + c.active, 0))} icon={<Bike />} />
        <StatCard label="Günlük teslimat" value={String(summary.reduce((s, c) => s + c.delivered, 0))} icon={<CheckCheck />} />
        <StatCard label="Nakit teslimat tutarı" value={TL(summary.reduce((s, c) => s + c.cash, 0))} icon={<Wallet />} />
        <StatCard label="Kart teslimat tutarı" value={TL(summary.reduce((s, c) => s + c.card, 0))} icon={<Wallet />} />
      </div>
      <p className="text-xs text-muted">Aktif işler güncel iş yüküdür. Günlük tutarlar seçilen günde teslim edilen siparişlerin ödeme türüne göredir; kasaya teslim edilmiş nakit bakiyesi değildir.</p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {summary.map(c => <button key={c.id} type="button" aria-pressed={courierId === c.id} onClick={() => setCourierId(courierId === c.id ? "" : c.id)} className={`press min-w-0 rounded-2xl border p-5 text-left outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${courierId === c.id ? "border-brand bg-brand-soft" : "border-line bg-surface"}`}>
          <div className="flex items-start justify-between gap-2"><h3 className="break-words text-lg font-bold">{c.name}</h3><span className={`shrink-0 rounded-full px-2 py-1 text-xs ${c.active ? "bg-info-soft text-info" : "bg-ok-soft text-ok"}`}>{c.active ? `${c.active} aktif iş` : "Aktif iş yok"}</span></div>
          <div className="mt-3 flex flex-wrap gap-3 text-sm text-ink-2"><span>{c.ready} hazır</span><span>{c.onRoad} yolda</span><span>{c.delivered} teslim</span></div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm"><div><dt className="text-xs text-muted">Nakit</dt><dd className="tabular font-semibold">{TL(c.cash)}</dd></div><div><dt className="text-xs text-muted">Kart</dt><dd className="tabular font-semibold">{TL(c.card)}</dd></div><div><dt className="text-xs text-muted">Teslimat toplamı</dt><dd className="tabular font-semibold">{TL(c.total)}</dd></div><div><dt className="text-xs text-muted">Ortalama yol süresi</dt><dd className="font-semibold">{c.averageJourney === null ? "Henüz veri yok" : `${c.averageJourney} dk`}</dd></div></dl>
          <span className="mt-4 block text-xs font-medium text-brand">{courierId === c.id ? "Tüm kuryeleri göster ↑" : "Siparişlerini incele →"}</span>
        </button>)}
        {!summary.length && <p className="rounded-xl border border-dashed border-line p-6 text-sm text-muted">Kurye personeli tanımlanmamış. Yönetim → Personel bölümünden kurye ekleyin.</p>}
      </div>
      <CourierMap couriers={summary} now={now} preview={preview} />
    </>}
    <div className="flex flex-wrap items-end gap-3">
      <label className="grid min-w-0 flex-1 gap-1 text-xs font-medium text-muted"><span className="flex items-center gap-1"><Search aria-hidden className="size-3" />Sipariş ara</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Müşteri, telefon, adres, ürün veya sipariş no" className={`${field} w-full`} /></label>
      <label className="grid gap-1 text-xs font-medium text-muted">Durum<select value={status} onChange={e => setStatus(e.target.value)} className={field}><option value="">Tüm durumlar</option>{Object.entries(deliveryStageLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="grid gap-1 text-xs font-medium text-muted">Kurye<select value={courierId} onChange={e => setCourierId(e.target.value)} className={field}><option value="">Tüm kuryeler</option><option value="unassigned">Atanmamış</option>{summary.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    </div>
    <div className="flex flex-wrap justify-between gap-2 text-sm text-muted"><p>{rows.length} sipariş · {done.length} teslim edildi</p><p className="tabular">Teslim edilen toplam {TL(done.reduce((s, t) => s + t.total, 0))}</p></div>
    <HorizontalScrollRegion label="Paket siparişleri tablosu">
      <table className="w-full min-w-[900px] border-collapse text-left text-sm">
        <thead className="bg-surface-3 text-xs text-muted"><tr>{["Sipariş / müşteri", "Kanal", "Durum", "Süre", "Ödeme", "Kurye", "Tutar", ""].map((label, i) => <th scope="col" key={i} className="p-3 font-medium">{label}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">{rows.map(t => { const d = deliveryTimes(t, now); return <tr key={t.id} className="bg-surface">
          <td className="p-3"><span className="block max-w-56 truncate font-semibold">{t.order?.name ?? "Paket"}</span><span className="block text-xs text-muted">{time(t.openedAt)} · {t.order?.source?.externalId ?? t.id.slice(0, 8)}</span></td>
          <td className="p-3">{deliveryChannel(t)}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-xs ${deliveryStatus(t) === "teslim" ? "bg-ok-soft text-ok" : "bg-surface-3"}`}>{deliveryStageLabels[deliveryStatus(t)]}</span></td>
          <td className={`p-3 tabular ${d.late ? "font-semibold text-bad" : "text-muted"}`}><span className="block">Toplam {d.total} dk</span>{d.preparing !== null && <span className="block text-xs">Hazırlık {d.preparing} dk</span>}{d.journey !== null && <span className="block text-xs">Yol {d.journey} dk</span>}{d.late && <span className="block text-xs">Hazırlık gecikti</span>}</td>
          <td className="p-3">{intentLabel(t.delivery.method ?? t.order?.payIntent ?? null) || "Belirtilmedi"}</td><td className="p-3">{summary.find(c => c.id === t.delivery.courierId)?.name ?? "Atanmamış"}</td><td className="p-3 font-semibold tabular">{TL(t.total)}</td>
          <td className="p-3"><Button variant="secondary" size="sm" onClick={() => setSelected(t)} aria-label={`${t.order?.name ?? "Paket"} sipariş ayrıntıları`}>Detaylar</Button></td>
        </tr>; })}</tbody>
      </table>
      {!rows.length && <p className="p-8 text-center text-sm text-muted">Bu tarih ve filtrelerle eşleşen sipariş yok.</p>}
    </HorizontalScrollRegion>
    {selected && <Dialog label="Paket sipariş detayı" title={selected.order?.name ?? "Paket siparişi"} size="lg" onClose={() => setSelected(null)} footer={<><Button variant="secondary" onClick={() => setSelected(null)}>Kapat</Button>{!selected.closed && tabs.has(selected.id) && <Button onClick={() => { onOpen(selected.id); setSelected(null); }}>Siparişi yönet</Button>}</>}>
      <div className="space-y-4 text-sm"><div className="flex flex-wrap gap-2"><span className="rounded-full bg-brand-soft px-3 py-1 font-medium text-brand">{deliveryChannel(selected)}</span><span className="rounded-full bg-surface-3 px-3 py-1">{deliveryStageLabels[deliveryStatus(selected)]}</span></div>
        <p>{selected.order?.address || "Adres belirtilmedi"}</p>{selected.order?.directions && <p className="text-muted">{selected.order.directions}</p>}{selected.order?.note && <p className="rounded-xl bg-warn-soft p-3 text-warn">{selected.order.note}</p>}
        {selected.order?.phone && <a className="inline-flex min-h-12 items-center font-medium text-brand underline" href={phoneHref(selected.order.phone) ?? undefined}>{formatPhone(selected.order.phone)}</a>}
        <ul className="divide-y divide-line">{selected.lines.filter(l => !l.voided).map(l => <li key={l.lineId} className="flex justify-between gap-3 py-3"><span>{qtyText(l.qtyMilli)} × {l.name}{l.note && <span className="block text-xs text-muted">{l.note}</span>}</span><span className="shrink-0 tabular">{TL(Math.round(l.unitPrice * l.qtyMilli / 1000))}</span></li>)}</ul>
        <dl className="grid grid-cols-2 gap-3 rounded-xl bg-surface-3 p-4"><div><dt className="text-muted">Toplam</dt><dd className="text-xl font-bold tabular">{TL(selected.total)}</dd></div><div><dt className="text-muted">Kalan hesap</dt><dd className="text-xl font-bold tabular">{TL(selected.remaining)}</dd></div><div><dt className="text-muted">Ödeme</dt><dd>{intentLabel(selected.delivery.method ?? selected.order?.payIntent ?? null) || "Belirtilmedi"}</dd></div><div><dt className="text-muted">Kurye</dt><dd>{summary.find(c => c.id === selected.delivery.courierId)?.name ?? "Atanmamış"}</dd></div></dl>
        <ol className="space-y-2 border-l-2 border-brand-soft pl-4 text-muted">{([["Sipariş", selected.openedAt], ["Kabul", selected.delivery.acceptedAt], ["Yola çıkış", selected.delivery.outAt], ["Teslim", selected.delivery.deliveredAt]] as const).filter(([, at]) => at).map(([label, at]) => <li key={label} className="flex justify-between gap-3"><span>{label}</span><span>{istToday(Date.parse(at!))} · {time(at!)}</span></li>)}</ol>
      </div>
    </Dialog>}
  </section>;
}
