import type { Appointment, BusinessState, Service, Staff } from "./types";

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function formatTRY(n: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(n);
}

const WEEKDAYS = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

export function prettyDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${WEEKDAYS[d.getDay()]}`;
}

export function shortDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

export function weekdayShort(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"][d.getDay()];
}

export function addDaysISO(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 864e5);
  if (days <= 0) return "bugün";
  if (days === 1) return "dün";
  if (days < 30) return `${days} gün önce`;
  const months = Math.floor(days / 30);
  return `${months} ay önce`;
}

// Sonraki tarih durumu: aşı/kontrol gibi "nextDue" alanları için rozet mantığı.
// gecikti: tarih bugünden geçmiş · yaklasiyor: 14 gün içinde · ileri: daha uzak
export function dueStatus(nextDue?: string): "gecikti" | "yaklasiyor" | "ileri" | null {
  if (!nextDue) return null;
  const today = new Date(todayISO() + "T00:00:00").getTime();
  const due = new Date(nextDue + "T00:00:00").getTime();
  const days = Math.floor((due - today) / 864e5);
  if (days < 0) return "gecikti";
  if (days <= 14) return "yaklasiyor";
  return "ileri";
}

// ---- WhatsApp (bedava wa.me tek-tık) ----
// Telefonu E.164'e normalize et: sadece rakam, başta 0 varsa at, 90 ülke kodu ekle.
// Zaten 90 ile başlıyorsa olduğu gibi bırak. Geçersizse "" döner (link açma).
export function normalizePhoneTR(phone: string): string {
  let d = (phone || "").replace(/\D/g, "");
  if (!d) return "";
  // Önce baştaki tüm sıfırları (00 uluslararası önek + yerel 0) temizle.
  // "0090532..." → "90532...", "0532..." → "532...", "532..." → "532..."
  d = d.replace(/^0+/, "");
  if (!d) return "";
  // Sıfırlar temizlendikten SONRA 90 ile başlıyorsa ülke kodu zaten var.
  if (d.startsWith("90")) return d;
  return "90" + d;
}

// wa.me linki — dolu mesajla. Telefon geçersizse null.
export function waLink(phone: string, message: string): string | null {
  const num = normalizePhoneTR(phone);
  if (num.length < 11) return null; // 90 + 10 hane beklenir
  return `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
}

// ---- Lookups ----
export function staffById(state: BusinessState, id: string): Staff | undefined {
  return state.staff.find((s) => s.id === id);
}
export function serviceById(state: BusinessState, id: string): Service | undefined {
  return state.services.find((s) => s.id === id);
}
export function customerById(state: BusinessState, id: string) {
  return state.customers.find((c) => c.id === id);
}

// ---- Snapshot-öncelikli çözücüler ----
// Raporlar/prim hesabı önce randevudaki snapshot'ı kullanır, yoksa mevcut servise düşer.
// Böylece hizmet/personel silinse bile geçmiş ciro/prim DOĞRU kalır (geriye uyumlu).
export function aptPrice(state: BusinessState, a: Appointment): number {
  if (typeof a.priceSnapshot === "number") return a.priceSnapshot;
  return serviceById(state, a.serviceId)?.price ?? 0;
}
export function aptCommissionRate(state: BusinessState, a: Appointment): number {
  if (typeof a.commissionRateSnapshot === "number") return a.commissionRateSnapshot;
  return serviceById(state, a.serviceId)?.commissionRate ?? 0;
}
export function aptServiceName(state: BusinessState, a: Appointment): string {
  // Snapshot-öncelikli (aptPrice/aptCommissionRate ile tutarlı): hizmet silinse bile ad doğru kalsın.
  return a.serviceNameSnapshot ?? serviceById(state, a.serviceId)?.name ?? "Silinmiş hizmet";
}

// ---- Hesaplamalar ----
export interface StaffPerf {
  staff: Staff;
  appointments: number;
  served: number;
  revenue: number;
  commission: number;
}

export function staffPerformance(state: BusinessState, date?: string): StaffPerf[] {
  return state.staff.map((staff) => {
    const apts = state.appointments.filter(
      (a) => a.staffId === staff.id && (!date || a.date === date) && a.status === "geldi" && a.approval !== "reddedildi"
    );
    let revenue = 0;
    let commission = 0;
    for (const a of apts) {
      // Snapshot-öncelikli: hizmet silinmiş olsa bile ciro/prim düşmesin.
      const price = aptPrice(state, a);
      revenue += price;
      commission += price * aptCommissionRate(state, a);
    }
    const total = state.appointments.filter(
      (a) => a.staffId === staff.id && (!date || a.date === date)
    ).length;
    return {
      staff,
      appointments: total,
      served: apts.length,
      revenue,
      commission: Math.round(commission),
    };
  });
}

export function dayRevenue(state: BusinessState, date: string) {
  return state.appointments
    .filter((a) => a.date === date && a.status === "geldi" && a.approval !== "reddedildi")
    .reduce((sum, a) => sum + aptPrice(state, a), 0);
}

export function appointmentsForDate(state: BusinessState, date: string): Appointment[] {
  return state.appointments
    .filter((a) => a.date === date)
    .sort((a, b) => a.start.localeCompare(b.start));
}

export function customerHistory(state: BusinessState, customerId: string): Appointment[] {
  return state.appointments
    .filter((a) => a.customerId === customerId)
    .sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start));
}

export const STATUS_META: Record<string, { label: string; dot: string; chip: string; text: string }> = {
  bekliyor: { label: "Bekliyor", dot: "bg-amber", chip: "bg-amber/10 border-amber/30", text: "text-amber" },
  geldi: { label: "Geldi", dot: "bg-mint", chip: "bg-mint/10 border-mint/30", text: "text-mint" },
  iptal: { label: "İptal", dot: "bg-rose", chip: "bg-rose/10 border-rose/30", text: "text-rose" },
};

// Takvim zaman ızgarası
export const DAY_START_MIN = 9 * 60; // 09:00
export const DAY_END_MIN = 19 * 60; // 19:00
export const SLOT_MIN = 30;
export const PX_PER_MIN = 1.5;

export function timeToMin(hhmm: string) {
  if (!hhmm || typeof hhmm !== "string") return 0;
  const [h, m] = hhmm.split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export function minToTime(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function timeSlots(): string[] {
  const out: string[] = [];
  for (let t = DAY_START_MIN; t < DAY_END_MIN; t += SLOT_MIN) out.push(minToTime(t));
  return out;
}

// ---- Raporlama / analitik ----

// Trend serisi DÜNDE biter (bugün hariç): bugünkü randevular çoğunlukla "bekliyor"
// olduğu için ciro 0 görünür ve çizgi sonda yapay olarak dibe çakılırdı. N tamamlanmış
// gün gösterir (dün ve öncesi).
export function dailyRevenueSeries(state: BusinessState, days: number): { label: string; date: string; value: number }[] {
  const out: { label: string; date: string; value: number }[] = [];
  const wd = ["Pz", "Pt", "Sa", "Ça", "Pe", "Cu", "Ct"];
  const end = addDaysISO(todayISO(), -1); // dün
  for (let i = days - 1; i >= 0; i--) {
    const date = addDaysISO(end, -i);
    const d = new Date(date + "T00:00:00");
    out.push({ date, label: wd[d.getDay()], value: dayRevenue(state, date) });
  }
  return out;
}

export function monthlyRevenueSeries(state: BusinessState, months: number): { label: string; value: number }[] {
  const M = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
  const buckets = new Map<string, number>();
  for (const a of state.appointments) {
    if (a.status !== "geldi" || a.approval === "reddedildi") continue;
    const key = a.date.slice(0, 7);
    buckets.set(key, (buckets.get(key) ?? 0) + aptPrice(state, a));
  }
  const out: { label: string; value: number }[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.toISOString().slice(0, 7);
    out.push({ label: M[d.getMonth()], value: buckets.get(key) ?? 0 });
  }
  return out;
}

export interface ServicePopularity {
  service: { id: string; name: string };
  count: number;
  revenue: number;
}

export function popularServices(state: BusinessState): ServicePopularity[] {
  // Snapshot-öncelikli: hiçbir "geldi" randevuyu atma. Silinmiş hizmetleri snapshot adıyla
  // (yoksa canlı servisle, yoksa "Silinmiş hizmet") çöz ki donut toplamı merkez "served" ile tutsun.
  const map = new Map<string, { name: string; count: number; revenue: number }>();
  for (const a of state.appointments) {
    if (a.status !== "geldi" || a.approval === "reddedildi") continue;
    const name = aptServiceName(state, a);
    // Anahtar: canlı servis varsa id, yoksa çözülen ad (silinmiş hizmetleri ada göre grupla)
    const key = serviceById(state, a.serviceId)?.id ?? `name:${name}`;
    const cur = map.get(key) ?? { name, count: 0, revenue: 0 };
    cur.count += 1;
    cur.revenue += aptPrice(state, a);
    map.set(key, cur);
  }
  return Array.from(map.entries())
    .map(([id, v]) => ({ service: { id, name: v.name }, count: v.count, revenue: v.revenue }))
    .sort((a, b) => b.count - a.count);
}

export function rangeRevenue(state: BusinessState, days: number): number {
  const from = addDaysISO(todayISO(), -(days - 1));
  return state.appointments
    .filter((a) => a.date >= from && a.date <= todayISO() && a.status === "geldi" && a.approval !== "reddedildi")
    .reduce((s, a) => s + aptPrice(state, a), 0);
}

// Doğum günü ayını çöz: "YYYY-MM-DD" veya "AA-GG" / "MM-DD" formatlarını destekler.
// Geçersizse null. (1-12 arası ay döner.)
export function birthdayMonth(birthday?: string): number | null {
  if (!birthday) return null;
  const parts = birthday.split("-").map((p) => parseInt(p, 10));
  // YYYY-MM-DD → [yıl, ay, gün] · AA-GG → [ay, gün]
  const month = parts.length >= 3 ? parts[1] : parts[0];
  if (!Number.isFinite(month) || month < 1 || month > 12) return null;
  return month;
}

// Bu ay doğum günü olan müşteri sayısı (kampanya reach'i için gerçek hesap).
export function birthdayThisMonthCount(state: BusinessState): number {
  const thisMonth = new Date().getMonth() + 1; // 1-12
  return state.customers.filter((c) => birthdayMonth(c.birthday) === thisMonth).length;
}

// Geri kazanım: en son "geldi" randevusundan bu yana N+ gün geçen müşteriler
export interface LapsedCustomer {
  customer: BusinessState["customers"][number];
  lastVisit: string | null;
  daysSince: number;
  totalSpent: number;
}

export function lapsedCustomers(state: BusinessState, thresholdDays = 30): LapsedCustomer[] {
  const today = new Date(todayISO() + "T00:00:00").getTime();
  return state.customers
    .map((c) => {
      const visits = state.appointments
        .filter((a) => a.customerId === c.id && a.status === "geldi")
        .sort((a, b) => b.date.localeCompare(a.date));
      const lastVisit = visits[0]?.date ?? null;
      const daysSince = lastVisit
        ? Math.floor((today - new Date(lastVisit + "T00:00:00").getTime()) / 864e5)
        : 999;
      const totalSpent = visits.reduce((s, a) => s + aptPrice(state, a), 0);
      return { customer: c, lastVisit, daysSince, totalSpent };
    })
    .filter((x) => x.daysSince >= thresholdDays)
    .sort((a, b) => b.daysSince - a.daysSince);
}

// Belirli gün+personel için dolu zaman aralıkları (süre dahil)
function busyIntervals(
  state: BusinessState,
  date: string,
  staffId: string,
  ignoreId?: string
): { start: number; end: number }[] {
  return state.appointments
    .filter(
      (a) =>
        a.date === date &&
        a.staffId === staffId &&
        a.status !== "iptal" &&
        a.approval !== "reddedildi" && // reddedilen online talep slotu işgal etmesin (saat tekrar açılır)
        a.id !== ignoreId
    )
    .map((a) => {
      const s = timeToMin(a.start);
      const dur = serviceById(state, a.serviceId)?.durationMin ?? SLOT_MIN;
      return { start: s, end: s + dur };
    });
}

// İki aralık çakışıyor mu?
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

// Aynı personel + aynı zaman aralığında çakışan randevu var mı?
export function hasConflict(
  state: BusinessState,
  date: string,
  staffId: string,
  start: string,
  durationMin: number,
  ignoreId?: string
): boolean {
  const s = timeToMin(start);
  const e = s + durationMin;
  return busyIntervals(state, date, staffId, ignoreId).some((iv) => overlaps(s, e, iv.start, iv.end));
}

// Public rezervasyon: belirli gün+personel için müsait slotlar (süre çakışması + geçmiş saat dikkate alınır)
export function availableSlots(state: BusinessState, date: string, staffId: string, durationMin: number): string[] {
  const staff = staffById(state, staffId);
  const busy = busyIntervals(state, date, staffId);
  const startMin = staff?.workStart ? timeToMin(staff.workStart) : DAY_START_MIN;
  const endMin = staff?.workEnd ? timeToMin(staff.workEnd) : DAY_END_MIN;
  // Bugünse, şu andan önceki slotları gösterme
  const today = todayISO();
  const nowMin = date === today ? new Date().getHours() * 60 + new Date().getMinutes() : -1;
  const out: string[] = [];
  for (let t = startMin; t + durationMin <= endMin; t += SLOT_MIN) {
    if (t < nowMin) continue;
    const slotEnd = t + durationMin;
    const blocked = busy.some((iv) => overlaps(t, slotEnd, iv.start, iv.end));
    if (!blocked) out.push(minToTime(t));
  }
  return out;
}

export function staffForService(state: BusinessState, serviceId: string): BusinessState["staff"] {
  return state.staff.filter((s) => s.active !== false && (!s.serviceIds || s.serviceIds.length === 0 || s.serviceIds.includes(serviceId)));
}

// ---- Online rezervasyon anti-spam (CLIENT-SIDE, en iyi-çaba) ----
// NOT: Bu koruma yalnızca tarayıcı tarafındadır ve localStorage'ı temizleyen / farklı cihaz
// kullanan biri tarafından aşılabilir. GERÇEK koruma (sunucu rate-limit + telefon OTP) backend/SMS
// sağlayıcı geldiğinde eklenecek. Şimdilik yapısal hazırlık + caydırıcı amaçlıdır.

// TR telefon format kontrolü: yalnızca rakamları sayar, 10-11 hane bekler (0 ile veya ilk 5'li hane).
// TODO(backend): gerçek doğrulama için telefon OTP SMS gerekir — burada sadece format kontrolü var.
export function isValidTRPhone(phone: string): boolean {
  const d = (phone || "").replace(/\D/g, "");
  // 10 hane (5XXXXXXXXX) veya 11 hane (05XXXXXXXXX) — başında 90 ülke kodu da kabul (12 hane)
  if (d.length === 10) return d.startsWith("5");
  if (d.length === 11) return d.startsWith("05");
  if (d.length === 12) return d.startsWith("905");
  return false;
}

const RL_KEY_PREFIX = "rezzy.booking.rl.";
const RL_WINDOW_MS = 60 * 60 * 1000; // 1 saat
const RL_MAX = 3; // pencere başına izinli talep

// Bu slug için son 1 saatte RL_MAX'tan fazla talep yapıldı mı? (localStorage tabanlı)
// TODO(backend): gerçek koruma sunucu-taraflı IP/telefon rate-limit ile gelecek.
export function isRateLimited(slug: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const now = Date.now();
    const raw = window.localStorage.getItem(RL_KEY_PREFIX + slug);
    const list: number[] = raw ? (JSON.parse(raw) as number[]) : [];
    const recent = list.filter((t) => now - t < RL_WINDOW_MS);
    return recent.length >= RL_MAX;
  } catch {
    return false;
  }
}

// Başarılı bir talebi pencere listesine kaydet.
export function recordBooking(slug: string): void {
  if (typeof window === "undefined") return;
  try {
    const now = Date.now();
    const raw = window.localStorage.getItem(RL_KEY_PREFIX + slug);
    const list: number[] = raw ? (JSON.parse(raw) as number[]) : [];
    const recent = list.filter((t) => now - t < RL_WINDOW_MS);
    recent.push(now);
    window.localStorage.setItem(RL_KEY_PREFIX + slug, JSON.stringify(recent));
  } catch {
    /* yoksay */
  }
}
