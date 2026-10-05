// lib/fiscal/provider.ts — Mali belge sağlayıcı arayüzü ve kayıt defteri.
import type { Buyer } from "@/lib/core/fiscal";
import { fakeEarsiv } from "./fake";
import { fakeProvidersBlocked } from "@/lib/fake-providers";

export type IssueInput = {
  seller: { taxId: string; name: string; taxOffice: string | null; address: string | null };
  buyer: Buyer;
  lines: { name: string; qty: number; unitPrice: number; vatRate: number; total: number }[];
  vat: { rate: number; gross: number; net: number; vat: number }[];
  total: number;
  soldAt: Date;
  number: string;
};
export type IssueResult = { ok: true; ettn: string; number: string; url?: string } | { ok: false; error: string; retryable: boolean };
export type CancelResult = { ok: true } | { ok: false; error: string };
/** #19 e-Fatura zarfı: entegratör sağlarsa uygular; yoksa zarf akışı o kiracıda atlanır. */
export type EnvelopeQuery = { ok: true; status: "gonderildi" | "iletildi" | "kabul" | "red"; error?: string } | { ok: false; error: string; retryable: boolean };

export interface FiscalProvider {
  issue(doc: IssueInput): Promise<IssueResult>;
  cancel(doc: { ettn: string; issuedAt: Date }): Promise<CancelResult>;
  /** Zarfı GİB'e gönder. */
  submitEnvelope?(ettn: string): Promise<{ ok: true } | { ok: false; error: string; retryable: boolean }>;
  /** Zarf durumu sorgusu (sentAt: GİB'e gidiş anı — sahte sürücüde yaşam döngüsü için). */
  queryEnvelope?(ettn: string, sentAt: Date): Promise<EnvelopeQuery>;
}

export function getProvider(name: string, opts: { fakeFail: boolean }): FiscalProvider {
  if (name === "fake-earsiv") {
    if (fakeProvidersBlocked()) throw new Error("Sahte e-Arşiv sağlayıcısı production'da kullanılamaz.");
    return fakeEarsiv(opts);
  }
  throw new Error(`Bilinmeyen mali sağlayıcı: ${name}`);
}
