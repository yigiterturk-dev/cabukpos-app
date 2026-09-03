// Otomatik randevu hatırlatma gönderimi — dışarıdan zamanlayıcı tetikler.
//
// NEDEN BU UÇ NOKTA VAR: uygulamada "Otomatik hatırlatma" açma/kapama, kanal, kaç saat
// önce ve şablon ayarları vardı ama HİÇBİR ŞEY GÖNDERMİYORDU. Ayar açılınca müşteriye
// mesaj gideceği söyleniyordu, gitmiyordu. Bu uç nokta o vaadi karşılar.
//
// GÜVENLİK:
//   - CRON_SECRET ile korunur; sabit zamanlı karşılaştırma (uzunluk sızıntısı dahil).
//   - Sır tanımlı değilse uç nokta 404 döner (yüzey oluşturmaz).
//   - Kiracı sınırı: reminders_due() SECURITY DEFINER'dır ve YALNIZ gönderilecek alanları
//     döndürür (yazma yapmaz, keyfi filtre almaz).
//   - DİKKAT: log yazımı withTenant() KULLANMAZ. Bu bir sistem işidir, oturum yoktur,
//     app.business_id set edilemez; yazma neondb_owner (BYPASSRLS) ile yapılır. Bu yüzden
//     business_id ASLA istekten gelmez — yalnız reminders_due()'nun döndürdüğü satırdan
//     alınır. Bu dosyaya kullanıcı girdisiyle çalışan bir yazma EKLEMEYİN.
//
// ÇİFT MESAJ: reminder_logs (business_id, appointment_id) UNIQUE — aynı randevuya ikinci
// kayıt veritabanı düzeyinde imkânsız. Bu yüzden ÖNCE log yazılır, SONRA mesaj gönderilir:
// insert patlarsa (başka bir çalıştırma aldı) gönderim hiç denenmez.

import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { getMessageProvider, renderTemplate, toE164TR } from "@/lib/messaging";
import type { CampaignChannel } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type DueRow = {
  business_id: string;
  business_name: string;
  appointment_id: string;
  channel: string;
  customer_name: string;
  customer_phone: string;
  service_name: string | null;
  appt_start: string;
  appt_date: string;
  template: string;
};

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 404 });

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!timingSafeEqual(token, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const provider = getMessageProvider();
  if (!provider) {
    // Sağlayıcı yoksa HİÇBİR ŞEY "gönderildi" yazılmaz — sessiz sahte başarı yok.
    return NextResponse.json({ ok: true, skipped: "mesaj sağlayıcısı kurulu değil", sent: 0 });
  }

  const slack = Number(new URL(req.url).searchParams.get("slack") ?? 30);
  let rows: DueRow[];
  try {
    const res = (await db.execute(
      sql`SELECT * FROM reminders_due(${Number.isFinite(slack) ? slack : 30})`
    )) as unknown as { rows: DueRow[] };
    rows = res.rows ?? [];
  } catch (e) {
    console.error("[cron/reminders] sorgu başarısız:", e);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows) {
    const channel = (row.channel === "sms" ? "sms" : "whatsapp") as CampaignChannel;
    if (!provider.supports(channel)) {
      skipped++;
      continue;
    }

    const to = toE164TR(row.customer_phone);
    if (!to) {
      skipped++;
      console.warn(`[cron/reminders] telefon çözümlenemedi, atlandı: apt=${row.appointment_id}`);
      continue;
    }

    const text = renderTemplate(row.template, {
      ad: row.customer_name,
      saat: row.appt_start,
      hizmet: row.service_name ?? "randevunuz",
      isletme: row.business_name,
    });
    const logId = `rem-${row.appointment_id}`;

    // 1) ÖNCE kilit satırını yaz. UNIQUE ihlali → başka bir çalıştırma aldı, atla.
    try {
      await db.execute(sql`
        INSERT INTO reminder_logs (id, business_id, appointment_id, at, channel, "to", text, status)
        VALUES (${logId}, ${row.business_id}::uuid, ${row.appointment_id},
                ${new Date().toISOString()}, ${channel}, ${to}, ${text}, 'gonderildi')
      `);
    } catch {
      skipped++;
      continue;
    }

    // 2) SONRA gönder.
    const res = await provider.send({ to, text, channel });
    if (res.ok) {
      sent++;
    } else {
      failed++;
      console.error(
        `[cron/reminders] gönderilemedi apt=${row.appointment_id} retryable=${res.retryable}: ${res.error}`
      );
      // Tekrar denenebilir hata → kilidi bırak ki sonraki çalıştırma yeniden denesin.
      // Kalıcı hata → kilit kalsın, aynı hata her turda tekrarlanmasın.
      if (res.retryable) {
        await db
          .execute(sql`DELETE FROM reminder_logs WHERE id = ${logId}`)
          .catch(() => {});
      }
    }
  }

  return NextResponse.json({ ok: true, aday: rows.length, sent, failed, skipped });
}
