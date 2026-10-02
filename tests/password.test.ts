// tests/password.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { passwordProblem, passwordProblemAsync } from "@/lib/auth/password";

test("şifre kuralı", () => {
  assert.equal(passwordProblem("merhaba12dunya"), null);
  assert.match(passwordProblem("kısa1")!, /10 karakter/);
  assert.match(passwordProblem("12345678901")!, /harf/);
  assert.match(passwordProblem("abcdefghijk")!, /rakam/);
  assert.match(passwordProblem("password12")!, /yaygın/);
});

test("sızma listesindeki şifre reddedilir (HIBP); ağ hatasında engelleme yok", async () => {
  const orig = globalThis.fetch;
  const suffix = (p: string) => createHash("sha1").update(p).digest("hex").toUpperCase().slice(5);
  const tak = (body: string) => {
    globalThis.fetch = (async () => ({ ok: true, status: 200, text: async () => body })) as unknown as typeof fetch;
  };
  try {
    tak(`${suffix("samsung123")}:371061\nAAAAA:1\n`);
    const sızan = await passwordProblemAsync("samsung123");
    assert.match(sızan ?? "yanıt yok", /sızma/);
    tak("AAAAA:1\n");
    assert.equal(await passwordProblemAsync("merhaba12dunya"), null);
    globalThis.fetch = (async () => {
      throw new Error("ağ yok");
    }) as unknown as typeof fetch;
    assert.equal(await passwordProblemAsync("merhaba12dunya"), null);
  } finally {
    globalThis.fetch = orig;
  }
});
