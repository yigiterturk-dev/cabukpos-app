import type {
  Appointment,
  AppointmentStatus,
  BusinessState,
  Campaign,
  Customer,
  Expense,
  Invoice,
  MeasurementRecord,
  Payment,
  PaymentMethod,
  PetInfo,
  SectorId,
  Service,
  Staff,
  Subscription,
  TreatmentRecord,
  VaccineRecord,
} from "./types";

const STAFF_COLORS = ["#2F5BEA", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899"];

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function mkStaff(names: [string, string][]): Staff[] {
  const hours: [string, string][] = [
    ["09:00", "19:00"],
    ["10:00", "20:00"],
    ["09:00", "18:00"],
  ];
  return names.map(([name, role], i) => ({
    id: "stf-" + (i + 1),
    name,
    role,
    color: STAFF_COLORS[i % STAFF_COLORS.length],
    initials: initials(name),
    workStart: hours[i % hours.length][0],
    workEnd: hours[i % hours.length][1],
    serviceIds: [], // boş = tüm hizmetler
    active: true,
  }));
}

function mkServices(rows: [string, number, number, number][]): Service[] {
  return rows.map(([name, durationMin, price, commissionRate], i) => ({
    id: "svc-" + (i + 1),
    name,
    durationMin,
    price,
    commissionRate,
    active: true,
  }));
}

/** POS sektörleri (market/restoran) için barkod + stok eklenmiş ürün listesi. */
function mkPosProducts(rows: [string, number, number, string, number][]): Service[] {
  return rows.map(([name, durationMin, price, barcode, stock], i) => ({
    id: "svc-" + (i + 1),
    name,
    durationMin,
    price,
    commissionRate: 0,
    active: true,
    barcode,
    stock,
    trackStock: true,
  }));
}

const CUSTOMER_NAMES = [
  "Ahmet Yılmaz", "Elif Demir", "Mehmet Kaya", "Zeynep Şahin", "Mustafa Çelik",
  "Fatma Aydın", "Burak Öztürk", "Selin Arslan", "Emre Doğan", "Ayşe Koç",
  "Caner Yıldız", "Deniz Aksoy", "Hakan Polat", "Merve Erdoğan", "Onur Kurt",
];

// Demo doğum günleri: birkaçı BU AY (kampanya reach'i dolu görünsün), birkaçı başka aylar.
// "AA-GG" formatı (yıl gizli) ve tam "YYYY-MM-DD" karışık — her ikisi de desteklenir.
function seedBirthday(i: number): string | undefined {
  const mm = String(new Date().getMonth() + 1).padStart(2, "0"); // bu ay
  const map: Record<number, string> = {
    0: `${mm}-14`,        // bu ay (AA-GG)
    2: `1988-${mm}-03`,   // bu ay (tam tarih)
    5: `${mm}-27`,        // bu ay
    1: "03-22",
    4: "1990-07-09",
    8: "11-30",
    10: "1985-01-18",
  };
  return map[i];
}

function mkCustomers(notes: Record<number, string>): Customer[] {
  return CUSTOMER_NAMES.map((name, i) => ({
    id: "cus-" + (i + 1),
    name,
    phone: "05" + (30 + (i % 9)) + " " + (100 + i * 7).toString().padStart(3, "0") + " " + (10 + i).toString().padStart(2, "0") + " " + (20 + i).toString().padStart(2, "0"),
    note: notes[i],
    birthday: seedBirthday(i),
    createdAt: new Date(Date.now() - (90 - i * 4) * 864e5).toISOString(),
  }));
}

const SECTOR_DATA: Record<
  SectorId,
  { businessName: string; staff: Staff[]; services: Service[]; notes: Record<number, string> }
> = {
  berber: {
    businessName: "Maestro Kuaför",
    staff: mkStaff([
      ["Serkan Usta", "Saç & Sakal"],
      ["Cem Aktaş", "Saç Tasarım"],
      ["Volkan Er", "Sakal & Cilt"],
    ]),
    services: mkServices([
      ["Saç Kesimi", 30, 250, 0.35],
      ["Saç + Sakal", 45, 350, 0.35],
      ["Sakal Düzenleme", 20, 150, 0.3],
      ["Cilt Bakımı", 40, 400, 0.4],
      ["Saç Boyama", 60, 600, 0.4],
    ]),
    notes: { 0: "Yanları makineyle, üstü makasla ister.", 3: "Sakal modeline dikkat.", 7: "Genelde Serkan Usta'yı tercih eder." },
  },
  guzellik: {
    businessName: "Lumière Güzellik",
    staff: mkStaff([
      ["Derya Hanım", "Cilt Uzmanı"],
      ["Buse Aydın", "Lazer & Bakım"],
      ["Naz Yücel", "Tırnak & Kaş"],
    ]),
    services: mkServices([
      ["Cilt Bakımı", 60, 750, 0.35],
      ["Lazer Epilasyon", 45, 900, 0.3],
      ["Manikür & Pedikür", 50, 450, 0.4],
      ["Kaş Tasarımı", 25, 300, 0.45],
      ["Anti-Age Bakım", 75, 1200, 0.35],
    ]),
    notes: { 1: "Hassas cilt, ürün alerjisi var.", 5: "Lazer seans 4/8.", 9: "Paket müşterisi — 10 seans." },
  },
  otoyikama: {
    businessName: "AquaShine Detailing",
    staff: mkStaff([
      ["Ekip A", "İç-Dış Yıkama"],
      ["Ekip B", "Detailing"],
      ["Tamer Boz", "Pasta & Cila"],
    ]),
    services: mkServices([
      ["Dış Yıkama", 20, 200, 0.25],
      ["İç-Dış Komple", 40, 350, 0.25],
      ["Pasta & Cila", 90, 900, 0.3],
      ["Motor Yıkama", 30, 300, 0.3],
      ["Seramik Kaplama", 120, 2500, 0.3],
    ]),
    notes: { 2: "Siyah Passat — pasta hassasiyeti.", 4: "Aylık abonelik.", 8: "Jant detayına dikkat." },
  },
  veteriner: {
    businessName: "PatiVet Kliniği",
    staff: mkStaff([
      ["Vet. Hekim Deniz Acar", "Veteriner Hekim"],
      ["Vet. Hekim Ece Yıldız", "Veteriner Hekim"],
    ]),
    services: mkServices([
      ["Genel Muayene", 20, 400, 0.1],
      ["Karma Aşı", 15, 500, 0.1],
      ["Kuduz Aşısı", 10, 350, 0.1],
      ["Tırnak Kesimi", 15, 200, 0.15],
      ["Diş Temizliği", 40, 900, 0.1],
      ["Mikroçip", 15, 600, 0.1],
    ]),
    notes: { 0: "Pamuk · kısırlaştırma kontrolü", 1: "Boncuk · aşı tekrarı", 3: "Zeytin · tırnak kesimi", 6: "Duman · diş temizliği randevusu" },
  },
  diyetisyen: {
    businessName: "Denge Beslenme Danışmanlığı",
    staff: mkStaff([
      ["Dyt. Selin Aksoy", "Diyetisyen"],
      ["Dyt. Mert Can", "Sporcu Beslenmesi"],
      ["Dyt. Aslı Tunç", "Klinik Beslenme"],
    ]),
    services: mkServices([
      ["İlk Görüşme + Ölçüm", 60, 1200, 0.4],
      ["Beslenme Danışmanlığı", 45, 800, 0.4],
      ["Kontrol Seansı", 30, 500, 0.35],
      ["Online Danışmanlık", 40, 700, 0.35],
      ["Sporcu Beslenme Planı", 60, 1500, 0.45],
    ]),
    notes: { 0: "Glütensiz beslenme planı istiyor.", 3: "Hedef: 8 kg verme — 12. hafta.", 7: "Vejetaryen menü tercih ediyor." },
  },
  psikolog: {
    businessName: "Mavi Psikoloji",
    staff: mkStaff([
      ["Psk. Deniz Yıldırım", "Klinik Psikolog"],
      ["Uzm. Psk. Ela Soy", "Çift Terapisti"],
      ["Psk. Kaan Arı", "Bireysel Terapi"],
    ]),
    services: mkServices([
      ["İlk Değerlendirme", 60, 1500, 0.5],
      ["Bireysel Terapi (50 dk)", 50, 1200, 0.5],
      ["Çift Terapisi", 80, 1800, 0.5],
      ["Online Seans", 50, 1000, 0.45],
      ["Aile Görüşmesi", 70, 1600, 0.5],
    ]),
    notes: { 1: "Kaygı bozukluğu — haftalık seans.", 5: "Çift terapisi 4. seans.", 9: "Online seansı tercih ediyor." },
  },
  doktor: {
    businessName: "Vita Sağlık Kliniği",
    staff: mkStaff([
      ["Dr. Murat Şen", "Dahiliye"],
      ["Dr. Ayça Demir", "Kardiyoloji"],
      ["Dr. Onur Kaya", "Genel Cerrahi"],
    ]),
    services: mkServices([
      ["Muayene", 20, 900, 0.3],
      ["Kontrol", 15, 500, 0.3],
      ["Online Konsültasyon", 20, 600, 0.3],
      ["Tahlil Değerlendirme", 15, 400, 0.25],
      ["Detaylı Check-up", 40, 2500, 0.35],
    ]),
    notes: { 0: "Tansiyon takibi gerekiyor.", 3: "Kontrol — tahlil sonucu bekleniyor.", 6: "Kronik hasta, aylık kontrol." },
  },
  dishekimi: {
    businessName: "Beyaz Diş Polikliniği",
    staff: mkStaff([
      ["Dt. Cem Aksu", "Diş Hekimi"],
      ["Dt. Pelin Yurt", "Ortodonti"],
      ["Dt. Barış Eren", "İmplantoloji"],
    ]),
    services: mkServices([
      ["Muayene", 20, 400, 0.3],
      ["Diş Temizliği (Detertraj)", 30, 800, 0.35],
      ["Dolgu", 45, 1200, 0.4],
      ["Kanal Tedavisi", 60, 2500, 0.4],
      ["Kontrol", 15, 0, 0.2],
    ]),
    notes: { 0: "Kanal tedavisi 2. seans.", 3: "İmplant kontrolü — 6. ay.", 6: "Diş hassasiyeti var." },
  },
  restoran: {
    businessName: "Gusto Restoran",
    staff: mkStaff([
      ["Ahmet Kurye", "Kurye"],
      ["Mehmet Garson", "Garson"],
      ["Ayşe Mutfak", "Aşçı"],
    ]),
    services: mkPosProducts([
      ["Hamburger Menü", 15, 250, "8690000000017", 40],
      ["Margarita Pizza", 20, 300, "8690000000024", 30],
      ["Kutu Kola", 5, 50, "8690000000031", 120],
    ]),
    notes: { 0: "Soğansız, bol soslu.", 3: "Paket servis (Acil)." },
  },
  market: {
    businessName: "Bizim Bakkal",
    staff: mkStaff([
      ["Ali Kasa", "Kasiyer"],
      ["Veli Depo", "Depo"],
    ]),
    services: mkPosProducts([
      ["Ekmek", 5, 10, "8690000000048", 200],
      ["Su (1L)", 5, 15, "8690000000055", 300],
      ["Çikolata", 5, 30, "8690000000062", 150],
    ]),
    notes: { 0: "Veresiye hesabı", 2: "Cari bakiyesi var." },
  },
  kafe: {
    businessName: "Bean Coffee",
    staff: mkStaff([
      ["Can Barista", "Barista"],
      ["Ece Garson", "Garson"],
    ]),
    services: mkPosProducts([
      ["Filtre Kahve", 10, 80, "8690000000079", 80],
      ["Latte", 10, 100, "8690000000086", 80],
      ["Cheesecake", 5, 150, "8690000000093", 25],
    ]),
    notes: { 1: "Süt alerjisi, yulaf sütlü.", 5: "Daimi müşteri." },
  },
  pastane: {
    businessName: "Tatlı Fırın",
    staff: mkStaff([
      ["Usta Hasan", "Usta"],
      ["Merve Kasa", "Tezgahtar"],
    ]),
    services: mkPosProducts([
      ["Poğaça", 5, 20, "8690000000109", 150],
      ["Su Böreği (Porsiyon)", 5, 100, "8690000000116", 40],
      ["Yaş Pasta (Dilim)", 5, 120, "8690000000123", 30],
    ]),
    notes: { 2: "Toplu sipariş (20 adet poğaça).", 6: "Doğum günü pastası." },
  },
};

function todayStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

// Deterministik psödo-random (seed sabit kalsın)
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function toMin(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function buildAppointments(
  staff: Staff[],
  services: Service[],
  customers: Customer[]
): Appointment[] {
  const rand = rng(42);
  const slots = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30"];
  const out: Appointment[] = [];
  let id = 1;

  // Aynı personel-gün için süre çakışmasını engelle: yerleştirilmiş aralıklarla kontrol
  function pickNonOverlapping(
    occupied: { start: number; end: number }[],
    durationMin: number
  ): string | null {
    const order = [...slots].sort(() => rand() - 0.5);
    for (const slot of order) {
      const s = toMin(slot);
      const e = s + durationMin;
      const clash = occupied.some((iv) => s < iv.end && iv.start < e);
      if (!clash) {
        occupied.push({ start: s, end: e });
        return slot;
      }
    }
    return null;
  }

  // Son 30 günün geçmiş randevuları (raporlar için) — "geri kazanım" için ilk 4 müşteri hariç tutulur
  const recentCustomers = customers.slice(4); // 0-3 arası: uzun süredir gelmeyenler
  const lapsedCusts = customers.slice(0, 4); // geri kazanım adayları

  // Geri kazanım adaylarının ESKİ ziyaretleri (50-95 gün önce) — daha önce harcamış ama uzun süredir yok
  // Gün+personel bazında dolu aralıklar (süre çakışmasını engellemek için)
  const occByKey = new Map<string, { start: number; end: number }[]>();
  const occ = (date: string, staffId: string) => {
    const k = date + "|" + staffId;
    let arr = occByKey.get(k);
    if (!arr) { arr = []; occByKey.set(k, arr); }
    return arr;
  };

  for (let li = 0; li < lapsedCusts.length; li++) {
    const cust = lapsedCusts[li];
    const visits = 1 + Math.floor(rand() * 3); // 1-3 eski ziyaret
    for (let v = 0; v < visits; v++) {
      const ago = -(50 + li * 12 + Math.floor(rand() * 30));
      const date = todayStr(ago);
      const s = staff[Math.floor(rand() * staff.length)];
      const svc = services[Math.floor(rand() * services.length)];
      const slot = pickNonOverlapping(occ(date, s.id), svc.durationMin);
      if (!slot) continue;
      out.push({ id: "apt-" + id++, date, start: slot, staffId: s.id, customerId: cust.id, serviceId: svc.id, status: "geldi", source: "panel", priceSnapshot: svc.price, commissionRateSnapshot: svc.commissionRate, serviceNameSnapshot: svc.name, staffNameSnapshot: s.name });
    }
  }
  for (let dayOffset = -30; dayOffset <= -1; dayOffset++) {
    const date = todayStr(dayOffset);
    const dow = new Date(date + "T00:00:00").getDay();
    if (dow === 0) continue; // pazar kapalı
    for (const s of staff) {
      const count = 2 + Math.floor(rand() * 4); // 2-5 randevu
      for (let i = 0; i < count; i++) {
        const cust = recentCustomers[Math.floor(rand() * recentCustomers.length)];
        const svc = services[Math.floor(rand() * services.length)];
        const slot = pickNonOverlapping(occ(date, s.id), svc.durationMin);
        if (!slot) continue;
        const status: AppointmentStatus = rand() > 0.12 ? "geldi" : "iptal";
        out.push({ id: "apt-" + id++, date, start: slot, staffId: s.id, customerId: cust.id, serviceId: svc.id, status, source: rand() > 0.7 ? "online" : "panel", priceSnapshot: svc.price, commissionRateSnapshot: svc.commissionRate, serviceNameSnapshot: svc.name, staffNameSnapshot: s.name });
      }
    }
  }

  // Bugün + yarın için randevular
  for (const dayOffset of [0, 1]) {
    const date = todayStr(dayOffset);
    for (const s of staff) {
      const count = 3 + Math.floor(rand() * 3);
      for (let i = 0; i < count; i++) {
        const cust = recentCustomers[Math.floor(rand() * recentCustomers.length)];
        const svc = services[Math.floor(rand() * services.length)];
        const slot = pickNonOverlapping(occ(date, s.id), svc.durationMin);
        if (!slot) continue;
        let status: AppointmentStatus = "bekliyor";
        if (dayOffset === 0) {
          const hour = parseInt(slot.slice(0, 2), 10);
          if (hour < 12) status = rand() > 0.2 ? "geldi" : "iptal";
        }
        out.push({ id: "apt-" + id++, date, start: slot, staffId: s.id, customerId: cust.id, serviceId: svc.id, status, source: rand() > 0.7 ? "online" : "panel", priceSnapshot: svc.price, commissionRateSnapshot: svc.commissionRate, serviceNameSnapshot: svc.name, staffNameSnapshot: s.name });
      }
    }
  }
  return out;
}

function slugify(name: string) {
  const map: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" };
  return name
    .toLowerCase()
    .replace(/[çğıöşü]/g, (m) => map[m] ?? m)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28);
}

function seedCampaigns(sector: SectorId, businessName: string, customers: Customer[]): Campaign[] {
  const now = new Date().toISOString();
  // "Bu ay doğum günü" reach'i GERÇEK: birthday ayı içinde bulunduğumuz aya eşit olanları say.
  const thisMonth = new Date().getMonth() + 1;
  const bdayThisMonth = customers.filter((c) => {
    if (!c.birthday) return false;
    const parts = c.birthday.split("-").map((p) => parseInt(p, 10));
    const month = parts.length >= 3 ? parts[1] : parts[0];
    return Number.isFinite(month) && month === thisMonth;
  }).length;
  return [
    {
      id: "cmp-1",
      title: "45+ gündür gelmeyenlere %20",
      kind: "geri-kazanim",
      channel: "whatsapp",
      message: `Sizi özledik! ${businessName} olarak, bu hafta gelmeniz için %20 indirim hediye ettik. Randevu için linke tıklayın.`,
      audience: "45+ gündür gelmeyenler",
      reach: 4,
      active: true,
      createdAt: now,
    },
    {
      id: "cmp-2",
      title: "Doğum günü hediyesi",
      kind: "dogum-gunu",
      channel: "sms",
      message: `Doğum gününüz kutlu olsun! Bu ay size özel ücretsiz bir ekstra ${
        sector === "diyetisyen" || sector === "psikolog" || sector === "doktor" || sector === "dishekimi" || sector === "veteriner"
          ? "kontrol seansı"
          : "bakım"
      } bizden.`,
      audience: "Bu ay doğum günü olanlar",
      reach: bdayThisMonth,
      active: false,
      createdAt: now,
    },
  ];
}

function seedReminderLogs(): { template: string; logs: BusinessState["reminderLogs"] } {
  const template = "Merhaba {ad}, {isletme} olarak yarın {saat} randevunuzu ({hizmet}) hatırlatırız. Görüşmek üzere!";
  const now = Date.now();
  const logs: BusinessState["reminderLogs"] = [
    { id: "rl-1", at: new Date(now - 2 * 36e5).toISOString(), channel: "whatsapp", to: "Mustafa Çelik", text: "Yarın 14:00 randevunuzu hatırlatırız.", status: "okundu" },
    { id: "rl-2", at: new Date(now - 5 * 36e5).toISOString(), channel: "whatsapp", to: "Ayşe Koç", text: "Yarın 10:30 randevunuzu hatırlatırız.", status: "iletildi" },
    { id: "rl-3", at: new Date(now - 26 * 36e5).toISOString(), channel: "sms", to: "Caner Yıldız", text: "Yarın 16:00 randevunuzu hatırlatırız.", status: "gonderildi" },
  ];
  return { template, logs };
}

function seedBilling(): { subscription: Subscription; invoices: Invoice[] } {
  const start = new Date();
  start.setMonth(start.getMonth() - 3);
  const next = new Date();
  next.setMonth(next.getMonth() + 1);
  next.setDate(1);
  const subscription: Subscription = {
    planId: "profesyonel",
    startedAt: start.toISOString().slice(0, 10),
    nextRenewal: next.toISOString().slice(0, 10),
  };
  const invoices: Invoice[] = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    d.setDate(1);
    invoices.push({
      id: "inv-" + (1000 + i),
      date: d.toISOString().slice(0, 10),
      amount: 3500,
      planLabel: "Pro — Aylık",
      status: "odendi",
    });
  }
  return { subscription, invoices };
}

// ---- Sektöre özel müşteri verisi (demo dolu görünsün) ----
// İlgili sektörde müşterilere yapısal alanlar (pet/aşı, tedavi planı, ölçüm geçmişi) ekler.
function enrichCustomers(sector: SectorId, customers: Customer[]): Customer[] {
  if (sector === "veteriner") {
    // İndeksler seed notlarıyla hizalı: 0 Pamuk, 1 Boncuk, 3 Zeytin, 6 Duman
    const pets: Record<number, PetInfo> = {
      0: { name: "Pamuk", species: "Kedi", breed: "British Shorthair", birthYear: 2021 },
      1: { name: "Boncuk", species: "Köpek", breed: "Golden Retriever", birthYear: 2019 },
      2: { name: "Maviş", species: "Muhabbet Kuşu", birthYear: 2023 },
      3: { name: "Zeytin", species: "Kedi", breed: "Tekir", birthYear: 2022 },
      5: { name: "Karamel", species: "Köpek", breed: "Beagle", birthYear: 2018 },
      6: { name: "Duman", species: "Köpek", breed: "Pomeranian", birthYear: 2020 },
    };
    const vacc = (kuduzDue: number, karmaDue: number): VaccineRecord[] => [
      { id: "vac-" + Math.random().toString(36).slice(2, 8), name: "Karma Aşı", date: todayStr(-330), nextDue: todayStr(karmaDue) },
      { id: "vac-" + Math.random().toString(36).slice(2, 8), name: "Kuduz Aşısı", date: todayStr(-350), nextDue: todayStr(kuduzDue) },
    ];
    // Bazıları yaklaşan (0-14 gün), bazıları gecikmiş (negatif) — [kuduzDue, karmaDue]
    const dueSets: Record<number, [number, number]> = {
      0: [10, 35], // Pamuk: kuduz yaklaşıyor
      1: [-6, 20], // Boncuk: kuduz gecikti
      2: [40, 8], // Maviş: karma yaklaşıyor
      3: [5, -12], // Zeytin: kuduz yaklaşıyor, karma gecikti
      5: [25, 12], // Karamel: karma yaklaşıyor
      6: [-20, 60], // Duman: kuduz gecikti
    };
    return customers.map((c, i) => {
      const pet = pets[i];
      if (pet) {
        const [k, ka] = dueSets[i] ?? [60, 60];
        return { ...c, pet, vaccines: vacc(k, ka) };
      }
      return c;
    });
  }

  if (sector === "dishekimi") {
    const plans: Record<number, TreatmentRecord[]> = {
      0: [
        { id: "trt-1", date: todayStr(-14), tooth: "26", name: "Kanal Tedavisi", status: "yapıldı" },
        { id: "trt-2", date: todayStr(7), tooth: "26", name: "Kanal Tedavisi (2. seans)", status: "planlandı" },
      ],
      1: [
        { id: "trt-3", date: todayStr(-3), tooth: "11", name: "Dolgu", status: "yapıldı" },
        { id: "trt-4", date: todayStr(-3), name: "Diş Temizliği (Detertraj)", status: "yapıldı" },
      ],
      3: [
        { id: "trt-5", date: todayStr(5), tooth: "36", name: "İmplant Kontrolü", status: "planlandı" },
        { id: "trt-6", date: todayStr(-40), tooth: "36", name: "İmplant", status: "yapıldı" },
      ],
      6: [
        { id: "trt-7", date: todayStr(2), tooth: "14", name: "Dolgu", status: "planlandı" },
      ],
    };
    return customers.map((c, i) => (plans[i] ? { ...c, treatments: plans[i] } : c));
  }

  if (sector === "diyetisyen") {
    // Azalan kilo trendi + boy + hedef
    const profiles: Record<number, { heightCm: number; target: number; start: number }> = {
      0: { heightCm: 168, target: 70, start: 86 },
      1: { heightCm: 175, target: 78, start: 92 },
      3: { heightCm: 162, target: 60, start: 74 },
      4: { heightCm: 180, target: 82, start: 95 },
      7: { heightCm: 170, target: 65, start: 80 },
    };
    return customers.map((c, i) => {
      const p = profiles[i];
      if (!p) return c;
      const steps = 5;
      const measurements: MeasurementRecord[] = Array.from({ length: steps }, (_, k) => {
        const ratio = k / (steps - 1);
        const w = p.start - (p.start - (p.target + 2)) * ratio; // hedefe yaklaşan ama tam değil
        return {
          id: "msr-" + i + "-" + k,
          date: todayStr(-(steps - 1 - k) * 14), // 2 haftada bir
          weightKg: Math.round(w * 10) / 10,
          note: k === 0 ? "İlk ölçüm" : undefined,
        };
      });
      return { ...c, heightCm: p.heightCm, targetWeightKg: p.target, measurements };
    });
  }

  return customers;
}

// ---- Kasa demo verisi ----
// Tamamlanan randevuların ÇOĞU aynı gün tahsil edilir; bir kısmı kasıtlı olarak
// AÇIK bırakılır → demo işletmede gerçek borçlu/veresiye listesi oluşur (kasa ekranı
// boş görünmesin, yaşlandırma anlamlı olsun). Deterministik: seed sabit.
function buildPayments(appointments: Appointment[]): Payment[] {
  const rand = rng(7);
  const methods: PaymentMethod[] = ["nakit", "kart", "kart", "havale"];
  const out: Payment[] = [];
  let id = 1;
  for (const a of appointments) {
    if (a.status !== "geldi" || a.approval === "reddedildi") continue;
    const price = a.priceSnapshot ?? 0;
    if (price <= 0) continue;
    const r = rand();
    if (r < 0.18) continue; // ~%18 veresiye — açık borç kalır
    const method = methods[Math.floor(rand() * methods.length)]!;
    // ~%8 kısmi ödeme (yarısı) → kalan borç
    const amount = r < 0.26 ? Math.round(price / 2) : price;
    out.push({
      id: "pay-" + id++,
      date: a.date,
      amount,
      method,
      customerId: a.customerId,
      appointmentId: a.id,
      createdAt: new Date(a.date + "T12:00:00Z").toISOString(),
    });
  }
  return out;
}

// Giderler CİRODAN türetilir — sabit rakam kullanılmaz. Sabitler, seed cirosu
// sektöre/fiyata göre değiştiğinde ölçeksiz kalıyordu: demo işletme 30 günde
// ₺79.350 ciro yapıp ₺61.400 gider gösteriyor, net ₺650'de kalıyordu. Rakamlar
// doğruydu ama demo ürünü "zarar ediyor" gibi gösteriyordu.
// Oranlar tipik bir randevu işletmesinden: gider ≈ cironun %45'i.
function buildExpenses(monthlyRevenue: number): Expense[] {
  const base = Math.max(20000, Math.round(monthlyRevenue));
  const pct = (p: number) => Math.round((base * p) / 100 / 50) * 50; // 50 ₺'ye yuvarla
  const rows: { days: number; amount: number; category: Expense["category"]; note: string }[] = [
    { days: -28, amount: pct(15), category: "kira", note: "Dükkân kirası" },
    { days: -28, amount: pct(20), category: "maas", note: "Personel maaşları" },
    { days: -21, amount: pct(4), category: "malzeme", note: "Malzeme alımı" },
    { days: -14, amount: pct(2.5), category: "fatura", note: "Elektrik + su" },
    { days: -9, amount: pct(2), category: "malzeme", note: "Malzeme alımı" },
    { days: -3, amount: pct(1.5), category: "diger", note: "Temizlik" },
  ];
  return rows.map((r, i) => ({
    id: "exp-" + (i + 1),
    date: todayStr(r.days),
    amount: r.amount,
    category: r.category,
    note: r.note,
    createdAt: new Date(todayStr(r.days) + "T10:00:00Z").toISOString(),
  }));
}

export function seedFor(sector: SectorId): BusinessState {
  const d = SECTOR_DATA[sector];
  const customers = enrichCustomers(sector, mkCustomers(d.notes));
  const appointments = buildAppointments(d.staff, d.services, customers);
  const { template, logs } = seedReminderLogs();
  const { subscription, invoices } = seedBilling();
  return {
    sector,
    businessName: d.businessName,
    bookingSlug: slugify(d.businessName),
    staff: d.staff,
    services: d.services,
    customers,
    appointments,
    campaigns: seedCampaigns(sector, d.businessName, customers),
    reminderSettings: { enabled: true, channel: "whatsapp", hoursBefore: 24, template },
    reminderLogs: logs,
    subscription,
    invoices,
    payments: buildPayments(appointments),
    // Son 30 günün cirosu → giderler bununla ölçeklenir.
    expenses: buildExpenses(
      appointments
        .filter((a) => a.status === "geldi" && a.date >= todayStr(-30))
        .reduce((sum, a) => sum + (a.priceSnapshot ?? 0), 0)
    ),
  };
}
