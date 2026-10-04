// lib/core/digest.ts — #41 rapor e-postası saf içeriği (DB yok, testli). Tutarlar kuruş.
import { formatTL } from "./money";

export type DigestData = {
  range: { bas: string; bit: string };
  summary: { gross: number; net: number; count: number; refunds: number; refundTotal: number; avg: number | null };
  methods: { method: string; amount: number }[];
  top: { name: string; qtyMilli: number; gross: number }[];
  review: number; // incelenecek kayıt
  // #43 aylık konsolide ekleri (yalnız aylik türde dolar)
  month?: string; // "YYYY-MM"
  channels?: { label: string; gross: number }[];
  staff?: { name: string; gross: number; count: number }[];
  critical?: { name: string; level: number; unit: string }[];
  customers?: { total: number; active30: number; new30: number; spend30: number };
};

export type DigestKind = "gunluk" | "haftalik" | "aylik";

export const digestTitle = (kind: DigestKind) => (kind === "gunluk" ? "Günlük özet" : kind === "haftalik" ? "Haftalık özet" : "Aylık konsolide rapor");

export function digestContent(kind: DigestKind, tenantName: string, d: DigestData, url: string): { subject: string; text: string; html: string } {
  const t = digestTitle(kind);
  const subject = `${t} — ${tenantName} (${d.range.bas}…${d.range.bit})`;
  const lines: [string, string][] = [
    ["Brüt ciro", formatTL(d.summary.gross)],
    ["KDV hariç", formatTL(d.summary.net)],
    ["Fiş", String(d.summary.count)],
    ["Ortalama sepet", d.summary.avg === null ? "—" : formatTL(d.summary.avg)],
    ["İade", `${d.summary.refunds} fiş / ${formatTL(d.summary.refundTotal)}`],
    ["İncelenecek", String(d.review)],
    ...(d.month ? [["Ay", d.month] as [string, string]] : []),
    ...d.methods.map((m) => [m.method, formatTL(m.amount)] as [string, string]),
    ...(d.channels ?? []).map((c) => [`Kanal: ${c.label}`, formatTL(c.gross)] as [string, string]),
    ...(d.customers ? [["Müşteri: kayıtlı / 30g aktif / 30g yeni", `${d.customers.total} / ${d.customers.active30} / ${d.customers.new30}`] as [string, string], ["Müşteri cirosu (30 gün)", formatTL(d.customers.spend30)] as [string, string]] : []),
  ];
  const text = [
    `${tenantName} — ${t} (${d.range.bas}…${d.range.bit})`,
    "",
    ...lines.map(([k, v]) => `${k}: ${v}`),
    ...(d.top.length ? ["", "Çok satanlar:", ...d.top.map((p, i) => `${i + 1}. ${p.name} — ${(p.qtyMilli / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 3 })} x, ${formatTL(p.gross)}`)] : []),
    ...(d.staff?.length ? ["", "Personel:", ...d.staff.map((st) => `${st.name}: ${formatTL(st.gross)} (${st.count} fiş)`)] : []),
    ...(d.critical?.length ? ["", "Kritik stok:", ...d.critical.map((c) => `${c.name}: ${(c.level / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 3 })} ${c.unit}`)] : []),
    "",
    `Ayrıntı: ${url}`,
  ].join("\n");
  const tr = (s: [string, string][]) => s.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#666">${esc(k)}</td><td style="padding:4px 0;text-align:right"><b>${esc(v)}</b></td></tr>`).join("");
  const html = `<p style="margin:0 0 8px"><b>${esc(tenantName)}</b> — ${esc(t)} (${esc(d.range.bas)}…${esc(d.range.bit)})</p>
<table style="border-collapse:collapse;font-size:14px">${tr(lines)}</table>
${d.top.length ? `<p style="margin:12px 0 4px"><b>Çok satanlar</b></p><ol style="margin:0;padding-left:18px;font-size:14px">${d.top.map((p) => `<li>${esc(p.name)} — ${(p.qtyMilli / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 3 })} x, ${esc(formatTL(p.gross))}</li>`).join("")}</ol>` : ""}
${d.staff?.length ? `<p style="margin:12px 0 4px"><b>Personel</b></p><table style="border-collapse:collapse;font-size:14px">${d.staff.map((st) => `<tr><td style="padding:2px 12px 2px 0">${esc(st.name)}</td><td style="text-align:right">${esc(formatTL(st.gross))}</td><td style="padding-left:8px;color:#666">${st.count} fiş</td></tr>`).join("")}</table>` : ""}
${d.critical?.length ? `<p style="margin:12px 0 4px"><b>Kritik stok</b></p><ul style="margin:0;padding-left:18px;font-size:14px">${d.critical.map((c) => `<li>${esc(c.name)}: ${(c.level / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 3 })} ${esc(c.unit)}</li>`).join("")}</ul>` : ""}
<p style="margin:14px 0 0;font-size:14px"><a href="${url}">Raporu aç</a></p>`;
  return { subject, text, html };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
