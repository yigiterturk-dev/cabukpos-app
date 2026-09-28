// lib/fiscal/provider.ts — Mali belge sağlayıcı arayüzü ve kayıt defteri.
import type { Buyer } from "@/lib/core/fiscal";
import { fakeEarsiv } from "./fake";

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

export interface FiscalProvider {
  issue(doc: IssueInput): Promise<IssueResult>;
  cancel(doc: { ettn: string; issuedAt: Date }): Promise<CancelResult>;
}

export function getProvider(name: string, opts: { fakeFail: boolean }): FiscalProvider {
  if (name === "fake-earsiv") return fakeEarsiv(opts);
  throw new Error(`Bilinmeyen mali sağlayıcı: ${name}`);
}
