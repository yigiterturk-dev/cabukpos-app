// lib/fiscal/fake.ts — Sahte e-Arşiv sürücüsü (test/demo; mali değeri yoktur).
import { randomUUID } from "node:crypto";
import type { FiscalProvider } from "./provider";

const CANCEL_WINDOW_MS = 7 * 24 * 3600_000;
// #19 zarf simülasyonu: gönderim 1 dk sonra "iletildi", 5 dk sonra alıcı cevabı (fakeFail → red).
const DELIVER_MS = 60_000, RESPOND_MS = 5 * 60_000;

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
    async submitEnvelope() {
      if (opts.fakeFail) return { ok: false, error: "Sahte sağlayıcı: zarf hatası", retryable: true };
      return { ok: true };
    },
    async queryEnvelope(_ettn, sentAt) {
      const e = now().getTime() - sentAt.getTime();
      if (e < DELIVER_MS) return { ok: true, status: "gonderildi" };
      if (e < RESPOND_MS) return { ok: true, status: "iletildi" };
      return opts.fakeFail ? { ok: true, status: "red", error: "Sahte sağlayıcı: alıcı reddetti" } : { ok: true, status: "kabul" };
    },
  };
}
