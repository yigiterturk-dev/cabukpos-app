// "Konuşarak yönet" motoru (demo): doğal Türkçe soruyu rapor/stok cevabına çevirir.
// Harici servis yok — deterministik. Gerçek üründe bu fonksiyonun yeri bir LLM + gerçek rapor sorgusudur (aynı imza).
export type Answer = { answer: string; rows?: { label: string; value: string }[]; period?: string };
export type StockItem = { name: string; qty: number; min: number };
export type SaleRow = { name: string; qty: number; revenue: number };

// --- Demo verisi (sabit; index 0 = bugün, 1 = dün, ...) ---
const PRICE: Record<string, number> = { "Süt": 3250, "Ekmek": 1000, "Kola": 4000, "Çikolata": 2500, "Yumurta": 6800, "Su": 1500, "Kahve": 12000 };
const QTY: Record<string, number[]> = {
  "Süt": [12, 9, 15, 11, 14, 10, 13],
  "Ekmek": [40, 36, 44, 39, 42, 38, 41],
  "Kola": [22, 18, 25, 20, 23, 19, 24],
  "Çikolata": [16, 14, 18, 15, 17, 13, 16],
  "Yumurta": [8, 6, 9, 7, 8, 6, 7],
  "Su": [55, 50, 60, 52, 58, 49, 54],
};
const FICHE = [42, 38, 50, 35, 47, 40, 44]; // günlük fiş sayısı
const WEEKDAYS = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
const dayLabel = (offset: number) => WEEKDAYS[(new Date(Date.now() - offset * 86_400_000)).getDay()];
export const STOCK: StockItem[] = [
  { name: "Süt", qty: 3, min: 10 }, { name: "Ekmek", qty: 40, min: 20 }, { name: "Kola", qty: 18, min: 10 },
  { name: "Çikolata", qty: 4, min: 12 }, { name: "Yumurta", qty: 22, min: 8 }, { name: "Kahve", qty: 2, min: 6 },
];

const dayTotal = (i: number) => Object.entries(QTY).reduce((a, [n, arr]) => a + arr[i] * PRICE[n], 0);
const PERIODS: { keys: string[]; days: number; label: string }[] = [
  { keys: ["bugün", "bugun"], days: 1, label: "bugün" },
  { keys: ["dün", "dun"], days: 2, label: "dün" },
  { keys: ["hafta", "7 gün", "haftalık", "haftalik"], days: 7, label: "bu hafta" },
  { keys: ["ay", "aylık", "aylik", "30 gün"], days: 30, label: "bu ay" },
];
const nrm = (s: string) => s.toLocaleLowerCase("tr").replace(/\s+/g, " ").trim();

/** Son `days` günün ürün satışlarını toplar (index 0 bugün). */
function periodSales(days: number): SaleRow[] {
  const span = Math.min(days, 7);
  const start = days === 1 ? 0 : days === 2 ? 1 : 0; // dün = yalnız 1 gün önce
  const rows: SaleRow[] = Object.entries(QTY).map(([name, arr]) => {
    const qty = arr.slice(start, start + (days === 2 ? 1 : span)).reduce((a, q) => a + q, 0);
    return { name, qty, revenue: qty * PRICE[name] };
  });
  return rows.sort((a, b) => b.revenue - a.revenue);
}
function periodRevenue(days: number): { revenue: number; fiche: number } {
  const idx = days === 1 ? [0] : days === 2 ? [1] : Array.from({ length: Math.min(days, 7) }, (_, i) => i);
  const revenue = idx.reduce((a, i) => a + dayTotal(i), 0);
  const fiche = idx.reduce((a, i) => a + FICHE[i], 0);
  return { revenue, fiche };
}

const fmt = (k: number) => `${(k / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;

export function query(text: string): Answer {
  const s = nrm(text);
  const period = PERIODS.find((p) => p.keys.some((k) => s.includes(k)));
  const days = period?.days ?? 1;
  const label = period?.label ?? "bugün";

  const has = (...ks: string[]) => ks.some((k) => s.includes(k));

  // Tüm stok listesi
  if (has("stok") && has("tüm", "hepsi", "liste", "durum")) {
    return { answer: "Tüm ürünlerin stok durumu:", rows: STOCK.map((it) => ({ label: it.name, value: `${it.qty} adet${it.qty <= it.min ? " · kritik" : ""}` })) };
  }

  // Stok: belirli ürün mü, genel kritik liste mi?
  if (has("stok", "bitti", "kritik", "kaldı", "kaldi", "tükendi", "tukendi")) {
    const named = STOCK.find((it) => s.includes(nrm(it.name)));
    if (named) {
      const kritik = named.qty <= named.min;
      return { answer: `${named.name}: ${named.qty} adet kaldı.${kritik ? ` Kritik seviye (eşik ${named.min}) — sipariş ver.` : " Stok yeterli."}` };
    }
    const crit = STOCK.filter((it) => it.qty <= it.min).sort((a, b) => a.qty / a.min - b.qty / b.min);
    if (!crit.length) return { answer: "Kritik stokta ürün yok. Her şey eşiğin üzerinde." };
    return { answer: `${crit.length} ürün kritik seviyede:`, rows: crit.map((it) => ({ label: it.name, value: `${it.qty} adet (eşik ${it.min})` })) };
  }

  // Öngörülü stok: satış hızından "ne bitecek" + önerilen sipariş
  if (has("bitecek", "tükenecek", "tukenecek", "sipariş", "siparis", "tahmin", "önsezi", "onsezi", "ne zaman")) {
    const rows = STOCK.flatMap((it) => {
      const arr = QTY[it.name];
      if (!arr) return [];
      const avg = arr.reduce((a, q) => a + q, 0) / arr.length;
      if (avg <= 0) return [];
      const daysLeft = it.qty / avg;
      return daysLeft <= 7 ? [{ name: it.name, daysLeft, order: Math.max(0, Math.ceil(avg * 14 - it.qty)) }] : [];
    }).sort((a, b) => a.daysLeft - b.daysLeft);
    if (!rows.length) return { answer: "Önümüzdeki günlerde bitecek ürün yok; stoklar satış hızını kaldırıyor." };
    return { answer: "Satış hızına göre yakında bitecekler ve önerilen sipariş:", rows: rows.map((r) => ({ label: `${r.name} · ~${Math.max(0, Math.round(r.daysLeft))} gün`, value: `sipariş ${r.order} adet` })) };
  }

  // En iyi gün (son 7 gün)
  if (has("gün") && (has("hangi", "yoğun", "iyi") || has("en çok"))) {
    let bi = 0, bv = -1;
    for (let i = 0; i < 7; i++) { const v = dayTotal(i); if (v > bv) { bv = v; bi = i; } }
    return { answer: `Son 7 günün en iyi günü: ${dayLabel(bi)} (${bi === 0 ? "bugün" : `${bi} gün önce`}) — ${fmt(bv)}.` };
  }

  // En çok satan ürünler
  if (has("en çok", "en fazla", "en iyi satan") && has("satan", "satt", "ürün", "ne")) {
    const top = periodSales(days).slice(0, 5);
    return { answer: `${label} en çok satan ürünler:`, period: label, rows: top.map((r, i) => ({ label: `${i + 1}. ${r.name}`, value: `${r.qty} adet · ${fmt(r.revenue)}` })) };
  }

  // Ciro / gelir
  if (has("ciro", "satış", "satis", "kazanç", "kazanc", "gelir", "hasılat", "hasilat")) {
    const { revenue, fiche } = periodRevenue(days);
    return { answer: `${label} cirosu ${fmt(revenue)} (${fiche} fiş).`, period: label };
  }

  // Fiş / adet sayısı
  if (has("kaç", "kac", "fiş", "fis", "adet sat")) {
    const { fiche } = periodRevenue(days);
    return { answer: `${label} ${fiche} fiş kesildi.`, period: label };
  }

  // Ortalama sepet
  if (has("ortalama", "sepet", "adet ort")) {
    const { revenue, fiche } = periodRevenue(days);
    return { answer: `${label} ortalama sepet ${fmt(Math.round(revenue / Math.max(1, fiche)))}.`, period: label };
  }

  return { answer: "Anlayamadım. Şunları sorabilirsin: “bugün ciro”, “dün en çok ne sattım”, “kritik stok”, “kaç fiş”, “ortalama sepet”." };
}
