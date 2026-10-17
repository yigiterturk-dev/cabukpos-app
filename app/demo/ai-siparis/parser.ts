// AI sipariş çözümleyici (demo): doğal Türkçe metni ("2 adana bir ayran bi de künefe") ürün satırlarına çevirir.
// Harici servis yok — deterministik. Gerçek üründe bu fonksiyonun yeri bir LLM çağrısıdır (aynı imza korunur).
export type OrderProduct = { id: string; name: string; price: number; kind: "adet" | "tartili" };
export type ParsedLine = { productId: string; name: string; qtyMilli: number; unitPrice: number; kind: "adet" | "tartili" };
export type ParseResult = { lines: ParsedLine[]; unmatched: string[]; total: number };

const nrm = (s: string) => s.toLocaleLowerCase("tr").replace(/şu/g, "shu").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/ı/g, "i").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

const NUM: Record<string, number> = Object.fromEntries(Object.entries({
  bir: 1, iki: 2, "üç": 3, uc: 3, "dört": 4, dort: 4, "beş": 5, bes: 5, altı: 6, alti: 6, yedi: 7, sekiz: 8, dokuz: 9, on: 10,
  yarım: 0.5, yarim: 0.5, "çeyrek": 0.25, ceyrek: 0.25,
}).map(([word, quantity]) => [nrm(word), quantity]));
const FILLER = new Set(["alo", "iyi", "günler", "gunler", "olur", "mu", "misiniz", "misin", "bi", "tane", "adet", "olsun", "lutfen", "lütfen", "de", "da", "daha", "ekle", "ekleyin", "ekler misiniz", "al", "ver", "getir", "bu", "şu", "bana", "bir"].map(nrm));
const KG = new Set(["kilo", "kg", "kilogram"].map(nrm));

const words = (s: string) => nrm(s).split(" ").filter(Boolean);
const qtyOf = (w: string): number | null => {
  if (/^\d+(?:[.,]\d+)?$/.test(w)) return Number(w.replace(",", "."));
  return w in NUM ? NUM[w] : null;
};

/** Kelime dizisini soldan sağa tarar: miktar + ürün adı eşleştirir, "ve/ile" ile ayırır. */
export function parseOrder(text: string, products: OrderProduct[]): ParseResult {
  const w = words(text);
  const index = products.map((p) => ({ p, keys: words(p.name).filter((k) => !FILLER.has(k)) }));
  const lines = new Map<string, ParsedLine>();
  const unmatched: string[] = [];
  let pending: string[] = [];
  let qty = 1, weighed = false;

  const flush = () => { if (pending.length) { unmatched.push(pending.join(" ")); pending = []; } };
  const emit = (p: OrderProduct) => {
    const kg = weighed || p.kind === "tartili";
    const qtyMilli = Math.round(qty * 1000);
    const ex = lines.get(p.id);
    if (ex) ex.qtyMilli += qtyMilli;
    else lines.set(p.id, { productId: p.id, name: p.name, qtyMilli, unitPrice: p.price, kind: kg ? "tartili" : "adet" });
    flush(); qty = 1; weighed = false;
  };

  let i = 0;
  while (i < w.length) {
    const word = w[i];
    if (word === "bir" && w[i + 1] === "bucuk") { qty = 1.5; i += 2; continue; }
    const q = qtyOf(word);
    if (q !== null) { qty = q; i++; continue; }
    if (KG.has(word)) { weighed = true; i++; continue; }
    if (word === "ve" || word === "ile") { flush(); qty = 1; weighed = false; i++; continue; }
    if (FILLER.has(word)) { i++; continue; }
    // kelimeyi içeren en uzun ürün adını seç, ardışık ürün kelimelerini tüket
    let hit: typeof index[number] | null = null;
    for (const it of index) if (it.keys.includes(word) && (!hit || it.keys.length > hit.keys.length)) hit = it;
    if (hit) {
      emit(hit.p);
      i++;
      while (i < w.length && hit.keys.includes(w[i])) i++;
      continue;
    }
    pending.push(word); i++;
  }
  flush();
  const arr = [...lines.values()];
  const total = arr.reduce((a, l) => a + Math.round((l.unitPrice * l.qtyMilli) / 1000), 0);
  return { lines: arr, unmatched, total };
}
