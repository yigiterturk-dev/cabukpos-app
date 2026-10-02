// tests/csrf.test.ts — fetch-metadata CSRF kararı (saf).
import { test } from "node:test";
import assert from "node:assert/strict";
import { csrfVerdict } from "@/lib/auth/csrf";

const m = (o: Partial<Parameters<typeof csrfVerdict>[0]>): Parameters<typeof csrfVerdict>[0] => ({
  site: null,
  mode: null,
  origin: null,
  host: null,
  ...o,
});

test("server action çağrısı (same-origin + cors) geçer", () => {
  assert.equal(csrfVerdict(m({ site: "same-origin", mode: "cors", origin: "https://app.cabukpos.com", host: "app.cabukpos.com" })), "ok");
});

test("sayfa gezinmesi (navigate) denetlenmez", () => {
  assert.equal(csrfVerdict(m({ site: "cross-site", mode: "navigate", origin: "https://google.com", host: "app.cabukpos.com" })), "ok");
  assert.equal(csrfVerdict(m({ site: "none", mode: "navigate", origin: null, host: "app.cabukpos.com" })), "ok");
});

test("çapraz site form/fetch reddedilir", () => {
  assert.equal(csrfVerdict(m({ site: "cross-site", mode: "cors", origin: "https://evil.example", host: "app.cabukpos.com" })), "red");
  assert.equal(csrfVerdict(m({ site: "cross-site", mode: "cors", origin: null, host: "app.cabukpos.com" })), "red");
});

test("aynı sitenin başka alt alan adı (same-site) reddedilir", () => {
  assert.equal(csrfVerdict(m({ site: "same-site", mode: "cors", origin: "https://evil.cabukpos.com", host: "app.cabukpos.com" })), "red");
});

test("origin ↔ host uyuşmazlığı reddedilir (x-forwarded-host dahil)", () => {
  assert.equal(csrfVerdict(m({ site: "same-origin", mode: "cors", origin: "https://evil.example", host: "app.cabukpos.com" })), "red");
  assert.equal(csrfVerdict(m({ site: null, mode: "cors", origin: "https://evil.example", host: "app.cabukpos.com" })), "red");
  assert.equal(csrfVerdict(m({ site: null, mode: "cors", origin: "https://app.cabukpos.com", host: "app.cabukpos.com" })), "ok");
  assert.equal(csrfVerdict(m({ site: null, mode: "cors", origin: "https://app.cabukpos.com", host: "internal:3000" })), "red");
});

test("bozuk origin reddedilir; başlıksız istemci geçer (CSRF tehdit modeli dışı)", () => {
  assert.equal(csrfVerdict(m({ site: "same-origin", mode: "cors", origin: "::garbage::", host: "app.cabukpos.com" })), "red");
  assert.equal(csrfVerdict(m({ site: null, mode: null, origin: null, host: null })), "ok");
});
