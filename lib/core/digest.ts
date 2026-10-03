// lib/core/digest.ts — #41 rapor e-postası saf içeriği (DB yok, testli). Tutarlar kuruş.
import { formatTL } from "./money";

export type DigestData = {
  range: { bas: string; bit: string };
  summary: { gross: number; net: number; count: number; refunds: number; refundTotal: number; avg: number | null };
  methods: { method: string; amount: number }[];
  top: { name: string; qtyMilli: number; gross: number }[];
  review: number; // incelenecek kayıt
};

export const digestTitle = (kind: "gunluk" | "haftalik") => (kind === "gunluk" ? "Günlük özet" : "Haftalık özet");

export function digestContent(kind: "gunluk" | "haftalik", tenantName: string, d: DigestData, url: string): { subject: string; text: string; html: string } {
  const t = digestTitle(kind);
  const subject = `${t} — ${tenantName} (${d.range.bas}…${d.range.bit})`;
  const lines: [string, string][] = [
    ["Brüt ciro", formatTL(d.summary.gross)],
    ["KDV hariç", formatTL(d.summary.net)],
    ["Fiş", String(d.summary.count)],
    ["Ortalama sepet", d.summary.avg === null ? "—" : formatTL(d.summary.avg)],
    ["İade", `${d.summary.refunds} fiş / ${formatTL(d.summary.refundTotal)}`],
    ...d.methods.map((m) => [m.method, formatTL(m.amount)] as [string, string]),
    ["İncelenecek", String(d.review)],
  ];
  const text = [
    `${tenantName} — ${t} (${d.range.bas}…${d.range.bit})`,
    "",
    ...lines.map(([k, v]) => `${k}: ${v}`),
    ...(d.top.length ? ["", "Çok satanlar:", ...d.top.map((p, i) => `${i + 1}. ${p.name} — ${(p.qtyMilli / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 3 })} x, ${formatTL(p.gross)}`)] : []),
    "",
    `Ayrıntı: ${url}`,
  ].join("\n");
  const tr = (s: [string, string][]) => s.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#666">${esc(k)}</td><td style="padding:4px 0;text-align:right"><b>${esc(v)}</b></td></tr>`).join("");
  const html = `<p style="margin:0 0 8px"><b>${esc(tenantName)}</b> — ${esc(t)} (${esc(d.range.bas)}…${esc(d.range.bit)})</p>
<table style="border-collapse:collapse;font-size:14px">${tr(lines)}</table>
${d.top.length ? `<p style="margin:12px 0 4px"><b>Çok satanlar</b></p><ol style="margin:0;padding-left:18px;font-size:14px">${d.top.map((p) => `<li>${esc(p.name)} — ${(p.qtyMilli / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 3 })} x, ${esc(formatTL(p.gross))}</li>`).join("")}</ol>` : ""}
<p style="margin:14px 0 0;font-size:14px"><a href="${url}">Raporu aç</a></p>`;
  return { subject, text, html };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
