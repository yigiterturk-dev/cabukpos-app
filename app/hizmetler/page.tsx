"use client";

import { useState } from "react";
import { Shell } from "@/components/Shell";
import { Card, SectionTitle, StaffAvatar } from "@/components/ui";
import { useStore } from "@/lib/store";
import { sectorTerms } from "@/lib/sectors";
import { formatTRY, timeSlots } from "@/lib/utils";
import type { Service, Staff } from "@/lib/types";
import { IcPlus, IcX, IcEdit, IcTrash, IcScissors, IcStaff } from "@/components/icons";

const STAFF_COLORS = ["#2F5BEA", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#06B6D4"];

export default function HizmetlerPage() {
  const { state } = useStore();
  const terms = sectorTerms(state.sector);
  const [tab, setTab] = useState<"hizmet" | "personel">("hizmet");

  return (
    <Shell>
      <div className="mx-auto max-w-[1100px]">
        <div className="flex items-end justify-between">
          <SectionTitle sub="Hizmet ve personel kayıtlarını yönetin">Yönetim</SectionTitle>
          <div className="flex rounded-lg bg-canvas p-0.5">
            <button
              onClick={() => setTab("hizmet")}
              className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-colors ${tab === "hizmet" ? "bg-surface text-ink shadow-sm" : "text-muted"}`}
            >
              <IcScissors className="h-4 w-4" /> {terms.service}ler
            </button>
            <button
              onClick={() => setTab("personel")}
              className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-colors ${tab === "personel" ? "bg-surface text-ink shadow-sm" : "text-muted"}`}
            >
              <IcStaff className="h-4 w-4" /> {terms.staff}
            </button>
          </div>
        </div>

        <div className="mt-5">{tab === "hizmet" ? <ServicesPanel /> : <StaffPanel />}</div>
      </div>
    </Shell>
  );
}

// ---------------- Hizmetler ----------------
function ServicesPanel() {
  const { state, upsertService, deleteService } = useStore();
  const terms = sectorTerms(state.sector);
  const [editing, setEditing] = useState<Service | null>(null);

  return (
    <>
      <Card className="overflow-hidden">
        <div className="hidden grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 border-b border-line px-5 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-muted sm:grid">
          <span>{terms.service}</span>
          <span className="text-right">Süre</span>
          <span className="text-right">Fiyat</span>
          <span className="text-right">Prim</span>
          <span className="w-16" />
        </div>
        <ul className="divide-y divide-line">
          {state.services.map((s) => (
            <li key={s.id} className="grid grid-cols-2 items-center gap-2 px-5 py-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
              <div className="col-span-2 flex items-center gap-3 sm:col-span-1">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand">
                  <IcScissors className="h-4 w-4" />
                </span>
                <span className="text-[14px] font-semibold text-ink">{s.name}</span>
              </div>
              <span className="tnum text-right text-[13px] text-muted">{s.durationMin} dk</span>
              <span className="tnum text-right text-[13.5px] font-medium text-ink">{s.price > 0 ? formatTRY(s.price) : "—"}</span>
              <span className="tnum text-right text-[13px] font-semibold text-brand">%{Math.round(s.commissionRate * 100)}</span>
              <div className="flex justify-end gap-1">
                <IconBtn onClick={() => setEditing(s)} title="Düzenle"><IcEdit className="h-4 w-4" /></IconBtn>
                <IconBtn
                  onClick={() => { if (confirm(`"${s.name}" silinsin mi?`)) deleteService(s.id); }}
                  title="Sil"
                  danger
                ><IcTrash className="h-4 w-4" /></IconBtn>
              </div>
            </li>
          ))}
        </ul>
        <div className="border-t border-line p-3">
          <button
            onClick={() => setEditing({ id: "svc-" + Date.now(), name: "", durationMin: 30, price: 0, commissionRate: 0.3, active: true })}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line py-2.5 text-[13.5px] font-semibold text-brand transition-colors hover:bg-brand-soft/40"
          >
            <IcPlus className="h-4 w-4" /> Yeni {terms.service.toLowerCase()} ekle
          </button>
        </div>
      </Card>

      {editing && (
        <ServiceModal
          service={editing}
          onClose={() => setEditing(null)}
          onSave={(s) => { upsertService(s); setEditing(null); }}
        />
      )}
    </>
  );
}

function ServiceModal({ service, onClose, onSave }: { service: Service; onClose: () => void; onSave: (s: Service) => void }) {
  const { state } = useStore();
  const terms = sectorTerms(state.sector);
  const [f, setF] = useState<Service>(service);
  const isNew = !state.services.some((x) => x.id === service.id);

  return (
    <Modal title={`${isNew ? "Yeni" : "Düzenle"}: ${terms.service}`} onClose={onClose}>
      <div className="space-y-3">
        <Labeled label={`${terms.service} adı`}>
          <input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inp} placeholder="Örn. Saç Kesimi" />
        </Labeled>
        <div className="grid grid-cols-2 gap-3">
          <Labeled label="Süre (dk)">
            <select value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: +e.target.value })} className={inp}>
              {[15, 20, 30, 45, 60, 75, 90, 120, 180].map((d) => <option key={d} value={d}>{d} dk</option>)}
            </select>
          </Labeled>
          <Labeled label="Fiyat (₺)">
            <input type="number" min={0} value={f.price} onChange={(e) => setF({ ...f, price: Math.max(0, Math.round(+e.target.value || 0)) })} className={inp} />
          </Labeled>
        </div>
        <Labeled label={`Prim oranı — %${Math.round(f.commissionRate * 100)}`}>
          <input type="range" min={0} max={60} value={Math.round(f.commissionRate * 100)} onChange={(e) => setF({ ...f, commissionRate: +e.target.value / 100 })} className="w-full accent-brand" />
        </Labeled>
      </div>
      <SaveRow onClose={onClose} disabled={!f.name.trim()} onSave={() => onSave(f)} />
    </Modal>
  );
}

// ---------------- Personel ----------------
function StaffPanel() {
  const { state, upsertStaff, deleteStaff } = useStore();
  const terms = sectorTerms(state.sector);
  const [editing, setEditing] = useState<Staff | null>(null);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {state.staff.map((s) => {
          const skills = !s.serviceIds || s.serviceIds.length === 0 ? "Tüm hizmetler" : `${s.serviceIds.length} hizmet`;
          return (
            <Card key={s.id} className="flex items-center gap-3.5 p-4">
              <StaffAvatar staff={s} size={44} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold text-ink">{s.name}</div>
                <div className="text-[12.5px] text-muted">{s.role}</div>
                <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                  <span className="rounded-full bg-canvas px-2 py-0.5 text-muted">{s.workStart}–{s.workEnd}</span>
                  <span className="rounded-full bg-brand-soft px-2 py-0.5 text-brand-deep">{skills}</span>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <IconBtn onClick={() => setEditing(s)} title="Düzenle"><IcEdit className="h-4 w-4" /></IconBtn>
                <IconBtn onClick={() => { if (confirm(`"${s.name}" silinsin mi?`)) deleteStaff(s.id); }} title="Sil" danger><IcTrash className="h-4 w-4" /></IconBtn>
              </div>
            </Card>
          );
        })}
        <button
          onClick={() => setEditing({ id: "stf-" + Date.now(), name: "", role: "", color: STAFF_COLORS[state.staff.length % STAFF_COLORS.length], initials: "", workStart: "09:00", workEnd: "19:00", serviceIds: [], active: true })}
          className="flex min-h-[92px] items-center justify-center gap-1.5 rounded-2xl border border-dashed border-line text-[13.5px] font-semibold text-brand transition-colors hover:bg-brand-soft/40"
        >
          <IcPlus className="h-4 w-4" /> Yeni {terms.staff.toLowerCase()} ekle
        </button>
      </div>

      {editing && (
        <StaffModal
          staff={editing}
          onClose={() => setEditing(null)}
          onSave={(s) => {
            const init = s.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "??";
            upsertStaff({ ...s, initials: init });
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function StaffModal({ staff, onClose, onSave }: { staff: Staff; onClose: () => void; onSave: (s: Staff) => void }) {
  const { state } = useStore();
  const terms = sectorTerms(state.sector);
  const [f, setF] = useState<Staff>(staff);
  const isNew = !state.staff.some((x) => x.id === staff.id);
  const allSelected = !f.serviceIds || f.serviceIds.length === 0;

  function toggleSvc(id: string) {
    const cur = f.serviceIds && f.serviceIds.length ? f.serviceIds : state.services.map((s) => s.id);
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    setF({ ...f, serviceIds: next.length === state.services.length ? [] : next });
  }

  return (
    <Modal title={`${isNew ? "Yeni" : "Düzenle"}: ${terms.staff}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Labeled label="Ad Soyad">
            <input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inp} placeholder="Ad Soyad" />
          </Labeled>
          <Labeled label="Ünvan">
            <input value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} className={inp} placeholder="Örn. Saç Tasarım" />
          </Labeled>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Labeled label="Mesai başı">
            <select value={f.workStart} onChange={(e) => setF({ ...f, workStart: e.target.value })} className={inp}>
              {timeSlots().map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Labeled>
          <Labeled label="Mesai bitiş">
            <select value={f.workEnd} onChange={(e) => setF({ ...f, workEnd: e.target.value })} className={inp}>
              {[...timeSlots(), "19:00", "19:30", "20:00", "21:00"].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Labeled>
        </div>
        <Labeled label="Renk">
          <div className="flex gap-2">
            {STAFF_COLORS.map((c) => (
              <button key={c} onClick={() => setF({ ...f, color: c })} className={`h-7 w-7 rounded-full transition-transform ${f.color === c ? "scale-110 ring-2 ring-offset-2 ring-ink/30" : ""}`} style={{ background: c }} />
            ))}
          </div>
        </Labeled>
        <Labeled label={`Yetkin olduğu ${terms.service.toLowerCase()}ler`}>
          <div className="flex flex-wrap gap-1.5">
            {state.services.map((s) => {
              const on = allSelected || (f.serviceIds ?? []).includes(s.id);
              return (
                <button key={s.id} onClick={() => toggleSvc(s.id)} className={`rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors ${on ? "border-brand bg-brand-soft text-brand-deep" : "border-line text-muted"}`}>
                  {s.name}
                </button>
              );
            })}
          </div>
        </Labeled>
      </div>
      <SaveRow onClose={onClose} disabled={!f.name.trim()} onSave={() => onSave(f)} />
    </Modal>
  );
}

// ---------------- shared ----------------
const inp = "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[14px] text-ink outline-none transition-colors focus:border-brand";

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[13px] font-medium text-ink">{label}</label>
      {children}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-[480px] animate-fade-up overflow-hidden rounded-t-3xl bg-surface shadow-pop sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="font-display text-[17px] font-700 text-ink">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-ink"><IcX className="h-5 w-5" /></button>
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

function SaveRow({ onClose, onSave, disabled }: { onClose: () => void; onSave: () => void; disabled?: boolean }) {
  return (
    <div className="mt-5 flex gap-2">
      <button onClick={onClose} className="flex-1 rounded-xl border border-line py-2.5 text-[14px] font-medium text-ink hover:bg-canvas">Vazgeç</button>
      <button onClick={onSave} disabled={disabled} className="flex-[1.4] rounded-xl bg-brand py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-brand-deep disabled:opacity-40">Kaydet</button>
    </div>
  );
}

function IconBtn({ children, onClick, title, danger }: { children: React.ReactNode; onClick: () => void; title: string; danger?: boolean }) {
  return (
    <button onClick={onClick} title={title} className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${danger ? "text-muted hover:bg-rose/10 hover:text-rose" : "text-muted hover:bg-canvas hover:text-ink"}`}>
      {children}
    </button>
  );
}
