"use client";

import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";
import type {
  Appointment,
  AppointmentStatus,
  BusinessState,
  Campaign,
  Customer,
  Expense,
  Invoice,
  Payment,
  PlanId,
  ReminderLog,
  ReminderSettings,
  SectorId,
  Service,
  Staff,
} from "./types";
import { seedFor } from "./seed";
import {
  loadStateAction,
  addServiceAction,
  updateServiceAction,
  deleteServiceAction,
  addStaffAction,
  updateStaffAction,
  deleteStaffAction,
  addCustomerAction,
  updateCustomerAction,
  addAppointmentAction,
  updateAppointmentStatusAction,
  setApprovalAction,
  updateAppointmentAction,
  deleteAppointmentAction,
  addCampaignAction,
  toggleCampaignAction,
  deleteCampaignAction,
  sendCampaignAction,
  updateReminderSettingsAction,
  changePlanAction,
  addPaymentAction,
  deletePaymentAction,
  addExpenseAction,
  deleteExpenseAction,
  seedBusinessAction,
  createBusinessProfileAction,
} from "./data/actions";

const STORAGE_KEY = "rezzy.state.v4";
const LEGACY_KEYS = ["rezzy.state.v3", "rezzy.state.v2", "rezzy.state.v1"];

// Slug üretimi — seed.ts slugify ile aynı mantık (TR karakter map + temizleme).
export function slugify(name: string) {
  const map: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" };
  return name
    .toLowerCase()
    .replace(/[çğıöşü]/g, (m) => map[m] ?? m)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function nextMonthFirstISO() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

const EMPTY: BusinessState = {
  sector: null,
  businessName: "",
  bookingSlug: "",
  services: [],
  staff: [],
  customers: [],
  appointments: [],
  campaigns: [],
  reminderSettings: { enabled: true, channel: "whatsapp", hoursBefore: 24, template: "" },
  reminderLogs: [],
  subscription: { planId: "profesyonel", startedAt: "", nextRenewal: "" },
  invoices: [],
  payments: [],
  expenses: [],
};

// Eski/eksik state'leri yeni şemaya tamamla (geriye uyum)
function migrate(s: Partial<BusinessState> | null): BusinessState | null {
  if (!s || !s.sector) return null;
  // Bozuk/eksik state: core diziler null/undefined ya da dizi değilse EMPTY'e düş
  // (aksi halde ...s spread'i EMPTY'in [] varsayılanını ezer ve ilk render'da .map/.filter çöker)
  const arr = <T,>(v: unknown, fallback: T[]): T[] => (Array.isArray(v) ? (v as T[]) : fallback);
  const services = arr<Service>(s.services, EMPTY.services);
  const staff = arr<Staff>(s.staff, EMPTY.staff);
  // v3 geçişi: eski randevularda fiyat/prim snapshot'ı yoksa MEVCUT servisten doldur.
  // Servis hâlâ varsa değerleri "dondururuz"; servis çoktan silinmişse snapshot eklenemez
  // (resolver yine de güvenli 0'a düşer) — migrate geriye uyumlu.
  const appointments = arr<Appointment>(s.appointments, EMPTY.appointments).map((a) => {
    if (typeof a.priceSnapshot === "number" && typeof a.commissionRateSnapshot === "number") return a;
    const svc = services.find((x) => x.id === a.serviceId);
    const stf = staff.find((x) => x.id === a.staffId);
    return {
      ...a,
      priceSnapshot: a.priceSnapshot ?? svc?.price,
      commissionRateSnapshot: a.commissionRateSnapshot ?? svc?.commissionRate,
      serviceNameSnapshot: a.serviceNameSnapshot ?? svc?.name,
      staffNameSnapshot: a.staffNameSnapshot ?? stf?.name,
    };
  });
  return {
    ...EMPTY,
    ...s,
    bookingSlug: s.bookingSlug || (s.businessName ?? "isletme").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
    services,
    staff,
    customers: arr(s.customers, EMPTY.customers),
    appointments,
    campaigns: arr(s.campaigns, EMPTY.campaigns),
    reminderLogs: arr(s.reminderLogs, EMPTY.reminderLogs),
    reminderSettings: s.reminderSettings ?? EMPTY.reminderSettings,
    subscription: s.subscription ?? EMPTY.subscription,
    invoices: arr(s.invoices, EMPTY.invoices),
    // v4 öncesi state'lerde kasa alanları yok → boş dizi (geriye uyumlu)
    payments: arr(s.payments, EMPTY.payments),
    expenses: arr(s.expenses, EMPTY.expenses),
  } as BusinessState;
}

// ---- Soyut persistence katmanı (yalnız DEMO modunda kullanılır) ----
const persistence = {
  load(): BusinessState | null {
    if (typeof window === "undefined") return null;
    try {
      let raw = window.localStorage.getItem(STORAGE_KEY);
      for (const k of LEGACY_KEYS) {
        if (raw) break;
        raw = window.localStorage.getItem(k);
      }
      return raw ? migrate(JSON.parse(raw) as Partial<BusinessState>) : null;
    } catch {
      return null;
    }
  },
  save(state: BusinessState) {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* yoksay */
    }
  },
  clear() {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(STORAGE_KEY);
    for (const k of LEGACY_KEYS) window.localStorage.removeItem(k);
  },
};

const PLAN_PRICE: Record<PlanId, number> = { baslangic: 2000, profesyonel: 3500, isletme: 5000 };
const PLAN_LABEL: Record<PlanId, string> = { baslangic: "Solo", profesyonel: "Pro", isletme: "Zincir" };

// Kurulum profili — wizard'dan gelen işletme bilgisi + (boş başlatmada) hizmet/personel.
export interface SetupProfile {
  businessName?: string;
  phone?: string;
  bookingSlug?: string;
}
export interface SetupOptions extends SetupProfile {
  empty?: boolean; // true → seedFor ÇAĞRILMAZ, boş state kurulur
  services?: Service[]; // boş başlatmada kullanıcının girdiği hizmetler
  staff?: Staff[]; // boş başlatmada kullanıcının girdiği personel
}

export type AppMode = "db" | "demo";

interface StoreApi {
  state: BusinessState;
  ready: boolean;
  hasSetup: boolean;
  mode: AppMode;
  businessName: string;
  // DB modunda kurulum yazımının Promise'ını döner (onboarding await edebilsin); demo modunda void.
  chooseSector: (sector: SectorId, businessNameOrOpts?: string | SetupOptions) => void | Promise<void>;
  resetAll: () => void;
  /** DB modunda sunucudan tam state yeniden okur (KDS gibi gerçek zamanlı ekranlar için). */
  reload: () => Promise<void>;
  // randevu
  addAppointment: (a: Omit<Appointment, "id">) => void;
  updateAppointmentStatus: (id: string, status: AppointmentStatus) => void;
  updateAppointment: (id: string, patch: Partial<Omit<Appointment, "id">>) => void;
  // Online randevu onay/ret (approval boyutu). Reddet randevuyu SİLMEZ — iz kalır.
  setApproval: (id: string, value: "onaylandi" | "reddedildi") => void;
  deleteAppointment: (id: string) => void;
  // müşteri
  addCustomer: (c: Omit<Customer, "id" | "createdAt">) => Customer;
  updateCustomerNote: (id: string, note: string) => void;
  // Genel müşteri güncelleme: sektöre özel alanlar (pet/vaccines/treatments/measurements...) için.
  // patch'te olmayan alanlar korunur — geriye uyumlu.
  updateCustomer: (id: string, patch: Partial<Omit<Customer, "id" | "createdAt">>) => void;
  // hizmet CRUD
  upsertService: (s: Service) => void;
  deleteService: (id: string) => void;
  // personel CRUD
  upsertStaff: (s: Staff) => void;
  deleteStaff: (id: string) => void;
  // kampanya
  addCampaign: (c: Omit<Campaign, "id" | "createdAt">) => void;
  toggleCampaign: (id: string) => void;
  deleteCampaign: (id: string) => void;
  sendCampaign: (id: string) => number; // simüle gönderim, kişi sayısı döner
  // hatırlatma
  updateReminderSettings: (s: Partial<ReminderSettings>) => void;
  simulateReminders: () => number; // bugünden sonraki randevulara mock hatırlatma
  // abonelik
  changePlan: (planId: PlanId) => void;
  // kasa: tahsilat + gider
  addPayment: (p: Omit<Payment, "id" | "createdAt">) => void;
  deletePayment: (id: string) => void;
  addExpense: (e: Omit<Expense, "id" | "createdAt">) => void;
  deleteExpense: (id: string) => void;
}

const StoreContext = createContext<StoreApi | null>(null);

export interface StoreProviderProps {
  children: React.ReactNode;
  /** Server'dan gelen mod. Oturum varsa "db", demo çerezi varsa "demo". */
  initialMode?: AppMode;
  /** DB modunda server'da loadBusinessState ile yüklenmiş başlangıç state (SSR). */
  initialState?: BusinessState | null;
  /** DB modunda işletme adı (state.sector null olsa bile topbar/çıkış için). */
  initialBusinessName?: string;
}

export function StoreProvider({
  children,
  initialMode = "demo",
  initialState = null,
  initialBusinessName = "",
}: StoreProviderProps) {
  const mode = initialMode;
  const isDb = mode === "db";

  const [state, setState] = useState<BusinessState>(initialState ?? EMPTY);
  // DB modunda SSR state ile geldiyse zaten hazırız; demo modunda localStorage'ı bekleriz.
  const [ready, setReady] = useState<boolean>(isDb);
  const businessName = initialBusinessName || (initialState?.businessName ?? "");

  // Rollback için en güncel state referansı (server action başarısızsa eski state'e dön).
  const stateRef = useRef(state);
  stateRef.current = state;

  // ---- Başlangıç yükleme ----
  useEffect(() => {
    if (isDb) {
      // DB modunda başlangıç state SSR'da geldi; client'ta tekrar yüklemeye gerek yok.
      setReady(true);
      return;
    }
    // Demo modu: localStorage'tan yükle (eski davranış).
    const loaded = persistence.load();
    if (loaded) setState(loaded);
    setReady(true);
  }, [isDb]);

  // Demo modunda state'i localStorage'a kalıcılaştır. DB modunda persistence YOK (sunucu kalıcı).
  useEffect(() => {
    if (!isDb && ready && state.sector) persistence.save(state);
  }, [state, ready, isDb]);

  // DB modunda bir server action başarısız olursa state'i geri al (rollback) + yeniden senkron.
  const rollback = useCallback((snapshot: BusinessState) => {
    setState(snapshot);
  }, []);

  const chooseSector = useCallback(
    (sector: SectorId, businessNameOrOpts?: string | SetupOptions): void | Promise<void> => {
      // Geriye uyum: ikinci argüman string ise eski "demo seed + opsiyonel isim" davranışı.
      const opts: SetupOptions =
        typeof businessNameOrOpts === "string" ? { businessName: businessNameOrOpts } : businessNameOrOpts ?? {};

      const name = opts.businessName?.trim();
      const slug = (opts.bookingSlug?.trim() ? slugify(opts.bookingSlug) : name ? slugify(name) : "") || "";

      if (opts.empty) {
        // Boş başlatma: seedFor ÇAĞIRMA. Kullanıcının girdiği hizmet/personel dışında her şey boş.
        const next: BusinessState = {
          ...EMPTY,
          sector,
          businessName: name || "",
          phone: opts.phone?.trim() || undefined,
          bookingSlug: slug || slugify(name || "isletme") || "isletme",
          services: opts.services ?? [],
          staff: opts.staff ?? [],
          // subscription default'unu EMPTY'den al ama başlangıç tarihlerini doldur
          subscription: { planId: "profesyonel", startedAt: todayISO(), nextRenewal: nextMonthFirstISO() },
        };
        setState(next);
        // DB modu: aynı profili sunucuya yaz (businessId session'dan; client göndermez).
        // Promise döndür → onboarding await edip /dashboard'a yazımdan SONRA geçebilir.
        if (isDb) {
          return createBusinessProfileAction({
            sector,
            businessName: next.businessName,
            bookingSlug: next.bookingSlug,
            phone: next.phone ?? null,
            services: next.services,
            staff: next.staff,
          });
        }
        return;
      }

      // Demo seed yolu — bugünküyle BİREBİR aynı sonuç.
      const seeded = seedFor(sector);
      if (name) {
        seeded.businessName = name;
        seeded.bookingSlug = slug || seeded.bookingSlug;
      }
      if (opts.phone?.trim()) seeded.phone = opts.phone.trim();
      setState(seeded);
      // DB modu: demo seed'i sunucuya yaz. bookingSlug global-uniq olduğundan sunucu
      // signup'taki gerçek slug'ı korur. Promise döner → onboarding await edip
      // /dashboard'a yazımdan SONRA geçer (sayfa yenilemede DB'den birebir gelir).
      if (isDb) {
        // Kullanıcının girdiği isim/telefon da gitsin — aksi halde seed'in
        // sektör-sabit adı ("Maestro Kuaför") kullanıcının adını EZİYORDU.
        return seedBusinessAction(sector, {
          businessName: seeded.businessName,
          phone: seeded.phone ?? null,
        });
      }
    },
    [isDb]
  );

  const resetAll = useCallback(() => {
    // Demo modunda localStorage temizlenir; DB modunda sunucu verisi resetAll ile silinmez
    // (Shell zaten DB modunda "Sektörü değiştir" yerine "Çıkış" gösterir).
    if (!isDb) persistence.clear();
    setState(EMPTY);
  }, [isDb]);

  const addAppointment = useCallback(
    (a: Omit<Appointment, "id">) => {
      const snapshot = stateRef.current;
      const svc = snapshot.services.find((x) => x.id === a.serviceId);
      const stf = snapshot.staff.find((x) => x.id === a.staffId);
      const enriched: Appointment = {
        source: "panel",
        ...a,
        id: "apt-" + Date.now(),
        priceSnapshot: a.priceSnapshot ?? svc?.price,
        commissionRateSnapshot: a.commissionRateSnapshot ?? svc?.commissionRate,
        serviceNameSnapshot: a.serviceNameSnapshot ?? svc?.name,
        staffNameSnapshot: a.staffNameSnapshot ?? stf?.name,
      };
      // Optimistic ekle
      setState((s) => ({ ...s, appointments: [...s.appointments, enriched] }));
      if (isDb) {
        addAppointmentAction(a)
          .then((server) => {
            // Sunucunun ürettiği id ile değiştir (optimistic id'yi gerçek id'ye eşle).
            setState((s) => ({
              ...s,
              appointments: s.appointments.map((x) => (x.id === enriched.id ? server : x)),
            }));
          })
          .catch(() => rollback(snapshot));
      }
    },
    [isDb, rollback]
  );

  const updateAppointmentStatus = useCallback(
    (id: string, status: AppointmentStatus) => {
      const snapshot = stateRef.current;
      setState((s) => ({
        ...s,
        appointments: s.appointments.map((a) => {
          if (a.id !== id) return a;
          // K1: "Geldi" işaretlenen online talep hâlâ onay bekliyorsa otomatik onayla.
          const approval = status === "geldi" && a.approval === "bekliyor" ? "onaylandi" : a.approval;
          return { ...a, status, approval };
        }),
      }));
      if (isDb) updateAppointmentStatusAction(id, status).catch(() => rollback(snapshot));
    },
    [isDb, rollback]
  );

  const updateAppointment = useCallback(
    (id: string, patch: Partial<Omit<Appointment, "id">>) => {
      const snapshot = stateRef.current;
      setState((s) => ({
        ...s,
        appointments: s.appointments.map((a) => (a.id === id ? { ...a, ...patch } : a)),
      }));
      if (isDb) updateAppointmentAction(id, patch).catch(() => rollback(snapshot));
    },
    [isDb, rollback]
  );

  const setApproval = useCallback(
    (id: string, value: "onaylandi" | "reddedildi") => {
      const snapshot = stateRef.current;
      setState((s) => ({ ...s, appointments: s.appointments.map((a) => (a.id === id ? { ...a, approval: value } : a)) }));
      if (isDb) setApprovalAction(id, value).catch(() => rollback(snapshot));
    },
    [isDb, rollback]
  );

  const deleteAppointment = useCallback(
    (id: string) => {
      const snapshot = stateRef.current;
      setState((s) => ({ ...s, appointments: s.appointments.filter((a) => a.id !== id) }));
      if (isDb) deleteAppointmentAction(id).catch(() => rollback(snapshot));
    },
    [isDb, rollback]
  );

  const addCustomer = useCallback(
    (c: Omit<Customer, "id" | "createdAt">) => {
      const snapshot = stateRef.current;
      const cust: Customer = { ...c, id: "cus-" + Date.now(), createdAt: new Date().toISOString() };
      setState((s) => ({ ...s, customers: [cust, ...s.customers] }));
      if (isDb) {
        addCustomerAction(c)
          .then((server) => {
            setState((s) => ({ ...s, customers: s.customers.map((x) => (x.id === cust.id ? server : x)) }));
          })
          .catch(() => rollback(snapshot));
      }
      return cust;
    },
    [isDb, rollback]
  );

  const updateCustomerNote = useCallback(
    (id: string, note: string) => {
      const snapshot = stateRef.current;
      setState((s) => ({ ...s, customers: s.customers.map((c) => (c.id === id ? { ...c, note } : c)) }));
      if (isDb) updateCustomerAction(id, { note }).catch(() => rollback(snapshot));
    },
    [isDb, rollback]
  );

  const updateCustomer = useCallback(
    (id: string, patch: Partial<Omit<Customer, "id" | "createdAt">>) => {
      const snapshot = stateRef.current;
      setState((s) => ({ ...s, customers: s.customers.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
      if (isDb) updateCustomerAction(id, patch).catch(() => rollback(snapshot));
    },
    [isDb, rollback]
  );

  // ---- Hizmet CRUD ----
  const upsertService = useCallback(
    (svc: Service) => {
      const snapshot = stateRef.current;
      const exists = snapshot.services.some((x) => x.id === svc.id);
      setState((s) => ({
        ...s,
        services: exists ? s.services.map((x) => (x.id === svc.id ? svc : x)) : [...s.services, svc],
      }));
      if (isDb) {
        const p = exists ? updateServiceAction(svc) : addServiceAction(svc);
        p.catch(() => rollback(snapshot));
      }
    },
    [isDb, rollback]
  );

  const deleteService = useCallback(
    (id: string) => {
      const snapshot = stateRef.current;
      const today = new Date().toISOString().slice(0, 10);
      setState((s) => ({
        ...s,
        services: s.services.filter((x) => x.id !== id),
        appointments: s.appointments.filter((a) => a.serviceId !== id || !(a.date >= today && a.status === "bekliyor")),
      }));
      if (isDb) deleteServiceAction(id).catch(() => rollback(snapshot));
    },
    [isDb, rollback]
  );

  // ---- Personel CRUD ----
  const upsertStaff = useCallback(
    (stf: Staff) => {
      const snapshot = stateRef.current;
      const exists = snapshot.staff.some((x) => x.id === stf.id);
      setState((s) => ({ ...s, staff: exists ? s.staff.map((x) => (x.id === stf.id ? stf : x)) : [...s.staff, stf] }));
      if (isDb) {
        const p = exists ? updateStaffAction(stf) : addStaffAction(stf);
        p.catch(() => rollback(snapshot));
      }
    },
    [isDb, rollback]
  );

  const deleteStaff = useCallback(
    (id: string) => {
      const snapshot = stateRef.current;
      const today = new Date().toISOString().slice(0, 10);
      setState((s) => ({
        ...s,
        staff: s.staff.filter((x) => x.id !== id),
        appointments: s.appointments.filter((a) => a.staffId !== id || !(a.date >= today && a.status === "bekliyor")),
      }));
      if (isDb) deleteStaffAction(id).catch(() => rollback(snapshot));
    },
    [isDb, rollback]
  );

  // ---- Kampanya ----
  const addCampaign = useCallback(
    (c: Omit<Campaign, "id" | "createdAt">) => {
      const snapshot = stateRef.current;
      const campaign: Campaign = { ...c, id: "cmp-" + Date.now(), createdAt: new Date().toISOString() };
      setState((s) => ({ ...s, campaigns: [campaign, ...s.campaigns] }));
      if (isDb) {
        addCampaignAction(c)
          .then((server) => {
            setState((s) => ({ ...s, campaigns: s.campaigns.map((x) => (x.id === campaign.id ? server : x)) }));
          })
          .catch(() => rollback(snapshot));
      }
    },
    [isDb, rollback]
  );

  const toggleCampaign = useCallback(
    (id: string) => {
      const snapshot = stateRef.current;
      setState((s) => ({ ...s, campaigns: s.campaigns.map((c) => (c.id === id ? { ...c, active: !c.active } : c)) }));
      if (isDb) toggleCampaignAction(id).catch(() => rollback(snapshot));
    },
    [isDb, rollback]
  );

  const deleteCampaign = useCallback(
    (id: string) => {
      const snapshot = stateRef.current;
      setState((s) => ({ ...s, campaigns: s.campaigns.filter((c) => c.id !== id) }));
      if (isDb) deleteCampaignAction(id).catch(() => rollback(snapshot));
    },
    [isDb, rollback]
  );

  const sendCampaign = useCallback(
    (id: string): number => {
      const snapshot = stateRef.current;
      let reach = 0;
      const c = snapshot.campaigns.find((x) => x.id === id);
      if (!c) return 0;
      reach = c.reach;
      const logs: ReminderLog[] = Array.from({ length: Math.min(c.reach, 6) }, (_, i) => ({
        id: "rl-" + Date.now() + "-" + i,
        at: new Date().toISOString(),
        channel: c.channel,
        to: snapshot.customers[i]?.name ?? "Müşteri",
        text: c.message.slice(0, 80),
        status: "gonderildi" as const,
      }));
      setState((s) => ({ ...s, reminderLogs: [...logs, ...s.reminderLogs].slice(0, 50) }));
      if (isDb) {
        sendCampaignAction(id)
          .then((res) => {
            // Sunucu kendi log id'lerini üretir; optimistic logları gerçek loglarla değiştir.
            setState((s) => {
              const optimisticIds = new Set(logs.map((l) => l.id));
              const rest = s.reminderLogs.filter((l) => !optimisticIds.has(l.id));
              return { ...s, reminderLogs: [...res.logs, ...rest].slice(0, 50) };
            });
          })
          .catch(() => rollback(snapshot));
      }
      return reach;
    },
    [isDb, rollback]
  );

  // ---- Hatırlatma ----
  const updateReminderSettings = useCallback(
    (patch: Partial<ReminderSettings>) => {
      const snapshot = stateRef.current;
      setState((s) => ({ ...s, reminderSettings: { ...s.reminderSettings, ...patch } }));
      if (isDb) updateReminderSettingsAction(patch).catch(() => rollback(snapshot));
    },
    [isDb, rollback]
  );

  // simulateReminders: yalnız LOG üretir (kalıcı değil — DB modunda da client-only mock kalır,
  // sayfa yenilemede temizlenir; store API'sini bozmamak için davranış korunur).
  const simulateReminders = useCallback((): number => {
    let count = 0;
    setState((s) => {
      const today = new Date().toISOString().slice(0, 10);
      const targets = s.appointments.filter((a) => a.date >= today && a.status === "bekliyor").slice(0, 8);
      count = targets.length;
      const logs: ReminderLog[] = targets.map((a, i) => {
        const cust = s.customers.find((c) => c.id === a.customerId);
        const svc = s.services.find((x) => x.id === a.serviceId);
        const text = s.reminderSettings.template
          .replaceAll("{ad}", cust?.name ?? "")
          .replaceAll("{saat}", a.start)
          .replaceAll("{hizmet}", svc?.name ?? "")
          .replaceAll("{isletme}", s.businessName);
        return {
          id: "rl-" + Date.now() + "-" + i,
          at: new Date().toISOString(),
          channel: s.reminderSettings.channel,
          to: cust?.name ?? "Müşteri",
          text,
          status: "gonderildi" as const,
        };
      });
      return { ...s, reminderLogs: [...logs, ...s.reminderLogs].slice(0, 50) };
    });
    return count;
  }, []);

  // ---- Abonelik ----
  const changePlan = useCallback(
    (planId: PlanId) => {
      const snapshot = stateRef.current;
      setState((s) => {
        const today = new Date().toISOString().slice(0, 10);
        const newInvoice: Invoice = {
          id: "inv-" + Date.now(),
          date: today,
          amount: PLAN_PRICE[planId],
          planLabel: `${PLAN_LABEL[planId]} — Aylık`,
          status: "odendi",
        };
        const changed = s.subscription.planId !== planId;
        return {
          ...s,
          subscription: { ...s.subscription, planId },
          invoices: changed ? [newInvoice, ...s.invoices] : s.invoices,
        };
      });
      if (isDb) {
        changePlanAction(planId)
          .then((res) => {
            if (res.invoice) {
              // Optimistic faturayı sunucunun gerçek faturasıyla değiştir (en üstteki tek fatura).
              setState((s) => {
                const withoutOptimistic = s.invoices.slice(1);
                return { ...s, invoices: [res.invoice!, ...withoutOptimistic] };
              });
            }
          })
          .catch(() => rollback(snapshot));
      }
    },
    [isDb, rollback]
  );

  // ---- Kasa: tahsilat & gider ----
  const addPayment = useCallback(
    (p: Omit<Payment, "id" | "createdAt">) => {
      const snapshot = stateRef.current;
      const optimistic: Payment = { ...p, id: "pay-" + Date.now(), createdAt: new Date().toISOString() };
      setState((s) => ({ ...s, payments: [optimistic, ...s.payments] }));
      if (isDb) {
        addPaymentAction(p)
          .then((server) => {
            setState((s) => ({ ...s, payments: s.payments.map((x) => (x.id === optimistic.id ? server : x)) }));
          })
          .catch(() => rollback(snapshot));
      }
    },
    [isDb, rollback]
  );

  const deletePayment = useCallback(
    (id: string) => {
      const snapshot = stateRef.current;
      setState((s) => ({ ...s, payments: s.payments.filter((p) => p.id !== id) }));
      if (isDb) deletePaymentAction(id).catch(() => rollback(snapshot));
    },
    [isDb, rollback]
  );

  const addExpense = useCallback(
    (e: Omit<Expense, "id" | "createdAt">) => {
      const snapshot = stateRef.current;
      const optimistic: Expense = { ...e, id: "exp-" + Date.now(), createdAt: new Date().toISOString() };
      setState((s) => ({ ...s, expenses: [optimistic, ...s.expenses] }));
      if (isDb) {
        addExpenseAction(e)
          .then((server) => {
            setState((s) => ({ ...s, expenses: s.expenses.map((x) => (x.id === optimistic.id ? server : x)) }));
          })
          .catch(() => rollback(snapshot));
      }
    },
    [isDb, rollback]
  );

  const deleteExpense = useCallback(
    (id: string) => {
      const snapshot = stateRef.current;
      setState((s) => ({ ...s, expenses: s.expenses.filter((e) => e.id !== id) }));
      if (isDb) deleteExpenseAction(id).catch(() => rollback(snapshot));
    },
    [isDb, rollback]
  );

  // DB modunda sunucudan tam state'i yeniden okur (KDS polling, çoklu terminal senkronu).
  const reload = useCallback(async () => {
    if (!isDb) return;
    try {
      const next = await loadStateAction();
      if (next) setState(next);
    } catch {
      // sessiz geç — KDS bir sonraki tiktte yeniden dener
    }
  }, [isDb]);

  const api = useMemo<StoreApi>(
    () => ({
      state,
      ready,
      hasSetup: !!state.sector,
      mode,
      businessName,
      chooseSector,
      resetAll,
      reload,
      addAppointment,
      updateAppointmentStatus,
      updateAppointment,
      setApproval,
      deleteAppointment,
      addCustomer,
      updateCustomerNote,
      updateCustomer,
      upsertService,
      deleteService,
      upsertStaff,
      deleteStaff,
      addCampaign,
      toggleCampaign,
      deleteCampaign,
      sendCampaign,
      updateReminderSettings,
      simulateReminders,
      changePlan,
      addPayment,
      deletePayment,
      addExpense,
      deleteExpense,
    }),
    [state, ready, mode, businessName, chooseSector, resetAll, reload, addAppointment, updateAppointmentStatus, updateAppointment, setApproval, deleteAppointment, addCustomer, updateCustomerNote, updateCustomer, upsertService, deleteService, upsertStaff, deleteStaff, addCampaign, toggleCampaign, deleteCampaign, sendCampaign, updateReminderSettings, simulateReminders, changePlan, addPayment, deletePayment, addExpense, deleteExpense]
  );

  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

export { PLAN_PRICE, PLAN_LABEL };
