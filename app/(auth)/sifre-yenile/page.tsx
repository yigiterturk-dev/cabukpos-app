import type { Metadata } from "next";
import Link from "next/link";
import { ResetForm } from "../AuthForms";

export const metadata: Metadata = { robots: { index: false } };

export default async function SifreYenile({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  return (
    <>
      <h1 id="main-content" tabIndex={-1} className="mb-6 rounded-sm text-3xl font-semibold tracking-tight outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">Yeni şifre</h1>
      {t ? <ResetForm token={t} /> : <p className="text-sm">Bağlantı eksik. <Link href="/sifremi-unuttum" className="text-brand underline">Yeni bağlantı isteyin</Link>.</p>}
    </>
  );
}
