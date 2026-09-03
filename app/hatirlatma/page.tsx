"use client";

import { useEffect, useMemo, useState } from "react";
import { Shell } from "@/components/Shell";
import { Card, SectionTitle } from "@/components/ui";
import { useStore } from "@/lib/store";
import { sectorTerms } from "@/lib/sectors";
import { aptServiceName, prettyDate, relativeTime, todayISO, waLink } from "@/lib/utils";
import type { CampaignChannel } from "@/lib/types";
import { IcBell, IcSend, IcCheck } from "@/components/icons";
import { messagingStatusAction } from "@/lib/data/actions";

const CHANNELS: CampaignChannel[] = ["whatsapp", "sms"];
const STATUS_LABEL: Record<string, { t: string; c: string }> = {
  gonderildi: { t: "Gönderildi", c: "text-muted bg-canvas" },
  iletildi: { t: "İletildi", c: "text-brand bg-brand-soft" },
  okundu: { t: "Okundu", c: "text-mint bg-mint/10" },
};

export default function HatirlatmaPage() {
  const { state, updateReminderSettings, simulateReminders } = useStore();
  const terms = sectorTerms(state.sector);
  const rs = state.reminderSettings;
  const [toast, setToast] = useState<string | null>(null);
  // Sağlayıcı bağlı değilse "otomatik gönderilir" demek yalan olur; durumu sunucudan sor.
  const [autoSend, setAutoSend] = useState<boolean | null>(null);
  useEffect(() => {
    messagingStatusAction()
      .then((r) => setAutoSend(r.enabled))
      .catch(() => setAutoSend(false));
  }, []);

  function run() {
    const n = simulateReminders();
    setToast(n > 0 ? `${n} hatırlatma gönderildi (simülasyon).` : "Gönderilecek bekleyen randevu yok.");
    setTimeout(() => setToast(null), 2600);
  }

  const preview = rs.template
    .replaceAll("{ad}", "Ahmet Bey")
    .replaceAll("{saat}", "14:30")
    .replaceAll("{hizmet}", state.services[0]?.name ?? "Hizmet")
    .replaceAll("{isletme}", state.businessName);

  // Bugün ve sonrası bekleyen randevular — her biri için tek-tık WhatsApp gönderimi
  const pending = useMemo(() => {
    const today = todayISO();
    return state.appointments
      .filter((a) => a.date >= today && a.status === "bekliyor")
      .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
      .slice(0, 20)
      .map((a) => {
        const cust = state.customers.find((c) => c.id === a.customerId);
        const text = rs.template
          .replaceAll("{ad}", cust?.name ?? "")
          .replaceAll("{saat}", a.start)
          .replaceAll("{hizmet}", aptServiceName(state, a))
          .replaceAll("{isletme}", state.businessName);
        return { apt: a, customer: cust, text, wa: cust ? waLink(cust.phone, text) : null };
      });
  }, [state, rs.template]);

  return (
    <Shell>
      <div className="mx-auto max-w-[1100px]">
        <SectionTitle
          sub={
            autoSend === false
              ? `${terms.appointment} öncesi hatırlatma — şu an tek tıkla gönderiliyor`
              : `${terms.appointment} öncesi otomatik WhatsApp / SMS hatırlatma`
          }
        >
          Hatırlatma
        </SectionTitle>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr]">
          {/* Ayarlar */}
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand"><IcBell className="h-4.5 w-4.5" /></span>
                <div>
                  <div className="flex items-center gap-2 text-[14.5px] font-semibold text-ink">
                    Otomatik hatırlatma
                    {autoSend === false && (
                      <span className="rounded-full bg-amber/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber">
                        yakında
                      </span>
                    )}
                  </div>
                  <div className="text-[12px] text-muted">
                    {autoSend === false
                      ? "Mesaj sağlayıcısı bağlanınca kendiliğinden gönderilir. Şimdilik aşağıdan tek tıkla gönderin."
                      : "Randevudan önce tetiklenir"}
                  </div>
                </div>
              </div>
              <Toggle on={rs.enabled} onChange={() => updateReminderSettings({ enabled: !rs.enabled })} />
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-ink">Kanal</label>
                <div className="flex rounded-xl bg-canvas p-0.5">
                  {CHANNELS.map((ch) => (
                    <button key={ch} onClick={() => updateReminderSettings({ channel: ch })} className={`flex-1 rounded-lg py-2 text-[13px] font-medium uppercase ${rs.channel === ch ? "bg-surface text-ink shadow-sm" : "text-muted"}`}>{ch}</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-ink">Ne zaman gönderilsin?</label>
                <div className="flex gap-2">
                  {[2, 4, 24, 48].map((h) => (
                    <button key={h} onClick={() => updateReminderSettings({ hoursBefore: h })} className={`flex-1 rounded-lg border py-2 text-[12.5px] font-medium transition-colors ${rs.hoursBefore === h ? "border-brand bg-brand-soft text-brand-deep" : "border-line text-muted"}`}>
                      {h < 24 ? `${h} saat` : h === 24 ? "1 gün" : "2 gün"} önce
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-ink">Mesaj şablonu</label>
                <textarea value={rs.template} onChange={(e) => updateReminderSettings({ template: e.target.value })} rows={3} className="w-full resize-none rounded-xl border border-line px-3.5 py-2.5 text-[13px] outline-none focus:border-brand" />
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {["{ad}", "{saat}", "{hizmet}", "{isletme}"].map((t) => (
                    <span key={t} className="rounded-md bg-canvas px-1.5 py-0.5 text-[11px] font-medium text-muted">{t}</span>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* Önizleme + tetikle */}
          <div className="space-y-4">
            <Card className="p-5">
              <div className="mb-3 text-[13px] font-semibold text-ink">Önizleme</div>
              <div className="rounded-2xl bg-[#075E54]/5 p-4">
                <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-[#DCF8C6] px-3.5 py-2.5 text-[13px] leading-relaxed text-[#1B2B26] shadow-sm">
                  {preview}
                  <div className="mt-1 flex items-center justify-end gap-0.5 text-[10px] text-[#4A6B5E]">
                    14:32 <IcCheck className="h-3 w-3" />
                  </div>
                </div>
              </div>
              <button onClick={run} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-brand-deep">
                <IcSend className="h-4 w-4" /> Bekleyen randevulara şimdi gönder
              </button>
              <p className="mt-2 text-center text-[11.5px] text-muted">SMS tarafı demo: bu buton gerçek SMS atmaz, log'a yazar. Gerçek gönderim için aşağıdaki <b>WhatsApp Gönder</b> butonlarını kullanın.</p>
            </Card>
          </div>
        </div>

        {/* Bedava WhatsApp — tek tık gönderim */}
        <Card className="mt-4 overflow-hidden">
          <div className="border-b border-line px-5 py-3.5">
            <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#25D366] text-[10px] font-bold text-white">WA</span>
              Bedava WhatsApp hatırlatma
            </h3>
            <p className="text-[12.5px] text-muted">
              <b>WhatsApp Gönder</b>&apos;e basın → telefonunuzda mesaj dolu hâlde açılır → siz Gönder&apos;e basın. Ücretsiz, API gerekmez.
            </p>
          </div>
          {pending.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-muted">Bugün ve sonrası için bekleyen {terms.appointment.toLowerCase()} yok.</p>
          ) : (
            <ul className="divide-y divide-line">
              {pending.map(({ apt, customer, wa }) => (
                <li key={apt.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="w-[120px] shrink-0">
                    <div className="text-[12.5px] font-medium text-ink">{prettyDate(apt.date).replace(/ \S+$/, "")}</div>
                    <div className="tnum text-[11.5px] text-muted">{apt.start} · {aptServiceName(state, apt)}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-medium text-ink">{customer?.name ?? "—"}</div>
                    <div className="truncate text-[12px] text-muted">{customer?.phone ?? "—"}</div>
                  </div>
                  {wa ? (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-1.5 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90"
                    >
                      <IcSend className="h-3.5 w-3.5" /> WhatsApp Gönder
                    </a>
                  ) : (
                    <span className="shrink-0 rounded-lg bg-canvas px-3 py-1.5 text-[11.5px] text-muted">Telefon yok</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Gönderim logu */}
        <Card className="mt-4 overflow-hidden">
          <div className="border-b border-line px-5 py-3.5">
            <h3 className="text-[15px] font-semibold text-ink">Gönderim geçmişi</h3>
            <p className="text-[12.5px] text-muted">{state.reminderLogs.length} kayıt</p>
          </div>
          {state.reminderLogs.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-muted">Henüz gönderim yok.</p>
          ) : (
            <ul className="divide-y divide-line">
              {state.reminderLogs.map((l) => {
                const st = STATUS_LABEL[l.status] ?? STATUS_LABEL.gonderildi;
                return (
                  <li key={l.id} className="flex items-center gap-3 px-5 py-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-canvas text-[10px] font-bold uppercase text-muted">{l.channel === "whatsapp" ? "WA" : "SMS"}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-medium text-ink">{l.to}</div>
                      <div className="truncate text-[12px] text-muted">{l.text}</div>
                    </div>
                    <div className="text-right">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${st.c}`}>{st.t}</span>
                      <div className="mt-0.5 text-[11px] text-muted">{relativeTime(l.at)}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-fade-up rounded-xl bg-ink px-4 py-2.5 text-[13px] font-medium text-white shadow-pop">{toast}</div>
      )}
    </Shell>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange} className={`relative h-6 w-11 rounded-full transition-colors ${on ? "bg-mint" : "bg-line"}`} role="switch" aria-checked={on}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-[22px]" : "translate-x-0.5"}`} />
    </button>
  );
}
