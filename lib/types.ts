// Çekirdek veri tipleri — tüm sektörler için ortak şema.

export type SectorId =
  | "berber"
  | "guzellik"
  | "otoyikama"
  | "veteriner"
  | "diyetisyen"
  | "psikolog"
  | "doktor"
  | "dishekimi";

export type AppointmentStatus = "bekliyor" | "geldi" | "iptal";

export interface Service {
  id: string;
  name: string;
  durationMin: number; // randevu süresi
  price: number; // TRY
  commissionRate: number; // 0..1 — personele giden prim oranı
  active?: boolean;
}

export interface Staff {
  id: string;
  name: string;
  role: string;
  color: string; // takvim kolon rengi
  initials: string;
  workStart?: string; // "09:00"
  workEnd?: string; // "19:00"
  serviceIds?: string[]; // yetkin olduğu hizmetler (boş = hepsi)
  active?: boolean;
}

// ---- Sektöre özel müşteri alt-kayıtları (hepsi opsiyonel, geriye uyumlu) ----
// Sadece ilgili sektörde kullanılır; diğer sektörlerde yok sayılır.
export interface PetInfo {
  name: string;
  species: string; // kedi / köpek ...
  breed?: string;
  birthYear?: number;
}
export interface VaccineRecord {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD yapıldığı tarih
  nextDue?: string; // YYYY-MM-DD sonraki doz
}
export type TreatmentStatus = "planlandı" | "yapıldı";
export interface TreatmentRecord {
  id: string;
  date: string; // YYYY-MM-DD
  tooth?: string; // diş no
  name: string; // işlem adı
  status: TreatmentStatus;
}
export interface MeasurementRecord {
  id: string;
  date: string; // YYYY-MM-DD
  weightKg: number;
  note?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  note?: string;
  birthday?: string; // doğum günü: "YYYY-MM-DD" veya "AA-GG" (yıl bilinmiyorsa)
  createdAt: string; // ISO
  // Sektöre özel — opsiyonel, geriye uyumlu
  pet?: PetInfo; // veteriner
  vaccines?: VaccineRecord[]; // veteriner
  treatments?: TreatmentRecord[]; // dishekimi
  measurements?: MeasurementRecord[]; // diyetisyen
  heightCm?: number; // diyetisyen
  targetWeightKg?: number; // diyetisyen
}

export interface Appointment {
  id: string;
  date: string; // YYYY-MM-DD
  start: string; // HH:mm
  staffId: string;
  customerId: string;
  serviceId: string;
  status: AppointmentStatus;
  source?: "panel" | "online"; // randevu kaynağı
  // Onay boyutu — status'tan AYRI. Sadece online (işletme onayı bekleyen) talepler için kullanılır.
  // undefined = otomatik onaylı (panelden eklenen tüm randevular + eski kayıtlar → geriye uyumlu).
  // "bekliyor" = online talep, işletme onayı bekliyor · "onaylandi" = işletme onayladı · "reddedildi" = işletme reddetti (iz kalsın diye silinmez).
  approval?: "bekliyor" | "onaylandi" | "reddedildi";
  // Fiyat/prim snapshot'ı: randevu oluşturulduğu andaki hizmet değerleri yazılır.
  // Hizmet/personel sonradan silinse bile geçmiş ciro/prim raporları DOĞRU kalsın.
  // (opsiyonel = geriye uyum; migrate eski kayıtları mevcut servisten doldurur)
  priceSnapshot?: number; // o anki service.price (TRY)
  commissionRateSnapshot?: number; // o anki service.commissionRate (0..1)
  serviceNameSnapshot?: string; // hizmet silinse de raporda ad görünsün
  staffNameSnapshot?: string; // personel silinse de raporda ad görünsün
}

// ---- Kampanyalar ----
export type CampaignKind = "indirim" | "geri-kazanim" | "dogum-gunu" | "paket";
export type CampaignChannel = "whatsapp" | "sms";

export interface Campaign {
  id: string;
  title: string;
  kind: CampaignKind;
  channel: CampaignChannel;
  message: string;
  audience: string; // "Tüm müşteriler" / "45+ gündür gelmeyenler" ...
  reach: number; // hedeflenen kişi sayısı (mock)
  active: boolean;
  createdAt: string;
}

// ---- Hatırlatma (mock gönderim) ----
export interface ReminderSettings {
  enabled: boolean;
  channel: CampaignChannel;
  hoursBefore: number; // randevudan kaç saat önce
  template: string; // {ad} {saat} {hizmet} {isletme} placeholder
}

export interface ReminderLog {
  id: string;
  at: string; // ISO gönderim zamanı (simüle)
  channel: CampaignChannel;
  to: string; // müşteri adı/telefon
  text: string;
  status: "gonderildi" | "iletildi" | "okundu";
}

// ---- Tahsilat (kasaya giren para) ----
// Randevunun FİYATI "hak edilen" (ciro), Payment ise "kasaya giren" (tahsilat).
// İkisinin farkı = müşterinin borcu (veresiye). Bu ayrım kasa/cari modülünün çekirdeği.
export type PaymentMethod = "nakit" | "kart" | "havale";

export interface Payment {
  id: string;
  date: string; // YYYY-MM-DD tahsilat tarihi
  amount: number; // TRY (pozitif)
  method: PaymentMethod;
  customerId?: string; // kimden alındı (cari bakiye bunun üzerinden çıkar)
  appointmentId?: string; // hangi randevu için (opsiyonel — genel ödeme de olabilir)
  note?: string;
  createdAt: string; // ISO
}

// ---- Gider (kasadan çıkan para) ----
export type ExpenseCategory =
  | "kira"
  | "maas"
  | "malzeme"
  | "fatura"
  | "vergi"
  | "diger";

export interface Expense {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number; // TRY (pozitif)
  category: ExpenseCategory;
  note?: string;
  createdAt: string; // ISO
}

// ---- Abonelik / fatura ----
export type PlanId = "baslangic" | "profesyonel" | "isletme";

export interface Subscription {
  planId: PlanId;
  startedAt: string;
  nextRenewal: string;
}

export interface Invoice {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number;
  planLabel: string;
  status: "odendi" | "bekliyor";
}

export interface SectorConfig {
  id: SectorId;
  label: string; // "Berber / Kuaför"
  tagline: string;
  // sektöre özel terminoloji
  terms: {
    appointment: string; // "Randevu" / "Rezervasyon"
    staff: string; // "Personel" / "Usta" / "Garson"
    service: string; // "Hizmet" / "İşlem" / "Menü"
    customer: string; // "Müşteri" / "Misafir"
  };
}

export interface BusinessState {
  sector: SectorId | null;
  businessName: string;
  phone?: string; // işletme telefonu (opsiyonel, kurulumda girilir)
  bookingSlug: string; // public rezervasyon linki için
  services: Service[];
  staff: Staff[];
  customers: Customer[];
  appointments: Appointment[];
  campaigns: Campaign[];
  reminderSettings: ReminderSettings;
  reminderLogs: ReminderLog[];
  subscription: Subscription;
  invoices: Invoice[];
  payments: Payment[];
  expenses: Expense[];
}
