"use server";
// M8 mali ayarlar ve belge eylemleri (sahip/müdür). tenants RLS dışı → tenantId koşulu.
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { FISCAL_CHANNELS, validateTaxId, type ChannelModes } from "@/lib/core/fiscal";
import { issueOne, sendMail } from "@/lib/fiscal/issue";

export type FiscalState = { error?: string; field?: string; savedAt?: number; info?: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function saveFiscalSettings(_: FiscalState, form: FormData): Promise<FiscalState> {
  const a = await requireAdmin();
  const taxId = str(form, "taxId"), taxOffice = str(form, "taxOffice"), address = str(form, "address");
  const series = str(form, "series").toUpperCase();
  const modes = Object.fromEntries(FISCAL_CHANNELS.map((c) => [c, str(form, `mode-${c}`) === "earsiv" ? "earsiv" : "info"])) as ChannelModes;
  if (a.vertical === "market") { modes.masa = "info"; modes.paket = "info"; modes.platform = "info"; }
  const earsiv = Object.values(modes).includes("earsiv");
  if (taxId && !validateTaxId(taxId)) return { error: "Vergi no geçersiz (10 hane VKN ya da 11 hane TCKN).", field: "taxId" };
  if (earsiv && !taxId) return { error: "e-Arşiv için işletme vergi no gerekli.", field: "taxId" };
  if (earsiv && !taxOffice) return { error: "e-Arşiv için vergi dairesi gerekli.", field: "taxOffice" };
  if (earsiv && !address) return { error: "e-Arşiv için işletme adresi gerekli.", field: "address" };
  if (taxOffice.length > 80) return { error: "Vergi dairesi en çok 80 karakter.", field: "taxOffice" };
  if (address.length > 500) return { error: "Adres en çok 500 karakter.", field: "address" };
  if (!/^[A-Z0-9]{3}$/.test(series)) return { error: "Seri 3 büyük harf/rakam olmalı (ör. CBP).", field: "series" };
  const fakeFail = form.get("fakeFail") === "on";
  await getDb().update(schema.tenants).set({ taxId: taxId || null, taxOffice: taxOffice || null, address: address || null }).where(eq(schema.tenants.id, a.tenantId));
  await withTenant(a.tenantId, async (tx) => {
    const v = { series, channelModes: modes, fakeFail, updatedAt: new Date() };
    await tx.insert(schema.fiscalSettings).values({ tenantId: a.tenantId, ...v }).onConflictDoUpdate({ target: schema.fiscalSettings.tenantId, set: v });
    await audit(tx, a.tenantId, `user:${a.id}`, "fiscal.settings", { taxId, series, modes, fakeFail });
  });
  revalidatePath("/yonetim/mali");
  return { savedAt: Date.now() };
}

async function docById(tenantId: string, id: string) {
  if (!UUID.test(id)) return null;
  const [d] = await withTenant(tenantId, (tx) => tx.select().from(schema.fiscalDocuments).where(eq(schema.fiscalDocuments.id, id)));
  return d ?? null;
}

export async function retryFiscal(id: string): Promise<FiscalState> {
  const a = await requireAdmin();
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
  const a = await requireAdmin();
  const d = await docById(a.tenantId, id);
  if (!d) return { error: "Belge bulunamadı." };
  if (d.status !== "issued") return { error: "Yalnız kesilmiş belge gönderilir." };
  if (!d.buyer.email) return { error: "Alıcının e-postası yok." };
  const ok = await sendMail(a.tenantId, d.saleId).catch(() => false);
  revalidatePath("/yonetim/mali");
  return ok ? { info: "E-posta gönderildi." } : { error: "E-posta gönderilemedi (RESEND_API_KEY/MAIL_FROM tanımlı mı?)." };
}
