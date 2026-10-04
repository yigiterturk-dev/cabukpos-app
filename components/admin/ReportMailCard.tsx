"use client";
import { useTransition, useState } from "react";
import { useFormAction } from "@/components/useFormAction";
import { Button, Card } from "@/components/ui";
import { saveReportMail, sendTestReport, type ReportMailState } from "@/lib/admin/report-actions";

/** #41: Günün özeti e-postası — Raporlar > Özet altında. */
export function ReportMailCard({ initial }: { initial: { daily: boolean; weekly: boolean; monthly?: boolean } }) {
  const { state, pending, onSubmit } = useFormAction(saveReportMail, {} as ReportMailState);
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<ReportMailState | null>(null);
  return (
    <Card className="mb-6 p-4" data-testid="report-mail">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="text-sm font-semibold">E-posta özeti</h2>
        <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" name="daily" defaultChecked={initial.daily} className="size-4 accent-[var(--color-brand)]" />Günlük (her sabah, dün)</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="weekly" defaultChecked={initial.weekly} className="size-4 accent-[var(--color-brand)]" />Haftalık (pazartesi, geçen hafta)</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="monthly" defaultChecked={initial.monthly ?? false} className="size-4 accent-[var(--color-brand)]" />Aylık konsolide (ayın 1&rsquo;i, geçen ay)</label>
          <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Kaydediliyor…" : "Kaydet"}</Button>
          {state.savedAt ? <span className="text-sm text-ok" role="status">Kaydedildi.</span> : state.error ? <span className="text-sm text-bad">{state.error}</span> : null}
        </form>
        <button type="button" disabled={busy} onClick={() => start(async () => setMsg(await sendTestReport()))} className="text-sm font-medium text-brand hover:underline disabled:opacity-60">Şimdi dene</button>
        {msg && <span role="status" className={`text-sm ${msg.error ? "text-bad" : "text-ok"}`}>{msg.error ?? msg.info}</span>}
      </div>
      <p className="mt-1 text-xs text-muted">Doğrulanmış sahip ve müdür e-postalarına gider. PDF için raporu yazdırın (tarayıcıdan &ldquo;PDF olarak kaydet&rdquo;).</p>
    </Card>
  );
}

export function PrintButton({ label = "Yazdır / PDF" }: { label?: string }) {
  return <button type="button" onClick={() => window.print()} className="rounded-lg border border-line px-3 py-2 outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60">{label}</button>;
}
