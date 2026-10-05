// Ürün CSV aktarımı için saf, tarayıcı/server ortak parser.
// Virgül içeren TL değerleri çift tırnakla, alanlar ise başlık adıyla okunur.

export type ProductCsvRow = {
  line: number;
  name: string;
  price: string;
  vatRate: string;
  category: string;
  barcodes: string;
  kind: string;
  plu: string;
  trackStock: string;
  quick: string;
  sellable: string;
  unit: string;
  cost: string;
  minStock: string;
  yieldMilli: string;
};

type Result = { ok: true; rows: ProductCsvRow[] } | { ok: false; error: string };

const aliases: Record<keyof Omit<ProductCsvRow, "line">, string[]> = {
  name: ["name", "ürün", "ürün adı", "urun", "urun adi"],
  price: ["price", "fiyat", "fiyat tl", "fiyat (tl)"],
  vatRate: ["vatrate", "vat", "kdv", "kdv oranı", "kdv orani"],
  category: ["category", "kategori"],
  barcodes: ["barcodes", "barcode", "barkod", "barkodlar"],
  kind: ["kind", "tür", "tur", "ürün türü", "urun turu"],
  plu: ["plu"],
  trackStock: ["trackstock", "stok takibi", "stok", "stok takip"],
  quick: ["quick", "hızlı tuş", "hizli tus", "hızlı", "hizli"],
  sellable: ["sellable", "kasada satılır", "kasada satilir", "satılır", "satilir"],
  unit: ["unit", "birim"],
  cost: ["cost", "maliyet"],
  minStock: ["minstock", "kritik stok", "kritik sınır", "kritik sinir"],
  yieldMilli: ["yieldmilli", "parti miktarı", "parti miktari"],
};

const normalizeHeader = (value: string) => value.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");

function cells(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(cell.trim()); cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell.trim()); cell = "";
      if (row.some((v) => v !== "")) out.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell.trim()); if (row.some((v) => v !== "")) out.push(row); }
  return out;
}

function headerIndex(headers: string[], key: keyof Omit<ProductCsvRow, "line">): number {
  const names = new Set(aliases[key]);
  return headers.findIndex((h) => names.has(normalizeHeader(h).replace(/\(.*\)$/u, "").trim()));
}

export function parseProductCsv(input: string): Result {
  const rows = cells(input.replace(/^\uFEFF/u, ""));
  if (rows.length < 2) return { ok: false, error: "CSV başlık ve en az bir ürün satırı içermeli." };
  const headers = rows[0];
  const nameAt = headerIndex(headers, "name");
  const priceAt = headerIndex(headers, "price");
  if (nameAt < 0 || priceAt < 0) return { ok: false, error: "CSV'de Ürün adı ve Fiyat (TL) sütunları zorunlu." };
  const at = (key: keyof Omit<ProductCsvRow, "line">) => headerIndex(headers, key);
  const value = (row: string[], key: keyof Omit<ProductCsvRow, "line">) => {
    const index = at(key);
    return index < 0 ? "" : row[index] ?? "";
  };
  return {
    ok: true,
    rows: rows.slice(1).map((row, index) => ({
      line: index + 2,
      name: value(row, "name"), price: value(row, "price"), vatRate: value(row, "vatRate"),
      category: value(row, "category"), barcodes: value(row, "barcodes"), kind: value(row, "kind"),
      plu: value(row, "plu"), trackStock: value(row, "trackStock"), quick: value(row, "quick"),
      sellable: value(row, "sellable"), unit: value(row, "unit"), cost: value(row, "cost"),
      minStock: value(row, "minStock"), yieldMilli: value(row, "yieldMilli"),
    })),
  };
}
