import { deliveryChannel, deliveryStageLabels } from "@/lib/core/dispatch";
import { deliveryStatus, type TabState } from "@/lib/core/tab";
import { formatReceipt, type Currency } from "@/lib/core/money";
import { intentLabel } from "@/lib/core/delivery";

export function dispatchPrintHtml(rows: TabState[], couriers: { id: string; name: string }[], day: string, currency?: Currency) {
  const esc = (value: string | number) => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  const done = rows.filter(t => deliveryStatus(t) === "teslim");
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Paket ve kurye raporu</title><style>body{font:13px system-ui;margin:24px;color:#222}h1{font-size:22px}table{border-collapse:collapse;width:100%;margin-top:20px}th,td{border-bottom:1px solid #ddd;padding:9px;text-align:left}small{color:#555}@page{size:A4 landscape;margin:12mm}</style></head><body><h1>ÇabukPOS · Paket ve kurye raporu</h1><p>${esc(day)} · ${rows.length} sipariş · ${done.length} teslim · Teslim edilen toplam ${esc(formatReceipt(done.reduce((s, t) => s + t.total, 0), currency))}</p><table><thead><tr>${["Kanal", "Müşteri", "Durum", "Kurye", "Ödeme", "Tutar", "Kalan"].map(v => `<th>${esc(v)}</th>`).join("")}</tr></thead><tbody>${rows.map(t => `<tr>${[deliveryChannel(t), t.order?.name ?? "Paket", deliveryStageLabels[deliveryStatus(t)], couriers.find(c => c.id === t.delivery.courierId)?.name ?? "Atanmamış", intentLabel(t.delivery.method ?? t.order?.payIntent ?? null), formatReceipt(t.total, currency), formatReceipt(t.remaining, currency)].map(v => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table><p><small>Sipariş tutarlarıdır; kurye kasa teslim tutanağı veya mali belge yerine geçmez.</small></p></body></html>`;
}
