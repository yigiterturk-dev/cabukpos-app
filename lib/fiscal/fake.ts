// lib/fiscal/fake.ts — Sahte e-Arşiv sürücüsü (test/demo; mali değeri yoktur).
import { randomUUID } from "node:crypto";
import type { FiscalProvider } from "./provider";

const CANCEL_WINDOW_MS = 7 * 24 * 3600_000;

export function fakeEarsiv(opts: { fakeFail: boolean }, now: () => Date = () => new Date()): FiscalProvider {
  return {
    async issue(input) {
      if (opts.fakeFail) return { ok: false, error: "Sahte sağlayıcı: hata simülasyonu", retryable: true };
      return { ok: true, ettn: randomUUID(), number: input.number };
    },
    async cancel(doc) {
      if (now().getTime() - doc.issuedAt.getTime() > CANCEL_WINDOW_MS) return { ok: false, error: "İptal süresi geçti" };
      return { ok: true };
    },
  };
}
