// /f belge araması: layout (404 statüsü shell flush'ından önce set edilsin) ile sayfa arasında tek sorgu (React cache).
import { cache } from "react";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export type Doc = {
  status: "pending" | "issued" | "error" | "cancelled" | "cancel_rejected"; number: string | null; ettn: string | null; provider: string | null;
  buyer: { taxId: string; name: string; email?: string; address?: string }; issuedAt: string | null; createdAt: string;
  sale: { receiptNo: string; total: number; discount: number; vat: { rate: number; gross: number; net: number; vat: number }[]; createdAt: string };
  lines: { name: string; qtyMilli: number; unitPrice: number; vatRate: number; total: number }[];
  seller: { name: string; taxId: string | null; taxOffice: string | null; address: string | null };
  store: { name: string; address: string | null };
};

export const docByToken = cache(async (token: string): Promise<Doc | null> => {
  if (!/^[A-Za-z0-9_-]{24}$/.test(token)) return null;
  const [row] = (await getDb().execute(sql`select fiscal_doc_by_token(${token}) as d`)) as unknown as { d: Doc | null }[];
  return row?.d ?? null;
});
