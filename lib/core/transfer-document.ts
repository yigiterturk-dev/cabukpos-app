import { csvCell } from "./accounting";
import { formatQty, type StockUnit } from "./stock";

export type TransferDocument = {
  id: string; createdAt: Date; fromStoreId: string; fromName: string; toStoreId: string; toName: string; note: string | null;
  lines: { productId: string; name: string; qtyMilli: number; unit: StockUnit }[];
};
export const transferDate = (date: Date) => new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul",
}).format(date);
export const transferQuantity = (qty: number, unit: StockUnit) => `${formatQty(qty, unit)}${unit === "adet" ? " adet" : ""}`;

/** Türkçe Excel: BOM, noktalı virgül, ayrı birim sütunu ve formül koruması. */
export function transferCsv(doc: TransferDocument): string {
  const rows: (string | number)[][] = [["Transfer kimliği", "Tarih (İstanbul)", "Kaynak", "Hedef", "Ürün", "Miktar", "Birim", "Not"]];
  for (const line of doc.lines) rows.push([
    doc.id, transferDate(doc.createdAt), doc.fromName, doc.toName, line.name,
    (line.qtyMilli / 1000).toLocaleString("tr-TR", { useGrouping: false, maximumFractionDigits: 3 }), line.unit, doc.note ?? "",
  ]);
  return "\ufeff" + rows.map((row) => row.map((cell) => csvCell(cell, ";")).join(";")).join("\r\n") + "\r\n";
}
