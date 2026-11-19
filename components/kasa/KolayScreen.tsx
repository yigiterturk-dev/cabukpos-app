"use client";
// Kolay Mod: tek ekranda üç büyük iş. İade/para aktarma/çekmece yönetici PIN'i olmadan açılmaz.
import { Bike, ClipboardCheck, LayoutGrid, Lock, LogOut, ShoppingBasket, Undo2, Landmark, ShieldCheck } from "lucide-react";
import { Button, Card } from "@/components/ui";

type Props = {
  cashierName: string;
  shiftOpen: boolean;
  openCount: number;
  readyCount: number;
  waitingCount: number;
  hasSalon: boolean;
  hasPaket: boolean;
  adminUnlocked: boolean;
  pinRequired: boolean;
  onSale: () => void;
  onSalon: () => void;
  onPaket: () => void;
  onGunSonu: () => void;
  onIade: () => void;
  onSafeDrop: () => void;
  onAdmin: () => void;
  onLock: () => void;
};

function BigAction({ step, title, hint, icon, onClick }: { step: string; title: string; hint: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="press flex min-h-28 w-full items-center gap-4 rounded-2xl border border-line bg-surface p-5 text-left shadow-rest outline-none hover:border-brand hover:shadow-raised focus-visible:ring-4 focus-visible:ring-brand-ring/60">
      <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold uppercase tracking-wide text-muted">{step}</span>
        <span className="mt-0.5 block font-display text-xl font-bold tracking-tight">{title}</span>
        <span className="mt-1 block text-sm text-muted">{hint}</span>
      </span>
      <span aria-hidden className="text-2xl text-muted">›</span>
    </button>
  );
}

function LockedAction({ title, hint, icon, locked, onClick }: { title: string; hint: string; icon: React.ReactNode; locked: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="press flex min-h-20 w-full items-center gap-3 rounded-xl border border-line bg-surface-2 p-4 text-left outline-none hover:border-line-strong focus-visible:ring-4 focus-visible:ring-brand-ring/60">
      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface text-ink-2">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
      {locked && <Lock aria-hidden className="size-4 shrink-0 text-warn" />}
    </button>
  );
}

export function KolayScreen({ cashierName, shiftOpen, openCount, readyCount, waitingCount, hasSalon, hasPaket, adminUnlocked, pinRequired, onSale, onSalon, onPaket, onGunSonu, onIade, onSafeDrop, onAdmin, onLock }: Props) {
  const locked = pinRequired && !adminUnlocked;
  const runLocked = (action: () => void) => (locked ? onAdmin() : action());
  return (
    <main id="kasa-content" tabIndex={-1} className="mx-auto w-full max-w-2xl px-4 py-6 outline-none">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Merhaba, {cashierName}</h1>
          <p className="mt-1 text-sm text-muted">Tek ekran. Sadece şu üç işi yap.</p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${shiftOpen ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"}`}>
          <span className={`size-2 rounded-full ${shiftOpen ? "bg-ok" : "bg-warn"}`} />
          {shiftOpen ? "Vardiya açık" : "Vardiya kapalı"}
        </span>
      </div>

      <div className="space-y-3">
        <BigAction step="1. iş" title="Satış yap" hint="Müşteri kasaya geldi: ürünü seç, parayı al, fişi ver." icon={<ShoppingBasket />} onClick={onSale} />
        {hasSalon && <BigAction step="2. iş" title="Salon / Masalar" hint="Müşteri masaya oturdu: masayı aç, siparişi gir." icon={<LayoutGrid />} onClick={onSalon} />}
        {hasPaket && <BigAction step={hasSalon ? "3. iş" : "2. iş"} title="Paket / Kurye" hint="Telefon veya platform siparişi: paketi hazırla, kuryeyi çağır." icon={<Bike />} onClick={onPaket} />}
        <BigAction step={hasSalon && hasPaket ? "4. iş" : hasSalon || hasPaket ? "3. iş" : "2. iş"} title="Günü kapat" hint="Akşam kapanış: kasayı say, günü bitir. Yönetici PIN'i gerekir." icon={<ClipboardCheck />} onClick={() => runLocked(onGunSonu)} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Card className="p-3"><div className="font-display text-2xl font-bold tabular">{openCount}</div><div className="text-xs text-muted">Açık iş</div></Card>
        <Card className="p-3"><div className="font-display text-2xl font-bold tabular">{readyCount}</div><div className="text-xs text-muted">Hazır bekleyen</div></Card>
        <Card className="p-3"><div className="font-display text-2xl font-bold tabular">{waitingCount}</div><div className="text-xs text-muted">Onay bekleyen</div></Card>
      </div>

      <section className="mt-6">
        <h2 className="flex items-center gap-2 font-display text-base font-bold tracking-tight">
          <ShieldCheck aria-hidden className="size-4 text-muted" />
          Yönetici işlemleri
          {locked && <span className="rounded-full bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn">PIN ile açılır</span>}
        </h2>
        <p className="mt-1 text-xs text-muted">Yanlışlıkla iade veya para çıkışı olmasın diye burada kilitli.</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <LockedAction title="İade" hint="Para geri ver" icon={<Undo2 />} locked={locked} onClick={() => runLocked(onIade)} />
          <LockedAction title="Para aktar" hint="Güvenli kasaya" icon={<Landmark />} locked={locked} onClick={() => runLocked(onSafeDrop)} />
        </div>
      </section>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button variant="secondary" className="min-h-12 flex-1" onClick={onLock}><LogOut aria-hidden className="size-4" />Kilitle</Button>
        <Button variant="ghost" className="min-h-12 flex-1" onClick={onAdmin}><Lock aria-hidden className="size-4" />{!pinRequired ? "Yönetici" : adminUnlocked ? "Yönetici açık" : "Yönetici PIN'i"}</Button>
      </div>

      <p className="mt-4 text-center text-xs text-muted">Takıldığında ekranı kilitle, yöneticiyi çağır. Bu ekranda başka bir şey yok.</p>
    </main>
  );
}
