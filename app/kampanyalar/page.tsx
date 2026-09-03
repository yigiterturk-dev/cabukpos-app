"use client";

import { useMemo, useState } from "react";
import { Shell } from "@/components/Shell";
import { Card, SectionTitle } from "@/components/ui";
import { useStore } from "@/lib/store";
import { bookingUrlLabel } from "@/lib/public-url";
import { sectorTerms } from "@/lib/sectors";
import { birthdayThisMonthCount, formatTRY, lapsedCustomers, relativeTime } from "@/lib/utils";
import type { Campaign, CampaignChannel, CampaignKind } from "@/lib/types";
import { IcPlus, IcX, IcSend, IcTrash, IcSpark, IcMegaphone } from "@/components/icons";

const KIND_LABEL: Record<CampaignKind, string> = {
  indirim: "İndirim",
  "geri-kazanim": "Geri Kazanım",
  "dogum-gunu": "Doğum Günü",
  paket: "Paket",
};
const KIND_COLOR: Record<CampaignKind, string> = {
  indirim: "#2F5BEA",
  "geri-kazanim": "#EC4899",
  "dogum-gunu": "#F59E0B",
  paket: "#10B981",
};

export default function KampanyalarPage() {
  const { state, addCampaign, toggleCampaign, deleteCampaign, sendCampaign } = useStore();
  const terms = sectorTerms(state.sector);
  const [creating, setCreating] = useState<Campaign | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const lapsed = useMemo(() => lapsedCustomers(state, 30), [state]);
  const lapsedValue = lapsed.reduce((s, l) => s + l.totalSpent, 0);

  // "AI" önerileri — verinin durumuna göre türetilmiş kartlar
  const suggestions = useMemo(() => buildSuggestions(state, terms.customer), [state, terms.customer]);

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }

  return (
    <Shell>
      <div className="mx-auto max-w-[1180px]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SectionTitle sub="Kampanya oluşturun, kaybolan müşterileri geri kazanın">Kampanyalar</SectionTitle>
          <button
            onClick={() => setCreating({ id: "", title: "", kind: "indirim", channel: "whatsapp", message: "", audience: "Tüm müşteriler", reach: state.customers.length, active: true, createdAt: "" })}
            className="flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2.5 text-[14px] font-semibold text-white shadow-card transition-colors hover:bg-brand-deep"
          >
            <IcPlus className="h-4 w-4" /> Yeni kampanya
          </button>
        </div>

        {/* AI öneri kartları */}
        <div className="mt-5">
          <div className="mb-2.5 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-soft text-brand"><IcSpark className="h-3.5 w-3.5" /></span>
            <h3 className="text-[14px] font-semibold text-ink">Akıllı öneriler</h3>
            <span className="text-[12px] text-muted">verilerinize göre</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {suggestions.map((sg, i) => (
              <Card key={i} className="flex flex-col p-4">
                <span className="self-start rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: KIND_COLOR[sg.kind] + "18", color: KIND_COLOR[sg.kind] }}>
                  {KIND_LABEL[sg.kind]}
                </span>
                <h4 className="mt-2 text-[14px] font-semibold leading-snug text-ink">{sg.title}</h4>
                <p className="mt-1 flex-1 text-[12.5px] leading-relaxed text-muted">{sg.reason}</p>
                <button
                  onClick={() => setCreating({ id: "", title: sg.title, kind: sg.kind, channel: "whatsapp", message: sg.message, audience: sg.audience, reach: sg.reach, active: true, createdAt: "" })}
                  className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-line py-2 text-[12.5px] font-semibold text-ink transition-colors hover:border-brand hover:text-brand"
                >
                  <IcPlus className="h-3.5 w-3.5" /> Kampanya yap
                </button>
              </Card>
            ))}
          </div>
        </div>

        {/* Geri kazanım paneli */}
        <Card className="mt-4 overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <div>
              <h3 className="text-[15px] font-semibold text-ink">Geri kazanılacak {terms.customer.toLowerCase()}ler</h3>
              <p className="text-[12.5px] text-muted">30+ gündür gelmeyen · {formatTRY(lapsedValue)} potansiyel ciro</p>
            </div>
            <button
              disabled={lapsed.length === 0}
              onClick={() => {
                if (lapsed.length === 0) return;
                const gk = state.campaigns.find((c) => c.kind === "geri-kazanim");
                if (gk) sendCampaign(gk.id);
                notify(`${lapsed.length} ${terms.customer.toLowerCase()}ye geri kazanım mesajı gönderildi (simülasyon).`);
              }}
              className="flex items-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-[12.5px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <IcSend className="h-3.5 w-3.5" /> Tümüne gönder
            </button>
          </div>
          {lapsed.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-muted">Harika! Kaybolan müşteriniz yok.</p>
          ) : (
            <ul className="divide-y divide-line">
              {lapsed.slice(0, 6).map((l) => (
                <li key={l.customer.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-rose/10 text-[12px] font-semibold text-rose">
                    {l.customer.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-medium text-ink">{l.customer.name}</div>
                    <div className="text-[12px] text-muted">
                      {l.lastVisit ? `Son ziyaret ${relativeTime(l.lastVisit + "T12:00:00")}` : "Hiç gelmemiş"} · {formatTRY(l.totalSpent)} harcamış
                    </div>
                  </div>
                  <span className="tnum rounded-full bg-rose/10 px-2.5 py-1 text-[11.5px] font-semibold text-rose">{l.daysSince > 900 ? "—" : `${l.daysSince} gün`}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Aktif kampanyalar */}
        <h3 className="mb-2.5 mt-6 text-[14px] font-semibold text-ink">Kampanyalarım</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {state.campaigns.map((c) => (
            <Card key={c.id} className="flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: KIND_COLOR[c.kind] + "18", color: KIND_COLOR[c.kind] }}>{KIND_LABEL[c.kind]}</span>
                  <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium uppercase text-muted">{c.channel}</span>
                </div>
                <button onClick={() => { if (confirm("Kampanya silinsin mi?")) deleteCampaign(c.id); }} className="text-muted hover:text-rose"><IcTrash className="h-4 w-4" /></button>
              </div>
              <h4 className="mt-2 text-[14.5px] font-semibold text-ink">{c.title}</h4>
              <p className="mt-1 flex-1 text-[12.5px] leading-relaxed text-muted">{c.message}</p>
              <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                <span className="text-[12px] text-muted">{c.audience} · ~{c.reach} kişi</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { toggleCampaign(c.id); }}
                    className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${c.active ? "bg-mint/10 text-mint" : "bg-canvas text-muted"}`}
                  >
                    {c.active ? "Aktif" : "Pasif"}
                  </button>
                  <button
                    onClick={() => { const n = sendCampaign(c.id); notify(`"${c.title}" ~${n} kişiye gönderildi (simülasyon).`); }}
                    className="flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-brand-deep"
                  >
                    <IcSend className="h-3.5 w-3.5" /> Gönder
                  </button>
                </div>
              </div>
            </Card>
          ))}
          {state.campaigns.length === 0 && (
            <Card className="col-span-full flex flex-col items-center gap-2 py-10 text-center">
              <IcMegaphone className="h-7 w-7 text-muted" />
              <p className="text-[13.5px] text-muted">Henüz kampanya yok. Yukarıdaki önerilerden başlayın.</p>
            </Card>
          )}
        </div>
      </div>

      {creating && (
        <CampaignModal
          base={creating}
          onClose={() => setCreating(null)}
          onSave={(c) => { addCampaign({ title: c.title, kind: c.kind, channel: c.channel, message: c.message, audience: c.audience, reach: c.reach, active: c.active }); setCreating(null); notify("Kampanya oluşturuldu."); }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-fade-up rounded-xl bg-ink px-4 py-2.5 text-[13px] font-medium text-white shadow-pop">
          {toast}
        </div>
      )}
    </Shell>
  );
}

function CampaignModal({ base, onClose, onSave }: { base: Campaign; onClose: () => void; onSave: (c: Campaign) => void }) {
  const [f, setF] = useState<Campaign>(base);
  const kinds: CampaignKind[] = ["indirim", "geri-kazanim", "dogum-gunu", "paket"];
  const channels: CampaignChannel[] = ["whatsapp", "sms"];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-[480px] animate-fade-up overflow-hidden rounded-t-3xl bg-surface shadow-pop sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="font-display text-[17px] font-700 text-ink">Yeni kampanya</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-canvas"><IcX className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3.5 px-5 py-5">
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-ink">Başlık</label>
            <input autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Örn. Hafta içi %15 indirim" className="w-full rounded-xl border border-line px-3.5 py-2.5 text-[14px] outline-none focus:border-brand" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-ink">Tür</label>
              <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as CampaignKind })} className="w-full rounded-xl border border-line px-3.5 py-2.5 text-[14px] outline-none focus:border-brand">
                {kinds.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-ink">Kanal</label>
              <div className="flex rounded-xl bg-canvas p-0.5">
                {channels.map((ch) => (
                  <button key={ch} onClick={() => setF({ ...f, channel: ch })} className={`flex-1 rounded-lg py-2 text-[12.5px] font-medium uppercase ${f.channel === ch ? "bg-surface text-ink shadow-sm" : "text-muted"}`}>{ch}</button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-ink">Mesaj</label>
            <textarea value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} rows={3} placeholder="Müşterilere gidecek mesaj..." className="w-full resize-none rounded-xl border border-line px-3.5 py-2.5 text-[13.5px] outline-none focus:border-brand" />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-ink">Hedef kitle</label>
            <input value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })} className="w-full rounded-xl border border-line px-3.5 py-2.5 text-[14px] outline-none focus:border-brand" />
          </div>
        </div>
        <div className="flex gap-2 border-t border-line px-5 py-4">
          <button onClick={onClose} className="flex-1 rounded-xl border border-line py-2.5 text-[14px] font-medium text-ink hover:bg-canvas">Vazgeç</button>
          <button onClick={() => onSave(f)} disabled={!f.title.trim() || !f.message.trim()} className="flex-[1.4] rounded-xl bg-brand py-2.5 text-[14px] font-semibold text-white hover:bg-brand-deep disabled:opacity-40">Oluştur</button>
        </div>
      </div>
    </div>
  );
}

function buildSuggestions(state: ReturnType<typeof useStore>["state"], customerTerm: string) {
  const lapsed = lapsedCustomers(state, 30);
  const cheapestQuiet = state.services.filter((s) => s.price > 0).sort((a, b) => a.price - b.price)[0];
  const out: { kind: CampaignKind; title: string; reason: string; message: string; audience: string; reach: number }[] = [];

  out.push({
    kind: "geri-kazanim",
    title: `${lapsed.length} ${customerTerm.toLowerCase()}yi geri kazan`,
    reason: `${lapsed.length} ${customerTerm.toLowerCase()} 30+ gündür gelmedi. %20 indirimle geri dönüş ihtimalini artırın.`,
    message: `Sizi özledik! Bu hafta gelene özel %20 indirim. Randevu için: ${bookingUrlLabel(state.bookingSlug)}`,
    audience: "30+ gündür gelmeyenler",
    reach: lapsed.length,
  });

  const bdayCount = birthdayThisMonthCount(state);
  out.push({
    kind: "dogum-gunu",
    title: "Doğum günü kutlaması",
    reason: bdayCount > 0
      ? `Bu ay ${bdayCount} ${customerTerm.toLowerCase()}nin doğum günü var. Küçük bir hediye sadakati artırır.`
      : `Doğum gününde küçük bir hediye, sadakati ve memnuniyeti artırır. Müşterilere doğum günü ekledikçe otomatik hedeflenir.`,
    message: "Doğum gününüz kutlu olsun! Bu ay size özel bir sürprizimiz var, bekleriz.",
    audience: "Bu ay doğum günü olanlar",
    reach: bdayCount,
  });

  out.push({
    kind: "indirim",
    title: cheapestQuiet ? `Sakin günlerde "${cheapestQuiet.name}"` : "Hafta içi doluluk",
    reason: "Hafta içi öğleden önce doluluk düşük. Bu saatlere yönlendiren bir indirim boşlukları doldurur.",
    message: "Hafta içi 09:00–12:00 arası tüm işlemlerde %15 indirim. Yerinizi şimdi ayırın!",
    audience: "Tüm müşteriler",
    reach: state.customers.length,
  });

  return out;
}
