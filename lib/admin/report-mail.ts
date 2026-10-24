// lib/admin/report-mail.ts — #41 zamanlanmış rapor e-postası: dünün/geçen haftanın özeti, aktif sahip+müdüre.
// Posta yapılandırılmamışsa atlar; hiçbir durumda hata fırlatmaz.
import { and, eq, gte, isNotNull, isNull, lt, sql, type SQL } from "drizzle-orm";
import { getDb, schema, withTenant } from "@/db";
import { appUrl, mailReady, sendEmail } from "@/lib/mail";
import { digestContent, type DigestData } from "@/lib/core/digest";
import { istToday, rangeBounds, type Range } from "@/lib/core/report";
import { productData, staffData, summaryData } from "@/lib/admin/report";
import { rfmData } from "@/lib/admin/rfm";
import { stockLevels } from "@/lib/admin/stock";

const IST = 3 * 3_600_000;

export type ReportKind = "gunluk" | "haftalik" | "aylik";

/** Dün (IST); haftalık: geçen pazartesi–pazar; aylık: geçen ayın 1'i – sonu. */
export function digestRange(kind: ReportKind, now = Date.now()): Range {
  if (kind === "gunluk") return { bas: istToday(now, -1), bit: istToday(now, -1) };
  if (kind === "aylik") {
    const ist = new Date(now + IST);
    const first = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() - 1, 1));
    const last = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 0)); // bu ayın 0. günü = geçen ayın sonu
    return { bas: first.toISOString().slice(0, 10), bit: last.toISOString().slice(0, 10) };
  }
  const ist = new Date(now + IST);
  const dow = (ist.getUTCDay() + 6) % 7; // Pzt=0
  return { bas: istToday(now, -(dow + 7)), bit: istToday(now, -(dow + 1)) };
}

/** "YYYY-MM" (IST) — aylık konsolide rapor başlığı. */
export const istMonth = (now = Date.now()) => new Date(now + IST).toISOString().slice(0, 7);

/** Geçen ay "YYYY-MM" (IST). */
export const prevMonth = (now = Date.now()) => {
  const ist = new Date(now + IST);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
};

/** Aylık konsolide veri: e-posta ve yazdırılabilir sayfa aynı kaynaktan beslenir. */
export async function konsolideData(tx: Parameters<typeof summaryData>[0], tenantId: string, r: Range): Promise<DigestData> {
  return collect(tx, r, tenantId, "aylik");
}

async function collect(tx: Parameters<typeof summaryData>[0], r: Range, tenantId: string, kind: ReportKind): Promise<DigestData> {
  const [s, prods] = [await summaryData(tx, r), await productData(tx, r, "ciro")];
  const { from, to } = rangeBounds(r);
  const inR = and(gte(schema.sales.createdAt, from), lt(schema.sales.createdAt, to)) as SQL;
  const [rev] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.sales)
    .where(and(inR, isNotNull(schema.sales.review)));
  const base: DigestData = {
    range: r,
    summary: s.now,
    methods: s.methods.map((m) => ({ method: m.label, amount: m.amount })),
    top: prods.rows.filter((p) => p.qtyMilli > 0).slice(0, 3).map((p) => ({ name: p.name, qtyMilli: p.qtyMilli, gross: p.gross })),
    review: rev?.n ?? 0,
  };
  if (kind !== "aylik") return base;
  // #43 konsolide: kanal + personel + kritik stok + müşteri özeti
  const staff = (await staffData(tx, r)).filter((x) => x.gross > 0).sort((a, b) => b.gross - a.gross).slice(0, 5)
    .map((x) => ({ name: x.name, gross: x.gross, count: x.count }));
  const stores = await tx.select({ id: schema.stores.id }).from(schema.stores);
  const critical: { name: string; level: number; unit: string }[] = [];
  for (const st of stores) {
    for (const row of await stockLevels(tx, st.id)) {
      if (row.minStock !== null && row.level <= row.minStock) critical.push({ name: row.name, level: row.level, unit: row.unit });
    }
  }
  const rf = await rfmData(tx, tenantId);
  return { ...base, month: r.bas.slice(0, 7), channels: s.channels.map((c) => ({ label: c.label, gross: c.gross })), staff, critical: critical.slice(0, 10), customers: rf.summary };
}

export type ReportSend = { ok: boolean; skipped?: "mail" | "alici" | "bos"; recipients?: number };

export async function sendReportMail(tenantId: string, kind: ReportKind, { force = false } = {}): Promise<ReportSend> {
  if (!mailReady()) return { ok: false, skipped: "mail" };
  const r = digestRange(kind);
  const out = await withTenant(tenantId, async (tx) => {
    const [st] = await tx.select().from(schema.reportSettings);
    if (!st) return { ok: false, skipped: "bos" } as ReportSend;
    if (!force && !(kind === "gunluk" ? st.daily : kind === "haftalik" ? st.weekly : st.monthly)) return { ok: false, skipped: "bos" } as ReportSend;
    const to = (await tx.select({ email: schema.users.email }).from(schema.users)
      .where(and(eq(schema.users.tenantId, tenantId), eq(schema.users.active, true), isNull(schema.users.storeId), isNotNull(schema.users.emailVerifiedAt)))).map((u) => u.email);
    if (!to.length) return { ok: false, skipped: "alici" } as ReportSend;
    const [t] = await tx.select({ name: schema.tenants.name }).from(schema.tenants).where(eq(schema.tenants.id, tenantId));
    const content = digestContent(kind, t?.name ?? "", await collect(tx, r, tenantId, kind), `${appUrl()}/yonetim/raporlar?${new URLSearchParams({ sekme: "ozet", bas: r.bas, bit: r.bit })}`);
    return { content, to } as const;
  });
  if (!("content" in out)) return out;
  const ok = await sendEmail({ to: [...out.to], ...out.content });
  // Damga yalnız gerçek gönderimde: başarısızsa ertesi gün yeniden denenir.
  if (ok) await withTenant(tenantId, (tx) => tx.update(schema.reportSettings).set(kind === "gunluk" ? { lastDailyAt: new Date() } : kind === "haftalik" ? { lastWeeklyAt: new Date() } : { lastMonthlyAt: new Date() }).where(eq(schema.reportSettings.tenantId, tenantId)));
  return { ok, recipients: out.to.length };
}

/** Cron için vakit gelen kiracılar (RLS'siz bağlam → SECURITY DEFINER report_due_tenants). */
export async function dueReportTenants(kind: ReportKind, now = new Date()): Promise<string[]> {
  const bound = kind === "gunluk"
    ? `${istToday(now.getTime())}T00:00:00+03:00` // dünün özeti bugün gönderilir → son gönderim bugünden eski olmalı
    : kind === "aylik"
      ? `${istToday(now.getTime())}T00:00:00+03:00` // ayın 1'i: bu ayın başı; son aylik bundan eski olmalı
      : `${istToday(now.getTime(), -((new Date(now.getTime() + IST).getUTCDay() + 6) % 7))}T00:00:00+03:00`; // bu haftanın pazartesisi
  const rows = (await getDb().execute(
    sql`select report_due_tenants(${kind}, ${bound}::timestamptz) as id`,
  )) as unknown as { id: string }[];
  return rows.map((r) => r.id);
}
