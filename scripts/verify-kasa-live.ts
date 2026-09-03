// Kasa/Cari modülünün CANLI veritabanı üzerinde uçtan uca doğrulaması.
//
// Birim testler (tests/finance.test.ts) saf fonksiyonları sınar. Bu script ise
// gerçek yığını sınar: withTenant + RLS + app_tenant rolü + ns-önek + snake→camel
// eşleme + loadBusinessState. Yani "testte doğru ama üründe çalışmıyor" boşluğunu kapatır.
//
// Tek kullanımlık bir işletme (tenant) oluşturur, üstünde çalışır ve SONUNDA SİLER.
// Başka hiçbir tenant'a dokunmaz.
//
// Çalıştırma:
//   node --env-file=.env.local --import ./tests/ts-resolve.mjs scripts/verify-kasa-live.ts

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { withTenant } from "@/db/tenant";
import { loadBusinessState } from "@/lib/data/load";
import { addPayment, addExpense, deletePayment, deleteCustomer } from "@/lib/data/mutations";
import { seedBusinessToDb } from "@/lib/data/seed-db";
import {
  customerBalance,
  customerBalances,
  openDebts,
  rangeCashSummary,
  totalReceivable,
} from "@/lib/finance";

let passed = 0;
const failures: string[] = [];

function check(label: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failures.push(`${label}${detail ? " — " + detail : ""}`);
    console.log(`  ✗ ${label}${detail ? " — " + detail : ""}`);
  }
}

function near(a: number, b: number, eps = 0.01) {
  return Math.abs(a - b) < eps;
}

const businessId = randomUUID();
const slug = "zz-kasa-dogrulama-" + Date.now();

async function main() {
  console.log(`\nTek kullanımlık tenant: ${businessId}\n`);

  // --- Kurulum: businesses satırı + demo seed (payments/expenses dahil) ---
  await withTenant(businessId, () => [
    db.insert(schema.businesses).values({
      id: businessId,
      name: "ZZ Kasa Doğrulama",
      bookingSlug: slug,
    }),
  ]);
  // Onboarding'de girilen isim seed tarafından EZİLMEMELİ (canlıda bu hata görüldü:
  // kullanıcı "ZZ Kasa Test Kuafor" yazdı, sayfa yenilenince "Maestro Kuaför" oldu).
  await seedBusinessToDb(businessId, "berber", { businessName: "ZZ Kasa Doğrulama" });

  const s1 = await loadBusinessState(businessId);
  if (!s1) throw new Error("loadBusinessState null döndü — kurulum başarısız.");

  console.log("1) Şema + yükleme");
  check(
    "onboarding'de girilen işletme adı seed tarafından EZİLMEDİ",
    s1.businessName === "ZZ Kasa Doğrulama",
    s1.businessName
  );
  check(
    "demo gider verisi ciroya oranlı (net pozitif kalıyor)",
    rangeCashSummary(s1, 30).net > 0,
    `net ${rangeCashSummary(s1, 30).net}`
  );
  check("payments DB'ye yazıldı ve geri okundu", s1.payments.length > 0, `${s1.payments.length} kayıt`);
  check("expenses DB'ye yazıldı ve geri okundu", s1.expenses.length > 0, `${s1.expenses.length} kayıt`);
  check(
    "ns-önek okurken soyuldu (store id biçimi)",
    s1.payments.every((p) => p.id.startsWith("pay-")),
    s1.payments[0]?.id
  );
  check(
    "tahsilatın müşteri bağı çözülüyor (FK öneki de soyuldu)",
    s1.payments.some((p) => p.customerId && s1.customers.some((c) => c.id === p.customerId))
  );
  check(
    "snake_case → camelCase eşlemesi çalıştı (created_at kaybolmadı)",
    s1.payments.every((p) => typeof p.createdAt === "string" && p.createdAt.length > 0)
  );
  check(
    "gider kategorisi ve tutarı bozulmadan döndü",
    s1.expenses.every((e) => typeof e.amount === "number" && e.amount > 0 && !!e.category)
  );

  // --- Cari hesap ---
  console.log("\n2) Cari hesap (gerçek seed verisi üstünde)");
  const debtors = customerBalances(s1, { onlyDebtors: true });
  check("demo veride gerçek borçlu üretildi", debtors.length > 0, `${debtors.length} borçlu`);
  const receivable = totalReceivable(s1);
  check("toplam açık alacak borçlular toplamına eşit", near(receivable, debtors.reduce((a, d) => a + d.balance, 0)));

  const target = debtors[0];
  if (!target) throw new Error("Borçlu yok — FIFO/tahsilat adımları sınanamaz.");
  console.log(`   hedef müşteri: ${target.customer.name} · borç ${target.balance}`);

  const debtsBefore = openDebts(s1, target.customer.id);
  check(
    "açık borç kalemleri toplamı bakiyeye eşit (FIFO mahsup tutarlı)",
    near(debtsBefore.reduce((a, d) => a + d.amount, 0), target.balance)
  );
  check(
    "açık borçlar eskiden yeniye sıralı",
    debtsBefore.every((d, i) => i === 0 || debtsBefore[i - 1]!.date <= d.date)
  );

  // --- Kısmi tahsilat: en eski borç önce kapanmalı ---
  console.log("\n3) Kısmi tahsilat → FIFO davranışı");
  const oldest = debtsBefore[0]!;
  const half = Math.round(oldest.amount / 2);
  const partial = await addPayment(businessId, {
    date: new Date().toISOString().slice(0, 10),
    amount: half,
    method: "nakit",
    customerId: target.customer.id,
    note: "dogrulama-kismi",
  });

  const s2 = (await loadBusinessState(businessId))!;
  check("kısmi tahsilat kalıcı yazıldı", s2.payments.some((p) => p.id === partial.id));
  check(
    "bakiye tam olarak ödenen kadar azaldı",
    near(customerBalance(s2, target.customer.id), target.balance - half),
    `${customerBalance(s2, target.customer.id)} beklenen ${target.balance - half}`
  );
  const debtsAfter = openDebts(s2, target.customer.id);
  check(
    "ödeme EN ESKİ borçtan düşüldü (yeni borç dokunulmadan durdu)",
    near(debtsAfter[0]!.amount, oldest.amount - half) && debtsAfter[0]!.appointmentId === oldest.appointmentId,
    `en eski kalan ${debtsAfter[0]!.amount}`
  );

  // --- Borcun tamamını kapat ---
  console.log("\n4) Borcun tamamını kapatma");
  const remaining = customerBalance(s2, target.customer.id);
  await addPayment(businessId, {
    date: new Date().toISOString().slice(0, 10),
    amount: remaining,
    method: "kart",
    customerId: target.customer.id,
  });
  const s3 = (await loadBusinessState(businessId))!;
  check("bakiye sıfırlandı", near(customerBalance(s3, target.customer.id), 0));
  check(
    "kapanan müşteri borçlular listesinden düştü",
    !customerBalances(s3, { onlyDebtors: true }).some((d) => d.customer.id === target.customer.id)
  );
  check("açık borç kalemi kalmadı", openDebts(s3, target.customer.id).length === 0);

  // --- Gider + kasa özeti ---
  console.log("\n5) Gider ve kasa özeti");
  const before = rangeCashSummary(s3, 30);
  const exp = await addExpense(businessId, {
    date: new Date().toISOString().slice(0, 10),
    amount: 1234,
    category: "malzeme",
    note: "dogrulama-gider",
  });
  const s4 = (await loadBusinessState(businessId))!;
  const after = rangeCashSummary(s4, 30);
  check("gider kalıcı yazıldı", s4.expenses.some((e) => e.id === exp.id));
  check("gider toplamı tam 1234 arttı", near(after.expenses, before.expenses + 1234));
  check("net tam 1234 azaldı", near(after.net, before.net - 1234));
  check(
    "ciro ≠ tahsilat ayrımı korunuyor (gider ciroyu değiştirmedi)",
    near(after.earned, before.earned)
  );
  check(
    "yöntem kırılımı toplamı tahsilata eşit",
    near(after.byMethod.nakit + after.byMethod.kart + after.byMethod.havale, after.collected)
  );

  // --- Tahsilat silme ---
  console.log("\n6) Tahsilat silme");
  const collectedBefore = rangeCashSummary(s4, 30).collected;
  await deletePayment(businessId, partial.id);
  const s5 = (await loadBusinessState(businessId))!;
  check("silinen tahsilat state'ten kalktı", !s5.payments.some((p) => p.id === partial.id));
  check("tahsilat toplamı silinen kadar azaldı", near(rangeCashSummary(s5, 30).collected, collectedBefore - half));
  check("borç geri doğdu", customerBalance(s5, target.customer.id) > 0);

  // --- Müşteri silinince tahsilat KAYBOLMAMALI ---
  console.log("\n7) Müşteri silme → tahsilat kaydı korunmalı");
  const victim = s5.customers.find((c) => s5.payments.some((p) => p.customerId === c.id));
  if (!victim) throw new Error("Tahsilatı olan müşteri bulunamadı.");
  const cashBefore = rangeCashSummary(s5, 30).collected;
  const victimPayments = s5.payments.filter((p) => p.customerId === victim.id).length;
  await deleteCustomer(businessId, victim.id);
  const s6 = (await loadBusinessState(businessId))!;
  check("müşteri silindi", !s6.customers.some((c) => c.id === victim.id));
  check(
    "tahsilat kayıtları SİLİNMEDİ (para kasaya girmişti)",
    near(rangeCashSummary(s6, 30).collected, cashBefore),
    `${victimPayments} kayıt sahipsiz kaldı`
  );
  check(
    "sahipsiz kalan tahsilatın cari bağı koparıldı",
    !s6.payments.some((p) => p.customerId === victim.id)
  );

  // --- RLS: başka tenant bu satırları görememeli ---
  console.log("\n8) RLS izolasyonu");
  const otherId = randomUUID();
  const [foreignRows] = await withTenant(otherId, () => [
    db.select().from(schema.payments).where(eq(schema.payments.businessId, businessId)),
  ]);
  check(
    "başka tenant bağlamı bu işletmenin tahsilatlarını GÖREMİYOR",
    (foreignRows as unknown[]).length === 0,
    `${(foreignRows as unknown[]).length} satır sızdı`
  );
}

async function cleanup() {
  // Sadece bu script'in oluşturduğu tenant silinir (cascade ile çocuk tablolar da).
  await withTenant(businessId, () => [
    db.delete(schema.businesses).where(eq(schema.businesses.id, businessId)),
  ]);
  const [left] = await withTenant(businessId, () => [
    db.select().from(schema.payments).where(eq(schema.payments.businessId, businessId)),
  ]);
  console.log(
    `\nTemizlik: tenant silindi, kalan tahsilat satırı = ${(left as unknown[]).length}`
  );
}

main()
  .then(cleanup, async (e) => {
    console.error("\nÇALIŞMA HATASI:", e?.message ?? e);
    await cleanup().catch(() => {});
    process.exitCode = 1;
  })
  .then(() => {
    console.log(`\nSonuç: ${passed} geçti, ${failures.length} kaldı.`);
    if (failures.length > 0) {
      for (const f of failures) console.log("  ! " + f);
      process.exitCode = 1;
    }
  });
