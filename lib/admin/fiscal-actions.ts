"use server";
// M8 mali ayarlar ve belge eylemleri (sahip/müdür). tenants RLS dışı → tenantId koşulu.
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema, withTenant } from "@/db";
import { requireWriter } from "@/lib/auth/session";
import { canManageStores } from "@/lib/core/access";
import { audit } from "@/lib/audit";
import { FISCAL_CHANNELS, validateTaxId, type ChannelModes } from "@/lib/core/fiscal";
import { OKC_PROVIDERS } from "@/lib/core/okc";
import { okcPing, okcZReport } from "@/lib/fiscal/okc";
import { encryptCardToken } from "@/lib/billing/card-vault";
import { issueOne, processEnvelopes, sendMail } from "@/lib/fiscal/issue";
import { validateBuyerInvoice } from "@/lib/core/refundNote";
import { fakeProvidersBlocked } from "@/lib/fake-providers";

export type FiscalState = { error?: string; field?: string; savedAt?: number; info?: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function saveFiscalSettings(_: FiscalState, form: FormData): Promise<FiscalState> {
  const a = await requireWriter();
  if (!canManageStores(a)) return { error: "Mali ayarlar ve belgeler yalnız sahip ve zincir merkezinde." };
  const taxId = str(form, "taxId"), taxOffice = str(form, "taxOffice"), address = str(form, "address");
  const series = str(form, "series").toUpperCase();
  const modes = Object.fromEntries(FISCAL_CHANNELS.map((c) => [c, str(form, `mode-${c}`) === "earsiv" ? "earsiv" : "info"])) as ChannelModes;
  if (a.vertical === "market") { modes.masa = "info"; modes.paket = "info"; modes.platform = "info"; }
  const earsiv = Object.values(modes).includes("earsiv");
  if (earsiv && fakeProvidersBlocked()) return { error: "Production'da e-Arşiv için gerçek entegratör bağlantısı gerekir; bağlantı hazır olana kadar Bilgi fişi kullanın." };
  if (taxId && !validateTaxId(taxId)) return { error: "Vergi no geçersiz (10 hane VKN ya da 11 hane TCKN).", field: "taxId" };
  if (earsiv && !taxId) return { error: "e-Arşiv için işletme vergi no gerekli.", field: "taxId" };
  if (earsiv && !taxOffice) return { error: "e-Arşiv için vergi dairesi gerekli.", field: "taxOffice" };
  if (earsiv && !address) return { error: "e-Arşiv için işletme adresi gerekli.", field: "address" };
  if (taxOffice.length > 80) return { error: "Vergi dairesi en çok 80 karakter.", field: "taxOffice" };
  if (address.length > 500) return { error: "Adres en çok 500 karakter.", field: "address" };
  if (!/^[A-Z0-9]{3}$/.test(series)) return { error: "Seri 3 büyük harf/rakam olmalı (ör. CBP).", field: "series" };
  const fakeFail = form.get("fakeFail") === "on";
  // #18: ÖKC — kapalıysa kolonlar null'a döner; açıkken sağlayıcı listeden ve seri no biçimden doğrulanır.
  const okcOn = form.get("okcOn") === "on";
  const okcProvider = str(form, "okcProvider");
  const okcSerial = str(form, "okcSerial").toUpperCase();
  if (okcOn && !OKC_PROVIDERS.some((p) => p.value === okcProvider)) return { error: "ÖKC sağlayıcı seçin.", field: "okcProvider" };
  if (okcOn && !/^[A-Z0-9-]{3,20}$/.test(okcSerial)) return { error: "Cihaz seri no 3-20 karakter, harf/rakam/tire olmalı.", field: "okcSerial" };
  // Yol A BYOK: bulut çözücü (parasut/uyumsoft) API adresi zorunlu; anahtar doluysa şifreli yazılır, boşsa korınır.
  const okcCloud = OKC_PROVIDERS.find((p) => p.value === okcProvider)?.cloud ?? false;
  const okcApiUrl = str(form, "okcApiUrl");
  const okcApiKey = str(form, "okcApiKey");
  if (okcOn && okcCloud && okcApiUrl.length > 2048) return { error: "Çözücü API adresi en çok 2.048 karakter olabilir.", field: "okcApiUrl" };
  if (okcOn && okcCloud && !okcApiUrl) return { error: "Bulut ÖKC için API adresi gerekli (ör. https://sandbox...).", field: "okcApiUrl" };
  if (okcOn && okcCloud && okcApiKey && okcApiKey.length < 8) return { error: "API anahtarı çok kısa görünüyor.", field: "okcApiKey" };
  const encKey = okcOn && okcCloud && okcApiKey ? encryptCardToken(okcApiKey) : undefined;
  if (encKey === null) return { error: "Sunucu anahtarı (AUTH_SECRET) yapılandırılmamış; API anahtarı saklanamaz.", field: "okcApiKey" };
  const okc = okcOn ? { okcProvider, okcSerial, okcFakeFail: form.get("okcFakeFail") === "on" } : { okcProvider: null, okcSerial: null, okcFakeFail: false };
  await getDb().update(schema.tenants).set({ taxId: taxId || null, taxOffice: taxOffice || null, address: address || null }).where(eq(schema.tenants.id, a.tenantId));
  await withTenant(a.tenantId, async (tx) => {
    const v = {
      series, channelModes: modes, fakeFail, ...okc, updatedAt: new Date(),
      ...(okcOn && okcCloud ? { okcApiUrl } : {}),
      ...(encKey ? { okcApiKey: encKey } : {}),
      ...(!okcOn ? { okcApiKey: null, okcApiUrl: null } : {}),
    };
    await tx.insert(schema.fiscalSettings).values({ tenantId: a.tenantId, ...v }).onConflictDoUpdate({ target: schema.fiscalSettings.tenantId, set: v });
    await audit(tx, a.tenantId, `user:${a.id}`, "fiscal.settings", { taxId, series, modes, fakeFail, okc, okcKeySet: Boolean(encKey) });
  });
  if (okcOn) await okcPing(a.tenantId).catch(() => {});
  revalidatePath("/yonetim/mali");
  return { savedAt: Date.now() };
}

async function docById(tenantId: string, id: string) {
  if (!UUID.test(id)) return null;
  const [d] = await withTenant(tenantId, (tx) => tx.select().from(schema.fiscalDocuments).where(eq(schema.fiscalDocuments.id, id)));
  return d ?? null;
}

export async function retryFiscal(id: string): Promise<FiscalState> {
  const a = await requireWriter();
  if (!canManageStores(a)) return { error: "Mali ayarlar ve belgeler yalnız sahip ve zincir merkezinde." };
  const d = await docById(a.tenantId, id);
  if (!d) return { error: "Belge bulunamadı." };
  const r = await issueOne(a.tenantId, d.saleId, { force: true });
  await withTenant(a.tenantId, (tx) => audit(tx, a.tenantId, `user:${a.id}`, "fiscal.retry", { id, status: r?.status }));
  revalidatePath("/yonetim/mali");
  if (r?.status === "issued") return { info: `Kesildi: ${r.number}` };
  const [now] = await withTenant(a.tenantId, (tx) => tx.select({ e: schema.fiscalDocuments.lastError }).from(schema.fiscalDocuments).where(eq(schema.fiscalDocuments.id, id)));
  return { error: now?.e ?? "Kesilemedi." };
}

export async function resendFiscalMail(id: string): Promise<FiscalState> {
  const a = await requireWriter();
  if (!canManageStores(a)) return { error: "Mali ayarlar ve belgeler yalnız sahip ve zincir merkezinde." };
  const d = await docById(a.tenantId, id);
  if (!d) return { error: "Belge bulunamadı." };
  if (d.status !== "issued") return { error: "Yalnız kesilmiş belge gönderilir." };
  if (!d.buyer.email) return { error: "Alıcının e-postası yok." };
  const ok = await sendMail(a.tenantId, d.saleId).catch(() => false);
  revalidatePath("/yonetim/mali");
  return ok ? { info: "E-posta gönderildi." } : { error: "E-posta gönderilemedi (RESEND_API_KEY/MAIL_FROM tanımlı mı?)." };
}

/** VKN'li alıcının düzenlediği iade faturasını kaydeder → kayıt kapanır. */
export async function resolveBuyerInvoice(_: FiscalState, form: FormData): Promise<FiscalState> {
  const a = await requireWriter();
  if (!canManageStores(a)) return { error: "Mali ayarlar ve belgeler yalnız sahip ve zincir merkezinde." };
  const id = str(form, "id"), no = str(form, "no"), date = str(form, "date");
  if (!UUID.test(id)) return { error: "Kayıt bulunamadı." };
  return withTenant(a.tenantId, async (tx) => {
    const R = schema.fiscalRefunds;
    const [r] = await tx.select({ id: R.id, soldAt: schema.sales.createdAt }).from(R)
      .innerJoin(schema.fiscalDocuments, eq(schema.fiscalDocuments.id, R.fiscalDocId)).innerJoin(schema.sales, eq(schema.sales.id, schema.fiscalDocuments.saleId))
      .where(and(eq(R.id, id), eq(R.kind, "alici_faturasi"), isNull(R.resolvedAt)));
    if (!r) return { error: "Kayıt bulunamadı ya da zaten kapandı." };
    const err = validateBuyerInvoice(no, date, r.soldAt);
    if (err) return { error: err, field: err.startsWith("Fatura") ? "no" : "date" };
    await tx.update(R).set({ buyerInvoiceNo: no.trim(), buyerInvoiceDate: date, resolvedAt: new Date() }).where(eq(R.id, id));
    await audit(tx, a.tenantId, `user:${a.id}`, "fiscal.buyer_invoice", { id, no, date });
    revalidatePath("/yonetim/raporlar");
    revalidatePath("/yonetim/mali");
    return { savedAt: Date.now() };
  });
}

/** #19: zarf gönderimi + GİB durum sorgusunu elle tetikle (cron zaten periyodik çalışır). */
export async function queryEnvelopes(): Promise<void> {
  const a = await requireWriter();
  if (!canManageStores(a)) return;
  await processEnvelopes(a.tenantId, 20);
  await withTenant(a.tenantId, (tx) => audit(tx, a.tenantId, `user:${a.id}`, "fiscal.envelope.query", {}));
  revalidatePath("/yonetim/mali");
}

/** #18: gün sonu Z raporu — çözücüde mali gün kapanışı; sonuç audit'e yazılır. */
export async function takeZReport(): Promise<FiscalState> {
  const a = await requireWriter();
  if (!canManageStores(a)) return { error: "Mali ayarlar ve belgeler yalnız sahip ve zincir merkezinde." };
  const r = await okcZReport(a.tenantId).catch((e) => ({ ok: false as const, error: e instanceof Error ? e.message : "ÖKC hatası" }));
  await withTenant(a.tenantId, (tx) => audit(tx, a.tenantId, `user:${a.id}`, "fiscal.okc.z", r.ok ? { no: r.no, zNo: r.zNo } : { error: r.error }));
  revalidatePath("/yonetim/mali");
  return r.ok ? { info: `Z raporu alındı: Z No ${r.zNo} (${r.no})` } : { error: r.error };
}
