import test from "node:test";
import assert from "node:assert/strict";

// clientIp() next/headers'a bağlı; saf mantığı burada aynen sınıyoruz.
// Amaç: "XFF'in İLK değerini al" hatasının geri gelmesini engellemek.
function pickIp(h: Record<string, string | undefined>): string {
  const vercel = h["x-vercel-forwarded-for"]?.trim();
  if (vercel) return vercel.split(",")[0]!.trim();
  const real = h["x-real-ip"]?.trim();
  if (real) return real;
  const xff = h["x-forwarded-for"];
  if (xff) {
    const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1]!;
  }
  return "unknown";
}

test("saldırganın uydurduğu XFF ilk değeri KULLANILMAZ", () => {
  // Saldırgan "1.1.1.1" yazdı, vekil gerçek IP'yi (9.9.9.9) sona ekledi.
  assert.equal(pickIp({ "x-forwarded-for": "1.1.1.1, 9.9.9.9" }), "9.9.9.9");
  // Her istekte farklı sahte IP yazsa da sonuç aynı gerçek IP olmalı.
  assert.equal(pickIp({ "x-forwarded-for": "2.2.2.2, 9.9.9.9" }), "9.9.9.9");
});

test("Vercel'in kendi başlığı her şeyin önüne geçer", () => {
  assert.equal(
    pickIp({ "x-vercel-forwarded-for": "9.9.9.9", "x-forwarded-for": "1.1.1.1, 8.8.8.8" }),
    "9.9.9.9"
  );
});

test("x-real-ip, XFF'ten önce gelir", () => {
  assert.equal(pickIp({ "x-real-ip": "9.9.9.9", "x-forwarded-for": "1.1.1.1" }), "9.9.9.9");
});

test("hiçbir başlık yoksa ortak sayaç — bypass değil", () => {
  assert.equal(pickIp({}), "unknown");
  assert.equal(pickIp({ "x-forwarded-for": "  ,  " }), "unknown");
});
