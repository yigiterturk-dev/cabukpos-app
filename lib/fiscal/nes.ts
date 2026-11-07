// lib/fiscal/nes.ts — NES Bilgi e-Arşiv / e-Fatura sürücüsü (UBL-TR 1.2, REST).
// Şimdilik YALNIZ sandbox (apitest.nes.com.tr): test ortamında gerçek biçimli belge keser, mali değeri yoktur.
// Canlı için kiracı başına kendi NES anahtarı + VKN gerekir (BYOK) — o adımda bu dosya kiracı ayarını okuyacak.
import type { FiscalProvider, IssueInput } from "./provider";

type Module = "einvoice" | "earchive";

export function nesConfig() {
  const apiKey = process.env.NES_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    base: (process.env.NES_API_URL || "https://apitest.nes.com.tr").replace(/\/$/, ""),
    senderAlias: process.env.NES_SENDER_ALIAS?.trim() || "urn:mail:defaultgb@nes.com.tr",
    // Sandbox hesabının şirket VKN'si: satıcı kimliği bu olmazsa NES belgeyi reddeder.
    sandboxVkn: process.env.NES_SANDBOX_VKN?.trim() || "1234567801",
  };
}
export const nesIsSandbox = () => (nesConfig()?.base ?? "").includes("apitest");

function cfg() {
  const c = nesConfig();
  if (!c) throw new Error("NES bağlantısı yapılandırılmamış (NES_API_KEY yok)");
  if (!c.base.includes("apitest")) throw new Error("NES canlı ortamı henüz desteklenmiyor (yalnız sandbox)");
  return c;
}

async function request(module: Module, path: string, init: RequestInit = {}) {
  const c = cfg();
  const res = await fetch(`${c.base}/${module}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${c.apiKey}`, ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...init.headers },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new NesError(res.status, (await res.text()).slice(0, 800));
  return res;
}

class NesError extends Error {
  readonly status: number;
  constructor(status: number, body: string) { super(`NES ${status}: ${body}`); this.status = status; }
}

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const tl = (kurus: number) => (kurus / 100).toFixed(2);
const amt = (kurus: number) => `currencyID="TRY">${tl(kurus)}`;

export function istanbulNow(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}:${p.second}` };
}

type Party = { taxId: string; name: string; taxOffice?: string | null; address?: string | null };

function partyXml(p: Party) {
  const tax = p.taxId.trim();
  const scheme = tax.length === 11 ? "TCKN" : "VKN";
  const parts = p.name.trim().split(/\s+/);
  const person = scheme === "TCKN"
    ? `<cac:Person><cbc:FirstName>${esc(parts.slice(0, -1).join(" ") || parts[0] || "-")}</cbc:FirstName><cbc:FamilyName>${esc(parts.length > 1 ? parts[parts.length - 1] : "-")}</cbc:FamilyName></cac:Person>`
    : "";
  return `<cac:Party><cac:PartyIdentification><cbc:ID schemeID="${scheme}">${esc(tax)}</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>${esc(p.name)}</cbc:Name></cac:PartyName><cac:PostalAddress><cbc:StreetName>${esc(p.address || "-")}</cbc:StreetName><cbc:CitySubdivisionName>Merkez</cbc:CitySubdivisionName><cbc:CityName>-</cbc:CityName><cac:Country><cbc:Name>Türkiye</cbc:Name></cac:Country></cac:PostalAddress><cac:PartyTaxScheme><cac:TaxScheme><cbc:Name>${esc(p.taxOffice || "")}</cbc:Name></cac:TaxScheme></cac:PartyTaxScheme>${person}</cac:Party>`;
}

/** Satır tutarları KDV dahil kuruş. Satış indirimi satırlara oranla dağıtılır (belge düzeyi iskonto yok → toplamlar birebir tutar). */
export function nesLines(input: Pick<IssueInput, "lines" | "discount">) {
  const gross = input.lines.reduce((s, l) => s + l.total, 0);
  let left = Math.min(input.discount, gross);
  return input.lines.map((l, i) => {
    const d = i === input.lines.length - 1 ? left : gross ? Math.round((input.discount * l.total) / gross) : 0;
    left -= d;
    const after = l.total - d;
    const net = Math.round((after * 100) / (100 + l.vatRate));
    return { name: l.name, qty: l.qty, vatRate: l.vatRate, gross: after, net, vat: after - net };
  });
}

const taxCategory = (rate: number) =>
  `<cac:TaxCategory>${rate === 0 ? "<cbc:TaxExemptionReasonCode>351</cbc:TaxExemptionReasonCode><cbc:TaxExemptionReason>KDV - İstisna Olmayan Diğer</cbc:TaxExemptionReason>" : ""}<cac:TaxScheme><cbc:Name>KDV</cbc:Name><cbc:TaxTypeCode>0015</cbc:TaxTypeCode></cac:TaxScheme></cac:TaxCategory>`;

export function nesInvoiceXml(input: IssueInput, o: { uuid: string; number: string; profile: "EARSIVFATURA" | "TEMELFATURA"; sellerVkn: string }) {
  if (!/^[A-Z0-9]{3}\d{13}$/.test(o.number)) throw new Error(`Fatura no GİB biçiminde değil: ${o.number}`);
  const lines = nesLines(input);
  if (!lines.length) throw new Error("Faturada satır yok");
  const groups = new Map<number, { net: number; vat: number }>();
  for (const l of lines) { const g = groups.get(l.vatRate) ?? { net: 0, vat: 0 }; g.net += l.net; g.vat += l.vat; groups.set(l.vatRate, g); }
  const net = lines.reduce((s, l) => s + l.net, 0), vat = lines.reduce((s, l) => s + l.vat, 0);
  const { date, time } = istanbulNow(input.soldAt);
  const lineXml = lines.map((l, i) => {
    const qty = Number(l.qty.toFixed(3));
    const unit = l.net / 100 / (qty || 1);
    return `<cac:InvoiceLine><cbc:ID>${i + 1}</cbc:ID><cbc:InvoicedQuantity unitCode="C62">${qty}</cbc:InvoicedQuantity><cbc:LineExtensionAmount ${amt(l.net)}</cbc:LineExtensionAmount><cac:TaxTotal><cbc:TaxAmount ${amt(l.vat)}</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount ${amt(l.net)}</cbc:TaxableAmount><cbc:TaxAmount ${amt(l.vat)}</cbc:TaxAmount><cbc:Percent>${l.vatRate}</cbc:Percent>${taxCategory(l.vatRate)}</cac:TaxSubtotal></cac:TaxTotal><cac:Item><cbc:Name>${esc(l.name)}</cbc:Name></cac:Item><cac:Price><cbc:PriceAmount currencyID="TRY">${unit.toFixed(4)}</cbc:PriceAmount></cac:Price></cac:InvoiceLine>`;
  }).join("");
  const subs = [...groups].map(([rate, g]) => `<cac:TaxSubtotal><cbc:TaxableAmount ${amt(g.net)}</cbc:TaxableAmount><cbc:TaxAmount ${amt(g.vat)}</cbc:TaxAmount><cbc:Percent>${rate}</cbc:Percent>${taxCategory(rate)}</cac:TaxSubtotal>`).join("");
  const sendType = o.profile === "EARSIVFATURA" ? `<cac:AdditionalDocumentReference><cbc:ID>ELEKTRONIK</cbc:ID><cbc:IssueDate>${date}</cbc:IssueDate><cbc:DocumentTypeCode>SEND_TYPE</cbc:DocumentTypeCode></cac:AdditionalDocumentReference>` : "";
  const seller: Party = { ...input.seller, taxId: o.sellerVkn };
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"><cbc:UBLVersionID>2.1</cbc:UBLVersionID><cbc:CustomizationID>TR1.2</cbc:CustomizationID><cbc:ProfileID>${o.profile}</cbc:ProfileID><cbc:ID>${o.number}</cbc:ID><cbc:CopyIndicator>false</cbc:CopyIndicator><cbc:UUID>${o.uuid}</cbc:UUID><cbc:IssueDate>${date}</cbc:IssueDate><cbc:IssueTime>${time}</cbc:IssueTime><cbc:InvoiceTypeCode>SATIS</cbc:InvoiceTypeCode><cbc:Note>ÇabukPOS test belgesi (NES sandbox)</cbc:Note><cbc:DocumentCurrencyCode>TRY</cbc:DocumentCurrencyCode><cbc:LineCountNumeric>${lines.length}</cbc:LineCountNumeric>${sendType}<cac:AccountingSupplierParty>${partyXml(seller)}</cac:AccountingSupplierParty><cac:AccountingCustomerParty>${partyXml(input.buyer)}</cac:AccountingCustomerParty><cac:TaxTotal><cbc:TaxAmount ${amt(vat)}</cbc:TaxAmount>${subs}</cac:TaxTotal><cac:LegalMonetaryTotal><cbc:LineExtensionAmount ${amt(net)}</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount ${amt(net)}</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount ${amt(net + vat)}</cbc:TaxInclusiveAmount><cbc:AllowanceTotalAmount currencyID="TRY">0.00</cbc:AllowanceTotalAmount><cbc:PayableAmount ${amt(net + vat)}</cbc:PayableAmount></cac:LegalMonetaryTotal>${lineXml}</Invoice>`;
}

async function receiverAlias(vkn: string): Promise<string | null> {
  try {
    const r = await (await request("einvoice", `/v1/users/${encodeURIComponent(vkn)}/PK`)).json();
    for (const it of (Array.isArray(r) ? r : [r]) as { alias?: string; aliases?: { alias?: string; name?: string }[] }[]) {
      const a = it?.aliases?.map((x) => x.alias ?? x.name).find(Boolean) ?? it?.alias;
      if (a) return a;
    }
    return null;
  } catch (e) {
    if (e instanceof NesError && e.status === 404) return null;
    throw e;
  }
}

/** Belgenin hangi modülde olduğu (PDF/iptal için). e-Fatura UUID'leri "F:" ile saklanmaz; modül sırayla denenir. */
export async function nesPdf(ettn: string): Promise<Response> {
  try { return await request("earchive", `/v1/invoices/${ettn}/pdf`, { headers: { Accept: "application/pdf" } }); }
  catch (e) {
    if (e instanceof NesError && e.status === 404) return request("einvoice", `/v1/outgoing/invoices/${ettn}/pdf`, { headers: { Accept: "application/pdf" } });
    throw e;
  }
}

export function nesProvider(): FiscalProvider {
  return {
    async issue(input) {
      let c;
      try { c = cfg(); } catch (e) { return { ok: false, error: (e as Error).message, retryable: false }; }
      const uuid = crypto.randomUUID();
      // Sandbox hesabı ortak: kiracı sayacı çakışmasın diye son 9 hane zamandan (sıra GİB biçiminde kalır).
      const number = `${input.number.slice(0, 7)}${String(Date.now()).slice(-9)}`;
      try {
        const alias = input.buyer.taxId.length === 10 ? await receiverAlias(input.buyer.taxId) : null;
        const profile = alias ? "TEMELFATURA" : "EARSIVFATURA";
        const xml = nesInvoiceXml(input, { uuid, number, profile, sellerVkn: c.sandboxVkn });
        const fd = new FormData();
        fd.append("File", new Blob([xml], { type: "application/xml" }), "belge.xml");
        const fields: Record<string, string> = { SenderAlias: c.senderAlias, IsDirectSend: "true", PreviewType: "1", SourceApp: "CabukPOS", AutoSaveCompany: "true" };
        if (alias) fields.ReceiverAlias = alias;
        for (const [k, v] of Object.entries(fields)) fd.append(k, v);
        await request(alias ? "einvoice" : "earchive", "/v1/uploads/document", { method: "POST", body: fd });
        return { ok: true, ettn: uuid, number };
      } catch (e) {
        const retryable = !(e instanceof NesError) || e.status >= 500 || e.status === 429;
        return { ok: false, error: e instanceof Error ? e.message : "NES hatası", retryable };
      }
    },
    async cancel(doc) {
      try {
        await request("earchive", "/v1/invoices/cancel", { method: "POST", body: JSON.stringify({ uuid: doc.ettn }) });
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "NES iptal hatası" };
      }
    },
  };
}
