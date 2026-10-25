"use server";
import { revalidatePath } from "next/cache";
import { withTenant } from "@/db";
import { requireWriter } from "@/lib/auth/session";
import { changeShipment, recordTransfer, type TransferError } from "./transfer";

export type TransferState = Partial<TransferError> & { savedAt?: number };
const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

export async function createTransfer(previous: TransferState, form: FormData): Promise<TransferState> {
  const actor = await requireWriter();
  const products = form.getAll("productId").map(String);
  const quantities = form.getAll("qty").map(String);
  if (products.length !== quantities.length) return { error: "Her ürün için miktar girin.", savedAt: previous.savedAt };
  const result = await withTenant(actor.tenantId, (tx) => recordTransfer(tx, actor.tenantId, actor, {
    fromStoreId: text(form, "fromStoreId"), toStoreId: text(form, "toStoreId"), note: text(form, "note") || null,
    lines: products.map((productId, i) => ({ productId, qty: quantities[i] })),
  }));
  if ("error" in result) return { ...result, savedAt: previous.savedAt };
  for (const path of ["/yonetim/transferler", "/yonetim/stok", "/yonetim/hq", "/yonetim/depo", "/yonetim"]) revalidatePath(path);
  return { savedAt: Date.now() };
}

export async function shipmentAction(_: TransferState, form: FormData): Promise<TransferState> {
  const actor = await requireWriter();
  const id = text(form, "id");
  const result = await withTenant(actor.tenantId, tx => changeShipment(tx, actor.tenantId, actor, id, text(form, "status")));
  if ("error" in result) return result;
  for (const path of ["/yonetim/transferler", `/yonetim/transferler/${id}`, "/yonetim/stok", "/yonetim/depo", "/yonetim/hq"]) revalidatePath(path);
  return { savedAt: Date.now() };
}
