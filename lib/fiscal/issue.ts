// lib/fiscal/issue.ts — e-Arşiv kesimi, yeniden deneme, iptal, e-posta. Satışı hiçbir durumda engellemez.
// Numara yalnız başarılı kesimde yanar: sayaç aynı işlemde artar, sağlayıcı hata verirse geri yazılır.
import { and, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { getDb, schema, withTenant, type Tx } from "@/db";
import { buyerSchema, DEFAULT_MODES, docModeFor, formatNumber, MAX_ATTEMPTS, newFiscalToken, nextRetryDue, NIHAI_TUKETICI, type Buyer, type Channel } from "@/lib/core/fiscal";
import { getProvider, type IssueInput } from "./provider";

const D = schema.fiscalDocuments;
export type IssueOutcome = { status: (typeof schema.fiscalDocStatus.enumValues)[number]; number: string | null; ettn: string | null; token: string };
const outcome = (d: { status: IssueOutcome["status"]; number: string | null; ettn: string | null; token: string }): IssueOutcome => ({ status: d.status, number: d.number, ettn: d.ettn, token: d.token });

export async function fiscalSettingsOf(tx: Tx) {
  const [s] = await tx.select().from(schema.fiscalSettings);
  return s ?? null;
}

/** Satış eşitlemesinde (aynı işlem): kanal modu e-Arşiv ya da fatura istenmişse bekleyen belge açar. */
export async function openFiscalDoc(tx: Tx, tenantId: string, saleId: string, channel: Channel, fiscal: { token: string; buyer: Buyer | null } | undefined) {
  const s = await fiscalSettingsOf(tx);
  if (docModeFor(channel, s?.channelModes ?? DEFAULT_MODES, !!fiscal?.buyer) !== "earsiv") return;
  await tx.insert(D).values({ tenantId, saleId, buyer: fiscal?.buyer ?? { ...NIHAI_TUKETICI }, token: fiscal?.token ?? newFiscalToken() }).onConflictDoNothing();
}

const trYear = (d: Date) => Number(new Intl.DateTimeFormat("en", { timeZone: "Europe/Istanbul", year: "numeric" }).format(d));

export async function issueOne(tenantId: string, saleId: string): Promise<IssueOutcome | null> {
  const res = await withTenant(tenantId, async (tx) => {
    const [doc] = await tx.select().from(D).where(and(eq(D.saleId, saleId), inArray(D.status, ["pending", "error"]))).for("update");
    // Kilit bekler: eşzamanlı ikinci çağrı ilk kesim bitince satırı yeniden değerlendirir, issued görür, numara yakmaz.
    if (!doc) {
      const [cur] = await tx.select().from(D).where(eq(D.saleId, saleId));
      return cur ? { out: outcome(cur), mail: false } : null;
    }
    const fail = async (error: string, retryable: boolean) => {
      const [d] = await tx.update(D).set({ status: "error", attempts: retryable ? sql`${D.attempts} + 1` : MAX_ATTEMPTS, lastError: error.slice(0, 500), lastTryAt: new Date() }).where(eq(D.id, doc.id)).returning();
      return { out: outcome(d), mail: false };
    };
    const [t] = await tx.select().from(schema.tenants).where(eq(schema.tenants.id, tenantId));
    if (!t?.taxId || !t.address) return fail("İşletme vergi bilgisi eksik", false);
    const buyer = buyerSchema.safeParse(doc.buyer);
    if (!buyer.success) return fail(`Alıcı bilgisi geçersiz: ${buyer.error.issues[0]?.message ?? ""}`, false);
    const [sale] = await tx.select().from(schema.sales).where(eq(schema.sales.id, saleId));
    const lines = await tx.select().from(schema.saleLines).where(eq(schema.saleLines.saleId, saleId));
    // Sayaç: ayar satırı yoksa varsayılanla açılır; satır kilidi eşzamanlı kesimleri sıraya koyar.
    const [s] = await tx.insert(schema.fiscalSettings).values({ tenantId, counter: 1 })
      .onConflictDoUpdate({ target: schema.fiscalSettings.tenantId, set: { counter: sql`${schema.fiscalSettings.counter} + 1` } }).returning();
    const number = formatNumber(s.series, trYear(new Date()), s.counter);
    const input: IssueInput = {
      seller: { taxId: t.taxId, name: t.name, taxOffice: t.taxOffice, address: t.address },
      buyer: buyer.data,
      lines: lines.map((l) => ({ name: l.name, qty: l.qtyMilli / 1000, unitPrice: l.unitPrice, vatRate: l.vatRate, total: l.total })),
      vat: sale.vat, total: sale.total, soldAt: sale.createdAt, number,
    };
    let r;
    try { r = await getProvider(s.provider, { fakeFail: s.fakeFail }).issue(input); }
    catch (e) { r = { ok: false as const, error: e instanceof Error ? e.message : "Sağlayıcı hatası", retryable: true }; }
    if (!r.ok) {
      await tx.update(schema.fiscalSettings).set({ counter: s.counter - 1 }).where(eq(schema.fiscalSettings.tenantId, tenantId));
      return fail(r.error, r.retryable);
    }
    // Kesilmeden önce kısmi iade yapılmışsa belge kesilir ama iade faturası gerekir.
    const [ref] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.sales).where(and(eq(schema.sales.refundOf, saleId), eq(schema.sales.status, "iade")));
    const [d] = await tx.update(D).set({
      status: ref.n ? "cancel_rejected" : "issued", ettn: r.ettn, number: r.number, url: r.url ?? null, issuedAt: new Date(), lastTryAt: new Date(),
      attempts: sql`${D.attempts} + 1`, lastError: ref.n ? "kısmi iade" : null,
    }).where(eq(D.id, doc.id)).returning();
    return { out: outcome(d), mail: !!doc.buyer.email };
  });
  if (res?.mail) await sendMail(tenantId, saleId).catch(() => {});
  return res?.out ?? null;
}

/** İade eşitlemesinde (aynı işlem). Tam iade → iptal kuyruğu; kısmi → iade faturası gerekli. */
export async function onRefund(tx: Tx, refundOf: string) {
  const [doc] = await tx.select().from(D).where(eq(D.saleId, refundOf));
  if (!doc || doc.status === "cancelled") return;
  const [orig] = await tx.select({ total: schema.sales.total }).from(schema.sales).where(eq(schema.sales.id, refundOf));
  const [ref] = await tx.select({ sum: sql<number>`coalesce(sum(${schema.sales.total}), 0)::int` }).from(schema.sales).where(and(eq(schema.sales.refundOf, refundOf), eq(schema.sales.status, "iade")));
  const full = !!orig && ref.sum >= orig.total;
  if (doc.status === "issued") {
    await tx.update(D).set(full ? { cancelPending: true } : { status: "cancel_rejected", lastError: "kısmi iade" }).where(eq(D.id, doc.id));
  } else if (full && (doc.status === "pending" || doc.status === "error")) {
    await tx.update(D).set({ status: "cancelled", lastError: "kesilmeden iade edildi" }).where(eq(D.id, doc.id));
  }
}

export async function cancelOne(tenantId: string, docId: string): Promise<IssueOutcome | null> {
  return withTenant(tenantId, async (tx) => {
    const [doc] = await tx.select().from(D).where(and(eq(D.id, docId), eq(D.status, "issued"), eq(D.cancelPending, true))).for("update", { skipLocked: true });
    if (!doc) return null;
    const s = await fiscalSettingsOf(tx);
    let r;
    try { r = await getProvider(s?.provider ?? "fake-earsiv", { fakeFail: false }).cancel({ ettn: doc.ettn!, issuedAt: doc.issuedAt! }); }
    catch { return outcome(doc); } // geçici hata: kuyrukta kalır
    const [d] = await tx.update(D).set(r.ok ? { status: "cancelled", cancelPending: false, lastError: null } : { status: "cancel_rejected", cancelPending: false, lastError: r.error }).where(eq(D.id, doc.id)).returning();
    return outcome(d);
  });
}

/** Vadesi gelmiş kesimler, bekleyen iptaller, gönderilmemiş e-postalar. */
export async function processDue(tenantId: string, limit = 5, now = new Date()) {
  const { due, cancels, mails } = await withTenant(tenantId, async (tx) => {
    const open = await tx.select({ saleId: D.saleId, attempts: D.attempts, lastTryAt: D.lastTryAt, createdAt: D.createdAt }).from(D)
      .where(and(inArray(D.status, ["pending", "error"]), lt(D.attempts, MAX_ATTEMPTS))).orderBy(D.createdAt).limit(200);
    const due = open.filter((d) => { const t = nextRetryDue(d.attempts, d.lastTryAt ?? d.createdAt); return t !== null && t <= now; }).slice(0, limit);
    const cancels = await tx.select({ id: D.id }).from(D).where(and(eq(D.status, "issued"), eq(D.cancelPending, true))).limit(limit);
    const mails = mailConfigured()
      ? await tx.select({ saleId: D.saleId }).from(D).where(and(eq(D.status, "issued"), isNull(D.emailSentAt), isNotNull(sql`${D.buyer}->>'email'`))).limit(limit)
      : [];
    return { due, cancels, mails };
  });
  for (const d of due) await issueOne(tenantId, d.saleId);
  for (const c of cancels) await cancelOne(tenantId, c.id);
  for (const m of mails) await sendMail(tenantId, m.saleId).catch(() => {});
}

export async function pendingTenants(): Promise<string[]> {
  const rows = (await getDb().execute(sql`select id from fiscal_pending_tenants() as id`)) as unknown as { id: string }[];
  return rows.map((r) => r.id);
}

const mailConfigured = () => !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM && process.env.APP_URL);
export const fiscalUrl = (token: string) => `${(process.env.APP_URL ?? "").replace(/\/$/, "")}/f/${token}`;

/** Resend (bağımlılıksız). Anahtar yoksa sessizce atlar; belge durumu etkilenmez. */
export async function sendMail(tenantId: string, saleId: string): Promise<boolean> {
  if (!mailConfigured()) return false;
  const doc = await withTenant(tenantId, async (tx) => {
    const [d] = await tx.select().from(D).where(and(eq(D.saleId, saleId), eq(D.status, "issued")));
    const [t] = await tx.select({ name: schema.tenants.name }).from(schema.tenants).where(eq(schema.tenants.id, tenantId));
    return d && t ? { ...d, tenantName: t.name } : null;
  });
  if (!doc?.buyer.email) return false;
  const url = fiscalUrl(doc.token);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: process.env.MAIL_FROM, to: [doc.buyer.email], subject: `e-Arşiv faturanız — ${doc.tenantName}`,
      text: `Merhaba ${doc.buyer.name},\n\n${doc.tenantName} e-Arşiv faturanız (${doc.number}) hazır:\n${url}\n`,
      html: `<p>Merhaba ${esc(doc.buyer.name)},</p><p>${esc(doc.tenantName)} e-Arşiv faturanız (${esc(doc.number ?? "")}) hazır:</p><p><a href="${url}">${url}</a></p>`,
    }),
  });
  if (!res.ok) return false;
  await withTenant(tenantId, (tx) => tx.update(D).set({ emailSentAt: new Date() }).where(eq(D.id, doc.id)));
  return true;
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
