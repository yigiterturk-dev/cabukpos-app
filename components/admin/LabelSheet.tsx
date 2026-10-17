"use client";
// A4'e 3×8 raf etiketi (70×37 mm). Ekranda seçim listesi, baskıda yalnız seçili etiketler.
import { useState, useTransition } from "react";
import { markLabelsPrinted } from "@/lib/admin/label-actions";
import { ean13Modules } from "@/lib/core/ean13";
import { formatMoney, type Currency } from "@/lib/core/money";
import { Button } from "@/components/ui";

export type LabelItem = { id: string; name: string; price: number; kind: "adet" | "tartili"; plu: string | null; barcode: string | null };

function Bars({ code }: { code: string }) {
  const m = ean13Modules(code);
  if (!m) return <div className="font-mono text-[9px]">{code}</div>;
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 95 20" preserveAspectRatio="none" className="h-[9mm] w-[38mm]" aria-label={`Barkod ${code}`} role="img">
        {[...m].map((b, i) => (b === "1" ? <rect key={i} x={i} y={0} width={1} height={20} fill="#000" /> : null))}
      </svg>
      <div className="font-mono text-[8px] leading-none tracking-[0.2em]">{code}</div>
    </div>
  );
}

export function LabelSheet({ items, currency = "TRY" }: { items: LabelItem[]; currency?: Currency }) {
  const [sel, setSel] = useState(() => new Set(items.map((i) => i.id)));
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = items.filter((i) => sel.has(i.id));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <>
      <style>{`@media print { @page { size: A4; margin: 0 } }`}</style>
      <div className="print:hidden" aria-busy={pending}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button onClick={() => window.print()} disabled={!chosen.length}>Yazdır ({chosen.length})</Button>
          <Button variant="secondary" disabled={!chosen.length || pending} onClick={() => start(async () => {
            setError(null); setDone(false);
            try { await markLabelsPrinted(chosen.map((c) => c.id)); setDone(true); }
            catch { setError("Etiketler basıldı olarak işaretlenemedi. Tekrar deneyin."); }
          })}>{pending ? "İşaretleniyor…" : "Basıldı olarak işaretle"}</Button>
          <button type="button" disabled={pending} onClick={() => setSel(new Set(items.map((i) => i.id)))} className="inline-flex min-h-11 items-center rounded-lg px-2.5 text-sm underline outline-none hover:bg-surface-3 focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:opacity-50">Tümünü seç</button>
          <button type="button" disabled={pending} onClick={() => setSel(new Set())} className="inline-flex min-h-11 items-center rounded-lg px-2.5 text-sm underline outline-none hover:bg-surface-3 focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:opacity-50">Hiçbiri</button>
          {done && <span className="text-sm text-ok" role="status" aria-live="polite">Etiketler basıldı olarak işaretlendi.</span>}
          {error && <span className="text-sm text-bad" role="alert" aria-live="assertive">{error}</span>}
        </div>
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {items.map((i) => (
            <li key={i.id}>
              <label className="flex min-h-11 items-center gap-3 p-3 text-sm">
                <input type="checkbox" checked={sel.has(i.id)} disabled={pending} onChange={() => toggle(i.id)} className="size-4 accent-[var(--color-brand)] disabled:opacity-50" aria-label={`${i.name} etiketi`} />
                <span className="flex-1 font-medium">{i.name}</span>
                <span className="tabular">{formatMoney(i.price, currency)}{i.kind === "tartili" && "/kg"}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>
      <div className="hidden print:grid print:grid-cols-[repeat(3,70mm)] print:auto-rows-[37mm]">
        {chosen.map((i) => (
          <div key={i.id} className="flex flex-col justify-between overflow-hidden border border-dashed border-line-strong p-[3mm] text-black">
            <div className="line-clamp-2 text-[11pt] font-semibold leading-tight">{i.name}</div>
            <div className="flex items-end justify-between gap-2">
              <div>
                <div className="tabular text-[20pt] font-bold leading-none">{formatMoney(i.price, currency)}</div>
                {i.kind === "tartili" && <div className="text-[8pt]">kg fiyatı{i.plu ? ` · PLU ${i.plu}` : ""}</div>}
              </div>
              {i.barcode && <Bars code={i.barcode} />}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
