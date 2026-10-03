// lib/admin/report-mail.ts — #41 zamanlanmış rapor e-postası: dünün/geçen haftanın özeti, aktif sahip+müdüre.
// Posta yapılandırılmamışsa atlar; hiçbir durumda hata fırlatmaz.
import { and, eq, gte, isNotNull, lt, sql, type SQL } from "drizzle-orm";
import { getDb, schema, withTenant } from "@/db";
import { appUrl, mailReady, sendEmail } from "@/lib/mail";
import { digestContent, type DigestData } from "@/lib/core/digest";
import { istToday, rangeBounds, type Range } from "@/lib/core/report";
import { productData, summaryData } from "@/lib/admin/report";

const IST = 3 * 3_600_000;

export type ReportKind = "gunluk" | "haftalik";

/** Dün (IST); haftalık: geçen pazartesi–pazar. */
export function digestRange(kind: ReportKind, now = Date.now()): Range {
  if (kind === "gunluk") return { bas: istToday(now, -1), bit: istToday(now, -1) };
  const ist = new Date(now + IST);
  const dow = (ist.getUTCDay() + 6) % 7; // Pzt=0
  return { bas: istToday(now, -(dow + 7)), bit: istToday(now, -(dow + 1)) };
}

async function collect(tx: Parameters<typeof summaryData>[0], r: Range): Promise<DigestData> {
  const [s, prods] = [await summaryData(tx, r), await productData(tx, r, "ciro")];
  const { from, to } = rangeBounds(r);
  const inR = and(gte(schema.sales.createdAt, from), lt(schema.sales.createdAt, to)) as SQL;
  const [rev] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.sales)
    .where(and(inR, isNotNull(schema.sales.review)));
  return {
    range: r,
    summary: s.now,
    methods: s.methods.map((m) => ({ method: m.label, amount: m.amount })),
    top: prods.rows.filter((p) => p.qtyMilli > 0).slice(0, 3).map((p) => ({ name: p.name, qtyMilli: p.qtyMilli, gross: p.gross })),
    review: rev?.n ?? 0,
  };
}

export type ReportSend = { ok: boolean; skipped?: "mail" | "alici" | "bos"; recipients?: number };

export async function sendReportMail(tenantId: string, kind: ReportKind, { force = false } = {}): Promise<ReportSend> {
  if (!mailReady()) return { ok: false, skipped: "mail" };
  const r = digestRange(kind);
  const out = await withTenant(tenantId, async (tx) => {
    const [st] = await tx.select().from(schema.reportSettings);
    if (!st) return { ok: false, skipped: "bos" } as ReportSend;
    if (!force && !(kind === "gunluk" ? st.daily : st.weekly)) return { ok: false, skipped: "bos" } as ReportSend;
    const to = (await tx.select({ email: schema.users.email }).from(schema.users)
      .where(and(eq(schema.users.active, true), isNotNull(schema.users.emailVerifiedAt)))).map((u) => u.email);
    if (!to.length) return { ok: false, skipped: "alici" } as ReportSend;
    const [t] = await tx.select({ name: schema.tenants.name }).from(schema.tenants).where(eq(schema.tenants.id, tenantId));
    const content = digestContent(kind, t?.name ?? "", await collect(tx, r), `${appUrl()}/yonetim/raporlar?${new URLSearchParams({ sekme: "ozet", bas: r.bas, bit: r.bit })}`);
    return { content, to } as const;
  });
  if (!("content" in out)) return out;
  const ok = await sendEmail({ to: [...out.to], ...out.content });
  // Damga yalnız gerçek gönderimde: başarısızsa ertesi gün yeniden denenir.
  if (ok) await withTenant(tenantId, (tx) => tx.update(schema.reportSettings).set(kind === "gunluk" ? { lastDailyAt: new Date() } : { lastWeeklyAt: new Date() }).where(eq(schema.reportSettings.tenantId, tenantId)));
  return { ok, recipients: out.to.length };
}

/** Cron için vakit gelen kiracılar (RLS'siz bağlam → SECURITY DEFINER report_due_tenants). */
export async function dueReportTenants(kind: ReportKind, now = new Date()): Promise<string[]> {
  const bound = kind === "gunluk"
    ? `${istToday(now.getTime())}T00:00:00+03:00` // dünün özeti bugün gönderilir → son gönderim bugünden eski olmalı
    : `${istToday(now.getTime(), -((new Date(now.getTime() + IST).getUTCDay() + 6) % 7))}T00:00:00+03:00`; // bu haftanın pazartesisi
  const rows = (await getDb().execute(
    sql`select report_due_tenants(${kind}, ${bound}::timestamptz) as id`,
  )) as unknown as { id: string }[];
  return rows.map((r) => r.id);
}
